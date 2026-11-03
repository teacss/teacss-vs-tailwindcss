import type { SubjectId } from "@bench/infrastructure";
import type { SubjectTask } from "../../contract/index.ts";
import { containsClass } from "../../css/index.ts";

/** What one published TeaCSS behaviour must do to a stylesheet. */
export interface Expectation {
  /** Classes the sheet must select. */
  readonly selects?: readonly string[];
  /** Classes the sheet must not select. */
  readonly omits?: readonly string[];
  /** Text the sheet must hold, such as a declaration. */
  readonly contains?: readonly string[];
}

export interface BehaviorCase extends Expectation {
  readonly id: string;
  /** The release that introduced the behaviour, from the 0.10 upgrade guide. */
  readonly since: string;
  readonly subjects: readonly string[];
  readonly input: { readonly tokens: readonly string[] } | { readonly modules: readonly string[]; readonly files: Readonly<Record<string, string>> };
}

const ENGINES = ["teacss-ts", "teacss-rs"];
const ENTRY_SUBJECTS = ["teacss-ts", "teacss-rs", "teacss-rs-postcss", "teacss-rs-rsbuild", "teacss-rs-bun", "teacss-ts-cli", "teacss-rs-cli"];
const HTML = '<!doctype html>\n<html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n';

function project(modules: Readonly<Record<string, string>>, others: Readonly<Record<string, string>> = {}): BehaviorCase["input"] {
  return { modules: Object.keys(modules), files: { "index.html": HTML, ...modules, ...others } };
}

/** The behaviours of the 0.10 line that a change of output would show, per the upgrade guide. Each lists a form that works next to the one that must not. */
export const BEHAVIOR_CASES: readonly BehaviorCase[] = [
  { id: "position-visibility takes only the spec spelling", since: "0.10.2", subjects: ENGINES, input: { tokens: ["position-vis:anchors-valid", "position-vis:anchor-valid"] }, contains: ["position-visibility:anchors-valid"], omits: ["position-vis:anchor-valid"] },
  { id: "hyphenate-limit-chars starts at 1", since: "0.10.2", subjects: ENGINES, input: { tokens: ["hyphenate-limit-chars:1", "hyphenate-limit-chars:0"] }, selects: ["hyphenate-limit-chars:1"], omits: ["hyphenate-limit-chars:0"] },
  { id: "only a pseudo-class may follow a pseudo-element", since: "0.10.2", subjects: ENGINES, input: { tokens: ["p:4@::before:hover", "p:4@::before.x", "p:4@>a::before[x]"] }, selects: ["p:4@::before:hover"], omits: ["p:4@::before.x", "p:4@>a::before[x]"] },
  { id: "a selector the browser rejects does not match", since: "0.10.2", subjects: ENGINES, input: { tokens: ["p:4@>*|li", "p:4@>li[data-index=1]", "p:4@>li:nth-child(foo)", "p:4@>li:hover(x)"] }, selects: ["p:4@>*|li"], omits: ["p:4@>li[data-index=1]", "p:4@>li:nth-child(foo)", "p:4@>li:hover(x)"] },
  { id: "arbitrary values space every math function and keep exponents", since: "0.10.2", subjects: ENGINES, input: { tokens: ["w:[calc(1e-3px+1px)]", "w:[round(1px+2px,1px)]", "w:[abs(1px-2px)]"] }, contains: ["calc(1e-3px + 1px)", "round(1px + 2px,1px)", "abs(1px - 2px)"] },
  { id: "rotate:[0] carries a unit", since: "0.10.2", subjects: ENGINES, input: { tokens: ["rotate:[0]"] }, contains: ["rotate:0deg"] },
  { id: "backdrop-filter keywords carry the -webkit- prefix", since: "0.10.2", subjects: ENGINES, input: { tokens: ["backdrop-filter:none"] }, contains: ["-webkit-backdrop-filter:none"] },
  { id: "@rtl guards the subject itself", since: "0.10.2", subjects: ENGINES, input: { tokens: ["p:4@rtl"] }, contains: [':is([dir="rtl"],[dir="rtl"] *)'] },
  { id: "two pseudo-elements only fail to match", since: "0.10.3", subjects: ENGINES, input: { tokens: ["p:4@::before@::after", "m:2"] }, selects: ["m:2"], omits: ["p:4@::before@::after"] },
  {
    id: "a quoted space in an array element's brackets keeps the token",
    since: "0.10.2",
    subjects: ["teacss-ts", "teacss-rs"],
    input: project({ "src/case.js": `globalThis.classes = ['p:4@_li[title="x y"]', 'm:2'];\n` }),
    selects: ['p:4@_li[title="x y"]', "m:2"],
  },
  {
    id: "a class attribute may span lines",
    since: "0.10.2",
    subjects: ["teacss-ts", "teacss-rs"],
    input: project({ "src/case.js": 'document.getElementById("app").innerHTML = `<div class="\n  p:4\n  m:2\n"></div>`;\n' }),
    selects: ["p:4", "m:2"],
  },
  {
    id: "@apply keeps a quoted space in its brackets",
    since: "0.10.2",
    subjects: ["teacss-ts", "teacss-rs"],
    input: project({ "src/case.js": 'import "./case.css";\n' }, { "src/case.css": ".panel{@apply d:none@_[data-state='a b'];}\n" }),
    contains: ["display:none"],
  },
  {
    id: "an unquoted url() before @apply is one token",
    since: "0.10.3",
    subjects: ["teacss-ts", "teacss-rs"],
    input: project({ "src/case.js": 'import "./case.css";\n' }, { "src/case.css": ".hero{background:url(https://example.com/*.png);@apply p:4;}\n" }),
    contains: ["calc(var(--spacing) * 4)"],
  },
  {
    id: "an unquoted url() in the entry does not swallow @teacss",
    since: "0.10.3",
    subjects: ENTRY_SUBJECTS,
    input: project({ "src/case.js": 'document.getElementById("app").innerHTML = `<div class="p:4 m:2"></div>`;\n' }, { "index.css": '.hero{background:url(https://example.com/*.png)}\n@presets "standard";\n@source "./src/**/*.js";\n@teacss;\n' }),
    selects: ["p:4", "m:2"],
  },
];

