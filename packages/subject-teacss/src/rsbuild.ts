import { fileURLToPath } from "node:url";
import { describePackages, nativeArtifact, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { createRsbuild } from "@rsbuild/core";
import { pluginTeacss } from "@teacss/rsbuild";
import { CSS_ENTRY } from "./index.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["@teacss/rsbuild", "@teacss/engine", "@rsbuild/core"];

function resolved() {
  return PACKAGES.map((name) => resolvePackage(name, HERE));
}

/** Spec v03.1 §Tiers: one production build of `src/index.js`, returning every emitted stylesheet. */
async function rsbuildBuild(workspace: Workspace): Promise<string> {
  const rsbuild = await createRsbuild({ cwd: workspace.dir, rsbuildConfig: { mode: "production", logLevel: "error", plugins: [pluginTeacss({ root: workspace.dir })], source: { entry: { index: "./src/index.js" } }, output: { filenameHash: false } } });
  await rsbuild.build();
  return workspace
    .list("dist/static/css")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/static/css/${file}`))
    .join("");
}

/** Spec v03.1 §Subjects: `@teacss/rsbuild` as its README sets it up; since 0.10 it runs the Rust engine only. */
export function teacssRsbuildSubject(): SubjectClient {
  return {
    id: subjectId("teacss-rs-rsbuild"),
    describe: async () => {
      const packages = resolved();
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engineDir === undefined ? undefined : nativeArtifact(engineDir);
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
      if (!project.files.has("index.css")) workspace.write("index.css", CSS_ENTRY);
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
