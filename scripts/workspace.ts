import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

export type Layer = "shell" | "product" | "foundation" | "isolation";

export const WORKSPACE_SCOPE = "@bench/";
export const WORKSPACE_ROOTS = ["apps", "packages"] as const;
export const BANNED_UNIT_NAMES = new Set(["core", "common", "shared", "utils", "domain"]);

const LAYER_OF: readonly { readonly layer: Layer; readonly matches: (dir: string) => boolean }[] = [
  { layer: "shell", matches: (dir) => dir.startsWith("apps/") },
  { layer: "product", matches: (dir) => dir === "packages/benchmark" },
  { layer: "foundation", matches: (dir) => dir === "packages/infrastructure" },
  { layer: "isolation", matches: (dir) => dir.startsWith("packages/subject-") },
];

export const DEPENDS_ON: Readonly<Record<Layer, readonly Layer[]>> = {
  shell: ["product"],
  product: ["foundation", "isolation"],
  isolation: ["foundation"],
  foundation: [],
};

export interface Manifest {
  readonly name: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

export interface WorkspacePackage {
  readonly dir: string;
  readonly layer: Layer | undefined;
  readonly manifest: Manifest;
}

export interface Problem {
  readonly path: string;
  readonly message: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${path} is not an object`);
  const entries: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") throw new Error(`${path}.${key} is not a string`);
    entries[key] = entry;
  }
  return entries;
}

export function readManifest(file: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed) || typeof parsed["name"] !== "string") throw new Error(`${file} has no package name`);
  return {
    name: parsed["name"],
    dependencies: stringRecord(parsed["dependencies"], `${file}#dependencies`),
    devDependencies: stringRecord(parsed["devDependencies"], `${file}#devDependencies`),
  };
}

export function layerOf(dir: string): Layer | undefined {
  return LAYER_OF.find((entry) => entry.matches(dir))?.layer;
}

export function listWorkspaceDirs(root: string): string[] {
  const dirs: string[] = [];
  for (const parent of WORKSPACE_ROOTS) {
    const parentPath = join(root, parent);
    if (!existsSync(parentPath)) continue;
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
    }
  }
  return dirs.sort();
}

export function readWorkspace(root: string): WorkspacePackage[] {
  return listWorkspaceDirs(root)
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .map((dir) => ({ dir, layer: layerOf(dir), manifest: readManifest(join(root, dir, "package.json")) }));
}

export function expectedPackageName(dir: string): string {
  return `${WORKSPACE_SCOPE}${basename(dir)}`;
}

export function runCheck(name: string, problems: readonly Problem[]): void {
  if (problems.length === 0) {
    process.stdout.write(`${name}: ok\n`);
    return;
  }
  for (const problem of problems) process.stderr.write(`${name}: ${problem.path}: ${problem.message}\n`);
  process.exit(1);
}
