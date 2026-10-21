import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { buildReport, renderMarkdown, renderSummary } from "./index.ts";

function sample(subject: string, tier: "engine" | "build", wallMs: number, index: number, scenario: "cold" | "warm" = "cold"): Sample {
  const base = { subject: subjectId(subject), cell: { utilities: 100, files: 2 }, index, wallMs, cssBytes: 1000, cssSha256: "h", nativeModules: [] };
  return tier === "build" ? { ...base, tier, cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1048576, cssGzipBytes: 200 } : { ...base, tier, scenario };
}

function record(): RunRecord {
  const samples: Sample[] = [];
  for (let index = 0; index < 30; index++) {
    samples.push(sample("fast", "engine", 10 + (index % 3), index), sample("slow", "engine", 30 + (index % 3), index), sample("same", "engine", 10 + ((index + 1) % 3), index));
    samples.push(sample("vite-baseline", "build", 100 + (index % 3), index), sample("fast", "build", 150 + (index % 3), index), sample("slow", "build", 400 + (index % 3), index));
  }
  return {
    version: 1,
    specRevision: 1,
    pairTableVersion: 1,
    startedAt: "2026-10-21T10:00:00.000Z",
    finishedAt: "2026-10-21T10:10:00.000Z",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 8, memoryBytes: 8 * 1073741824, os: "o", node: "v24", bun: "1.4.3", lockfileSha256: "l", commit: "c0ffee" },
    subjects: { fast: { packages: { fast: "1.0.0" }, local: {} } },
    cells: [{ cell: { utilities: 100, files: 2 }, corpusHash: "abc", loadShareBefore: 0.1, loadShareAfter: 0.12 }],
    limiters: { "fast/engine": { totalMs: 100, top: [{ name: "generate (core.js:1)", selfMs: 40, share: 0.4 }] } },
    samples,
  };
}

test("the model ranks subjects per series and cell, with build deltas over the baseline", () => {
  const model = buildReport(record());
  const engine = model.tables.find((table) => table.series === "engine/cold");
  assert.equal(engine?.fastest, "fast");
  assert.deepEqual(
    engine?.verdicts.map((entry) => `${entry.subject}:${entry.verdict.kind}`),
    ["same:no-measurable-difference", "slow:differs"],
  );
  const build = model.tables.find((table) => table.series === "build");
  assert.equal(build?.rows.find((row) => row.subject === "slow")?.deltaMs, 300);
  assert.equal(build?.rows.find((row) => row.subject === "vite-baseline")?.deltaMs, 0);
  assert.equal(
    model.tables.some((table) => table.series === "engine/warm"),
    false,
  );
});

test("the markdown is deterministic and states the verdicts in words", () => {
  const first = renderMarkdown(buildReport(record()));
  assert.equal(first, renderMarkdown(buildReport(record())));
  assert.match(first, /\*\*engine\/cold\.\*\* At 100 utilities in 2 files, fast has the lowest median \(11\.0 ms\)/);
  assert.match(first, /same: no measurable difference from fast/);
  assert.match(first, /slow: 2\.82x the median of fast \(p = < 0\.001, Cliff's delta -1\.00\)/);
  assert.match(first, /\| slow \| 401\.0 ms \| 2\.0 ms \| 402\.0 ms \| 400\.0 ms \| 300\.0 ms \| 1\.0 KB \| 0\.2 KB \| 1 MB \|/);
  assert.match(first, /No engine\/warm samples in this run/);
  assert.ok(!first.includes("incremental"), "series added after v01.1 stay silent when unmeasured");
  assert.match(first, /\*\*Subset run\.\*\* Measured: fast\. Not measured: vite-baseline, teacss-ts, teacss-rs, tailwind-v4\./);
  assert.match(first, /\| fast\/engine \| generate \(core\.js:1\) 40\.0 ms \(40%\) \|/);
  assert.equal(renderSummary(buildReport(record())), renderSummary(buildReport(record())));
});

test("a v02 record opens with the method commit and verification, and names configurations it did not measure", () => {
  const v02 = { ...record(), v02Revision: 3, verification: { cells: 1, cases: 100, checks: 7 }, subjects: { "teacss-rs": { packages: {}, local: {} } } };
  const markdown = renderMarkdown(buildReport(v02));
  assert.match(markdown, /Protocol: spec v01\.1 revision 1 and v02\.1 revision 3;/);
  assert.match(markdown, /\*\*Method and verification\.\*\* Commit `c0ffee`\. Before timing anything, 7 subject check\(s\) over 1 corpus\/corpora and 100 paired case\(s\) found no difference/);
  assert.match(markdown, /Not measured: vite-baseline, teacss-ts, tailwind-v4, teacss-ts-default, teacss-rs-default, tailwind-v4-default\./);
  assert.match(markdown, /7\. \*\*Did it even happen\?\*\* Before timing, every subject's output on every corpus was checked/);
  const postcss = { ...v02, subjects: { "teacss-ts-postcss": { packages: {}, local: {} }, "teacss-rs-postcss": { packages: {}, local: {} }, "tailwind-v4-postcss": { packages: {}, local: {} } } };
  assert.ok(!renderMarkdown(buildReport(postcss)).includes("Subset run"), "a full PostCSS round is not a subset");
});
