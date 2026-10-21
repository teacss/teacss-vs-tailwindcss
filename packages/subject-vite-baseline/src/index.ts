import { fileURLToPath } from "node:url";
import { describePackages, resolvePackage, type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";

const HERE = fileURLToPath(new URL(".", import.meta.url));

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

export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("vite-baseline"),
  describe: async () => describePackages([resolvePackage("vite", HERE)]),
  engine: async () => {
    throw new Error("vite-baseline has no engine tier");
  },
  engineSession: async () => {
    throw new Error("vite-baseline has no engine tier");
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/main.js", entryModule(project.modules, undefined));
  },
  build: async (workspace) => ({ css: await viteBuild(workspace, []) }),
  devServer: async () => {
    throw new Error("vite-baseline has no dev tier");
  },
  moduleHeader: "",
  coverage: async () => [],
});
