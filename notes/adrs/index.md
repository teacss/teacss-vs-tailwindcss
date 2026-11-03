# Architecture decision records

| ADR | Status | Summary |
| --- | --- | --- |
| [ADR-0001](ADR-0001-retire-forked-harness.md) | accepted | 删除最初的 `bench/`，不保留旧代码也不沿用其思路。 |
| [ADR-0002](ADR-0002-paired-corpus.md) | accepted | 成对语料；teacss-ts 与 teacss-rs 强等价，TeaCSS 与 Tailwind 结构等价。 |
| [ADR-0003](ADR-0003-published-packages.md) | accepted，包管理器部分被 ADR-0004 取代 | 被测对象只用已发布的 npm 包，接受一条 peer 警告。 |
| [ADR-0004](ADR-0004-bun-package-manager.md) | accepted，Node 版本被 ADR-0005 改为 26 | Bun 管理依赖与脚本，Node 运行编排进程与被测进程。 |
| [ADR-0005](ADR-0005-two-teacss-ecosystems.md) | accepted | TeaCSS 0.10 起按两个生态测量：各用各的包，退役没有对应包的 teacss-ts 对象，强等价按引擎、命令行与插件分别定义，Node 26。 |
