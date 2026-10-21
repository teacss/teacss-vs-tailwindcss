import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CommandResult, type CoverageResult, type NativeArtifact, runCommand, type SubjectId, type SubjectVersions } from "@bench/infrastructure";

export const NATIVE_LOAD_RUNS = 5;

export interface InstallMeasurement {
  readonly packages: Readonly<Record<string, string>>;
  /** Wall time of `bun install` into an empty directory with an empty cache, one entry per run. */
  readonly installMs: readonly number[];
  readonly installedBytes: number;
}

export interface SubjectPrice {
  readonly native: NativeArtifact | undefined;
  /** Time to `require` the `.node` file in a process that has imported no tool code, one entry per process. */
  readonly nativeLoadMs: readonly number[];
  readonly install: InstallMeasurement | undefined;
  /** The subject's own engine judging each entry configuration; empty for a subject without one. */
  readonly coverage: readonly CoverageResult[];
}

export interface PriceRecord {
  readonly subjects: Readonly<Record<string, SubjectPrice>>;
  /** Where the judged entry stylesheets came from, or undefined when none were given. */
  readonly coverageSource: string | undefined;
}

export interface PriceDeps {
  readonly describe: (subject: SubjectId) => Promise<SubjectVersions>;
  readonly loadNative: (subject: SubjectId, path: string) => Promise<number>;
  readonly coverage: (subject: SubjectId, entries: readonly string[]) => Promise<readonly CoverageResult[]>;
  readonly install: (packages: Readonly<Record<string, string>>) => Promise<{ wallMs: number; installedBytes: number }>;
  readonly progress: (message: string) => void;
}

export interface PricePlan {
  readonly subjects: readonly SubjectId[];
  readonly installRuns: number;
  readonly coverage: { readonly source: string; readonly entries: readonly string[] } | undefined;
}

function key(packages: Readonly<Record<string, string>>): string {
  return Object.entries(packages)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `${name}@${version}`)
    .join(" ");
}

/** Spec v02.1 §Report, the price of Rust: what each tool ships, loads and installs, and what its engine can serve. */
export async function measurePrice(plan: PricePlan, deps: PriceDeps): Promise<PriceRecord> {
  const versions = new Map<SubjectId, SubjectVersions>();
  for (const subject of plan.subjects) versions.set(subject, await deps.describe(subject));
  const sets = new Map<string, Readonly<Record<string, string>>>();
  for (const entry of versions.values()) sets.set(key(entry.packages), entry.packages);
  // Rounds interleave the tools, as the measured matrix does, so network drift does not land on one of them.
  const installs = new Map<string, { installMs: number[]; installedBytes: number }>();
  for (let run = 0; run < plan.installRuns; run++) {
    for (const [packageKey, packages] of sets) {
      deps.progress(`installing ${packageKey} from an empty cache (round ${run + 1}/${plan.installRuns})`);
      const measured = await deps.install(packages);
      const entry = installs.get(packageKey) ?? { installMs: [], installedBytes: 0 };
      entry.installMs.push(measured.wallMs);
      entry.installedBytes = measured.installedBytes;
      installs.set(packageKey, entry);
    }
  }
  const subjects: Record<string, SubjectPrice> = {};
  for (const subject of plan.subjects) {
    const own = versions.get(subject);
    if (own === undefined) continue;
    const nativeLoadMs: number[] = [];
    if (own.native !== undefined) for (let run = 0; run < NATIVE_LOAD_RUNS; run++) nativeLoadMs.push(await deps.loadNative(subject, own.native.path));
    const measuredInstall = installs.get(key(own.packages));
    const install = measuredInstall === undefined ? undefined : { packages: own.packages, installMs: measuredInstall.installMs, installedBytes: measuredInstall.installedBytes };
    const coverage = plan.coverage === undefined ? [] : await deps.coverage(subject, plan.coverage.entries);
    subjects[subject] = { native: own.native, nativeLoadMs, install, coverage };
  }
  return { subjects, coverageSource: plan.coverage?.source };
}

function directoryBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += directoryBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

/** `bun install` of exactly these packages into a fresh directory with a fresh, empty cache. */
export async function installFresh(packages: Readonly<Record<string, string>>, env: Readonly<Record<string, string>>): Promise<{ wallMs: number; installedBytes: number }> {
  const root = mkdtempSync(join(tmpdir(), "bench-install-"));
  try {
    const project = join(root, "project");
    const cache = join(root, "cache");
    mkdirSync(project);
    mkdirSync(cache);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "bench-install", private: true, dependencies: packages }));
    const result: CommandResult = await runCommand("bun", ["install", "--no-save", "--linker", "isolated"], { cwd: project, env: { ...env, BUN_INSTALL_CACHE_DIR: cache } });
    if (result.status !== 0) throw new Error(`bun install failed (${result.status}): ${result.stderr.slice(0, 400)}`);
    return { wallMs: result.wallMs, installedBytes: directoryBytes(join(project, "node_modules")) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Entry stylesheets under `dir` that declare `@teacss`, skipping dependencies and build output. */
export function teacssEntries(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".css") && statSync(path).size < 1_000_000 && /@teacss\s*;/.test(readFileSync(path, "utf8"))) found.push(path);
    }
  };
  walk(dir);
  return found.sort();
}
