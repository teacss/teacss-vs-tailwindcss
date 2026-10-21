# @teacss/vite 构建管线剖析（2026-10-21）

第一次正式运行的[审核](../reports/2026-10-21T09-19-14-mac.audit.md)把构建层的限制因素记为 inconclusive：teacss-rs 的热态引擎只要 155 ms，Vite 构建却比基线多出 1 490 ms。本文回答两个问题：这 1 490 ms 花在哪里，以及 teacss-ts 的构建为什么随文件数增长。只做诊断，没有改 teacss-ts 或 teacss-rs 的代码。

## 方法

用本仓库的语料生成器和被测对象，在 scratch 目录写了一个一次性脚本，用完即弃，没有进仓库：

- 每次一个新的 Node 24.14.1 进程，准备的项目和 `bench run` 完全相同，用种子 20261021 生成，带 `// @teacss-include` 和根目录 `index.css`，`TEACSS_ENGINE_STRICT=1`。
- 构建调用的是 `pluginTeacss(undefined, { engine })`，四个 teacss 插件的每个钩子都包了一层计时，记录调用次数、累计时长，以及各次调用区间并集得到的墙钟时长。
- 只计时 `vite build()` 本身。Node 启动和 import 不计入；在 `bench run` 里，这部分对基线和 teacss 基本相同，见下文。
- 三种被测情况（基线、ts、rs）× 三个格（20 000 × 300、1 000 × 300、1 000 × 3），交替各跑 3 次，取中位数。负载在 2.3 到 3.2 之间，即核数的 19% 到 27%。三次之间的波动不超过 3%。
- 另外对 rs 20 000 × 300、ts 20 000 × 300、ts 1 000 × 300 各跑一次 `--cpu-prof`，按 npm 包汇总自耗时，再把 `css-tree` 和 lightningcss 的样本沿调用栈归到最近的 `@teacss` 调用者。

被测版本：`@teacss/vite`、`@teacss/core`、`@teacss/preset-standard` 0.9.0-alpha.1，`@teacss/engine` 0.8.5-alpha.4，Vite 8.3.4。源码对照用的是 teacss-ts `7184f266`，即 0.9.0-alpha.1 的发布提交。

## 结果：钩子计时（中位数，ms）

| 格 | 被测 | `build()` | `buildEnd` | `transform`（次数） | `generateBundle` | `configResolved` |
| --- | --- | --- | --- | --- | --- | --- |
| 20 000 × 300 | 基线 | 35 | | | | |
| 20 000 × 300 | teacss-rs | 1 510 | 1 252 | 42（305） | 118 | 42 |
| 20 000 × 300 | teacss-ts | 3 655 | 1 682 | 1 730（305） | 119 | 50 |
| 1 000 × 300 | teacss-rs | 316 | 186 | 15（305） | 22 | 40 |
| 1 000 × 300 | teacss-ts | 2 071 | 236 | 1 695（305） | 22 | 51 |
| 1 000 × 3 | teacss-rs | 280 | 178 | 3（8） | 22 | 40 |
| 1 000 × 3 | teacss-ts | 392 | 227 | 44（8） | 21 | 51 |

`transform` 的累计时长等于墙钟时长，说明 rolldown 是串行调用这个 JS 插件钩子的。

**1 490 ms 的去向。** `bench run` 里基线进程是 258 ms，其中 `build()` 只有 35 ms，其余是 Node 启动和 import Vite。teacss-rs 进程是 1 748 ms，`build()` 1 510 ms，所以 teacss 自己的 import 只有十几毫秒。也就是说，进程级的 1 490 ms 增量里，有 1 475 ms 落在 `build()` 内：

| 去向 | ms | 占增量 |
| --- | --- | --- |
| `buildEnd`（最终生成和后处理） | 1 252 | 84% |
| `generateBundle` | 118 | 8% |
| `transform` 与 `configResolved` | 84 | 6% |
| 其余钩子与 Vite 自身的差额 | 约 20 | 1% |

## 结果：`buildEnd` 里做了什么（teacss-rs，20 000 × 300）

`buildEnd` 调用 `finalizeBuildCss()`（`packages-integrations/vite/src/index.ts:691`），对引擎生成的整张样式表依次做四件事。下表是剖析里各部分的自耗时，剖析本身会让总时长变长：

