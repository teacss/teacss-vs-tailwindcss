# 执行计划：可信性能对比（v01）

对应提案：[v01](../proposals/v01-credible-benchmark.md)。规格：`docs/specs/v01-benchmark-protocol.md`（第 0 片产出）。

每片独立可验收；下一片只在上一片的验收通过并合入 `master` 后开始。每片一个 PR。

## 第 0 片：方向确认、规格与决策记录

- [ ] 用户确认提案的四个待决事项；提案改为 accepted。
- [ ] 写 `docs/specs/v01-benchmark-protocol.md`：三个层级的精确定义（计时起止点、什么算一次样本、热身次数）、规模矩阵、轮替规则、作废规则、统计方法、报告模板、环境记录字段、负载阈值。这份规格就是预注册文档。
- [ ] 写 `docs/knowledge/adr-0001-retire-forked-harness.md`：删除 `bench/`，记录保留的思路与上游致谢；`docs/knowledge/adr-0002-paired-corpus-equivalence.md`：强等价与结构等价的定义与理由。
- 验收：规格被用户接受并合入；之后对规格的任何改动都必须在报告里标注。

## 第 1 片：仓库骨架与检查

完成于 2026-10-21，分支 `bench-skeleton`，五个提交。干净 clone 下 `pnpm install --frozen-lockfile && pnpm check` 通过。

- [x] 删除 `bench/`、`turbo.json`、`vitest.*`、`tsconfig.build.json`、`tsconfig.dts.json`、`.github/FUNDING.yml`、`SECURITY.md`（模板占位文本）；根 `package.json` 只剩 Biome、TypeScript 6.0.3 与 `@types/node`。
- [x] `pnpm-workspace.yaml`：`apps/*`、`packages/*`；`.node-version` 24.14.1；根 `tsconfig.base.json` 持有唯一的 strict 集合，每个包只 `extends`。Node 24 直接运行 `.ts`，没有构建步骤。
- [x] Biome：`@biomejs/biome` + `@devjskit/biome-config`，脚本 `lint`、`lint:check`。`biome.json` 的 override 禁止 `packages/benchmark/src/features/**` 导入 `@bench/subject-*` 与 `appshell`。
- [x] `scripts/check-layout.ts`：顶层只允许 `apps/`、`packages/`、`docs/`、`results/`、`scripts/` 与根清单；禁止 `core`、`common`、`shared`、`utils`、`domain`；包名必须是 `@bench/<目录名>`；壳的 `src` 只允许 `main.ts`、`subject.ts` 与测试；包的 `tsconfig` 只能 `extends` 基线。
- [x] `scripts/check-dependencies.ts`：层级表在 `scripts/workspace.ts`。壳只依赖恰好一个产品；产品依赖基础层与隔离层（组合根在产品里挑实现，特性目录由 Biome override 挡住）；隔离层只依赖基础层；基础层不依赖任何工作区包；工作区依赖必须用 `workspace:` 协议。
- [x] 每条规则一个 `node:test` 用例：植入违规后脚本返回该路径。
- [x] `.github/workflows/check.yml`：`pnpm install --frozen-lockfile && pnpm check`。
- [x] `README.md`（英文，面向外部读者）、`AGENTS.md`、`CLAUDE.md`、`LICENSE` 改为 Billgo，致谢上游一句。
- 验收：通过。布局检查在真实仓库第一次运行就抓到了 `git rm` 后残留的未跟踪 `bench/` 目录。

## 第 2 片：基础层、合同与壳

数据形状先定：

```ts
// packages/infrastructure/src/subject-client/index.ts
interface SubjectClient {
  readonly id: SubjectId;                         // "teacss-ts" | "teacss-rs" | "tailwind-v4" | "vite-baseline"
  describe(): Promise<SubjectVersions>;           // 包名→精确版本，napi 二进制路径
  prepare(workspace: Workspace, corpus: Corpus): Promise<void>; // 写入 fixture
  runEngine(input: EngineInput): Promise<EngineOutput>;       // tier engine
  runBuild(workspace: Workspace): Promise<BuildOutput>;       // tier build
  loadedNativeModules(): readonly string[];        // 结束时上报
}
// packages/benchmark/src/contract/index.ts
interface SubjectRequest { version: 1; sentAt: number; subject: SubjectId; tier: Tier; scenario: ScenarioId; corpusHash: string }
interface SubjectResponse { version: 1; sentAt: number; sample: Sample } | { version: 1; sentAt: number; error: SubjectError }
```

