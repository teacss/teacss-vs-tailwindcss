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
    [
      "vite-baseline",
      "teacss-ts",
      "teacss-rs",
      "tailwind-v4",
      "teacss-ts-default",
      "teacss-rs-default",
      "tailwind-v4-default",
      "teacss-rs-postcss",
      "tailwind-v4-postcss",
      "rsbuild-baseline",
      "teacss-rs-rsbuild",
      "tailwind-v4-rsbuild",
      "bun-baseline",
      "teacss-rs-bun",
      "tailwind-v4-bun",
      "teacss-ts-cli",
      "teacss-rs-cli",
    ],
  );
  assert.match(lines[0] ?? "", /vite@8\.3\.4/);
  assert.match(lines[1] ?? "", /@teacss\/core@0\.10\.4 .*@teacss\/vite-ts@0\.10\.4/);
  assert.match(lines[2] ?? "", /@teacss\/engine@0\.10\.5 @teacss\/vite@0\.10\.5 vite@8\.3\.4/);
});
