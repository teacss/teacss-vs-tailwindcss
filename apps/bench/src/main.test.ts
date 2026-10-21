import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function bench(...args: string[]) {
  return spawnSync(process.execPath, [fileURLToPath(new URL("./main.ts", import.meta.url)), ...args], { encoding: "utf8" });
}

test("bench --help lists the commands and exits 0", () => {
  const result = bench("--help");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /subjects/);
});

test("an unknown command prints the usage and exits 2", () => {
  const result = bench("frobnicate");
  assert.equal(result.status, 2);
  assert.match(result.stdout, /bench <command>/);
});

test("bench subjects runs with an empty production registry", () => {
  const result = bench("subjects");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "no subjects registered\n");
});
