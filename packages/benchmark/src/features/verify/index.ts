import { LEADING_CLASS, type PairedCase } from "../../corpus/index.ts";
import { containsClass, escapeClass, type ParsedRule, parseRules } from "../../css/index.ts";

export { escapeClass, parseRules } from "../../css/index.ts";

export interface Mismatch {
  readonly candidate: string;
  readonly reason: string;
}

export interface CheckResult {
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
  /** Cases whose logical shorthand was declared as its `-start` and `-end` longhands (spec v03.1 §Equivalence). */
  readonly longhandMatches: number;
}

/** Longhand pairs that mean the logical shorthand the pair table names. */
const PHYSICAL: readonly [longhands: readonly string[], logical: string][] = [
  [["padding-left", "padding-right"], "padding-inline"],
  [["padding-top", "padding-bottom"], "padding-block"],
  [["margin-left", "margin-right"], "margin-inline"],
  [["margin-top", "margin-bottom"], "margin-block"],
];

/** A bundler may print a logical shorthand as its two logical longhands. */
const LOGICAL: readonly [longhands: readonly string[], logical: string][] = ["padding-inline", "padding-block", "margin-inline", "margin-block", "inset-inline", "inset-block"].map((logical) => [[`${logical}-start`, `${logical}-end`], logical]);

function normalizeProperties(properties: readonly string[]): { readonly properties: Set<string>; readonly viaLonghands: boolean } {
  const set = new Set(properties);
  let viaLonghands = false;
  for (const [table, logicalLonghands] of [
    [PHYSICAL, false],
    [LOGICAL, true],
  ] as const) {
    for (const [longhands, logical] of table) {
      if (longhands.every((property) => set.has(property))) {
        for (const property of longhands) set.delete(property);
        if (logicalLonghands && !set.has(logical)) viaLonghands = true;
        set.add(logical);
      }
    }
  }
  return { properties: set, viaLonghands };
}

type ConditionShape = "hover" | "focus" | "active" | "first" | "min-width" | "max-width";

const PSEUDO: readonly [suffix: string, shape: ConditionShape][] = [
  [":hover", "hover"],
  [":focus", "focus"],
  [":active", "active"],
  [":first-child", "first"],
];

/**
 * Both tools write breakpoints as width media queries; `(hover: hover)` guards are part of hover, not a
 * breakpoint, and lightningcss spells `(width < 48rem)` as `not all and (width>=48rem)`.
 */
function shapeOfAtRule(prelude: string): ConditionShape | undefined {
  if (!prelude.startsWith("@media")) return undefined;
  const negated = /^@media\s+not\b/.test(prelude);
  if (/min-width|width\s*>=/.test(prelude)) return negated ? "max-width" : "min-width";
  if (/max-width|width\s*</.test(prelude)) return negated ? "min-width" : "max-width";
  return undefined;
}

function expectedShapes(conditions: readonly string[]): ConditionShape[] {
  return conditions.map((condition) => {
    if (condition === "sm" || condition === "md" || condition === "lg") return "min-width";
    if (condition.startsWith("max-")) return "max-width";
    return condition as ConditionShape;
  });
}

interface Match {
  /** One selector of a possibly merged selector list, so another selector's pseudo-classes do not leak in. */
  readonly selector: string;
  readonly rule: ParsedRule;
}

function actualShapes(match: Match, escaped: string): ConditionShape[] {
  const shapes: ConditionShape[] = [];
  const after = match.selector.slice(match.selector.indexOf(escaped) + escaped.length);
  for (const [suffix, shape] of PSEUDO) if (after.includes(suffix)) shapes.push(shape);
  for (const atRule of match.rule.atRules) {
    const shape = shapeOfAtRule(atRule);
    if (shape !== undefined) shapes.push(shape);
  }
  return shapes;
}

function sorted(values: readonly string[]): string {
  return [...values].sort().join(",");
}

