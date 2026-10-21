import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "@bench/infrastructure/test-support";
import { fakeSubject } from "@bench/infrastructure/test-support/fake-subject";
import { runEngineScenario, WARM_TIMED_ITERATIONS, WARM_UNTIMED_ITERATIONS } from "./engine-scenario.ts";

test("cold runs one iteration and times the load inside it", async () => {
  let loads = 0;
  const { samples, css } = await runEngineScenario(
    "cold",
    ["p:4"],
    async () => {
      loads++;
      return fakeSubject;
    },
    fakeClock(2_000_000n),
  );
  assert.equal(loads, 1);
  assert.equal(css, ".p:4{}");
  assert.deepEqual(
    samples.map((sample) => sample.wallMs),
    [2],
  );
  assert.equal(samples[0]?.cssBytes, ".p:4{}".length);
});

test("warm discards the untimed iterations and returns one sample per timed iteration", async () => {
  let calls = 0;
  const subject = { ...fakeSubject, engine: async (input: { candidates: readonly string[] }) => (calls++, fakeSubject.engine(input)) };
  const { samples } = await runEngineScenario("warm", ["p:4", "m:2"], async () => subject, fakeClock());
  assert.equal(calls, WARM_UNTIMED_ITERATIONS + WARM_TIMED_ITERATIONS);
  assert.equal(samples.length, WARM_TIMED_ITERATIONS);
  assert.ok(samples.every((sample) => sample.wallMs === 1 && sample.cssSha256 === samples[0]?.cssSha256));
});
