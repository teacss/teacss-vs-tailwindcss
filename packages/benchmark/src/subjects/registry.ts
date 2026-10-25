import type { SubjectId } from "@bench/infrastructure";
import { subjectId } from "@bench/infrastructure";
import type { NativeExpectation, Tier } from "../contract/index.ts";
import type { Syntax } from "../corpus/index.ts";

/** `main` is spec v01.1's production setup; `default-config` and `postcss` are spec v02.1 §Configurations; `rsbuild` and `bun` are spec v03.1 §Subjects. */
export type SubjectGroup = "main" | "default-config" | "postcss" | "rsbuild" | "bun";
export const DEFAULT_GROUPS: readonly SubjectGroup[] = ["main", "default-config"];

export interface SubjectRegistration {
  /** The module the subject process imports, as a file URL resolved from this package. */
  readonly module: string;
  /** Environment the subject process gets on top of the orchestrator's. */
  readonly env: Readonly<Record<string, string>>;
  /** Which side of a paired case the subject reads; the baseline reads Tailwind's. */
  readonly syntax: Syntax;
  readonly tiers: readonly Tier[];
  readonly group: SubjectGroup;
  readonly natives: NativeExpectation;
  /** `bun` runs the subject process under the Bun on the PATH, which `packageManager` pins (spec v03.1 §Subjects). */
  readonly runtime: "node" | "bun";
}

export type SubjectRegistry = ReadonlyMap<SubjectId, SubjectRegistration>;

const TEACSS_TS = { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] };
const TEACSS_RS = { required: ["teacss-engine"], forbidden: ["tailwindcss-oxide"] };
const TAILWIND = { required: [], requiredToBuild: ["tailwindcss-oxide"], forbidden: ["teacss-engine"] };
const STRICT = { TEACSS_ENGINE_STRICT: "1" };
const RSPACK = "rspack";

/**
 * Spec v01.1 §Subjects, v02.1 §Configurations and v03.1 §Subjects. `TEACSS_ENGINE_STRICT=1` turns a Rust fallback into
 * a failure. The engine tier does not depend on configuration, so the configuration variants skip it.
 */
export function productionRegistry(): SubjectRegistry {
  const entry = (module: string, syntax: Syntax, tiers: readonly Tier[], group: SubjectGroup, natives: NativeExpectation, env: Readonly<Record<string, string>> = {}, runtime: "node" | "bun" = "node"): SubjectRegistration => ({ module: import.meta.resolve(module), env, syntax, tiers, group, natives, runtime });
  return new Map<SubjectId, SubjectRegistration>([
    [subjectId("vite-baseline"), entry("@bench/subject-vite-baseline", "tailwind", ["build"], "main", { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] })],
    [subjectId("teacss-ts"), entry("@bench/subject-teacss/ts", "teacss", ["engine", "dev", "build"], "main", TEACSS_TS, STRICT)],
    [subjectId("teacss-rs"), entry("@bench/subject-teacss/rs", "teacss", ["engine", "dev", "build"], "main", TEACSS_RS, STRICT)],
    [subjectId("tailwind-v4"), entry("@bench/subject-tailwind-v4", "tailwind", ["engine", "dev", "build"], "main", TAILWIND)],
    [subjectId("teacss-ts-default"), entry("@bench/subject-teacss/ts-default", "teacss", ["dev", "build"], "default-config", TEACSS_TS, STRICT)],
    [subjectId("teacss-rs-default"), entry("@bench/subject-teacss/rs-default", "teacss", ["dev", "build"], "default-config", TEACSS_RS, STRICT)],
    [subjectId("tailwind-v4-default"), entry("@bench/subject-tailwind-v4/default", "tailwind", ["dev", "build"], "default-config", TAILWIND)],
    [subjectId("teacss-ts-postcss"), entry("@bench/subject-teacss/ts-postcss", "teacss", ["build"], "postcss", TEACSS_TS, { ...STRICT, TEACSS_ENGINE: "ts" })],
    [subjectId("teacss-rs-postcss"), entry("@bench/subject-teacss/rs-postcss", "teacss", ["build"], "postcss", TEACSS_RS, { ...STRICT, TEACSS_ENGINE: "rust" })],
    [subjectId("tailwind-v4-postcss"), entry("@bench/subject-tailwind-v4/postcss", "tailwind", ["build"], "postcss", TAILWIND)],
    [subjectId("rsbuild-baseline"), entry("@bench/subject-rsbuild-baseline", "tailwind", ["build"], "rsbuild", { required: [RSPACK], forbidden: ["teacss-engine", "tailwindcss-oxide"] })],
    [subjectId("teacss-ts-rsbuild"), entry("@bench/subject-teacss/ts-rsbuild", "teacss", ["build"], "rsbuild", { ...TEACSS_TS, required: [RSPACK] }, { ...STRICT, TEACSS_ENGINE: "ts" })],
    [subjectId("teacss-rs-rsbuild"), entry("@bench/subject-teacss/rs-rsbuild", "teacss", ["build"], "rsbuild", { ...TEACSS_RS, required: [...TEACSS_RS.required, RSPACK] }, { ...STRICT, TEACSS_ENGINE: "rust" })],
    [subjectId("tailwind-v4-rsbuild"), entry("@bench/subject-tailwind-v4/rsbuild", "tailwind", ["build"], "rsbuild", { ...TAILWIND, required: [RSPACK] })],
    [subjectId("bun-baseline"), entry("@bench/subject-bun-baseline", "tailwind", ["build"], "bun", { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] }, {}, "bun")],
    [subjectId("teacss-ts-bun"), entry("@bench/subject-teacss/ts-bun", "teacss", ["build"], "bun", TEACSS_TS, { ...STRICT, TEACSS_ENGINE: "ts" }, "bun")],
    [subjectId("teacss-rs-bun"), entry("@bench/subject-teacss/rs-bun", "teacss", ["build"], "bun", TEACSS_RS, { ...STRICT, TEACSS_ENGINE: "rust" }, "bun")],
    [subjectId("tailwind-v4-bun"), entry("@bench/subject-tailwind-v4/bun", "tailwind", ["build"], "bun", TAILWIND, {}, "bun")],
  ]);
}
