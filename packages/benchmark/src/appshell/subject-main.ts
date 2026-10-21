import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { type Clock, createWorkspace, loadedNativeModules, ownResourceUsage, type SubjectClient, type SubjectFactory, systemClock } from "@bench/infrastructure";
import { CONTRACT_VERSION, parseSubjectRequest, type SubjectRequest, type SubjectResponse, type TaskResult } from "../contract/index.ts";
import { runEngineScenario } from "../features/measure/index.ts";

export interface SubjectMainDeps {
  readonly clock: Clock;
}

export interface SubjectMainResult {
  readonly stdout: string;
  readonly exitCode: 0 | 1;
}

async function loadSubject(request: SubjectRequest): Promise<SubjectClient> {
  const module: unknown = await import(request.module);
  if (typeof module !== "object" || module === null || !("createSubject" in module) || typeof module.createSubject !== "function") throw new Error(`${request.module} does not export createSubject`);
  const subject = (module.createSubject as SubjectFactory)();
  if (subject.id !== request.subject) throw new Error(`${request.module} created subject "${subject.id}", the request asked for "${request.subject}"`);
  return subject;
}

async function runTask(request: SubjectRequest, deps: SubjectMainDeps): Promise<TaskResult> {
  const { task } = request;
  switch (task.kind) {
    case "describe":
      return { kind: "describe", versions: await (await loadSubject(request)).describe() };
    case "engine":
      return { kind: "engine", samples: await runEngineScenario(task.scenario, task.candidates, () => loadSubject(request), deps.clock) };
    case "build": {
      const subject = await loadSubject(request);
      const workspace = createWorkspace(`bench-${request.subject}`);
      try {
        await subject.prepare(workspace, { files: new Map(Object.entries(task.files)) });
        const { css } = await subject.build(workspace);
        return { kind: "build", cssBytes: Buffer.byteLength(css), cssGzipBytes: gzipSync(css).byteLength, cssSha256: createHash("sha256").update(css).digest("hex") };
      } finally {
        workspace.remove();
      }
    }
  }
}

/** The subject process: one request on stdin, one response on stdout. Only this process imports a subject. */
export async function subjectMain(stdin: string, deps: SubjectMainDeps = { clock: systemClock }): Promise<SubjectMainResult> {
  let request: SubjectRequest;
  try {
    request = parseSubjectRequest(JSON.parse(stdin));
  } catch (error) {
    return { stdout: `${JSON.stringify({ version: CONTRACT_VERSION, sentAt: Date.now(), subject: "unknown", nativeModules: [], usage: ownResourceUsage(), result: { kind: "error", message: error instanceof Error ? error.message : String(error), stack: undefined } })}\n`, exitCode: 1 };
  }
  let result: TaskResult;
  try {
    result = await runTask(request, deps);
  } catch (error) {
    result = { kind: "error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
  }
  const response: SubjectResponse = { version: CONTRACT_VERSION, sentAt: Date.now(), subject: request.subject, nativeModules: loadedNativeModules(), usage: ownResourceUsage(), result };
  return { stdout: `${JSON.stringify(response)}\n`, exitCode: result.kind === "error" ? 1 : 0 };
}
