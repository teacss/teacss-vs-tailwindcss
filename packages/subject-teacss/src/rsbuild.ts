import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, nativeArtifact, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { createRsbuild } from "@rsbuild/core";
import { pluginTeacss } from "@teacss/rsbuild";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["@teacss/rsbuild", "@teacss/core", "@teacss/preset-standard", "@rsbuild/core"];
const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';

/** The engine beside the core that `@teacss/rsbuild` loads. */
function resolved() {
  const packages = PACKAGES.map((name) => resolvePackage(name, HERE));
  const core = packages.find((entry) => entry.name === "@teacss/core");
  if (core === undefined) throw new Error("@teacss/core is not resolved");
  return [...packages, resolvePackage("@teacss/engine", core.dir)];
}

/** Spec v03.1 §Tiers: one production build of `src/index.js`, returning every emitted stylesheet. */
async function rsbuildBuild(workspace: Workspace): Promise<string> {
  const rsbuild = await createRsbuild({ cwd: workspace.dir, rsbuildConfig: { mode: "production", logLevel: "error", plugins: [pluginTeacss({ cwd: workspace.dir })], source: { entry: { index: "./src/index.js" } }, output: { filenameHash: false } } });
  await rsbuild.build();
  return workspace
    .list("dist/static/css")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/static/css/${file}`))
    .join("");
}

/**
 * Spec v03.1 §Subjects: `@teacss/rsbuild` as its README sets it up. The plugin takes no engine option, so
 * the registration's `TEACSS_ENGINE` chooses it, with `TEACSS_ENGINE_STRICT=1`.
 */
export function teacssRsbuildSubject(engine: "ts" | "rust"): SubjectClient {
  return {
    id: subjectId(`${engine === "ts" ? "teacss-ts" : "teacss-rs"}-rsbuild`),
    describe: async () => {
      const packages = resolved();
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engine === "rust" && engineDir !== undefined ? nativeArtifact(engineDir) : undefined;
      return { ...describePackages(packages), ...(native === undefined ? {} : { native }) };
    },
    engine: async () => {
      throw new Error("the Rsbuild subjects have no engine tier");
    },
    engineSession: async () => {
      throw new Error("the Rsbuild subjects have no engine tier");
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, content);
      workspace.write("index.css", CSS_ENTRY);
      workspace.link("node_modules/@teacss/preset-standard", dirname(require.resolve("@teacss/preset-standard/package.json")));
      workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "../index.css";\n`);
    },
    build: async (workspace) => ({ css: await rsbuildBuild(workspace) }),
    devServer: async () => {
      throw new Error("the Rsbuild subjects have no dev tier");
    },
    moduleHeader: "",
    extract: async () => [],
    coverage: async () => [],
  };
}
