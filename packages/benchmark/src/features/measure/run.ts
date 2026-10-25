import type { SubjectId } from "@bench/infrastructure";
import { checkNativeModules, DEV_SIZES, type DevSize, type EngineScenario, incrementalSize, type NativeExpectation, type SubjectTask, type TaskResult, type Tier } from "../../contract/index.ts";
import { type Corpus, candidates, corpusProject, extraCases, type Syntax } from "../../corpus/index.ts";
import { mulberry32, shuffled } from "../../corpus/prng.ts";
import type { Cell, CellRecord, Sample } from "../../persistence/index.ts";
import { WARM_TIMED_ITERATIONS } from "./engine-scenario.ts";

export type { Tier };

export interface MeasureSubject {
  readonly id: SubjectId;
  readonly syntax: Syntax;
  readonly tiers: readonly Tier[];
  readonly natives: NativeExpectation;
}

export interface RunPlan {
  readonly seed: number;
  /** The corpus each cell measures: generated from the seed, or the most frequent community classes. */
  readonly corpusFor: (cell: Cell) => Corpus;
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
  readonly size: DevSize | undefined;
  readonly samples: number;
}

function jobsFor(plan: RunPlan): Job[] {
  const jobs: Job[] = [];
  for (const subject of plan.subjects) {
    for (const tier of plan.tiers) {
      if (!subject.tiers.includes(tier)) continue;
      if (tier === "dev") {
        for (const size of DEV_SIZES) jobs.push({ subject, tier, scenario: undefined, size, samples: plan.samplesPerCell });
        continue;
      }
      if (tier === "build") jobs.push({ subject, tier, scenario: undefined, size: undefined, samples: 1 });
      else {
        jobs.push({ subject, tier, scenario: "cold", size: undefined, samples: 1 });
        for (const scenario of ["warm", "incremental-10", "incremental-100"] as const) jobs.push({ subject, tier, scenario, size: undefined, samples: WARM_TIMED_ITERATIONS });
      }
    }
  }
  return jobs;
}

function taskFor(job: Job, corpus: Corpus): SubjectTask {
  if (job.tier === "dev") {
    const project = corpusProject(corpus, job.subject.syntax);
    const size = job.size ?? DEV_SIZES[0];
    return { kind: "dev", size, modules: project.modules, files: Object.fromEntries(project.files), corpusClasses: candidates(corpus, job.subject.syntax), extra: extraCases(corpus, size, job.samples).map((group) => group.map((entry) => entry[job.subject.syntax])) };
  }
  if (job.tier === "build") {
    const project = corpusProject(corpus, job.subject.syntax);
    return { kind: "build", modules: project.modules, files: Object.fromEntries(project.files), includeCss: false };
  }
  const scenario = job.scenario ?? "cold";
  const k = incrementalSize(scenario);
  const extra = k === undefined ? [] : extraCases(corpus, k, WARM_TIMED_ITERATIONS).map((group) => group.map((entry) => entry[job.subject.syntax]));
  return { kind: "engine", scenario, candidates: candidates(corpus, job.subject.syntax), extra, includeCss: false };
}

/** Warm and build samples must all match; an incremental sample matches the same call in the other processes. */
function hashKey(id: string, job: Job, sample: Sample): string {
  if (job.tier === "dev") return `${id}#${sample.index}`;
  return job.scenario !== undefined && incrementalSize(job.scenario) !== undefined ? `${id}#${sample.index % WARM_TIMED_ITERATIONS}` : id;
}

function key(job: Job, cell: Cell): string {
  return `${job.subject.id}/${job.tier}/${job.scenario ?? (job.size === undefined ? "build" : `+${job.size}`)}/${cell.utilities}x${cell.files}`;
}

function toSamples(job: Job, cell: Cell, index: number, measured: Measured): Sample[] {
  const { result } = measured;
  if (job.tier === "dev") {
    if (result.kind !== "dev") throw new RunInvalid(`${job.subject.id}: expected a dev result, got ${result.kind}`);
    if (result.samples.length !== job.samples) throw new RunInvalid(`${job.subject.id}: expected ${job.samples} dev sample(s), got ${result.samples.length}`);
    const size = job.size ?? DEV_SIZES[0];
    return result.samples.map((sample, offset) => ({ tier: "dev", size, subject: job.subject.id, cell, index: index + offset, wallMs: sample.wallMs, polls: sample.polls, cssBytes: sample.cssBytes, cssSha256: sample.cssSha256, nativeModules: measured.nativeModules }));
  }
  if (job.tier === "build") {
    if (result.kind !== "build") throw new RunInvalid(`${job.subject.id}: expected a build result, got ${result.kind}`);
    return [
      {
        tier: "build",
        subject: job.subject.id,
        cell,
        index,
        wallMs: measured.wallMs - result.afterBuildMs,
        cpuUserMs: result.usageAtBuild.cpuUserMs,
        cpuSystemMs: result.usageAtBuild.cpuSystemMs,
        maxRssBytes: result.usageAtBuild.maxRssBytes,
        cssBytes: result.cssBytes,
        cssGzipBytes: result.cssGzipBytes,
        cssSha256: result.cssSha256,
        nativeModules: measured.nativeModules,
        rules: result.output.rules,
        declarations: result.output.declarations,
      },
    ];
  }
  if (result.kind !== "engine") throw new RunInvalid(`${job.subject.id}: expected an engine result, got ${result.kind}`);
  if (result.samples.length !== job.samples) throw new RunInvalid(`${job.subject.id}: expected ${job.samples} engine sample(s), got ${result.samples.length}`);
  return result.samples.map((sample, offset) => ({
    tier: "engine",
    scenario: job.scenario ?? "cold",
    subject: job.subject.id,
    cell,
    index: index + offset,
    wallMs: sample.wallMs,
    cpuMs: sample.cpuMs,
    rssBytes: sample.rssBytes,
    heapBytes: sample.heapBytes,
    cssBytes: sample.cssBytes,
    cssSha256: sample.cssSha256,
    nativeModules: measured.nativeModules,
    rules: result.output.rules,
    declarations: result.output.declarations,
  }));
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
  const seenCells = new Set<string>();
  for (const requested of plan.cells) {
    const corpus = plan.corpusFor(requested);
    // A community corpus can hold fewer classes than asked for; samples are labelled with what was measured.
    const cell: Cell = { utilities: corpus.parameters.utilities, files: corpus.parameters.files };
    if (seenCells.has(`${cell.utilities}x${cell.files}`)) continue;
    seenCells.add(`${cell.utilities}x${cell.files}`);
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
        const nativeProblems = checkNativeModules(measured.nativeModules, job.subject.natives, job.tier);
        if (nativeProblems.length > 0) throw new RunInvalid(`${id}: ${nativeProblems.join("; ")}`);
        for (const sample of toSamples(job, cell, have, measured)) {
          const hashId = hashKey(id, job, sample);
          const expected = hashes.get(hashId);
          if (expected === undefined) hashes.set(hashId, sample.cssSha256);
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
