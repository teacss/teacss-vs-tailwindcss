# 执行计划：可信性能对比（v01）

对应提案：[v01](../proposals/v01-credible-benchmark.md)。规格：[v01.1](../specs/v01.1-benchmark-protocol.md)。

每片独立可验收；下一片只在上一片的验收通过并合入 `master` 后开始。每片一个 PR。

## 第 0 片：方向确认、规格与决策记录

完成于 2026-10-21（规格仍为 draft，第一次正式运行前必须接受）。

- [x] 用户让工作继续推进；提案 accepted，三个偏好项按默认值记录在提案 Status 里。
- [x] `docs/specs/v01.1-benchmark-protocol.md`（英文，随报告公开）：被测对象与包版本、两个层级的计时起止、语料形状、规模矩阵、运行协议、两级等价、统计规则、环境记录、报告结构、验收表。
- [x] `docs/adrs/ADR-0001`（删除 fork 的 harness）、`ADR-0002`（成对语料与两级等价）、`ADR-0003`（只用已发布包），后加 `ADR-0004`（Bun 管理依赖）。ADR 放在 `docs/adrs/`，不是 `docs/knowledge/`。
- [x] 第 4 项待决事项用探针回答，证据在 `docs/knowledge/engine-probe-2026-10-21.md`。
- [ ] 规格接受：用户确认后把 `status` 改为 accepted。此前第 2 到第 6 片可以推进，第 7 片的正式运行不能。

## 第 1 片：仓库骨架与检查

完成于 2026-10-21，分支 `bench-skeleton`，五个提交。干净 clone 下冻结锁文件安装与全部检查通过（当时用 pnpm，后按 ADR-0004 换成 Bun）。

- [x] 删除 `bench/`、`turbo.json`、`vitest.*`、`tsconfig.build.json`、`tsconfig.dts.json`、`.github/FUNDING.yml`、`SECURITY.md`（模板占位文本）；根 `package.json` 只剩 Biome、TypeScript 6.0.3 与 `@types/node`。
- [x] workspace：`apps/*`、`packages/*`（现在写在根 `package.json` 的 `workspaces`，由 Bun 管理）；`.node-version` 24.14.1；根 `tsconfig.base.json` 持有唯一的 strict 集合，每个包只 `extends`。Node 24 直接运行 `.ts`，没有构建步骤。
- [x] Biome：`@biomejs/biome` + `@devjskit/biome-config`，脚本 `lint`、`lint:check`。`biome.json` 的 override 禁止 `packages/benchmark/src/features/**` 导入 `@bench/subject-*` 与 `appshell`。
- [x] `scripts/check-layout.ts`：顶层只允许 `apps/`、`packages/`、`docs/`、`results/`、`scripts/` 与根清单；禁止 `core`、`common`、`shared`、`utils`、`domain`；包名必须是 `@bench/<目录名>`；壳的 `src` 只允许 `main.ts`、`subject.ts` 与测试；包的 `tsconfig` 只能 `extends` 基线。
- [x] `scripts/check-dependencies.ts`：层级表在 `scripts/workspace.ts`。壳只依赖恰好一个产品；产品依赖基础层与隔离层（组合根在产品里挑实现，特性目录由 Biome override 挡住）；隔离层只依赖基础层；基础层不依赖任何工作区包；工作区依赖必须用 `workspace:` 协议。
- [x] 每条规则一个 `node:test` 用例：植入违规后脚本返回该路径。
- [x] `.github/workflows/check.yml`：`bun install --frozen-lockfile && bun run check`，Node 24 运行。
- [x] `README.md`（英文，面向外部读者）、`AGENTS.md`、`CLAUDE.md`、`LICENSE` 改为 Billgo。
- 验收：通过。布局检查在真实仓库第一次运行就抓到了 `git rm` 后残留的未跟踪 `bench/` 目录。

## 第 2 片：基础层、合同与壳

完成于 2026-10-21，提交 `f559037`。

- [x] `packages/infrastructure`：`config`（argv 解析）、`logging`、`clock`、`processes`（spawn 子进程，喂 stdin，收 stdout/stderr 与墙钟）、`workspace`、`runtime`（`process.report` 里的 `.node` 列表、自身 `resourceUsage`）、`SubjectClient` 接口、`test-support`（假时钟、假被测对象、会抛错的假对象）。
- [x] `packages/benchmark/contract`：`SubjectRequest`（带 `version`、`module` 标识符、任务）与 `SubjectResponse`（带 `nativeModules`、`usage`、结果或错误），两端都经校验函数。
- [x] `packages/benchmark/subjects`：编排侧的 `invokeSubject`，按注册表里的模块标识符起子进程；非零退出、超时、错误结果都抛 `SubjectProcessError` 并附 stderr。
- [x] `appshell`：`createApp`（接收原始 argv/env/cwd，路由 `help`、`subjects`）与 `subjectMain`（子进程：读一条请求、`import()` 唯一一个模块、执行、写一条响应）。
- [x] `apps/bench/src/main.ts` 与 `subject.ts` 只依赖 `@bench/benchmark`。
- [x] `persistence`：`results/<时间>-<主机>.json` 的写入与读取；`features/environment`：CPU、核数、内存、OS、Node、Bun、锁文件哈希、提交。
- 偏离简报的地方：ChildProcess 没有 `resourceUsage()`，CPU 与 RSS 改由子进程用 `process.resourceUsage()` 自报并进入响应；`bench run` 不在本片，等语料与被测对象就位后随第 5 片一起来，避免写一个一次性的占位循环。
- 验收：30 个测试通过，含假对象经真实子进程的 describe、engine、build 往返，以及植入错误时的失败。

