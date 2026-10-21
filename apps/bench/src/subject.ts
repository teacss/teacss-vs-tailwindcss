import process from "node:process";
import { subjectMain } from "@bench/benchmark";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const { stdout, exitCode } = await subjectMain(Buffer.concat(chunks).toString("utf8"));
process.stdout.write(stdout);
process.exitCode = exitCode;
