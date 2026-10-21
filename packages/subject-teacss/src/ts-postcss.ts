import type { SubjectFactory } from "@bench/infrastructure";
import { teacssSubject } from "./index.ts";

export const createSubject: SubjectFactory = () => teacssSubject("ts", "postcss");
