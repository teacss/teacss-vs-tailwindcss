import type { SubjectId } from "@bench/infrastructure";
import { subjectId } from "@bench/infrastructure";
import type { Tier } from "../contract/index.ts";
import type { Syntax } from "../corpus/index.ts";
import type { NativeExpectation } from "../features/verify/index.ts";

/** `main` is spec v01.1's production setup; `default-config` and `postcss` are spec v02.1 §Configurations. */
export type SubjectGroup = "main" | "default-config" | "postcss";
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
}

export type SubjectRegistry = ReadonlyMap<SubjectId, SubjectRegistration>;

const TEACSS_TS = { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] };
const TEACSS_RS = { required: ["teacss-engine"], forbidden: ["tailwindcss-oxide"] };
const TAILWIND = { required: ["tailwindcss-oxide"], forbidden: ["teacss-engine"] };
const STRICT = { TEACSS_ENGINE_STRICT: "1" };

/**
 * Spec v01.1 §Subjects and v02.1 §Configurations. `TEACSS_ENGINE_STRICT=1` turns a Rust fallback into
 * a failure. The engine tier does not depend on configuration, so the configuration variants skip it.
 */
export function productionRegistry(): SubjectRegistry {
  const entry = (module: string, syntax: Syntax, tiers: readonly Tier[], group: SubjectGroup, natives: NativeExpectation, env: Readonly<Record<string, string>> = {}): SubjectRegistration => ({ module: import.meta.resolve(module), env, syntax, tiers, group, natives });
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
  ]);
}
