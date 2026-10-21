import type { Cell, RunRecord, Sample } from "../../persistence/index.ts";
import { type RustFindings, rustFindings } from "./rust.ts";
import { compare, type Summary, summarize, type Verdict } from "./statistics.ts";
import { type WorkRow, workRows, workTable } from "./work.ts";

export { compare, mannWhitneyU, summarize } from "./statistics.ts";

export type Series = "engine/cold" | "engine/warm" | "engine/incremental-10" | "engine/incremental-100" | "dev/+10" | "dev/+100" | "build";
export const SERIES: readonly Series[] = ["engine/cold", "engine/warm", "engine/incremental-10", "engine/incremental-100", "dev/+10", "dev/+100", "build"];
export const BASELINE = "vite-baseline";
/** v01.1 series state their absence; later series appear only when measured, so older records render as before. */
const ALWAYS_STATED: ReadonlySet<Series> = new Set(["engine/cold", "engine/warm", "build"]);
/** Spec v01.1 §Subjects; a run that leaves one out says so in its header. */
export const SPEC_SUBJECTS: readonly string[] = ["vite-baseline", "teacss-ts", "teacss-rs", "tailwind-v4"];

export interface SubjectRow {
  readonly subject: string;
  readonly wall: Summary;
  readonly cssBytes: number;
  readonly cssGzipBytes: number | undefined;
  /** Median over the baseline median, build tier only. */
  readonly deltaMs: number | undefined;
  readonly maxRssBytes: number | undefined;
}

export interface CellTable {
  readonly series: Series;
  readonly cell: Cell;
  readonly rows: readonly SubjectRow[];
  /** The subject with the lowest median, and the verdict of every other subject against it. */
  readonly fastest: string;
  readonly verdicts: readonly { readonly subject: string; readonly verdict: Verdict }[];
}

export interface ReportModel {
  readonly record: Omit<RunRecord, "samples">;
  readonly tables: readonly CellTable[];
  readonly sampleCount: number;
  /** Spec v02.1 value and price of Rust, empty for records that predate it. */
  readonly rust: RustFindings;
  /** Spec v02.1 work produced at the largest cell, empty for records that predate it. */
  readonly work: readonly WorkRow[];
}

function seriesOf(sample: Sample): Series {
  if (sample.tier === "build") return "build";
  if (sample.tier === "dev") return `dev/+${sample.size}`;
  return `engine/${sample.scenario}`;
}

function cellKey(cell: Cell): string {
  return `${cell.utilities}x${cell.files}`;
}

function wallsBySubject(samples: readonly Sample[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const sample of samples) {
    const list = map.get(sample.subject) ?? [];
    list.push(sample.wallMs);
    map.set(sample.subject, list);
  }
  return map;
}

export function buildReport(record: RunRecord): ReportModel {
  const { samples, ...rest } = record;
  const tables: CellTable[] = [];
  for (const series of SERIES) {
    for (const { cell } of record.cells) {
      const inCell = samples.filter((sample) => seriesOf(sample) === series && cellKey(sample.cell) === cellKey(cell));
      if (inCell.length === 0) continue;
      const walls = wallsBySubject(inCell);
      const subjects = [...walls.keys()].filter((subject) => series !== "build" || subject !== BASELINE);
      const baseline = series === "build" ? walls.get(BASELINE) : undefined;
      const baselineMedian = baseline === undefined ? undefined : summarize(baseline).median;
      const rows = subjects.map((subject): SubjectRow => {
        const own = inCell.filter((sample) => sample.subject === subject);
        const wall = summarize(walls.get(subject) ?? []);
        const first = own[0];
        return {
          subject,
          wall,
          cssBytes: first?.cssBytes ?? 0,
          cssGzipBytes: first?.tier === "build" ? first.cssGzipBytes : undefined,
          deltaMs: baselineMedian === undefined ? undefined : wall.median - baselineMedian,
          maxRssBytes: first?.tier === "build" ? Math.max(...own.map((sample) => (sample.tier === "build" ? sample.maxRssBytes : 0))) : undefined,
        };
      });
      if (baselineMedian !== undefined) rows.push({ subject: BASELINE, wall: summarize(baseline ?? []), cssBytes: 0, cssGzipBytes: 0, deltaMs: 0, maxRssBytes: undefined });
      const ranked = rows.filter((row) => row.subject !== BASELINE).sort((left, right) => left.wall.median - right.wall.median);
      const fastest = ranked[0]?.subject ?? "";
      const verdicts = ranked.slice(1).map((row) => ({ subject: row.subject, verdict: compare(walls.get(fastest) ?? [], walls.get(row.subject) ?? []) }));
      tables.push({ series, cell, rows, fastest, verdicts });
    }
  }
  return { record: rest, tables, sampleCount: samples.length, rust: rustFindings(record), work: workRows(record) };
}

