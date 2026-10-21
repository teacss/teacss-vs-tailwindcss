import { type Invocation, parseInvocation, subjectId } from "@bench/infrastructure";
import { DEFAULT_SEED, generateCorpus, profileCorpus } from "../features/corpus/index.ts";
import { verifyCorpus } from "../features/verify/run.ts";
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
`;

const SUBJECT_TIMEOUT_MS = 10 * 60_000;

function integerOption(invocation: Invocation, name: string, fallback: number): number {
  const raw = invocation.options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer, found "${String(raw)}"`);
  return value;
}

function corpusOf(invocation: Invocation) {
  return generateCorpus({ seed: integerOption(invocation, "seed", DEFAULT_SEED), utilities: integerOption(invocation, "utilities", 5_000), files: integerOption(invocation, "files", 30) });
}

/** The orchestrator's composition root: parses the invocation, picks the registry and routes the command. */
export async function createApp(deps: AppDeps): Promise<number> {
  const registry = deps.registry ?? productionRegistry();
  const invocation = parseInvocation(deps.argv);
  const processDeps = { subjectEntry: deps.subjectEntry, cwd: deps.cwd, env: deps.env, timeoutMs: SUBJECT_TIMEOUT_MS };
  const commands: Readonly<Record<string, (invocation: Invocation) => Promise<number>>> = {
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
  const command = commands[invocation.command ?? "help"];
  if (command === undefined || invocation.options.has("help")) {
    deps.stdout(USAGE);
    return invocation.command === undefined || invocation.options.has("help") ? 0 : 2;
  }
  return command(invocation);
}
