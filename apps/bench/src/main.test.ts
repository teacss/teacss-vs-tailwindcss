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

test("bench subjects reaches every production subject through its own process", () => {
  const result = bench("subjects");
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.deepEqual(
    lines.map((line) => line.split(":")[0]),
    ["vite-baseline", "teacss-ts", "teacss-rs", "tailwind-v4", "teacss-ts-default", "teacss-rs-default", "tailwind-v4-default", "teacss-ts-postcss", "teacss-rs-postcss", "tailwind-v4-postcss"],
  );
  assert.match(lines[0] ?? "", /vite@8\.3\.4/);
});
