import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { type DevServer, describePackages, nativeArtifact, resolvePackage, type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import { __unstable__loadDesignSystem, compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import tailwindPostcss from "@tailwindcss/postcss";
import tailwindcss from "@tailwindcss/vite";
import { build, createServer, type InlineConfig, type PluginOption } from "vite";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["tailwindcss", "@tailwindcss/vite", "@tailwindcss/node", "@tailwindcss/oxide", "vite"];

/** Theme and utilities only: preflight is off on every subject in the engine tier (spec v01.1). */
const ENGINE_ENTRY = '@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n';
const BUILD_ENTRY = '@import "tailwindcss" source(none);\n@source "./**/*.js";\n';
/** The installation guide's entry, with Tailwind's automatic source detection (spec v02.1 §Configurations). */
const DEFAULT_ENTRY = '@import "tailwindcss";\n';

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

export type TailwindVariant = "production" | "default" | "postcss";

export function tailwindSubject(variant: TailwindVariant): SubjectClient {
  return {
    id: subjectId(`tailwind-v4${variant === "production" ? "" : `-${variant}`}`),
    describe: async () => {
      const packages = PACKAGES.map((name) => resolvePackage(name, HERE));
      const oxide = packages.find((entry) => entry.name === "@tailwindcss/oxide");
      const native = oxide === undefined ? undefined : nativeArtifact(oxide);
      return { ...describePackages(packages), ...(native === undefined ? {} : { native }) };
    },
    engine: async ({ candidates }) => {
      const compiler = await compile(ENGINE_ENTRY, { base: dirname(require.resolve("tailwindcss/package.json")), onDependency: () => {} });
      return { css: compiler.build([...candidates]) };
    },
    engineSession: async () => {
      const compiler = await compile(ENGINE_ENTRY, { base: dirname(require.resolve("tailwindcss/package.json")), onDependency: () => {} });
      return { generate: async (candidates) => ({ css: compiler.build([...candidates]) }) };
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, content);
      workspace.write("src/style.css", variant === "default" ? DEFAULT_ENTRY : BUILD_ENTRY);
      workspace.write("src/main.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "./style.css";\n`);
      workspace.link("node_modules/tailwindcss", dirname(require.resolve("tailwindcss/package.json")));
    },
    build: async (workspace) => ({ css: await viteBuild(workspace, variant === "postcss" ? { css: { postcss: { plugins: [tailwindPostcss()] } } } : { plugins: [tailwindcss()] }) }),
    devServer: async (workspace) => {
      if (variant === "postcss") throw new Error("the PostCSS round has no dev tier");
      return startDevServer(workspace, [tailwindcss()]);
    },
    moduleHeader: "",
    extract: async (dirs) => {
      const scanner = new Scanner({ sources: dirs.map((dir) => ({ base: dir, pattern: "**/*", negated: false })) });
      scanner.scan();
      const counts = new Map<string, number>();
      for (const file of scanner.files) {
        const content = readFileSync(file, "utf8");
        for (const { candidate } of scanner.getCandidatesWithPositions({ content, extension: extname(file).slice(1) })) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
      }
      const design = await __unstable__loadDesignSystem(ENGINE_ENTRY, { base: dirname(require.resolve("tailwindcss/package.json")) });
      const names = [...counts.keys()];
      const css = design.candidatesToCss(names);
      return names.filter((_, index) => css[index] !== null).map((name) => [name, counts.get(name) ?? 0] as const);
    },
    coverage: async () => [],
  };
}

export const createSubject: SubjectFactory = () => tailwindSubject("production");
