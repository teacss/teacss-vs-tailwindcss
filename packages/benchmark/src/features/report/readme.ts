import { crossComparisons } from "./cross.ts";
import type { CellTable, ReportModel, Series, SubjectRow } from "./index.ts";
import { BASELINE, type TableGroup } from "./index.ts";
import { devDifference, valueVerdict } from "./rust.ts";
import { BUILD_TOOLS, buildToolRows, CSS_TOOLS } from "./tools.ts";

export const README_START = "<!-- bench:summary:start -->";
export const README_END = "<!-- bench:summary:end -->";

const NAMES: Readonly<Record<string, string>> = {
  "teacss-rs": "TeaCSS (Rust engine)",
  "teacss-ts": "TeaCSS (TypeScript engine)",
  "tailwind-v4": "Tailwind CSS v4",
};
const KEY_PACKAGES = ["@teacss/core", "@teacss/engine", "tailwindcss", "vite"];

const name = (subject: string): string => NAMES[subject] ?? subject;
const seconds = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 10 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(1)} ms`);
const count = (value: number): string => value.toLocaleString("en-US");

function largest(model: ReportModel, series: Series, group: TableGroup = "main"): CellTable | undefined {
  return model.tables.filter((table) => table.series === series && table.group === group).reduce<CellTable | undefined>((best, table) => (best === undefined || table.cell.utilities * table.cell.files >= best.cell.utilities * best.cell.files ? table : best), undefined);
}

function row(table: CellTable, subject: string): SubjectRow | undefined {
  return table.rows.find((entry) => entry.subject === subject);
}

/** The production setups, fastest first; configuration variants have their own takeaway. */
function ranked(table: CellTable): SubjectRow[] {
  return table.rows.filter((entry) => entry.subject !== BASELINE && NAMES[entry.subject] !== undefined).sort((left, right) => left.wall.median - right.wall.median);
}

/** How each tool's out-of-the-box entry changes its build time against its tuned one, at the largest cell. */
function defaultConfigTakeaway(model: ReportModel): string[] {
  const build = largest(model, "build");
  const defaults = largest(model, "build", "default-config");
  if (build === undefined || defaults === undefined) return [];
  const ratios = Object.keys(NAMES)
    .map((subject) => ({ subject, tuned: row(build, subject)?.wall.median, out: row(defaults, `${subject}-default`)?.wall.median }))
    .filter((entry): entry is { subject: string; tuned: number; out: number } => entry.tuned !== undefined && entry.out !== undefined);
  if (ratios.length === 0) return [];
  const sensitive = ratios.filter((entry) => Math.abs(entry.out / entry.tuned - 1) > 0.1);
  const conclusion = sensitive.length === 0 ? "so the comparison does not hinge on one tool's configuration" : `so configuration matters for ${joinWords(sensitive.map((entry) => name(entry.subject)))}`;
  return [`- With each tool's out-of-the-box entry instead of the tuned one, the build takes ${joinWords(ratios.map((entry) => `${(entry.out / entry.tuned).toFixed(2)}× as long for ${name(entry.subject)}`))}, ${conclusion}.`];
}

/** "1.4× slower", "about the same" for a tie, or nothing for the fastest. */
function comparison(table: CellTable, entry: SubjectRow, fastest: SubjectRow): string {
  if (entry === fastest) return "";
  const verdict = table.verdicts.find((item) => item.subject === entry.subject)?.verdict;
  if (verdict?.kind === "no-measurable-difference") return " (about the same)";
  return ` (${(entry.wall.median / fastest.wall.median).toFixed(1)}× slower)`;
}

