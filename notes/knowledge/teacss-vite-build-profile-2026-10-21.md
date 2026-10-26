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

## 建议的改法（2026-10-21 补）

按预期收益和风险排序。收益的依据是上面的测量；标「估算」的是推断。

### 1. core：配置提交后不再按模块做强制快照比对

`commitConfig` 之后 `_preparedConfigMutable` 一直是 `true`，`applyExtractorsCurrent` 因此在每个模块抽取前后各调一次 `ensureRuleIndexesCurrent(true)`，每次深比对整份配置和全部规则。核心已经有另一条路径：`_ruleObservation`（`observeRuleCollections`，用代理观察规则集合写入），非可变模式下 `isCurrent()` 是常数时间。

改法有三种，任选其一：

- 配置来自 CSS 入口、提交后不再变化时，提交完成即把 `_preparedConfigMutable` 置回 `false`，走观察路径。可变模式只为 `setConfig` 加带 getter 的配置保留。
- 保留可变模式，但把强制比对从「每个模块两次」改成「每个构建阶段一次」。
- 任何配置写入都递增一个修订号，修订号没变就跳过深比对。

预期：300 个文件的 `transform` 从约 1 700 ms 降到 rs 的水平，约 40 ms（测量：rs 路径不走这段检查，就是这个数）。teacss-ts 在 1 000 × 300 的构建从 2.07 s 降到约 0.6 s（估算）。等价校验能保证输出逐字节不变。

### 2. vite：easing 预检查误命中

`visitEasingEdits` 用 `/bezier|\\/i` 决定要不要用 css-tree 解析整张表。反斜杠本意是抓转义的 easing 名，但每个转义选择器都带反斜杠，所以只要有 `p\:4` 这样的类名就必然命中。本次语料的成品 CSS 里 `bezier` 出现 0 次，反斜杠 67 340 个，解析完全是白做的。

改法：预检查只看声明值，例如匹配 `bezier(` 或具体的转义 easing 标记；更稳的做法是让生成器在产出时记录是否匹配过 easing 规则，没有就跳过。

预期：省 211 ms（测量，这份语料的全部 easing 解析时间）。一行改动，风险最低。

### 3. vite：内联字体不要靠解析整张表来找

`collectBundledAssets`（`buildEnd`）和 `rewriteBundledAssets`（`generateBundle`）各用 css-tree 以 `parseCustomProperty: true` 解析一遍 1 MB 的表，只为找几处 `url(data:font/woff2;teacss=v1-…)`。这个 URL 格式是 teacss 自己生成的。

改法：生成器写入字体数据 URL 时同时记录摘要与偏移，`buildEnd` 和 `generateBundle` 直接用；或者至少解析一次、两处共用。退一步，按这个固定格式做字符串扫描也够。

预期：省约 167 ms（测量，两次解析之和）。

### 4. 更大的改动：不在插件里压缩整张表

`buildEnd` 里的 lightningcss 压缩占 326 ms，是单个最大的项。它存在是因为插件在 `generateBundle` 里替换占位符，Vite 自己的 CSS 压缩已经跑过，所以插件必须自己压缩一遍。对照：Tailwind 的 Vite 插件对 2.7 MB 的表只用 197 ms。1.06 MB 用 326 ms，每字节慢 4 倍以上，原因还没查，值得先看 `targets` 转换是否触发了大量前缀和降级。

改法有两层：先查 `targets`，这是小改动；根本办法是让 CSS 在 Vite 渲染之前就进入它的资源管线，由 Vite 统一压缩，去掉占位符替换。后者改动大，要重新考虑 `augmentChunkHash` 的时序。

预期：前者未知，后者最多省 326 ms（估算）。

### 合计

第 1 到第 3 项风险低、互不依赖，可以分别做。做完后 teacss-rs 的构建增量从 1 490 ms 降到约 1 100 ms（估算），teacss-ts 的 300 文件构建降一个量级（估算）。第 4 项决定能否追平 Tailwind。每项做完都用 `bun run bench:verify` 确认输出不变，再用 `bun run bench` 看数字。

## 后续（2026-10-21，teacss-ts 已实施）

teacss-ts 按计划 `notes/plans/vite-build-pipeline.md` 做完了五个 PR（#890 到 #894，master `cb2252e1`），本仓库核实了合并状态与计划状态；下面的数字是 teacss-ts 会话用本地链接构建测的，本仓库未独立复测，发布 0.9.0-alpha.2 后以第二份正式报告为准。

| 项 | 改法 | 结果（`vite build()` 内，3 次中位数） |
| --- | --- | --- |
| 建议 2，#890 | 预检查改为 `needsEasingEdits`，只认明文 `bezier` 或转义拼写后跟未转义 `(` | 转义选择器不再触发整表解析 |
| 建议 1，#891 | 抽取只读 `extractors` 与 `envMode`，`applyExtractorsCurrent` 改走非强制路径；生成时照旧强制比对 | ts 1000 × 300 的 `transform` 1 857 → 14 ms |
| 建议 3，#892 | `collectBundledAssets` 改为扫描 `url(` 记号，1 MB 约 7 ms，两处各扫一次 | 与 css-tree 结果逐项一致 |
| 建议 4，#893 | 只调查 | lightningcss 压缩本身约 22 ms，去掉 `targets` 19 ms；大头是压缩前 Vite 的 `preprocessCSS`，同一张表约 410 到 440 ms |

合计：ts 20000 × 300 的 `build()` 3 723 → 1 600 ms，rs 1 396 → 1 155 ms；每个任务输出哈希与 §基线相同。

对本文的修正：上面「`buildEnd` 里做了什么」一表把 326 ms 记在 lightningcss 名下，teacss-ts 的原生计时只有约 55 加 22 ms，差额很可能是 `preprocessCSS` 里的 JS 工作被归到了同一调用者。这一点两边都没有单独核实。剩下的大头是 `preprocessCSS`，去掉它需要 teacss-ts 单独立提案。

同日稍后，teacss-ts 还合入了 #895（`9e09ddce`）：生成的样式表在 transformer 与 `cssMinify` 都是 lightningcss 且没有 `@import` 时，跳过 Vite 的 `preprocessCSS`，只做一次带 `targets` 的压缩。teacss-ts 测得 `build()` 内 ts 20000 × 300 从 1 438 降到 1 039 ms，rs 从 1 019 降到 626 ms（本仓库未复测）。构建层输出因此少了一条重复的 `-webkit-text-decoration:inherit;`（32 字节，lightningcss 每过一遍都会给 reset 里已有的前缀再补一份），引擎层输出不变，ts 与 rs 仍逐字节一致。第二份报告的构建层哈希会与第一份不同，原因就是这一处。

Node 版本：teacss-ts 的这些本地数字（含 #895 的 1 680 ms）全部跑在 Node 24.14.1 上，与 `.node-version` 一致（teacss-ts #896 已注明）；第一份正式报告跑在 26.7.0 上。所以它们和下一次按 `.node-version` 的正式运行可以直接比，和第一份报告之间差一个 Node 版本。本文「方法」一节的剖析也是 24.14.1。
