import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describePackages, resolvePackage, runCommand, type SubjectClient, subjectId } from "@bench/infrastructure";
import { CSS_ENTRY } from "./index.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BIN = fileURLToPath(new URL("../node_modules/.bin/", import.meta.url));
const OUTPUT = "tea.css";

const COMMANDS = {
  ts: { id: "teacss-ts-cli", packages: ["@teacss/cli", "@teacss/core", "@teacss/preset-standard"], bin: "teacss-cli", args: ["src/**/*.js", "--out-file", OUTPUT, "--minify"] },
  rust: { id: "teacss-rs-cli", packages: ["teacss"], bin: "teacss", args: ["build", "--out", OUTPUT, "--minify", "--unmatched", "off"] },
} as const;

/** Each ecosystem's own command, `teacss-cli` and `teacss`, run the way its README gives: a child process in the project root. */
export function teacssCliSubject(ecosystem: keyof typeof COMMANDS): SubjectClient {
  const own = COMMANDS[ecosystem];
  return {
    id: subjectId(own.id),
    describe: async () => describePackages(own.packages.map((name) => resolvePackage(name, HERE))),
    engine: async () => {
      throw new Error("the CLI subjects have no engine tier");
    },
    engineSession: async () => {
      throw new Error("the CLI subjects have no engine tier");
    },
    prepare: async (workspace, project) => {
      for (const [path, content] of project.files) workspace.write(path, content);
      if (!project.files.has("index.css")) workspace.write("index.css", CSS_ENTRY);
      if (ecosystem === "ts") workspace.link("node_modules/@teacss/preset-standard", resolvePackage("@teacss/preset-standard", HERE).dir);
    },
    build: async (workspace) => {
      const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
      const result = await runCommand(join(BIN, own.bin), own.args, { cwd: workspace.dir, env });
      if (result.status !== 0) throw new Error(`${own.bin} exited ${result.status}: ${result.stderr.slice(0, 400)}`);
      return { css: workspace.read(OUTPUT) };
    },
    devServer: async () => {
      throw new Error("the CLI subjects have no dev tier");
    },
    moduleHeader: "",
    extract: async () => [],
    coverage: async () => [],
  };
}
