# Optimization cards from the TeaCSS 0.9.0 round (2026-10-24)

The cards come from the [third official report](../reports/2026-10-23T20-14-57-mac.md): TeaCSS 0.9.0, spec v01.1 revision 4. They follow the owner's loop in teacss-ts `docs/plans/perf-iteration-loop.md` §3. Each card covers one issue and names:

- its owner;
- the scenario and the official numbers (median, IQR, range and runs from the raw record);
- the profiled evidence, with a source location;
- an upper bound on the gain, taken from the hotspot's share;
- the acceptance check: a target number plus unchanged output.

The profiles were captured outside the timed run, one process each, on the same machine and packages. They are evidence for where the time goes, not benchmark numbers.

Both owners merge to master only; nothing is published while the owner is away. Merged fixes are re-measured in a separate "unreleased" lane that never enters an official report.

## Where the time goes

**The dev round** at 20 000 utilities in 300 files, +10 classes. TeaCSS (Rust) takes 100.4 ms (IQR 3.2, range 93.7 to 130.1, n = 30); Tailwind takes 322.5 ms. A Vite debug trace of 20 rounds splits TeaCSS's round, counted from the moment the new module is fetched:

| Step | Median | Owner |
| --- | --- | --- |
| The plugin's invalidation fires | +21 ms | teacss-ts (T2) |
| Stylesheet `load`: regenerate and rewrite font URLs | 25 ms | teacss-rs (R2), teacss-ts (T3) |
| Vite's CSS `transform` of the 1.1 MB stylesheet | 36 ms | teacss-ts (T1) |
| The response and the harness's 5 ms poll | the rest | the harness |

**The Vite build** at 20 000 x 300: TeaCSS (Rust) takes 491.6 ms (IQR 6.7, n = 30) against a 233.5 ms baseline, so it adds 258 ms. Against the baseline, the profile shows the facade's `generate` (39 ms, the native call), the facade's per-module `#updateModule` (27 ms), extra module compilation (+28 ms), lightningcss minification (18 ms), the font URL rewrite (15 ms) and `consola` (11 ms).

**Small projects** at 1 000 x 3: TeaCSS (Rust) takes 304.6 ms (IQR 3.9) and Tailwind 297.2 ms (IQR 4.2), against a 201.4 ms baseline. TeaCSS adds 103 ms and Tailwind 96 ms. This is the size where Tailwind wins every build table, so fixed costs decide it. TeaCSS's profile there shows `consola` at 11 ms, `@teacss/preset-standard` at 14 ms, and `@teacss/core` and `@teacss/engine` at 10 ms each; Tailwind's whole package is 35 ms.

## teacss-ts

### T1. Dev: Vite re-processes the 1.1 MB stylesheet on every save

- **Scenario.** Dev +10 at 20 000 x 300, 100.4 ms.
- **Evidence.** Vite's `transform` of `/__tea.css` takes a median of 36 ms per round. TeaCSS's own transform hook returns `null` for that module, so the time goes to Vite's CSS pipeline.
  - `pluginTeacss` sets `css.transformer = "lightningcss"` (`packages-integrations/vite/src/index.ts:666`), so every dev save parses and prints the whole stylesheet with lightningcss. That costs 17 ms on this stylesheet, measured without any visitor.
  - The stylesheet carries four `url(/__teacss_fonts/…)` references written by `rewriteBundledAssets` (`index.ts:346`). Those keep it off Vite's PostCSS fast path, which skips any stylesheet without `url(` or `@import`.
  - Tailwind's 3.9 MB dev stylesheet takes that fast path in about 14 ms: two regex tests and a `JSON.stringify`.
- **Upper bound.** About 30 ms per round. A prototype with Vite left on its default transformer measured a 53 ms transform, 41 ms of which was PostCSS parsing for those four URLs.
- **Acceptance.**
  - Dev +10 at 20 000 x 300 at or under 70 ms.
  - `bench verify` passes on all five groups.
  - Build hashes unchanged: `ee274f23…` and `f4ea28ce…`.
  - Authored CSS keeps the easing repair in dev.

