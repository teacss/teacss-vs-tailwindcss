import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubjectId, SubjectVersions } from "@bench/infrastructure";
import type { EngineScenario } from "../contract/index.ts";
import type { EnvironmentRecord } from "../features/environment/index.ts";

export const RECORD_VERSION = 1;

export interface Cell {
  readonly utilities: number;
  readonly files: number;
}

interface SampleBase {
  readonly subject: SubjectId;
  readonly cell: Cell;
  readonly index: number;
  readonly wallMs: number;
  readonly cssBytes: number;
  readonly cssSha256: string;
  readonly nativeModules: readonly string[];
}

export type Sample = (SampleBase & { readonly tier: "engine"; readonly scenario: EngineScenario }) | (SampleBase & { readonly tier: "build"; readonly cpuUserMs: number; readonly cpuSystemMs: number; readonly maxRssBytes: number; readonly cssGzipBytes: number });

export interface RunRecord {
  readonly version: typeof RECORD_VERSION;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly environment: EnvironmentRecord;
  readonly subjects: Readonly<Record<string, SubjectVersions>>;
  readonly samples: readonly Sample[];
}

export function recordFileName(record: RunRecord): string {
  return `${record.startedAt.replaceAll(":", "-").slice(0, 19)}-${record.environment.host}.json`;
}

export function writeRunRecord(dir: string, record: RunRecord): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, recordFileName(record));
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

export function readRunRecord(path: string): RunRecord {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== RECORD_VERSION) throw new Error(`${path}: not a version ${RECORD_VERSION} run record`);
  if (!("samples" in parsed) || !Array.isArray(parsed.samples) || !("environment" in parsed)) throw new Error(`${path}: run record without samples or environment`);
  return parsed as RunRecord;
}
