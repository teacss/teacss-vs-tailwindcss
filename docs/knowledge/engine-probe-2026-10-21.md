# 探针：已发布包能否走 Rust 路径（2026-10-21）

一次性实验，代码已丢弃；结论进了 [ADR-0003](../adrs/ADR-0003-published-packages.md) 与规格 v01.1。机器：Apple M2 Max，Node 24.14.1，pnpm 10.30.1。

## 安装

`npm install vite@8.3.4 @teacss/vite@0.8.5 @teacss/engine@0.8.5-alpha.3 …`：

```
npm error code ETARGET
npm error notarget No matching version found for @teacss/engine@>=0.9.0.
```

`pnpm add -D` 同一组包：安装成功，警告 `unmet peer @teacss/engine@>=0.9.0: found 0.8.5-alpha.3`，并装入 `@teacss/engine-darwin-arm64@0.8.5-alpha.3`。

## 进程内（engine 层级）

`createGenerator({ presets: [presetStandard()], engine })` 加 `generate(4 个 token, { preflights: false, minify: true })`，`TEACSS_ENGINE_STRICT=1 TEACSS_ENGINE_STATS=1`：

| engine | `process.report.getReport().sharedObjects` 里的 `.node` | stats | 输出 |
| --- | --- | --- | --- |
| `ts` | 无 | `rust=0 ts=1` | 205 字节 |
| `rust` | `teacss-engine.darwin-arm64.node` | `rust=1 ts=0` | 205 字节，与 ts 相同 |

`process.moduleLoadList` 与 `require.cache` 都看不到原生模块；`sharedObjects` 是可用的证据。

## Vite 构建（build 层级）

根目录 `index.css`（`@presets "standard"; @source "./src/**/*.js"; @teacss;`），`src/main.js` 带 `// @teacss-include` 并导入 `virtual:teacss.css`，`pluginTeacss()`，`TEACSS_ENGINE=<engine> TEACSS_ENGINE_STRICT=1 TEACSS_ENGINE_STATS=1 vite build`：

| engine | stats | CSS |
| --- | --- | --- |
| `ts` | `rust=0 ts=1` | 5 858 字节 |
| `rust` | `rust=2 ts=0` | 5 858 字节，`cmp` 逐字节相同 |

入口放在 `src/entry.css` 时两边都只产出 2 字节：teacss 只发现根目录 `index.css`。插件配置 `TeacssVitePluginConfig` 继承 `UserConfig`，所以 `pluginTeacss({ engine })` 也可用；显式 `"ts"` 优先于环境变量。

## Tailwind v4 进程内

`compile('@import "tailwindcss" source(none); @source "./*.js";', { base })`，`new Scanner({ sources: compiler.sources }).scan()`，`compiler.build(candidates)`：compile 21 ms、scan 2 ms、build 4 ms（单次，仅作可行性）。`sharedObjects` 出现 `tailwindcss-oxide.darwin-arm64.node` 与 `lightningcss.darwin-arm64.node`。Scanner 会把 `class`、`hi`、`innerHTML` 这类词也当候选，所以 engine 层级直接传候选字符串、不扫描文件，扫描留给 build 层级。

## 配对表验证（同日）

`pairSpace()` 的全部用例（配对表版本 1，963 个基础形式 × 31 种条件组合 = 29 853 个用例）分别送入 `@teacss/core@0.8.5` 加 `preset-standard` 的 `generate` 和 `@tailwindcss/node@4.3.3` 的 `__unstable__loadDesignSystem(...).candidatesToCss`：

| 工具 | 匹配 | 未匹配 |
| --- | --- | --- |
| teacss（TS 引擎） | 29 853 / 29 853 | 0 |
| Tailwind v4 | 29 853 / 29 853 | 0 |

第一版表只有 11 439 个用例，不够 20 000 的格子；把色族扩到两边交集的 16 族（red、orange、amber、yellow、lime、green、teal、cyan、sky、blue、indigo、violet、purple、pink、slate、gray）× 5 档（100、300、500、700、900），间距属性扩到 12 个后达到现在的规模。`dark` 没有进表：Tailwind v4 默认用 `prefers-color-scheme` 媒体查询，teacss 的 `@dark` 读 `<html>`，条件结构不同，结构等价会误报。

## 临时目录里的 Vite 构建（同日，第 4 片）

被测进程在临时目录里跑 `vite build`（JS API，`configFile: false`，插件内联）时发现四件事，都已进入各 `subject-*` 包：

| 现象 | 处理 |
| --- | --- |
| `pluginTeacss({ engine })` 传入配置对象后不再发现根目录 `index.css`，输出只有 2 字节 | 用第二个参数 `pluginTeacss(undefined, { engine })`，入口照常发现，引擎按 defaults 选择（`TEACSS_ENGINE` 环境变量仍优先于它） |
| `@presets "standard"` 从项目根解析 `@teacss/preset-standard`，临时目录没有 `node_modules` | 在工作区 `node_modules/@teacss/preset-standard` 放一个指向被测包依赖的软链 |
| Tailwind 的 `@import "tailwindcss"` 同样从 CSS 文件所在目录向上解析 | 同样的软链 `node_modules/tailwindcss` |
| lightningcss 把 `@media (width < 48rem)` 改写为 `@media not all and (width>=48rem)` | 结构检查把 `not` 前缀当作取反 |

Vite 8 自带 rolldown，所以每个被测进程都会加载 `rolldown-binding.<platform>.node` 与 macOS 上的 `fsevents.node`；原生模块期望只对 `teacss-engine` 与 `tailwindcss-oxide` 作要求或禁止。teacss 开 `mergeSelectors` 时一条规则带多个选择器，结构检查按单个选择器判断条件，否则相邻选择器的伪类会串进来。

`bench verify --utilities 300 --files 3` 在四个被测对象上通过：ts 与 rs 的 engine 与 build 输出哈希相同；300 个用例在 teacss 与 Tailwind 两边的属性与条件结构都对上。
