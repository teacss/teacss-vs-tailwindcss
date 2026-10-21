import { type Invocation, parseInvocation, type SubjectId, subjectId } from "@bench/infrastructure";
import { invokeSubject, type SubjectRegistry } from "../subjects/index.ts";

export interface AppDeps {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  /** The shell's subject entry file. */
  readonly subjectEntry: string;
  readonly registry?: SubjectRegistry;
}

/** Subject id to the module its process imports; the only place an implementation is chosen. */
export const productionRegistry: SubjectRegistry = new Map<SubjectId, string>();

const USAGE = `bench <command>

  help        this text
  subjects    list the registered subjects and the versions each one reports
`;

const SUBJECT_TIMEOUT_MS = 60_000;

/** The orchestrator's composition root: parses the invocation, picks the registry and routes the command. */
export async function createApp(deps: AppDeps): Promise<number> {
  const registry = deps.registry ?? productionRegistry;
  const invocation = parseInvocation(deps.argv);
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
        const { response } = await invokeSubject(registry, subjectId(id), { kind: "describe" }, { subjectEntry: deps.subjectEntry, cwd: deps.cwd, env: deps.env, timeoutMs: SUBJECT_TIMEOUT_MS });
        if (response.result.kind !== "describe") throw new Error(`${id}: expected a describe result`);
        const versions = Object.entries(response.result.versions.packages)
          .map(([name, version]) => `${name}@${version}`)
          .join(" ");
        deps.stdout(`${id}: ${versions} (native: ${response.nativeModules.join(", ") || "none"})\n`);
      }
      return 0;
    },
  };
  const command = commands[invocation.command ?? "help"];
  if (command === undefined || invocation.options.has("help")) {
    deps.stdout(USAGE);
    return invocation.command === undefined || invocation.options.has("help") ? 0 : 2;
  }
  return command(invocation);
}
