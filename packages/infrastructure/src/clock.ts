import { hrtime } from "node:process";

export interface Clock {
  now(): bigint;
}

export const systemClock: Clock = { now: () => hrtime.bigint() };

export function millisecondsBetween(start: bigint, end: bigint): number {
  return Number(end - start) / 1e6;
}
