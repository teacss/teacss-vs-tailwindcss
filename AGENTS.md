# AGENTS.md

This repository is a pnpm workspace that measures TeaCSS against Tailwind CSS
v4. `CLAUDE.md` points here.

## Read by task

- Start with [README.md](README.md) for the layout and the commands.
- The direction is the accepted [proposal](docs/proposals/v01-credible-benchmark.md);
  the order of work is the [plan](docs/plans/v01-credible-benchmark.md).
  Measurement rules live in `docs/specs/` once written; a number that does not
  follow them is not reported.

## Change rules

- Keep the four layers and one dependency direction described in the README.
  A new unit goes where the layer table puts it; `pnpm check:layout` and
  `pnpm check:dependencies` are the authority.
- The base `tsconfig.base.json` owns every compiler setting. A package only
  extends it.
- Features see the `SubjectClient` interface, never a `subject-*` package;
  only the composition root picks an implementation.
- A measured runtime (a napi addon, Oxide) is loaded by one subject process
  only; the orchestrator never loads one.
- Keep versions of the measured packages exact in the manifests and the
  lockfile committed.

## Documentation

| Directory | Purpose |
| --- | --- |
| `docs/proposals/` | Direction and scope, with an index |
| `docs/specs/` | The measurement protocol and other testable contracts |
| `docs/plans/` | Implementation slices and their acceptance |
| `docs/knowledge/` | Decision records and background |
| `docs/reports/` | Generated reports, one per published run |

Add, remove or rename a document and update its index in the same change.

## Verify and submit

Run `pnpm check` before submitting. Commit on a task branch with a
conventional message.
