import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "@bench/infrastructure/test-support";
import { fakeSubject } from "@bench/infrastructure/test-support/fake-subject";
import { runEngineScenario, WARM_TIMED_ITERATIONS, WARM_UNTIMED_ITERATIONS } from "./engine-scenario.ts";

const none: string[][] = [];

test("cold runs one iteration and times the load inside it", async () => {
  let loads = 0;
  const { samples, css } = await runEngineScenario(
    { scenario: "cold", candidates: ["p:4"], extra: none },
    async () => {
      loads++;
      return fakeSubject;
    },
    fakeClock(2_000_000n),
  );
  assert.equal(loads, 1);
  assert.equal(css, ".p\\:4{}");
  assert.deepEqual(
    samples.map((sample) => sample.wallMs),
    [2],
  );
});

test("warm discards the untimed iterations and returns one sample per timed iteration", async () => {
  let calls = 0;
  const subject = { ...fakeSubject, engine: async (input: { candidates: readonly string[] }) => (calls++, fakeSubject.engine(input)) };
  const { samples } = await runEngineScenario({ scenario: "warm", candidates: ["p:4", "m:2"], extra: none }, async () => subject, fakeClock());
  assert.equal(calls, WARM_UNTIMED_ITERATIONS + WARM_TIMED_ITERATIONS);
  assert.equal(samples.length, WARM_TIMED_ITERATIONS);
  assert.ok(samples.every((sample) => sample.wallMs === 1 && sample.cssSha256 === samples[0]?.cssSha256));
});

function groups(k: number): string[][] {
  return Array.from({ length: WARM_TIMED_ITERATIONS }, (_, round) => Array.from({ length: k }, (_, index) => `m:${round * k + index}@hover`));
}

test("incremental keeps one session and asks for every class so far, as Tailwind's compiler keeps them", async () => {
  const calls: number[] = [];
  let sessions = 0;
  const subject = {
    ...fakeSubject,
    engineSession: async () => {
      sessions++;
      const session = await fakeSubject.engineSession();
      return { generate: async (candidates: readonly string[]) => (calls.push(candidates.length), session.generate(candidates)) };
    },
  };
  const { samples, css } = await runEngineScenario({ scenario: "incremental-10", candidates: ["p:4", "m:2"], extra: groups(10) }, async () => subject, fakeClock());
  assert.equal(sessions, 1);
  assert.deepEqual(calls, [2, 2, 2, ...Array.from({ length: WARM_TIMED_ITERATIONS }, (_, call) => 2 + 10 * (call + 1))]);
  assert.equal(samples.length, WARM_TIMED_ITERATIONS);
  assert.ok(css.includes(".m\\:99\\@hover"));
});

test("an incremental output that lacks a new class invalidates the run", async () => {
  const subject = { ...fakeSubject, engineSession: async () => ({ generate: async (candidates: readonly string[]) => fakeSubject.engine({ candidates: candidates.slice(0, -1) }) }) };
  await assert.rejects(
    runEngineScenario({ scenario: "incremental-10", candidates: ["p:4"], extra: groups(10) }, async () => subject, fakeClock()),
    /incremental-10: the output lacks 1 new class\(es\), first m:9@hover/,
  );
});

test("an incremental scenario with the wrong group sizes is refused", async () => {
  await assert.rejects(
    runEngineScenario({ scenario: "incremental-100", candidates: ["p:4"], extra: groups(10) }, async () => fakeSubject, fakeClock()),
    /needs 10 groups of 100/,
  );
});

test("every timed call records its CPU time, resident memory and heap", async () => {
  const { samples } = await runEngineScenario({ scenario: "warm", candidates: ["p:4"], extra: none }, async () => fakeSubject, fakeClock());
  assert.ok(samples.every((sample) => sample.cpuMs >= 0 && sample.rssBytes > 0 && sample.heapBytes > 0));
});
