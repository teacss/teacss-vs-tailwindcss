/**
 * The pair table (spec v01.1 §Corpus, ADR-0002): every family both tools support natively, each
 * entry naming the TeaCSS form, the Tailwind form, the CSS properties it sets and nothing else.
 * Bump the version when an entry changes; the corpus hash covers the generated cases, not this file.
 */
export const PAIR_TABLE_VERSION = 1;

export interface PairedCase {
  readonly teacss: string;
  readonly tailwind: string;
  readonly properties: readonly string[];
  readonly conditions: readonly string[];
}

interface Base {
  readonly teacss: string;
  readonly tailwind: string;
  readonly properties: readonly string[];
  readonly family: string;
}

interface Condition {
  readonly name: string;
  readonly teacss: string;
  readonly tailwind: string;
}

const SPACING: readonly { teacss: string; tailwind: string; properties: readonly string[] }[] = [
  { teacss: "p", tailwind: "p", properties: ["padding"] },
  { teacss: "p-t", tailwind: "pt", properties: ["padding-top"] },
  { teacss: "p-b", tailwind: "pb", properties: ["padding-bottom"] },
  { teacss: "p-x", tailwind: "px", properties: ["padding-inline"] },
  { teacss: "p-y", tailwind: "py", properties: ["padding-block"] },
  { teacss: "m", tailwind: "m", properties: ["margin"] },
  { teacss: "m-t", tailwind: "mt", properties: ["margin-top"] },
  { teacss: "m-b", tailwind: "mb", properties: ["margin-bottom"] },
  { teacss: "m-x", tailwind: "mx", properties: ["margin-inline"] },
  { teacss: "m-y", tailwind: "my", properties: ["margin-block"] },
  { teacss: "i-t", tailwind: "top", properties: ["top"] },
  { teacss: "i-l", tailwind: "left", properties: ["left"] },
];
const SPACING_VALUES = ["0", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16", "0.5", "1.5", "2.5", "[1px]", "[3vh]", "[3.555em]", "[7%]"];

const COLOR_PROPERTIES: readonly { teacss: string; tailwind: string; properties: readonly string[] }[] = [
  { teacss: "bg-color", tailwind: "bg", properties: ["background-color"] },
  { teacss: "text-color", tailwind: "text", properties: ["color"] },
  { teacss: "border-color", tailwind: "border", properties: ["border-color"] },
];
const COLOR_FAMILIES = ["red", "orange", "amber", "yellow", "lime", "green", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "pink", "slate", "gray"];
const COLOR_STEPS = ["100", "300", "500", "700", "900"];
const COLOR_OPACITIES = ["10", "50"];
const COLOR_ARBITRARY = ["[#525343]", "[#124453]", "[#942]"];

const FONT_SIZES: readonly [teacss: string, tailwind: string][] = [
  ["1x", "xs"],
  ["2x", "sm"],
  ["3x", "base"],
  ["4x", "lg"],
  ["5x", "xl"],
  ["6x", "2xl"],
];
const RADII: readonly [teacss: string, tailwind: string][] = [
  ["1x", "sm"],
  ["2x", "md"],
  ["4x", "lg"],
  ["6x", "xl"],
];
const GRID_COLUMNS = ["1", "2", "3", "4", "6", "12", "[1fr_3em]", "[20px_min-content_1fr]"];

export const CONDITIONS: readonly Condition[] = [
  { name: "hover", teacss: "@hover", tailwind: "hover:" },
  { name: "focus", teacss: "@focus", tailwind: "focus:" },
  { name: "active", teacss: "@active", tailwind: "active:" },
  { name: "first", teacss: "@first", tailwind: "first:" },
  { name: "sm", teacss: "@sm", tailwind: "sm:" },
  { name: "md", teacss: "@md", tailwind: "md:" },
  { name: "lg", teacss: "@lg", tailwind: "lg:" },
  { name: "max-md", teacss: "@max-md", tailwind: "max-md:" },
];

function bases(): Base[] {
  const result: Base[] = [];
  for (const property of SPACING) {
    for (const value of SPACING_VALUES) result.push({ teacss: `${property.teacss}:${value}`, tailwind: `${property.tailwind}-${value}`, properties: property.properties, family: "spacing" });
  }
  for (const property of COLOR_PROPERTIES) {
    for (const family of COLOR_FAMILIES) {
      for (const step of COLOR_STEPS) {
        result.push({ teacss: `${property.teacss}:${family}-${step}`, tailwind: `${property.tailwind}-${family}-${step}`, properties: property.properties, family: "color" });
        for (const opacity of COLOR_OPACITIES) result.push({ teacss: `${property.teacss}:${family}-${step}/${opacity}`, tailwind: `${property.tailwind}-${family}-${step}/${opacity}`, properties: property.properties, family: "color-opacity" });
      }
    }
    for (const value of COLOR_ARBITRARY) result.push({ teacss: `${property.teacss}:${value}`, tailwind: `${property.tailwind}-${value}`, properties: property.properties, family: "color-arbitrary" });
  }
  for (const [teacss, tailwind] of FONT_SIZES) result.push({ teacss: `font-size:${teacss}`, tailwind: `text-${tailwind}`, properties: ["font-size"], family: "font-size" });
  for (const [teacss, tailwind] of RADII) result.push({ teacss: `rd:${teacss}`, tailwind: `rounded-${tailwind}`, properties: ["border-radius"], family: "radius" });
  for (const value of GRID_COLUMNS) result.push({ teacss: `grid-columns:${value}`, tailwind: `grid-cols-${value}`, properties: ["grid-template-columns"], family: "grid" });
  return result;
}

function conditionSets(): Condition[][] {
  const sets: Condition[][] = [[]];
  for (const single of CONDITIONS) sets.push([single]);
  for (let first = 0; first < CONDITIONS.length; first++) {
    for (let second = first + 1; second < CONDITIONS.length; second++) {
      const pair = [CONDITIONS[first] as Condition, CONDITIONS[second] as Condition];
      if (pair.every((condition) => isBreakpoint(condition.name))) continue;
      sets.push(pair);
    }
  }
  return sets;
}

function isBreakpoint(name: string): boolean {
  return name === "sm" || name === "md" || name === "lg" || name === "max-md";
}

export interface PairSpace {
  readonly cases: readonly (PairedCase & { readonly family: string })[];
}

/** Every case the table can express, in a fixed order; the generator samples from it. */
export function pairSpace(): PairSpace {
  const cases: (PairedCase & { family: string })[] = [];
  const sets = conditionSets();
  for (const base of bases()) {
    for (const conditions of sets) {
      cases.push({
        teacss: base.teacss + conditions.map((condition) => condition.teacss).join(""),
        tailwind: conditions.map((condition) => condition.tailwind).join("") + base.tailwind,
        properties: base.properties,
        conditions: conditions.map((condition) => condition.name),
        family: base.family,
      });
    }
  }
  return { cases };
}
