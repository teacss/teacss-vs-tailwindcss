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
