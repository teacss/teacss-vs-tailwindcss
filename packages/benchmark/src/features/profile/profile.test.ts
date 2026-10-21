import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeProfile } from "./index.ts";

const profile = {
  nodes: [
    { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1 } },
    { id: 2, callFrame: { functionName: "generate", url: "file:///repo/node_modules/@teacss/core/dist/index.js", lineNumber: 9 } },
    { id: 3, callFrame: { functionName: "(garbage collector)", url: "", lineNumber: -1 } },
    { id: 4, callFrame: { functionName: "", url: "file:///repo/x.js", lineNumber: 0 } },
    { id: 5, callFrame: { functionName: "(idle)", url: "", lineNumber: -1 } },
  ],
  samples: [2, 2, 3, 4, 5, 2],
  timeDeltas: [100, 200, 300, 50, 1000, 100],
};

test("self time is summed per function, idle is excluded from the top but counted in the total", () => {
  const summary = summarizeProfile(profile, 2);
  assert.equal(summary.totalMs, 1.75);
  assert.deepEqual(
    summary.top.map((frame) => [frame.name, frame.selfMs]),
    [
      ["generate (@teacss/core/dist/index.js:10)", 0.4],
      ["(garbage collector)", 0.3],
    ],
  );
  assert.ok(Math.abs((summary.top[0]?.share ?? 0) - 400 / 1750) < 1e-9);
  assert.ok(Math.abs((summary.gcShare ?? 0) - 300 / 1750) < 1e-9);
});

test("something that is not a cpuprofile is refused", () => {
  assert.throws(() => summarizeProfile({ nodes: [] }), /not a cpuprofile/);
});
