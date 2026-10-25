# Optimization cards from the TeaCSS 0.9.0 round (2026-10-24)

The cards come from the [third official report](../reports/2026-10-23T20-14-57-mac.md): TeaCSS 0.9.0, spec v01.1 revision 4. They follow the owner's loop in teacss-ts `docs/plans/perf-iteration-loop.md` §3. Each card covers one issue and names:

- its owner;
- the scenario and the official numbers (median, IQR, range and runs from the raw record);
- the profiled evidence, with a source location;
- an upper bound on the gain, taken from the hotspot's share;
- the acceptance check: a target number plus unchanged output.

The profiles were captured outside the timed run, one process each, on the same machine and packages. They are evidence for where the time goes, not benchmark numbers.

Both owners merge to master only; nothing is published while the owner is away. Merged fixes are re-measured in a separate "unreleased" lane that never enters an official report.

## Outcomes

| Card | Owner | Outcome | Evidence |
| --- | --- | --- | --- |
| T1 | teacss-ts | Merged (teacss-ts #933) and accepted in the unreleased lane below, short of its number: dev +10 at 20 000 x 300 went from 102.8 to 77.7 ms, against a target of 70. By default the dev server now keeps Vite's PostCSS transformer, and the generated sheet writes its font URLs as `URL(…)`, so Vite's fast path skips it. Most of what is left is the easing guard over the generated sheet, about 5 ms per save, which teacss-ts kept. | below |
| T2 | teacss-ts | Not changed. The 20 ms window merges two invalidations 11 to 16 ms apart into one regeneration; at 0 ms dev +10 was slower (112 to 114 ms against 96 to 98). | teacss-ts #930 |
| T3 | teacss-ts | Merged (teacss-ts #929) and accepted in the unreleased lane below. | below |
| T4 | teacss-ts | Not merged. A lazy `consola` moved a fresh-process 1 000 x 3 import and build from 163.1 to 160.2 ms, within the noise and short of the 8 ms target. | teacss-ts #930, branch `perf/lazy-consola` |
| R1 | teacss-rs | Measured, not changed. 300 near-empty `updateModule` calls take 0.07 ms in total, so batching saves under 0.1 ms per build. The 27 ms is extraction itself (`extract_code`, mostly the scanner's masking passes), not the NAPI crossing. That would be a separate scanner card. | teacss-rs v06.1 实施记录 |
| R2 | teacss-rs | Merged (teacss-rs #467) and accepted in the unreleased lane below: dev +10 at 20 000 x 300 went from 104.5 to 99.6 ms. | below |
| F13.11 | teacss-rs | Merged (teacss-rs #468): a memo hit reuses the JavaScript strings it already handed over. teacss-rs measured `generate` on a memo hit going from 1.13 to 0.43 ms at 1 000 classes. No benchmark cell takes the memo path, so the lane below shows no effect. | below |
| P14 | teacss-rs | Merged (teacss-rs #476 to #479), not published. Faster extraction and safelist scanning. teacss-rs measured the facade's extraction going from 15.1 to 11.4 ms at 300 modules. The lane below finds no measurable effect on any end-to-end dev or build cell. | below |
| B5, B6 | teacss-ts | Shipped in 0.9.2 (B5, the compile cache from inside the plugins) and 0.9.3 (B6, a lazily loaded `@teacss/vite` entry). The `vite`, `rsbuild` and `astro` CLIs already enable the cache, so spec revision 5 gives it to every Node subject and neither change can show in this benchmark. B6 also exposed a harness bias: `@teacss/vite` up to 0.9.2 read `NODE_ENV` when the harness created it, before Vite set it, so the TypeScript engine's dev rounds ran in TeaCSS's build mode. Spec revision 6 sets `NODE_ENV` as the CLIs do; see the correction in the [fifth official report's audit](../reports/2026-10-25T07-25-49-mac.audit.md). | |
| B7 | teacss-ts | Merged (teacss-ts #953), not published. In dev mode each generate cloned every matched rule and variant again for the preflight payload; it now clones each source rule, shortcut and variant once per payload. Accepted in the lane below: the TypeScript engine's dev +10 at 20 000 x 300 went from 295.3 to 262.6 ms. | below |

TeaCSS 0.9.1 ships T1, T3, R2 and F13.11. Its official round, the [fourth official report](../reports/2026-10-24T04-01-33-mac.md), confirms the lanes below. At 20 000 x 300, teacss-rs's dev +10 went from 100.4 to 70.1 ms, the -25 ms of T1 plus the -5 ms of R2. That meets T1's target of 70 ms or less, which T1 alone missed. teacss-rs's Vite build went from 491.6 to 479.7 ms, and the build hashes did not change.

### B7 in the unreleased lane

This lane ran under spec revision 6. It compares published TeaCSS 0.9.3 with teacss-ts master `71410d6d`, linked through `bun run bench:link link --ts`, in the dev and Vite build tiers. The raw records are in [`unreleased-2026-10-25-ctx/`](unreleased-2026-10-25-ctx/).

| Cell | Scenario | Subject | Published 0.9.3 | teacss-ts master | Change |
| --- | --- | --- | --- | --- | --- |
| 20 000 x 300 | dev +10 | teacss-ts | 295.3 ms (IQR 15.4) | 262.6 ms (IQR 31.2) | -32.6 ms, Cliff's delta 0.72 |
| 20 000 x 300 | dev +100 | teacss-ts | 305.7 ms | 271.9 ms | -33.8 ms, Cliff's delta 0.85 |
| 20 000 x 3 | dev +100 | teacss-ts | 298.6 ms | 264.1 ms | -34.5 ms, Cliff's delta 0.88 |
| 1 000 x 3 | dev +10 | teacss-ts | 52.5 ms | 50.1 ms | no measurable difference |
| 20 000 x 300 | dev +10 | teacss-rs | 70.5 ms | 71.1 ms | no measurable difference |
| 20 000 x 300 | Vite build | teacss-ts | 996.3 ms | 1 000.4 ms | no measurable difference |
| 20 000 x 300 | dev +10 | tailwind-v4 | 325.0 ms | 324.6 ms | no measurable difference |

The change only touches the TypeScript engine's dev mode, and only that moved. The build hashes did not change, and `bench verify` passed on all five groups.

### P14 in the unreleased lane

This lane ran under spec revision 5. It compares the published `@teacss/engine` 0.9.1 with teacss-rs master `1f47de97`, linked through `bun run bench:link link --rs`. The method is the lanes' usual one, in the dev tier and in the Vite and Rsbuild build tiers. The raw records are in [`unreleased-2026-10-24-p14/`](unreleased-2026-10-24-p14/).

| Cell | Scenario | Subject | Published | teacss-rs master | Change |
| --- | --- | --- | --- | --- | --- |
| 20 000 x 300 | Vite build | teacss-rs | 410.2 ms (IQR 10.1) | 405.8 ms (IQR 8.9) | -4.4 ms, within the noise |
| 20 000 x 3 | Vite build | teacss-rs | 354.2 ms | 347.4 ms | -6.7 ms, within the noise |
| 20 000 x 300 | Rsbuild build | teacss-rs | 470.4 ms | 470.8 ms | no measurable difference |
| 20 000 x 300 | dev +10 | teacss-rs | 72.1 ms | 71.3 ms | no measurable difference |

teacss-rs expected 3 to 4 ms off a 20 000 x 300 build, which is below what these cells can resolve. The hashes did not change, and `bench verify` passed on all five groups.

### T3 in the unreleased lane

The unreleased lane compares published TeaCSS 0.9.0 with teacss-ts master `4797acce`, linked through `bun run bench:link`. Between the two, the only source change is #929 (`packages-engine/runtime/src/internal/bundled-assets.ts`); #928 is a dev-only lockfile bump. The method:

- the two lanes alternated three times, after the machine was quiet for two minutes;
- each lane and cell got 30 fresh-process Vite builds (spec v01.1 revision 4), on Node 24.14.1;
- the runs inside the lane used `--allow-busy`, because each run's own load check saw the previous run;
- the raw records are in [`unreleased-2026-10-24-t3/`](unreleased-2026-10-24-t3/).

These numbers are labelled unreleased and never enter an official report.

| Cell | Subject | Published 0.9.0 | teacss-ts master | Change |
| --- | --- | --- | --- | --- |
| 20 000 x 300 | teacss-rs | 482.2 ms (IQR 6.4) | 468.7 ms (IQR 7.5) | -13.5 ms, Cliff's delta 0.98 |
| 20 000 x 3 | teacss-rs | 430.5 ms | 420.0 ms | -10.5 ms |
| 1 000 x 300 | teacss-rs | 350.7 ms | 346.1 ms | no measurable difference |
| 1 000 x 3 | teacss-rs | 296.4 ms | 292.6 ms | no measurable difference |
| 20 000 x 300 | teacss-ts | 1 067.6 ms | 1 048.5 ms | -19.1 ms |
| 1 000 x 3 | teacss-ts | 385.0 ms | 373.3 ms | -11.6 ms |

The Vite baseline did not move (229.1 against 230.6 ms at 20 000 x 300). Every cell kept its hash: `f4ea28ce…` and `ee274f23…`, the same for both engines. T3's acceptance asked for at least 10 ms off the Vite build at 20 000 x 300 with the hashes unchanged, and it got 13.5 ms.

### T1 in the unreleased lane

This lane compares published TeaCSS 0.9.0 with teacss-ts master `9f76c490`, linked through `bun run bench:link link --ts`. That master holds T3 (#929) and T1 (#933); #932 only bumps dev dependencies. The method is the T3 lane's:

- three alternations after two quiet minutes, Node 24.14.1;
- each lane and cell got 30 fresh-process samples, in the dev tier (TeaCSS on both engines, and Tailwind as a control) and the build tier;
- after the last linked round, `bench verify` passed on all five groups at 20 000 x 300;
- the raw records are in [`unreleased-2026-10-24-t1/`](unreleased-2026-10-24-t1/).

| Cell | Scenario | Subject | Published 0.9.0 | teacss-ts master | Change |
| --- | --- | --- | --- | --- | --- |
| 20 000 x 300 | dev +10 | teacss-rs | 102.8 ms (IQR 8.4) | 77.7 ms (IQR 5.2) | -25.1 ms, Cliff's delta 0.92 |
| 20 000 x 300 | dev +100 | teacss-rs | 103.8 ms | 78.6 ms | -25.2 ms, Cliff's delta 0.95 |
| 20 000 x 3 | dev +10 | teacss-rs | 94.7 ms | 70.9 ms | -23.8 ms, within the noise (published IQR 48.8) |
| 20 000 x 300 | dev +10 | teacss-ts | 256.0 ms | 237.4 ms | -18.5 ms, within the noise |
| 1 000 x 3 | dev +10 | teacss-rs | 33.8 ms | 30.0 ms | no measurable difference |
| 20 000 x 300 | dev +10 | tailwind-v4 | 322.6 ms | 324.7 ms | no measurable difference |
| 20 000 x 300 | build | teacss-rs | 509.2 ms (IQR 19.6) | 481.6 ms (IQR 5.4) | -27.6 ms, Cliff's delta 0.97 |
| 20 000 x 300 | build | vite-baseline | 242.9 ms | 236.5 ms | no measurable difference |

Each of the three linked rounds put teacss-rs's dev +10 between 77.6 and 78.2 ms. Each published round put it between 101.1 and 109.3 ms. Tailwind's control did not move, so the machine stayed steady between lanes.

Two caveats on the build row:

- The published lane's Vite baseline ran about 6 ms higher in two of its three rounds. Net of the baseline, the build gain is about 21 ms.
- The gain includes T3's 13.5 ms, and this lane cannot separate T1 from T3.

The build hashes did not change: `ee274f23…` and `f4ea28ce…`, the same for both engines. T1 met every acceptance check except the number. It reached 77.7 ms against the target of 70 or less; teacss-ts's own harness measured 76.

### R2 and F13.11 in the unreleased lane

This lane compares the published `@teacss/engine` 0.9.0 with teacss-rs master `b7794da8`, built in `packages/engine` and linked through `bun run bench:link link --rs`. That master holds R2 (#467) and F13.11 (#468). Every other TeaCSS package stays at its published 0.9.0. The method is the T1 lane's, with the engine tier added. The raw records are in [`unreleased-2026-10-24-rs/`](unreleased-2026-10-24-rs/).

| Cell | Scenario | Subject | Published 0.9.0 | teacss-rs master | Change |
| --- | --- | --- | --- | --- | --- |
| 20 000 x 300 | dev +10 | teacss-rs | 104.5 ms (IQR 3.3) | 99.6 ms (IQR 4.4) | -4.9 ms, Cliff's delta 0.60 |
| 20 000 x 3 | dev +10 | teacss-rs | 97.1 ms | 91.1 ms | -6.0 ms, Cliff's delta 0.83 |
| 20 000 x 3 | dev +100 | teacss-rs | 99.8 ms | 94.2 ms | -5.6 ms, Cliff's delta 0.82 |
| 20 000 x 300 | dev +100 | teacss-rs | 106.1 ms | 102.6 ms | -3.5 ms, within the noise |
| 1 000 x 3 | dev +10 | teacss-rs | 34.0 ms | 33.3 ms | no measurable difference |
| 20 000 x 300 | engine, warm | teacss-rs | 52.4 ms | 53.1 ms | no measurable difference |
| 20 000 x 300 | engine, +10 | teacss-rs | 17.6 ms | 17.4 ms | no measurable difference |
| 20 000 x 300 | build | teacss-rs | 509.4 ms | 507.6 ms | no measurable difference |
| 20 000 x 300 | dev +10 | tailwind-v4 | 328.9 ms | 328.4 ms | no measurable difference |

- **R2** saves 5 to 6 ms per dev save at 20 000 classes, against an acceptance of at least 3 ms. The engine tier does not move, because R2 changes the facade's dev path, not generation.
- **F13.11** shows up in no cell. Every engine and dev cell regenerates after a change, and the memo hit it speeds up is not one of the measured scenarios.
- **Output.** The CSS hashes match between the two lanes in all 60 subject, tier and cell combinations. Both engines produce the same CSS in all 28 linked pairs. `bench verify` passed on all five groups.

The published lane in this run, and in the T1 lane, measured teacss-rs's 20 000 x 300 Vite build at 509 ms, against 492 ms in the third official report. The Vite baseline moved the same way (243 against 233 ms). The machine was about 4 % slower that day, so compare numbers only within a lane.

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
