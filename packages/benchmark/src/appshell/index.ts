import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { version as nodeVersion } from "node:process";
import { type Invocation, parseInvocation, type SubjectId, type SubjectVersions, subjectId } from "@bench/infrastructure";
import { buildCommunityPool, type CommunityPool, type CommunityRepository, communityCorpus } from "../corpus/community.ts";
import { type Corpus, DEFAULT_SEED, generateCorpus, PAIR_TABLE_VERSION, profileCorpus } from "../corpus/index.ts";
import { captureEnvironment, loadShare } from "../features/environment/index.ts";
import { measure, type Tier } from "../features/measure/run.ts";
import { installFresh, measurePrice, type PriceRecord, teacssEntries } from "../features/price/index.ts";
import { profileSubjects } from "../features/profile/run.ts";
import { assertComparable } from "../features/report/cross.ts";
import { buildReport, renderMarkdown, renderSummary } from "../features/report/index.ts";
import { renderReadmeSummary, updateReadme } from "../features/report/readme.ts";
import { verifyCorpus } from "../features/verify/run.ts";
import { type Cell, type RunRecord, readRunRecord, writeRunRecord } from "../persistence/index.ts";
import { invokeSubject, productionRegistry, type SubjectRegistration, type SubjectRegistry } from "../subjects/index.ts";
import { DEFAULT_GROUPS } from "../subjects/registry.ts";

export interface AppDeps {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  /** The shell's subject entry file. */
  readonly subjectEntry: string;
  readonly registry?: SubjectRegistry;
}

const USAGE = `bench <command>

  help        this text
  subjects    list the registered subjects and the versions each one reports
  corpus      generate a paired corpus and print its hash
              --utilities <n> (5000)  --files <n> (30)  --seed <n>  --profile
              --community <list.json>  build it from real Tailwind projects instead
  verify      run the equivalence checks of spec v01.1 on one corpus
              --utilities <n> (5000)  --files <n> (30)  --seed <n>  --subjects <a,b>
  run         measure the scale matrix and write results/<time>-<host>.json
              --utilities <a,b,c> (1000,5000,20000)  --files <a,b,c> (3,30,300)
              --samples <n> (30)  --tier engine|dev|build|all (all)  --subjects <a,b>
              --group main,default-config,postcss (main,default-config)
              --seed <n>  --out <dir> (results)  --allow-busy  --no-profile  --no-price
              --install-runs <n> (3)  --configs <dir>  --community <list.json>
              --allow-node-mismatch
  price       what each tool ships, loads and installs, and what the native engine can serve
              --subjects <a,b>  --install-runs <n> (3)  --configs <dir> (../teacss-ts/examples)
  report      render a results file as Markdown and a JSON summary
              <results.json>  --out <dir> (docs/reports)  --readme <README.md>
              --beside <other.json>  add the same matrix on the other corpus
              --cross <ci.json>  add the same run from a second machine as a cross-check
`;

const SPEC_REVISION = 3;
/** Spec v01.1 §Run protocol: refuse above this share of the logical cores. */
const LOAD_SHARE_LIMIT = 0.2;

const SUBJECT_TIMEOUT_MS = 10 * 60_000;

function gitCommit(dir: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function integerOption(invocation: Invocation, name: string, fallback: number): number {
  const raw = invocation.options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer, found "${String(raw)}"`);
  return value;
}

function integerList(invocation: Invocation, name: string, fallback: readonly number[]): number[] {
  const raw = invocation.options.get(name);
  if (raw === undefined || raw === true) return [...fallback];
  return raw.split(",").map((item) => {
    const value = Number(item);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must list positive integers, found "${item}"`);
    return value;
  });
}

function tiersOf(invocation: Invocation): Tier[] {
  const raw = invocation.options.get("tier") ?? "all";
  if (raw === "all") return ["engine", "dev", "build"];
  if (raw === "engine" || raw === "build" || raw === "dev") return [raw];
  throw new Error(`--tier must be engine, dev, build or all, found "${String(raw)}"`);
}

function chosenSubjects(invocation: Invocation, registry: SubjectRegistry): [SubjectId, SubjectRegistration][] {
  const wanted = invocation.options.get("subjects");
  if (wanted === undefined || wanted === true) {
    const groupOption = invocation.options.get("group");
    const groups = typeof groupOption === "string" ? groupOption.split(",") : DEFAULT_GROUPS;
    const chosen = [...registry].filter(([, registration]) => groups.includes(registration.group));
    if (chosen.length === 0) throw new Error(`--group: no subject in ${groups.join(", ")}; groups are main, default-config, postcss`);
    return chosen;
  }
  const names = wanted.split(",");
  const unknown = names.filter((name) => !registry.has(name as SubjectId));
  if (unknown.length > 0) throw new Error(`--subjects: unknown ${unknown.join(", ")}; registered are ${[...registry.keys()].join(", ")}`);
  return [...registry].filter(([id]) => names.includes(id));
}

