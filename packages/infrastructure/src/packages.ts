import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";

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
