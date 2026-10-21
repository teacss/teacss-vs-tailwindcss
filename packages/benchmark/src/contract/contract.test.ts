import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSubjectRequest, parseSubjectResponse } from "./index.ts";

const usage = { cpuUserMs: 1, cpuSystemMs: 1, maxRssBytes: 1 };

test("a request round-trips through JSON", () => {
  const request = { version: 1, sentAt: 5, subject: "fake", module: "file:///fake.ts", task: { kind: "engine", scenario: "incremental-10", candidates: ["p:4"], extra: [["m:2"]], includeCss: false } };
  assert.deepEqual(parseSubjectRequest(JSON.parse(JSON.stringify(request))), request);
});

test("a request from another contract version is refused", () => {
  assert.throws(() => parseSubjectRequest({ version: 2, sentAt: 0, subject: "fake", module: "x", task: { kind: "describe" } }), /version 2 is not 1/);
});

test("a response whose result kind is unknown is refused with the kind", () => {
  assert.throws(() => parseSubjectResponse({ version: 1, sentAt: 0, subject: "fake", nativeModules: [], usage, result: { kind: "verdict" } }), /unknown result kind verdict/);
});

test("a response without usage is refused", () => {
  assert.throws(() => parseSubjectResponse({ version: 1, sentAt: 0, subject: "fake", nativeModules: [], result: { kind: "describe", versions: { packages: {}, local: {} } } }), /usage shape/);
});

test("an unknown engine scenario is refused with the known ones", () => {
  assert.throws(() => parseSubjectRequest({ version: 1, sentAt: 0, subject: "fake", module: "x", task: { kind: "engine", scenario: "lukewarm", candidates: [] } }), /lukewarm is not one of cold, warm, incremental-10, incremental-100/);
});
