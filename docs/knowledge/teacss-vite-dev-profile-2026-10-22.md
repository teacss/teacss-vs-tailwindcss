# @teacss/vite 开发服务器剖析（2026-10-22）

[alpha.3 本地链接运行](../reports/2026-10-21T21-05-20-mac.md)里，dev 层是 TeaCSS 落后最多的一层：20 000 个类、300 个文件，保存一个带 10 个新类的文件后，到样式表拿到这些类，Tailwind v4 要 337 ms，teacss-rs 要 530 ms，teacss-ts 要 633 ms。本文回答这 530 ms 花在哪里，以及 Tailwind 的 Vite 插件为什么只要 337 ms。只做诊断，没有改 teacss-ts 的代码。

## 方法

用本仓库的被测进程和 dev 任务，在 scratch 目录写了一次性脚本，没有进仓库：

- 每个被测对象一个新的 Node 24.14.1 进程，任务和 `bench run` 的 dev 层完全相同：20 000 × 300 的语料，每轮加 10 个类，30 轮，种子 20261021。
- 进程环境加 `DEBUG=vite:transform,vite:load,vite:hmr`，Vite 把每次 load、transform 的耗时和每次文件变更事件带毫秒时间戳写到 stderr，按轮切分后取中位数。
- 同一进程带 `--cpu-prof`，按函数自耗时和按文件汇总。
- 在真实的 20 000 类开发样式表（teacss 1 141 KB，Tailwind 3 859 KB）上，单独计时 Vite 开发态 CSS 管线的每一步，各 7 次取中位数。
- 一个原型：被测对象的 `createServer` 多传 `css: { transformer: "postcss" }`，其余不变，再跑 10 轮。
- 最后不带 profiler 再各跑 10 轮，作为干净的对照。

被测版本：`@teacss/vite`、`@teacss/core`、`@teacss/preset-standard` 本地链接自 teacss-ts `e133aff1`，`@teacss/engine` 0.9.0-alpha.3；Tailwind 4.3.3；Vite 8.3.4，lightningcss 1.33.0。机器负载在 3.2 到 4.6 之间，高于正式运行的门槛，但不带 profiler 的对照和正式运行一致：teacss-rs 530 ms 对 530 ms，Tailwind 332 ms 对 337 ms。

## 结果：一轮里发生了什么（20 000 × 300，中位数，ms）

时间从基准程序取到新模块那一刻起算。

| 被测 | 文件监视器触发 | 样式表 `load` | 样式表 `transform` | 最后一次 transform 完成 | 墙钟（带 profiler） | 墙钟（不带） |
| --- | --- | --- | --- | --- | --- | --- |
| tailwind-v4 | +103 | 0 | 204 | +309 | 341 | 332 |
| teacss-rs | +122 | 94 | 433 | +551 | 573 | 530 |
| teacss-ts | +227 | 203 | 438 | +672 | 695 | |

Vite 的 `load` 是插件 `load` 钩子的耗时，`transform` 是 load 之后整个 transform 管线的耗时，两者不重叠。

- Tailwind 的 CSS 生成发生在 `transform` 里（它的插件只有 transform 钩子），204 ms 包含扫描、编译和序列化 3.9 MB 的 CSS。Vite 自己的 CSS 处理几乎为零，原因见下文。
- teacss-rs 的 `load` 是 `generateDevCss`：引擎对全部 20 010 个 token 重新生成，94 ms，和 engine 层的 incremental-10（85 ms）一致。引擎不是瓶颈。
- teacss-rs 的 `transform` 要 433 ms，是整轮的主体。这一步 TeaCSS 自己的 transform 钩子对虚拟样式表直接返回 null，时间花在 Vite 的 CSS 管线里。
- teacss-ts 比 teacss-rs 多出的 120 ms 全在 `load`：TypeScript 引擎重新生成要 203 ms。

## 结果：433 ms 花在哪里

**原因是 `pluginTeacss` 把 Vite 切到了 lightningcss，并挂了一个 JS visitor。** teacss-ts `packages-integrations/vite/src/index.ts`：

- `config()`（653 到 661 行）：用户没写 `css.transformer` 时，补上 `css: { transformer: "lightningcss" }` 和 `build: { cssMinify: "lightningcss" }`。
- `configResolved()`（671 行）：`config.css.lightningcss = { ...options, visitor: createEasingImportVisitor(options, true) }`。

这个 visitor 在 `src/easing-imports.ts` 里，为每条 Rule、RuleExit 和 Declaration 注册回调。lightningcss 每遇到一个节点都要把它序列化成 JS 对象、调用回调、再读回去，1.1 MB 的样式表有几千条规则。开发态下 Vite 的 `vite:css` 插件对每次 transform 都调用 lightningcss，所以每敲一次键盘都走一遍。构建态下这只发生一次。

在真实的 20 000 类开发样式表上单独计时：

| 步骤 | ms |
| --- | --- |
| lightningcss transform，无 visitor | 17 |
| lightningcss，只带 Vite 自己的 Url visitor | 17 |
| lightningcss，带 TeaCSS 的 easing visitor | 379 |
| postcss 解析加序列化（带一个插件，Vite 的 postcss 路径） | 41 |
| Vite postcss 快速路径的两个正则判断 | 3 |
| `vite:css-post` 的 JSON.stringify | 1 |
| Tailwind 3.9 MB：快速路径的两个正则判断 | 11 |
| Tailwind 3.9 MB：JSON.stringify | 3 |

