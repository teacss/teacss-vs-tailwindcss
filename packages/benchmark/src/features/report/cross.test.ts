import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { assertComparable, crossComparisons } from "./cross.ts";
import { buildReport, renderMarkdown } from "./index.ts";
import { renderReadmeSummary } from "./readme.ts";

function record(warm: Readonly<Record<string, number>>, build: Readonly<Record<string, number>>, options: { cpu?: string; hash?: string; revision?: number } = {}): RunRecord {
  const cell = { utilities: 100, files: 3 };
  const samples: Sample[] = [];
  for (let index = 0; index < 30; index++) {
    for (const [subject, ms] of Object.entries(warm)) samples.push({ tier: "engine", scenario: "warm", subject: subjectId(subject), cell, index, wallMs: ms + (index % 3), cssBytes: 1, cssSha256: "h", nativeModules: [] });
    for (const [subject, ms] of Object.entries(build)) samples.push({ tier: "build", subject: subjectId(subject), cell, index, wallMs: ms + (index % 3), cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1, cssBytes: 1, cssGzipBytes: 1, cssSha256: "b", nativeModules: [] });
  }
  return {
    version: 1,
    specRevision: options.revision ?? 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: options.cpu ?? "Apple M2 Max", cores: 4, memoryBytes: 1, os: "linux 6.8", node: "v24.14.1", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [{ cell, corpusHash: options.hash ?? "same", loadShareBefore: 0, loadShareAfter: 0 }],
    limiters: {},
    samples,
  };
}

test("records from different spec revisions or corpora are refused", () => {
  const local = record({ a: 10 }, { a: 10 });
  assert.throws(() => assertComparable(local, record({ a: 10 }, { a: 10 }, { revision: 2 })), /different spec revisions \(3 and 2\)/);
  assert.throws(() => assertComparable(local, record({ a: 10 }, { a: 10 }, { hash: "other" })), /cell 100x3 measured different corpora/);
  assert.doesNotThrow(() => assertComparable(local, record({ a: 20 }, { a: 20 })));
});

test("each series and cell is a same leader, a tie, or a different leader", () => {
  const local = buildReport(record({ "teacss-rs": 10, "tailwind-v4": 20 }, { "tailwind-v4": 100, "teacss-rs": 200 }));
  const tie = buildReport(record({ "teacss-rs": 10.5, "tailwind-v4": 10 }, { "tailwind-v4": 100, "teacss-rs": 200 }, { cpu: "AMD EPYC" }));
  assert.deepEqual(
    crossComparisons(local, tie).map((entry) => `${entry.series}:${entry.agreement}`),
    ["engine/warm:tie", "build:same leader"],
  );
  const flipped = buildReport(record({ "teacss-rs": 30, "tailwind-v4": 10 }, { "tailwind-v4": 100, "teacss-rs": 200 }, { cpu: "AMD EPYC" }));
  assert.equal(crossComparisons(local, flipped)[0]?.agreement, "different leader");
  const markdown = renderMarkdown(local, undefined, flipped);
  assert.match(markdown, /## Second machine/);
  assert.match(markdown, /Of 2 comparisons, the two machines name the same fastest tool in 1, tie in 0 and disagree in 1\. They disagree on: engine\/warm at 100x3 \(teacss-rs here, tailwind-v4 there\)\./);
  assert.match(renderReadmeSummary(local, "s", undefined, tie), /- On a second machine \(AMD EPYC, linux 6\.8\), the fastest tool is the same or within noise in 2 of 2 comparisons\./);
});
