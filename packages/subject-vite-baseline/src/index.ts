import { readFileSync } from "node:fs";
import { type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import { build, type PluginOption } from "vite";

async function viteBuild(workspace: Workspace, plugins: PluginOption[]): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    await build({ root: workspace.dir, configFile: false, logLevel: "silent", plugins });
  } finally {
    process.chdir(previous);
  }
  const assets = workspace.list("dist/assets").filter((file) => file.endsWith(".css"));
  return assets.map((file) => workspace.read(`dist/assets/${file}`)).join("");
}

function entryModule(modules: readonly string[], cssImport: string | undefined, header = ""): string {
  const imports = modules.map((module) => `import "./${module.replace(/^src\//, "")}";`);
  if (cssImport !== undefined) imports.push(`import "${cssImport}";`);
  return `${header}${imports.join("\n")}\n`;
}

function packageVersion(name: string): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") throw new Error(`${name}: no version`);
  return manifest.version;
}

export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("vite-baseline"),
  describe: async () => ({ packages: { vite: packageVersion("vite") } }),
  engine: async () => {
    throw new Error("vite-baseline has no engine tier");
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/main.js", entryModule(project.modules, undefined));
  },
  build: async (workspace) => ({ css: await viteBuild(workspace, []) }),
});
