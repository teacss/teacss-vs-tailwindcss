import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubjectId, SubjectVersions } from "@bench/infrastructure";
import type { DevSize, EngineScenario } from "../contract/index.ts";
import type { CommunityPool } from "../corpus/community.ts";
import type { EnvironmentRecord } from "../features/environment/index.ts";
import type { PriceRecord } from "../features/price/index.ts";
import type { ProfileSummary } from "../features/profile/index.ts";

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
  /** Absent in records written before spec v02.1. */
  readonly rules?: number;
  readonly declarations?: number;
}

export type Sample =
  | (SampleBase & { readonly tier: "engine"; readonly scenario: EngineScenario; readonly cpuMs?: number; readonly rssBytes?: number; readonly heapBytes?: number })
  | (SampleBase & { readonly tier: "dev"; readonly size: DevSize; readonly polls: number })
  | (SampleBase & { readonly tier: "build"; readonly cpuUserMs: number; readonly cpuSystemMs: number; readonly maxRssBytes: number; readonly cssGzipBytes: number });

export interface CellRecord {
  readonly cell: Cell;
  readonly corpusHash: string;
  readonly loadShareBefore: number;
  readonly loadShareAfter: number;
}

export interface RunRecord {
  readonly version: typeof RECORD_VERSION;
  /** Revision of spec v01.1. */
  readonly specRevision: number;
  /** Revision of spec v02.1; absent in records written before it. */
  readonly v02Revision?: number;
  /** The equivalence checks run on every cell's corpus before measuring; absent before spec v02.1. */
  readonly verification?: { readonly cells: number; readonly cases: number; readonly checks: number };
  readonly pairTableVersion: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly seed: number;
  readonly samplesPerCell: number;
  readonly allowBusy: boolean;
  readonly environment: EnvironmentRecord;
  readonly subjects: Readonly<Record<string, SubjectVersions>>;
  readonly cells: readonly CellRecord[];
  readonly samples: readonly Sample[];
  /** One uncounted `--cpu-prof` pass per subject and tier on the largest cell, keyed `subject/tier`. */
  readonly limiters: Readonly<Record<string, ProfileSummary>>;
  /** Spec v02.1 price of Rust; absent when the run skipped it or predates it. */
  readonly price?: PriceRecord;
  /** Spec v02.1 community corpus; absent for the generated corpus. `kept` holds only its size here. */
  readonly community?: Omit<CommunityPool, "kept"> & { readonly kept: number };
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
