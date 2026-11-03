import type { SubjectFactory } from "@bench/infrastructure";
import { teacssCliSubject } from "./cli.ts";

export const createSubject: SubjectFactory = () => teacssCliSubject("rust");
