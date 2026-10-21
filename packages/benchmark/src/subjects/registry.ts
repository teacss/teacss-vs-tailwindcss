import type { SubjectId } from "@bench/infrastructure";
import { subjectId } from "@bench/infrastructure";
import type { Syntax } from "../features/corpus/index.ts";
import type { NativeExpectation } from "../features/verify/index.ts";

export interface SubjectRegistration {
  /** The module the subject process imports, as a file URL resolved from this package. */
  readonly module: string;
  /** Environment the subject process gets on top of the orchestrator's. */
  readonly env: Readonly<Record<string, string>>;
  /** Which side of a paired case the subject reads; the baseline reads Tailwind's. */
  readonly syntax: Syntax;
  readonly engineTier: boolean;
  readonly natives: NativeExpectation;
}

export type SubjectRegistry = ReadonlyMap<SubjectId, SubjectRegistration>;

/** Spec v01.1 §Subjects. `TEACSS_ENGINE_STRICT=1` turns a Rust fallback into a failure. */
export function productionRegistry(): SubjectRegistry {
  return new Map<SubjectId, SubjectRegistration>([
    [subjectId("vite-baseline"), { module: import.meta.resolve("@bench/subject-vite-baseline"), env: {}, syntax: "tailwind", engineTier: false, natives: { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] } }],
    [subjectId("teacss-ts"), { module: import.meta.resolve("@bench/subject-teacss/ts"), env: { TEACSS_ENGINE_STRICT: "1" }, syntax: "teacss", engineTier: true, natives: { required: [], forbidden: ["teacss-engine", "tailwindcss-oxide"] } }],
    [subjectId("teacss-rs"), { module: import.meta.resolve("@bench/subject-teacss/rs"), env: { TEACSS_ENGINE_STRICT: "1" }, syntax: "teacss", engineTier: true, natives: { required: ["teacss-engine"], forbidden: ["tailwindcss-oxide"] } }],
    [subjectId("tailwind-v4"), { module: import.meta.resolve("@bench/subject-tailwind-v4"), env: {}, syntax: "tailwind", engineTier: true, natives: { required: ["tailwindcss-oxide"], forbidden: ["teacss-engine"] } }],
  ]);
}
