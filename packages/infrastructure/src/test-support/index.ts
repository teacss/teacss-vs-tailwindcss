import type { Clock } from "../clock.ts";

/** Advances by a fixed step on every read, so durations are deterministic. */
export function fakeClock(stepNs = 1_000_000n): Clock {
  let current = 0n;
  return {
    now() {
      current += stepNs;
      return current;
    },
  };
}
