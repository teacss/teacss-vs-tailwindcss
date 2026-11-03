import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type CoverageResult, type DevServer, describePackages, nativeArtifact, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import type { InlineConfig, PluginOption } from "vite";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const INCLUDE = "// @teacss-include\n";
export const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';
/** The setup guide's entry without `@source`, which the Vite pipeline does not need (spec v02.1 §Configurations). */
const DEFAULT_CSS_ENTRY = '@presets "standard";\n@teacss;\n';
/** Configuration lives in a CSS entry since 0.10, so the Rust engine tier loads this one instead of a preset object. */
const ENGINE_ENTRY = fileURLToPath(new URL("./engine-entry.css", import.meta.url));

async function viteBuild(workspace: Workspace, setup: Pick<InlineConfig, "plugins" | "css">): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    const { build } = await import("vite");
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
  const { createServer } = await import("vite");
  const server = await createServer({ root: workspace.dir, configFile: false, logLevel: "silent", plugins, server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (origin === undefined) throw new Error("the development server reported no local URL");
  return { origin, close: () => server.close() };
}

/** `@teacss/postcss` is typed against this package's PostCSS and Vite against its own newer patch: the types differ, the plugin does not. */
async function postcssSetup(workspace: Workspace): Promise<Pick<InlineConfig, "css">> {
  const { teacss } = await import("@teacss/postcss");
  return { css: { postcss: { plugins: [teacss({ root: workspace.dir }) as never] } } };
}

/**
 * Candidates to CSS with preflights off, from one generator. Neither ecosystem's is released inside the timed call:
 * the TypeScript one is left to the garbage collector, so the Rust one is too.
 */
type Generate = (candidates: readonly string[]) => Promise<string>;

/** What differs between the two ecosystems, which share no package since 0.10. */
interface Ecosystem {
  readonly prefix: "teacss-ts" | "teacss-rs";
  readonly packages: readonly string[];
  readonly vitePlugins: () => Promise<PluginOption[]>;
  readonly generator: () => Promise<Generate>;
  readonly prepare: (workspace: Workspace) => void;
  readonly coverage: (entries: readonly string[]) => Promise<readonly CoverageResult[]>;
}

const TS: Ecosystem = {
  prefix: "teacss-ts",
  packages: ["@teacss/core", "@teacss/preset-standard", "@teacss/vite-ts", "vite"],
  vitePlugins: async () => [(await import("@teacss/vite-ts")).pluginTeacss()],
  generator: async () => {
    const [{ createGenerator }, { default: presetStandard }] = await Promise.all([import("@teacss/core"), import("@teacss/preset-standard")]);
    const generator = await createGenerator({ presets: [presetStandard()] });
    return async (candidates) => (await generator.generate(new Set(candidates), { preflights: false, minify: true })).css;
  },
  prepare: (workspace) => workspace.link("node_modules/@teacss/preset-standard", dirname(require.resolve("@teacss/preset-standard/package.json"))),
  coverage: async () => [],
};

/** The Rust engine's own verdict on each entry: since 0.10 there is no fallback, so an entry it refuses does not run on it at all. */
async function engineCoverage(entries: readonly string[]): Promise<CoverageResult[]> {
  const { createProject } = await import("@teacss/engine");
  return entries.map((entry) => {
    try {
      createProject({ root: dirname(entry), entry }).dispose();
      return { entry, served: true, reason: undefined };
    } catch (error) {
      return { entry, served: false, reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

const RS: Ecosystem = {
  prefix: "teacss-rs",
  packages: ["@teacss/engine", "@teacss/vite", "vite"],
  vitePlugins: async () => [(await import("@teacss/vite")).teacss()],
  generator: async () => {
    const { createProject } = await import("@teacss/engine");
    const { engine } = createProject({ root: dirname(ENGINE_ENTRY), entry: ENGINE_ENTRY });
    return async (candidates) => engine.generate({ kind: "tokens", tokens: [...candidates] }, { preflights: false, minify: true }).css;
  },
  prepare: () => undefined,
  coverage: engineCoverage,
};

export type TeacssVariant = "production" | "default" | "postcss";

/** One subject per ecosystem and configuration. `@teacss/postcss` is published by teacss-rs alone. */
export function teacssSubject(ecosystem: "ts", variant?: Exclude<TeacssVariant, "postcss">): SubjectClient;
export function teacssSubject(ecosystem: "rust", variant?: TeacssVariant): SubjectClient;
export function teacssSubject(ecosystem: "ts" | "rust", variant: TeacssVariant = "production"): SubjectClient {
  const own = ecosystem === "ts" ? TS : RS;
  const resolved = () => (variant === "postcss" ? ["@teacss/postcss", "@teacss/engine", "vite"] : own.packages).map((name) => resolvePackage(name, HERE));
  return {
    id: subjectId(`${own.prefix}${variant === "production" ? "" : `-${variant}`}`),
    describe: async () => {
      const packages = resolved();
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engineDir === undefined ? undefined : nativeArtifact(engineDir);
      return { ...describePackages(packages), ...(native === undefined ? {} : { native }) };
    },
    engine: async ({ candidates }) => ({ css: await (await own.generator())(candidates) }),
    engineSession: async () => {
      const generate = await own.generator();
      return { generate: async (candidates) => ({ css: await generate(candidates) }) };
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, project.modules.includes(path) ? `${INCLUDE}${content}` : content);
      if (!project.files.has("index.css")) workspace.write("index.css", variant === "default" ? DEFAULT_CSS_ENTRY : CSS_ENTRY);
      own.prepare(workspace);
      const stylesheet = variant === "postcss" ? "../index.css" : "virtual:teacss.css";
      workspace.write("src/main.js", `${INCLUDE}${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "${stylesheet}";\n`);
    },
    build: async (workspace) => ({ css: await viteBuild(workspace, variant === "postcss" ? await postcssSetup(workspace) : { plugins: await own.vitePlugins() }) }),
    devServer: async (workspace) => {
      if (variant === "postcss") throw new Error("the PostCSS round has no dev tier");
      return startDevServer(workspace, await own.vitePlugins());
    },
    moduleHeader: INCLUDE,
    extract: async () => [],
    coverage: own.coverage,
  };
}
