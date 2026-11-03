import { createHash } from "node:crypto";
import { PAIR_TABLE_VERSION, type PairedCase, pairSpace } from "./pairs.ts";
import { mulberry32, shuffled } from "./prng.ts";

export { CONDITIONS, PAIR_TABLE_VERSION, type PairedCase, pairSpace } from "./pairs.ts";

export const DEFAULT_SEED = 20261021;
const CLASSES_PER_ELEMENT = 15;

export interface CorpusParameters {
  readonly seed: number;
  readonly utilities: number;
  readonly files: number;
}

export interface Corpus {
  readonly parameters: CorpusParameters;
  readonly pairTableVersion: number;
  /** SHA-256 over the case list; every sample carries it. */
  readonly hash: string;
  readonly cases: readonly PairedCase[];
}

export type Syntax = "teacss" | "tailwind";

export function generateCorpus(parameters: CorpusParameters): Corpus {
  const space = pairSpace().cases;
  if (parameters.utilities > space.length) throw new Error(`the pair table expresses ${space.length} cases, ${parameters.utilities} were asked for`);
  if (parameters.files < 1 || parameters.files > parameters.utilities) throw new Error(`files must be between 1 and ${parameters.utilities}`);
  const random = mulberry32(parameters.seed);
  const cases = shuffled(space, random)
    .slice(0, parameters.utilities)
    .map(({ teacss, tailwind, properties, conditions }) => ({ teacss, tailwind, properties, conditions }));
  const hash = createHash("sha256")
    .update(JSON.stringify({ pairTableVersion: PAIR_TABLE_VERSION, cases }))
    .digest("hex");
  return { parameters, pairTableVersion: PAIR_TABLE_VERSION, hash, cases };
}

export function candidates(corpus: Corpus, syntax: Syntax): string[] {
  return corpus.cases.map((entry) => entry[syntax]);
}

export interface CorpusProject {
  /** Relative module paths, in import order. */
  readonly modules: readonly string[];
  readonly files: ReadonlyMap<string, string>;
}

function escapeTemplate(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("$", "\\$");
}

/** The project every build-tier subject compiles: one module per file, complete class strings in markup. */
export function corpusProject(corpus: Corpus, syntax: Syntax, header = ""): CorpusProject {
  const classes = candidates(corpus, syntax);
  const perFile = Math.ceil(classes.length / corpus.parameters.files);
  const files = new Map<string, string>();
  const modules: string[] = [];
  for (let index = 0; index < corpus.parameters.files; index++) {
    const slice = classes.slice(index * perFile, (index + 1) * perFile);
    const elements: string[] = [];
    for (let start = 0; start < slice.length; start += CLASSES_PER_ELEMENT) elements.push(`<div class="${escapeTemplate(slice.slice(start, start + CLASSES_PER_ELEMENT).join(" "))}"></div>`);
    const path = `src/gen-${String(index).padStart(3, "0")}.js`;
    modules.push(path);
    files.set(path, `${header}document.getElementById("app").insertAdjacentHTML("beforeend", \`${elements.join("\n")}\`);\n`);
  }
  files.set("index.html", '<!doctype html>\n<html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n');
  return { modules, files };
}

export const LEADING_CLASS = "bench-leading";

/**
 * The same project with another stylesheet ahead of the tool's own: the first module imports it, so every
 * subject's entry loads it before its stylesheet, whatever that entry is (spec v01.1 revision 9, §Equivalence).
 */
export function leadingStylesheetProject(corpus: Corpus, syntax: Syntax): CorpusProject {
  const { modules, files } = corpusProject(corpus, syntax);
  return { modules: ["src/leading.js", ...modules], files: new Map([...files, ["src/leading.js", 'import "./leading.css";\n'], ["src/leading.css", `.${LEADING_CLASS}{outline-style:dashed}\n`]]) };
}

export interface CorpusProfile {
  readonly families: Readonly<Record<string, number>>;
  readonly conditionCounts: Readonly<Record<string, number>>;
  readonly conditionDepth: Readonly<Record<string, number>>;
}

export function profileCorpus(corpus: Corpus): CorpusProfile {
  const byTeacss = new Map(pairSpace().cases.map((entry) => [entry.teacss, entry.family]));
  const families: Record<string, number> = {};
  const conditionCounts: Record<string, number> = {};
  const conditionDepth: Record<string, number> = {};
  for (const entry of corpus.cases) {
    const family = byTeacss.get(entry.teacss) ?? "unknown";
    families[family] = (families[family] ?? 0) + 1;
    conditionDepth[entry.conditions.length] = (conditionDepth[entry.conditions.length] ?? 0) + 1;
    for (const condition of entry.conditions) conditionCounts[condition] = (conditionCounts[condition] ?? 0) + 1;
  }
  return { families, conditionCounts, conditionDepth };
}

/**
 * `rounds` groups of `k` paired cases from the pair space that are not in the corpus, no case in
 * two groups, chosen by the corpus seed so every process asks for the same groups in the same order.
 */
export function extraCases(corpus: Corpus, k: number, rounds: number): PairedCase[][] {
  const used = new Set(corpus.cases.map((entry) => entry.teacss));
  const spare = shuffled(
    pairSpace().cases.filter((entry) => !used.has(entry.teacss)),
    mulberry32(corpus.parameters.seed ^ 0x5eed),
  );
  if (spare.length < k * rounds) throw new Error(`the pair table has ${spare.length} cases outside the corpus, ${k * rounds} were asked for`);
  return Array.from({ length: rounds }, (_, round) => spare.slice(round * k, (round + 1) * k).map(({ teacss, tailwind, properties, conditions }) => ({ teacss, tailwind, properties, conditions })));
}