/** Spec v01.1 §Equivalence, coverage and structural: every case's selector exists, sets its properties under its conditions. */
export function checkStructure(cases: readonly PairedCase[], syntax: "teacss" | "tailwind", css: string): CheckResult {
  const rules = parseRules(css);
  const bySelector = new Map<string, Match[]>();
  for (const rule of rules) {
    for (const selector of rule.selector.split(",")) {
      const escaped = selector.trim().match(/\.((?:\\.|[a-zA-Z0-9_-])+)/)?.[1];
      if (escaped === undefined) continue;
      const list = bySelector.get(escaped) ?? [];
      list.push({ selector: selector.trim(), rule });
      bySelector.set(escaped, list);
    }
  }
  const mismatches: Mismatch[] = [];
  let longhandMatches = 0;
  for (const entry of cases) {
    const candidate = entry[syntax];
    const escaped = escapeClass(candidate);
    const matching = bySelector.get(escaped);
    if (matching === undefined) {
      mismatches.push({ candidate, reason: "no rule selects it" });
      continue;
    }
    const { properties, viaLonghands } = normalizeProperties(matching.flatMap((match) => match.rule.properties));
    const missing = entry.properties.filter((property) => !properties.has(property));
    if (missing.length > 0) mismatches.push({ candidate, reason: `declares ${sorted([...properties]) || "nothing"}, expected ${sorted(entry.properties)}` });
    else if (viaLonghands) longhandMatches++;
    const expected = sorted(expectedShapes(entry.conditions));
    const actual = matching.map((match) => sorted(actualShapes(match, escaped)));
    if (!actual.includes(expected)) mismatches.push({ candidate, reason: `conditions ${actual.join(" | ") || "none"}, expected ${expected || "none"}` });
  }
  return { checked: cases.length, mismatches, longhandMatches };
}

export interface StrongResult {
  readonly identical: boolean;
  readonly leftSha256: string;
  readonly rightSha256: string;
}

export function checkIdentical(leftSha256: string, rightSha256: string): StrongResult {
  return { identical: leftSha256 === rightSha256, leftSha256, rightSha256 };
}

const CLASS_IN_SELECTOR = /\.((?:\\.|[a-zA-Z0-9_-])+)/;

/** Every class a sheet selects, with the properties its rules declare. */
function classProperties(css: string): Map<string, Set<string>> {
  const classes = new Map<string, Set<string>>();
  for (const rule of parseRules(css)) {
    for (const selector of rule.selector.split(",")) {
      const name = selector.trim().match(CLASS_IN_SELECTOR)?.[1];
      if (name === undefined) continue;
      const properties = classes.get(name) ?? new Set<string>();
      for (const property of rule.properties) properties.add(property);
      classes.set(name, properties);
    }
  }
  return classes;
}

/**
 * Spec v01.1 revision 9, §Equivalence: two builds of one project select the same classes with the same properties.
 * This is the build tier's check for a pair of bundler plugins, whose post-processing differs since 0.10.
 */
export function checkSameRules(left: string, right: string): Mismatch[] {
  const leftClasses = classProperties(left);
  const rightClasses = classProperties(right);
  const mismatches: Mismatch[] = [];
  for (const candidate of new Set([...leftClasses.keys(), ...rightClasses.keys()])) {
    const leftProperties = sorted([...(leftClasses.get(candidate) ?? [])]);
    const rightProperties = sorted([...(rightClasses.get(candidate) ?? [])]);
    if (!leftClasses.has(candidate) || !rightClasses.has(candidate)) mismatches.push({ candidate, reason: `only the ${leftClasses.has(candidate) ? "left" : "right"} side selects it` });
    else if (leftProperties !== rightProperties) mismatches.push({ candidate, reason: `declares ${leftProperties} against ${rightProperties}` });
  }
  return mismatches;
}

/** A sheet with each bundled font's URL reduced to its digest: the two CLIs inline a font or write it to a file, the same font either way. */
export function withFontDigests(css: string): string {
  return css.replaceAll(/url\("?[^"')]*?teacss[=-](?:v1-)?([0-9a-f]{64})[^"')]*"?\)/g, "url(font-$1)");
}

/** Spec v01.1 revision 9, §Equivalence: a stylesheet ahead of the tool's own survives, stays ahead, and takes no utility with it. */
export function checkLeadingStylesheet(cases: readonly PairedCase[], syntax: "teacss" | "tailwind", css: string): readonly Mismatch[] {
  if (!containsClass(css, LEADING_CLASS)) return [{ candidate: LEADING_CLASS, reason: "the stylesheet ahead of the tool's own is gone" }];
  const ahead = css.slice(0, css.indexOf(`.${LEADING_CLASS}`));
  const { mismatches } = checkStructure(cases, syntax, css);
  const overtaking = cases.find((entry) => ahead.includes(`.${escapeClass(entry[syntax])}`));
  return overtaking === undefined ? mismatches : [...mismatches, { candidate: overtaking[syntax], reason: `comes before ${LEADING_CLASS}` }];
}

export { checkNativeModules, type NativeExpectation } from "../../contract/index.ts";