- [ ] `packages/infrastructure`：`config`（解析 CLI 与环境到类型化对象，其余代码不读 `process.env`）、`logging`、`clock`（`process.hrtime.bigint`）、`processes`（spawn 子进程、收集 `resourceUsage`、超时）、`workspace`（临时目录、写 fixture 文件）、`subject-client` 接口、`test-support`（假被测对象：可配置耗时、可植入错误、可植入「加载了 .node」）。
- [ ] `packages/benchmark/contract`：上面两种消息，带 `version` 字段；`persistence`：`results/<date>-<host>.json` 的读写与 schema 校验。
- [ ] `packages/benchmark/appshell`：组装 `SubjectClient` 实现表（唯一允许 import `subject-*` 的地方）、路由四个子命令。
- [ ] `apps/bench/src/main.ts`：读环境、构造 appshell、处理信号；`apps/bench/src/subject.ts`：从 stdin 读一条 `SubjectRequest`，只装载一个对象，写回一条 `SubjectResponse`。
- 验收：用假对象跑 `bench run --subject fake --runs 3` 得到一条合法的结果记录；植入错误时命令非零退出且记录不落盘；`bench --help` 列出四个子命令。
- 验证命令：`node apps/bench/src/main.ts --help`；`node --test packages/`。

## 第 3 片：成对语料

- [ ] `packages/benchmark/features/corpus`：带种子的 PRNG（如 mulberry32，自实现，无依赖）；配对表 `pairs.ts`（版本号、每个属性族的 teacss 与 tailwind 模板、属性名、允许的条件）；生成器按 `(seed, utilities, files)` 产出 `Corpus { hash, cases, files }`；输出两套源文件（TeaCSS 侧带 `// @teacss-include`，Tailwind 侧由 `@source` 覆盖）。
- [ ] 配对表的每个 teacss 名称对照 teacss skill 的属性参考核对；每个 tailwind 类对照 Tailwind v4 文档核对。
- [ ] 测试：同一参数两次生成哈希相同；不同种子不同；规模矩阵每格都能生成；`properties` 与 `conditions` 非空。
- 验收：`bench corpus --utilities 5000 --files 30` 两次运行哈希一致；语料统计（属性族分布、条件分布）打印并写入 `docs/knowledge/corpus-profile.md`。
- 验证命令：`node apps/bench/src/main.ts corpus --utilities 5000 --files 30 --print-hash`。

## 第 4 片：四个被测对象与等价校验

- [ ] 先回答提案待决事项 4：在干净目录安装 `@teacss/vite@0.8.5` 与 `@teacss/engine@0.8.5-alpha.3`，`engine: "rust"`、`TEACSS_ENGINE_STRICT=1`、`TEACSS_ENGINE_STATS=1` 跑一次最小构建，确认 Rust 路径运行且无回退。能则全部用发布包；不能则加 `--local` 模式（link `../teacss-ts` 与 `../teacss-rs/packages/engine`），并把这个事实写进报告。
- [ ] `packages/subject-vite-baseline`、`subject-teacss-ts`、`subject-teacss-rs`、`subject-tailwind-v4`：各实现 `SubjectClient`；engine 层分别调用 `createGenerator().generate()`（ts/rust 由 `engine` 选项决定）与 `@tailwindcss/node` `compile` + `@tailwindcss/oxide` `Scanner`；build 层各用官方 vite 插件与文档推荐配置；`loadedNativeModules()` 从 `process.moduleLoadList` 与 `require.cache` 中筛 `.node`。
- [ ] `packages/benchmark/features/verify`：（a）teacss-ts 与 teacss-rs 输出逐字节比较；（b）每个对象输出中每个用例的类都出现（选择器转义后查找）；（c）用 lightningcss 解析 TeaCSS 与 Tailwind 的输出，按用例比较属性名集合与条件结构；（d）被测进程上报的原生模块与期望表比较。
- [ ] 每个对象一个进程冒烟测试：`bench run --subject X --runs 1 --tier engine` 与 `--tier build` 成功，且 verify 全部通过。
- 验收：`bench verify --utilities 5000 --files 30` 四项全部通过；故意在配对表加入一个 Tailwind 不支持的类时，(b) 失败并指出该用例。
- 验证命令：`node apps/bench/src/main.ts verify --utilities 5000 --files 30`。
- 风险：Rust 引擎对某些配置回退（如 `mergeSelectors:false`）。处理方式是改语料或配置到两边都原生支持的子集，绝不把 TS 的数字记成 Rust 的。

