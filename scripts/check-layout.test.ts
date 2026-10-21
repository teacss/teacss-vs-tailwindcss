import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLayout } from "./check-layout.ts";
import { validWorkspace, withWorkspace } from "./fixture.ts";

test("the smallest valid workspace has no layout problems", () => {
  assert.deepEqual(withWorkspace(validWorkspace(), checkLayout), []);
});

test("a package named shared is rejected with its path", () => {
  const files = { ...validWorkspace(), "packages/shared/package.json": JSON.stringify({ name: "@bench/shared" }), "packages/shared/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json" }) };
  const problems = withWorkspace(files, checkLayout);
  assert.ok(
    problems.some((problem) => problem.path === "packages/shared" && /banned unit name/.test(problem.message)),
    JSON.stringify(problems),
  );
  assert.ok(
    problems.some((problem) => problem.path === "packages/shared" && /no layer/.test(problem.message)),
    JSON.stringify(problems),
  );
});

test("a package tsconfig that loosens strict is rejected", () => {
  const files = { ...validWorkspace(), "packages/infrastructure/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { strict: false } }) };
  const problems = withWorkspace(files, checkLayout);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ["packages/infrastructure/tsconfig.json"],
  );
  assert.match(problems[0]?.message ?? "", /compilerOptions\.strict overrides the base/);
});

test("a shell with business code outside its entry files is rejected", () => {
  const files = { ...validWorkspace(), "apps/bench/src/report.ts": "" };
  const problems = withWorkspace(files, checkLayout);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ["apps/bench/src/report.ts"],
  );
});

test("a root entry outside the layout is rejected", () => {
  const files = { ...validWorkspace(), "bench/run.mjs": "" };
  const problems = withWorkspace(files, checkLayout);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ["bench"],
  );
});

test("a package whose name does not match its directory is rejected", () => {
  const files = { ...validWorkspace(), "packages/infrastructure/package.json": JSON.stringify({ name: "@bench/infra" }) };
  const problems = withWorkspace(files, checkLayout);
  assert.match(problems[0]?.message ?? "", /must be "@bench\/infrastructure"/);
});
