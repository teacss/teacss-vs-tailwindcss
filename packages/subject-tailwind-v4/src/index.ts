import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import { compile } from "@tailwindcss/node";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const require = createRequire(import.meta.url);
const PACKAGES = ["tailwindcss", "@tailwindcss/vite", "@tailwindcss/node", "@tailwindcss/oxide", "vite"];

/** Theme and utilities only: preflight is off on every subject in the engine tier (spec v01.1). */
const ENGINE_ENTRY = '@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n';
const BUILD_ENTRY = '@import "tailwindcss" source(none);\n@source "./**/*.js";\n';

function packageVersion(name: string): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") throw new Error(`${name}: no version`);
  return manifest.version;
}

async function viteBuild(workspace: Workspace): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    await build({ root: workspace.dir, configFile: false, logLevel: "silent", plugins: [tailwindcss()] });
  } finally {
    process.chdir(previous);
  }
  return workspace
    .list("dist/assets")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/assets/${file}`))
    .join("");
}

export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("tailwind-v4"),
  describe: async () => ({ packages: Object.fromEntries(PACKAGES.map((name) => [name, packageVersion(name)])) }),
  engine: async ({ candidates }) => {
    const compiler = await compile(ENGINE_ENTRY, { base: dirname(require.resolve("tailwindcss/package.json")), onDependency: () => {} });
    return { css: compiler.build([...candidates]) };
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/style.css", BUILD_ENTRY);
    workspace.write("src/main.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "./style.css";\n`);
    workspace.link("node_modules/tailwindcss", dirname(require.resolve("tailwindcss/package.json")));
  },
  build: async (workspace) => ({ css: await viteBuild(workspace) }),
});
