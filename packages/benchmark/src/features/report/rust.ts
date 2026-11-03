import type { RunRecord, Sample } from "../../persistence/index.ts";
import type { Series } from "./index.ts";
import { compare, summarize } from "./statistics.ts";

export const TS = "teacss-ts";
export const RS = "teacss-rs";

const seconds = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 10 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(1)} ms`);
const megabytes = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`;
const median = (values: readonly number[]): number | undefined => (values.length === 0 ? undefined : summarize(values).median);

function seriesOf(sample: Sample): Series {
  if (sample.tier === "build") return "build";
  if (sample.tier === "dev") return `dev/+${sample.size}`;
  return `engine/${sample.scenario}`;
}

function largestCellKey(samples: readonly Sample[]): string | undefined {
  const cells = samples.map((sample) => sample.cell);
  const largest = cells.reduce<(typeof cells)[number] | undefined>((best, cell) => (best === undefined || cell.utilities * cell.files > best.utilities * best.files ? cell : best), undefined);
  return largest === undefined ? undefined : `${largest.utilities}x${largest.files}`;
}

export interface ValueRow {
  readonly label: string;
  readonly ts: number | undefined;
  readonly rs: number | undefined;
  readonly format: (value: number) => string;
  /** The samples behind `ts` and `rs`; absent for a single measurement, which supports no verdict. */
  readonly samples?: { readonly ts: readonly number[]; readonly rs: readonly number[] };
  /** Why the two values are context rather than a comparison, shown in place of a verdict. */
  readonly notComparable?: string;
}

/** Whether the record has the per-call resource fields spec v02.1 added; older records render as before. */
export function hasV02Data(record: Pick<RunRecord, "samples">): boolean {
  return record.samples.some((sample) => sample.tier === "engine" && sample.cpuMs !== undefined);
}

/** Spec v02.1 §Report, the value of Rust: teacss-rs against teacss-ts at the largest cell. */
export function valueRows(record: RunRecord): ValueRow[] {
  const cell = largestCellKey(record.samples);
  const at = (subject: string, series: Series): Sample[] => record.samples.filter((sample) => sample.subject === subject && seriesOf(sample) === series && `${sample.cell.utilities}x${sample.cell.files}` === cell);
  const measured = (pick: (sample: Sample) => number | undefined, series: Series) => {
    const values = (subject: string) =>
      at(subject, series)
        .map(pick)
        .filter((value): value is number => value !== undefined);
    const ts = values(TS);
    const rs = values(RS);
    return { ts: median(ts), rs: median(rs), samples: { ts, rs } };
  };
  const wall = (series: Series) => measured((sample) => sample.wallMs, series);
  const engineField = (pick: (sample: Extract<Sample, { tier: "engine" }>) => number | undefined) => measured((sample) => (sample.tier === "engine" ? pick(sample) : undefined), "engine/warm");
  const highest = (subject: string): number | undefined => {
    const values = at(subject, "engine/warm").flatMap((sample) => (sample.tier === "engine" && sample.rssBytes !== undefined ? [sample.rssBytes] : []));
    return values.length === 0 ? undefined : Math.max(...values);
  };
  const spread = (subject: string): number | undefined => {
    const values = at(subject, "engine/warm").map((sample) => sample.wallMs);
    if (values.length === 0) return undefined;
    const summary = summarize(values);
    return summary.iqr / summary.median;
  };
  const gc = (subject: string): number | undefined => record.limiters[`${subject}/engine`]?.gcShare;
  const rows: ValueRow[] = [
    { label: "Generate the CSS (warm process)", ...wall("engine/warm"), format: seconds },
    { label: "Add 10 classes to a running engine", ...wall("engine/incremental-10"), format: seconds },
    { label: "Add 100 classes to a running engine", ...wall("engine/incremental-100"), format: seconds },
    { label: "Dev server: save a file with 10 new classes", ...wall("dev/+10"), format: seconds },
    { label: "Vite production build", ...wall("build"), format: seconds },
    { label: "CPU time per warm generation", ...engineField((sample) => sample.cpuMs), format: seconds },
    { label: "Resident memory after generating", ...engineField((sample) => sample.rssBytes), format: megabytes },
    { label: "JavaScript heap after generating", ...engineField((sample) => sample.heapBytes), format: megabytes, notComparable: "not comparable: the Rust engine's memory is outside the heap" },
    { label: "Resident memory after the call (highest)", ts: highest(TS), rs: highest(RS), format: megabytes },
    { label: "Time spent in garbage collection", ts: gc(TS), rs: gc(RS), format: (value) => `${(value * 100).toFixed(0)} %` },
    { label: "Run-to-run spread (IQR over median)", ts: spread(TS), rs: spread(RS), format: (value) => `${(value * 100).toFixed(1)} %` },
  ];
  return rows.filter((row) => row.ts !== undefined || row.rs !== undefined);
}

