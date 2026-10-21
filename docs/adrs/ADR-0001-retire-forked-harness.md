# ADR-0001: 删除最初的 bench/ 目录，不保留任何旧代码
Status: accepted

## Context
仓库最初的 `bench/` 是另一个对比项目的副本。它的 `bench/fixtures/teacss-vite` 实际安装的是 `unocss` 加 `presetWind3`，标签却是 teacss；语料只有 Tailwind 语法且用 `Math.random()` 生成；没有检查 Rust 引擎是否运行。本项目的测法与它不同，不以它为参照。

## Decision
整体删除 `bench/`，不保留、不迁移任何代码，也不沿用它的思路。测量方法只来自规格 v01.1 与 benchmark-checklist。

## Consequences
仓库里没有可以运行的旧数字，也没有带错误标签的对象。每个被测对象的包与配置都在规格的表里明文列出。

## Alternatives considered
- 保留为 `legacy/`：读者仍可能跑它得到标着 teacss、实为 UnoCSS 的数字。
- 就地把 fixture 换成 teacss：语料、随机性、引擎校验三个问题仍在。
