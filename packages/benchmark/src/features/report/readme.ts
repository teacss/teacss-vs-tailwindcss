import type { CellTable, ReportModel, Series, SubjectRow } from "./index.ts";
import { BASELINE } from "./index.ts";

export const README_START = "<!-- bench:summary:start -->";
export const README_END = "<!-- bench:summary:end -->";

const NAMES: Readonly<Record<string, string>> = {
  "teacss-rs": "TeaCSS with its Rust engine",
  "teacss-ts": "TeaCSS with its TypeScript engine",
  "tailwind-v4": "Tailwind CSS v4",
  [BASELINE]: "a Vite build with no CSS tool",
};

const name = (subject: string): string => NAMES[subject] ?? subject;
const seconds = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`);
const times = (ratio: number): string => `${ratio.toFixed(1)}×`;

function largest(model: ReportModel, series: Series): CellTable | undefined {
  return model.tables.filter((table) => table.series === series).reduce<CellTable | undefined>((best, table) => (best === undefined || table.cell.utilities * table.cell.files >= best.cell.utilities * best.cell.files ? table : best), undefined);
}

function row(table: CellTable, subject: string): SubjectRow | undefined {
  return table.rows.find((entry) => entry.subject === subject);
}

function ranked(table: CellTable): SubjectRow[] {
  return table.rows.filter((entry) => entry.subject !== BASELINE).sort((left, right) => left.wall.median - right.wall.median);
}

/** How a subject's time grew with the utility count, along the file count that has the most sizes. */
function growth(model: ReportModel, series: Series, subject: string): { from: number; to: number; ratio: number } | undefined {
  const tables = model.tables.filter((table) => table.series === series);
  const byFiles = new Map<number, CellTable[]>();
  for (const table of tables) byFiles.set(table.cell.files, [...(byFiles.get(table.cell.files) ?? []), table]);
  const same = [...byFiles.values()].sort((left, right) => right.length - left.length || (right[0]?.cell.files ?? 0) - (left[0]?.cell.files ?? 0))[0]?.sort((left, right) => left.cell.utilities - right.cell.utilities) ?? [];
  const first = same[0];
  const last = same[same.length - 1];
  if (first === undefined || last === undefined || first === last) return undefined;
  const a = row(first, subject)?.wall.median;
  const b = row(last, subject)?.wall.median;
  if (a === undefined || b === undefined) return undefined;
  return { from: first.cell.utilities, to: last.cell.utilities, ratio: b / a };
}

/** How a subject's build time changes with the file count at the largest utility count. */
function fileSensitivity(model: ReportModel, subject: string): { utilities: number; fewFiles: number; manyFiles: number; ratio: number } | undefined {
  const tables = model.tables.filter((table) => table.series === "build");
  const utilities = Math.max(...tables.map((table) => table.cell.utilities));
  const same = tables.filter((table) => table.cell.utilities === utilities).sort((left, right) => left.cell.files - right.cell.files);
  const few = same[0];
  const many = same[same.length - 1];
  if (few === undefined || many === undefined || few === many) return undefined;
  const a = row(few, subject)?.deltaMs;
  const b = row(many, subject)?.deltaMs;
  if (a === undefined || b === undefined || a <= 0) return undefined;
  return { utilities, fewFiles: few.cell.files, manyFiles: many.cell.files, ratio: b / a };
}

/** One sentence for the subjects that were slower in every sample, one for those too close to rank. */
function separationSentences(table: CellTable, order: readonly SubjectRow[]): string {
  const separated: string[] = [];
  const tied: string[] = [];
  for (const entry of order.slice(1)) {
    const verdict = table.verdicts.find((item) => item.subject === entry.subject)?.verdict;
    if (verdict?.kind === "differs") separated.push(name(entry.subject));
    else if (verdict?.kind === "no-measurable-difference") tied.push(name(entry.subject));
  }
  const sentences: string[] = [];
  if (separated.length > 0) sentences.push(`Every sample of ${list(separated)} was slower than every sample of ${name(table.fastest)}.`);
  if (tied.length > 0) sentences.push(`${list(tied)} ${tied.length > 1 ? "were" : "was"} within the run-to-run noise of ${name(table.fastest)}, so this run cannot rank them.`);
  return sentences.join(" ");
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function engineSection(model: ReportModel): string[] {
  const table = largest(model, "engine/warm") ?? largest(model, "engine/cold");
  if (table === undefined) return ["No engine measurements in this run.", ""];
  const scenario = table.series === "engine/warm" ? "in a warm process (the tool is already loaded; this is what a rebuild costs)" : "in a cold process (the tool is loaded from disk first; this is what a first build costs)";
  const order = ranked(table);
  const fastest = order[0];
  if (fastest === undefined) return [];
  const lines = [`**Generating the CSS.** Each tool was handed the same ${table.cell.utilities.toLocaleString("en-US")} utility classes and asked for the stylesheet, ${scenario}. Median of ${fastest.wall.n} runs:`, ""];
  lines.push("| Tool | Time | Per 1,000 classes | Compared with the fastest |", "| --- | --- | --- | --- |");
  for (const entry of order) {
    const ratio = entry.wall.median / fastest.wall.median;
    lines.push(`| ${name(entry.subject)} | ${seconds(entry.wall.median)} | ${seconds((entry.wall.median / table.cell.utilities) * 1000)} | ${entry === fastest ? "fastest" : `${times(ratio)} slower`} |`);
  }
  lines.push("");
  lines.push(`${name(fastest.subject)} generated the stylesheet fastest. ${separationSentences(table, order)}`.trim(), "");
  const grow = growth(model, table.series, fastest.subject);
  if (grow !== undefined)
    lines.push(
      `Going from ${grow.from.toLocaleString("en-US")} to ${grow.to.toLocaleString("en-US")} classes (${times(grow.to / grow.from)} the work) made ${name(fastest.subject)} ${times(grow.ratio)} slower, so its cost grows ${grow.ratio < (grow.to / grow.from) * 0.8 ? "more slowly than" : grow.ratio > (grow.to / grow.from) * 1.2 ? "faster than" : "about in step with"} the number of classes.`,
      "",
    );
  return lines;
}

function buildSection(model: ReportModel): string[] {
  const table = largest(model, "build");
  if (table === undefined) return ["No build measurements in this run.", ""];
  const baseline = row(table, BASELINE);
  const order = ranked(table);
  const fastest = order[0];
  if (fastest === undefined) return [];
  const lines = [
    `**A production build.** The same ${table.cell.utilities.toLocaleString("en-US")} classes spread over ${table.cell.files} source files, built with \`vite build\`. ${baseline === undefined ? "" : `The same project with no CSS tool at all takes ${seconds(baseline.wall.median)}; the "CSS cost" column is what each tool adds on top.`} Median of ${fastest.wall.n} runs:`,
    "",
  ];
  lines.push("| Tool | Build time | CSS cost | Stylesheet (gzip) | Compared with the fastest |", "| --- | --- | --- | --- | --- |");
  for (const entry of order) {
    const ratio = entry.wall.median / fastest.wall.median;
    lines.push(
      `| ${name(entry.subject)} | ${seconds(entry.wall.median)} | ${entry.deltaMs === undefined ? "" : seconds(entry.deltaMs)} | ${(entry.cssBytes / 1024).toFixed(0)} KB (${entry.cssGzipBytes === undefined ? "?" : (entry.cssGzipBytes / 1024).toFixed(0)} KB) | ${entry === fastest ? "fastest" : `${times(ratio)} slower`} |`,
    );
  }
  lines.push("", `${name(fastest.subject)} finished the build fastest. ${separationSentences(table, order)}`.trim(), "");
  const engine = largest(model, "engine/warm");
  const shares: string[] = [];
  for (const entry of order) {
    const engineRow = engine === undefined ? undefined : row(engine, entry.subject);
    if (engineRow === undefined || entry.deltaMs === undefined || entry.deltaMs <= 0 || engine?.cell.utilities !== table.cell.utilities) continue;
    shares.push(`${Math.round((engineRow.wall.median / entry.deltaMs) * 100)} % for ${name(entry.subject)}`);
  }
  if (shares.length > 0) lines.push(`Generating the CSS is only part of that cost: ${list(shares)}. The rest is each build plugin's own work around its engine, so a faster engine does not by itself make a faster build.`, "");
  const sensitivities = order.map((entry) => ({ entry, s: fileSensitivity(model, entry.subject) })).filter((item): item is { entry: SubjectRow; s: NonNullable<ReturnType<typeof fileSensitivity>> } => item.s !== undefined);
  if (sensitivities.length > 0) {
    const first = sensitivities[0]?.s;
    if (first !== undefined) {
      lines.push(
        `Splitting the same ${first.utilities.toLocaleString("en-US")} classes over ${first.manyFiles} files instead of ${first.fewFiles} changed each tool's CSS cost by: ${sensitivities.map(({ entry, s }) => `${name(entry.subject)} ${times(s.ratio)}`).join(", ")}. A figure near 1× means the tool does not care how many files the classes live in.`,
        "",
      );
    }
  }
  return lines;
}

