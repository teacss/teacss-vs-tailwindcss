# Proposals

| Proposal | Summary | Status |
| --- | --- | --- |
| [v01 TeaCSS 与 Tailwind CSS v4 的可信性能对比](v01-credible-benchmark.md) | 按 standard-architecture 的 Node.js 映射重做仓库；成对语料加两级等价校验；engine 与 build 两个层级、四个被测对象、进程隔离、轮替采样与秩和检验；方法学规格先于数字提交。 | accepted 2026-10-21；三个偏好项按默认执行，见 Status |
| [v02 公平性与 Rust 价值](v02-fairness-and-rust-value.md) | 第二阶段：dev 层级与增量场景、引擎层资源指标与「Rust 的价值 / 价格」两张表、产出量、Tailwind 来源的社区语料、CI 交叉验证、两套配置与 PostCSS 集成。 | accepted 2026-10-22；第 1 到第 7 片已实现，正式运行等下一个 TeaCSS 版本，见 Status |
| [v03 跨构建工具的对比：Vite、Rsbuild、Bun](v03-build-tools.md) | 第三阶段：按工具分组（`rsbuild`、`bun`），组内基线、teacss-ts、teacss-rs、Tailwind 的 build 层级对比，各组相对自己基线的增量；Bun 组跑在 Bun 运行时里并写明；dev 层级推迟。 | accepted 2026-10-22；前置实验完成，四个插件都可进基准；规格 v03.1 已接受，第 1 片完成，见 Status |
