# Knowledge

| Document | Summary |
| --- | --- |
| [engine-probe-2026-10-21](engine-probe-2026-10-21.md) | 已发布的 teacss 包在 pnpm 与 Bun 下都能走 Rust 路径的证据：安装、进程内、Vite 构建、Tailwind 进程内 API 四组观察。 |
| [teacss-vite-build-profile-2026-10-21](teacss-vite-build-profile-2026-10-21.md) | `@teacss/vite` 0.9.0-alpha.1 的构建剖析：teacss-rs 的构建增量 84% 在 `buildEnd`，主因是对成品样式表做三遍完整解析（lightningcss 一遍、css-tree 两遍）；teacss-ts 每个模块抽取前后各做一次完整快照比对，约 5.6 ms，所以随文件数增长。 |
| [teacss-vite-dev-profile-2026-10-22](teacss-vite-dev-profile-2026-10-22.md) | `@teacss/vite` 0.9.0-alpha.3 的开发服务器剖析：dev 层 530 ms 里有约 380 ms 是开发态每次 transform 都让 lightningcss 带着 easing visitor 走一遍整张样式表；引擎只占 94 ms。原型去掉这条路径后一轮 192 ms；teacss-ts d01a30dc 修复后复测 179 ms，低于 Tailwind 的 336 ms。附 Tailwind 插件对照和可借用项。 |
