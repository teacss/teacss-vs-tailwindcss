---
status: accepted
priority: P0
---
# TeaCSS（TS 引擎 / Rust 引擎）与 Tailwind CSS v4 的可信性能对比

## Status

2026-10-21 用户让工作继续推进，提案接受。三个偏好项按默认值执行并等用户改口：报告正文英文；规模上限 20 000 utility；dev 增量层级放第二阶段。第 4 项由探针回答：Bun（最初用 pnpm 验证）下已发布的 `@teacss/core@0.8.5` 加 `@teacss/engine@0.8.5-alpha.3` 能走 Rust 路径且输出与 TS 逐字节相同，npm 拒绝安装这对包（[ADR-0003](../adrs/ADR-0003-published-packages.md)）。

已落地：计划第 1 片（骨架与检查）、第 0 片（[规格 v01.1](../specs/v01.1-benchmark-protocol.md) draft、[ADR-0001 至 0003](../adrs/index.md)）。尚无被测对象与结果。

## Problem

TeaCSS 需要一份对外站得住的性能对比：TeaCSS TypeScript 引擎（`@teacss/core`）、TeaCSS Rust 引擎（`@teacss/engine`，napi-rs）与 Tailwind CSS v4（Oxide，Rust）三者在同一台机器、同一份输入、同一条管线上的开销。报告的读者是 TeaCSS 以外的开发者与 Tailwind 社区，他们默认对「作者测自己工具」持怀疑态度，所以报告必须能被任何人一条命令复现，并且每个数字都能回答它量的是什么、为什么是这个数、误差多大。

当前仓库不满足这个目标：

- `bench/fixtures/teacss-vite` 装的是 `unocss` + `presetWind3`，标签写着 teacss。结果对象错了。
- 语料是 Tailwind 语法（`hover:p-4`），TeaCSS 用 `p:4@hover`，两边没有成对输入，无法证明做了同样的工作。
- 语料用 `Math.random()` 生成，每次不同，跨机器不可复现。
- 没有检查 Rust 引擎是否真的运行（`@teacss/engine` 在 alpha 期间会静默回退到 TS）。
- 根目录是 `@icebreakers/monorepo` 模板（eslint、prettier、commitlint、changesets、turbo），与 Billgo 技术栈（Biome、四层架构）不一致。

## Proposed direction

把仓库重做成一个按 [standard-architecture](../../../teacss-ts/AGENTS.md) Node.js 映射组织的基准测试工具，产物是三份可机器校验的东西：原始样本 JSON、派生报告 Markdown、与报告一同提交的方法学规格。

### 测什么：三个层级，三个被测对象加一个基线

| 层级 | 含义 | 被测对象 |
| --- | --- | --- |
| engine | 进程内：token 集合 → CSS 字符串，不经过打包器。量的是引擎本身 | teacss-ts、teacss-rs、tailwind-v4（`@tailwindcss/node` `compile` + `@tailwindcss/oxide` `Scanner`） |
| build | 端到端：`vite build` 产出生产 CSS。量的是用户等待的时间 | 同上三者，外加 `vite-baseline`（无 CSS 引擎）作为地板，报告减去地板后的增量 |
| dev | 开发服务器增量更新：改一个文件新增 K 个类，到 CSS 更新可见的延迟（第二阶段） | 同 build |

每个层级按规模扫描：utility 数 1k / 5k / 20k，源文件数 3 / 30 / 300。单点数字不发布。

### 成对语料（公信力的核心）

语料是确定性生成的「成对用例」：每个用例同时给出 TeaCSS 写法与 Tailwind 写法，并声明它们应产生的 CSS 属性集合与条件结构。

```ts
interface PairedCase {
  readonly teacss: string;    // "p:4@hover"
  readonly tailwind: string;  // "hover:p-4"
  readonly properties: readonly string[]; // ["padding"]
  readonly conditions: readonly string[]; // ["hover"]
}
```

由带种子的伪随机数生成，语料内容由 `(seed, size, pairTableVersion)` 唯一决定，并以哈希写入每条结果。配对表只收录两边都原生支持的属性族（间距、颜色及透明度、字号、圆角、grid 列、任意值、状态与断点条件）；表本身随报告发布。

等价性分两级，报告如实区分：

- **强等价**：teacss-ts 与 teacss-rs 的输出必须逐字节相同（teacss-rs 的 parity 目标本来就是这个）。
- **结构等价**：TeaCSS 与 Tailwind 对同一用例必须产出相同的属性名集合与相同的条件结构；值允许不同（两边设计系统的调色板、单位不同）。报告明确说明这不是值等价。

任何一边出现未匹配的类、构建错误或 Rust 引擎回退，当次运行作废，不进入统计。

### 测量规则（来自 benchmark-checklist）

