# teacss-vs-tailwindcss

A reproducible performance comparison of three atomic CSS engines on the same
machine, the same paired corpus and the same Vite pipeline: the TeaCSS
TypeScript engine (`@teacss/core`), the TeaCSS Rust engine (`@teacss/engine`)
and Tailwind CSS v4 (Oxide).

## Status

No results yet. The direction is recorded in the
[proposal](docs/proposals/v01-credible-benchmark.md) and the work is sliced in
the [plan](docs/plans/v01-credible-benchmark.md). The repository currently
holds the workspace skeleton and the checks that keep its structure honest.

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

Node 24 runs the TypeScript sources directly; there is no build step.

```sh
pnpm install
pnpm check
```

`pnpm check` runs Biome, the per-package type checks, the tests and both
structure checks. Each script can run on its own: `pnpm lint:check`,
`pnpm typecheck`, `pnpm test`, `pnpm check:layout`, `pnpm check:dependencies`.

## Credits

The baseline-subtraction and interleaved-run ideas come from
[sonofmagic/tailwindcss-vs-unocss](https://github.com/sonofmagic/tailwindcss-vs-unocss)
(MIT). None of its code remains here.
