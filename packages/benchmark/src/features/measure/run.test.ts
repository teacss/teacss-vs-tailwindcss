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
  if (task.kind === "dev") return { result: { kind: "dev", samples: task.extra.map((group) => ({ wallMs: 5, polls: 2, cssBytes: 10, cssSha256: group.join(",") })) }, nativeModules: [], usage, wallMs: 9 };
  if (task.kind !== "engine") throw new Error("unexpected task");
  const count = task.scenario === "cold" ? 1 : WARM_TIMED_ITERATIONS;
  const perCall = task.extra.length > 0;
  return { result: { kind: "engine", samples: Array.from({ length: count }, (_, call) => ({ wallMs: 1, cssBytes: 10, cssSha256: perCall ? `${hash}-${task.extra[call]?.join(",")}` : hash })), css: undefined }, nativeModules: [], usage, wallMs: 3 };
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
  assert.equal(count("engine", "alpha", "incremental-10"), WARM_TIMED_ITERATIONS);
  assert.equal(count("engine", "alpha", "incremental-100"), WARM_TIMED_ITERATIONS);
  assert.deepEqual(calls.slice(0, 6).sort(), ["alpha/build", "alpha/engine/cold", "alpha/engine/incremental-10", "alpha/engine/incremental-100", "alpha/engine/warm", "beta/build"]);
  assert.notDeepEqual(calls.slice(0, 6), calls.slice(6, 12));
});

test("incremental calls get distinct new classes per call and the same ones in every process", async () => {
  const seen: string[][][] = [];
  await measure(
    { ...plan, tiers: ["engine"], subjects: [subjects[0] ?? subjects[1]!], samplesPerCell: 20 },
    {
      invoke: async (_subject, task) => {
        if (task.kind === "engine" && task.scenario === "incremental-10") seen.push(task.extra.map((group) => [...group]));
        return fakeMeasured(task);
      },
      loadShare: () => 0,
      progress: () => {},
    },
  );
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], seen[1]);
  const flat = seen[0]?.flat() ?? [];
  assert.equal(flat.length, 100);
  assert.equal(new Set(flat).size, 100);
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

test("the dev tier runs one server process per size and cell, with a fresh group of classes per round", async () => {
  const seen: { size: number; groups: number; distinct: number }[] = [];
  const output = await measure(
    { ...plan, tiers: ["dev"], samplesPerCell: 5 },
    {
      invoke: async (_subject, task) => {
        if (task.kind === "dev") seen.push({ size: task.size, groups: task.extra.length, distinct: new Set(task.extra.flat()).size });
        return fakeMeasured(task);
      },
      loadShare: () => 0,
      progress: () => {},
    },
  );
  assert.deepEqual(
    seen.map((entry) => entry.size).sort((left, right) => left - right),
    [10, 100],
  );
  assert.ok(seen.every((entry) => entry.groups === 5 && entry.distinct === entry.size * 5));
  assert.equal(output.samples.filter((sample) => sample.tier === "dev" && sample.subject === "alpha").length, 10);
  assert.equal(output.samples.filter((sample) => sample.subject === "beta").length, 0);
});