/**
 * Groups of samples (series and cell) where both engines produced the same bytes, out of those both measured;
 * `only` keeps the engine tier or the Vite pipeline tiers.
 */
export function identicalOutputs(record: Pick<RunRecord, "samples">, only?: "engine" | "pipeline"): { identical: number; compared: number } {
  const hashes = new Map<string, { ts?: string; rs?: string }>();
  for (const sample of record.samples) {
    if (sample.subject !== TS && sample.subject !== RS) continue;
    if (sample.tier === "engine" && sample.scenario !== "cold" && sample.scenario !== "warm") continue;
    if (only !== undefined && (sample.tier === "engine") !== (only === "engine")) continue;
    const key = `${seriesOf(sample)}|${sample.cell.utilities}x${sample.cell.files}`;
    const entry = hashes.get(key) ?? {};
    entry[sample.subject === TS ? "ts" : "rs"] = sample.cssSha256;
    hashes.set(key, entry);
  }
  const both = [...hashes.values()].filter((entry) => entry.ts !== undefined && entry.rs !== undefined);
  return { identical: both.filter((entry) => entry.ts === entry.rs).length, compared: both.length };
}

/** Spec v01.1 §Statistics: a ratio only when the samples differ; lower is better for every row here. */
export function valueVerdict(row: ValueRow): { readonly text: string; readonly factor: number | undefined; readonly rustBetter: boolean | undefined } {
  if (row.ts === undefined || row.rs === undefined) return { text: "", factor: undefined, rustBetter: undefined };
  if (row.notComparable !== undefined) return { text: row.notComparable, factor: undefined, rustBetter: undefined };
  if (row.samples === undefined || row.samples.ts.length < 2 || row.samples.rs.length < 2) return { text: "single measurement, no verdict", factor: undefined, rustBetter: undefined };
  const verdict = compare(row.samples.rs, row.samples.ts);
  if (verdict.kind === "no-measurable-difference") return { text: "no measurable difference", factor: undefined, rustBetter: undefined };
  const rustBetter = verdict.lower === "left";
  return { text: `${verdict.ratio.toFixed(1)}× ${rustBetter ? "better" : "worse"}`, factor: verdict.ratio, rustBetter };
}

function ratio(row: ValueRow): string {
  return valueVerdict(row).text;
}

