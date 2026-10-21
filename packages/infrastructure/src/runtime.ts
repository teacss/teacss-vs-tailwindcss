import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";

function nativePaths(): string[] {
  const report: unknown = process.report?.getReport();
  if (typeof report !== "object" || report === null || !("sharedObjects" in report)) return [];
  const shared = report.sharedObjects;
  if (!Array.isArray(shared)) return [];
  return shared.filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".node"));
}

/** The native addons this process has loaded, by file name; `moduleLoadList` and `require.cache` do not see them. */
export function loadedNativeModules(): string[] {
  return nativePaths()
    .map((entry) => basename(entry))
    .sort();
}

function packageVersion(file: string): string {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) return String((JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown }).version);
  }
  return "unknown";
}

/** One message per addon loaded from two paths at the same package version: two installs of one package, as a linked checkout brings. */
export function findDuplicateNatives(paths: readonly string[], versionOf: (path: string) => string): string[] {
  const byKey = new Map<string, string[]>();
  for (const path of paths) {
    const key = `${basename(path)}@${versionOf(path)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), path]);
  }
  return [...byKey].filter(([, found]) => found.length > 1).map(([key, found]) => `${key} loaded twice: ${found.join(", ")}`);
}

export function duplicateNativeModules(): string[] {
  return findDuplicateNatives(nativePaths(), packageVersion);
}

export interface ResourceUsage {
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
  readonly maxRssBytes: number;
}

/** This process's own usage; a child cannot be asked from outside, so the subject process reports it. */
export function ownResourceUsage(): ResourceUsage {
  const usage = process.resourceUsage();
  return { cpuUserMs: usage.userCPUTime / 1000, cpuSystemMs: usage.systemCPUTime / 1000, maxRssBytes: usage.maxRSS * 1024 };
}
