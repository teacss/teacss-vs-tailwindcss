# Articles

| Article | Summary |
| --- | --- |
| [teacss-0.9.0-ts-vs-rust](teacss-0.9.0-ts-vs-rust.md) | TeaCSS 0.9.0 的 TypeScript 引擎与 Rust 引擎：产物逐字节相同，Rust 生成快 3 到 9 倍、CPU 少 3.3 倍、内存少 42%；开发服务器快 2.6 倍、Vite 构建快 2.2 倍；代价是 8.4 MB 原生文件。 |
| [teacss-0.9.0-vs-tailwind-v4](teacss-0.9.0-vs-tailwind-v4.md) | TeaCSS 0.9.0（Rust 引擎）与 Tailwind CSS v4.3：117 组比较里 TeaCSS 赢 102 组，Tailwind 赢 10 组（都是 1 000 个类的小项目构建，领先 7 到 29 ms），5 组持平；附公平性核对与复现命令。 |
| [teacss-0.9.1](teacss-0.9.1.md) | TeaCSS 0.9.1 与 0.9.0：产物逐字节相同；开发服务器保存从 100 降到 70 ms（Rust 引擎），Vite 构建 -12 ms，引擎不变；四项改动各自在未发布通道里的效果；对 Tailwind 117 组比较 102 胜 8 负 7 持平，小项目构建里 Tailwind 的领先缩小到 8 张表。 |
| [teacss-0.9.3](teacss-0.9.3.md) | TeaCSS 0.9.2 与 0.9.3：Rust 引擎成为默认，产物逐字节不变；协议修订 5 与 6（编译缓存与 `NODE_ENV` 都按命令行设置）；更正：TypeScript 引擎开发服务器「变慢」其实是旧测法偏快；协议修订 7 与 8（只加载本任务用到的包、中途负载过高作废）；对 Tailwind 117 组比较 110 胜 3 负 4 持平。 |
| [teacss-0.10.5](teacss-0.10.5.md) | TeaCSS 0.10.5（teacss-rs 与 teacss-ts 两个生态）的第一轮正式测试：对 Tailwind 117 组比较 116 胜 1 持平，小项目构建也全部领先；加 10 个类从 18 降到 6.2 ms；新增命令行组；开发服务器只差内置字体的发送方式；Homebrew 的 Node 让每个 Node 进程多约 70 ms，不偏向任何工具。 |
