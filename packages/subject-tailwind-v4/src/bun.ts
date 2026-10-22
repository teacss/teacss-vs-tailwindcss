import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, resolvePackage, type SubjectClient, type SubjectFactory, subjectId, type Workspace } from "@bench/infrastructure";
import tailwindcss from "bun-plugin-tailwind";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["tailwindcss", "bun-plugin-tailwind"];
const BUILD_ENTRY = '@import "tailwindcss" source(none);\n@source "./**/*.js";\n';

/** Spec v03.1 §Tiers: one minified `Bun.build` of `src/index.js`, returning every emitted stylesheet. */
async function bunBuild(workspace: Workspace): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    const result = await Bun.build({ entrypoints: [join(workspace.dir, "src/index.js")], outdir: join(workspace.dir, "dist"), plugins: [tailwindcss], minify: true });
    if (!result.success) throw new Error(result.logs.map(String).join("\n"));
    const sheets = result.outputs.filter((output) => output.path.endsWith(".css"));
    return (await Promise.all(sheets.map((output) => output.text()))).join("");
  } finally {
    process.chdir(previous);
  }
}

/** Spec v03.1 §Subjects: `bun-plugin-tailwind` with the production entry of spec v01.1, in the Bun runtime. */
export const createSubject: SubjectFactory = (): SubjectClient => ({
  id: subjectId("tailwind-v4-bun"),
  describe: async () => {
    const described = describePackages(PACKAGES.map((name) => resolvePackage(name, HERE)));
    return { ...described, packages: { ...described.packages, bun: Bun.version } };
  },
  engine: async () => {
    throw new Error("the Bun subjects have no engine tier");
  },
  engineSession: async () => {
    throw new Error("the Bun subjects have no engine tier");
  },
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
    workspace.write("src/index.css", BUILD_ENTRY);
    workspace.link("node_modules/tailwindcss", dirname(require.resolve("tailwindcss/package.json")));
    workspace.write("src/index.js", `${project.modules.map((module) => `import "./${module.replace(/^src\//, "")}";`).join("\n")}\nimport "./index.css";\n`);
  },
  build: async (workspace) => ({ css: await bunBuild(workspace) }),
  devServer: async () => {
    throw new Error("the Bun subjects have no dev tier");
  },
  moduleHeader: "",
  extract: async () => [],
  coverage: async () => [],
});