export interface CaseFinding {
  readonly id: string;
  readonly subject: string;
  readonly detail: string;
}

export interface CaseReport {
  /** One entry per case and subject that ran. */
  readonly passed: number;
  readonly findings: readonly CaseFinding[];
}

/** What the sheet fails of the expectation; nothing when it holds. */
export function checkExpectation(expected: Expectation, css: string): string[] {
  return [
    ...(expected.selects ?? []).filter((name) => !containsClass(css, name)).map((name) => `does not select ${name}`),
    ...(expected.omits ?? []).filter((name) => containsClass(css, name)).map((name) => `selects ${name}`),
    ...(expected.contains ?? []).filter((text) => !css.includes(text)).map((text) => `lacks ${text}`),
  ];
}

function taskFor(input: BehaviorCase["input"]): SubjectTask {
  if ("tokens" in input) return { kind: "engine", scenario: "cold", candidates: input.tokens, extra: [], includeCss: true };
  return { kind: "build", modules: input.modules, files: input.files, includeCss: true };
}

/** Runs each case on each chosen subject that it names; a subject that throws fails that case alone. */
export async function runCases(cases: readonly BehaviorCase[], chosen: ReadonlySet<SubjectId>, invoke: (subject: SubjectId, task: SubjectTask) => Promise<string | undefined>): Promise<CaseReport> {
  const findings: CaseFinding[] = [];
  let passed = 0;
  for (const entry of cases) {
    for (const subject of chosen) {
      if (!entry.subjects.includes(subject)) continue;
      try {
        const problems = checkExpectation(entry, (await invoke(subject, taskFor(entry.input))) ?? "");
        if (problems.length === 0) passed++;
        else findings.push({ id: entry.id, subject, detail: problems.join("; ") });
      } catch (error) {
        findings.push({ id: entry.id, subject, detail: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { passed, findings };
}
