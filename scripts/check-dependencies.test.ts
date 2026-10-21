import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDependencies } from "./check-dependencies.ts";
import { validWorkspace, withWorkspace } from "./fixture.ts";

function manifest(name: string, dependencies: Readonly<Record<string, string>>): string {
  return JSON.stringify({ name, dependencies });
}

test("the smallest valid workspace has no dependency problems", () => {
  assert.deepEqual(withWorkspace(validWorkspace(), checkDependencies), []);
});

test("a foundation package depending upward on the product is rejected", () => {
  const files = { ...validWorkspace(), "packages/infrastructure/package.json": manifest("@bench/infrastructure", { "@bench/benchmark": "workspace:*" }) };
  const problems = withWorkspace(files, checkDependencies);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ["packages/infrastructure/package.json"],
  );
  assert.match(problems[0]?.message ?? "", /foundation "@bench\/infrastructure" may not depend on product "@bench\/benchmark"/);
});

test("an isolation package depending on the product is rejected", () => {
  const files = { ...validWorkspace(), "packages/subject-fake/package.json": manifest("@bench/subject-fake", { "@bench/benchmark": "workspace:*" }) };
  const problems = withWorkspace(files, checkDependencies);
  assert.match(problems[0]?.message ?? "", /isolation "@bench\/subject-fake" may not depend on product/);
});

test("a shell that skips the product or reaches an isolation unit directly is rejected", () => {
  const files = { ...validWorkspace(), "apps/bench/package.json": manifest("@bench/bench", { "@bench/subject-fake": "workspace:*" }) };
  const messages = withWorkspace(files, checkDependencies).map((problem) => problem.message);
  assert.equal(messages.length, 2, messages.join("\n"));
  assert.match(messages[0] ?? "", /shell "@bench\/bench" may not depend on isolation/);
  assert.match(messages[1] ?? "", /exactly one product, found 0/);
});

test("a workspace dependency pinned to a version instead of the workspace protocol is rejected", () => {
  const files = { ...validWorkspace(), "apps/bench/package.json": manifest("@bench/bench", { "@bench/benchmark": "0.0.0" }) };
  const problems = withWorkspace(files, checkDependencies);
  assert.match(problems[0]?.message ?? "", /must use the workspace protocol/);
});
