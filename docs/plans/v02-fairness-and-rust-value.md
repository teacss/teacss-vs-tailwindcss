# 执行计划：公平性与 Rust 价值（v02）

对应提案 [v02](../proposals/v02-fairness-and-rust-value.md)，规格 [v02.1](../specs/v02.1-fairness-and-rust-value.md)。按提案的优先级排，每片一个 PR，`bun run check` 通过才合入。实现在 v01 的结构里加，不改已有层级的测法。

## 第 0 片：方向确认

- [x] 所有者 2026-10-22 以 `/build` 要求实施；提案与规格转为 accepted，待决事项按提案 Status 的默认执行。
- [x] 结构整理：`corpus` 与 CSS 辅助代码从 features 移到 `packages/benchmark/src/` 的共享位置，Biome 新增「功能不导入功能」规则。

## 第 1 片（P1）：增量语料与 `engine/incremental`

完成于 2026-10-22。

- [x] `corpus`：`extraCases(corpus, k, rounds)`，从配对空间里语料之外的用例按种子抽 K × 轮数个，组间不重复；测试覆盖不重叠、去重和同种子同结果。
- [x] 合同：`EngineScenario` 增加 `incremental-10`、`incremental-100`，engine 任务增加 `extra`（每次计时调用一组）；`SubjectClient.engineSession()` 在同一进程里保留生成器或编译器，三个被测包各自实现。
- [x] `features/measure/engine-scenario.ts`：三次全量热身后十次计时调用，每次「全量加一组」，缺任一新类整次作废；测量循环按「第几次调用」比对哈希。
- [x] 报告加两个系列，README 摘要加「往运行中的构建里加类」一表。
- 验收：单测覆盖会话复用、缺类作废、组大小不符被拒、各进程拿到相同的组；20000 × 300 冒烟运行三个引擎各产出 10 + 10 个增量样本，全部通过完整性检查。

## 第 2 片（P1）：dev 层级

完成于 2026-10-22。

- [x] 被测包：`SubjectClient.devServer(workspace)` 用各自的 Vite 插件起服务器（随机端口），`moduleHeader` 给出工具读类名需要的模块头；基线无此层级。
- [x] 协议（`features/measure/dev-scenario.ts`，工具无关）：像浏览器打开页面一样请求入口与全部模块；从转换后的入口里找出样式表导入；连 Vite 的 HMR socket，把样式表模块里的 `import.meta.hot.send` 事件照样发出；每轮写一个新模块、在入口追加导入、请求两者，再每 5 ms 轮询样式表模块的 JS 形式（`const __vite__css`），直到全部新类出现；首份样式表也要等齐全部语料类；30 s 超时作废。
- [x] 合同、记录与报告：`dev` 任务（size 10 或 100，每轮一组新类）、`dev` 样本带轮询次数；报告系列 `dev/+10`、`dev/+100`；README 加「在开发服务器里保存新文件」一表。
- 探针得出的两点（写进协议）：TeaCSS 在浏览器连上之前不会通过 HMR 刷新样式表，靠的是样式表模块发的 `teacss:css-ready`，所以协议重放模块里的 HMR 事件；`?direct` 在 Vite 里是另一个模块，不随原模块失效，所以轮询 JS 形式。大格上 keep-alive 连接被服务器关闭导致 `ECONNRESET`，每次请求改用新连接，对两边相同。
- 验收：单测覆盖请求顺序、事件重放、慢样式表、超时作废、首份不全；三个工具在 1000 × 30、1000 × 300、20000 × 30、20000 × 300 上各 3 轮连跑两遍全部通过。

## 第 3 片（P2）：资源指标与两张表

完成于 2026-10-22。

- [x] 引擎层每个样本记 CPU（user + system）、调用后的 RSS 与堆；每个进程在计时区外统计一次输出的规则数与声明数（引擎与构建都有）；剖析加 GC 占比。旧记录没有这些字段，类型里标为可选。
- [x] 「Rust 的价值」表（`features/report/rust.ts`）：最大格上 teacss-rs 对 teacss-ts，热态、+10、+100、dev +10、构建、CPU、堆、峰值 RSS、GC 占比、离散度，以及逐字节一致的组数；完整报告与 README（精简五行）都有，只在记录含 v02 数据时出现，已发布的第一份报告重新生成不变。
- [x] 「Rust 的价格」表（新功能 `features/price`，`bench price` 单独可跑，`bench run` 默认附带）：原生文件大小与平台包数、全新进程里加载 `.node` 的时间（5 次）、空缓存安装时间与安装占用、Rust 引擎能服务的 TeaCSS 入口配置（引擎外观层的 `translateConfig` 判定）。
- 实现中改正的两处（规格 v02.1 修订 2）：`@teacss/vite` 自 0.9.0-alpha.1 起直接依赖引擎，「装与不装引擎」不存在了，安装一行改为两套工具包对比；按导入工具包来计时，Tailwind 的绑定在被测模块加载时已经载入，量到 0.3 ms 对 2.7 ms 的假差距，改为在没有导入任何工具代码的新进程里直接加载 `.node` 并前后核对，两边都约 1.1 ms。
- 验收：83 个测试通过；端到端冒烟（四个对象、全部层级、价格含 1 次安装、最小格）两张表在真实数据下正常渲染。

## 第 4 片（P3）：产出量

完成于 2026-10-22。

- [x] 规则数与声明数已在第 3 片随构建样本记录；`features/report/work.ts` 取最大格的构建，按输出大小排列字节、gzip、规则、声明与「每 100 KB 构建耗时」，完整报告注明最后一列是背景不是排名。
- [x] README 加一条：同样的类，哪个工具产出的 CSS 多多少、规则数各多少；两种 TeaCSS 引擎输出相同，统称 TeaCSS。
- 验收：单测覆盖排序、排除基线、旧记录不出表、README 要点；用冒烟记录看到真实数据（Tailwind 149 KB / 1 566 条规则，TeaCSS 101 KB / 928 条）。

## 第 5 片（P4）：社区语料

- [ ] 所有者给出仓库清单；`bench corpus --community <清单文件>` 用 Oxide Scanner 提取、去重、按配对表翻译，打印覆盖率与未翻译前缀 Top 10。
- [ ] 翻译往返测试；记录里写仓库与提交哈希。
- [ ] 报告并列两份语料。
- 验收：至少三个仓库，覆盖率打印，正式运行同时含两份语料。

## 第 6 片（P5）：CI 交叉验证

- [ ] 跑一次 `bench` 工作流，下载 artifact，`bench report --cross <ci-record>` 把 CI 结果附进报告的「第二台机器」节，写明排名一致与不一致之处。
- 验收：附上的 CI 记录与本机记录规格修订号与语料哈希相同。

## 第 7 片（P6）：两套配置与 PostCSS

- [ ] 注册表为每个对象加 `configuration: "default" | "production"`，被测包按配置写入口；记录里每个样本带配置名。
- [ ] 三个 `*-postcss` 对象作为单独一轮。
- 验收：报告两套配置并列；PostCSS 一轮单独出表。

## 第 8 片：第二份正式报告

- [ ] 下一个 TeaCSS 版本发布后，按 v01.1 修订 3 加 v02.1 在安静机器上跑全部层级与两份语料，`bench report --readme`，审核，发布。
- [ ] README 的 In short 增加「Rust 值多少」「对 Tailwind 公平在哪」各一条。
