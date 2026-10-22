import type { CellTable, TableGroup } from "./index.ts";

/** The build tools of spec v03.1, each the group whose subjects run it; `main` is Vite. */
export const BUILD_TOOLS: readonly { readonly group: TableGroup; readonly tool: string; readonly suffix: string }[] = [
  { group: "main", tool: "Vite", suffix: "" },
  { group: "rsbuild", tool: "Rsbuild", suffix: "-rsbuild" },
  { group: "bun", tool: "Bun (Bun runtime)", suffix: "-bun" },
];
export const CSS_TOOLS: readonly { readonly subject: string; readonly name: string }[] = [
  { subject: "teacss-rs", name: "TeaCSS (Rust engine)" },
  { subject: "teacss-ts", name: "TeaCSS (TypeScript engine)" },
  { subject: "tailwind-v4", name: "Tailwind CSS v4" },
];

export interface ToolRow {
  readonly tool: string;
  readonly group: TableGroup;
  readonly cell: { readonly utilities: number; readonly files: number };
  readonly baselineMs: number;
  /** Median build and delta over this tool's baseline, per CSS tool; absent when not measured. */
  readonly css: readonly ({ readonly medianMs: number; readonly deltaMs: number } | undefined)[];
  /** The group's build table, for the verdicts between its subjects. */
  readonly table: CellTable;
}

/** Spec v03.1 §Report: per build tool at its largest build cell, the baseline and what each CSS tool adds to it. */
export function buildToolRows(tables: readonly CellTable[]): ToolRow[] {
  const rows: ToolRow[] = [];
  for (const { group, tool, suffix } of BUILD_TOOLS) {
    const table = tables.filter((entry) => entry.series === "build" && entry.group === group).reduce<CellTable | undefined>((best, entry) => (best === undefined || entry.cell.utilities * entry.cell.files >= best.cell.utilities * best.cell.files ? entry : best), undefined);
    const baseline = table?.rows.find((row) => row.subject.endsWith("-baseline"));
    if (table === undefined || baseline === undefined) continue;
    const css = CSS_TOOLS.map(({ subject }) => {
      const row = table.rows.find((entry) => entry.subject === `${subject}${suffix}`);
      return row === undefined || row.deltaMs === undefined ? undefined : { medianMs: row.wall.median, deltaMs: row.deltaMs };
    });
    rows.push({ tool, group, cell: table.cell, baselineMs: baseline.wall.median, css, table });
  }
  return rows;
}

const ms = (value: number): string => (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`);

/** The section appears only when a run measured a build tool besides Vite. */
export function buildToolsSection(tables: readonly CellTable[]): string[] {
  const rows = buildToolRows(tables);
  if (!rows.some((row) => row.group !== "main")) return [];
  return [
    "## Build tools",
    "",
    "Each build tool's own baseline builds the same project with no CSS tool, and each cell gives the build's median with what the CSS tool adds to that baseline in brackets. The baseline column compares bundlers and runtimes, not CSS tools; the added time is the comparison. The Bun row runs in the Bun runtime, the others in Node.",
    "",
    `| Build tool | Cell | Baseline | ${CSS_TOOLS.map((entry) => entry.name).join(" | ")} |`,
    `| --- | --- | --- | ${CSS_TOOLS.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.tool} | ${row.cell.utilities} x ${row.cell.files} | ${ms(row.baselineMs)} | ${row.css.map((entry) => (entry === undefined ? "" : `${ms(entry.medianMs)} (+${ms(entry.deltaMs)})`)).join(" | ")} |`),
    "",
  ];
}
