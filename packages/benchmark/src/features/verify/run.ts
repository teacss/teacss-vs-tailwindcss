import type { SubjectId } from "@bench/infrastructure";
import type { SubjectTask } from "../../contract/index.ts";
import { type Corpus, candidates, corpusProject } from "../../corpus/index.ts";
import { checkNativeModules, checkStructure, type Mismatch } from "./index.ts";

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
  readonly check: "native" | "strong" | "structure";
  readonly detail: string;
}

export interface VerifyReport {
  readonly findings: readonly VerifyFinding[];
  readonly checked: readonly { subject: string; tier: "engine" | "build"; cases: number; cssBytes: number; longhandMatches: number }[];
}

const STRONG_PAIR: readonly [SubjectId, SubjectId] = ["teacss-ts" as SubjectId, "teacss-rs" as SubjectId];

function summarize(mismatches: readonly Mismatch[]): string {
  const shown = mismatches.slice(0, 5).map((mismatch) => `${mismatch.candidate}: ${mismatch.reason}`);
  return `${mismatches.length} case(s) failed: ${shown.join("; ")}${mismatches.length > 5 ? "; …" : ""}`;
}

/** Runs spec v01.1 §Equivalence over every subject on one corpus. */
export async function verifyCorpus(corpus: Corpus, subjects: readonly VerifySubject[], invoke: Invoke): Promise<VerifyReport> {
  const findings: VerifyFinding[] = [];
  const checked: { subject: string; tier: "engine" | "build"; cases: number; cssBytes: number; longhandMatches: number }[] = [];
  const hashes = new Map<string, string>();
  for (const subject of subjects) {
    const tiers = subject.tiers.filter((tier): tier is "engine" | "build" => tier !== "dev");
    for (const tier of tiers) {
      const project = corpusProject(corpus, subject.syntax);
      const task: SubjectTask = tier === "engine" ? { kind: "engine", scenario: "cold", candidates: candidates(corpus, subject.syntax), extra: [], includeCss: true } : { kind: "build", modules: project.modules, files: Object.fromEntries(project.files), includeCss: true };
      const output = await invoke(subject.id, task);
      hashes.set(`${subject.id}/${tier}`, output.cssSha256);
      for (const problem of checkNativeModules(output.nativeModules, subject.natives)) findings.push({ subject: subject.id, tier, check: "native", detail: problem });
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
    }
  }
  for (const tier of ["engine", "build"] as const) {
    const left = hashes.get(`${STRONG_PAIR[0]}/${tier}`);
    const right = hashes.get(`${STRONG_PAIR[1]}/${tier}`);
    if (left !== undefined && right !== undefined && left !== right) findings.push({ subject: STRONG_PAIR.join(" vs "), tier, check: "strong", detail: `sha256 ${left.slice(0, 12)} vs ${right.slice(0, 12)}` });
  }
  return { findings, checked };
}
