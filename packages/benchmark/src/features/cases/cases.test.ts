import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import { BEHAVIOR_CASES, type BehaviorCase, checkExpectation, runCases } from "./index.ts";

test("an expectation names each class and text the sheet gets wrong", () => {
  assert.deepEqual(checkExpectation({ selects: ["p:4"], omits: ["m:2"], contains: ["color:red"] }, ".p\\:4{color:red}"), []);
  assert.deepEqual(checkExpectation({ selects: ["p:4"], omits: ["m:2"], contains: ["color:red"] }, ".m\\:2{margin:0}"), ["does not select p:4", "selects m:2", "lacks color:red"]);
});

const ts = subjectId("teacss-ts");
const rs = subjectId("teacss-rs");
const tokens: BehaviorCase = { id: "tokens", since: "0.10.2", subjects: ["teacss-ts", "teacss-rs"], input: { tokens: ["p:4"] }, selects: ["p:4"] };
const onlyRust: BehaviorCase = { id: "project", since: "0.10.3", subjects: ["teacss-rs"], input: { modules: ["src/case.js"], files: { "src/case.js": "" } }, selects: ["p:4"] };

test("a case runs on the chosen subjects it names, as an engine task or a build", async () => {
  const kinds: string[] = [];
  const report = await runCases([tokens, onlyRust], new Set([ts, rs]), async (subject, task) => {
    kinds.push(`${subject} ${task.kind}`);
    return ".p\\:4{padding:0}";
  });
  assert.deepEqual(kinds, ["teacss-ts engine", "teacss-rs engine", "teacss-rs build"]);
  assert.deepEqual(report, { passed: 3, findings: [] });
});

test("a wrong sheet and a subject that throws each fail only their own case and subject", async () => {
  const report = await runCases([tokens], new Set([ts, rs]), async (subject) => {
    if (subject === ts) throw new Error("the plugin threw");
    return "";
  });
  assert.equal(report.passed, 0);
  assert.deepEqual(
    report.findings.map((finding) => `${finding.subject}: ${finding.detail}`),
    ["teacss-ts: the plugin threw", "teacss-rs: does not select p:4"],
  );
});

test("each case checks something that a change of output would break", () => {
  for (const entry of BEHAVIOR_CASES) assert.ok((entry.selects?.length ?? 0) + (entry.contains?.length ?? 0) > 0, `${entry.id} needs a form that must work, or an absence proves nothing`);
});
