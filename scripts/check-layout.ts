import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { BANNED_UNIT_NAMES, expectedPackageName, isRecord, listWorkspaceDirs, type Problem, readWorkspace, runCheck } from "./workspace.ts";

const ROOT_DIRS = new Set(["apps", "packages", "docs", "results", "scripts"]);
const ROOT_FILES = new Set(["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "tsconfig.base.json", "tsconfig.json", "biome.json", "README.md", "AGENTS.md", "CLAUDE.md", "LICENSE"]);
const SHELL_SOURCES = new Set(["main.ts", "subject.ts"]);
const BASE_TSCONFIG = "../../tsconfig.base.json";
const PACKAGE_COMPILER_OPTIONS = new Set(["types"]);

function checkRoot(root: string): Problem[] {
  const problems: Problem[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const allowed = entry.isDirectory() ? ROOT_DIRS.has(entry.name) : ROOT_FILES.has(entry.name);
    if (!allowed) problems.push({ path: entry.name, message: "not a root entry the layout allows (apps, packages, docs, results, scripts and the root manifests)" });
  }
  return problems;
}

function checkUnitName(dir: string, name: string): Problem[] {
  const problems: Problem[] = [];
  const unit = basename(dir);
  if (BANNED_UNIT_NAMES.has(unit)) problems.push({ path: dir, message: `"${unit}" is a banned unit name; name the unit for what it does` });
  if (name !== expectedPackageName(dir)) problems.push({ path: `${dir}/package.json`, message: `package name must be "${expectedPackageName(dir)}", found "${name}"` });
  return problems;
}

function checkShellSources(root: string, dir: string): Problem[] {
  const src = join(root, dir, "src");
  if (!existsSync(src)) return [{ path: `${dir}/src`, message: "a shell has a src directory with its entry files" }];
  return readdirSync(src)
    .filter((file) => !SHELL_SOURCES.has(file) && !file.endsWith(".test.ts"))
    .map((file) => ({ path: `${dir}/src/${file}`, message: "a shell holds only main.ts, subject.ts and their tests; everything else belongs to the product" }));
}

function checkTsconfig(root: string, dir: string): Problem[] {
  const file = join(root, dir, "tsconfig.json");
  if (!existsSync(file)) return [{ path: `${dir}/tsconfig.json`, message: "every package extends the base tsconfig" }];
  const config: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(config)) return [{ path: `${dir}/tsconfig.json`, message: "not a JSON object" }];
  const problems: Problem[] = [];
  if (config["extends"] !== BASE_TSCONFIG) problems.push({ path: `${dir}/tsconfig.json`, message: `extends must be "${BASE_TSCONFIG}"` });
  const options = config["compilerOptions"];
  if (isRecord(options)) {
    for (const key of Object.keys(options)) {
      if (!PACKAGE_COMPILER_OPTIONS.has(key)) problems.push({ path: `${dir}/tsconfig.json`, message: `compilerOptions.${key} overrides the base; only the base owns compiler settings` });
    }
  }
  return problems;
}

export function checkLayout(root: string): Problem[] {
  const problems = checkRoot(root);
  const packages = readWorkspace(root);
  const withManifest = new Set(packages.map((pkg) => pkg.dir));
  for (const dir of listWorkspaceDirs(root)) {
    if (!withManifest.has(dir)) problems.push({ path: dir, message: "a workspace directory has a package.json" });
  }
  for (const pkg of packages) {
    problems.push(...checkUnitName(pkg.dir, pkg.manifest.name));
    if (pkg.layer === undefined) problems.push({ path: pkg.dir, message: "no layer claims this directory: apps/* is a shell, packages/benchmark the product, packages/infrastructure the foundation, packages/subject-* isolation" });
    if (pkg.layer === "shell") problems.push(...checkShellSources(root, pkg.dir));
    problems.push(...checkTsconfig(root, pkg.dir));
  }
  return problems;
}

if (argv[1] === fileURLToPath(import.meta.url)) runCheck("layout", checkLayout(argv[2] ?? "."));
