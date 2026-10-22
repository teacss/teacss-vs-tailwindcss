import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, nativeArtifact, resolvePackage, type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import { createRsbuild } from "@rsbuild/core";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["tailwindcss", "@rsbuild/plugin-tailwindcss", "@tailwindcss/oxide", "@rsbuild/core"];
const BUILD_ENTRY = '@import "tailwindcss" source(none);\n@source "./**/*.js";\n';

/** Spec v03.1 §Tiers: one production build of `src/index.js`, returning every emitted stylesheet. */
async function rsbuildBuild(workspace: Workspace): Promise<string> {
  const rsbuild = await createRsbuild({ cwd: workspace.dir, rsbuildConfig: { mode: "production", logLevel: "error", plugins: [pluginTailwindcss()], source: { entry: { index: "./src/index.js" } }, output: { filenameHash: false } } });
  await rsbuild.build();
  return workspace
    .list("dist/static/css")
    .filter((file) => file.endsWith(".css"))
    .map((file) => workspace.read(`dist/static/css/${file}`))
    .join("");
}

/** Spec v03.1 §Subjects: `@rsbuild/plugin-tailwindcss` with the production entry of spec v01.1. */
export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("tailwind-v4-rsbuild"),
  describe: async () => {
    const packages = PACKAGES.map((name) => resolvePackage(name, HERE));
    const oxide = packages.find((entry) => entry.name === "@tailwindcss/oxide");
    const native = oxide === undefined ? undefined : nativeArtifact(oxide);
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
    workspace.write("src/index.css", BUILD_ENTRY);
    workspace.link("node_modules/tailwindcss", dirname(require.resolve("tailwindcss/package.json")));
    workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "./index.css";\n`);
  },
  build: async (workspace) => ({ css: await rsbuildBuild(workspace) }),
  devServer: async () => {
    throw new Error("the Rsbuild subjects have no dev tier");
  },
  moduleHeader: "",
  extract: async () => [],
  coverage: async () => [],
});
