export interface Invocation {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string | true>;
}

export function parseInvocation(argv: readonly string[]): Invocation {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? "";
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    if (equals > 0) {
      options.set(argument.slice(2, equals), argument.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(argument.slice(2), next);
      index++;
    } else {
      options.set(argument.slice(2), true);
    }
  }
  const [command, ...rest] = positionals;
  return { command, positionals: rest, options };
}
