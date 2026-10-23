import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type CoverageResult, type DevServer, describePackages, nativeArtifact, type ResolvedPackage, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { createGenerator } from "@teacss/core";
import { pluginTeacss as pluginTeacssPostcss } from "@teacss/postcss";
import presetStandard from "@teacss/preset-standard";
import { pluginTeacss } from "@teacss/vite";
import { build, createServer, type InlineConfig, type PluginOption } from "vite";

const require = createRequire(import.meta.url);
const PACKAGES = ["@teacss/core", "@teacss/preset-standard", "@teacss/vite", "vite"];
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** The engine core loads is the one beside core, which differs from this package's own when core is linked to a checkout. */
function resolved(variant: TeacssVariant = "production") {
  const packages = [...PACKAGES, ...(variant === "postcss" ? ["@teacss/postcss"] : [])].map((name) => resolvePackage(name, HERE));
  const core = packages[0];
  if (core === undefined) throw new Error("@teacss/core is not resolved");
  return [...packages, resolvePackage("@teacss/engine", core.dir)];
}
const INCLUDE = "// @teacss-include\n";
const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';
/** The setup guide's entry without `@source`, which the Vite pipeline does not need (spec v02.1 §Configurations). */
const DEFAULT_CSS_ENTRY = '@presets "standard";\n@teacss;\n';

async function viteBuild(workspace: Workspace, setup: Pick<InlineConfig, "plugins" | "css">): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    await build({ root: workspace.dir, configFile: false, logLevel: "silent", ...setup });
  } finally {
    process.chdir(previous);
  }
  return workspace
    .list("dist/assets")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/assets/${file}`))
    .join("");
}

async function startDevServer(workspace: Workspace, plugins: PluginOption[]): Promise<DevServer> {
  process.chdir(workspace.dir);
  const server = await createServer({ root: workspace.dir, configFile: false, logLevel: "silent", plugins, server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (origin === undefined) throw new Error("the development server reported no local URL");
  return { origin, close: () => server.close() };
}

/** Imports `specifier` the way the package at `dir` would, so a linked checkout uses its own copy. */
async function importFrom(dir: string, specifier: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(createRequire(`${dir}/package.json`).resolve(specifier)).href)) as Record<string, unknown>;
}

function callable(module: Record<string, unknown>, name: string): (...args: unknown[]) => Promise<unknown> {
  const value = module[name];
  if (typeof value !== "function") throw new Error(`${name} is not exported`);
  return value as (...args: unknown[]) => Promise<unknown>;
}

/** The Rust engine's own verdict on each entry's configuration, through the facade's `translateConfig`. */
async function engineCoverage(packages: readonly ResolvedPackage[], entries: readonly string[]): Promise<CoverageResult[]> {
  const vite = packages.find((entry) => entry.name === "@teacss/vite");
  const engine = packages.find((entry) => entry.name === "@teacss/engine");
  if (vite === undefined || engine === undefined) throw new Error("@teacss/vite or @teacss/engine is not resolved");
  const resolveEntryConfig = callable(await importFrom(vite.dir, "@teacss/config"), "resolveEntryConfig");
  const translateConfig = callable(await importFrom(engine.dir, "@teacss/engine/facade"), "translateConfig");
  const results: CoverageResult[] = [];
  for (const entry of entries) {
    const resolved = await resolveEntryConfig(readFileSync(entry, "utf8"), dirname(entry), entry);
    const config = typeof resolved === "object" && resolved !== null && "config" in resolved ? resolved.config : {};
    const outcome = await translateConfig(config, {});
    const served = typeof outcome === "object" && outcome !== null && "ok" in outcome && outcome.ok === true;
    const reason = !served && typeof outcome === "object" && outcome !== null && "reason" in outcome ? `${String(outcome.reason)}${"path" in outcome ? ` at ${String(outcome.path)}` : ""}` : undefined;
    results.push({ entry, served, reason });
  }
  return results;
}

export type TeacssVariant = "production" | "default" | "postcss";

/**
 * One subject per engine mode and configuration over the same packages. The Vite variants pass the
 * mode explicitly so the environment cannot flip it; the PostCSS plugin has no such option, so its
 * registration sets `TEACSS_ENGINE`.
 */
export function teacssSubject(engine: "ts" | "rust", variant: TeacssVariant = "production"): SubjectClient {
  const viteSetup = (): Pick<InlineConfig, "plugins" | "css"> => ({ plugins: [pluginTeacss(undefined, { engine })] });
  return {
    id: subjectId(`${engine === "ts" ? "teacss-ts" : "teacss-rs"}${variant === "production" ? "" : `-${variant}`}`),
    describe: async () => {
      const packages = resolved(variant);
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engine === "rust" && engineDir !== undefined ? nativeArtifact(engineDir) : undefined;
      return { ...describePackages(packages), ...(native === undefined ? {} : { native }) };
    },
    engine: async ({ candidates }) => {
      const generator = await createGenerator({ presets: [presetStandard()], engine });
      const { css } = await generator.generate(new Set(candidates), { preflights: false, minify: true });
      return { css };
    },
    engineSession: async () => {
      const generator = await createGenerator({ presets: [presetStandard()], engine });
      return { generate: async (candidates) => ({ css: (await generator.generate(new Set(candidates), { preflights: false, minify: true })).css }) };
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, project.modules.includes(path) ? `${INCLUDE}${content}` : content);
      workspace.write("index.css", variant === "default" ? DEFAULT_CSS_ENTRY : CSS_ENTRY);
      workspace.link("node_modules/@teacss/preset-standard", dirname(require.resolve("@teacss/preset-standard/package.json")));
      const stylesheet = variant === "postcss" ? "../index.css" : "virtual:teacss.css";
      workspace.write("src/main.js", `${INCLUDE}${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "${stylesheet}";\n`);
    },
    build: async (workspace) => ({ css: await viteBuild(workspace, variant === "postcss" ? { css: { postcss: { plugins: [pluginTeacssPostcss({ cwd: workspace.dir })] } } } : viteSetup()) }),
    devServer: async (workspace) => {
      if (variant === "postcss") throw new Error("the PostCSS round has no dev tier");
      return startDevServer(workspace, viteSetup().plugins ?? []);
    },
    moduleHeader: INCLUDE,
    extract: async () => [],
    coverage: async (entries) => (engine === "rust" ? engineCoverage(resolved(), entries) : []),
  };
}
