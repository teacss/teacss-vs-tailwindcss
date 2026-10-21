import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import type { NativeArtifact } from "./subject-client.ts";

export interface ResolvedPackage {
  readonly name: string;
  readonly version: string;
  readonly dir: string;
  /** False when the directory lies outside a lockfile-managed store, as with a link to a local checkout. */
  readonly fromLockfile: boolean;
}

const STORE = `${sep}node_modules${sep}.bun${sep}`;

/** Finds `name` the way Node does from `fromDir` (each ancestor's node_modules), following links to the real directory. */
export function resolvePackage(name: string, fromDir: string): ResolvedPackage {
  for (let dir = fromDir; dir !== dirname(dir); dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (!existsSync(join(candidate, "package.json"))) continue;
    const real = realpathSync(candidate);
    const manifest: unknown = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
    if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") throw new Error(`${name}: no version in ${real}`);
    return { name, version: manifest.version, dir: real, fromLockfile: real.includes(STORE) };
  }
  throw new Error(`${name} cannot be resolved from ${fromDir}`);
}

export function describePackages(packages: readonly ResolvedPackage[]): { packages: Record<string, string>; local: Record<string, string> } {
  return {
    packages: Object.fromEntries(packages.map((entry) => [entry.name, entry.version])),
    local: Object.fromEntries(packages.filter((entry) => !entry.fromLockfile).map((entry) => [entry.name, entry.dir])),
  };
}

/** The platform package of `tool` installed beside it and the `.node` file inside it. */
export function nativeArtifact(tool: ResolvedPackage): NativeArtifact | undefined {
  const manifest: unknown = JSON.parse(readFileSync(join(tool.dir, "package.json"), "utf8"));
  const optional = typeof manifest === "object" && manifest !== null && "optionalDependencies" in manifest && typeof manifest.optionalDependencies === "object" && manifest.optionalDependencies !== null ? Object.keys(manifest.optionalDependencies) : [];
  for (const name of optional) {
    let platform: ResolvedPackage;
    try {
      platform = resolvePackage(name, tool.dir);
    } catch {
      continue;
    }
    const file = readdirSync(platform.dir).find((entry) => entry.endsWith(".node"));
    if (file !== undefined) return { package: name, file, path: join(platform.dir, file), bytes: statSync(join(platform.dir, file)).size, platformPackages: optional.length };
  }
  return undefined;
}
