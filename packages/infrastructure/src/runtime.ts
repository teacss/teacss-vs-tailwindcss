import process from "node:process";

/** The native addons this process has loaded, by file name; `moduleLoadList` and `require.cache` do not see them. */
export function loadedNativeModules(): string[] {
  const report: unknown = process.report?.getReport();
  if (typeof report !== "object" || report === null || !("sharedObjects" in report)) return [];
  const shared = report.sharedObjects;
  if (!Array.isArray(shared)) return [];
  return shared
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".node"))
    .map((entry) => entry.slice(entry.lastIndexOf("/") + 1))
    .sort();
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
