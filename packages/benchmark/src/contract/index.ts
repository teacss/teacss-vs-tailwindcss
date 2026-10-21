import { type ResourceUsage, type SubjectId, type SubjectVersions, subjectId } from "@bench/infrastructure";

export const CONTRACT_VERSION = 1;

export type Tier = "engine" | "build" | "dev";
export const DEV_SIZES = [10, 100] as const;
export type DevSize = (typeof DEV_SIZES)[number];
export type EngineScenario = "cold" | "warm" | "incremental-10" | "incremental-100";
export const ENGINE_SCENARIOS: readonly EngineScenario[] = ["cold", "warm", "incremental-10", "incremental-100"];

/** K for an incremental scenario, undefined for the others. */
export function incrementalSize(scenario: EngineScenario): number | undefined {
  return scenario === "incremental-10" ? 10 : scenario === "incremental-100" ? 100 : undefined;
}

export type SubjectTask =
  | { readonly kind: "describe" }
  | {
      readonly kind: "engine";
      readonly scenario: EngineScenario;
      readonly candidates: readonly string[];
      /** One group of new candidates per timed call; only the incremental scenarios use it. */
      readonly extra: readonly (readonly string[])[];
      readonly includeCss: boolean;
    }
  | { readonly kind: "build"; readonly modules: readonly string[]; readonly files: Readonly<Record<string, string>>; readonly includeCss: boolean }
  | {
      readonly kind: "dev";
      readonly size: DevSize;
      readonly modules: readonly string[];
      readonly files: Readonly<Record<string, string>>;
      readonly corpusClasses: readonly string[];
      /** One group of `size` new classes per round. */
      readonly extra: readonly (readonly string[])[];
    };

export interface SubjectRequest {
  readonly version: typeof CONTRACT_VERSION;
  readonly sentAt: number;
  readonly subject: SubjectId;
  /** The module the subject process imports; it exports `createSubject`. */
  readonly module: string;
  readonly task: SubjectTask;
}

export interface EngineSample {
  readonly wallMs: number;
  readonly cssBytes: number;
  readonly cssSha256: string;
}

export interface DevSample {
  readonly wallMs: number;
  readonly polls: number;
  readonly cssBytes: number;
  readonly cssSha256: string;
}

export type TaskResult =
  | { readonly kind: "describe"; readonly versions: SubjectVersions }
  | { readonly kind: "engine"; readonly samples: readonly EngineSample[]; readonly css: string | undefined }
  | { readonly kind: "build"; readonly cssBytes: number; readonly cssGzipBytes: number; readonly cssSha256: string; readonly css: string | undefined }
  | { readonly kind: "dev"; readonly samples: readonly DevSample[] }
  | { readonly kind: "error"; readonly message: string; readonly stack: string | undefined };

