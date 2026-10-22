import { fileURLToPath } from "node:url";
import { describePackages, resolvePackage, type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import { createRsbuild } from "@rsbuild/core";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Spec v03.1 §Tiers: one production build of `src/index.js`, returning every emitted stylesheet. */
async function rsbuildBuild(workspace: Workspace): Promise<string> {
  const rsbuild = await createRsbuild({ cwd: workspace.dir, rsbuildConfig: { mode: "production", logLevel: "error", source: { entry: { index: "./src/index.js" } }, output: { filenameHash: false } } });
  await rsbuild.build();
  return workspace
    .list("dist/static/css")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/static/css/${file}`))
    .join("");
}

export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("rsbuild-baseline"),
  describe: async () => describePackages([resolvePackage("@rsbuild/core", HERE)]),
  engine: async () => {
    throw new Error("rsbuild-baseline has no engine tier");
  },
  engineSession: async () => {
    throw new Error("rsbuild-baseline has no engine tier");
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\n`);
  },
  build: async (workspace) => ({ css: await rsbuildBuild(workspace) }),
  devServer: async () => {
    throw new Error("rsbuild-baseline has no dev tier");
  },
  moduleHeader: "",
  extract: async () => [],
  coverage: async () => [],
});
