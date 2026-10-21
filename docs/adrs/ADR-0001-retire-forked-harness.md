# ADR-0001: 删除上游 fork 的 bench/，不作为保留代码
Status: accepted

## Context
仓库最初是 `sonofmagic/tailwindcss-vs-unocss`（MIT）的 fork。它的 `bench/fixtures/teacss-vite` 实际安装的是 `unocss` 加 `presetWind3`，标签却是 teacss；语料只有 Tailwind 语法且用 `Math.random()` 生成；没有检查 Rust 引擎是否运行。standard-architecture 允许把旧代码标为「保留」继续放着，但保留的前提是它不误导新工作。

## Decision
整体删除 `bench/`，不保留、不迁移任何代码。保留三个思路并在 README 致谢上游：构建层级用无 CSS 引擎的基线做减法；被测对象轮替运行；报告分位数而非平均值。

## Consequences
仓库里没有任何可以运行的旧数字，也没有带错误标签的对象。新实现从规格 v01.1 出发，每个被测对象的包与配置在规格的表里明文列出。

## Alternatives considered
- 保留 `bench/` 并改名为 `legacy/`：读者仍可能跑它得到「teacss」的数字，而那是 UnoCSS 的。
- 就地修改 fixture 换成 teacss：语料、随机性、引擎校验三个问题仍在，等于在错的骨架上继续加。