function fileSensitivity(model: ReportModel, subject: string): number | undefined {
  const tables = model.tables.filter((table) => table.series === "build" && table.group === "main");
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

function pairTable(model: ReportModel, series: readonly [Series, Series], title: (table: CellTable) => string): string[] {
  const ten = largest(model, series[0]);
  const hundred = largest(model, series[1]);
  if (ten === undefined || hundred === undefined) return [];
  const order = ranked(ten);
  const fastestTen = order[0];
  const fastestHundred = ranked(hundred)[0];
  if (fastestTen === undefined || fastestHundred === undefined) return [];
  const cell = (table: CellTable, subject: string, fastest: SubjectRow): string => {
    const entry = row(table, subject);
    return entry === undefined ? "" : `${seconds(entry.wall.median)}${comparison(table, entry, fastest)}`;
  };
  return [`${title(ten)} (median of ${fastestTen.wall.n} runs)`, "", "| | +10 classes | +100 classes |", "| --- | --- | --- |", ...order.map((entry) => `| ${name(entry.subject)} | ${cell(ten, entry.subject, fastestTen)} | ${cell(hundred, entry.subject, fastestHundred)} |`), ""];
}

const VALUE_ROWS = ["Generate the CSS (warm process)", "Add 10 classes to a running engine", "Dev server: save a file with 10 new classes", "Vite production build", "Resident memory after generating"];

function rustTable(model: ReportModel): string[] {
  const rows = model.rust.value.filter((row) => VALUE_ROWS.includes(row.label) && row.ts !== undefined && row.rs !== undefined);
  if (rows.length === 0) return [];
  const lines = ["**What the Rust engine changes for TeaCSS**", "", "| | TypeScript engine | Rust engine |", "| --- | --- | --- |"];
  for (const row of rows) {
    const verdict = valueVerdict(row);
    const memory = row.label.startsWith("Resident memory");
    const note = verdict.factor === undefined ? " (no measurable difference)" : ` (${verdict.factor.toFixed(1)}× ${memory ? (verdict.rustBetter ? "less" : "more") : verdict.rustBetter ? "faster" : "slower"})`;
    lines.push(`| ${row.label} | ${row.format(row.ts ?? 0)} | ${row.format(row.rs ?? 0)}${note} |`);
  }
  const { identical, compared } = model.rust.identical;
  const engine = model.rust.engineIdentical;
  const build = model.rust.buildIdentical;
  const all = (same: { identical: number; compared: number }) => same.compared > 0 && same.identical === same.compared;
  const enginesOnly = model.record.specRevision >= 9 && all(engine);
  const differs = model.record.specRevision >= 10 && all(build) ? `byte-identical from the engines and the Vite builds; ${devDifference(model.record).readme}` : "byte-identical from the engines; the Vite builds differ, since only @teacss/vite-ts passes its sheet through Lightning CSS";
  if (compared > 0) lines.push(`| Same CSS output | | ${identical === compared ? "byte-identical in every measured case" : enginesOnly ? differs : `${identical} of ${compared} groups identical`} |`);
  lines.push("");
  return lines;
}

function priceTakeaway(model: ReportModel): string | undefined {
  const rust = model.record.price?.subjects["teacss-rs"];
  const native = rust?.native;
  if (rust === undefined || native === undefined) return undefined;
  const load = rust.nativeLoadMs.length === 0 ? undefined : [...rust.nativeLoadMs].sort((left, right) => left - right)[Math.floor(rust.nativeLoadMs.length / 2)];
  const served = rust.coverage.filter((result) => result.served).length;
  const rest = model.record.specRevision >= 9 ? "the rest run only on the TypeScript ecosystem, since 0.10 has no fallback" : "the rest fall back to the TypeScript engine";
  const coverage = rust.coverage.length === 0 ? "" : ` It served ${served} of the ${rust.coverage.length} example configurations it was given${served === rust.coverage.length ? "" : `; ${rest}`}.`;
  return `The price of the Rust engine is a native file of ${(native.bytes / 1048576).toFixed(1)} MB per platform (${native.platformPackages} platform packages), loaded in ${load === undefined ? "an unmeasured time" : seconds(load)}.${coverage}`;
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

/**
 * Whether the other corpus ranks a different tool fastest at generating and at building. A new
 * leader only counts when its lead over the old one is measurable there; otherwise the two tie.
 */
function besideTakeaway(model: ReportModel, beside: ReportModel | undefined): string[] {
  if (beside === undefined) return [];
  const community = beside.record.community ?? model.record.community;
  const source = community === undefined ? "the other corpus" : `classes taken from ${community.repositories.length} public Tailwind project${community.repositories.length === 1 ? "" : "s"} (${community.kept} of their ${community.found} utilities translate)`;
  const changes: string[] = [];
  const ties: string[] = [];
  for (const series of ["engine/warm", "build"] as const) {
    const here = largest(model, series);
    const there = largest(beside, series);
    const leaderHere = here === undefined ? undefined : ranked(here)[0]?.subject;
    const leaderThere = there === undefined ? undefined : ranked(there)[0]?.subject;
    if (there === undefined || leaderHere === undefined || leaderThere === undefined || leaderHere === leaderThere) continue;
    const verdict = there.verdicts.find((entry) => entry.subject === leaderHere)?.verdict;
    const task = series === "build" ? "building" : "generating the CSS";
    if (verdict?.kind === "differs") changes.push(`${task} is fastest with ${name(leaderThere)}`);
    else ties.push(`${task}, ${name(leaderThere)} and ${name(leaderHere)} are within noise of each other`);
  }
  if (changes.length > 0) return [`- On ${source}, the ranking changes: ${changes.join("; ")}.`];
  if (ties.length > 0) return [`- On ${source}, no tool overtakes the leaders above; for ${ties.join("; for ")}.`];
  return [`- On ${source}, the same tools come out fastest.`];
}

/** Spec v03.1 §Report: what TeaCSS and Tailwind each add to a build on the other build tools, and which adds less. */
function buildToolsTakeaway(model: ReportModel): string[] {
  const rust = CSS_TOOLS.findIndex((entry) => entry.subject === "teacss-rs");
  const tailwind = CSS_TOOLS.findIndex((entry) => entry.subject === "tailwind-v4");
  const parts = buildToolRows(model.tables)
    .filter((row) => row.group !== "main")
    .flatMap((row) => {
      const teacss = row.css[rust];
      const other = row.css[tailwind];
      if (teacss === undefined || other === undefined) return [];
      const suffix = BUILD_TOOLS.find((entry) => entry.group === row.group)?.suffix ?? "";
      const [winner, loser] = teacss.deltaMs <= other.deltaMs ? ["teacss-rs", "tailwind-v4"] : ["tailwind-v4", "teacss-rs"];
      const verdict = row.table.fastest === `${winner}${suffix}` ? row.table.verdicts.find((entry) => entry.subject === `${loser}${suffix}`)?.verdict : undefined;
      const outcome = verdict?.kind === "no-measurable-difference" ? "about the same" : `so ${name(winner)} adds less`;
      return [`with ${row.tool}, ${name("teacss-rs")} adds ${seconds(teacss.deltaMs)} to the build and ${name("tailwind-v4")} adds ${seconds(other.deltaMs)}, ${outcome}`];
    });
  return parts.length === 0 ? [] : [`- On other build tools: ${parts.join("; ")}. The Build tools section of the full report sets them beside Vite.`];
}

function crossTakeaway(model: ReportModel, cross: ReportModel | undefined): string[] {
  if (cross === undefined) return [];
  const comparisons = crossComparisons(model, cross);
  if (comparisons.length === 0) return [];
  const agreeing = comparisons.filter((entry) => entry.agreement !== "different leader").length;
  return [`- On a second machine (${cross.record.environment.cpu}, ${cross.record.environment.os}), the fastest tool is the same or within noise in ${agreeing} of ${comparisons.length} comparisons.`];
}

function joinWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
    if (low.length > 0) points.push(`Generating the CSS is only part of the build's CSS cost: ${joinWords(low.map((item) => `${Math.round(item.share * 100)} % for ${name(item.subject)}`))}. The rest is the build plugin, so a faster engine does not by itself give a faster build.`);
  }
  if (build !== undefined) {
    const sensitive = ranked(build)
      .map((entry) => ({ subject: entry.subject, ratio: fileSensitivity(model, entry.subject) }))
      .filter((item): item is { subject: string; ratio: number } => item.ratio !== undefined && item.ratio >= 1.3);
    const sizes = model.tables.filter((table) => table.series === "build" && table.group === "main" && table.cell.utilities === build.cell.utilities).map((table) => table.cell.files);
    if (sensitive.length > 0 && sizes.length > 1) points.push(`${sensitive.map((item) => `${name(item.subject)} gets ${item.ratio.toFixed(1)}× slower`).join("; ")} when the same classes are spread over ${Math.max(...sizes)} files instead of ${Math.min(...sizes)}; the other tools do not care how many files there are.`);
  }
  const produced = [...model.work].filter((row) => NAMES[row.subject] !== undefined);
  const most = produced[0];
  const least = produced[produced.length - 1];
  if (most !== undefined && least !== undefined && most !== least && most.bytes / least.bytes >= 1.2) {
    const tool = (subject: string): string => (subject.startsWith("teacss-") ? "TeaCSS" : name(subject));
    points.push(`For the same classes, ${tool(most.subject)} emits ${(most.bytes / least.bytes).toFixed(1)}× the CSS of ${tool(least.subject)}: ${most.rules.toLocaleString("en-US")} rules against ${least.rules.toLocaleString("en-US")}. Part of its build time goes to producing that extra output.`);
  }
  const price = priceTakeaway(model);
  if (price !== undefined) points.push(price);
  points.push(
    model.record.verification === undefined
      ? "Every tool was given the same classes; their outputs were checked against the paired classes with `bench verify`, separately from this run. The tools emit different colour and size values by design, so this is the time to a correct stylesheet, not to identical bytes."
      : "Every tool was given the same classes, and before anything was timed each tool's output was checked against them; every timed call that added classes was checked for those classes. The tools emit different colour and size values by design, so this is the time to a correct stylesheet, not to identical bytes.",
  );
  const environment = model.record.environment;
  const versions = Object.values(model.record.subjects)
    .flatMap((entry) => Object.entries(entry.packages))
    .filter(([pkg]) => KEY_PACKAGES.includes(pkg))
    .map(([pkg, version]) => `${pkg} ${version}`);
  points.push(`${[...new Set(versions)].join(", ")}; one ${environment.cpu}, Node ${environment.node}${model.record.allowBusy ? ", recorded on a busy machine" : ""}. Milliseconds will differ on your machine; the ratios carry over.`);
  return points.map((point) => `- ${point}`);
}

