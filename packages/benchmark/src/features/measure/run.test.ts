import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { SubjectTask } from "../../contract/index.ts";
import { WARM_TIMED_ITERATIONS } from "./engine-scenario.ts";
import { type Measured, measure, RunInvalid, type RunPlan } from "./run.ts";

const subjects = [
  { id: subjectId("alpha"), syntax: "teacss" as const, engineTier: true },
  { id: subjectId("beta"), syntax: "tailwind" as const, engineTier: false },
];
const plan: RunPlan = { seed: 1, cells: [{ utilities: 20, files: 2 }], tiers: ["engine", "build"], subjects, samplesPerCell: 4 };

function fakeMeasured(task: SubjectTask, hash = "same"): Measured {
  const usage = { cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1 };
  if (task.kind === "build") return { result: { kind: "build", cssBytes: 10, cssGzipBytes: 5, cssSha256: hash, css: undefined }, nativeModules: [], usage, wallMs: 7 };
  if (task.kind !== "engine") throw new Error("unexpected task");
  const count = task.scenario === "warm" ? WARM_TIMED_ITERATIONS : 1;
  return { result: { kind: "engine", samples: Array.from({ length: count }, () => ({ wallMs: 1, cssBytes: 10, cssSha256: hash })), css: undefined }, nativeModules: [], usage, wallMs: 3 };
}

test("every subject and tier reaches its sample count, interleaved round by round, with the cell's corpus hash and load", async () => {
  const calls: string[] = [];
  const output = await measure(plan, {
    invoke: async (subject, task) => {
      calls.push(`${subject}/${task.kind}${task.kind === "engine" ? `/${task.scenario}` : ""}`);
      return fakeMeasured(task);
    },
    loadShare: () => 0.1,
    progress: () => {},
  });
  const count = (tier: string, subject: string, scenario?: string) => output.samples.filter((sample) => sample.tier === tier && sample.subject === subject && (scenario === undefined || (sample.tier === "engine" && sample.scenario === scenario))).length;
  assert.equal(count("build", "alpha"), 4);
  assert.equal(count("build", "beta"), 4);
  assert.equal(count("engine", "alpha", "cold"), 4);
  assert.equal(count("engine", "alpha", "warm"), WARM_TIMED_ITERATIONS);
  assert.equal(output.cells[0]?.loadShareBefore, 0.1);
  assert.equal(output.cells[0]?.corpusHash.length, 64);
  assert.deepEqual(calls.slice(0, 4).sort(), ["alpha/build", "alpha/engine/cold", "alpha/engine/warm", "beta/build"]);
  assert.notDeepEqual(calls.slice(0, 4), calls.slice(4, 8));
});

test("a subject error invalidates the run before anything is returned", async () => {
  await assert.rejects(
    measure(plan, {
      invoke: async (subject, task) => (subject === "beta" ? { ...fakeMeasured(task), result: { kind: "error", message: "boom", stack: undefined } } : fakeMeasured(task)),
      loadShare: () => 0,
      progress: () => {},
    }),
    (error: unknown) => error instanceof RunInvalid && /beta\/build\/build\/20x2: boom/.test(error.message),
  );
});

test("an output hash that changes between samples invalidates the run", async () => {
  let calls = 0;
  await assert.rejects(measure({ ...plan, tiers: ["build"] }, { invoke: async (_subject, task) => fakeMeasured(task, `h${calls++ > 2 ? "x" : ""}`), loadShare: () => 0, progress: () => {} }), (error: unknown) => error instanceof RunInvalid && /output changed between samples/.test(error.message));
});
