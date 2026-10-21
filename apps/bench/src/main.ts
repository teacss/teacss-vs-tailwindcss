import process from "node:process";
import { fileURLToPath } from "node:url";
import { createApp } from "@bench/benchmark";

const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;

process.exitCode = await createApp({
  argv: process.argv.slice(2),
  env,
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  subjectEntry: fileURLToPath(new URL("./subject.ts", import.meta.url)),
});
