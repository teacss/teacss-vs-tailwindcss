import type { SubjectFactory } from "@bench/infrastructure";
import { teacssBunSubject } from "./bun.ts";

export const createSubject: SubjectFactory = () => teacssBunSubject("rust");
