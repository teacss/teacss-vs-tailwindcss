import assert from "node:assert/strict";
import { test } from "node:test";
import { cliffsDelta, compare, mannWhitneyU, summarize } from "./statistics.ts";

test("summarize gives the quartiles, the p95 and the range of a known series", () => {
  const summary = summarize([5, 1, 4, 2, 3, 6, 7, 8, 9, 10]);
  assert.equal(summary.median, 5.5);
  assert.equal(summary.q1, 3.25);
  assert.equal(summary.q3, 7.75);
  assert.ok(Math.abs(summary.p95 - 9.55) < 1e-9, `${summary.p95}`);
  assert.deepEqual([summary.min, summary.max, summary.n], [1, 10, 10]);
});

test("two separated samples differ and two interleaved samples do not", () => {
  const slow = Array.from({ length: 30 }, (_, index) => 100 + (index % 5));
  const fast = Array.from({ length: 30 }, (_, index) => 50 + (index % 5));
  const verdict = compare(fast, slow);
  assert.equal(verdict.kind, "differs");
  if (verdict.kind !== "differs") return;
  assert.equal(verdict.lower, "left");
  assert.ok(verdict.ratio > 1.9 && verdict.ratio < 2.1, `${verdict.ratio}`);
  assert.ok(verdict.p < 1e-6, `${verdict.p}`);
  assert.equal(verdict.delta, -1);

  const same = compare(
    slow,
    slow.map((value) => value + 1),
  );
  assert.equal(same.kind, "no-measurable-difference");
  assert.ok(mannWhitneyU(slow, slow).p > 0.99);
});

test("a gap inside the spread is no measurable difference even when ranks separate", () => {
  const wide = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const shifted = wide.map((value) => value + 5);
  assert.equal(compare(wide, shifted).kind, "no-measurable-difference");
});

test("cliff's delta is the share of lower minus higher pairs", () => {
  assert.equal(cliffsDelta([1, 2], [3, 4]), -1);
  assert.equal(cliffsDelta([1, 3], [2, 2]), 0);
});