function corpusOf(invocation: Invocation) {
  return generateCorpus({ seed: integerOption(invocation, "seed", DEFAULT_SEED), utilities: integerOption(invocation, "utilities", 5_000), files: integerOption(invocation, "files", 30) });
}

/** The orchestrator's composition root: parses the invocation, picks the registry and routes the command. */
export async function createApp(deps: AppDeps): Promise<number> {
  const registry = deps.registry ?? productionRegistry();
  const invocation = parseInvocation(deps.argv);
  const processDeps = { subjectEntry: deps.subjectEntry, cwd: deps.cwd, env: deps.env, timeoutMs: SUBJECT_TIMEOUT_MS };
  const commands: Record<string, (invocation: Invocation) => Promise<number>> = {
    help: async () => {
      deps.stdout(USAGE);
      return 0;
    },
    subjects: async () => {
      if (registry.size === 0) {
        deps.stdout("no subjects registered\n");
        return 0;
      }
      for (const id of registry.keys()) {
        const { response } = await invokeSubject(registry, subjectId(id), { kind: "describe" }, processDeps);
        if (response.result.kind !== "describe") throw new Error(`${id}: expected a describe result`);
        const versions = Object.entries(response.result.versions.packages)
          .map(([name, version]) => `${name}@${version}`)
          .join(" ");
        const local = Object.entries(response.result.versions.local).map(([name, dir]) => `${name} from ${dir}`);
        deps.stdout(`${id}: ${versions} (native: ${response.nativeModules.join(", ") || "none"})${local.length > 0 ? ` LOCAL: ${local.join(", ")}` : ""}\n`);
      }
      return 0;
    },
    corpus: async (invocation) => {
      if (typeof invocation.options.get("community") === "string") {
        const pool = await communityPool(String(invocation.options.get("community")));
        const corpus = communityCorpus(pool, integerOption(invocation, "utilities", 5_000), integerOption(invocation, "files", 30), integerOption(invocation, "seed", DEFAULT_SEED));
        deps.stdout(`community corpus ${corpus.hash}\n${pool.repositories.map((repository) => `  ${repository.name} ${repository.dir} ${repository.commit ?? "(no git commit)"}`).join("\n")}\n`);
        deps.stdout(`Tailwind utilities found: ${pool.found}; translatable: ${pool.kept.length} (${((pool.kept.length / Math.max(1, pool.found)) * 100).toFixed(0)} %); in this corpus: ${corpus.cases.length}\n`);
        deps.stdout(`most frequent untranslatable prefixes: ${pool.untranslated.map(([prefix, count]) => `${prefix} (${count})`).join(", ") || "none"}\n`);
        return 0;
      }
      const corpus = corpusOf(invocation);
      deps.stdout(`corpus ${corpus.hash}\nseed ${corpus.parameters.seed} utilities ${corpus.parameters.utilities} files ${corpus.parameters.files} pair-table ${corpus.pairTableVersion}\n`);
      if (invocation.options.has("profile")) deps.stdout(`${JSON.stringify(profileCorpus(corpus), null, 2)}\n`);
      return 0;
    },
    verify: async (invocation) => {
      const corpus = corpusOf(invocation);
      deps.stdout(`verify corpus ${corpus.hash.slice(0, 12)} (${corpus.parameters.utilities} utilities, ${corpus.parameters.files} files)\n`);
      const subjects = chosenSubjects(invocation, registry).map(([id, registration]) => ({ id, syntax: registration.syntax, tiers: registration.tiers, natives: registration.natives }));
      const report = await verifyCorpus(corpus, subjects, async (subject, task) => {
        const { response } = await invokeSubject(registry, subject, task, processDeps);
        const result = response.result;
        if (result.kind !== "engine" && result.kind !== "build") throw new Error(`${subject}: expected an engine or build result`);
        const cssSha256 = result.kind === "engine" ? (result.samples[0]?.cssSha256 ?? "") : result.cssSha256;
        deps.stdout(`  ${subject} ${task.kind}: ${result.kind === "engine" ? `${result.samples[0]?.cssBytes ?? 0}` : `${result.cssBytes}`} bytes, native ${response.nativeModules.join(", ") || "none"}\n`);
        return { css: result.css, cssSha256, nativeModules: response.nativeModules };
      });
      for (const entry of report.checked) deps.stdout(`  ok ${entry.subject} ${entry.tier}: ${entry.cases} cases in ${entry.cssBytes} bytes\n`);
      for (const finding of report.findings) deps.stdout(`  FAIL ${finding.subject} ${finding.tier} ${finding.check}: ${finding.detail}\n`);
      deps.stdout(report.findings.length === 0 ? "verify: ok\n" : `verify: ${report.findings.length} finding(s)\n`);
      return report.findings.length === 0 ? 0 : 1;
    },
  };
  commands["run"] = async (invocation) => {
    const pinned = existsSync(join(deps.cwd, ".node-version")) ? `v${readFileSync(join(deps.cwd, ".node-version"), "utf8").trim()}` : undefined;
    if (pinned !== undefined && pinned !== nodeVersion && !invocation.options.has("allow-node-mismatch")) {
      deps.stdout(`run: refused, this is Node ${nodeVersion} but .node-version pins ${pinned}; every subject process inherits this binary. Switch Node or pass --allow-node-mismatch to record the run anyway\n`);
      return 3;
    }
    const allowBusy = invocation.options.has("allow-busy");
    const share = loadShare();
    if (share > LOAD_SHARE_LIMIT && !allowBusy) {
      deps.stdout(`run: refused, the one-minute load is ${(share * 100).toFixed(0)}% of the cores (limit ${LOAD_SHARE_LIMIT * 100}%); pass --allow-busy to record a run on a busy machine\n`);
      return 3;
    }
    const chosen = chosenSubjects(invocation, registry);
    const cells = integerList(invocation, "utilities", [1_000, 5_000, 20_000]).flatMap((utilities) => integerList(invocation, "files", [3, 30, 300]).map((files) => ({ utilities, files })));
    const seed = integerOption(invocation, "seed", DEFAULT_SEED);
    const community = typeof invocation.options.get("community") === "string" ? await communityPool(String(invocation.options.get("community"))) : undefined;
    const corpusFor = (cell: Cell): Corpus => (community === undefined ? generateCorpus({ seed, utilities: cell.utilities, files: cell.files }) : communityCorpus(community, cell.utilities, cell.files, seed));
    const plan = { seed, corpusFor, cells, tiers: tiersOf(invocation), subjects: chosen.map(([id, registration]) => ({ id, syntax: registration.syntax, tiers: registration.tiers })), samplesPerCell: integerOption(invocation, "samples", 30) };
    const startedAt = new Date().toISOString();
    const subjects: Record<string, SubjectVersions> = {};
    for (const [id] of chosen) {
      const { response } = await invokeSubject(registry, id, { kind: "describe" }, processDeps);
      if (response.result.kind !== "describe") throw new Error(`${id}: expected a describe result`);
      subjects[id] = response.result.versions;
    }
    const output = await measure(plan, {
      invoke: async (subject, task) => {
        const { response, process } = await invokeSubject(registry, subject, task, processDeps);
        return { result: response.result, nativeModules: response.nativeModules, usage: response.usage, wallMs: process.wallMs };
      },
      loadShare,
      progress: (message) => deps.stdout(`  ${message}\n`),
    });
    const largest = plan.cells.reduce((best, cell) => (cell.utilities * cell.files >= best.utilities * best.files ? cell : best));
    const limiters = invocation.options.has("no-profile")
      ? {}
      : await profileSubjects(
          largest,
          corpusFor,
          plan.subjects,
          plan.tiers.filter((tier): tier is "engine" | "build" => tier !== "dev"),
          async (subject, task, nodeArgs) => {
            deps.stdout(`  profiling ${subject} ${task.kind} on ${largest.utilities}x${largest.files} (not counted)\n`);
            await invokeSubject(registry, subject, task, { ...processDeps, nodeArgs });
          },
        );
    const price = invocation.options.has("no-price")
      ? undefined
      : await runPrice(
          invocation,
          chosen.filter(([, registration]) => registration.tiers.includes("engine")).map(([id]) => id),
        );
    const record: RunRecord = {
      version: 1,
      specRevision: SPEC_REVISION,
      pairTableVersion: PAIR_TABLE_VERSION,
      startedAt,
      finishedAt: new Date().toISOString(),
      seed: plan.seed,
      samplesPerCell: plan.samplesPerCell,
      allowBusy,
      environment: captureEnvironment(deps.cwd),
      subjects,
      cells: output.cells,
      samples: output.samples,
      limiters,
      ...(price === undefined ? {} : { price }),
      ...(community === undefined ? {} : { community: { ...community, kept: community.kept.length } }),
    };
    const path = writeRunRecord(typeof invocation.options.get("out") === "string" ? String(invocation.options.get("out")) : "results", record);
    deps.stdout(`run: ${output.samples.length} samples over ${output.cells.length} cell(s) written to ${path}\n`);
    return 0;
  };
  commands["report"] = async (invocation) => {
    const [file] = invocation.positionals;
    if (file === undefined) throw new Error("report needs the results file to render");
    const model = buildReport(readRunRecord(file));
    const out = typeof invocation.options.get("out") === "string" ? String(invocation.options.get("out")) : "docs/reports";
    const stem = basename(file, ".json");
    mkdirSync(out, { recursive: true });
    const besideFile = invocation.options.get("beside");
    const beside = typeof besideFile === "string" ? buildReport(readRunRecord(besideFile)) : undefined;
    const crossFile = invocation.options.get("cross");
    const crossRecord = typeof crossFile === "string" ? readRunRecord(crossFile) : undefined;
    if (crossRecord !== undefined) assertComparable(readRunRecord(file), crossRecord);
    const cross = crossRecord === undefined ? undefined : buildReport(crossRecord);
    writeFileSync(join(out, `${stem}.md`), renderMarkdown(model, beside, cross));
    writeFileSync(join(out, `${stem}.summary.json`), renderSummary(model));
    deps.stdout(`report: ${join(out, `${stem}.md`)} and ${join(out, `${stem}.summary.json`)}\n`);
    const readme = invocation.options.get("readme");
    if (typeof readme === "string") {
      writeFileSync(readme, updateReadme(readFileSync(readme, "utf8"), renderReadmeSummary(model, stem, beside, cross)));
      deps.stdout(`report: plain-language summary written between the markers in ${readme}\n`);
    }
    return 0;
  };
  /** Reads the repository list, asks Tailwind which of its utilities each tree uses, and keeps the translatable ones. */
  async function communityPool(listFile: string): Promise<CommunityPool> {
    const parsed: unknown = JSON.parse(readFileSync(listFile, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every((entry: unknown) => typeof entry === "object" && entry !== null && "name" in entry && typeof entry.name === "string" && "dir" in entry && typeof entry.dir === "string")) throw new Error(`${listFile}: expected a list of { "name": string, "dir": string }`);
    const repositories: CommunityRepository[] = parsed.map((entry: { name: string; dir: string }) => {
      const dir = resolve(dirname(listFile), entry.dir);
      return { name: entry.name, dir: relative(deps.cwd, dir) || ".", commit: gitCommit(dir) };
    });
    const tailwind = [...registry].find(([, registration]) => registration.syntax === "tailwind" && registration.tiers.includes("engine"));
    if (tailwind === undefined) throw new Error("no Tailwind subject is registered to extract community classes");
    const { response } = await invokeSubject(registry, tailwind[0], { kind: "extract", dirs: repositories.map((repository) => resolve(deps.cwd, repository.dir)) }, processDeps);
    if (response.result.kind !== "extract") throw new Error(`${tailwind[0]}: expected an extract result`);
    return buildCommunityPool(repositories, response.result.found);
  }

  async function runPrice(invocation: Invocation, subjects: readonly SubjectId[]): Promise<PriceRecord> {
    const configs = typeof invocation.options.get("configs") === "string" ? String(invocation.options.get("configs")) : join(deps.cwd, "..", "teacss-ts", "examples");
    const entries = existsSync(configs) ? teacssEntries(configs) : [];
    return measurePrice(
      { subjects, installRuns: integerOption(invocation, "install-runs", 3), coverage: entries.length === 0 ? undefined : { source: relative(deps.cwd, configs) || ".", entries } },
      {
        describe: async (subject) => {
          const { response } = await invokeSubject(registry, subject, { kind: "describe" }, processDeps);
          if (response.result.kind !== "describe") throw new Error(`${subject}: expected a describe result`);
          return response.result.versions;
        },
        loadNative: async (subject, path) => {
          const { response } = await invokeSubject(registry, subject, { kind: "native-load", path }, processDeps);
          if (response.result.kind !== "native-load") throw new Error(`${subject}: expected a native-load result`);
          return response.result.wallMs;
        },
        coverage: async (subject, list) => {
          const { response } = await invokeSubject(registry, subject, { kind: "coverage", entries: list }, processDeps);
          if (response.result.kind !== "coverage") throw new Error(`${subject}: expected a coverage result`);
          return response.result.results;
        },
        install: (packages) => installFresh(packages, deps.env),
        progress: (message) => deps.stdout(`  ${message}\n`),
      },
    );
  }
  commands["price"] = async (invocation) => {
    const chosen = chosenSubjects(invocation, registry).filter(([, registration]) => registration.tiers.includes("engine"));
    const price = await runPrice(
      invocation,
      chosen.map(([id]) => id),
    );
    deps.stdout(`${JSON.stringify(price, null, 2)}\n`);
    return 0;
  };
  const command = commands[invocation.command ?? "help"];
  if (command === undefined || invocation.options.has("help")) {
    deps.stdout(USAGE);
    return invocation.command === undefined || invocation.options.has("help") ? 0 : 2;
  }
  return command(invocation);
}
