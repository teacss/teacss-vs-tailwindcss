import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { RunRecord, Sample } from "../../persistence/index.ts";
import { buildReport } from "./index.ts";
import { README_END, README_START, renderReadmeSummary, updateReadme } from "./readme.ts";

function sample(subject: string, tier: "engine" | "build", cell: { utilities: number; files: number }, wallMs: number, index: number): Sample {
  const base = { subject: subjectId(subject), cell, index, wallMs, cssBytes: 1000 * cell.utilities, cssSha256: "h", nativeModules: [] };
  return tier === "build" ? { ...base, tier, cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1, cssGzipBytes: 100 * cell.utilities } : { ...base, tier, scenario: "warm" };
}

function record(): RunRecord {
  const samples: Sample[] = [];
  const cells = [
    { utilities: 1000, files: 3 },
    { utilities: 10000, files: 3 },
    { utilities: 10000, files: 30 },
  ];
  for (const cell of cells) {
    for (let index = 0; index < 30; index++) {
      const scale = cell.utilities / 10;
      samples.push(sample("teacss-rs", "engine", cell, 10 * scale + (index % 3), index), sample("tailwind-v4", "engine", cell, 15 * scale + (index % 3), index));
      samples.push(sample("vite-baseline", "build", cell, 100 + (index % 3), index), sample("tailwind-v4", "build", cell, 100 + 30 * scale + (index % 3), index), sample("teacss-rs", "build", cell, 100 + 60 * scale * (cell.files / 3) + (index % 3), index));
    }
  }
  return {
    version: 1,
    specRevision: 2,
    pairTableVersion: 1,
    startedAt: "2026-10-21T09:19:14.627Z",
    finishedAt: "2026-10-21T09:43:57.703Z",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "Apple M2 Max", cores: 12, memoryBytes: 1, os: "o", node: "v24.14.1", bun: "1.4.3", lockfileSha256: "l", commit: "c" },
    subjects: { "teacss-rs": { packages: { "@teacss/engine": "0.8.5-alpha.4" }, local: {} }, "tailwind-v4": { packages: { tailwindcss: "4.3.3" }, local: {} } },
    cells: cells.map((cell) => ({ cell, corpusHash: "x", loadShareBefore: 0.1, loadShareAfter: 0.1 })),
    limiters: {},
    samples,
  };
}

test("the summary says who was fastest, by how much, and how the cost grows, in plain words", () => {
  const text = renderReadmeSummary(buildReport(record()), "2026-10-21T09-19-14-mac");
  assert.match(text, /### Results of the run on 2026-10-21/);
  assert.match(text, /\| TeaCSS with its Rust engine \| 10\.00 s \| 1\.00 s \| fastest \|/);
  assert.match(text, /\| Tailwind CSS v4 \| 15\.00 s \| 1\.50 s \| 1\.5× slower \|/);
  assert.match(text, /Every sample of Tailwind CSS v4 was slower than every sample of TeaCSS with its Rust engine\./);
  assert.match(text, /Going from 1,000 to 10,000 classes \(10\.0× the work\) made TeaCSS with its Rust engine 10\.0× slower, so its cost grows about in step with the number of classes/);
  assert.match(text, /Tailwind CSS v4 finished the build fastest\. Every sample of TeaCSS with its Rust engine was slower than every sample of Tailwind CSS v4\./);
  assert.match(text, /Generating the CSS is only part of that cost: 50 % for Tailwind CSS v4 and 2 % for TeaCSS with its Rust engine\./);
  assert.match(text, /over 30 files instead of 3 changed each tool's CSS cost by: Tailwind CSS v4 1\.0×, TeaCSS with its Rust engine 10\.0×/);
  assert.match(text, /\[report\]\(docs\/reports\/2026-10-21T09-19-14-mac\.md\)/);
  assert.equal(text, renderReadmeSummary(buildReport(record()), "2026-10-21T09-19-14-mac"));
});

test("updateReadme replaces the marked block and appends one when there is none", () => {
  const summary = `${README_START}\nnew\n${README_END}`;
  assert.equal(updateReadme(`# T\n\n${README_START}\nold\n${README_END}\n\n## After\n`, summary), `# T\n\n${README_START}\nnew\n${README_END}\n\n## After\n`);
  assert.equal(updateReadme("# T\n", summary), `# T\n\n${summary}\n`);
});
