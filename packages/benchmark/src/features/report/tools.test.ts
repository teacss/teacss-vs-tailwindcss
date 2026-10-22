import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { assertSameProtocol } from "./cross.ts";
import { buildReport, renderMarkdown } from "./index.ts";
import { renderReadmeSummary } from "./readme.ts";
import { buildToolRows, buildToolsSection } from "./tools.ts";

const cell = { utilities: 1000, files: 30 };

function build(subject: string, wallMs: number, index: number): Sample {
  return { tier: "build", subject: subjectId(subject), cell, index, wallMs: wallMs + (index % 3), cssBytes: 1000, cssSha256: "h", nativeModules: [], cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1, cssGzipBytes: 100 };
}

function record(medians: Readonly<Record<string, number>>): RunRecord {
  const samples = Object.entries(medians).flatMap(([subject, ms]) => Array.from({ length: 30 }, (_, index) => build(subject, ms, index)));
  return {
    version: 1,
    specRevision: 3,
    v02Revision: 4,
    v03Revision: 2,
    pairTableVersion: 1,
    startedAt: "2026-10-23T00:00:00.000Z",
    finishedAt: "2026-10-23T01:00:00.000Z",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "Apple M2 Max", cores: 12, memoryBytes: 1, os: "o", node: "v24.14.1", bun: "1.4.3", lockfileSha256: "l", commit: "c" },
    subjects: Object.fromEntries(Object.keys(medians).map((subject) => [subject, { packages: {}, local: {} }])),
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0.1, loadShareAfter: 0.1 }],
    limiters: {},
    samples,
  };
}

const all = record({ "vite-baseline": 100, "teacss-rs": 300, "teacss-ts": 500, "tailwind-v4": 400, "rsbuild-baseline": 200, "teacss-rs-rsbuild": 700, "tailwind-v4-rsbuild": 600, "bun-baseline": 50, "teacss-rs-bun": 150, "teacss-ts-bun": 450, "tailwind-v4-bun": 250 });

test("each build tool's row takes its deltas from its own baseline, Vite first, and leaves unmeasured tools empty", () => {
  const rows = buildToolRows(buildReport(all).tables);
  assert.deepEqual(
    rows.map((row) => [row.tool, Math.round(row.baselineMs), row.css.map((entry) => (entry === undefined ? undefined : Math.round(entry.deltaMs)))]),
    [
      ["Vite", 101, [200, 400, 300]],
      ["Rsbuild", 201, [500, undefined, 400]],
      ["Bun (Bun runtime)", 51, [100, 400, 200]],
    ],
  );
  const section = buildToolsSection(buildReport(all).tables).join("\n");
  assert.match(section, /\| Rsbuild \| 1000 x 30 \| 201 ms \| 701 ms \(\+500 ms\) \| {2}\| 601 ms \(\+400 ms\) \|/);
  assert.match(section, /The baseline column compares bundlers and runtimes, not CSS tools/);
});

test("a run with Vite only has no Build tools section, so older reports render as before", () => {
  const vite = record({ "vite-baseline": 100, "teacss-rs": 300, "tailwind-v4": 400 });
  assert.deepEqual(buildToolsSection(buildReport(vite).tables), []);
  assert.ok(!renderMarkdown(buildReport(vite)).includes("Bun runtime"));
});

test("the Bun group's tables say it runs in the Bun runtime, and the protocol line names v03.1", () => {
  const markdown = renderMarkdown(buildReport(all));
  assert.match(markdown, /Protocol: spec v01\.1 revision 3 and v02\.1 revision 4 and v03\.1 revision 2;/);
  assert.match(markdown, /#### build, 1000 utilities in 30 files \(bun\)\n\nThis group runs in the Bun runtime, so it compares runtimes as well as CSS tools\./);
  assert.ok(!/#### build, 1000 utilities in 30 files \(rsbuild\)\n\nThis group runs in the Bun runtime/.test(markdown));
  assert.match(markdown, /the `-rsbuild` and `-bun` subjects use each tool's documented plugin for that build tool/);
});

test("the README says what each CSS tool adds on the other build tools and which adds less", () => {
  assert.match(
    renderReadmeSummary(buildReport(all), "s"),
    /- On other build tools: with Rsbuild, TeaCSS \(Rust engine\) adds 500 ms to the build and Tailwind CSS v4 adds 400 ms, so Tailwind CSS v4 adds less; with Bun \(Bun runtime\), TeaCSS \(Rust engine\) adds 100 ms to the build and Tailwind CSS v4 adds 200 ms, so TeaCSS \(Rust engine\) adds less\./,
  );
});

test("a build tool where the two are within noise says so instead of naming a winner", () => {
  const tied = record({ "vite-baseline": 100, "teacss-rs": 300, "tailwind-v4": 400, "bun-baseline": 50, "teacss-rs-bun": 150, "tailwind-v4-bun": 151 });
  assert.match(renderReadmeSummary(buildReport(tied), "s"), /with Bun \(Bun runtime\), TeaCSS \(Rust engine\) adds 100 ms to the build and Tailwind CSS v4 adds 101 ms, about the same\./);
});

test("records of different v03.1 revisions are not compared", () => {
  assert.throws(() => assertSameProtocol(all, { ...all, v03Revision: 1 }), /v03\.1 revision 2 and 1/);
});
