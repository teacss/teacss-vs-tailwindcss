import type { SubjectId } from "@bench/infrastructure";
import type { SubjectTask } from "../../contract/index.ts";
import { type Corpus, candidates, corpusProject, leadingStylesheetProject } from "../../corpus/index.ts";
import { checkLeadingStylesheet, checkNativeModules, checkSameRules, checkStructure, type Mismatch, withFontDigests } from "./index.ts";

export interface VerifySubject {
  readonly id: SubjectId;
  readonly syntax: "teacss" | "tailwind";
  readonly tiers: readonly ("engine" | "dev" | "build")[];
  readonly natives: { readonly required: readonly string[]; readonly forbidden: readonly string[] };
}

export interface VerifyOutput {
  readonly css: string | undefined;
  readonly cssSha256: string;
  readonly nativeModules: readonly string[];
}

export type Invoke = (subject: SubjectId, task: SubjectTask) => Promise<VerifyOutput>;

export interface VerifyFinding {
  readonly subject: string;
  readonly tier: "engine" | "build";
  readonly check: "native" | "strong" | "structure" | "leading";
  readonly detail: string;
}

export interface VerifyReport {
  readonly findings: readonly VerifyFinding[];
  readonly checked: readonly { subject: string; tier: "engine" | "build"; cases: number; cssBytes: number; longhandMatches: number }[];
}

/** Every `teacss-ts…` subject is paired with its `teacss-rs…` twin in the same group, where one exists (spec v03.1 §Equivalence). */
function strongPairs(subjects: readonly VerifySubject[]): [string, string][] {
  const ids = new Set<string>(subjects.map((subject) => subject.id));
  return [...ids]
    .filter((id) => id.startsWith("teacss-ts"))
    .map((id): [string, string] => [id, id.replace(/^teacss-ts/, "teacss-rs")])
    .filter(([, twin]) => ids.has(twin));
}

function summarize(mismatches: readonly Mismatch[]): string {
  const shown = mismatches.slice(0, 5).map((mismatch) => `${mismatch.candidate}: ${mismatch.reason}`);
  return `${mismatches.length} case(s) failed: ${shown.join("; ")}${mismatches.length > 5 ? "; …" : ""}`;
}

/**
 * Spec v01.1 revision 9, §Equivalence: engines and the two CLIs write the same bytes, fonts aside. The bundler
 * plugins do not, because teacss-ts passes the sheet through Lightning CSS and teacss-rs splices it in afterwards,
 * so a plugin pair must select the same classes with the same properties.
 */
function strongFinding(left: VerifyOutput, right: VerifyOutput, pair: readonly [string, string], tier: "engine" | "build"): string | undefined {
  if (tier === "engine" || pair[0].endsWith("-cli")) {
    const same = tier === "engine" ? left.cssSha256 === right.cssSha256 : withFontDigests(left.css ?? "").trimEnd() === withFontDigests(right.css ?? "").trimEnd();
    return same ? undefined : `sha256 ${left.cssSha256.slice(0, 12)} vs ${right.cssSha256.slice(0, 12)}`;
  }
  const mismatches = checkSameRules(left.css ?? "", right.css ?? "");
  return mismatches.length === 0 ? undefined : summarize(mismatches);
}

/** Runs spec v01.1 §Equivalence over every subject on one corpus. */
export async function verifyCorpus(corpus: Corpus, subjects: readonly VerifySubject[], invoke: Invoke): Promise<VerifyReport> {
  const findings: VerifyFinding[] = [];
  const checked: { subject: string; tier: "engine" | "build"; cases: number; cssBytes: number; longhandMatches: number }[] = [];
  const outputs = new Map<string, VerifyOutput>();
  for (const subject of subjects) {
    const tiers = subject.tiers.filter((tier): tier is "engine" | "build" => tier !== "dev");
    for (const tier of tiers) {
      const project = corpusProject(corpus, subject.syntax);
      const task: SubjectTask = tier === "engine" ? { kind: "engine", scenario: "cold", candidates: candidates(corpus, subject.syntax), extra: [], includeCss: true } : { kind: "build", modules: project.modules, files: Object.fromEntries(project.files), includeCss: true };
      const output = await invoke(subject.id, task);
      outputs.set(`${subject.id}/${tier}`, output);
      for (const problem of checkNativeModules(output.nativeModules, subject.natives, tier)) findings.push({ subject: subject.id, tier, check: "native", detail: problem });
      if (output.css === undefined) {
        findings.push({ subject: subject.id, tier, check: "structure", detail: "the response carried no css" });
        continue;
      }
      if (subject.id.endsWith("-baseline")) {
        checked.push({ subject: subject.id, tier, cases: corpus.cases.length, cssBytes: Buffer.byteLength(output.css), longhandMatches: 0 });
        continue;
      }
      const structure = checkStructure(corpus.cases, subject.syntax, output.css);
      checked.push({ subject: subject.id, tier, cases: corpus.cases.length, cssBytes: Buffer.byteLength(output.css), longhandMatches: structure.longhandMatches });
      if (structure.mismatches.length > 0) findings.push({ subject: subject.id, tier, check: "structure", detail: summarize(structure.mismatches) });
      // A CLI writes one stylesheet, so nothing can sit ahead of it.
      if (tier === "build" && !subject.id.endsWith("-cli")) {
        const leading = leadingStylesheetProject(corpus, subject.syntax);
        const { css } = await invoke(subject.id, { kind: "build", modules: leading.modules, files: Object.fromEntries(leading.files), includeCss: true });
        const lost = checkLeadingStylesheet(corpus.cases, subject.syntax, css ?? "");
        if (lost.length > 0) findings.push({ subject: subject.id, tier, check: "leading", detail: summarize(lost) });
      }
    }
  }
  for (const pair of strongPairs(subjects)) {
    for (const tier of ["engine", "build"] as const) {
      const left = outputs.get(`${pair[0]}/${tier}`);
      const right = outputs.get(`${pair[1]}/${tier}`);
      const detail = left === undefined || right === undefined ? undefined : strongFinding(left, right, pair, tier);
      if (detail !== undefined) findings.push({ subject: pair.join(" vs "), tier, check: "strong", detail });
    }
  }
  return { findings, checked };
}