visitor 一项就是 379 ms，和 433 ms 减去 load 之外的杂项相符。CPU profile 从另一面印证：teacss-rs 进程有 10.7 s 落在 `(program)`，即没有 JS 栈帧的原生时间，每轮 357 ms；lightningcss 的 JS 入口本身没有进入前 25 名，因为时间在原生代码和跨边界的回调里。

**原型验证。** 只给 `createServer` 传 `css: { transformer: "postcss" }`，插件的 `config()` 补丁就不会生效，其余代码不动。teacss-rs 同一个格 10 轮：墙钟中位数 **192 ms**（对照 530 ms），`load` 92 ms，`transform` 53 ms，最后一次 transform 在 +167 ms 完成。这 53 ms 里有 41 ms 是 postcss 解析：开发样式表里有 4 个字体的 `url(/__teacss_fonts/…)`，Vite 为了改写 url 走了 postcss。

## 次要因素

- **去抖和空闲等待。** 新模块被 transform、提取出新 token 后，插件先等 `ENTRY_INVALIDATION_DEBOUNCE_MS`（20 ms，34 行），再等 `waitForTransforms()` 和 `server.waitForRequestsIdle()`，然后才让虚拟样式表失效（444 到 510 行）。这段时间里样式表照旧从缓存返回，所以 TeaCSS 每轮只有 2 到 3 次轮询命中服务器，Tailwind 有 6 次。量级是几十毫秒。
- **`rewriteBundledAssets`。** 每次生成后扫一遍输出改写字体引用，profile 里每轮约 5 ms。
- **文件监视器。** 两边都要等 macOS 的文件事件，约 100 ms。Tailwind 的失效完全靠它，TeaCSS 的失效由 transform 触发，不靠它。这是 1 000 类时 TeaCSS 反而略快的原因。

## 基准程序自身的影响

轮询是在被测进程的同一个线程里做的：每 5 ms 取一次样式表模块，正则取出 CSS，再对每个新类扫一遍。profile 里 Tailwind 进程 46% 的自耗时落在这个检查上，TeaCSS 进程 13%，但绝大部分是计时之外的首次全量校验：20 000 个类对 3.9 MB 的样式表，单独计时要数秒，TeaCSS 的 1.1 MB 要约 2.5 s。计时区间内的开销小得多：每次轮询解析一次模块约 10 ms，最后那次响应的解析和检查被算进了样本，20 000 类时约 10 到 50 ms，样式表大的一方多一些。

修正（spec v02.1 修订 4）：时钟停在收到首个包含全部新类的响应那一刻，文本和上一次相同的响应不再解析。修正后复测同一个格 10 轮：Tailwind 332 → 322 ms，teacss-rs 在噪声内（530 对 550，当时负载 5.5）。排名不变，上面的结论不受影响。

## Tailwind 的 Vite 插件为什么快，哪些可以借

对照 `@tailwindcss/vite` 4.3.3 的 dist 和仓库 main 的 `packages/@tailwindcss-vite/src/index.ts`：

1. **不碰 Vite 的 CSS 管线。** 它不设置 `css.transformer`，开发态不调用 `optimize`（lightningcss 只在 build 插件里）。它生成的 CSS 没有 `url(` 和 `@import`，所以 Vite 的 `compilePostCSS` 在入口处直接返回（Vite 8.3.4 `node.js` 30439 行的快速路径），开发态对 3.9 MB 的 CSS 零解析，只剩 11 ms 的正则判断和 3 ms 的 JSON.stringify。**可以借，而且是全部差距的来源**：开发态不装 easing visitor，构建态照旧。原型已经证明只要不走这条 visitor 路径，teacss-rs 一轮是 192 ms。再把开发态的字体引用改成不经过 `url(` 改写（比如由中间件直接按固定路径提供，CSS 里写死），就能完全落到 Tailwind 的快速路径上，再省约 40 ms。
2. **在 CSS 请求的 transform 里当场生成，没有计时器。** 没有 `configureServer`、`hotUpdate`、`load`，没有 `setTimeout`。源文件变化时它只靠 `addWatchFile` 让 Vite 的模块图失效，下一次请求样式表时再生成。**可以借一部分**：TeaCSS 的 20 ms 去抖加空闲等待是为了合并连续改动和配合 Astro 这类框架，去掉能省几十毫秒，但要保留对多环境的失效语义，收益小，优先级低。
3. **增量编译。** `Root` 缓存 compiler、Oxide scanner 和累积的 candidates，`compiler.build([...candidates])` 只编译新候选。TeaCSS 已经有对应物：按模块提取，生成器带缓存，引擎 94 ms 比 Tailwind 的扫描加编译更快。**不需要借。**
4. **开发态不出 sourcemap**，除非 `css.devSourcemap`。TeaCSS 也一样。

一句话：差距不在引擎，也不在插件的失效逻辑，而在开发态每次 transform 都让 lightningcss 带着 JS visitor 走一遍整张样式表。把 visitor 限制在构建态，dev 层就从 530 ms 回到 190 ms 左右，低于 Tailwind 的 332 ms。
