import { type ProcessResult, runProcess, type SubjectId } from "@bench/infrastructure";
import { CONTRACT_VERSION, parseSubjectResponse, type SubjectRequest, type SubjectResponse, type SubjectTask } from "../contract/index.ts";
import type { SubjectRegistration, SubjectRegistry } from "./registry.ts";

export { productionRegistry, type SubjectRegistration, type SubjectRegistry } from "./registry.ts";

export interface SubjectProcessDeps {
  /** The shell's subject entry file. */
  readonly subjectEntry: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly nodeArgs?: readonly string[];
  /** Node's compile cache directory for build and dev tasks (spec v01.1 revision 5). */
  readonly compileCache?: string;
}

/**
 * What the `vite` and `rsbuild` CLIs set before they load a config, so before any plugin is created:
 * Node's compile cache (spec v01.1 revision 5) and `NODE_ENV`, `development` for a dev server and
 * `production` for a build (revision 6). Bun has no such CLI and honours both variables itself, so
 * Bun subjects, and engine and other tasks, run with neither.
 */
export function subjectEnv(task: SubjectTask, runtime: SubjectRegistration["runtime"], env: Readonly<Record<string, string>>, compileCache: string | undefined): Record<string, string> {
  const { NODE_COMPILE_CACHE: _cache, NODE_DISABLE_COMPILE_CACHE: _disabled, NODE_ENV: _mode, ...rest } = env;
  if (runtime !== "node" || (task.kind !== "build" && task.kind !== "dev")) return rest;
  return { ...rest, NODE_ENV: task.kind === "dev" ? "development" : "production", ...(compileCache === undefined ? {} : { NODE_COMPILE_CACHE: compileCache }) };
}

export class SubjectProcessError extends Error {
  readonly subject: SubjectId;
  readonly process: ProcessResult;

  constructor(subject: SubjectId, message: string, process: ProcessResult) {
    super(`${subject}: ${message}\n${process.stderr}`);
    this.subject = subject;
    this.process = process;
  }
}

export interface SubjectInvocation {
  readonly response: SubjectResponse;
  readonly process: ProcessResult;
}

export async function invokeSubject(registry: SubjectRegistry, subject: SubjectId, task: SubjectTask, deps: SubjectProcessDeps): Promise<SubjectInvocation> {
  const registration = registry.get(subject);
  if (registration === undefined) throw new Error(`${subject}: not a registered subject (${[...registry.keys()].join(", ") || "none registered"})`);
  const request: SubjectRequest = { version: CONTRACT_VERSION, sentAt: Date.now(), subject, module: registration.module, task };
  const process = await runProcess(deps.subjectEntry, {
    executable: registration.runtime === "bun" ? "bun" : undefined,
    nodeArgs: deps.nodeArgs ?? [],
    args: [],
    cwd: deps.cwd,
    env: { ...subjectEnv(task, registration.runtime, deps.env, deps.compileCache), ...registration.env },
    stdin: JSON.stringify(request),
    timeoutMs: deps.timeoutMs,
  });
  if (process.signal !== null) throw new SubjectProcessError(subject, `killed by ${process.signal} after ${deps.timeoutMs} ms`, process);
  let parsed: unknown;
  try {
    parsed = JSON.parse(process.stdout);
  } catch {
    throw new SubjectProcessError(subject, `exit ${process.status} with no response on stdout`, process);
  }
  const response = parseSubjectResponse(parsed);
  if (response.result.kind === "error") throw new SubjectProcessError(subject, response.result.message, process);
  if (process.status !== 0) throw new SubjectProcessError(subject, `exit ${process.status}`, process);
  return { response, process };
}
