import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import type { Sample } from "../../persistence/index.ts";
import { workRows, workTable } from "./work.ts";

function build(subject: string, cell: { utilities: number; files: number }, wallMs: number, bytes: number, rules: number | undefined): Sample {
  return { tier: "build", subject: subjectId(subject), cell, index: 0, wallMs, cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1, cssBytes: bytes, cssGzipBytes: bytes / 10, cssSha256: "h", nativeModules: [], ...(rules === undefined ? {} : { rules, declarations: rules * 2 }) };
}

test("work rows describe each subject's largest-cell build, biggest output first, without the baseline", () => {
  const big = { utilities: 20, files: 3 };
  const rows = workRows({ samples: [build("a", { utilities: 1, files: 1 }, 1, 1, 1), build("a", big, 100, 204_800, 50), build("b", big, 300, 1_024_000, 400), build("vite-baseline", big, 50, 0, 0)] });
  assert.deepEqual(
    rows.map((row) => [row.subject, row.rules, row.msPer100Kb]),
    [
      ["b", 400, 30],
      ["a", 50, 50],
    ],
  );
  assert.match(workTable(rows, { b: "Tool B" }).join("\n"), /\| Tool B \| 1000 KB \| 100 KB \| 400 \| 800 \| 30 ms \|/);
});

test("records without output counts produce no work table", () => {
  assert.deepEqual(workRows({ samples: [build("a", { utilities: 1, files: 1 }, 1, 1, undefined)] }), []);
});

test("the README names the tool that emits more CSS, and says TeaCSS for either engine", async () => {
  const { buildReport } = await import("./index.ts");
  const { renderReadmeSummary } = await import("./readme.ts");
  const cell = { utilities: 10, files: 3 };
  const samples: Sample[] = [];
  for (let index = 0; index < 5; index++) samples.push(build("tailwind-v4", cell, 100 + index, 150_000, 1566), build("teacss-rs", cell, 200 + index, 100_000, 928), build("teacss-ts", cell, 300 + index, 100_000, 928));
  const record = {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 5,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 1, memoryBytes: 1, os: "o", node: "v24", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0, loadShareAfter: 0 }],
    limiters: {},
    samples,
  } as const;
  assert.match(renderReadmeSummary(buildReport(record), "s"), /- For the same classes, Tailwind CSS v4 emits 1\.5× the CSS of TeaCSS: 1,566 rules against 928\./);
});

test("the README compares each tool's out-of-the-box build with its tuned one", async () => {
  const { buildReport } = await import("./index.ts");
  const { renderReadmeSummary } = await import("./readme.ts");
  const cell = { utilities: 10, files: 3 };
  const samples: Sample[] = [];
  for (let index = 0; index < 5; index++) samples.push(build("tailwind-v4", cell, 100, 1, 1), build("tailwind-v4-default", cell, 110, 1, 1), build("teacss-rs", cell, 200, 1, 1), build("teacss-rs-default", cell, 200, 1, 1));
  const record = {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 5,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 1, memoryBytes: 1, os: "o", node: "v24", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0, loadShareAfter: 0 }],
    limiters: {},
    samples,
  } as const;
  const text = renderReadmeSummary(buildReport(record), "s");
  assert.match(text, /- With each tool's out-of-the-box entry instead of the tuned one, the build takes 1\.00× as long for TeaCSS \(Rust engine\) and 1\.10× as long for Tailwind CSS v4/);
  assert.ok(!text.includes("tailwind-v4-default |"), "variants stay out of the tables");
});

test("verdicts are computed within a configuration group, so a faster variant cannot become the README's reference", async () => {
  const { buildReport } = await import("./index.ts");
  const { renderReadmeSummary } = await import("./readme.ts");
  const cell = { utilities: 10, files: 3 };
  const samples: Sample[] = [];
  for (let index = 0; index < 30; index++) samples.push(build("tailwind-v4", cell, 100 + (index % 3), 1, 1), build("teacss-rs", cell, 200 + (index % 3), 1, 1), build("teacss-rs-default", cell, 50 + (index % 3), 1, 1));
  const record = {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 1, memoryBytes: 1, os: "o", node: "v24", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [{ cell, corpusHash: "x", loadShareBefore: 0, loadShareAfter: 0 }],
    limiters: {},
    samples,
  } as const;
  const model = buildReport(record);
  assert.deepEqual(
    model.tables.map((table) => `${table.group}:${table.fastest}`),
    ["main:tailwind-v4", "default-config:teacss-rs-default"],
  );
  assert.match(renderReadmeSummary(model, "s"), /\| TeaCSS \(Rust engine\) \| 201 ms \(2\.0× slower\) \|/);
});

test("the file-count takeaway survives a run that also measured the out-of-the-box configuration", async () => {
  const { buildReport } = await import("./index.ts");
  const { renderReadmeSummary } = await import("./readme.ts");
  const samples: Sample[] = [];
  for (const files of [3, 300]) {
    const cell = { utilities: 10, files };
    for (let index = 0; index < 30; index++) {
      samples.push(build("vite-baseline", cell, 100 + (index % 3), 0, 0), build("tailwind-v4", cell, 200 + (index % 3), 1, 1), build("teacss-ts", cell, (files === 3 ? 200 : 500) + (index % 3), 1, 1), build("teacss-ts-default", cell, 210 + (index % 3), 1, 1));
    }
  }
  const record = {
    version: 1,
    specRevision: 3,
    pairTableVersion: 1,
    startedAt: "2026-10-22T00:00:00.000Z",
    finishedAt: "x",
    seed: 1,
    samplesPerCell: 30,
    allowBusy: false,
    environment: { host: "h", cpu: "c", cores: 1, memoryBytes: 1, os: "o", node: "v24", bun: "1", lockfileSha256: "l", commit: "c" },
    subjects: {},
    cells: [3, 300].map((files) => ({ cell: { utilities: 10, files }, corpusHash: "x", loadShareBefore: 0, loadShareAfter: 0 })),
    limiters: {},
    samples,
  } as const;
  assert.match(renderReadmeSummary(buildReport(record), "s"), /TeaCSS \(TypeScript engine\) gets 4\.0× slower when the same classes are spread over 300 files instead of 3/);
});
