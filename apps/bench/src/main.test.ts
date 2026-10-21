import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("the bench entry starts under Node and prints its status", () => {
  const result = spawnSync(process.execPath, [new URL("./main.ts", import.meta.url).pathname, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^bench: /);
});
