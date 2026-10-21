import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeClock } from "@bench/infrastructure/test-support";
import { escapeClass } from "../../css/index.ts";
import { cssOfStylesheetModule, type DevIo, runDevScenario, stylesheetPath } from "./dev-scenario.ts";

function stylesheetModule(classes: readonly string[], sends: readonly string[] = []): string {
  const css = classes.map((name) => `.${escapeClass(name)}{color:red}`).join("\n");
  return `import { updateStyle } from "/@vite/client";\nconst __vite__id = "/s.css"\nconst __vite__css = ${JSON.stringify(css)}\n${sends.map((event) => `import.meta.hot.send(${JSON.stringify(event)});`).join("\n")}`;
}

/** A server that learns classes only from module requests, like TeaCSS, after `lag` stylesheet polls. */
function fakeServer(initial: readonly string[], options: { lag?: number; sends?: readonly string[]; entry?: string } = {}) {
  const files = new Map<string, string>([["src/main.js", 'import "./gen-000.js";\n']]);
  const known = new Set(initial);
  const pending: string[] = [];
  const log: string[] = [];
  let polls = 0;
  const io: DevIo = {
    write: (path, content) => (log.push(`write ${path}`), files.set(path, content)),
    append: (path, content) => (log.push(`append ${path}`), files.set(path, (files.get(path) ?? "") + content)),
    fetch: async (path) => {
      log.push(`GET ${path}`);
      if (path === "/src/main.js") return options.entry ?? 'import "/src/gen-000.js";\nimport "/__tea.css";\n';
      if (path === "/__tea.css") {
        polls++;
        if (pending.length > 0 && polls > (options.lag ?? 0)) for (const name of pending.splice(0)) known.add(name);
        return stylesheetModule([...known], options.sends);
      }
      const source = files.get(path.slice(1)) ?? "";
      pending.push(...(/class="([^"]*)"/.exec(source)?.[1]?.split(" ").filter(Boolean) ?? []));
      return source;
    },
    sendHot: (event) => log.push(`hot ${event}`),
    sleep: async () => {},
  };
  return { io, log };
}

test("cssOfStylesheetModule and stylesheetPath read Vite's dev forms", () => {
  assert.equal(cssOfStylesheetModule(stylesheetModule(["p:4"])), ".p\\:4{color:red}");
  assert.equal(stylesheetPath('import "/src/a.js";\nimport "/src/style.css";\n'), "/src/style.css");
  assert.throws(() => stylesheetPath('import "/src/a.js";'), /imports no stylesheet/);
});

test("the protocol loads the page, replays the stylesheet's HMR events, then times each round", async () => {
  const { io, log } = fakeServer(["p:4"], { sends: ["teacss:css-ready"] });
  const run = await runDevScenario({ modules: ["src/gen-000.js"], corpusClasses: ["p:4"], extra: [["m:1", "m:2"], ["m:3"]], moduleHeader: "// @teacss-include\n" }, io, fakeClock());
  assert.equal(run.samples.length, 2);
  assert.ok(run.css.includes(".m\\:3"));
  assert.deepEqual(log.slice(0, 4), ["GET /src/main.js", "GET /src/gen-000.js", "GET /__tea.css", "hot teacss:css-ready"]);
  const round = log.indexOf("write src/dev-000.js");
  assert.deepEqual(log.slice(round, round + 4), ["write src/dev-000.js", "append src/main.js", "GET /src/main.js", "GET /src/dev-000.js"]);
});

test("a stylesheet that lags is polled until every new class is there", async () => {
  const { io } = fakeServer(["p:4"], { lag: 4 });
  const run = await runDevScenario({ modules: [], corpusClasses: ["p:4"], extra: [["m:1"]], moduleHeader: "" }, io, fakeClock());
  assert.ok((run.samples[0]?.polls ?? 0) >= 2);
});

test("a class that never appears invalidates the run after the timeout", async () => {
  const { io } = fakeServer(["p:4"]);
  const silent: DevIo = { ...io, fetch: async (path) => (path === "/__tea.css" ? stylesheetModule(["p:4"]) : io.fetch(path)) };
  await assert.rejects(runDevScenario({ modules: [], corpusClasses: ["p:4"], extra: [["m:1"]], moduleHeader: "" }, silent, fakeClock(1_000_000_000n)), /round 0: 1 class\(es\) still missing after 30000 ms, first m:1/);
});

test("an incomplete first stylesheet is waited for, and a missing one fails before any round", async () => {
  const { io } = fakeServer([]);
  await assert.rejects(runDevScenario({ modules: [], corpusClasses: ["p:4"], extra: [["m:1"]], moduleHeader: "" }, io, fakeClock(1_000_000_000n)), /first stylesheet: 1 class\(es\) still missing/);
});
