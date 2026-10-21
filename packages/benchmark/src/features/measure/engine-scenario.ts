import { createHash } from "node:crypto";
import type { Clock, SubjectClient } from "@bench/infrastructure";
import type { EngineSample, EngineScenario } from "../../contract/index.ts";

export const WARM_UNTIMED_ITERATIONS = 3;
export const WARM_TIMED_ITERATIONS = 10;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function milliseconds(start: bigint, end: bigint): number {
  return Number(end - start) / 1e6;
}

/**
 * Runs one engine scenario inside the subject process. `load` imports and constructs the
 * subject, so the cold timing covers module and native-binding loading (spec v01.1 §Tiers).
 */
export async function runEngineScenario(scenario: EngineScenario, candidates: readonly string[], load: () => Promise<SubjectClient>, clock: Clock): Promise<EngineSample[]> {
  if (scenario === "cold") {
    const started = clock.now();
    const subject = await load();
    const { css } = await subject.engine({ candidates });
    return [{ wallMs: milliseconds(started, clock.now()), cssBytes: Buffer.byteLength(css), cssSha256: sha256(css) }];
  }
  const subject = await load();
  for (let iteration = 0; iteration < WARM_UNTIMED_ITERATIONS; iteration++) await subject.engine({ candidates });
  const samples: EngineSample[] = [];
  for (let iteration = 0; iteration < WARM_TIMED_ITERATIONS; iteration++) {
    const started = clock.now();
    const { css } = await subject.engine({ candidates });
    samples.push({ wallMs: milliseconds(started, clock.now()), cssBytes: Buffer.byteLength(css), cssSha256: sha256(css) });
  }
  return samples;
}