## 第 5 片：测量

- [ ] `packages/benchmark/features/measure`：规模矩阵 × 层级 × 对象的运行表；每个样本一个新进程；一轮内对象顺序随机，轮间轮替；热身次数按规格；收集墙钟、CPU 用户/系统时间、最大 RSS、输出字节与 gzip 字节、输出哈希；任何错误或回退令本次运行作废并退出。
- [ ] `packages/benchmark/features/environment`：CPU 型号、核数、内存、OS、Node、pnpm、lockfile 哈希、各对象 `describe()` 的版本、运行前后的 1 分钟负载；负载超过阈值拒绝开始。
- [ ] 结果写入 `results/<date>-<host>.json`，含规格版本与语料哈希。
- 验收：`bench run --runs 30` 在本机完成全矩阵（4 对象 × 2 层级 × 9 规模格 × 30 样本），每个样本的输出哈希在同对象同规模下一致（确定性）；假对象植入错误时整次运行作废。
- 验证命令：`node apps/bench/src/main.ts run --runs 30 --out results/`。

## 第 6 片：统计与报告

- [ ] `packages/benchmark/features/report`：纯函数统计（中位数、四分位距、p95、最小值、Mann-Whitney 秩和检验、Cliff's delta 效应量）；build 层减去 `vite-baseline` 的增量；相对最快者的倍数；「无可测差异」判定规则按规格。
- [ ] 报告模板（Markdown）：结论一句话、每层级每规模一张表、环境块、版本块、语料哈希与配对表版本、限制因素段落（来自一次不计入统计的 `node --cpu-prof`，列前三个自耗时帧）、benchmark-checklist 七问逐条作答、已知限制（结构等价而非值等价、作者利益关系、CI 噪声）。
- [ ] 同时产出 JSON 摘要供外部工具读取。
- 验收：对同一份 `results/*.json` 两次生成的报告逐字节相同；对两份人工构造的接近样本集，报告输出「无可测差异」；统计函数有针对已知分布的单元测试。
- 验证命令：`node apps/bench/src/main.ts report results/<file>.json --out docs/reports/`。

## 第 7 片：CI 与第一份报告

- [ ] `.github/workflows/bench.yml`：`workflow_dispatch` 与每周一次，ubuntu-latest，`pnpm bench`，上传 `results/` 与报告为 artifact；不自动提交，由人工审阅后合入。
- [ ] 本机（M2 Max，负载低于阈值，关闭其他程序）跑一次全矩阵；CI 跑一次作为第二台机器的交叉验证。
- [ ] 按 benchmark-checklist 逐问审核：限制因素、调优、极限算术（字节/秒对磁盘、CSS 行数对核数）、错误计数、可复现性、相关性（engine 占 build 的比例）、工作确实发生（输出哈希与等价校验）。
- [ ] 发布 `docs/reports/<date>.md`，README 每层一个主数字并链接报告与原始数据。
- 验收：报告的每个数字都能从提交的 `results/*.json` 重新生成；README 的复现命令在干净 clone 上一次跑通。

## 第二阶段（另立提案）

dev 增量层级：启动 vite dev，向一个源文件追加 K 个新类，从写盘到 Vite 推送更新后的 CSS 的延迟。需要单独的协议定义与验收。

## 风险与检查点

| 风险 | 处理 |
| --- | --- |
| 发布的 `@teacss/engine` 与 `@teacss/core@0.8.5` 的 peer 范围不吻合 | 第 4 片第一项先实验；不行则 `--local` 并如实标注 |
| Rust 引擎静默回退，Rust 的数字实为 TS | `engine:"rust"` + `TEACSS_ENGINE_STRICT=1` + 原生模块上报 + 输出哈希与 ts 逐字节对比 |
| 配对表偏向某一方的强项 | 配对表随报告公开；属性族分布写入 corpus-profile；邀请外部提出用例 |
| 本机负载污染 | 阈值拒绝开始；运行前后负载写入报告 |
| CI runner 噪声 | CI 结果只作交叉验证，不作主数字；报告标注 |
| vite 版本不一致 | 三方共用 vite 8.3.4，lockfile 锁定，`describe()` 校验 |
| 作者利益冲突 | 方法学先提交、原始数据公开、一条命令复现、「无可测差异」作为合法结论 |
