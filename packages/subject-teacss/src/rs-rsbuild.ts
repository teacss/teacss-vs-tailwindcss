import type { SubjectFactory } from "@bench/infrastructure";
import { teacssRsbuildSubject } from "./rsbuild.ts";

export const createSubject: SubjectFactory = () => teacssRsbuildSubject();