export function valueTable(record: RunRecord, names: { ts: string; rs: string }): string[] {
  const rows = valueRows(record);
  if (rows.length === 0) return [];
  const sameRow = (label: string, same: { identical: number; compared: number }, differs: string) => `| ${label} | ${same.identical} of ${same.compared} measured groups | | ${same.identical === same.compared ? "identical" : differs} |`;
  return [
    `| | ${names.ts} | ${names.rs} | Rust compared with TypeScript |`,
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.label} | ${row.ts === undefined ? "" : row.format(row.ts)} | ${row.rs === undefined ? "" : row.format(row.rs)} | ${ratio(row)} |`),
    // Spec v01.1 revision 9: the two Vite plugins post-process the sheet differently, so their bytes are counted apart.
    ...(record.specRevision >= 9
      ? [sameRow("Byte-identical output, engine", identicalOutputs(record, "engine"), "differs"), sameRow("Byte-identical output, Vite build and dev server", identicalOutputs(record, "pipeline"), "differs: only @teacss/vite-ts passes its sheet through Lightning CSS")]
      : [sameRow("Byte-identical output", identicalOutputs(record), "differs")]),
  ];
}

export function priceTable(record: RunRecord, names: Readonly<Record<string, string>>): string[] {
  const price = record.price;
  if (price === undefined) return [];
  const subjects = Object.entries(price.subjects).filter(([, entry]) => entry.native !== undefined);
  if (subjects.length === 0) return [];
  const cell = (pick: (entry: (typeof subjects)[number][1]) => string) => subjects.map(([, entry]) => pick(entry)).join(" | ");
  const loadMs = (entry: (typeof subjects)[number][1]) => median(entry.nativeLoadMs);
  const installMs = (entry: (typeof subjects)[number][1]) => (entry.install === undefined ? undefined : median(entry.install.installMs));
  const lines = [
    `| | ${subjects.map(([subject]) => names[subject] ?? subject).join(" | ")} |`,
    `| --- | ${subjects.map(() => "---").join(" | ")} |`,
    `| Native file for this platform | ${cell((entry) => (entry.native === undefined ? "" : `${megabytes(entry.native.bytes)} (${entry.native.package})`))} |`,
    `| Platform packages published | ${cell((entry) => String(entry.native?.platformPackages ?? ""))} |`,
    `| Loading the native file in a fresh process | ${cell((entry) => {
      const value = loadMs(entry);
      return value === undefined ? "" : seconds(value);
    })} |`,
    `| Install from an empty cache | ${cell((entry) => {
      const value = installMs(entry);
      return value === undefined ? "not measured" : seconds(value);
    })} |`,
    `| Installed size of the tool's packages | ${cell((entry) => (entry.install === undefined ? "not measured" : megabytes(entry.install.installedBytes)))} |`,
  ];
  const judged = subjects.filter(([, entry]) => entry.coverage.length > 0);
  if (judged.length > 0) lines.push(`| Example configurations the native engine serves | ${cell((entry) => (entry.coverage.length === 0 ? "" : `${entry.coverage.filter((result) => result.served).length} of ${entry.coverage.length}`))} |`);
  return lines;
}

export interface RustFindings {
  readonly sections: readonly string[];
  readonly value: readonly ValueRow[];
  readonly identical: { readonly identical: number; readonly compared: number };
  readonly engineIdentical: { readonly identical: number; readonly compared: number };
}

export function rustFindings(record: RunRecord): RustFindings {
  if (!hasV02Data(record)) return { sections: [], value: [], identical: { identical: 0, compared: 0 }, engineIdentical: { identical: 0, compared: 0 } };
  return { sections: rustSections(record), value: valueRows(record), identical: identicalOutputs(record), engineIdentical: identicalOutputs(record, "engine") };
}

function rustSections(record: RunRecord): string[] {
  const names = { ts: "TeaCSS (TypeScript engine)", rs: "TeaCSS (Rust engine)" };
  const value = valueTable(record, names);
  const price = priceTable(record, { [RS]: names.rs, "tailwind-v4": "Tailwind CSS v4" });
  const fallbacks = Object.values(record.price?.subjects ?? {}).flatMap((entry) => entry.coverage.filter((result) => !result.served));
  return [
    ...(value.length === 0 ? [] : ["## The value of Rust", "", "TeaCSS's Rust engine against its TypeScript engine at the largest cell.", "", ...value, ""]),
    ...(price.length === 0
      ? []
      : [
          "## The price of Rust",
          "",
          "What each tool with a native binary ships, loads and installs. Install times depend on the network and are context, not a ranking.",
          "",
          ...price,
          "",
          ...(record.price?.coverageSource === undefined ? [] : [`Configurations judged: the entry stylesheets under \`${record.price.coverageSource}\`.${fallbacks.length === 0 ? "" : ` Not served: ${fallbacks.map((result) => `${result.entry} (${result.reason ?? "no reason"})`).join("; ")}.`}`, ""]),
        ]),
  ];
}
