---
status: accepted
priority: P1
---
# 跨构建工具的对比：Vite、Rsbuild、Bun

## Status

2026-10-22。所有者确认方向与范围，提案接受。两项决定已定：Bun 组的数字同时也是运行时对比，接受并在报告里写明；Rsbuild 与 Bun 的 dev 层级放到下一个提案。下一步是规格 v03.1 与计划，在 0.9.0-alpha.3 的正式运行结束后写。

前置实验完成于 2026-10-22（见[计划第 0 片](../plans/v03-build-tools.md)）：四个插件都能在 5 000 × 30 的语料上产出完整样式表，Bun 组不用退化；Bun 的 CSS 打包器会把 Tailwind 的逻辑简写展开成长写，结构校验要认这种等价，写进了规格 v03.1 §Equivalence。规格 v03.1 与计划 v03 已写，所有者 2026-10-22 接受规格并要求开始实施。第 1 到第 4 片完成：结构校验认逻辑长写，Rsbuild 组，Bun 运行时与 Bun 组，报告的 Build tools 一节。下一步是第 5 片，安静机器上的正式运行。

## Problem

前两份报告只回答了 Vite 下的问题。所有者要知道 TeaCSS 在它支持的每条工具链上各要多少钱，外部读者要知道「TeaCSS 对 Tailwind 的结论」换了构建工具还成不成立。两个问题都需要同一组事实：每个工具自己的基线、加上 TeaCSS 之后的增量、加上 Tailwind 之后的增量。

现在能做这件事，是因为积木齐了：`@teacss/rsbuild` 和 `@teacss/bun` 随 0.9.0-alpha.3 发布；Tailwind v4 一侧有 Rsbuild 官方的 `@rsbuild/plugin-tailwindcss` 2.0.3 和 Bun 官方的 `bun-plugin-tailwind` 0.1.2。每个工具都能凑齐基线、TeaCSS、Tailwind 三件套，和现在的 Vite 组同构。

## Proposed direction

按工具分组，组内再做 TeaCSS 对 Tailwind；所有者关心的「TeaCSS 在哪条链上最便宜」从各组相对自己基线的增量读出。

| 组 | 被测对象 | 层级 |
| --- | --- | --- |
| `rsbuild` | rsbuild-baseline、teacss-ts-rsbuild、teacss-rs-rsbuild、tailwind-v4-rsbuild | build |
| `bun` | bun-baseline、teacss-ts-bun、teacss-rs-bun、tailwind-v4-bun | build |

- 报告按组出表，每组用自己的基线算增量。跨工具的绝对毫秒数是打包器之争，放在一张单独的表里并写明它比的是打包器和运行时，不是 CSS 工具。
- 每个工具用自己文档里的接法，与 main 组的规则一致：TeaCSS 的 Rsbuild 插件用 lightningcss 优化，Tailwind 的 `@rsbuild/plugin-tailwindcss` 建在 `@tailwindcss/webpack` 上并用 Tailwind 自带的 lightningcss 优化，两边都不走 PostCSS；Bun 两边都是 `Bun.build` 插件。
- Rsbuild 组的被测进程仍是 Node 24.14.1，Rspack 的原生绑定走现有的原生模块检查。
- Bun 组的被测进程跑在 Bun 运行时里，因为 `Bun.build` 只在 Bun 里有。注册表为每个被测对象记运行时（node 或 bun），Node 版本门禁只管 node 被测；原生模块检查在 Bun 里要换办法，由规格决定。报告在组表上方写明：这一组的差异包含运行时差异。
- 等价校验、语料、统计规则、采样与轮替全部沿用 v01.1 和 v02.1，不改已有测法，让这份报告与前两份可比。

## Scope

包含：两个新组的被测包、注册表与运行时选择、报告的分组表与跨工具表、规格 v03.1 作为 v02.1 的增补；一个前置实验：用 5 000 × 30 的语料分别跑四个新插件，产物过现有的等价校验，哪边不过哪边就先不进基准。

排除：Rsbuild 与 Bun 的 dev 层级（下一个提案，现有 dev 协议是 Vite 专用的）；engine 层级（与工具无关，已有）；新组的 default-config 与 PostCSS 变体；Webpack、esbuild 与 Rspack CLI（Rsbuild 已覆盖 Rspack）；Tailwind v3；修改任一被测工具。

## Rationale

- **按工具分组而不是按 CSS 工具分组**：读者先问「在我的工具链上」，再问「哪个 CSS 工具」。组内比较保持了 v01 的公平规则，跨组只报增量。
- **每组自己的基线**：Rolldown、Rspack、Bun 的打包器基础速度不同，没有基线的绝对数会把打包器的差异算到 CSS 工具头上。v01 的 `vite-baseline` 就是为此设的，这里照搬。
- **接受 Bun 的运行时差异**：用户在 Bun 里用 TeaCSS 就是在 Bun 运行时里用，测法贴近真实；代价是这一组和另两组不在同一运行时上，报告写明即可。另一种做法是在 Node 里模拟 `Bun.build`，做不到。
- **先做前置实验**：`bun-plugin-tailwind` 只有 0.1.2，能否在两万个类上产出完整样式表没有证据。实验花一个小时，失败的话 Bun 组退化为「基线对 TeaCSS」，仍然回答所有者的问题。
- **dev 层级推迟**：dev 协议要为 Rspack 的 dev server 和 Bun 的 HMR 各写一套完成信号，风险和工作量都大于 build 层级，先把能站住的做出来。

相关证据：[dev 层剖析](../knowledge/teacss-vite-dev-profile-2026-10-22.md)说明 CSS 工具在构建工具里的成本可能被工具链的处理步骤放大，跨工具对比正是要看这种放大在哪条链上出现。

## Open questions

1. Bun 里的原生模块检查：Bun 没有 `process.report`，备选是读取 `Bun.build` 的产物元信息或在被测进程里记录已加载的 `.node` 文件，规格决定。
2. `bun-plugin-tailwind` 在本仓库语料上能否通过等价校验，由前置实验回答。
3. Bun 自己的 CSS 处理（它的打包器会解析并压缩 CSS）对两边的产物是否一视同仁，规格里要写明测到的是哪一段。
