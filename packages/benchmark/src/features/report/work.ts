import type { RunRecord, Sample } from "../../persistence/index.ts";
import { summarize } from "./statistics.ts";

export interface WorkRow {
  readonly subject: string;
  readonly bytes: number;
  readonly gzipBytes: number;
  readonly rules: number;
  readonly declarations: number;
  readonly medianMs: number;
  /** Build time per 100 KB of output, as context for the size difference, not a ranking. */
  readonly msPer100Kb: number;
}

/** Spec v02.1 §Report, work produced: what each subject's production build emits at the largest cell. */
export function workRows(record: Pick<RunRecord, "samples">): WorkRow[] {
  const builds = record.samples.filter((sample): sample is Extract<Sample, { tier: "build" }> => sample.tier === "build" && !sample.subject.endsWith("-baseline") && sample.rules !== undefined);
  if (builds.length === 0) return [];
  const largest = builds.reduce((best, sample) => (sample.cell.utilities * sample.cell.files > best.cell.utilities * best.cell.files ? sample : best)).cell;
  const bySubject = new Map<string, Extract<Sample, { tier: "build" }>[]>();
  for (const sample of builds) {
    if (sample.cell.utilities !== largest.utilities || sample.cell.files !== largest.files) continue;
    bySubject.set(sample.subject, [...(bySubject.get(sample.subject) ?? []), sample]);
  }
  return [...bySubject.entries()]
    .map(([subject, samples]) => {
      const first = samples[0] as Extract<Sample, { tier: "build" }>;
      const medianMs = summarize(samples.map((sample) => sample.wallMs)).median;
      return { subject, bytes: first.cssBytes, gzipBytes: first.cssGzipBytes, rules: first.rules ?? 0, declarations: first.declarations ?? 0, medianMs, msPer100Kb: medianMs / (first.cssBytes / 102_400) };
    })
    .sort((left, right) => right.bytes - left.bytes);
}

export function workTable(rows: readonly WorkRow[], names: Readonly<Record<string, string>>): string[] {
  if (rows.length === 0) return [];
  return [
    "| | CSS | gzip | Rules | Declarations | Build time per 100 KB |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${names[row.subject] ?? row.subject} | ${(row.bytes / 1024).toFixed(0)} KB | ${(row.gzipBytes / 1024).toFixed(0)} KB | ${row.rules.toLocaleString("en-US")} | ${row.declarations.toLocaleString("en-US")} | ${row.msPer100Kb.toFixed(0)} ms |`),
  ];
}
