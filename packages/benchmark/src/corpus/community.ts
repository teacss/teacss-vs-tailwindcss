import { createHash } from "node:crypto";
import { type Corpus, PAIR_TABLE_VERSION, type PairedCase, pairSpace } from "./index.ts";

export interface CommunityRepository {
  readonly name: string;
  /** The checked-out directory the classes were scanned from. */
  readonly dir: string;
  /** The checkout's commit, so a reader can scan the same tree. */
  readonly commit: string | undefined;
}

export interface CommunityPool {
  readonly repositories: readonly CommunityRepository[];
  /** Distinct Tailwind utilities found, as Tailwind's default theme recognises them. */
  readonly found: number;
  /** Translatable utilities, most frequent first. */
  readonly kept: readonly PairedCase[];
  /** The most frequent untranslatable prefixes with their occurrence counts. */
  readonly untranslated: readonly (readonly [string, number])[];
}

/** The utility's name without variants, up to its first dash or bracket: `hover:bg-red-500` gives `bg`. */
export function utilityPrefix(candidate: string): string {
  const base = candidate.slice(candidate.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
  return /^-?[a-z0-9]+(?=[-[]|$)/.exec(base)?.[0] ?? base;
}

/** Keeps the candidates the pair table can translate, most frequent first, and tallies the rest by prefix. */
export function buildCommunityPool(repositories: readonly CommunityRepository[], found: readonly (readonly [string, number])[]): CommunityPool {
  const byTailwind = new Map(pairSpace().cases.map(({ teacss, tailwind, properties, conditions }) => [tailwind, { teacss, tailwind, properties, conditions }]));
  const ordered = [...found].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const kept: PairedCase[] = [];
  const untranslated = new Map<string, number>();
  for (const [candidate, count] of ordered) {
    const pair = byTailwind.get(candidate);
    if (pair !== undefined) kept.push(pair);
    else untranslated.set(utilityPrefix(candidate), (untranslated.get(utilityPrefix(candidate)) ?? 0) + count);
  }
  return {
    repositories,
    found: ordered.length,
    kept,
    untranslated: [...untranslated.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 10),
  };
}

/** The `utilities` most frequent translatable classes, or all of them when there are fewer. */
export function communityCorpus(pool: CommunityPool, utilities: number, files: number, seed: number): Corpus {
  const cases = pool.kept.slice(0, utilities);
  if (cases.length === 0) throw new Error("the community repositories hold no class the pair table can translate");
  const hash = createHash("sha256")
    .update(JSON.stringify({ pairTableVersion: PAIR_TABLE_VERSION, source: "community", cases }))
    .digest("hex");
  return { parameters: { seed, utilities: cases.length, files: Math.min(files, cases.length) }, pairTableVersion: PAIR_TABLE_VERSION, hash, cases };
}
