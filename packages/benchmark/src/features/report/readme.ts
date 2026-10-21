import type { CellTable, ReportModel, Series, SubjectRow } from "./index.ts";
import { BASELINE } from "./index.ts";

export const README_START = "<!-- bench:summary:start -->";
export const README_END = "<!-- bench:summary:end -->";

const NAMES: Readonly<Record<string, string>> = {
  "teacss-rs": "TeaCSS (Rust engine)",
  "teacss-ts": "TeaCSS (TypeScript engine)",
  "tailwind-v4": "Tailwind CSS v4",
};
const KEY_PACKAGES = ["@teacss/core", "@teacss/engine", "tailwindcss", "vite"];

const name = (subject: string): string => NAMES[subject] ?? subject;
const seconds = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`);
const count = (value: number): string => value.toLocaleString("en-US");

function largest(model: ReportModel, series: Series): CellTable | undefined {
  return model.tables.filter((table) => table.series === series).reduce<CellTable | undefined>((best, table) => (best === undefined || table.cell.utilities * table.cell.files >= best.cell.utilities * best.cell.files ? table : best), undefined);
}

function row(table: CellTable, subject: string): SubjectRow | undefined {
  return table.rows.find((entry) => entry.subject === subject);
}

function ranked(table: CellTable): SubjectRow[] {
  return table.rows.filter((entry) => entry.subject !== BASELINE).sort((left, right) => left.wall.median - right.wall.median);
}

/** "1.4× slower", "about the same" for a tie, or nothing for the fastest. */
function comparison(table: CellTable, entry: SubjectRow, fastest: SubjectRow): string {
  if (entry === fastest) return "";
  const verdict = table.verdicts.find((item) => item.subject === entry.subject)?.verdict;
  if (verdict?.kind === "no-measurable-difference") return " (about the same)";
  return ` (${(entry.wall.median / fastest.wall.median).toFixed(1)}× slower)`;
}

function fileSensitivity(model: ReportModel, subject: string): number | undefined {
  const tables = model.tables.filter((table) => table.series === "build");
  const utilities = Math.max(...tables.map((table) => table.cell.utilities));
  const same = tables.filter((table) => table.cell.utilities === utilities).sort((left, right) => left.cell.files - right.cell.files);
  const few = row(same[0] ?? tables[0] ?? ({} as CellTable), subject)?.deltaMs;
  const many = row(same[same.length - 1] ?? tables[0] ?? ({} as CellTable), subject)?.deltaMs;
  if (same.length < 2 || few === undefined || many === undefined || few <= 0) return undefined;
  return many / few;
}

function engineTable(table: CellTable): string[] {
  const order = ranked(table);
  const fastest = order[0];
  if (fastest === undefined) return [];
  return [`**Generating the CSS for ${count(table.cell.utilities)} classes** (median of ${fastest.wall.n} runs)`, "", "| | Time |", "| --- | --- |", ...order.map((entry) => `| ${name(entry.subject)} | ${seconds(entry.wall.median)}${comparison(table, entry, fastest)} |`), ""];
}

function incrementalTable(model: ReportModel): string[] {
  const ten = largest(model, "engine/incremental-10");
  const hundred = largest(model, "engine/incremental-100");
  if (ten === undefined || hundred === undefined) return [];
  const order = ranked(ten);
  const fastestTen = order[0];
  const fastestHundred = ranked(hundred)[0];
  if (fastestTen === undefined || fastestHundred === undefined) return [];
  const cell = (table: CellTable, subject: string, fastest: SubjectRow): string => {
    const entry = row(table, subject);
    return entry === undefined ? "" : `${seconds(entry.wall.median)}${comparison(table, entry, fastest)}`;
  };
  return [
    `**Adding new classes to a running build** that already holds those ${count(ten.cell.utilities)} (what a save in the editor costs; median of ${fastestTen.wall.n} runs)`,
    "",
    "| | +10 classes | +100 classes |",
    "| --- | --- | --- |",
    ...order.map((entry) => `| ${name(entry.subject)} | ${cell(ten, entry.subject, fastestTen)} | ${cell(hundred, entry.subject, fastestHundred)} |`),
    "",
  ];
}

function buildTable(table: CellTable): string[] {
  const order = ranked(table);
  const fastest = order[0];
  if (fastest === undefined) return [];
  const baseline = row(table, BASELINE);
  const lines = [`**Building a Vite project with those classes in ${table.cell.files} files** (median of ${fastest.wall.n} runs${baseline === undefined ? "" : `; the project builds in ${seconds(baseline.wall.median)} with no CSS tool`})`, "", "| | Build | of which CSS |", "| --- | --- | --- |"];
  for (const entry of order) lines.push(`| ${name(entry.subject)} | ${seconds(entry.wall.median)}${comparison(table, entry, fastest)} | ${entry.deltaMs === undefined ? "" : seconds(entry.deltaMs)} |`);
  lines.push("");
  return lines;
}

function takeaways(model: ReportModel, engine: CellTable | undefined, build: CellTable | undefined): string[] {
  const points: string[] = [];
  const engineFastest = engine === undefined ? undefined : ranked(engine)[0];
  const buildFastest = build === undefined ? undefined : ranked(build)[0];
  if (engineFastest !== undefined && buildFastest !== undefined) {
    points.push(engineFastest.subject === buildFastest.subject ? `${name(engineFastest.subject)} is fastest both at generating the CSS and at finishing the build.` : `${name(engineFastest.subject)} generates the CSS fastest; ${name(buildFastest.subject)} finishes the whole build fastest.`);
  }
  if (engine !== undefined && build !== undefined && engine.cell.utilities === build.cell.utilities) {
    const shares = ranked(build)
      .map((entry) => {
        const engineRow = row(engine, entry.subject);
        return engineRow === undefined || entry.deltaMs === undefined || entry.deltaMs <= 0 ? undefined : { subject: entry.subject, share: engineRow.wall.median / entry.deltaMs };
      })
      .filter((item): item is { subject: string; share: number } => item !== undefined);
    const low = shares.filter((item) => item.share < 0.25);
    if (low.length > 0) points.push(`For ${low.map((item) => name(item.subject)).join(" and ")}, generating the CSS is only ${low.map((item) => `${Math.round(item.share * 100)} %`).join(" and ")} of the CSS cost in the build; the rest is the build plugin, so a faster engine does not by itself give a faster build.`);
  }
  if (build !== undefined) {
    const sensitive = ranked(build)
      .map((entry) => ({ subject: entry.subject, ratio: fileSensitivity(model, entry.subject) }))
      .filter((item): item is { subject: string; ratio: number } => item.ratio !== undefined && item.ratio >= 1.3);
    const sizes = model.tables.filter((table) => table.series === "build" && table.cell.utilities === build.cell.utilities).map((table) => table.cell.files);
    if (sensitive.length > 0 && sizes.length > 1) points.push(`${sensitive.map((item) => `${name(item.subject)} gets ${item.ratio.toFixed(1)}× slower`).join("; ")} when the same classes are spread over ${Math.max(...sizes)} files instead of ${Math.min(...sizes)}; the other tools do not care how many files there are.`);
  }
  points.push("Every tool was given the same classes, and every output was checked before a run counted. The tools emit different colour and size values by design, so this is the time to a correct stylesheet, not to identical bytes.");
  const environment = model.record.environment;
  const versions = Object.values(model.record.subjects)
    .flatMap((entry) => Object.entries(entry.packages))
    .filter(([pkg]) => KEY_PACKAGES.includes(pkg))
    .map(([pkg, version]) => `${pkg} ${version}`);
  points.push(`${[...new Set(versions)].join(", ")}; one ${environment.cpu}, Node ${environment.node}${model.record.allowBusy ? ", recorded on a busy machine" : ""}. Milliseconds will differ on your machine; the ratios carry over.`);
  return points.map((point) => `- ${point}`);
}

/** Two small tables, a few takeaways and the links, all derived from the model. */
export function renderReadmeSummary(model: ReportModel, stem: string): string {
  const engine = largest(model, "engine/warm") ?? largest(model, "engine/cold");
  const build = largest(model, "build");
  const lines = [README_START, "", `### Results from ${model.record.startedAt.slice(0, 10)}`, ""];
  if (engine !== undefined) lines.push(...engineTable(engine));
  lines.push(...incrementalTable(model));
  if (build !== undefined) lines.push(...buildTable(build));
  if (engine === undefined && build === undefined) lines.push("No measurements in this run.", "");
  lines.push("**In short**", "", ...takeaways(model, engine, build), "", `[Full report](docs/reports/${stem}.md) · [audit](docs/reports/${stem}.audit.md) · [raw samples](results/${stem}.json) · [method](docs/specs/v01.1-benchmark-protocol.md)`, "", README_END);
  return lines.join("\n");
}

/** Replaces the marked block in the README, or appends one when the markers are absent. */
export function updateReadme(readme: string, summary: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start >= 0 && end > start) return `${readme.slice(0, start)}${summary}${readme.slice(end + README_END.length)}`;
  return `${readme.trimEnd()}\n\n${summary}\n`;
}
