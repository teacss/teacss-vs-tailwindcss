import assert from "node:assert/strict";
import { test } from "node:test";
import { findDuplicateNatives } from "./runtime.ts";

test("an addon from two installs of one version is a duplicate; two versions are not", () => {
  const versions: Record<string, string> = { "/a/lightningcss.node": "1.33.0", "/b/lightningcss.node": "1.33.0", "/c/lightningcss.node": "1.32.0", "/a/fsevents.node": "2.3.3" };
  const versionOf = (path: string) => versions[path] ?? "unknown";
  assert.deepEqual(findDuplicateNatives(["/a/lightningcss.node", "/c/lightningcss.node", "/a/fsevents.node"], versionOf), []);
  assert.deepEqual(findDuplicateNatives(["/a/lightningcss.node", "/b/lightningcss.node", "/c/lightningcss.node"], versionOf), ["lightningcss.node@1.33.0 loaded twice: /a/lightningcss.node, /b/lightningcss.node"]);
});
