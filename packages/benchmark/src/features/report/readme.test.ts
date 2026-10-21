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
      for (const size of [10, 100] as const) {
        const ms = size === 10 ? 300 : 500;
        samples.push({ ...sample("teacss-rs", "engine", cell, 2 * ms + (index % 3), index), tier: "dev", size, polls: 3 } as unknown as Sample, { ...sample("tailwind-v4", "engine", cell, ms + (index % 3), index), tier: "dev", size, polls: 3 } as unknown as Sample);
      }
      for (const [scenario, ms] of [
        ["incremental-10", 40],
        ["incremental-100", 60],
      ] as const) {
        samples.push({ ...sample("teacss-rs", "engine", cell, ms + (index % 3), index), scenario } as Sample, { ...sample("tailwind-v4", "engine", cell, 2 * ms + (index % 3), index), scenario } as Sample);
      }
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

test("the summary is two small tables, a few takeaways and the links, in plain words", () => {
  const text = renderReadmeSummary(buildReport(record()), "2026-10-21T09-19-14-mac");
  assert.match(text, /### Results from 2026-10-21/);
  assert.match(text, /\*\*Generating the CSS for 10,000 classes\*\* \(median of 30 runs\)/);
  assert.match(text, /\| TeaCSS \(Rust engine\) \| 10\.00 s \|\n\| Tailwind CSS v4 \| 15\.00 s \(1\.5× slower\) \|/);
  assert.match(text, /\*\*Building a Vite project with those classes in 30 files\*\* \(median of 30 runs; the project builds in 101 ms with no CSS tool\)/);
  assert.match(text, /\| Tailwind CSS v4 \| 30\.10 s \| 30\.00 s \|/);
  assert.match(text, /- TeaCSS \(Rust engine\) generates the CSS fastest; Tailwind CSS v4 finishes the whole build fastest\./);
  assert.match(text, /- For TeaCSS \(Rust engine\), generating the CSS is only 2 % of the CSS cost in the build/);
  assert.match(text, /- TeaCSS \(Rust engine\) gets 10\.0× slower when the same classes are spread over 30 files instead of 3; the other tools do not care/);
  assert.match(text, /- @teacss\/engine 0\.8\.5-alpha\.4, tailwindcss 4\.3\.3; one Apple M2 Max, Node v24\.14\.1\./);
  assert.match(text, /\[Full report\]\(docs\/reports\/2026-10-21T09-19-14-mac\.md\) · \[audit\]/);
  assert.ok(!text.includes("Per 1,000"));
  assert.match(text, /\*\*Adding new classes to an engine\*\* that already holds those 10,000/);
  assert.match(text, /\*\*Saving a new file in the Vite dev server\*\* with 10,000 classes already in 30 files/);
  assert.match(text, /\| Tailwind CSS v4 \| 301 ms \| 501 ms \|\n\| TeaCSS \(Rust engine\) \| 601 ms \(2\.0× slower\) \| 1\.00 s \(2\.0× slower\) \|/);
  assert.match(text, /\| TeaCSS \(Rust engine\) \| 41 ms \| 61 ms \|\n\| Tailwind CSS v4 \| 81 ms \(2\.0× slower\) \| 121 ms \(2\.0× slower\) \|/);
  assert.equal(text, renderReadmeSummary(buildReport(record()), "2026-10-21T09-19-14-mac"));
});

test("updateReadme replaces the marked block and appends one when there is none", () => {
  const summary = `${README_START}\nnew\n${README_END}`;
  assert.equal(updateReadme(`# T\n\n${README_START}\nold\n${README_END}\n\n## After\n`, summary), `# T\n\n${README_START}\nnew\n${README_END}\n\n## After\n`);
  assert.equal(updateReadme("# T\n", summary), `# T\n\n${summary}\n`);
});
