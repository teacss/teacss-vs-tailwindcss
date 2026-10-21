# ADR-0003: 被测对象只用已发布的 npm 包
Status: accepted；包管理器部分被 ADR-0004 取代（改用 Bun）

## Context
报告要让任何人一条命令复现，所以被测对象必须来自公共 registry 并被锁文件钉死。已发布的 `@teacss/core@0.8.5` 声明可选 peer `@teacss/engine >=0.9.0`，而已发布的引擎只有 `0.8.5-alpha.3`；引擎自己的 `engineCompat.core` 是 `>=0.8.5 <0.10.0`，在运行时接受 core 0.8.5。2026-10-21 的探针（见 [knowledge/engine-probe-2026-10-21.md](../knowledge/engine-probe-2026-10-21.md)）：npm 以 ETARGET 拒绝安装这对包；pnpm 安装成功并给出 unmet peer 警告；`TEACSS_ENGINE=rust` 下 Vite 构建加载了 `teacss-engine.darwin-arm64.node`，stats 为 `rust=2 ts=0`，输出与 TS 引擎逐字节相同。

## Decision
被测对象全部使用已发布版本，由 `pnpm-lock.yaml` 钉死；仓库使用 pnpm。接受这一条 peer 警告，并在报告的版本块里写明。链接兄弟仓库的 `--local` 模式只用于开发，报告不采用其结果。

## Consequences
复现者不需要任何本地构建或私有包。teacss 发布 0.9 后只需改锁文件并重跑。用 npm 的复现者会被 ETARGET 拦住，README 说明用 pnpm。

## Alternatives considered
- 链接本地 `teacss-rs/packages/engine`：数字不可复现，且测的是未发布的提交。
- 等 teacss 发 0.9 再开始：阻塞整条线，而现有发布包已能走 Rust 路径。
