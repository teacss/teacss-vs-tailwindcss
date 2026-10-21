import { createHash } from "node:crypto";
import process from "node:process";
import type { Clock, SubjectClient } from "@bench/infrastructure";
import { type EngineSample, type EngineScenario, incrementalSize } from "../../contract/index.ts";
import { containsClass } from "../../css/index.ts";

export const WARM_UNTIMED_ITERATIONS = 3;
export const WARM_TIMED_ITERATIONS = 10;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function milliseconds(start: bigint, end: bigint): number {
  return Number(end - start) / 1e6;
}

export interface EngineRun {
  readonly samples: readonly EngineSample[];
  readonly css: string;
}

export interface EngineScenarioInput {
  readonly scenario: EngineScenario;
  readonly candidates: readonly string[];
  readonly extra: readonly (readonly string[])[];
}

async function timed(clock: Clock, call: () => Promise<{ css: string }>): Promise<{ sample: EngineSample; css: string }> {
  const cpu = process.cpuUsage();
  const started = clock.now();
  const { css } = await call();
  const wallMs = milliseconds(started, clock.now());
  const used = process.cpuUsage(cpu);
  const memory = process.memoryUsage();
  return { sample: { wallMs, cssBytes: Buffer.byteLength(css), cssSha256: sha256(css), cpuMs: (used.user + used.system) / 1000, rssBytes: memory.rss, heapBytes: memory.heapUsed }, css };
}

/**
 * Runs one engine scenario inside the subject process (spec v01.1 §Tiers, v02.1 §Tiers). `load`
 * imports and constructs the subject, so the cold timing covers module and native-binding loading.
 */
export async function runEngineScenario(input: EngineScenarioInput, load: () => Promise<SubjectClient>, clock: Clock): Promise<EngineRun> {
  const { scenario, candidates } = input;
  if (scenario === "cold") {
    const { sample, css } = await timed(clock, async () => (await load()).engine({ candidates }));
    return { samples: [sample], css };
  }
  const subject = await load();
  const k = incrementalSize(scenario);
  if (k === undefined) {
    for (let iteration = 0; iteration < WARM_UNTIMED_ITERATIONS; iteration++) await subject.engine({ candidates });
    const samples: EngineSample[] = [];
    let last = "";
    for (let iteration = 0; iteration < WARM_TIMED_ITERATIONS; iteration++) {
      const { sample, css } = await timed(clock, () => subject.engine({ candidates }));
      samples.push(sample);
      last = css;
    }
    return { samples, css: last };
  }
  if (input.extra.length !== WARM_TIMED_ITERATIONS || input.extra.some((group) => group.length !== k)) throw new Error(`${scenario} needs ${WARM_TIMED_ITERATIONS} groups of ${k} new candidates`);
  const session = await subject.engineSession();
  for (let iteration = 0; iteration < WARM_UNTIMED_ITERATIONS; iteration++) await session.generate(candidates);
  const samples: EngineSample[] = [];
  let last = "";
  for (const group of input.extra) {
    const { sample, css } = await timed(clock, () => session.generate([...candidates, ...group]));
    const missing = group.filter((name) => !containsClass(css, name));
    if (missing.length > 0) throw new Error(`${scenario}: the output lacks ${missing.length} new class(es), first ${missing[0]}`);
    samples.push(sample);
    last = css;
  }
  return { samples, css: last };
}
