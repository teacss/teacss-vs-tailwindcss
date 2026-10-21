import { type Invocation, parseInvocation, subjectId } from "@bench/infrastructure";
import { DEFAULT_SEED, generateCorpus, PAIR_TABLE_VERSION, profileCorpus } from "../features/corpus/index.ts";
import { captureEnvironment, loadShare } from "../features/environment/index.ts";
import { measure, type Tier } from "../features/measure/run.ts";
import { verifyCorpus } from "../features/verify/run.ts";
import { type RunRecord, writeRunRecord } from "../persistence/index.ts";
import { invokeSubject, productionRegistry, type SubjectRegistry } from "../subjects/index.ts";

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
  verify      run the equivalence checks of spec v01.1 on one corpus
              --utilities <n> (5000)  --files <n> (30)  --seed <n>
  run         measure the scale matrix and write results/<time>-<host>.json
              --utilities <a,b,c> (1000,5000,20000)  --files <a,b,c> (3,30,300)
              --samples <n> (30)  --tier engine|build|all (all)  --subjects <a,b>
              --seed <n>  --out <dir> (results)  --allow-busy
`;

const SPEC_REVISION = 1;
/** Spec v01.1 §Run protocol: refuse above this share of the logical cores. */
const LOAD_SHARE_LIMIT = 0.2;

const SUBJECT_TIMEOUT_MS = 10 * 60_000;

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
  if (raw === "all") return ["engine", "build"];
  if (raw === "engine" || raw === "build") return [raw];
  throw new Error(`--tier must be engine, build or all, found "${String(raw)}"`);
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
        deps.stdout(`${id}: ${versions} (native: ${response.nativeModules.join(", ") || "none"})\n`);
      }
      return 0;
    },
    corpus: async (invocation) => {
      const corpus = corpusOf(invocation);
      deps.stdout(`corpus ${corpus.hash}\nseed ${corpus.parameters.seed} utilities ${corpus.parameters.utilities} files ${corpus.parameters.files} pair-table ${corpus.pairTableVersion}\n`);
      if (invocation.options.has("profile")) deps.stdout(`${JSON.stringify(profileCorpus(corpus), null, 2)}\n`);
      return 0;
    },
    verify: async (invocation) => {
      const corpus = corpusOf(invocation);
      deps.stdout(`verify corpus ${corpus.hash.slice(0, 12)} (${corpus.parameters.utilities} utilities, ${corpus.parameters.files} files)\n`);
      const subjects = [...registry].map(([id, registration]) => ({ id, syntax: registration.syntax, engineTier: registration.engineTier, natives: registration.natives }));
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
    const allowBusy = invocation.options.has("allow-busy");
    const share = loadShare();
    if (share > LOAD_SHARE_LIMIT && !allowBusy) {
      deps.stdout(`run: refused, the one-minute load is ${(share * 100).toFixed(0)}% of the cores (limit ${LOAD_SHARE_LIMIT * 100}%); pass --allow-busy to record a run on a busy machine\n`);
      return 3;
    }
    const wanted = invocation.options.get("subjects");
    const chosen = [...registry].filter(([id]) => wanted === undefined || wanted === true || wanted.split(",").includes(id));
    if (chosen.length === 0) throw new Error(`--subjects named none of ${[...registry.keys()].join(", ")}`);
    const cells = integerList(invocation, "utilities", [1_000, 5_000, 20_000]).flatMap((utilities) => integerList(invocation, "files", [3, 30, 300]).map((files) => ({ utilities, files })));
    const plan = { seed: integerOption(invocation, "seed", DEFAULT_SEED), cells, tiers: tiersOf(invocation), subjects: chosen.map(([id, registration]) => ({ id, syntax: registration.syntax, engineTier: registration.engineTier })), samplesPerCell: integerOption(invocation, "samples", 30) };
    const startedAt = new Date().toISOString();
    const subjects: Record<string, { packages: Record<string, string> }> = {};
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
    };
    const path = writeRunRecord(typeof invocation.options.get("out") === "string" ? String(invocation.options.get("out")) : "results", record);
    deps.stdout(`run: ${output.samples.length} samples over ${output.cells.length} cell(s) written to ${path}\n`);
    return 0;
  };
  const command = commands[invocation.command ?? "help"];
  if (command === undefined || invocation.options.has("help")) {
    deps.stdout(USAGE);
    return invocation.command === undefined || invocation.options.has("help") ? 0 : 2;
  }
  return command(invocation);
}
