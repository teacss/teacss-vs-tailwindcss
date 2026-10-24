import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";
import { parseArgs } from "node:util";

const SUBJECT_MODULES = "packages/subject-teacss/node_modules/@teacss";
const STATE_FILE = "packages/subject-teacss/node_modules/.bench-local.json";

/** The teacss-ts packages a teacss subject imports, by their directory in that checkout. @teacss/engine resolves from core. */
const SOURCES: Readonly<Record<string, string>> = {
  core: "packages-engine/core",
  vite: "packages-integrations/vite",
  "preset-standard": "packages-presets/preset-standard",
};

/** Where a teacss-rs checkout keeps the package published as @teacss/engine; its build puts the `.node` beside `binding.js`, which loads it first. */
const ENGINE_PACKAGE = "packages/engine";
const STORE = "node_modules/.bun";

interface State {
  readonly teacssTs?: string;
  readonly previous: Readonly<Record<string, string>>;
  readonly teacssRs?: string;
  /** Every `@teacss/engine` link replaced, with the target it had. */
  readonly engineLinks?: readonly { readonly at: string; readonly previous: string }[];
}

function readState(): State | undefined {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as State) : undefined;
}

function engineFromCore(): string {
  const core = realpathSync(join(SUBJECT_MODULES, "core"));
  for (let dir = core; dir !== dirname(dir); dir = dirname(dir)) {
    const candidate = join(dir, "node_modules/@teacss/engine");
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
  }
  return "unresolved: @teacss/core cannot reach @teacss/engine; the teacss-rs subject will fail";
}

/**
 * Every `@teacss/engine` link the subjects can reach: the subject's own and those inside the store entries of the
 * packages that depend on it. Only links to a store copy of the engine version the subject pins are taken, so
 * stale entries from earlier versions stay as they are.
 */
function engineLinks(): string[] {
  const own = join(SUBJECT_MODULES, "engine");
  const pinned = (JSON.parse(readFileSync("packages/subject-teacss/package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies["@teacss/engine"];
  const copy = (target: string) => basename(dirname(dirname(dirname(target)))).startsWith(`@teacss+engine@${pinned}+`);
  const links = [own];
  for (const entry of readdirSync(STORE)) {
    const at = join(STORE, entry, "node_modules/@teacss/engine");
    if (entry.startsWith("@teacss+") && existsSync(at) && lstatSync(at).isSymbolicLink() && copy(realpathSync(at))) links.push(at);
  }
  return links;
}

function status(): void {
  const state = readState();
  stdout.write(state === undefined ? "teacss subjects use the packages from bun.lock\n" : `teacss subjects are linked to ${[state.teacssTs, state.teacssRs].filter(Boolean).join(" and ")}\n`);
  for (const name of Object.keys(SOURCES)) stdout.write(`  @teacss/${name} -> ${realpathSync(join(SUBJECT_MODULES, name))}\n`);
  stdout.write(`  @teacss/engine (from core) -> ${engineFromCore()}\n`);
}

function linkEngine(teacssRs: string): void {
  if (readState() !== undefined) throw new Error("already linked; run unlink first");
  const engine = join(resolve(teacssRs), ENGINE_PACKAGE);
  if (!existsSync(join(engine, "dist"))) throw new Error(`${engine} has no dist/; build it first (npm run build:ts there)`);
  if (!readdirSync(engine).some((file) => file.startsWith("teacss-engine.") && file.endsWith(".node"))) throw new Error(`${engine} has no local .node; build it first (npm run build there)`);
  const replaced = engineLinks().map((at) => ({ at, previous: readlinkSync(at) }));
  for (const { at } of replaced) {
    rmSync(at);
    symlinkSync(engine, at);
  }
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({ previous: {}, teacssRs: resolve(teacssRs), engineLinks: replaced } satisfies State, null, 2)}\n`);
  stdout.write(`teacss subjects use the engine at ${engine} through ${replaced.length} link(s)\n`);
}

function link(teacssTs: string): void {
  if (readState() !== undefined) throw new Error("already linked; run unlink first");
  const root = resolve(teacssTs);
  for (const [name, path] of Object.entries(SOURCES)) {
    if (!existsSync(join(root, path, "dist"))) throw new Error(`${join(root, path)} has no dist/; build teacss-ts first (bun run build there)`);
  }
  const previous: Record<string, string> = {};
  for (const [name, path] of Object.entries(SOURCES)) {
    const at = join(SUBJECT_MODULES, name);
    if (!lstatSync(at).isSymbolicLink()) throw new Error(`${at} is not a symlink; reinstall with bun install`);
    previous[name] = readlinkSync(at);
    rmSync(at);
    symlinkSync(join(root, path), at);
  }
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({ teacssTs: root, previous } satisfies State, null, 2)}\n`);
  status();
}

function unlink(): void {
  const state = readState();
  if (state === undefined) throw new Error("not linked");
  for (const [name, target] of Object.entries(state.previous)) {
    const at = join(SUBJECT_MODULES, name);
    rmSync(at, { force: true });
    symlinkSync(target, at);
  }
  for (const { at, previous } of state.engineLinks ?? []) {
    rmSync(at, { force: true });
    symlinkSync(previous, at);
  }
  rmSync(STATE_FILE);
  status();
}

const { positionals, values } = parseArgs({ args: argv.slice(2), allowPositionals: true, options: { ts: { type: "string" }, rs: { type: "string" } } });
try {
  const [command = "status"] = positionals;
  if (command === "status") status();
  // With --ts, core resolves the engine from that checkout's own install, so a teacss-rs engine is linked on its own.
  else if (command === "link" && values.ts !== undefined && values.rs !== undefined) throw new Error("link one checkout at a time: --ts for teacss-ts packages, --rs for the teacss-rs engine");
  else if (command === "link" && values.rs !== undefined) linkEngine(values.rs);
  else if (command === "link") link(values.ts ?? "../teacss-ts");
  else if (command === "unlink") unlink();
  else throw new Error(`unknown command ${command}; use status, link [--ts <dir> | --rs <dir>] or unlink`);
} catch (error) {
  stderr.write(`link-local: ${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
}
