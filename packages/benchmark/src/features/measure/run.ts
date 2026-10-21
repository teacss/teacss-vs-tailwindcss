import type { SubjectId } from "@bench/infrastructure";
import type { EngineScenario, SubjectTask, TaskResult } from "../../contract/index.ts";
import type { Cell, CellRecord, Sample } from "../../persistence/index.ts";
import { type Corpus, candidates, corpusProject, generateCorpus, type Syntax } from "../corpus/index.ts";
import { mulberry32, shuffled } from "../corpus/prng.ts";
import { WARM_TIMED_ITERATIONS } from "./engine-scenario.ts";

export type Tier = "engine" | "build";

export interface MeasureSubject {
  readonly id: SubjectId;
  readonly syntax: Syntax;
  readonly engineTier: boolean;
}

export interface RunPlan {
  readonly seed: number;
  readonly cells: readonly Cell[];
  readonly tiers: readonly Tier[];
  readonly subjects: readonly MeasureSubject[];
  readonly samplesPerCell: number;
}

export interface Measured {
  readonly result: TaskResult;
  readonly nativeModules: readonly string[];
  readonly usage: { readonly cpuUserMs: number; readonly cpuSystemMs: number; readonly maxRssBytes: number };
  /** Spawn to exit, measured by the orchestrator. */
  readonly wallMs: number;
}

export type MeasureInvoke = (subject: SubjectId, task: SubjectTask) => Promise<Measured>;

export interface MeasureDeps {
  readonly invoke: MeasureInvoke;
  readonly loadShare: () => number;
  readonly progress: (message: string) => void;
}

export interface MeasureOutput {
  readonly cells: readonly CellRecord[];
  readonly samples: readonly Sample[];
}

export class RunInvalid extends Error {}

/** One unit of work for a subject process: a whole build, one cold engine run, or one warm process worth of iterations. */
interface Job {
  readonly subject: MeasureSubject;
  readonly tier: Tier;
  readonly scenario: EngineScenario | undefined;
  readonly samples: number;
}

function jobsFor(plan: RunPlan): Job[] {
  const jobs: Job[] = [];
  for (const subject of plan.subjects) {
    for (const tier of plan.tiers) {
      if (tier === "engine" && !subject.engineTier) continue;
      if (tier === "build") jobs.push({ subject, tier, scenario: undefined, samples: 1 });
      else {
        jobs.push({ subject, tier, scenario: "cold", samples: 1 });
        jobs.push({ subject, tier, scenario: "warm", samples: WARM_TIMED_ITERATIONS });
      }
    }
  }
  return jobs;
}

function taskFor(job: Job, corpus: Corpus): SubjectTask {
  if (job.tier === "build") {
    const project = corpusProject(corpus, job.subject.syntax);
    return { kind: "build", modules: project.modules, files: Object.fromEntries(project.files), includeCss: false };
  }
  return { kind: "engine", scenario: job.scenario ?? "cold", candidates: candidates(corpus, job.subject.syntax), includeCss: false };
}

function key(job: Job, cell: Cell): string {
  return `${job.subject.id}/${job.tier}/${job.scenario ?? "build"}/${cell.utilities}x${cell.files}`;
}

function toSamples(job: Job, cell: Cell, index: number, measured: Measured): Sample[] {
  const { result } = measured;
  if (job.tier === "build") {
    if (result.kind !== "build") throw new RunInvalid(`${job.subject.id}: expected a build result, got ${result.kind}`);
    return [
      {
        tier: "build",
        subject: job.subject.id,
        cell,
        index,
        wallMs: measured.wallMs,
        cpuUserMs: measured.usage.cpuUserMs,
        cpuSystemMs: measured.usage.cpuSystemMs,
        maxRssBytes: measured.usage.maxRssBytes,
        cssBytes: result.cssBytes,
        cssGzipBytes: result.cssGzipBytes,
        cssSha256: result.cssSha256,
        nativeModules: measured.nativeModules,
      },
    ];
  }
  if (result.kind !== "engine") throw new RunInvalid(`${job.subject.id}: expected an engine result, got ${result.kind}`);
  if (result.samples.length !== job.samples) throw new RunInvalid(`${job.subject.id}: expected ${job.samples} engine sample(s), got ${result.samples.length}`);
  return result.samples.map((sample, offset) => ({ tier: "engine", scenario: job.scenario ?? "cold", subject: job.subject.id, cell, index: index + offset, wallMs: sample.wallMs, cssBytes: sample.cssBytes, cssSha256: sample.cssSha256, nativeModules: measured.nativeModules }));
}

/**
 * Spec v01.1 §Run protocol: one subject per process, subjects interleaved in a random order per
 * round, every sample of a subject and cell with the same output hash, any failure invalidating the run.
 */
export async function measure(plan: RunPlan, deps: MeasureDeps): Promise<MeasureOutput> {
  const random = mulberry32(plan.seed);
  const cells: CellRecord[] = [];
  const samples: Sample[] = [];
  const jobs = jobsFor(plan);
  for (const cell of plan.cells) {
    const corpus = generateCorpus({ seed: plan.seed, utilities: cell.utilities, files: cell.files });
    const loadShareBefore = deps.loadShare();
    const collected = new Map<string, number>();
    const hashes = new Map<string, string>();
    let round = 0;
    while (jobs.some((job) => (collected.get(key(job, cell)) ?? 0) < plan.samplesPerCell)) {
      round++;
      for (const job of shuffled(jobs, random)) {
        const id = key(job, cell);
        const have = collected.get(id) ?? 0;
        if (have >= plan.samplesPerCell) continue;
        deps.progress(`${id} round ${round} (${have}/${plan.samplesPerCell})`);
        const measured = await deps.invoke(job.subject.id, taskFor(job, corpus));
        if (measured.result.kind === "error") throw new RunInvalid(`${id}: ${measured.result.message}`);
        for (const sample of toSamples(job, cell, have, measured)) {
          const expected = hashes.get(id);
          if (expected === undefined) hashes.set(id, sample.cssSha256);
          else if (expected !== sample.cssSha256) throw new RunInvalid(`${id}: output changed between samples (${expected.slice(0, 12)} then ${sample.cssSha256.slice(0, 12)})`);
          samples.push(sample);
        }
        collected.set(id, have + job.samples);
      }
    }
    cells.push({ cell, corpusHash: corpus.hash, loadShareBefore, loadShareAfter: deps.loadShare() });
  }
  return { cells, samples };
}