### T2. Dev: a fixed 20 ms debounce on every save

- **Scenario.** Dev +10 at 20 000 x 300.
- **Evidence.** The trace shows the entry invalidation firing a median of 21 ms after the new module is fetched. That is `ENTRY_INVALIDATION_DEBOUNCE_MS = 20` (`packages-integrations/vite/src/index.ts:34`, used at `:517`), followed by `waitForTransforms()` and `waitForRequestsIdle()`. Tailwind invalidates through the module graph with no timer.
- **Upper bound.** 20 ms per round.
- **Acceptance.** Dev +10 at least 15 ms lower, with the multi-environment and Astro behavior the debounce protects still passing teacss-ts's tests.

### T3. The font-URL rewrite scans the whole stylesheet

- **Scenario.** The Vite build at 20 000 x 300, and every dev round.
- **Evidence.** `@teacss/runtime/dist/internal/bundled-assets.js` takes 15 ms of self time in one build and about 4.4 ms per dev round (88 ms over 20 rounds). Source: `packages-engine/runtime/src/internal/bundled-assets.ts`, called from `packages-integrations/vite/src/index.ts:346`, `:807` and `:852`. The corpus uses no fonts beyond the preset's four references.
- **Upper bound.** About 15 ms per build and 4 ms per dev round.
- **Acceptance.** The Vite build at 20 000 x 300 at least 10 ms lower, with the build hashes unchanged.

### T4. Fixed import cost in every build, where Tailwind wins small projects

- **Scenario.** The Vite build at 1 000 x 3, where Tailwind leads by 7 ms (297.2 against 304.6 ms).
- **Evidence.** In that build, `consola` takes 11 ms of self time (`consola/dist/index.mjs:1`, a dependency of `@teacss/core`); Tailwind's build loads no logger. Module compilation is 42 ms against Tailwind's 36 ms, and `@teacss/preset-standard` evaluates for 14 ms.
- **Upper bound.** About 11 ms from loading `consola` lazily, or only when something is logged, plus part of the 6 ms compilation difference.
- **Acceptance.** The Vite build at 1 000 x 3 at least 8 ms lower, with the build hashes unchanged.

## teacss-rs

### R1. Facade: one native call per module

- **Scenario.** The Vite build at 20 000 x 300, 300 modules.
- **Evidence.** The facade's `#updateModule` (`packages/engine/src/generator.ts:799`, reached from `:411` and `:415`) takes 27 ms of self time in one build. That is about 0.09 ms per module, including the NAPI crossing into `update_module` (`crates/teacss-napi/src/lib.rs:102`, `crates/teacss-engine/src/api.rs:1045`). Each call carries one module's full source.
- **Upper bound.** About 27 ms per build at 300 modules, for example by batching module updates before generation.
- **Acceptance.**
  - The Vite build at 20 000 x 300 at least 15 ms lower.
  - Byte-identical output between the TypeScript and Rust engines in every group.
  - The build hashes unchanged.

### R2. Facade: every dev round rebuilds the set of all tokens

- **Scenario.** Dev +10 at 20 000 x 300.
- **Evidence.** `#isAllTokens` (`packages/engine/src/generator.ts:515`) runs `new Set(engine.allTokens())` again after every changed module, because `#updateModule` clears `#allTokens`. That copies all 20 010 tokens across NAPI and hashes them each round: 93 ms over 20 rounds, about 4.6 ms per round. The facade's `generate` adds about 6 ms per round.
- **Upper bound.** About 5 ms per round, for example by updating the set from the module delta or answering "is this all tokens" in the engine.
- **Acceptance.** Dev +10 at least 3 ms lower, with byte-identical output and the build hashes unchanged.

## Not cards

- **The engine itself.** C1 already took the warm generate to 52 ms at 20 000 x 300, 4.45x faster than Tailwind, and it is now 20 % of what the CSS adds to a Vite build.
- **Waiting for the file watcher** dominates Tailwind's dev round (+106 ms), not TeaCSS's.
- **lightningcss minification** in the production build (18 ms) is work the output needs.
