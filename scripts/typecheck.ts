import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { readWorkspace } from "./workspace.ts";

const root = process.cwd();
const tsc = join(root, "node_modules/.bin/tsc");
const projects = [".", ...readWorkspace(root).map((pkg) => pkg.dir)];
let failed = false;
for (const project of projects) {
  const result = spawnSync(tsc, ["-p", join(root, project, "tsconfig.json")], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
  process.stdout.write(`typecheck ${project}: ${result.status === 0 ? "ok" : "failed"}\n`);
}
if (failed) process.exit(1);
