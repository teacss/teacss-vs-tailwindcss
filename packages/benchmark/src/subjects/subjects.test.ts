import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import { createApp } from "../appshell/index.ts";
import { invokeSubject, SubjectProcessError } from "./index.ts";

const dir = mkdtempSync(join(tmpdir(), "bench-subject-entry-"));
const subjectEntry = join(dir, "subject.mjs");
writeFileSync(
  subjectEntry,
  `import { subjectMain } from ${JSON.stringify(new URL("../appshell/subject-main.ts", import.meta.url).href)};
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { stdout, exitCode } = await subjectMain(input);
process.stdout.write(stdout);
process.exitCode = exitCode;
`,
);
after(() => rmSync(dir, { recursive: true, force: true }));

const fake = subjectId("fake");
const fakeModule = import.meta.resolve("@bench/infrastructure/test-support/fake-subject");
const registration = { env: {}, syntax: "teacss" as const, engineTier: true, natives: { required: [], forbidden: [] } };
const registry = new Map([[fake, { ...registration, module: fakeModule }]]);
const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
const deps = { subjectEntry, cwd: process.cwd(), env, timeoutMs: 30_000 };

test("a subject process answers describe, engine and build and reports no native module", async () => {
  const describe = await invokeSubject(registry, fake, { kind: "describe" }, deps);
  assert.deepEqual(describe.response.result, { kind: "describe", versions: { packages: { fake: "0.0.0" } } });
  assert.deepEqual(describe.response.nativeModules, []);
  assert.ok(describe.response.usage.cpuUserMs > 0);

  const cold = await invokeSubject(registry, fake, { kind: "engine", scenario: "cold", candidates: ["p:4", "m:2"], includeCss: true }, deps);
  assert.equal(cold.response.result.kind === "engine" && cold.response.result.samples.length, 1);

  const build = await invokeSubject(registry, fake, { kind: "build", modules: ["src/main.js"], files: { "src/main.js": "x" }, includeCss: false }, deps);
  assert.equal(build.response.result.kind === "build" && build.response.result.cssBytes, ".built{}".length);
  assert.ok(build.process.wallMs > 0);
});

test("a subject that throws fails the invocation with its message", async () => {
  const failing = new Map([[fake, { ...registration, module: import.meta.resolve("@bench/infrastructure/test-support/failing-subject") }]]);
  await assert.rejects(invokeSubject(failing, fake, { kind: "engine", scenario: "cold", candidates: ["p:4"], includeCss: false }, deps), (error: unknown) => error instanceof SubjectProcessError && /planted engine failure/.test(error.message));
});

test("an unregistered subject is refused before any process starts", async () => {
  await assert.rejects(invokeSubject(registry, subjectId("ghost"), { kind: "describe" }, deps), /not a registered subject/);
});

test("bench subjects prints each registered subject's versions through its process", async () => {
  let out = "";
  assert.equal(await createApp({ argv: ["subjects"], env, cwd: process.cwd(), stdout: (text) => (out += text), subjectEntry, registry }), 0);
  assert.equal(out, "fake: fake@0.0.0 (native: none)\n");
});
