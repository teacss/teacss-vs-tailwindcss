import type { PairedCase } from "../corpus/index.ts";
import { escapeClass, type ParsedRule, parseRules } from "./css.ts";

export { escapeClass, parseRules } from "./css.ts";

export interface Mismatch {
  readonly candidate: string;
  readonly reason: string;
}

export interface CheckResult {
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
}

/** Longhand pairs that mean the logical shorthand the pair table names. */
const LOGICAL: readonly [longhands: readonly string[], logical: string][] = [
  [["padding-left", "padding-right"], "padding-inline"],
  [["padding-top", "padding-bottom"], "padding-block"],
  [["margin-left", "margin-right"], "margin-inline"],
  [["margin-top", "margin-bottom"], "margin-block"],
];

function normalizeProperties(properties: readonly string[]): Set<string> {
  const set = new Set(properties);
  for (const [longhands, logical] of LOGICAL) {
    if (longhands.every((property) => set.has(property))) {
      for (const property of longhands) set.delete(property);
      set.add(logical);
    }
  }
  return set;
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
  for (const entry of cases) {
    const candidate = entry[syntax];
    const escaped = escapeClass(candidate);
    const matching = bySelector.get(escaped);
    if (matching === undefined) {
      mismatches.push({ candidate, reason: "no rule selects it" });
      continue;
    }
    const properties = normalizeProperties(matching.flatMap((match) => match.rule.properties));
    const missing = entry.properties.filter((property) => !properties.has(property));
    if (missing.length > 0) mismatches.push({ candidate, reason: `declares ${sorted([...properties]) || "nothing"}, expected ${sorted(entry.properties)}` });
    const expected = sorted(expectedShapes(entry.conditions));
    const actual = matching.map((match) => sorted(actualShapes(match, escaped)));
    if (!actual.includes(expected)) mismatches.push({ candidate, reason: `conditions ${actual.join(" | ") || "none"}, expected ${expected || "none"}` });
  }
  return { checked: cases.length, mismatches };
}

export interface StrongResult {
  readonly identical: boolean;
  readonly leftSha256: string;
  readonly rightSha256: string;
}

export function checkIdentical(leftSha256: string, rightSha256: string): StrongResult {
  return { identical: leftSha256 === rightSha256, leftSha256, rightSha256 };
}

export interface NativeExpectation {
  /** Prefixes of `.node` file names the process must have loaded. */
  readonly required: readonly string[];
  /** Prefixes it must not have loaded. */
  readonly forbidden: readonly string[];
}

export function checkNativeModules(loaded: readonly string[], expectation: NativeExpectation): string[] {
  const problems: string[] = [];
  for (const prefix of expectation.required) if (!loaded.some((name) => name.startsWith(prefix))) problems.push(`did not load ${prefix}`);
  for (const prefix of expectation.forbidden) if (loaded.some((name) => name.startsWith(prefix))) problems.push(`loaded ${prefix}`);
  return problems;
}
