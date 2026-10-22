import { join } from "node:path";
import { type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";

/** Spec v03.1 §Tiers: one minified `Bun.build` of `src/index.js`, returning every emitted stylesheet. */
async function bunBuild(workspace: Workspace): Promise<string> {
  const result = await Bun.build({ entrypoints: [join(workspace.dir, "src/index.js")], outdir: join(workspace.dir, "dist"), minify: true });
  if (!result.success) throw new Error(result.logs.map(String).join("\n"));
  const sheets = result.outputs.filter((output) => output.path.endsWith(".css"));
  return (await Promise.all(sheets.map((output) => output.text()))).join("");
}

export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("bun-baseline"),
  describe: async () => ({ packages: { bun: Bun.version }, local: {} }),
  engine: async () => {
    throw new Error("bun-baseline has no engine tier");
  },
  engineSession: async () => {
    throw new Error("bun-baseline has no engine tier");
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\n`);
  },
  build: async (workspace) => ({ css: await bunBuild(workspace) }),
  devServer: async () => {
    throw new Error("bun-baseline has no dev tier");
  },
  moduleHeader: "",
  extract: async () => [],
  coverage: async () => [],
});
