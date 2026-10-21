import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

interface State {
  readonly teacssTs: string;
  readonly previous: Readonly<Record<string, string>>;
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

function status(): void {
  const state = readState();
  stdout.write(state === undefined ? "teacss subjects use the packages from bun.lock\n" : `teacss subjects are linked to ${state.teacssTs}\n`);
  for (const name of Object.keys(SOURCES)) stdout.write(`  @teacss/${name} -> ${realpathSync(join(SUBJECT_MODULES, name))}\n`);
  stdout.write(`  @teacss/engine (from core) -> ${engineFromCore()}\n`);
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
  rmSync(STATE_FILE);
  status();
}

const { positionals, values } = parseArgs({ args: argv.slice(2), allowPositionals: true, options: { ts: { type: "string", default: "../teacss-ts" } } });
try {
  const [command = "status"] = positionals;
  if (command === "status") status();
  else if (command === "link") link(values.ts);
  else if (command === "unlink") unlink();
  else throw new Error(`unknown command ${command}; use status, link [--ts <dir>] or unlink`);
} catch (error) {
  stderr.write(`link-local: ${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
}
