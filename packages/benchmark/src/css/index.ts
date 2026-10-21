import { type CssNode, generate, parse, walk } from "css-tree";

export interface ParsedRule {
  readonly selector: string;
  readonly properties: readonly string[];
  /** The at-rule preludes wrapping the rule, outermost first. */
  readonly atRules: readonly string[];
}

/** Every style rule in the sheet with its declared property names and enclosing at-rules. */
export function parseRules(css: string): ParsedRule[] {
  const ast = parse(css, { positions: false, parseValue: false, parseAtrulePrelude: false });
  const rules: ParsedRule[] = [];
  const stack: string[] = [];
  walk(ast, {
    enter(node: CssNode) {
      if (node.type === "Atrule") stack.push(`@${node.name} ${node.prelude ? generate(node.prelude) : ""}`.trim());
      if (node.type !== "Rule") return;
      const properties: string[] = [];
      for (const child of node.block.children) if (child.type === "Declaration") properties.push(child.property);
      rules.push({ selector: generate(node.prelude), properties, atRules: [...stack] });
    },
    leave(node: CssNode) {
      if (node.type === "Atrule") stack.pop();
    },
  });
  return rules;
}

/** CSS.escape for a class name, so `p:4@hover` becomes the selector text both tools emit. */
export function escapeClass(name: string): string {
  return name.replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

/** Whether the stylesheet has a rule selecting this class, as both tools escape it. */
export function containsClass(css: string, name: string): boolean {
  return css.includes(`.${escapeClass(name)}`);
}
