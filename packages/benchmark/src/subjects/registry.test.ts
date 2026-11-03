import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { productionRegistry } from "./registry.ts";

test("every production subject resolves to a module file and declares its tiers, group and native expectations", () => {
  const registry = productionRegistry();
  assert.deepEqual(
    [...registry.keys()],
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
  for (const [id, registration] of registry) {
    assert.ok(registration.module.startsWith("file://"), `${id}: ${registration.module}`);
    assert.ok(existsSync(fileURLToPath(registration.module)), `${id}: ${registration.module}`);
  }
  assert.deepEqual(registry.get("teacss-rs" as never)?.natives.required, ["teacss-engine"]);
  assert.deepEqual(registry.get("tailwind-v4-default" as never)?.tiers, ["dev", "build"]);
  assert.deepEqual(registry.get("teacss-rs-postcss" as never)?.env, {});
  assert.deepEqual(registry.get("teacss-ts" as never)?.natives.forbidden, ["teacss-engine", "tailwindcss-oxide"]);
  assert.deepEqual(registry.get("teacss-rs-rsbuild" as never)?.natives.required, ["teacss-engine", "rspack"]);
  assert.equal(registry.get("teacss-rs-rsbuild" as never)?.group, "rsbuild");
  assert.equal(registry.get("teacss-rs-bun" as never)?.runtime, "bun");
  assert.equal(registry.get("teacss-rs" as never)?.runtime, "node");
});
