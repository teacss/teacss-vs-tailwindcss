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

- [ ] 被测包：`SubjectClient.dev(workspace, update)`，起 `createServer`，首次取样式表，之后按请求写入新模块并轮询；`vite-baseline` 无此层级。
- [ ] 合同：`dev` 任务（K、轮数）与结果（每轮毫秒、轮询次数）；超时 30 s 作废。
- [ ] 测量：每格一个服务器进程，30 轮；记录在 `samples` 里以 `tier: "dev"` 出现。
- [ ] 报告与 README：「改一个文件后样式表更新」一表。
- 验收：三个对象在 1000 × 30 与 20000 × 300 上各 30 轮通过；报告写明轮询误差上限 5 ms。

## 第 3 片（P2）：资源指标与两张表

- [ ] 引擎层样本加 CPU、RSS、堆占用、规则数、声明数；剖析加 GC 占比。
- [ ] 「Rust 的价值」表：从记录派生，`teacss-rs` 对 `teacss-ts` 逐行比值。
- [ ] 「Rust 的价格」表：安装体积与 `.node` 大小从已安装的包读；`bun install` 冷缓存计时各 5 次；绑定加载时间从冷启动场景拆出；`selectEngineRequest` 跑 teacss-ts 的 8 个示例配置，列回退原因。
- 验收：合成记录能渲染两张表；单测证明 CPU 与堆字段逐次变化。

## 第 4 片（P3）：产出量

- [ ] verify 已有的 css-tree 解析复用，数规则与声明；报告加「产出了什么」表与每 100 KB 耗时，注明不是排名。
- 验收：第一份报告的记录重新渲染后能看到该表（字节已有，规则与声明从输出重新解析，所以需要 `includeCss` 的一次校验运行提供）。

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
