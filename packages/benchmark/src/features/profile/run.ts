import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubjectId } from "@bench/infrastructure";
import type { SubjectTask } from "../../contract/index.ts";
import type { Cell } from "../../persistence/index.ts";
import { candidates, corpusProject, generateCorpus, type Syntax } from "../corpus/index.ts";
import { type ProfileSummary, summarizeProfile } from "./index.ts";

export interface ProfileSubject {
  readonly id: SubjectId;
  readonly syntax: Syntax;
  readonly engineTier: boolean;
}

/** Runs the task in a subject process started with these Node flags; the caller reads the profile the flags wrote. */
export type ProfileInvoke = (subject: SubjectId, task: SubjectTask, nodeArgs: readonly string[]) => Promise<void>;

/** Spec v01.1 §Run protocol step 7: one uncounted `--cpu-prof` pass per subject and tier on one cell. */
export async function profileSubjects(cell: Cell, seed: number, subjects: readonly ProfileSubject[], tiers: readonly ("engine" | "build")[], invoke: ProfileInvoke): Promise<Record<string, ProfileSummary>> {
  const corpus = generateCorpus({ seed, utilities: cell.utilities, files: cell.files });
  const limiters: Record<string, ProfileSummary> = {};
  const dir = mkdtempSync(join(tmpdir(), "bench-profile-"));
  try {
    for (const subject of subjects) {
      for (const tier of tiers) {
        if (tier === "engine" && !subject.engineTier) continue;
        const name = `${subject.id}-${tier}.cpuprofile`;
        const project = corpusProject(corpus, subject.syntax);
        const task: SubjectTask = tier === "engine" ? { kind: "engine", scenario: "warm", candidates: candidates(corpus, subject.syntax), includeCss: false } : { kind: "build", modules: project.modules, files: Object.fromEntries(project.files), includeCss: false };
        await invoke(subject.id, task, ["--cpu-prof", "--cpu-prof-dir", dir, "--cpu-prof-name", name]);
        if (!readdirSync(dir).includes(name)) throw new Error(`${subject.id}/${tier}: no profile was written to ${dir}`);
        limiters[`${subject.id}/${tier}`] = summarizeProfile(JSON.parse(readFileSync(join(dir, name), "utf8")));
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return limiters;
}
