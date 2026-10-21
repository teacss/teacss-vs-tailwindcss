import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "@bench/infrastructure/test-support";
import { parseSubjectResponse } from "../contract/index.ts";
import { subjectMain } from "./subject-main.ts";

const fakeModule = import.meta.resolve("@bench/infrastructure/test-support/fake-subject");
const failingModule = import.meta.resolve("@bench/infrastructure/test-support/failing-subject");
const deps = { clock: fakeClock() };

function request(task: unknown, module = fakeModule): string {
  return JSON.stringify({ version: 1, sentAt: 0, subject: "fake", module, task });
}

test("describe, engine and build answer through the fake module", async () => {
  const describe = parseSubjectResponse(JSON.parse((await subjectMain(request({ kind: "describe" }), deps)).stdout));
  assert.deepEqual(describe.result, { kind: "describe", versions: { packages: { fake: "0.0.0" }, local: {} } });
  assert.ok(describe.usage.maxRssBytes > 0);

  const engine = parseSubjectResponse(JSON.parse((await subjectMain(request({ kind: "engine", scenario: "warm", candidates: ["p:4"], includeCss: false }), deps)).stdout));
  assert.equal(engine.result.kind === "engine" && engine.result.samples.length, 10);

  const build = await subjectMain(request({ kind: "build", modules: ["src/main.js"], files: { "src/main.js": "document.body.innerHTML = '<div class=\"p:4\"></div>'" }, includeCss: true }), deps);
  assert.equal(build.exitCode, 0);
  const parsed = parseSubjectResponse(JSON.parse(build.stdout));
  assert.equal(parsed.result.kind === "build" && parsed.result.cssBytes, ".built{}".length);
});

test("a subject that throws yields an error result and exit code 1", async () => {
  const result = await subjectMain(request({ kind: "engine", scenario: "cold", candidates: ["p:4"], includeCss: false }, failingModule), deps);
  assert.equal(result.exitCode, 1);
  const parsed = parseSubjectResponse(JSON.parse(result.stdout));
  assert.equal(parsed.result.kind === "error" && parsed.result.message, "planted engine failure");
});

test("a module whose subject id differs from the request is refused", async () => {
  const result = await subjectMain(JSON.stringify({ version: 1, sentAt: 0, subject: "other", module: fakeModule, task: { kind: "describe" } }), deps);
  assert.equal(result.exitCode, 1);
  const parsed = parseSubjectResponse(JSON.parse(result.stdout));
  assert.match(parsed.result.kind === "error" ? parsed.result.message : "", /created subject "fake", the request asked for "other"/);
});
