import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./subject.ts", import.meta.url));

test("the subject process boots, answers a malformed request with an error response and exits 1", () => {
  const result = spawnSync(process.execPath, [entry], { encoding: "utf8", input: JSON.stringify({ version: 1, sentAt: 0, subject: "fake", module: "x" }) });
  assert.equal(result.status, 1, result.stderr);
  const response: unknown = JSON.parse(result.stdout);
  assert.ok(typeof response === "object" && response !== null && "result" in response);
  assert.match(result.stdout, /task is not an object/);
});
