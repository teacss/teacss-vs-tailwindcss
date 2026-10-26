# AGENTS.md

This repository is a Bun workspace that measures TeaCSS against Tailwind CSS
v4. `CLAUDE.md` points here.

## Read by task

- Start with [README.md](README.md) for the layout and the commands.
- The direction is the accepted [proposal](notes/proposals/v01-credible-benchmark.md);
  the order of work is the [plan](notes/plans/v01-credible-benchmark.md).
  The measurement rules are [spec v01.1](notes/specs/v01.1-benchmark-protocol.md);
  a number that does not follow them is not reported.

## Change rules

- Keep the four layers and one dependency direction described in the README.
  A new unit goes where the layer table puts it; `bun run check:layout` and
  `bun run check:dependencies` are the authority.
- The base `tsconfig.base.json` owns every compiler setting. A package only
  extends it.
- Features see the `SubjectClient` interface, never a `subject-*` package;
  only the composition root picks an implementation. A feature never imports
  another feature; code two features share lives beside them in
  `packages/benchmark/src/` (`corpus`, `css`, `contract`, `persistence`).
  Biome enforces both.
- A measured runtime (a napi addon, Oxide) is loaded by one subject process
  only; the orchestrator never loads one.
- Keep versions of the measured packages exact in the manifests and
  `bun.lock` committed. Bun installs; Node runs the harness and the subjects.
- Use Bun for installs and scripts, never npm or pnpm.

## Documentation

| Directory | Purpose |
| --- | --- |
| `notes/proposals/` | Direction and scope, with an index |
| `notes/specs/` | The measurement protocol and other testable contracts |
| `notes/plans/` | Implementation slices and their acceptance |
| `notes/adrs/` | Architecture decision records, with an index |
| `notes/knowledge/` | Evidence and background, with an index |
| `notes/reports/` | Generated reports, one per published run |
| `notes/articles/` | Plain-language write-ups of a published report, with an index |

Add, remove or rename a document and update its index in the same change.

## Verify and submit

Run `bun run check` before submitting. Commit on a task branch with a
conventional message.
