# 执行计划：跨构建工具的对比（v03）

对应提案 [v03](../proposals/v03-build-tools.md)，规格 [v03.1](../specs/v03.1-build-tools.md)。每片一个 PR，`bun run check` 通过才合入。实现在 v01 和 v02 的结构里加，不改已有组的测法。

## 第 0 片：前置实验

完成于 2026-10-22，一次性脚本在 scratch 目录，没有进仓库。5 000 × 30 的语料，四个新插件各一次生产构建：

| 工具 | 基线 | TeaCSS（ts / rs） | Tailwind | 等价校验 |
| --- | --- | --- | --- | --- |
| Rsbuild 2.2.14 | 53 ms | 850 / 897 ms，394 KB，哈希相同 | 863 ms，723 KB | 三者全部通过 |
| Bun 1.4.3 | 2 ms | 207 / 96 ms，383 KB，哈希相同 | 123 ms，842 KB | TeaCSS 通过；Tailwind 76 个用例不符 |

Tailwind 在 Bun 下的 76 个不符全是逻辑简写被展开：`padding-inline` 变成 `padding-inline-start` 加 `-end`，`margin-inline` 同理，关掉 `minify` 也一样，是 Bun 的 CSS 打包器在打印时做的。语义相同，结构校验按属性名比对所以报不符。结论：四个插件都能进基准，Bun 组不用退化；结构校验要认逻辑简写的两个长写（规格 §Equivalence）。另外查明 `@rsbuild/plugin-tailwindcss` 建在 `@tailwindcss/webpack` 上，不走 PostCSS，提案里的说法已更正。

## 第 1 片：结构校验认逻辑简写的长写

完成于 2026-10-22。

- [x] `features/verify`：期望属性是 `padding-inline`、`margin-inline`、`inset-inline`、`padding-block`、`margin-block`、`inset-block` 之一时，两个 `-start`、`-end` 长写同时出现也算匹配；`CheckResult.longhandMatches` 计数，`bench verify` 逐个被测打印，`bench run` 把总数记进 `verification.longhandCases`（为 0 时不写），报告的校验句在有计数时加一句。
- [x] 测试：简写匹配不计数、长写匹配计数、只有一个长写不匹配；报告在无计数时不出现这句，有计数时出现。
- 验收：`bench verify` 在 5 000 × 30 对现有十个被测对象通过，计数为 0；三份已发布报告逐字节重新生成不变；前置实验里 Bun 的 Tailwind 产物从 76 个不符变为 0 个不符、76 个经长写匹配。

## 第 2 片：Rsbuild 组

完成于 2026-10-22。

- [x] `subject-teacss` 的 `src/rsbuild.ts`（导出 `./ts-rsbuild`、`./rs-rsbuild`）只导入 `@rsbuild/core` 与 `@teacss/rsbuild`，不加载 Vite；构建按规格 §Tiers 调 `createRsbuild().build()`，入口 `index.css` 由 `src/index.js` 导入，引擎由注册表的 `TEACSS_ENGINE` 选。
- [x] `subject-tailwind-v4` 的 `src/rsbuild.ts`（导出 `./rsbuild`），依赖 `@rsbuild/plugin-tailwindcss`。
- [x] 新包 `subject-rsbuild-baseline`，与 `subject-vite-baseline` 同构。
- [x] 注册表：组 `rsbuild`，层级只有 `build`，每个对象要求加载 `rspack` 绑定；`DEFAULT_GROUPS` 不变。
- [x] 报告：`groupOf` 认 `-rsbuild` 后缀，每组用自己的基线算增量（`baselineOf`），基线一律不参与排名；校验、产出量与交叉对比都排除任意 `-baseline`。
- 验收：`bench verify --group rsbuild` 在 5 000 × 30 与 20 000 × 300 通过，ts 与 rs 逐字节相同（1 088 883 字节）；Rust 对象加载了 `teacss-engine` 与 `rspack`；三份已发布报告逐字节重新生成不变；`--samples 3` 冒烟运行写出记录，报告出了 `(rsbuild)` 组表并以 `rsbuild-baseline` 算增量。

## 第 3 片：Bun 运行时与 Bun 组

完成于 2026-10-22。

- [x] 原型：Bun 1.4.3 里 `process.report` 存在但不列 `.node`；包一层 `process.dlopen` 能记到 Rust 引擎、Oxide，TS 引擎一个也没有，无需替代。两个运行时的 `maxRSS` 都以 KB 计；Bun 的 CPU 剖析能被现有汇总读出。写进规格 v03.1 修订 2。
- [x] 注册表与进程：`SubjectRegistration.runtime`（`node` 或 `bun`），`runProcess` 的 `executable`，Bun 被测由 PATH 上的 `bun` 运行；`bench run` 在选中 Bun 被测且 `bun --version` 不等于 `packageManager` 时拒绝（`--allow-bun-mismatch` 放行）；被测入口在 Bun 下不注册模块钩子，并改为命名空间导入，因为 Bun 对 `registerHooks` 的具名导入直接报错。
- [x] 被测包：`subject-teacss` 的 `src/bun.ts`（`./ts-bun`、`./rs-bun`），`subject-tailwind-v4` 的 `src/bun.ts`（`./bun`），新包 `subject-bun-baseline`；构建按规格 §Tiers 调 `Bun.build`，`minify: true`。
- [x] 原生模块：`trackNativeLoads()` 在被测进程开头安装，Node 下什么也不做。
- [x] 强等价按组配对：每个 `teacss-ts…` 与同组的 `teacss-rs…` 比对，现有的 default-config 与 postcss 组也因此多了这项检查。
- 验收：`bench verify --group bun` 在 5 000 × 30 与 20 000 × 300 通过，ts 与 rs 逐字节相同，Tailwind 分别有 76 与 339 个用例经逻辑长写匹配；现有三组在 5 000 × 30 仍通过；三份已发布报告逐字节重新生成不变；`--group rsbuild,bun --samples 3` 的冒烟运行（含剖析）写出记录，报告出了 `(rsbuild)` 与 `(bun)` 组表。

## 第 4 片：报告

- [ ] 记录加 `v03Revision`、被测对象的运行时与组；跨修订拒绝比较沿用。
- [ ] 「Build tools」表（`features/report`）：最大格上每组一行，基线中位数、各 CSS 工具的中位数与相对基线的增量；标题注明基线列比的是打包器和运行时。
- [ ] README 每个工具一条要点；`bun` 组的表标题注明运行时。
- [ ] 审核模板补一节：各组相对基线的增量。
- 验收：含五个组的冒烟记录渲染正常；前两份正式报告逐字节重新生成不变；单测覆盖表的排序、缺组、旧记录不出表。

## 第 5 片：正式运行

- [ ] 规格 v03.1 转为 accepted，记录修订。
- [ ] 安静机器上 `bench run --group main,default-config,postcss,rsbuild,bun`，第三份报告、审核、README。
- 依赖：teacss-ts 的 Rsbuild 与 Bun 插件版本固定在锁文件里；Bun 版本固定在 `packageManager`。