const ms = (value: number): string => `${value.toFixed(1)} ms`;
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

function verdictText(entry: { subject: string; verdict: Verdict }, fastest: string): string {
  const { verdict } = entry;
  if (verdict.kind === "no-measurable-difference") return `${entry.subject}: no measurable difference from ${fastest} (p = ${verdict.p.toFixed(3)})`;
  return `${entry.subject}: ${verdict.ratio.toFixed(2)}x the median of ${fastest} (p = ${verdict.p < 0.001 ? "< 0.001" : verdict.p.toFixed(3)}, Cliff's delta ${verdict.delta.toFixed(2)})`;
}

function tableMarkdown(table: CellTable): string {
  const header = table.series === "build" ? "| Subject | median | IQR | p95 | min | delta over baseline | CSS | gzip | max RSS |" : "| Subject | median | IQR | p95 | min | CSS |";
  const rule = table.series === "build" ? "| --- | --- | --- | --- | --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- | --- | --- |";
  const rows = table.rows.map((row) => {
    const base = `| ${row.subject} | ${ms(row.wall.median)} | ${ms(row.wall.iqr)} | ${ms(row.wall.p95)} | ${ms(row.wall.min)} |`;
    if (table.series !== "build") return `${base} ${kb(row.cssBytes)} |`;
    return `${base} ${row.deltaMs === undefined ? "" : ms(row.deltaMs)} | ${kb(row.cssBytes)} | ${row.cssGzipBytes === undefined ? "" : kb(row.cssGzipBytes)} | ${row.maxRssBytes === undefined ? "" : `${(row.maxRssBytes / 1048576).toFixed(0)} MB`} |`;
  });
  const verdicts = table.verdicts.map((entry) => `- ${verdictText(entry, table.fastest)}`);
  return [`#### ${table.series}, ${table.cell.utilities} utilities in ${table.cell.files} files`, "", header, rule, ...rows, "", `Lowest median: ${table.fastest}.`, ...verdicts, ""].join("\n");
}

function verdictParagraph(model: ReportModel, series: Series): string {
  const tables = model.tables.filter((table) => table.series === series);
  if (tables.length === 0) return `No ${series} samples in this run.`;
  const largest = tables.reduce((best, table) => (table.cell.utilities * table.cell.files >= best.cell.utilities * best.cell.files ? table : best));
  const others = largest.verdicts.map((entry) => verdictText(entry, largest.fastest));
  return `At ${largest.cell.utilities} utilities in ${largest.cell.files} files, ${largest.fastest} has the lowest median (${ms(largest.rows.find((row) => row.subject === largest.fastest)?.wall.median ?? 0)}). ${others.join(". ")}.`;
}

