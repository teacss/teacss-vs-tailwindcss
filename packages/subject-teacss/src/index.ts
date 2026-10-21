import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { createGenerator, type EngineMode } from "@teacss/core";
import presetStandard from "@teacss/preset-standard";
import { pluginTeacss } from "@teacss/vite";
import { build } from "vite";

const require = createRequire(import.meta.url);
const PACKAGES = ["@teacss/core", "@teacss/preset-standard", "@teacss/vite", "@teacss/engine", "vite"];
const INCLUDE = "// @teacss-include\n";
const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';

function packageVersion(name: string): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") throw new Error(`${name}: no version`);
  return manifest.version;
}

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
    describe: async () => ({ packages: Object.fromEntries(PACKAGES.map((name) => [name, packageVersion(name)])) }),
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