## 第 3 片：成对语料

完成于 2026-10-21。

- [x] `features/corpus`：mulberry32 种子随机；配对表 `pairs.ts`（版本 1：12 个间距属性 × 18 个值，3 个颜色属性 × 16 族 × 5 档 × 3 种透明度加 3 个任意色，6 档字号，4 档圆角，8 种 grid 列；8 个条件的单独与两两组合，断点不两两组合）；`generateCorpus(seed, utilities, files)` 从 29 853 个用例里按种子取样并哈希；`corpusProject` 产出 `src/gen-NNN.js` 与 `index.html`，每个 `<div>` 15 个类；`profileCorpus` 统计属性族与条件分布。
- [x] 配对表每一项经真实工具验证：teacss 与 Tailwind 各 29 853 / 29 853 匹配（证据在 `docs/knowledge/engine-probe-2026-10-21.md`）。`dark` 不进表，原因同处记录。
- [x] `bench corpus --utilities --files --seed [--profile]`。
- 验收：同参数两次哈希一致；规模矩阵每格可生成；测试覆盖。

## 第 4 片：四个被测对象与等价校验

完成于 2026-10-21。

- [x] 待决事项 4 的答案见第 0 片；被测对象全部用发布包，`bun.lock` 钉死。
- [x] `packages/subject-vite-baseline`、`subject-tailwind-v4`、`subject-teacss`（一个包、两个入口 `./ts` 与 `./rs`，同一套 teacss 包只换引擎模式）。engine 层：teacss 走 `createGenerator` + `generate`，Tailwind 走 `compile` + `build(candidates)`，都不带 preflight。build 层：Vite JS API 在临时目录构建，入口与软链见 `docs/knowledge/engine-probe-2026-10-21.md`。版本从各包自己的 `node_modules/<name>/package.json` 读。
- [x] 注册表 `subjects/registry.ts`：每个对象的模块（`import.meta.resolve` 得到的文件 URL）、环境（teacss 两个对象都带 `TEACSS_ENGINE_STRICT=1`）、语法、是否有 engine 层、原生模块的必须与禁止前缀。
- [x] `features/verify`：css-tree 解析；强等价按哈希；覆盖与结构检查合一（每个用例的选择器存在、声明的属性集包含期望、条件结构按伪类与宽度媒体查询归类）；物理 longhand 对归一为逻辑属性；`not` 媒体查询取反；原生模块期望。
- [x] `bench verify --utilities --files --seed`：四个对象共 7 次子进程往返，输出每项检查与失败明细，非零退出。
- 验收：300 × 3 与 5000 × 30 都通过（后者 7 次往返共 5 秒；ts 与 rs 的 engine 输出 379 015 字节、build 输出 388 499 字节，哈希相同；Tailwind engine 1 003 742 字节、build 720 684 字节）。配对表里植入不支持的类时结构检查报 `no rule selects it`（单元测试）。
- 偏离：`cpu` 与 RSS 由子进程自报（见第 2 片）；三个被测包各自重复了 `packageVersion` 与 `viteBuild` 两个小函数，因为它们依赖 vite，不能下沉到基础层。

## 第 5 片：测量

完成于 2026-10-21。

- [x] `features/measure/run.ts`：规模格 × 层级 × 对象的作业表；每轮按种子随机打乱对象顺序，轮间轮替直到每格样本数到齐；每个作业一个新子进程（build 一个样本、engine/cold 一个样本、engine/warm 一个进程十个样本）；墙钟由编排进程量 build、由子进程量 engine，CPU 与 RSS 由子进程自报；同对象同格的输出哈希必须一致；任何错误抛 `RunInvalid`，不落盘。
- [x] 负载门：一分钟负载超过核数 20% 拒绝开始，`--allow-busy` 覆盖并记入记录；每格前后的负载份额写入 `cells`。
- [x] 记录新增：`specRevision`、`pairTableVersion`、`seed`、`samplesPerCell`、`allowBusy`、`cells`（语料哈希与负载）。
- [x] `bench run --utilities a,b,c --files a,b,c --samples --tier --subjects --seed --out --allow-busy`。
- 验收：单元测试覆盖轮替、样本计数、错误作废、哈希变化作废；真实四对象 `--utilities 200,400 --files 2 --samples 2 --allow-busy` 产出 88 个样本的记录，14 秒。负载门在 60% 负载的本机确实拒绝。