function limiterLines(limiters: Readonly<Record<string, { readonly totalMs: number; readonly top: readonly { readonly name: string; readonly selfMs: number; readonly share: number }[] }>>): string[] {
  const entries = Object.entries(limiters).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return ["Not profiled in this run."];
  return [
    "One uncounted `node --cpu-prof` pass per subject and tier on the largest cell (engine: the warm scenario). Self time of the top three frames:",
    "",
    "| Subject / tier | Top frames (self time, share of the profile) |",
    "| --- | --- |",
    ...entries.map(([key, summary]) => `| ${key} | ${summary.top.map((frame) => `${frame.name} ${frame.selfMs.toFixed(1)} ms (${(frame.share * 100).toFixed(0)}%)`).join("; ")} |`),
  ];
}

function localLines(record: Omit<RunRecord, "samples">): string[] {
  const linked = Object.entries(record.subjects).flatMap(([subject, versions]) => Object.entries(versions.local ?? {}).map(([name, dir]) => `${subject}: ${name} from ${dir}`));
  if (linked.length === 0) return [];
  return [`**Local build, not for publication.** These packages came from local checkouts, not from \`bun.lock\`, so nobody else can reproduce this run: ${linked.join("; ")}.`, ""];
}

function notMeasuredLines(record: Omit<RunRecord, "samples">): string[] {
  const missing = SPEC_SUBJECTS.filter((subject) => !(subject in record.subjects));
  if (missing.length === 0) return [];
  return [`**Subset run.** Measured: ${Object.keys(record.subjects).join(", ")}. Not measured: ${missing.join(", ")}. No number in this report speaks for a subject that was not measured.`, ""];
}

/** Deterministic: the same record renders the same text. */
function communityLines(record: Omit<RunRecord, "samples">): string[] {
  const community = record.community;
  if (community === undefined) return [];
  const share = community.found === 0 ? 0 : community.kept / community.found;
  return [
    "## Community corpus",
    "",
    `The classes in this run come from public Tailwind projects, not from the generator: ${community.found} distinct Tailwind utilities were found, ${community.kept} of them (${(share * 100).toFixed(0)} %) translate to TeaCSS through pair table ${record.pairTableVersion}, and each cell takes the most frequent of those.`,
    "",
    "| Repository | Directory | Commit |",
    "| --- | --- | --- |",
    ...community.repositories.map((repository) => `| ${repository.name} | \`${repository.dir}\` | ${repository.commit ?? "not a git checkout"} |`),
    "",
    `Most frequent untranslatable prefixes: ${community.untranslated.map(([prefix, count]) => `\`${prefix}\` (${count})`).join(", ") || "none"}.`,
    "",
  ];
}

/** The verdicts and tables of a second record, such as the same matrix on the community corpus. */
function besideLines(beside: ReportModel): string[] {
  const kind = beside.record.community === undefined ? "generated" : "community";
  return [
    `## Beside it: the ${kind} corpus, run ${beside.record.startedAt}`,
    "",
    ...SERIES.filter((series) => beside.tables.some((table) => table.series === series)).flatMap((series) => [`**${series}.** ${verdictParagraph(beside, series)}`, ""]),
    ...SERIES.flatMap((series) => beside.tables.filter((table) => table.series === series).map(tableMarkdown)),
    ...communityLines(beside.record),
  ];
}

