import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, nativeArtifact, resolvePackage, type SubjectClient, subjectId, type Workspace } from "@bench/infrastructure";
import { pluginTeacss } from "@teacss/bun";

const require = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = ["@teacss/bun", "@teacss/core", "@teacss/preset-standard"];
const CSS_ENTRY = '@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n';

/** The engine beside the core that `@teacss/bun` loads. */
function resolved() {
  const packages = PACKAGES.map((name) => resolvePackage(name, HERE));
  const core = packages.find((entry) => entry.name === "@teacss/core");
  if (core === undefined) throw new Error("@teacss/core is not resolved");
  return [...packages, resolvePackage("@teacss/engine", core.dir)];
}

/** Spec v03.1 §Tiers: one minified `Bun.build` of `src/index.js`, returning every emitted stylesheet. */
async function bunBuild(workspace: Workspace): Promise<string> {
  const previous = process.cwd();
  process.chdir(workspace.dir);
  try {
    const result = await Bun.build({ entrypoints: [join(workspace.dir, "src/index.js")], outdir: join(workspace.dir, "dist"), plugins: [pluginTeacss(join(workspace.dir, "index.css"))], minify: true });
    if (!result.success) throw new Error(result.logs.map(String).join("\n"));
    const sheets = result.outputs.filter((output) => output.path.endsWith(".css"));
    return (await Promise.all(sheets.map((output) => output.text()))).join("");
  } finally {
    process.chdir(previous);
  }
}

/**
 * Spec v03.1 §Subjects: `@teacss/bun` as its README sets it up, in the Bun runtime. The plugin takes no
 * engine option, so the registration's `TEACSS_ENGINE` chooses it, with `TEACSS_ENGINE_STRICT=1`.
 */
export function teacssBunSubject(engine: "ts" | "rust"): SubjectClient {
  return {
    id: subjectId(`${engine === "ts" ? "teacss-ts" : "teacss-rs"}-bun`),
    describe: async () => {
      const packages = resolved();
      const engineDir = packages.find((entry) => entry.name === "@teacss/engine");
      const native = engine === "rust" && engineDir !== undefined ? nativeArtifact(engineDir) : undefined;
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
      workspace.write("index.css", CSS_ENTRY);
      workspace.link("node_modules/@teacss/preset-standard", dirname(require.resolve("@teacss/preset-standard/package.json")));
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
