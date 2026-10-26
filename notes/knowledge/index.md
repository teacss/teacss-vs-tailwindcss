# Knowledge

| Document | Summary |
| --- | --- |
| [engine-probe-2026-10-21](engine-probe-2026-10-21.md) | 已发布的 teacss 包在 pnpm 与 Bun 下都能走 Rust 路径的证据：安装、进程内、Vite 构建、Tailwind 进程内 API 四组观察。 |
| [teacss-vite-build-profile-2026-10-21](teacss-vite-build-profile-2026-10-21.md) | `@teacss/vite` 0.9.0-alpha.1 的构建剖析：teacss-rs 的构建增量 84% 在 `buildEnd`，主因是对成品样式表做三遍完整解析（lightningcss 一遍、css-tree 两遍）；teacss-ts 每个模块抽取前后各做一次完整快照比对，约 5.6 ms，所以随文件数增长。 |
| [teacss-vite-dev-profile-2026-10-22](teacss-vite-dev-profile-2026-10-22.md) | `@teacss/vite` 0.9.0-alpha.3 的开发服务器剖析：dev 层 530 ms 里有约 380 ms 是开发态每次 transform 都让 lightningcss 带着 easing visitor 走一遍整张样式表；引擎只占 94 ms。原型去掉这条路径后一轮 192 ms；teacss-ts d01a30dc 修复后复测 179 ms，低于 Tailwind 的 336 ms。附 Tailwind 插件对照和可借用项。 |
| [optimization-cards-2026-10-24](optimization-cards-2026-10-24.md) | 0.9.0 轮次后的六张优化卡片：四张给 teacss-ts（dev 时 Vite 重处理 1.1 MB 样式表约 36 ms、20 ms 去抖、字体 URL 改写、`consola` 等固定导入成本），两张给 teacss-rs（每个模块一次 NAPI 调用、每轮 dev 重建全部 token 集合）；每张带场景、正式数字、剖析证据与源码位置、收益上限和验收条件；附结果：T3 已合并并验收（20 000 × 300 构建 −13.5 ms）；T1 已合并并验收但未达目标（dev +10 从 102.8 到 77.7 ms，目标 ≤ 70）；R2 已合并并验收（dev +10 −4.9 ms）；F13.11 已合并，基准场景里看不到效果；R1、T2 与 T4 实测不改。 |
| [optimization-cards-2026-10-25-small-projects](optimization-cards-2026-10-25-small-projects.md) | 1 000 个类时 TeaCSS 构建略慢于 Tailwind 的原因：剖析（Vite 与 Bun）加对照 Tailwind 4.3.3 源码；七张卡片，五张给 teacss-ts（`consola` 加载时创建 `Intl.Segmenter`、`@teacss/bun` 提前加载 css-tree、Rust 路径仍执行完整预设、Vite 钩子无静态过滤器、字体正则），两张给 teacss-rs（每模块两次 NAPI 往返、多文件去重放进 Rust）。 |
| [unreleased-2026-10-24-t3](unreleased-2026-10-24-t3/) | T3 未发布通道的六份原始记录：发布版 0.9.0 与 teacss-ts master `4797acce` 交替各三次。 |
| [unreleased-2026-10-24-t1](unreleased-2026-10-24-t1/) | T1 未发布通道的十二份原始记录：发布版 0.9.0 与 teacss-ts master `9f76c490` 交替各三次，dev 与 build 两层。 |
| [unreleased-2026-10-24-rs](unreleased-2026-10-24-rs/) | R2 与 F13.11 未发布通道的十八份原始记录：发布版 `@teacss/engine` 0.9.0 与 teacss-rs master `b7794da8` 交替各三次，engine、dev 与 build 三层。 |
| [unreleased-2026-10-24-p14](unreleased-2026-10-24-p14/) | P14 未发布通道的十二份原始记录（协议修订 5）：发布版 `@teacss/engine` 0.9.1 与 teacss-rs master `1f47de97` 交替各三次，dev 与 Vite、Rsbuild 构建两层；无可测差异。 |
| [unreleased-2026-10-25-ctx](unreleased-2026-10-25-ctx/) | B7 未发布通道的十二份原始记录（协议修订 6）：发布版 0.9.3 与 teacss-ts master `71410d6d` 交替各三次，dev 与 Vite 构建两层；TypeScript 引擎开发服务器 +10 从 295.3 到 262.6 ms。 |
