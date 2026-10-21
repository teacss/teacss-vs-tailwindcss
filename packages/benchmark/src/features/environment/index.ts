import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cpus, hostname, loadavg, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { version as nodeVersion } from "node:process";

export interface EnvironmentRecord {
  readonly host: string;
  readonly cpu: string;
  readonly cores: number;
  readonly memoryBytes: number;
  readonly os: string;
  readonly node: string;
  readonly pnpm: string;
  readonly lockfileSha256: string;
  readonly commit: string;
}

function command(file: string, args: readonly string[], cwd: string): string {
  try {
    return execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

export function captureEnvironment(root: string): EnvironmentRecord {
  const lockfile = join(root, "pnpm-lock.yaml");
  return {
    host: hostname().split(".")[0] ?? "unknown",
    cpu: cpus()[0]?.model ?? "unknown",
    cores: cpus().length,
    memoryBytes: totalmem(),
    os: `${platform()} ${release()}`,
    node: nodeVersion,
    pnpm: command("pnpm", ["--version"], root),
    lockfileSha256: existsSync(lockfile) ? createHash("sha256").update(readFileSync(lockfile)).digest("hex") : "none",
    commit: command("git", ["rev-parse", "HEAD"], root),
  };
}

/** One-minute load as a share of the logical cores; the protocol refuses above 0.2. */
export function loadShare(): number {
  return (loadavg()[0] ?? 0) / Math.max(1, cpus().length);
}
