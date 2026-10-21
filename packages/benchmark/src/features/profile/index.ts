export interface Frame {
  readonly name: string;
  readonly selfMs: number;
  readonly share: number;
}

export interface ProfileSummary {
  readonly totalMs: number;
  readonly top: readonly Frame[];
}

interface ProfileNode {
  readonly id: number;
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
}

function isNode(value: unknown): value is ProfileNode {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "number" && "callFrame" in value && typeof value.callFrame === "object" && value.callFrame !== null;
}

function frameName(node: ProfileNode): string {
  const { functionName, url, lineNumber } = node.callFrame;
  const file =
    url
      .replace(/^file:\/\//, "")
      .split("/node_modules/")
      .pop() ?? url;
  const where = url === "" ? "" : ` (${file}:${lineNumber + 1})`;
  return `${functionName || "(anonymous)"}${where}`;
}

/** Self time per function from a V8 `.cpuprofile`: each sample's delta goes to the node it hit. */
export function summarizeProfile(profile: unknown, top = 3): ProfileSummary {
  if (typeof profile !== "object" || profile === null || !("nodes" in profile) || !("samples" in profile) || !("timeDeltas" in profile)) throw new Error("not a cpuprofile: nodes, samples and timeDeltas are needed");
  const { nodes, samples, timeDeltas } = profile;
  if (!Array.isArray(nodes) || !Array.isArray(samples) || !Array.isArray(timeDeltas)) throw new Error("not a cpuprofile: nodes, samples and timeDeltas must be arrays");
  const byId = new Map<number, ProfileNode>();
  for (const node of nodes) if (isNode(node)) byId.set(node.id, node);
  const selfMicros = new Map<string, number>();
  let totalMicros = 0;
  for (let index = 0; index < samples.length; index++) {
    const delta = Number(timeDeltas[index] ?? 0);
    const node = byId.get(Number(samples[index]));
    if (node === undefined || delta <= 0) continue;
    totalMicros += delta;
    const name = frameName(node);
    if (name === "(idle)" || name === "(program)" || name === "(root)") continue;
    selfMicros.set(name, (selfMicros.get(name) ?? 0) + delta);
  }
  const frames = [...selfMicros.entries()]
    .map(([name, micros]): Frame => ({ name, selfMs: micros / 1000, share: micros / totalMicros }))
    .sort((left, right) => right.selfMs - left.selfMs || left.name.localeCompare(right.name))
    .slice(0, top);
  return { totalMs: totalMicros / 1000, top: frames };
}
