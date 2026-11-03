# ADR-0004: 用 Bun 管理依赖，Node 运行被测进程
Status: accepted；Node 版本被 ADR-0005 改为 26

## Context
所有者的项目（teacss-ts 等）用 Bun 做包管理与脚本入口，2026-10-21 要求本仓库同样不用 pnpm。ADR-0003 里「用 pnpm 安装」那一句因此作废。被测的是 Vite 构建，Vite 用户默认在 Node 上运行它；换成 Bun 运行时会改变要测的数字。

## Decision
Bun 1.4.3 安装依赖（`bunfig.toml`：isolated linker、exact 版本），`bun.lock` 钉死版本，`bun run <script>` 是脚本入口。编排进程与每个被测进程仍由 Node 24（`.node-version`）运行。环境记录写入 Bun 版本与 `bun.lock` 的哈希。

## Consequences
复现命令是 `bun install --frozen-lockfile && bun run bench`。isolated linker 让每个 `subject-*` 包有自己的 `node_modules`，被测对象从那里读版本，与提升式布局无关。发布的 `@teacss/core@0.8.5` 与 `@teacss/engine@0.8.5-alpha.3` 的 peer 冲突在 Bun 下同样只是不阻断的安装（见 [engine-probe 记录](../knowledge/engine-probe-2026-10-21.md)）。

## Alternatives considered
- 继续用 pnpm：与所有者其他仓库不一致，所有者明确不需要。
- Bun 同时作运行时：测到的是 Bun 上的 Vite，不是用户默认的 Node 上的 Vite；可作为以后单独的被测维度。
