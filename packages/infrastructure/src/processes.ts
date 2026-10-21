import { spawn } from "node:child_process";
import process from "node:process";
import { millisecondsBetween, systemClock } from "./clock.ts";

export interface ProcessResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly wallMs: number;
}

export interface ProcessOptions {
  /** Flags for the Node binary itself, before the entry. */
  readonly nodeArgs?: readonly string[];
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: string;
  readonly timeoutMs: number;
}

export function runProcess(entry: string, options: ProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(options.nodeArgs ?? []), entry, ...options.args], { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
    const started = systemClock.now();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), wallMs: millisecondsBetween(started, systemClock.now()) });
    });
    child.stdin.end(options.stdin);
  });
}
