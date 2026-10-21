import assert from "node:assert/strict";
import { test } from "node:test";
import { subjectId } from "@bench/infrastructure";
import { measurePrice, NATIVE_LOAD_RUNS } from "./index.ts";

const rs = subjectId("teacss-rs");
const ts = subjectId("teacss-ts");
const tw = subjectId("tailwind-v4");
const native = { package: "@x/native-darwin-arm64", file: "x.node", path: "/x.node", bytes: 1024, platformPackages: 8 };

test("each package set installs once, native files load five times, and coverage is per subject", async () => {
  const installs: string[] = [];
  const loads: string[] = [];
  const price = await measurePrice(
    { subjects: [ts, rs, tw], installRuns: 2, coverage: { source: "/examples", entries: ["/a.css", "/dynamic.css"] } },
    {
      describe: async (subject) => ({ packages: subject === tw ? { tailwindcss: "4" } : { "@teacss/core": "0.9" }, local: {}, ...(subject === ts ? {} : { native }) }),
      loadNative: async (subject, path) => (loads.push(`${subject}:${path}`), 1.5),
      coverage: async (subject, entries) => (subject === rs ? entries.map((entry) => ({ entry, served: !entry.includes("dynamic"), reason: entry.includes("dynamic") ? "rules at rules" : undefined })) : []),
      install: async (packages) => (installs.push(Object.keys(packages).join(",")), { wallMs: 3000, installedBytes: 42 }),
      progress: () => {},
    },
  );
  assert.deepEqual(installs, ["@teacss/core", "@teacss/core", "tailwindcss", "tailwindcss"]);
  assert.equal(loads.length, 2 * NATIVE_LOAD_RUNS);
  assert.ok(loads.every((entry) => entry.endsWith(":/x.node")));
  assert.deepEqual(price.subjects["teacss-ts"]?.nativeLoadMs, []);
  assert.equal(price.subjects["teacss-ts"]?.install, price.subjects["teacss-rs"]?.install);
  assert.deepEqual(
    price.subjects["teacss-rs"]?.coverage.map((result) => result.served),
    [true, false],
  );
  assert.equal(price.coverageSource, "/examples");
});

test("installRuns 0 skips installing and no coverage source leaves coverage empty", async () => {
  const price = await measurePrice(
    { subjects: [rs], installRuns: 0, coverage: undefined },
    {
      describe: async () => ({ packages: {}, local: {}, native }),
      loadNative: async () => 1,
      coverage: async () => {
        throw new Error("not asked");
      },
      install: async () => {
        throw new Error("not asked");
      },
      progress: () => {},
    },
  );
  assert.equal(price.subjects["teacss-rs"]?.install, undefined);
  assert.deepEqual(price.subjects["teacss-rs"]?.coverage, []);
  assert.equal(price.coverageSource, undefined);
});
