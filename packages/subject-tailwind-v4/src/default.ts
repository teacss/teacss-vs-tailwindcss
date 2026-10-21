import type { SubjectFactory } from "@bench/infrastructure";
import { tailwindSubject } from "./index.ts";

export const createSubject: SubjectFactory = () => tailwindSubject("default");