function closingSection(model: ReportModel, stem: string): string[] {
  const record = model.record;
  const subjects = Object.entries(record.subjects).map(
    ([subject, versions]) =>
      `${name(subject)} (${Object.entries(versions.packages)
        .map(([pkg, version]) => `${pkg}@${version}`)
        .join(", ")})`,
  );
  return [
    "**How to read these numbers.**",
    "",
    `- Every tool processed the same classes: each TeaCSS class is paired with a Tailwind class that sets the same CSS properties under the same conditions, and the harness checks the output of every run before it counts a sample. The two tools still emit different values (their colour palettes and breakpoints differ), so this compares the time to produce a correct stylesheet, not byte-identical files.`,
    "- Only differences that held across all samples are reported as rankings; two tools closer than their own run-to-run spread are reported as a tie.",
    `- One machine: ${record.environment.cpu} with ${record.environment.cores} cores, Node ${record.environment.node}${record.allowBusy ? ", recorded while the machine was busy" : ""}. Your numbers will differ; the ratios are the part worth carrying over.`,
    `- Versions: ${subjects.join("; ")}.`,
    `- Full tables, statistics and the checklist audit: [report](docs/reports/${stem}.md), [audit](docs/reports/${stem}.audit.md), [raw samples](results/${stem}.json). Method: [spec v01.1](docs/specs/v01.1-benchmark-protocol.md).`,
    "",
    `_Generated by \`bench report --readme\` from the run of ${record.startedAt.slice(0, 10)}._`,
  ];
}

/** Plain-language results and interpretation for the README, derived from the model only. */
export function renderReadmeSummary(model: ReportModel, stem: string): string {
  const lines = [README_START, "", `### Results of the run on ${model.record.startedAt.slice(0, 10)}`, "", ...engineSection(model), ...buildSection(model), ...closingSection(model, stem), "", README_END];
  return lines.join("\n");
}

/** Replaces the marked block in the README, or appends one when the markers are absent. */
export function updateReadme(readme: string, summary: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start >= 0 && end > start) return `${readme.slice(0, start)}${summary}${readme.slice(end + README_END.length)}`;
  return `${readme.trimEnd()}\n\n${summary}\n`;
}
