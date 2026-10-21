import { createHash } from "node:crypto";
import type { Clock, Workspace } from "@bench/infrastructure";
import type { DevSample } from "../../contract/index.ts";
import { containsClass } from "../../css/index.ts";

export const DEV_POLL_MS = 5;
export const DEV_TIMEOUT_MS = 30_000;
const ENTRY = "src/main.js";

/** What the protocol needs from a running development server; the real one speaks HTTP and the HMR socket. */
export interface DevIo {
  write(path: string, content: string): void;
  append(path: string, content: string): void;
  /** The served text of a module, as a browser would request it. */
  fetch(path: string): Promise<string>;
  /** A custom HMR event, as `import.meta.hot.send` would send it. */
  sendHot(event: string): void;
  sleep(ms: number): Promise<void>;
}

export interface DevScenarioInput {
  readonly modules: readonly string[];
  /** Every class of the corpus, so the first stylesheet can be checked for completeness. */
  readonly corpusClasses: readonly string[];
  /** One group of new classes per round. */
  readonly extra: readonly (readonly string[])[];
  readonly moduleHeader: string;
}

export interface DevRun {
  readonly samples: readonly DevSample[];
  readonly css: string;
}

/** The CSS text inside Vite's JavaScript form of a stylesheet module. */
export function cssOfStylesheetModule(text: string): string {
  const match = /const __vite__css = ("(?:[^"\\]|\\.)*")/.exec(text);
  return match?.[1] === undefined ? "" : (JSON.parse(match[1]) as string);
}

/** The stylesheet the entry module imports, as Vite rewrote the import. */
export function stylesheetPath(entry: string): string {
  const imports = [...entry.matchAll(/import\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
  const css = imports.find((path) => /\.css(?:$|\?)/.test(path));
  if (css === undefined) throw new Error(`the entry module imports no stylesheet; imports: ${imports.join(", ") || "none"}`);
  return css;
}

function moduleSource(header: string, classes: readonly string[]): string {
  return `${header}document.getElementById("app").insertAdjacentHTML("beforeend", \`<div class="${classes.join(" ")}"></div>\`);\n`;
}

function milliseconds(start: bigint, end: bigint): number {
  return Number(end - start) / 1e6;
}

async function pollUntil(io: DevIo, stylesheet: string, classes: readonly string[], clock: Clock, started: bigint, what: string): Promise<{ css: string; polls: number }> {
  let polls = 0;
  for (;;) {
    const css = cssOfStylesheetModule(await io.fetch(stylesheet));
    polls++;
    if (classes.every((name) => containsClass(css, name))) return { css, polls };
    if (milliseconds(started, clock.now()) > DEV_TIMEOUT_MS) {
      const missing = classes.filter((name) => !containsClass(css, name));
      throw new Error(`${what}: ${missing.length} class(es) still missing after ${DEV_TIMEOUT_MS} ms, first ${missing[0]}`);
    }
    await io.sleep(DEV_POLL_MS);
  }
}

/**
 * Spec v02.1 §Tiers `dev`: load the page as a browser would, replay the stylesheet module's HMR
 * events, then per round write a module with new classes, import it from the entry, request both,
 * and time until the stylesheet module serves every new class.
 */
export async function runDevScenario(input: DevScenarioInput, io: DevIo, clock: Clock): Promise<DevRun> {
  const entry = await io.fetch(`/${ENTRY}`);
  for (const module of input.modules) await io.fetch(`/${module}`);
  const stylesheet = stylesheetPath(entry);
  const stylesheetModule = await io.fetch(stylesheet);
  for (const match of stylesheetModule.matchAll(/import\.meta\.hot\.send\(("[^"]+")\)/g)) io.sendHot(JSON.parse(match[1] ?? '""') as string);
  let { css } = await pollUntil(io, stylesheet, input.corpusClasses, clock, clock.now(), "first stylesheet");
  const samples: DevSample[] = [];
  for (const [round, classes] of input.extra.entries()) {
    const name = `src/dev-${String(round).padStart(3, "0")}.js`;
    const started = clock.now();
    io.write(name, moduleSource(input.moduleHeader, classes));
    io.append(ENTRY, `import "./${name.slice(4)}";\n`);
    await io.fetch(`/${ENTRY}`);
    await io.fetch(`/${name}`);
    const result = await pollUntil(io, stylesheet, classes, clock, started, `round ${round}`);
    samples.push({ wallMs: milliseconds(started, clock.now()), polls: result.polls, cssBytes: Buffer.byteLength(result.css), cssSha256: createHash("sha256").update(result.css).digest("hex") });
    css = result.css;
  }
  return { samples, css };
}

/** The real io: HTTP for module requests, Vite's HMR socket for custom events. */
export async function connectDevIo(origin: string, workspace: Workspace): Promise<DevIo & { close(): void }> {
  const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/`, "vite-hmr");
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`could not open the HMR socket at ${origin}`)), { once: true });
  });
  return {
    write: (path, content) => workspace.write(path, content),
    append: (path, content) => workspace.write(path, workspace.read(path) + content),
    fetch: async (path) => {
      let response: Response;
      try {
        response = await fetch(`${origin}${path}`, { headers: { connection: "close" } });
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : "";
        throw new Error(`GET ${path} failed${cause}`);
      }
      if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
      return response.text();
    },
    sendHot: (event) => socket.send(JSON.stringify({ type: "custom", event, data: undefined })),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    close: () => socket.close(),
  };
}