export function renderMarkdown(model: ReportModel, beside?: ReportModel): string {
  const { record } = model;
  const environment = record.environment;
  const lines = [
    `# TeaCSS vs Tailwind CSS v4: run ${record.startedAt}`,
    "",
    `Protocol: spec v01.1 revision ${record.specRevision}; pair table ${record.pairTableVersion}; seed ${record.seed}; ${record.samplesPerCell} samples per subject and cell; ${model.sampleCount} samples.${record.allowBusy ? " **Recorded with --allow-busy on a loaded machine; see the load column.**" : ""}`,
    "",
    ...localLines(record),
    ...notMeasuredLines(record),
    ...(record.community === undefined ? [] : [`**Community corpus.** The classes come from public Tailwind projects; see the Community corpus section.`, ""]),
    "## Verdict",
    "",
    ...SERIES.filter((series) => ALWAYS_STATED.has(series) || model.tables.some((table) => table.series === series)).flatMap((series) => [`**${series}.** ${verdictParagraph(model, series)}`, ""]),
    "## Results",
    "",
    ...SERIES.flatMap((series) => model.tables.filter((table) => table.series === series).map(tableMarkdown)),
    ...(model.work.length === 0 ? [] : ["## Work produced", "", "What each production build emits at the largest cell. The tools write different values, shorthands and wrappers for the same classes, so the last column is context for the size difference, not a ranking.", "", ...workTable(model.work, {}), ""]),
    ...model.rust.sections,
    ...communityLines(record),
    ...(beside === undefined ? [] : besideLines(beside)),
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Host | ${environment.host} |`,
    `| CPU | ${environment.cpu}, ${environment.cores} logical cores |`,
    `| Memory | ${(environment.memoryBytes / 1073741824).toFixed(0)} GB |`,
    `| OS | ${environment.os} |`,
    `| Node | ${environment.node} |`,
    `| bun | ${environment.bun} |`,
    `| Lockfile | sha256 ${environment.lockfileSha256} |`,
    `| Commit | ${environment.commit} |`,
    `| Started / finished | ${record.startedAt} / ${record.finishedAt} |`,
    "",
    "## Versions",
    "",
    "| Subject | Packages |",
    "| --- | --- |",
    ...Object.entries(record.subjects).map(
      ([subject, versions]) =>
        `| ${subject} | ${Object.entries(versions.packages)
          .map(([name, version]) => `${name}@${version}`)
          .join(", ")} |`,
    ),
    "",
    "## Corpus and load",
    "",
    "| Cell | Corpus sha256 | Load share before | after |",
    "| --- | --- | --- | --- |",
    ...record.cells.map((entry) => `| ${entry.cell.utilities} x ${entry.cell.files} | ${entry.corpusHash} | ${(entry.loadShareBefore * 100).toFixed(0)}% | ${(entry.loadShareAfter * 100).toFixed(0)}% |`),
    "",
    "## Limiter",
    "",
    ...limiterLines(record.limiters ?? {}),
    "",
    "## Benchmark checklist",
    "",
    "1. **Why not double?** The Limiter section names the frames where each subject spends its time; a change that does not touch them cannot move the number much.",
    "2. **Was it tuned?** Every subject ran its published package with its documented production configuration (spec v01.1 §Subjects); the Rust engine ran with `TEACSS_ENGINE_STRICT=1`, so a fallback would have failed the run.",
    "3. **Did it break limits?** The CSS sizes in the tables bound the work; a median below the time to write that many bytes would be suspect.",
    "4. **Did it error?** A run with any subject error, timeout or fallback writes no record; this record exists, so every sample succeeded.",
    "5. **Does it reproduce?** Each cell holds the stated number of samples per subject, interleaved per round; the tables give the IQR and the p95, and a pair closer than the larger IQR or with p >= 0.01 is reported as no measurable difference.",
    "6. **Does it matter?** The build tier is the end-to-end path a user waits on; the engine tier is one part of it, and the delta over the baseline shows the share.",
    "7. **Did it even happen?** Every sample of a subject and cell produced the same output hash, and `bench verify` on the same corpus checks that the output selects every case with the expected properties and conditions.",
    "",
    "## Known limits",
    "",
    "- TeaCSS and Tailwind outputs are compared structurally (same properties, same condition shape), not by value: the two design systems differ in palettes, units and breakpoint widths.",
    "- The author of this benchmark also develops TeaCSS. The method was committed before the run, the pair table and raw samples are published, and the run is reproducible from a clean clone.",
    "- A run on a CI runner is a cross-check, not a primary number: shared runners are noisy.",
    "",
  ];
  return lines.join("\n");
}

export function renderSummary(model: ReportModel): string {
  return `${JSON.stringify({ startedAt: model.record.startedAt, specRevision: model.record.specRevision, tables: model.tables }, null, 2)}\n`;
}
