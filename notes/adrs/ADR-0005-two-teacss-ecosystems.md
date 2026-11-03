# ADR-0005: TeaCSS 0.10 起按两个生态测量
Status: accepted

## Context
TeaCSS 0.10 拆成两个生态，各自发布，运行时互不依赖。teacss-ts 0.10.3 只发布 `@teacss/core`、`@teacss/preset-standard` 等库包、Vite 集成 `@teacss/vite-ts` 与命令 `teacss-cli`（`@teacss/cli`）；teacss-rs 0.10.4 发布不带后缀的集成名（`@teacss/vite`、`@teacss/postcss`、`@teacss/rsbuild`、`@teacss/bun`）、`@teacss/engine` 与命令 `teacss`。`engine` 选项、`TEACSS_ENGINE` 与 `TEACSS_ENGINE_STRICT` 都删除了，两边都没有回退。teacss-rs 的每个包声明 `engines.node >=26`。

2026-11-03 在 1 000 个类、30 个文件上实测：两边引擎输出逐字节相同；两个 Vite 插件的构建不同（103 677 与 105 233 字节），因为 `@teacss/vite-ts` 让生成的样式表经过 Lightning CSS，`@teacss/vite` 在 Vite 压缩之后才把它拼进产物；两个命令行的输出把字体 URL 换成摘要后逐字节相同，`teacss` 内联字体，`teacss-cli` 写成文件。

## Decision
- teacss-ts 的被测对象只用 teacss-ts 的包，teacss-rs 的只用 teacss-rs 的包；`teacss-ts-postcss`、`teacss-ts-rsbuild`、`teacss-ts-bun` 退役，因为 0.10 没有对应的包。新增 `cli` 组测两个命令。
- 被测进程是否加载 `teacss-engine` 证明它跑的是哪个引擎，取代 `TEACSS_ENGINE_STRICT`。
- 强等价：引擎逐字节；命令行逐字节，字体 URL 按摘要比较；Vite 插件对比较每个类与它声明的属性。每个构建对象另构建一次，让别的样式表排在自己的前面，检查一个工具类都不丢。
- `.node-version` 改为 26.12.0，`packageManager` 改为 bun@1.4.4（本机安装的版本）。

## Consequences
0.10 的报告与 0.9 的报告不可比：包、Node 与 Bun 都变了。「Rust 的价值」表比较的是两个生态各自的引擎与 Vite 插件，引擎行仍是同一份字节，构建与开发行比较的是两条管线。PostCSS、Rsbuild、Bun 组只剩 Rust 与 Tailwind。`bun run bench:link link --ts` 链接 `@teacss/vite-ts` 而不是 `@teacss/vite`，`--rs` 只换 `@teacss/engine`。

## Alternatives considered
- teacss-ts 的 PostCSS、Rsbuild、Bun 留在 0.9.3：两个版本混在一张表里，测的是已不维护的包。
- Vite 构建仍要求逐字节相同：两个插件的后处理不同，这条检查必然失败，而失败说明不了引擎有错。
- 在被测进程里用同一个 Lightning CSS 规范化两边再逐字节比较：要为 Lightning CSS 加的前缀写例外，例外本身就放宽了检查；类与属性的比较加上命令行的逐字节比较已覆盖引擎输出。
