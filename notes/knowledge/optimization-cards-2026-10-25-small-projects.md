# Optimization cards: small projects (2026-10-25)

These cards answer why TeaCSS builds of 1 000 utilities are slightly slower than Tailwind's. The [sixth official report](../reports/2026-10-25T08-53-46-mac.md) shows TeaCSS 0.9.3 behind Tailwind in five build tables at 1 000 utilities:

- Bun at 3, 30 and 300 files, by 7 ms to 15 ms;
- Vite and the default configuration at 300 files, by 13 ms and 7 ms.

TeaCSS is ahead at 3 and 30 files in Vite and Rsbuild, and from 5 000 utilities up it is fastest everywhere.

## How the evidence was gathered

- **Profiles.** Fresh-process builds through the harness's own subject process with the revision 6 environment: compile cache on, `NODE_ENV=production`. The Vite group was profiled at 1 000 x 3 and 1 000 x 300 and the Bun group at 1 000 x 3, with five `--cpu-prof` runs each after an uncounted run that warms the cache. Self time is grouped by package.
- **Source reading.** Tailwind 4.3.3's `@tailwindcss/vite`, `@tailwindcss/node`, `@tailwindcss/oxide` and `bun-plugin-tailwind`, against TeaCSS 0.9.3. Module graphs were counted with a loader hook.

These are evidence for where time goes, not benchmark numbers. Each card's gain must be measured in the unreleased lane.

Profiling also found a harness bias, fixed in spec v01.1 revision 7: the subject modules loaded packages their task never used.

## Where the time goes at 1 000 utilities

**The Vite build, 1 000 x 300** (mean of five profiles):

| | TeaCSS (Rust engine) | Tailwind |
| --- | --- | --- |
| The tool's own packages | 59 ms: `@teacss/engine` 17.8, `preset-standard` 12.9, `core` 11.2, `consola` 9.0, `runtime` 8.5 | 58 ms: `tailwindcss` 33.8, `lightningcss` 12.0, `@tailwindcss/vite` 8.4 |
| Garbage collection | 14.8 ms | 11.0 ms |
| Unattributed V8 time (`(program)`) | 18.2 ms | 11.1 ms |

**The Bun build, 1 000 x 3.**

- `teacss-rs-bun` spends 79.4 ms in native, GC and idle frames, against 44.9 ms for `tailwind-v4-bun` and 26.1 ms for the Bun baseline.
- 7.8 ms of that is `Intl.Segmenter`, which only TeaCSS pays.

**Module graphs.**

- In Vite, TeaCSS loads 52 JavaScript files (1.27 MB) and Tailwind 103 (1.37 MB), so the import size is close.
- Importing `@teacss/bun` loads 171 modules, 125 of them css-tree. `bun-plugin-tailwind` is one bundled file.

## teacss-ts

### S1. `consola` is imported eagerly, and it constructs an `Intl.Segmenter`

- **Evidence.**
  - `packages-engine/core/src/generator.ts:2` imports `consola` and uses it once, in the engine-fallback warning at `:3789`.
  - `packages-engine/config` imports it too (`load-config.ts:6`, `recovery.ts:5`).
  - `consola/dist/index.mjs:426` runs `new Intl.Segmenter()` at module top level.
  - Measured self time: `consola` 8.4 ms per Vite build at 1 000 x 300, and `Segmenter` 7.8 ms per Bun build at 1 000 x 3.
  - Tailwind loads no logger.
  - T4 tried a lazy `consola` before revision 5 and measured 3 ms, within the noise. Two things have changed since: the Bun profile now shows the segmenter cost directly, and the three import sites have to go lazy together.
- **Upper bound.** About 8 ms per build in Vite and in Bun.
- **Acceptance.**
  - `consola` is absent from the module list of a build without warnings.
  - The Vite and Bun builds at 1 000 x 3 are at least 5 ms lower.
  - The hashes are unchanged.

### S2. `@teacss/bun` loads the directives transformer, and css-tree with it, eagerly

