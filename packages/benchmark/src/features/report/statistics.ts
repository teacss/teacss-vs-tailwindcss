export interface Summary {
  readonly n: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly iqr: number;
  readonly p95: number;
  readonly max: number;
}

function quantile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * share;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? Number.NaN;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

export function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((left, right) => left - right);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return { n: sorted.length, min: sorted[0] ?? Number.NaN, q1, median: quantile(sorted, 0.5), q3, iqr: q3 - q1, p95: quantile(sorted, 0.95), max: sorted[sorted.length - 1] ?? Number.NaN };
}

export interface MannWhitney {
  readonly u: number;
  readonly z: number;
  /** Two-sided, from the normal approximation with tie correction. */
  readonly p: number;
}

function ranks(values: readonly number[]): { ranks: number[]; tieTerm: number } {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const result = new Array<number>(values.length).fill(0);
  let tieTerm = 0;
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.value === order[start]?.value) end++;
    const rank = (start + end) / 2 + 1;
    for (let index = start; index <= end; index++) result[order[index]?.index ?? 0] = rank;
    const size = end - start + 1;
    tieTerm += size ** 3 - size;
    start = end + 1;
  }
  return { ranks: result, tieTerm };
}

function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const polynomial = -x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const value = t * Math.exp(polynomial);
  return x >= 0 ? value : 2 - value;
}

export function mannWhitneyU(left: readonly number[], right: readonly number[]): MannWhitney {
  const n1 = left.length;
  const n2 = right.length;
  const { ranks: all, tieTerm } = ranks([...left, ...right]);
  const rankSum = all.slice(0, n1).reduce((sum, rank) => sum + rank, 0);
  const u1 = rankSum - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);
  const total = n1 + n2;
  const variance = ((n1 * n2) / 12) * (total + 1 - tieTerm / (total * (total - 1)));
  if (variance === 0) return { u, z: 0, p: 1 };
  const z = (u1 - (n1 * n2) / 2) / Math.sqrt(variance);
  return { u, z, p: erfc(Math.abs(z) / Math.SQRT2) };
}

/** Share of pairs where left is below right minus the share where it is above; negative means left is lower. */
export function cliffsDelta(left: readonly number[], right: readonly number[]): number {
  let more = 0;
  let less = 0;
  for (const a of left) {
    for (const b of right) {
      if (a > b) more++;
      else if (a < b) less++;
    }
  }
  return (more - less) / (left.length * right.length);
}

export type Verdict = { readonly kind: "no-measurable-difference"; readonly p: number } | { readonly kind: "differs"; readonly lower: "left" | "right"; readonly ratio: number; readonly p: number; readonly delta: number };

export const SIGNIFICANCE = 0.01;

/** Spec v01.1 §Statistics: differs when p < 0.01 and the medians are further apart than the larger IQR. */
export function compare(left: readonly number[], right: readonly number[]): Verdict {
  const a = summarize(left);
  const b = summarize(right);
  const { p } = mannWhitneyU(left, right);
  const gap = Math.abs(a.median - b.median);
  if (p >= SIGNIFICANCE || gap <= Math.max(a.iqr, b.iqr)) return { kind: "no-measurable-difference", p };
  const lower = a.median < b.median ? "left" : "right";
  return { kind: "differs", lower, ratio: Math.max(a.median, b.median) / Math.min(a.median, b.median), p, delta: cliffsDelta(left, right) };
}
