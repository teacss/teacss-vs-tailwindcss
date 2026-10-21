import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommunityPool, communityCorpus, utilityPrefix } from "./community.ts";
import { pairSpace } from "./index.ts";

const repositories = [{ name: "site", dir: "/site", commit: "abc" }];

test("utilityPrefix drops variants and keeps the utility's family", () => {
  assert.equal(utilityPrefix("hover:md:bg-red-500"), "bg");
  assert.equal(utilityPrefix("p-[3px]"), "p");
  assert.equal(utilityPrefix("-mt-4"), "-mt");
  assert.equal(utilityPrefix("flex"), "flex");
});

test("the pool keeps translatable classes most frequent first and tallies the rest by prefix", () => {
  const pool = buildCommunityPool(repositories, [
    ["p-4", 3],
    ["flex", 50],
    ["hover:bg-red-500", 9],
    ["items-center", 40],
    ["flex-col", 7],
  ]);
  assert.equal(pool.found, 5);
  assert.deepEqual(
    pool.kept.map((entry) => entry.tailwind),
    ["hover:bg-red-500", "p-4"],
  );
  assert.deepEqual(pool.untranslated, [
    ["flex", 57],
    ["items", 40],
  ]);
});

test("every kept case translates back to the candidate it came from", () => {
  const sample = pairSpace()
    .cases.slice(0, 500)
    .map((entry) => [entry.tailwind, 1] as const);
  const pool = buildCommunityPool(repositories, sample);
  assert.equal(pool.kept.length, 500);
  const teacss = new Map(pairSpace().cases.map((entry) => [entry.teacss, entry.tailwind]));
  assert.ok(pool.kept.every((entry) => teacss.get(entry.teacss) === entry.tailwind));
});

test("a community corpus takes the most frequent classes and shrinks to what exists", () => {
  const pool = buildCommunityPool(repositories, [
    ["p-4", 3],
    ["m-2", 5],
  ]);
  const corpus = communityCorpus(pool, 1000, 30, 1);
  assert.deepEqual(
    corpus.cases.map((entry) => entry.tailwind),
    ["m-2", "p-4"],
  );
  assert.deepEqual(corpus.parameters, { seed: 1, utilities: 2, files: 2 });
  assert.equal(corpus.hash, communityCorpus(pool, 1000, 30, 1).hash);
  assert.throws(() => communityCorpus(buildCommunityPool(repositories, [["flex", 1]]), 10, 1, 1), /no class the pair table can translate/);
});
