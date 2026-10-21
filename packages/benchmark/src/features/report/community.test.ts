import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { buildReport, renderMarkdown } from "./index.ts";
import { renderReadmeSummary } from "./readme.ts";

function record(warm: Readonly<Record<string, number>>, community = false): RunRecord {
  const cell = { utilities: 12, files: 3 };
  const samples: Sample[] = [];
  for (let index = 0; index < 30; index++) {
    for (const [subject, ms] of Object.entries(warm)) samples.push({ tier: "engine", scenario: "warm", subject: subjectId(subject), cell, index, wallMs: ms + (index % 3), cssBytes: 1, cssSha256: "h", nativeModules: [] });
  }
  return {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: community ? "2026-10-22T01:00:00.000Z" : "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 1, memoryBytes: 1, os: "o", node: "v24", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0, loadShareAfter: 0 }],
    limiters: {},
    ...(community ? { community: { repositories: [{ name: "site", dir: "../site", commit: "abc" }], found: 40, kept: 12, untranslated: [["font", 8] as const] } } : {}),
    samples,
  };
}

test("a community record names its source, repositories and untranslated prefixes", () => {
  const markdown = renderMarkdown(buildReport(record({ "teacss-rs": 10, "tailwind-v4": 20 }, true)));
  assert.match(markdown, /\*\*Community corpus\.\*\* The classes come from public Tailwind projects/);
  assert.match(markdown, /40 distinct Tailwind utilities were found, 12 of them \(30 %\) translate to TeaCSS/);
  assert.match(markdown, /\| site \| `\.\.\/site` \| abc \|/);
  assert.match(markdown, /Most frequent untranslatable prefixes: `font` \(8\)\./);
});

test("the beside takeaway separates a measurable change from a tie", () => {
  const generated = buildReport(record({ "teacss-rs": 10, "tailwind-v4": 20 }));
  const changed = renderReadmeSummary(generated, "s", buildReport(record({ "teacss-rs": 30, "tailwind-v4": 10 }, true)));
  assert.match(changed, /- On classes taken from 1 public Tailwind project \(12 of their 40 utilities translate\), the ranking changes: generating the CSS is fastest with Tailwind CSS v4\./);
  const tied = renderReadmeSummary(generated, "s", buildReport(record({ "teacss-rs": 10.5, "tailwind-v4": 10 }, true)));
  assert.match(tied, /no tool overtakes the leaders above; for generating the CSS, Tailwind CSS v4 and TeaCSS \(Rust engine\) are within noise of each other\./);
  const same = renderReadmeSummary(generated, "s", buildReport(record({ "teacss-rs": 10, "tailwind-v4": 20 }, true)));
  assert.match(same, /the same tools come out fastest\./);
  assert.match(renderMarkdown(generated, buildReport(record({ "teacss-rs": 10, "tailwind-v4": 20 }, true))), /## Beside it: the community corpus, run 2026-10-22T01:00:00\.000Z/);
});