| 步骤 | 调用者（源码） | 自耗时 | 占剖析 |
| --- | --- | --- | --- |
| lightningcss 压缩整张表 | `@teacss/vite` 的 `transform({ minify: true })`（`index.ts:423`） | 326 ms | 18% |
| css-tree 解析，easing 处理 | `@teacss/directives/internal/easing` | 211 ms | 12% |
| css-tree 解析，扫描内联资源 | `@teacss/runtime/internal/bundled-assets`（`collectBundledAssets`） | 167 ms | 9% |
| 引擎 `generate` 的 JS 外观层 | `@teacss/engine/src/facade/generator.mjs:416` | 189 ms（整个 `@teacss/engine`） | 10% |
| 未归属的原生时间 | Rust 引擎和 rolldown 的原生代码 | 347 ms | 19% |
| 垃圾回收 | | 185 ms | 10% |

由此可以确定：Rust 引擎生成 CSS 并不是构建的主要成本。同一张 1 MB 的样式表在生成之后被完整解析了三遍，lightningcss 一遍，css-tree 两遍。这三遍加起来约 700 ms，已经是引擎外观层的 3.7 倍。未归属的原生时间里，Rust 引擎和 rolldown 各占多少，在这份剖析里分不开。

作为对照，Tailwind 的构建只用 lightningcss 处理一遍，自耗时 197 ms，没有 css-tree。

## 结果：teacss-ts 为什么随文件数增长

在 300 个文件的格上，不论 1 000 还是 20 000 个 utility，teacss-ts 的 `transform` 都约 1 700 ms，相当于每个模块固定约 5.6 ms，与类名数量无关。teacss-rs 做同样的事只要 15 到 42 ms。

在 ts 1 000 × 300 的剖析里，`@teacss/core` 占 73%，其中压缩后的函数 `Wo` 一个就占 1 022 ms。调用链是 `applyExtractorsCurrent` → `ensureRuleIndexesCurrent` → `qo` → `Wo`（递归）。对照源码（teacss-ts `packages-engine/core/src/generator.ts`）：

- `qo` 是 `isRuleSnapshotCurrent`（`:1052`），`Wo` 是 `isMutableValueCurrent`（`:965`），递归比对快照。压缩后的代码与源码逐句对得上，例如两者都以 `if (rules.length !== snapshots.length) return false` 开头。
- 用 Vite 插件加载配置时，生成器走 `prepareConfig` / `commitConfig`（`:1990` 到 `:2035`），`_preparedConfigMutable` 被设为 `true`，之后不再改回。
- 因此 `applyExtractorsCurrent`（`:2046`）在每个模块抽取前后都会调用 `ensureRuleIndexesCurrent(true)`。强制模式下，要用 `isPreparedCacheSnapshotCurrent` 比对整份配置快照，再用 `isRuleSnapshotCurrent` 比对 preset-standard 的全部规则和 shortcut。这个成本与配置大小成正比，与模块内容无关，每个模块付两次。

Rust 引擎路径下，抽取由 `@teacss/engine` 的外观层接管，不经过这段检查，所以 rs 的 `transform` 不随文件数增长。

## 结论

- teacss-rs 构建慢于 Tailwind，原因不在 Rust 引擎。主要成本是 `@teacss/vite` 在 `buildEnd` 里对成品样式表做的三遍完整解析，约 700 ms，其中 lightningcss 压缩一遍、css-tree 两遍。
- teacss-ts 的构建随文件数增长，是因为每个模块抽取前后都要完整比对配置和规则快照，固定约 5.6 ms，与模块内容无关。
- 以上两点都是测量得出的。其中 `Wo`、`qo` 与源码函数的对应关系，是靠逐句比对压缩代码确认的，那份构建产物没有 source map。
- 尚未拆开的是：未归属的 347 ms 原生时间里，Rust 引擎和 rolldown 各占多少。要拆开，需要原生层面的剖析，比如 macOS 的 `sample` 或 Instruments。

本文只做诊断，改法留给 teacss-ts，比如对同一个样式表只解析一次，或者在配置提交后不再按模块做强制快照比对。