## 第 6 片：统计与报告

完成于 2026-10-21。

- [x] `features/report/statistics.ts`：中位数、四分位距、p95、最小值；Mann-Whitney U（正态近似、结校正）；Cliff's delta；`compare` 按规格判「differs」或「no measurable difference」（p < 0.01 且中位数差距大于较大的 IQR）。
- [x] `features/report/index.ts`：按层级 × 规模格 × 对象建表，build 层给出相对基线的增量；每格以最低中位数者为基准对其余对象判定；Markdown 含结论段、表格、环境、版本、语料与负载、限制因素、七问作答、已知限制；JSON 摘要。同一记录两次渲染逐字节相同。
- [x] `bench report <results.json> --out docs/reports`。
- 验收：统计函数对已知分布有单元测试；合成记录里分离的两组判 differs、交错的两组判无差异；报告在真实的排练记录上能渲染。

## 第 7 片：CI 与第一份报告

进行中（2026-10-21）。

- [x] `features/profile`：解析 V8 `.cpuprofile`，按函数汇总自耗时；`bench run` 在测量结束后对最大的格每个对象每个层级跑一次不计数的 `--cpu-prof` 子进程（`--no-profile` 跳过），结果写入记录的 `limiters`，报告的 Limiter 段渲染前三帧。
- [x] `.github/workflows/bench.yml`：手动触发（可传规模与样本数）与每周一次，先 `bench:verify`，再 `--allow-busy` 跑矩阵，报告与原始记录作为 artifact 上传，不自动提交。
- [x] 根脚本 `bench`、`bench:verify`、`bench:report`。
- [x] `--subjects` 同时作用于 `run` 与 `verify`，未知名字报错；子集运行的报告在结论前写明「Subset run」与未测对象。根脚本 `bench:ts-tailwind` 跑 vite-baseline、teacss-ts、tailwind-v4。
- [x] 被测 TeaCSS 换成 0.9.0-alpha.1（所有者 2026-10-21 决定）：`@teacss/core`、`@teacss/vite`、`@teacss/preset-standard` 0.9.0-alpha.1，引擎用 `@teacss/vite` 依赖的 `@teacss/engine` 0.8.5-alpha.4。规格升到修订 2。`bench:verify` 在 5000 × 30 与 20000 × 300 上四个对象全部通过，Rust 进程在严格模式下加载 `teacss-engine`，ts 与 rs 输出逐字节相同。第一份报告因此包含全部四个对象，取代下面「只含 ts 与 Tailwind」那一项。
- [x] ~~第一份报告只含 teacss-ts 与 Tailwind v4~~，被上一项取代。本机正式运行需要一分钟负载低于 2.4；当天 teacss-rs 会话持续运行 `cargo check`，负载在 5 到 24 之间。
- [x] 本机正式运行（2026-10-21 17:19–17:43，四个对象全矩阵，2 700 个样本，开跑负载 13%）：`results/2026-10-21T09-19-14-mac.json`。
- [ ] CI 交叉验证运行。
- [x] 报告 `docs/reports/2026-10-21T09-19-14-mac.md` 与手写审核 `.audit.md`（审核单独成文件，报告保持可逐字节重生成）；README Status 给出引擎与构建两层的主数字；规格 v01.1 标为 accepted。
- [x] 本地构建模式（2026-10-21，按所有者要求先写代码、不跑测量、不加新单测）：`scripts/link-local.ts`（`bun run bench:link status|link --ts <dir>|unlink`）把 teacss 被测对象的 core、vite、preset-standard 接到已构建的 teacss-ts 检出，engine 跟随 core 解析；被测对象按真实路径报告版本，`node_modules/.bun` 以外的包进 `local`，报告首行标「Local build, not for publication」。`status` 已在本机跑过；`link`/`unlink` 未实际执行，因为它会改 `packages/subject-teacss/node_modules`，而 teacss-ts 检出正由另一会话修改。
- [ ] teacss-rs 加入：未发布时用本地构建模式先排练（teacss-rs 的 `dev-link.mjs link` 接进 teacss-ts，再 `bench:link link`），只作内部参考；teacss-rs 优化完成并发布新的 `@teacss/engine` 后，更新 `packages/subject-teacss/package.json` 的引擎版本与 `bun.lock`，先跑四对象 `bench:verify`（强等价必须通过），再跑全矩阵，作为第二份报告；规格修订号与 `engineCompat` 变化写进报告。

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
