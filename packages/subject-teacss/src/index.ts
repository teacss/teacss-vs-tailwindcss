import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { createGenerator, type EngineMode } from "@teacss/core";
import presetStandard from "@teacss/preset-standard";
import { pluginTeacss } from "@teacss/vite";
import { build } from "vite";

const require = createRequire(import.meta.url);
const PACKAGES = ["@teacss/core", "@teacss/preset-standard", "@teacss/vite", "vite"];
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** The engine core loads is the one beside core, which differs from this package's own when core is linked to a checkout. */
function resolved() {
  const packages = PACKAGES.map((name) => resolvePackage(name, HERE));
  const core = packages[0];
  if (core === undefined) throw new Error("@teacss/core is not resolved");
  return [...packages, resolvePackage("@teacss/engine", core.dir)];
}
const INCLUDE = "// @teacss-include\n";
const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';

async function viteBuild(workspace: Workspace, engine: EngineMode): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    await build({ root: workspace.dir, configFile: false, logLevel: "silent", plugins: [pluginTeacss(undefined, { engine })] });
  } finally {
    process.chdir(previous);
  }
  return workspace
    .list("dist/assets")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/assets/${file}`))
    .join("");
}

/** One subject per engine mode over the same packages; the mode is explicit so the environment cannot flip it. */
export function teacssSubject(engine: "ts" | "rust"): SubjectClient {
  return {
    id: subjectId(engine === "ts" ? "teacss-ts" : "teacss-rs"),
    describe: async () => describePackages(resolved()),
    engine: async ({ candidates }) => {
      const generator = await createGenerator({ presets: [presetStandard()], engine });
      const { css } = await generator.generate(new Set(candidates), { preflights: false, minify: true });
      return { css };
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, project.modules.includes(path) ? `${INCLUDE}${content}` : content);
      workspace.write("index.css", CSS_ENTRY);
      workspace.link("node_modules/@teacss/preset-standard", dirname(require.resolve("@teacss/preset-standard/package.json")));
      workspace.write("src/main.js", `${INCLUDE}${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "virtual:teacss.css";\n`);
    },
    build: async (workspace) => ({ css: await viteBuild(workspace, engine) }),
  };
}
