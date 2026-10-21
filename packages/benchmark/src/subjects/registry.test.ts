import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { productionRegistry } from "./registry.ts";

test("every production subject resolves to a module file and declares its native expectations", () => {
  const registry = productionRegistry();
  assert.deepEqual([...registry.keys()], ["vite-baseline", "teacss-ts", "teacss-rs", "tailwind-v4"]);
  for (const [id, registration] of registry) {
    assert.ok(registration.module.startsWith("file://"), `${id}: ${registration.module}`);
    assert.ok(existsSync(fileURLToPath(registration.module)), `${id}: ${registration.module}`);
  }
  assert.deepEqual(registry.get("teacss-rs" as never)?.natives.required, ["teacss-engine"]);
  assert.deepEqual(registry.get("teacss-ts" as never)?.natives.forbidden, ["teacss-engine", "tailwindcss-oxide"]);
});
