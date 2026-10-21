import type { RunRecord } from "../../persistence/index.ts";
import type { CellTable, ReportModel, Series } from "./index.ts";

export type Agreement = "same leader" | "tie" | "different leader";

export interface CrossComparison {
  readonly series: Series;
  readonly cell: string;
  readonly local: string;
  readonly other: string;
  readonly agreement: Agreement;
}

const BASELINE = "vite-baseline";

function leader(table: CellTable): string | undefined {
  return table.rows.filter((row) => row.subject !== BASELINE).sort((left, right) => left.wall.median - right.wall.median)[0]?.subject;
}

type Protocol = Pick<RunRecord, "specRevision" | "v02Revision" | "cells" | "community">;

/** Refuses two records that ran different revisions of either spec. */
export function assertSameProtocol(local: Protocol, other: Protocol): void {
  if (local.specRevision !== other.specRevision || local.v02Revision !== other.v02Revision) {
    throw new Error(`the records ran different protocols (v01.1 revision ${local.specRevision} and ${other.specRevision}, v02.1 revision ${local.v02Revision ?? "none"} and ${other.v02Revision ?? "none"})`);
  }
}

/** Refuses a second machine's record unless it ran the same protocol on the same corpora, sharing at least one cell. */
export function assertComparable(local: Protocol, other: Protocol): void {
  assertSameProtocol(local, other);
  if ((local.community === undefined) !== (other.community === undefined)) throw new Error("one record measured the community corpus and the other the generated one");
  const hashes = new Map(other.cells.map((entry) => [`${entry.cell.utilities}x${entry.cell.files}`, entry.corpusHash]));
  let shared = 0;
  for (const entry of local.cells) {
    const key = `${entry.cell.utilities}x${entry.cell.files}`;
    const hash = hashes.get(key);
    if (hash === undefined) continue;
    if (hash !== entry.corpusHash) throw new Error(`cell ${key} measured different corpora (${entry.corpusHash.slice(0, 12)} and ${hash.slice(0, 12)})`);
    shared++;
  }
  if (shared === 0) throw new Error("the records share no cell, so there is nothing to compare");
}

/**
 * Spec v02.1 §Cross-check: per series and cell both machines measured, whether they name the same
 * fastest subject. A different leader whose lead is within noise on the other machine is a tie.
 */
export function crossComparisons(local: ReportModel, other: ReportModel): CrossComparison[] {
  const comparisons: CrossComparison[] = [];
  for (const table of local.tables.filter((entry) => entry.group === "main")) {
    const cell = `${table.cell.utilities}x${table.cell.files}`;
    const twin = other.tables.find((candidate) => candidate.group === "main" && candidate.series === table.series && `${candidate.cell.utilities}x${candidate.cell.files}` === cell);
    const here = leader(table);
    const there = twin === undefined ? undefined : leader(twin);
    if (twin === undefined || here === undefined || there === undefined) continue;
    const verdict = twin.verdicts.find((entry) => entry.subject === here)?.verdict;
    const agreement: Agreement = here === there ? "same leader" : verdict?.kind === "differs" ? "different leader" : "tie";
    comparisons.push({ series: table.series, cell, local: here, other: there, agreement });
  }
  return comparisons;
}

export function crossLines(local: ReportModel, other: ReportModel, tables: (model: ReportModel) => string[]): string[] {
  const comparisons = crossComparisons(local, other);
  const environment = other.record.environment;
  const count = (agreement: Agreement) => comparisons.filter((entry) => entry.agreement === agreement).length;
  const differing = comparisons.filter((entry) => entry.agreement === "different leader");
  return [
    "## Second machine",
    "",
    `The same protocol and corpora on ${environment.cpu} (${environment.cores} cores, ${environment.os}, Node ${environment.node}), run ${other.record.startedAt}. This is a cross-check, not the headline: shared CI machines are noisy.`,
    "",
    `Of ${comparisons.length} comparisons, the two machines name the same fastest tool in ${count("same leader")}, tie in ${count("tie")} and disagree in ${count("different leader")}.${differing.length === 0 ? "" : ` They disagree on: ${differing.map((entry) => `${entry.series} at ${entry.cell} (${entry.local} here, ${entry.other} there)`).join("; ")}.`}`,
    "",
    ...tables(other),
  ];
}
