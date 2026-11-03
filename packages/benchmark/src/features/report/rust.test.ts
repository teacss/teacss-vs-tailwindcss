import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { buildReport, renderMarkdown } from "./index.ts";
import { renderReadmeSummary } from "./readme.ts";
import { hasV02Data, identicalOutputs, priceTable, valueRows } from "./rust.ts";

const cell = { utilities: 100, files: 3 };

function engine(subject: string, scenario: "warm" | "incremental-10", wallMs: number, index: number, hash = "h"): Sample {
  return { tier: "engine", scenario, subject: subjectId(subject), cell, index, wallMs, cpuMs: wallMs * 1.2, rssBytes: 200 * 1048576 + index, heapBytes: (subject === "teacss-ts" ? 90 : 30) * 1048576, cssBytes: 1, cssSha256: hash, nativeModules: [], rules: 10, declarations: 20 };
}

function record(rsBuildHash = "b"): RunRecord {
  const samples: Sample[] = [];
  for (let index = 0; index < 30; index++) {
    samples.push(engine("teacss-ts", "warm", 300 + (index % 3), index), engine("teacss-rs", "warm", 100 + (index % 3), index));
    samples.push(engine("teacss-ts", "incremental-10", 90 + (index % 3), index, `i${index % 10}`), engine("teacss-rs", "incremental-10", 60 + (index % 3), index, `i${index % 10}`));
    for (const [subject, ms, hash] of [
      ["teacss-ts", 2000, "b"],
      ["teacss-rs", 1000, rsBuildHash],
      ["vite-baseline", 250, "z"],
    ] as const) {
      samples.push({ tier: "build", subject: subjectId(subject), cell, index, wallMs: ms + (index % 3), cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1, cssBytes: 1, cssGzipBytes: 1, cssSha256: hash, nativeModules: [], rules: 10, declarations: 20 });
    }
  }
  return {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "2026-10-22T00:10:00.000Z",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "Apple M2 Max", cores: 12, memoryBytes: 1, os: "o", node: "v24.14.1", bun: "1.4.3", lockfileSha256: "l", commit: "c" },
    subjects: { "teacss-ts": { packages: {}, local: {} }, "teacss-rs": { packages: {}, local: {} } },
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0.1, loadShareAfter: 0.1 }],
    limiters: { "teacss-ts/engine": { totalMs: 1, top: [], gcShare: 0.1 }, "teacss-rs/engine": { totalMs: 1, top: [], gcShare: 0.03 } },
    price: {
      coverageSource: "/examples",
      subjects: {
        "teacss-rs": {
          native: { package: "@teacss/engine-darwin-arm64", file: "e.node", path: "/e.node", bytes: 8.2 * 1048576, platformPackages: 8 },
          nativeLoadMs: [1.1, 1.2, 1.1],
          install: { packages: {}, installMs: [3300], installedBytes: 43 * 1048576 },
          coverage: [
            { entry: "/a.css", served: true, reason: undefined },
            { entry: "/b.css", served: false, reason: "rules at rules" },
          ],
        },
        "tailwind-v4": { native: { package: "@tailwindcss/oxide-darwin-arm64", file: "o.node", path: "/o.node", bytes: 2.8 * 1048576, platformPackages: 12 }, nativeLoadMs: [1.0], install: undefined, coverage: [] },
      },
    },
    samples,
  };
}

test("value rows compare the engines on speed, CPU, memory, GC and spread", () => {
  const rows = new Map(valueRows(record()).map((row) => [row.label, row]));
  assert.equal(rows.get("Generate the CSS (warm process)")?.ts, 301);
  assert.equal(rows.get("Generate the CSS (warm process)")?.rs, 101);
  assert.equal(rows.get("Add 10 classes to a running engine")?.rs, 61);
  assert.equal(rows.get("JavaScript heap after generating")?.ts, 90 * 1048576);
  assert.equal(rows.get("Resident memory after the call (highest)")?.rs, 200 * 1048576 + 29);
  assert.equal(rows.get("Time spent in garbage collection")?.rs, 0.03);
  assert.equal(rows.has("Dev server: save a file with 10 new classes"), false);
});

test("identical outputs count warm and build groups, not incremental ones", () => {
  assert.deepEqual(identicalOutputs(record()), { identical: 2, compared: 2 });
  assert.deepEqual(identicalOutputs(record("other")), { identical: 1, compared: 2 });
});

test("the price table lists native size, packages, load, install and coverage", () => {
  const lines = priceTable(record(), { "teacss-rs": "TeaCSS (Rust engine)", "tailwind-v4": "Tailwind CSS v4" }).join("\n");
  assert.match(lines, /\| Native file for this platform \| 8\.2 MB \(@teacss\/engine-darwin-arm64\) \| 2\.8 MB \(@tailwindcss\/oxide-darwin-arm64\) \|/);
  assert.match(lines, /\| Install from an empty cache \| 3\.30 s \| not measured \|/);
  assert.match(lines, /\| Example configurations the native engine serves \| 1 of 2 \| {2}\|/);
});

test("the full report and README carry the Rust sections only for v02 records", () => {
  const markdown = renderMarkdown(buildReport(record()));
  assert.match(markdown, /## The value of Rust/);
  assert.match(markdown, /\| Generate the CSS \(warm process\) \| 301 ms \| 101 ms \| 3\.0× better \|/);
  assert.match(markdown, /Not served: \/b\.css \(rules at rules\)/);
  const readme = renderReadmeSummary(buildReport(record()), "s");
  assert.match(readme, /\*\*What the Rust engine changes for TeaCSS\*\*/);
  assert.match(readme, /\| Resident memory after generating \| 200\.0 MB \| 200\.0 MB \(no measurable difference\) \|/);
  assert.match(markdown, /\| Time spent in garbage collection \| 10 % \| 3 % \| single measurement, no verdict \|/);
  assert.match(markdown, /\| Resident memory after generating \| 200\.0 MB \| 200\.0 MB \| no measurable difference \|/);
  assert.match(markdown, /\| JavaScript heap after generating \| 90\.0 MB \| 30\.0 MB \| not comparable: the Rust engine's memory is outside the heap \|/);
  assert.match(readme, /\| Same CSS output \| \| byte-identical in every measured case \|/);
  assert.match(readme, /The price of the Rust engine is a native file of 8\.2 MB per platform \(8 platform packages\), loaded in 1\.1 ms\. It served 1 of the 2 example configurations it was given; the rest fall back to the TypeScript engine\./);
  assert.match(renderReadmeSummary(buildReport({ ...record(), specRevision: 9 }), "s"), /It served 1 of the 2 example configurations it was given; the rest run only on the TypeScript ecosystem, since 0\.10 has no fallback\./);
  const old = { ...record(), samples: record().samples.map((sample) => (sample.tier === "engine" ? ({ ...sample, cpuMs: undefined, rssBytes: undefined, heapBytes: undefined } as unknown as Sample) : sample)) };
  assert.equal(hasV02Data(old), false);
  assert.ok(!renderMarkdown(buildReport(old)).includes("value of Rust"));
});
