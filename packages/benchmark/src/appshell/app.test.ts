import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./index.ts";

async function run(argv: string[]): Promise<{ code: number; out: string }> {
  let out = "";
  const code = await createApp({ argv, env: {}, cwd: process.cwd(), stdout: (text) => (out += text), subjectEntry: "unused", registry: new Map() });
  return { code, out };
}

test("corpus prints the same hash twice for the same parameters and another for another seed", async () => {
  const first = await run(["corpus", "--utilities", "200", "--files", "2"]);
  const second = await run(["corpus", "--utilities=200", "--files=2"]);
  assert.equal(first.code, 0);
  assert.equal(first.out, second.out);
  assert.match(first.out, /^corpus [0-9a-f]{64}\nseed \d+ utilities 200 files 2 pair-table \d+\n$/);
  assert.notEqual((await run(["corpus", "--utilities", "200", "--files", "2", "--seed", "7"])).out, first.out);
});

test("corpus --profile prints the family and condition counts", async () => {
  const { out } = await run(["corpus", "--utilities", "300", "--files", "3", "--profile"]);
  assert.match(out, /"families": \{/);
  assert.match(out, /"conditionDepth": \{/);
});

test("a malformed count is refused with the option name", async () => {
  await assert.rejects(run(["corpus", "--utilities", "many"]), /--utilities must be a non-negative integer/);
});

test("an unknown subject name is refused with the registered names", async () => {
  await assert.rejects(run(["verify", "--subjects", "teacss-rs"]), /--subjects: unknown teacss-rs; registered are $/);
});
