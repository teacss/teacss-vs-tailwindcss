# teacss-vs-tailwindcss

A reproducible performance comparison of three atomic CSS engines on the same
machine, the same paired corpus and the same Vite pipeline: the TeaCSS
TypeScript engine (`@teacss/core`), the TeaCSS Rust engine (`@teacss/engine`)
and Tailwind CSS v4 (Oxide).

## Status

No published results yet. The method is [spec v01.1](docs/specs/v01.1-benchmark-protocol.md),
the direction is the [proposal](docs/proposals/v01-credible-benchmark.md) and the
work is sliced in the [plan](docs/plans/v01-credible-benchmark.md). The pipeline
runs end to end on all four subjects; the first published run waits for a quiet
machine (the run refuses to start above 20 % one-minute load).

## Layout

The repository follows Billgo's standard architecture for a Node.js tool:
four layers, one dependency direction, one process per native runtime.

| Unit | Layer | Holds |
| --- | --- | --- |
| `apps/bench` | shell | `main.ts` (the orchestrator) and `subject.ts` (one measured subject per process) |
| `packages/benchmark` | product | corpus, measure, verify, report and environment features; the composition root; the process contract; persistence |
| `packages/infrastructure` | foundation | config, logging, clock, processes, workspace, the `SubjectClient` interface and its fakes |
| `packages/subject-*` | isolation | one measured runtime each behind the `SubjectClient` interface |
| `results/` | data | raw samples committed with each report |
| `docs/` | documentation | proposals, specs, plans, ADRs, knowledge, reports |

A shell depends on exactly one product. The product depends on the foundation
and the isolation units, and only its composition root picks an
implementation. An isolation unit depends on the foundation alone. The
foundation depends on nothing in the workspace. `scripts/check-layout.ts` and
`scripts/check-dependencies.ts` fail the build on any deviation.

## Develop

Bun installs the workspace; Node 24 runs the TypeScript sources directly, so
there is no build step.

```sh
bun install
bun run check
```

`bun run check` runs Biome, the per-package type checks, the tests and both
structure checks. Each script can run on its own: `bun run lint:check`,
`bun run typecheck`, `bun run test`, `bun run check:layout`,
`bun run check:dependencies`.

## Measure

```sh
bun run bench:verify --utilities 5000 --files 30   # equivalence checks on one corpus
bun run bench                                        # the full matrix, 30 samples per cell, into results/
bun run bench:ts-tailwind                            # the same without teacss-rs
bun run bench:report results/<file>.json             # Markdown and JSON summary into docs/reports/
```

`bun run bench` refuses to start when the one-minute load exceeds 20 % of the
logical cores; `--allow-busy` records the run anyway and the report says so.
`node apps/bench/src/main.ts --help` lists every option. Bun is the package
manager; Node 24 runs the harness and every measured process, because that is the runtime a Vite build uses by default
([ADR-0003](docs/adrs/ADR-0003-published-packages.md)).