export interface SubjectResponse {
  readonly version: typeof CONTRACT_VERSION;
  readonly sentAt: number;
  readonly subject: SubjectId;
  readonly nativeModules: readonly string[];
  readonly usage: ResourceUsage;
  readonly result: TaskResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function envelope(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name}: not an object`);
  if (value["version"] !== CONTRACT_VERSION) throw new Error(`${name}: version ${String(value["version"])} is not ${CONTRACT_VERSION}`);
  if (typeof value["sentAt"] !== "number") throw new Error(`${name}: sentAt is not a number`);
  if (typeof value["subject"] !== "string") throw new Error(`${name}: subject is not a string`);
  return value;
}

function parseTask(value: unknown): SubjectTask {
  if (!isRecord(value)) throw new Error("request: task is not an object");
  switch (value["kind"]) {
    case "describe":
      return { kind: "describe" };
    case "engine": {
      const scenario = ENGINE_SCENARIOS.find((entry) => entry === value["scenario"]);
      if (scenario === undefined) throw new Error(`request: engine scenario ${String(value["scenario"])} is not one of ${ENGINE_SCENARIOS.join(", ")}`);
      if (!isStringArray(value["candidates"])) throw new Error("request: engine candidates are not strings");
      const extra = value["extra"] ?? [];
      if (!Array.isArray(extra) || !extra.every(isStringArray)) throw new Error("request: engine extra is not a list of string lists");
      return { kind: "engine", scenario, candidates: value["candidates"], extra, includeCss: value["includeCss"] === true };
    }
    case "build":
      if (!isStringRecord(value["files"])) throw new Error("request: build files are not a string map");
      if (!isStringArray(value["modules"])) throw new Error("request: build modules are not strings");
      return { kind: "build", modules: value["modules"], files: value["files"], includeCss: value["includeCss"] === true };
    case "dev": {
      const size = DEV_SIZES.find((entry) => entry === value["size"]);
      if (size === undefined) throw new Error(`request: dev size ${String(value["size"])} is not one of ${DEV_SIZES.join(", ")}`);
      if (!isStringRecord(value["files"]) || !isStringArray(value["modules"]) || !isStringArray(value["corpusClasses"])) throw new Error("request: dev project shape");
      const extra = value["extra"];
      if (!Array.isArray(extra) || !extra.every(isStringArray)) throw new Error("request: dev extra is not a list of string lists");
      return { kind: "dev", size, modules: value["modules"], files: value["files"], corpusClasses: value["corpusClasses"], extra };
    }
    default:
      throw new Error(`request: unknown task kind ${String(value["kind"])}`);
  }
}

export function parseSubjectRequest(value: unknown): SubjectRequest {
  const request = envelope(value, "request");
  if (typeof request["module"] !== "string") throw new Error("request: module is not a string");
  return { version: CONTRACT_VERSION, sentAt: request["sentAt"] as number, subject: subjectId(request["subject"] as string), module: request["module"], task: parseTask(request["task"]) };
}

function parseSample(value: unknown): EngineSample {
  if (!isRecord(value) || typeof value["wallMs"] !== "number" || typeof value["cssBytes"] !== "number" || typeof value["cssSha256"] !== "string") throw new Error("response: engine sample shape");
  return { wallMs: value["wallMs"], cssBytes: value["cssBytes"], cssSha256: value["cssSha256"] };
}

function optionalCss(value: unknown): string | undefined {
  if (value !== undefined && typeof value !== "string") throw new Error("response: css is not a string");
  return value;
}

function parseResult(value: unknown): TaskResult {
  if (!isRecord(value)) throw new Error("response: result is not an object");
  switch (value["kind"]) {
    case "describe": {
      const versions = value["versions"];
      if (!isRecord(versions) || !isStringRecord(versions["packages"]) || !isStringRecord(versions["local"])) throw new Error("response: describe versions shape");
      return { kind: "describe", versions: { packages: versions["packages"], local: versions["local"] } };
    }
    case "engine":
      if (!Array.isArray(value["samples"])) throw new Error("response: engine samples are not an array");
      return { kind: "engine", samples: value["samples"].map(parseSample), css: optionalCss(value["css"]) };
    case "build":
      if (typeof value["cssBytes"] !== "number" || typeof value["cssGzipBytes"] !== "number" || typeof value["cssSha256"] !== "string") throw new Error("response: build result shape");
      return { kind: "build", cssBytes: value["cssBytes"], cssGzipBytes: value["cssGzipBytes"], cssSha256: value["cssSha256"], css: optionalCss(value["css"]) };
    case "dev":
      if (!Array.isArray(value["samples"])) throw new Error("response: dev samples are not an array");
      return {
        kind: "dev",
        samples: value["samples"].map((sample: unknown) => {
          const parsed = parseSample(sample);
          if (!isRecord(sample) || typeof sample["polls"] !== "number") throw new Error("response: dev sample shape");
          return { ...parsed, polls: sample["polls"] };
        }),
      };
    case "error":
      if (typeof value["message"] !== "string") throw new Error("response: error message is not a string");
      return { kind: "error", message: value["message"], stack: typeof value["stack"] === "string" ? value["stack"] : undefined };
    default:
      throw new Error(`response: unknown result kind ${String(value["kind"])}`);
  }
}

function parseUsage(value: unknown): ResourceUsage {
  if (!isRecord(value) || typeof value["cpuUserMs"] !== "number" || typeof value["cpuSystemMs"] !== "number" || typeof value["maxRssBytes"] !== "number") throw new Error("response: usage shape");
  return { cpuUserMs: value["cpuUserMs"], cpuSystemMs: value["cpuSystemMs"], maxRssBytes: value["maxRssBytes"] };
}

export function parseSubjectResponse(value: unknown): SubjectResponse {
  const response = envelope(value, "response");
  if (!isStringArray(response["nativeModules"])) throw new Error("response: nativeModules are not strings");
  return { version: CONTRACT_VERSION, sentAt: response["sentAt"] as number, subject: subjectId(response["subject"] as string), nativeModules: response["nativeModules"], usage: parseUsage(response["usage"]), result: parseResult(response["result"]) };
}
