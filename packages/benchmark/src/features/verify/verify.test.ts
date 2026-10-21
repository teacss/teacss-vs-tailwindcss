import assert from "node:assert/strict";
import { test } from "node:test";
import { countOutput } from "../../css/index.ts";
import { checkNativeModules, checkStructure, escapeClass, parseRules } from "./index.ts";

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
  assert.deepEqual(checkNativeModules(["teacss-engine.darwin-arm64.node", "fsevents.node"], { required: ["teacss-engine"], forbidden: ["tailwindcss-oxide"] }), []);
  assert.deepEqual(checkNativeModules(["fsevents.node"], { required: ["teacss-engine"], forbidden: ["fsevents"] }), ["did not load teacss-engine", "loaded fsevents"]);
});

test("countOutput counts style rules and their declarations, inside at-rules too", () => {
  assert.deepEqual(countOutput(".a{color:red;margin:0}@media (width>=1px){.b{padding:0}}"), { rules: 2, declarations: 3 });
});
