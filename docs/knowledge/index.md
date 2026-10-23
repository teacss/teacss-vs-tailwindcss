# Knowledge

| Document | Summary |
| --- | --- |
| [engine-probe-2026-10-21](engine-probe-2026-10-21.md) | 已发布的 teacss 包在 pnpm 与 Bun 下都能走 Rust 路径的证据：安装、进程内、Vite 构建、Tailwind 进程内 API 四组观察。 |
| [teacss-vite-build-profile-2026-10-21](teacss-vite-build-profile-2026-10-21.md) | `@teacss/vite` 0.9.0-alpha.1 的构建剖析：teacss-rs 的构建增量 84% 在 `buildEnd`，主因是对成品样式表做三遍完整解析（lightningcss 一遍、css-tree 两遍）；teacss-ts 每个模块抽取前后各做一次完整快照比对，约 5.6 ms，所以随文件数增长。 |
| [teacss-vite-dev-profile-2026-10-22](teacss-vite-dev-profile-2026-10-22.md) | `@teacss/vite` 0.9.0-alpha.3 的开发服务器剖析：dev 层 530 ms 里有约 380 ms 是开发态每次 transform 都让 lightningcss 带着 easing visitor 走一遍整张样式表；引擎只占 94 ms。原型去掉这条路径后一轮 192 ms；teacss-ts d01a30dc 修复后复测 179 ms，低于 Tailwind 的 336 ms。附 Tailwind 插件对照和可借用项。 |
| [optimization-cards-2026-10-24](optimization-cards-2026-10-24.md) | 0.9.0 轮次后的六张优化卡片：四张给 teacss-ts（dev 时 Vite 重处理 1.1 MB 样式表约 36 ms、20 ms 去抖、字体 URL 改写、`consola` 等固定导入成本），两张给 teacss-rs（每个模块一次 NAPI 调用、每轮 dev 重建全部 token 集合）；每张带场景、正式数字、剖析证据与源码位置、收益上限和验收条件；附结果：T3 已合并并在未发布通道验收（20 000 × 300 构建 −13.5 ms），T2 与 T4 实测不改，T1 待所有者决定，R1 与 R2 待所有者放行。 |
| [unreleased-2026-10-24-t3](unreleased-2026-10-24-t3/) | T3 未发布通道的六份原始记录：发布版 0.9.0 与 teacss-ts master `4797acce` 交替各三次。 |