/** Two small tables, a few takeaways and the links, all derived from the model. */
export function renderReadmeSummary(model: ReportModel, stem: string, beside?: ReportModel, cross?: ReportModel): string {
  const engine = largest(model, "engine/warm") ?? largest(model, "engine/cold");
  const build = largest(model, "build");
  const local = Object.entries(model.record.subjects).flatMap(([, versions]) => Object.entries(versions.local ?? {}).map(([pkg]) => pkg));
  const lines = [README_START, "", `### Results from ${model.record.startedAt.slice(0, 10)}`, ""];
  if (local.length > 0) lines.push(`**Local build, not for publication.** ${joinWords([...new Set(local)])} came from a local checkout rather than npm, so these numbers cannot be reproduced from the lockfile.`, "");
  if (engine !== undefined) lines.push(...engineTable(engine));
  lines.push(...pairTable(model, ["engine/incremental-10", "engine/incremental-100"], (table) => `**Adding new classes to an engine** that already holds those ${count(table.cell.utilities)}`));
  lines.push(...pairTable(model, ["dev/+10", "dev/+100"], (table) => `**Saving a new file in the Vite dev server** with ${count(table.cell.utilities)} classes already in ${table.cell.files} files, until the page's stylesheet has the new classes`));
  if (build !== undefined) lines.push(...buildTable(build));
  lines.push(...rustTable(model));
  if (engine === undefined && build === undefined) lines.push("No measurements in this run.", "");
  lines.push(
    "**In short**",
    "",
    ...takeaways(model, engine, build),
    ...defaultConfigTakeaway(model),
    ...buildToolsTakeaway(model),
    ...besideTakeaway(model, beside),
    ...crossTakeaway(model, cross),
    "",
    `[Full report](notes/reports/${stem}.md) · [audit](notes/reports/${stem}.audit.md) · [raw samples](results/${stem}.json) · [method](notes/specs/v01.1-benchmark-protocol.md)`,
    "",
    README_END,
  );
  return lines.join("\n");
}

/** Replaces the marked block in the README, or appends one when the markers are absent. */
export function updateReadme(readme: string, summary: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start >= 0 && end > start) return `${readme.slice(0, start)}${summary}${readme.slice(end + README_END.length)}`;
  return `${readme.trimEnd()}\n\n${summary}\n`;
}
