import assert from "node:assert/strict";
import { test } from "node:test";
import { candidates, corpusProject, extraCases, generateCorpus, pairSpace, profileCorpus } from "./index.ts";

test("the pair space holds more cases than the largest cell and every case names its properties", () => {
  const { cases } = pairSpace();
  assert.ok(cases.length >= 20_000, `${cases.length}`);
  assert.equal(new Set(cases.map((entry) => entry.teacss)).size, cases.length);
  assert.equal(new Set(cases.map((entry) => entry.tailwind)).size, cases.length);
  assert.ok(cases.every((entry) => entry.properties.length > 0));
});

test("the same parameters give the same hash and a different seed gives another", () => {
  const first = generateCorpus({ seed: 1, utilities: 500, files: 5 });
  const second = generateCorpus({ seed: 1, utilities: 500, files: 5 });
  assert.equal(first.hash, second.hash);
  assert.deepEqual(first.cases, second.cases);
  assert.notEqual(first.hash, generateCorpus({ seed: 2, utilities: 500, files: 5 }).hash);
});

test("every cell of the scale matrix generates", () => {
  for (const utilities of [1_000, 5_000, 20_000]) {
    for (const files of [3, 30, 300]) {
      const corpus = generateCorpus({ seed: 1, utilities, files });
      assert.equal(corpus.cases.length, utilities);
      assert.equal(corpusProject(corpus, "teacss").modules.length, files);
    }
  }
});

test("more utilities than the table expresses is refused", () => {
  assert.throws(() => generateCorpus({ seed: 1, utilities: 10_000_000, files: 1 }), /pair table expresses/);
});

test("the project spreads every class over the modules with the header on each", () => {
  const corpus = generateCorpus({ seed: 3, utilities: 40, files: 4 });
  const project = corpusProject(corpus, "tailwind", "// @teacss-include\n");
  assert.deepEqual(project.modules, ["src/gen-000.js", "src/gen-001.js", "src/gen-002.js", "src/gen-003.js"]);
  const sources = project.modules.map((path) => project.files.get(path) ?? "");
  assert.ok(sources.every((source) => source.startsWith("// @teacss-include\n")));
  for (const candidate of candidates(corpus, "tailwind"))
    assert.ok(
      sources.some((source) => source.includes(candidate)),
      candidate,
    );
  assert.ok(project.files.get("index.html")?.includes('src="/src/main.js"'));
});

test("the profile counts families and conditions over the generated cases", () => {
  const profile = profileCorpus(generateCorpus({ seed: 1, utilities: 2_000, files: 2 }));
  assert.equal(
    Object.values(profile.families).reduce((sum, count) => sum + count, 0),
    2_000,
  );
  assert.ok((profile.families["spacing"] ?? 0) > 0 && (profile.families["color"] ?? 0) > 0);
  assert.ok((profile.conditionCounts["hover"] ?? 0) > 0);
});

test("extra cases are outside the corpus, distinct across groups and fixed by the seed", () => {
  const corpus = generateCorpus({ seed: 5, utilities: 2_000, files: 3 });
  const groups = extraCases(corpus, 100, 10);
  const used = new Set(corpus.cases.map((entry) => entry.teacss));
  const flat = groups.flat();
  assert.equal(flat.length, 1_000);
  assert.equal(new Set(flat.map((entry) => entry.teacss)).size, 1_000);
  assert.ok(flat.every((entry) => !used.has(entry.teacss)));
  assert.deepEqual(extraCases(corpus, 100, 10), groups);
});
