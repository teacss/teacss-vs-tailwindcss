import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import { generateCorpus } from "../../corpus/index.ts";
import { countOutput } from "../../css/index.ts";
import { checkNativeModules, checkStructure, escapeClass, parseRules } from "./index.ts";
import { verifyCorpus } from "./run.ts";

const cases = [
  { teacss: "p:4", tailwind: "p-4", properties: ["padding"], conditions: [] },
  { teacss: "p-x:4@hover@md", tailwind: "hover:md:px-4", properties: ["padding-inline"], conditions: ["hover", "md"] },
  { teacss: "m:2@first@max-md", tailwind: "first:max-md:m-2", properties: ["margin"], conditions: ["first", "max-md"] },
];

const teacssCss = ".p\\:4{padding:1px}@media (min-width: 1024px){.p-x\\:4\\@hover\\@md:hover{padding-left:1px;padding-right:1px}}@media (max-width: 1024px){.m\\:2\\@first\\@max-md:first-child{margin:2px}}";
const tailwindCss = ".p-4{padding:1px}@media (hover: hover){@media (width >= 48rem){.hover\\:md\\:px-4:hover{padding-inline:1px}}}@media (width < 48rem){.first\\:max-md\\:m-2:first-child{margin:2px}}";

test("escapeClass matches what both tools emit", () => {
  assert.equal(escapeClass("p:[7%]@active"), "p\\:\\[7\\%\\]\\@active");
  assert.equal(escapeClass("hover:bg-red-500/10"), "hover\\:bg-red-500\\/10");
});

test("parseRules keeps the enclosing at-rules and the declared properties", () => {
  const rules = parseRules(tailwindCss);
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[1]?.atRules, ["@media (hover: hover)", "@media (width >= 48rem)"]);
  assert.deepEqual(rules[1]?.properties, ["padding-inline"]);
});

test("both syntaxes pass the structural check, longhand pairs counting as the logical property", () => {
  assert.deepEqual(checkStructure(cases, "teacss", teacssCss).mismatches, []);
  assert.deepEqual(checkStructure(cases, "tailwind", tailwindCss).mismatches, []);
});

test("a logical shorthand printed as its -start and -end longhands matches and is counted; one longhand alone does not", () => {
  const inline = [{ teacss: "p-x:4", tailwind: "px-4", properties: ["padding-inline"], conditions: [] }];
  const shorthand = checkStructure(inline, "tailwind", ".px-4{padding-inline:1px}");
  assert.deepEqual([shorthand.mismatches, shorthand.longhandMatches], [[], 0]);
  const longhands = checkStructure(inline, "tailwind", ".px-4{padding-inline-start:1px;padding-inline-end:1px}");
  assert.deepEqual([longhands.mismatches, longhands.longhandMatches], [[], 1]);
  const half = checkStructure(inline, "tailwind", ".px-4{padding-inline-start:1px}");
  assert.deepEqual([half.mismatches.map((mismatch) => mismatch.reason), half.longhandMatches], [["declares padding-inline-start, expected padding-inline"], 0]);
  assert.equal(checkStructure(cases, "teacss", teacssCss).longhandMatches, 0);
});

test("a merged selector list keeps each selector's own pseudo-classes", () => {
  const merged = [
    { teacss: "p:4@hover", tailwind: "hover:p-4", properties: ["padding"], conditions: ["hover"] },
    { teacss: "m:2@first", tailwind: "first:m-2", properties: ["margin"], conditions: ["first"] },
  ];
  assert.deepEqual(checkStructure(merged, "teacss", ".p\\:4\\@hover:hover,.m\\:2\\@first:first-child{padding:1px;margin:2px}").mismatches, []);
});

test("a negated min-width media query counts as max-width, as lightningcss writes it", () => {
  const cases = [{ teacss: "p:4@max-md", tailwind: "max-md:p-4", properties: ["padding"], conditions: ["max-md"] }];
  assert.deepEqual(checkStructure(cases, "tailwind", "@media not all and (width>=48rem){.max-md\\:p-4{padding:1px}}").mismatches, []);
});

test("a missing selector, a missing property and a wrong condition are each named", () => {
  const broken = ".p-4{color:red}@media (width >= 48rem){.hover\\:md\\:px-4{padding-inline:1px}}";
  const { mismatches } = checkStructure(cases, "tailwind", broken);
  assert.deepEqual(
    mismatches.map((mismatch) => `${mismatch.candidate}: ${mismatch.reason}`),
    ["p-4: declares color, expected padding", "hover:md:px-4: conditions min-width, expected hover,min-width", "first:max-md:m-2: no rule selects it"],
  );
});

test("native module expectations name what was missing or forbidden", () => {
  assert.deepEqual(checkNativeModules(["teacss-engine.darwin-arm64.node", "fsevents.node"], { required: ["teacss-engine"], forbidden: ["tailwindcss-oxide"] }, "engine"), []);
  assert.deepEqual(checkNativeModules(["fsevents.node"], { required: ["teacss-engine"], forbidden: ["fsevents"] }, "build"), ["did not load teacss-engine", "loaded fsevents"]);
  assert.deepEqual(checkNativeModules(["lightningcss.node"], { required: [], requiredToBuild: ["tailwindcss-oxide"], forbidden: [] }, "engine"), []);
  assert.deepEqual(checkNativeModules(["lightningcss.node"], { required: [], requiredToBuild: ["tailwindcss-oxide"], forbidden: [] }, "dev"), ["did not load tailwindcss-oxide"]);
});

test("countOutput counts style rules and their declarations, inside at-rules too", () => {
  assert.deepEqual(countOutput(".a{color:red;margin:0}@media (width>=1px){.b{padding:0}}"), { rules: 2, declarations: 3 });
});

test("containsClass needs the class to end at a selector boundary", async () => {
  const { containsClass } = await import("../../css/index.ts");
  assert.equal(containsClass(".p-10{padding:1px}", "p-1"), false);
  assert.equal(containsClass(".p-10{padding:1px}.p-1:hover{padding:0}", "p-1"), true);
  assert.equal(containsClass(".a .p\\:4\\@hover{x:y}", "p:4@hover"), true);
  assert.equal(containsClass(":is(.p-1){x:y}", "p-1"), true);
  assert.equal(containsClass(".p-1", "p-1"), true);
});

test("each teacss-ts subject is checked byte for byte against its teacss-rs twin in the same group", async () => {
  const subject = (id: string) => ({ id: subjectId(id), syntax: "teacss" as const, tiers: ["build"] as const, natives: { required: [], forbidden: [] } });
  const subjects = ["teacss-ts", "teacss-rs", "teacss-ts-bun", "teacss-rs-bun", "teacss-ts-rsbuild"].map(subject);
  const hashes: Record<string, string> = { "teacss-ts": "same", "teacss-rs": "same", "teacss-ts-bun": "aaaa", "teacss-rs-bun": "bbbb", "teacss-ts-rsbuild": "cccc" };
  const report = await verifyCorpus(generateCorpus({ seed: 1, utilities: 5, files: 1 }), subjects, async (id) => ({ css: "", cssSha256: hashes[id] ?? "", nativeModules: [] }));
  assert.deepEqual(
    report.findings.filter((finding) => finding.check === "strong").map((finding) => `${finding.subject} ${finding.tier}`),
    ["teacss-ts-bun vs teacss-rs-bun build"],
  );
});