- **Evidence.** `packages-integrations/bun/src/index.ts:9` imports `@teacss/directives`, which pulls in 125 css-tree modules and 3 mdn-data modules. The Vite integration already defers it through `lazy-directives.ts:9-12`.
- **Upper bound.** A large part of the Bun gap, which is 15 ms at 1 000 x 3. This is inferred from the module count and not measured.
- **Acceptance.**
  - The Bun build at 1 000 x 3 is at least 5 ms lower.
  - At most 65 modules are loaded after a build without directives.
  - The hashes are unchanged.

### S3. The Rust path evaluates the whole TypeScript preset

- **Evidence.**
  - `@presets "standard"` runs the 403 KB `preset-standard` index and its factory (`packages-presets/preset-standard/src/index.ts:52-101`).
  - The Rust engine only reads the preset's options tag (`packages/engine/src/select.ts:186-198` in teacss-rs), so the JavaScript rules go unused.
  - Measured: `preset-standard` 12.9 to 14.1 ms of self time per Vite build, and 8.6 ms per Bun build.
- **Upper bound.** About 8 to 12 ms per build.
- **Acceptance.**
  - The Vite and Bun builds at 1 000 x 3 are at least 8 ms lower.
  - The hashes are unchanged.
  - The fallback tests pass: the full preset still loads when the engine falls back to TypeScript.

### S4. The Vite plugin's transform hooks have no static filters

- **Evidence.**
  - `@teacss/vite` registers four transform hooks without a `filter` (`packages-integrations/vite/src/index.ts:56,67,71,72`). Rolldown therefore calls into JavaScript and copies `code` four times per module.
  - Three of the four return at once (`impl.ts:936-938, 959-966`).
  - `@tailwindcss/vite` declares a static `transform.filter`, so Rolldown never calls it for JavaScript modules.
- **Upper bound.** A few milliseconds at 300 files (a guess).
- **Acceptance.**
  - The Vite build at 1 000 x 300 is at least 3 ms lower.
  - The hashes are unchanged.

### S5. The font data-URL rewrite runs a regex over every build

- **Evidence.** `RegExp: ^data:font\/woff2;teacss=v1-…` takes 2.4 ms of self time per Vite build at 1 000 x 300, although the corpus uses no fonts beyond the preset's four.
- **Upper bound.** About 2 ms.
- **Acceptance.**
  - The Vite build at 1 000 x 3 is lower.
  - The hashes are unchanged.

## teacss-rs

### S6. Every module crosses NAPI twice in a Vite build

- **Evidence.**
  - Each module goes through skip-masking and MagicString (`runtime/src/transformers.ts:96-103`).
  - It then goes through `transformSource` over NAPI (`engine/src/transformer.ts:47-51`) and `extract` over NAPI (`runtime/src/context.ts:743`), each a copy and a UTF-16 conversion (`extractor_split.rs:539-549`).
  - That costs about 0.09 ms per module, which matches the 13 ms gap at 300 files.
  - Tailwind scans the files once in Rust (`Scanner.scan()`), on its own threads.
- **Options.**
  - Fuse `transformSource` and `extract` into one call.
  - Or follow Tailwind: in a build, extract on-disk modules in one `extractFiles` call at `buildEnd`, keeping per-module extraction for virtual and transformed modules.
- **Acceptance.**
  - The Vite build's slope from 3 to 300 files at 1 000 utilities drops from about 0.09 to 0.05 ms per module or less.
  - The hashes are unchanged.

### S7. `extract_files` returns per-file arrays that JavaScript deduplicates

- **Evidence.** `crates/teacss-napi/src/lib.rs:173` returns one token array per file, and `generation.ts:65-68` merges them in JavaScript.
- **Change.** Deduplicate in Rust and return one list.
- **Acceptance.**
  - The Bun build at 1 000 x 300 is lower.
  - The extracted token set is identical.

## What Tailwind does that TeaCSS already does better

- **A second CSS pass.** Tailwind runs lightningcss inside its transform, and Vite minifies again. TeaCSS runs one lightningcss pass.
- **Per-file work in Bun.** TeaCSS does one threaded `extractFiles` over a glob. Tailwind runs a native `onBeforeParse` per file plus an Oxide scan. TeaCSS's per-file cost is lower there, which is why its Bun gap narrows from 15 ms at 3 files to 7 ms at 300.
