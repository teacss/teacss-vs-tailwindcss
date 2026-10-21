import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import { captureEnvironment } from "../features/environment/index.ts";
import { type RunRecord, readRunRecord, writeRunRecord } from "./index.ts";

test("a run record round-trips through the results directory under a date-and-host name", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-results-"));
  try {
    const record: RunRecord = {
      version: 1,
      specRevision: 1,
      pairTableVersion: 1,
      startedAt: "2026-10-21T10:00:00.000Z",
      finishedAt: "2026-10-21T10:05:00.000Z",
      seed: 1,
      samplesPerCell: 1,
      allowBusy: false,
      environment: captureEnvironment(process.cwd()),
      cells: [{ cell: { utilities: 1, files: 1 }, corpusHash: "abc", loadShareBefore: 0.1, loadShareAfter: 0.1 }],
      subjects: { fake: { packages: { fake: "0.0.0" } } },
      samples: [{ tier: "engine", scenario: "cold", subject: subjectId("fake"), cell: { utilities: 1, files: 1 }, index: 0, wallMs: 1.5, cssBytes: 10, cssSha256: "abc", nativeModules: [] }],
    };
    const path = writeRunRecord(dir, record);
    assert.match(path, /2026-10-21T10-00-00-[^/]+\.json$/);
    assert.deepEqual(readRunRecord(path), JSON.parse(readFileSync(path, "utf8")));
    assert.ok(record.environment.cores > 0 && record.environment.lockfileSha256.length === 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file from another record version is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-results-"));
  try {
    const path = join(dir, "old.json");
    writeFileSync(path, JSON.stringify({ version: 0, samples: [] }));
    assert.throws(() => readRunRecord(path), /not a version 1 run record/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
