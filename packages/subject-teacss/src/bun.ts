import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, nativeArtifact, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { teacss } from "@teacss/bun";
import { CSS_ENTRY } from "./index.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["@teacss/bun", "@teacss/engine"];

function resolved() {
  return PACKAGES.map((name) => resolvePackage(name, HERE));
}

/** Spec v03.1 §Tiers: one minified `Bun.build` of `src/index.js`, returning every emitted stylesheet. */
async function bunBuild(workspace: Workspace): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    const result = await Bun.build({ entrypoints: [join(workspace.dir, "src/index.js")], outdir: join(workspace.dir, "dist"), plugins: [teacss()], minify: true });
    if (!result.success) throw new Error(result.logs.map(String).join("\n"));
    const sheets = result.outputs.filter((output) => output.path.endsWith(".css"));
    return (await Promise.all(sheets.map((output) => output.text()))).join("");
  } finally {
    process.chdir(previous);
  }
}

/** Spec v03.1 §Subjects: `@teacss/bun` as its README sets it up, in the Bun runtime; since 0.10 it runs the Rust engine only. */
export function teacssBunSubject(): SubjectClient {
  return {
    id: subjectId("teacss-rs-bun"),
    describe: async () => {
      const packages = resolved();
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engineDir === undefined ? undefined : nativeArtifact(engineDir);
      return { ...describePackages(packages), packages: { ...describePackages(packages).packages, bun: Bun.version }, ...(native === undefined ? {} : { native }) };
    },
    engine: async () => {
      throw new Error("the Bun subjects have no engine tier");
    },
    engineSession: async () => {
      throw new Error("the Bun subjects have no engine tier");
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, content);
      if (!project.files.has("index.css")) workspace.write("index.css", CSS_ENTRY);
      workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "virtual:teacss.css";\n`);
    },
    build: async (workspace) => ({ css: await bunBuild(workspace) }),
    devServer: async () => {
      throw new Error("the Bun subjects have no dev tier");
    },
    moduleHeader: "",
    extract: async () => [],
    coverage: async () => [],
  };
}
