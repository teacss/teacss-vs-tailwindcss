import * as nodeModule from "node:module";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPOSITORY = new URL("../../../", import.meta.url).href;
const SUBJECT_PACKAGE = new URL("../../../packages/subject-vite-baseline/package.json", import.meta.url).href;
const VITE = pathToFileURL(nodeModule.createRequire(SUBJECT_PACKAGE).resolve("vite/package.json")).href;

// A package linked from another checkout would otherwise load that checkout's own Vite and
// lightningcss beside the subject's; an install dedupes them to the subject's copies.
const SHARED: Readonly<Record<string, string>> = { vite: SUBJECT_PACKAGE, lightningcss: VITE };
// Bun has no module hooks, and a named import of them fails there; the local link is a Node-only workflow.
if (process.versions["bun"] === undefined) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) => {
      const from = SHARED[specifier];
      return from !== undefined && context.parentURL !== undefined && !context.parentURL.startsWith(REPOSITORY) ? next(specifier, { ...context, parentURL: from }) : next(specifier, context);
    },
  });
}

const { subjectMain } = await import("@bench/benchmark");
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const { stdout, exitCode } = await subjectMain(Buffer.concat(chunks).toString("utf8"));
process.stdout.write(stdout);
process.exitCode = exitCode;