- 每个样本在新进程中运行，被测对象轮替（A、B、C、D、A、B…），一轮内顺序随机。
- 每个对象每个场景不少于 30 个样本；报告中位数、四分位距、p95、最小值，并对相近的两方做秩和检验；差距小于运行间波动的记为「无可测差异」。
- 全部对象用各自文档推荐的生产配置与 release 构建；TeaCSS Rust 侧强制 `engine: "rust"` 且 `TEACSS_ENGINE_STRICT=1`，回退即报错；每个被测进程结束时上报它加载了哪些原生模块，ts 对象不得加载 `.node`，rs 与 tailwind 对象必须加载。
- 运行前记录 CPU、核数、内存、OS、Node、Bun、所有被测包的精确版本与 lockfile 哈希、1 分钟负载；1 分钟负载高于核数的 20% 时拒绝开始（可用 `--allow-busy` 覆盖，报告会标注）。
- 每个对象另做一次不计入统计的 `--cpu-prof` 剖析，报告写出限制因素（前三个自耗时帧）。
- 输出体积（原始、gzip）作为次要指标一并记录。

### 仓库形态（standard-architecture 的 Node.js 映射）

```
apps/bench/src/main.ts            壳：编排进程（CLI：corpus / run / verify / report）
apps/bench/src/subject.ts         壳：被测进程，一个进程只装载一个被测对象
packages/benchmark/               产品：features/{corpus,environment,measure,verify,report}、appshell/、contract/、persistence/
packages/infrastructure/          基础：config、logging、clock、processes、workspace、subject-client 接口、test-support 假件
packages/subject-teacss-ts/       隔离：@teacss/vite + @teacss/core，engine "ts"
packages/subject-teacss-rs/       隔离：同上 + @teacss/engine，engine "rust"
packages/subject-tailwind-v4/     隔离：tailwindcss + @tailwindcss/vite + @tailwindcss/node + @tailwindcss/oxide
packages/subject-vite-baseline/   隔离：vite，无 CSS 引擎
results/                          原始样本 JSON，随报告提交
docs/{proposals,specs,plans,reports,knowledge}/
scripts/check-layout.mjs, scripts/check-dependencies.mjs
```

被测对象实现 `SubjectClient` 接口（基础层）；只有 `appshell` 选择实现；`measure` 特性只见接口。原生运行时各自由一个被测进程独占，编排进程从不加载它们。

### 工具链

Node 24（`.node-version`）运行，Bun workspace 管理依赖（isolated linker，精确锁定，见 ADR-0004），TypeScript 直接由 Node 运行（无需 tsx），Biome（`@biomejs/biome` + `@devjskit/biome-config`），`node:test`。移除 eslint、prettier、commitlint、changesets、turbo、husky、`@icebreakers/monorepo`。被测版本精确钉死：vite 8.3.4（三方共用，Tailwind 的 vite 插件支持 ^8，`@teacss/vite` 要求 >=8），tailwindcss 系列 4.3.3，`@teacss/*` 0.8.5，`@teacss/engine` 0.8.5-alpha.3。

## Scope

包含：上面四个目录层的全部代码与检查脚本；成对语料与配对表；engine 与 build 两个层级；统计与报告生成；GitHub Actions 的 `check`（每次 PR）与 `bench`（手动与每周，上传结果为 artifact）；第一份报告（本机 M2 Max 为主，ubuntu runner 为交叉验证）。

排除：dev 增量层级（独立的第二阶段提案）；报告网站（先以 Markdown 与 JSON 发布，站点另提）；Tailwind v3、UnoCSS 或其他框架；teacss-zig（尚未到可测阶段）。

## Rationale

- **成对语料而不是共用一份 Tailwind 语料**：现有做法让 TeaCSS 处理它不认识的类，相当于测「跳过」。只有配对输入加等价校验才能回答「做了同样的工作吗」。
- **进程隔离而不是同进程轮流**：三个原生模块（napi 引擎、Oxide、lightningcss）在同一进程里会互相污染热身状态与内存；一个进程一个对象也让「加载了哪个引擎」可以直接证明。
- **删除而不是保留 `bench/`**：它的 teacss 标签是错的，保留会误导读者；本项目的测法与它不同，不沿用其思路（ADR-0001）。
- **方法学先于数字**：规格（`docs/specs/`）在第一次正式运行前被接受并提交，等于预注册；之后只允许在报告里标注偏离，不允许改规格迎合结果。
- **使用已发布的 npm 包**：任何人 `git clone && bun install && bun run bench` 得到同一套依赖。本地 link 兄弟仓库仅作开发便利（`--local`），报告不采用 link 结果。
- **利益冲突的处理**：作者测自己的工具。缓解方式是公开配对表、原始样本、一条命令复现、Tailwind 按其官方文档配置、报告写出限制因素与「无可测差异」的结论，并在 README 邀请外部复现与指正。

## Open questions

2026-10-21 起按以下默认执行；用户可在第一次正式运行前改口：

1. 报告语言：面向 Tailwind 社区建议英文正文，仓库内提案与计划保持中文。
2. 规模上限：20k utility / 300 文件是否足够，或需要加 50k。
3. dev 增量层级是否纳入第一阶段。它最贴近用户感受，但测量协议（HMR 事件计时）比另外两层复杂一个量级，建议第二阶段。
4. 发布的 `@teacss/core@0.8.5` 声明 peer `@teacss/engine >=0.9.0`，而已发布引擎只有 `0.8.5-alpha.3`（其 `engineCompat.core` 接受 0.8.5）。能否用已发布包组合出 Rust 路径是一个实验问题，在计划的第 4 片里用一次安装与一次运行回答；若不能，第一份报告用 `--local` 并如实标注，同时推动 teacss 发 0.9 alpha。
