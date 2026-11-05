# TeaCSS 0.10.5：两个生态的第一轮正式测试

**结论。** TeaCSS 0.10 拆成了两个互不共享包的生态：teacss-rs 只用 Rust 引擎，teacss-ts 只用 TypeScript 引擎。这是 0.10 的第一轮正式测试，两边都是 0.10.5。在 20 000 个类、300 个文件的项目里：

- 开发服务器里保存一个文件：teacss-rs 74 ms，teacss-ts 271 ms，Tailwind CSS v4 311 ms；
- Vite 生产构建里 CSS 那部分：teacss-rs 加 139 ms，Tailwind 加 529 ms，teacss-ts 加 793 ms；
- 往运行中的引擎里加 10 个类：teacss-rs 从 0.9.3 的 18 ms 降到 6.2 ms。

和 Tailwind 的 117 组正面比较里，teacss-rs 赢 116 组，1 组无可测差异，没有输的。上一轮 Tailwind 还在 3 张小项目构建表里领先，这一轮 1 000 个类的 15 张构建表都是 teacss-rs 更快，领先 27 到 55 ms。

## 0.10 改了什么

- **没有引擎开关了。** 0.9 里同一套包可以切换引擎；0.10 里 `@teacss/vite`、`@teacss/postcss`、`@teacss/rsbuild`、`@teacss/bun` 和 `teacss` 命令行属于 teacss-rs，`@teacss/vite-ts` 和 `@teacss/cli` 属于 teacss-ts。基准不再靠环境变量确认引擎，而是看进程实际加载了哪个原生模块。
- **teacss-ts 只发布 Vite 插件和命令行。** 所以 PostCSS、Rsbuild、Bun 三组里只有 Rust 引擎一个 TeaCSS 对象。
- **新增命令行组。** 20 000 个类、300 个文件时，`teacss build` 要 340 ms，`teacss-cli` 要 2 778 ms。这一组没有 Tailwind。
- **输出。** 两个引擎、两个 Vite 插件的构建产物逐字节相同；两个命令行在字体地址换成摘要后相同。开发服务器有一处不同，见下文。

## 20 000 个类、300 个文件

每格 30 次交替运行的中位数：

| 场景 | TeaCSS（Rust 引擎） | Tailwind CSS v4 | TeaCSS（TypeScript 引擎） |
| --- | --- | --- | --- |
| 全新进程，从启动到生成完 | 55 ms | 314 ms | 640 ms |
| 在已经启动的进程里生成全部 CSS | 42 ms | 226 ms | 466 ms |
| 往运行中的引擎里加 10 个类 | 6.2 ms | 116 ms | 116 ms |
| 开发服务器里保存一个带 10 个新类的文件 | 74 ms | 311 ms | 271 ms |
| Vite 生产构建 | 388 ms | 779 ms | 1 043 ms |

各构建工具里，CSS 工具在基线之上加的时间：

| 构建工具 | 基线 | TeaCSS（Rust 引擎） | Tailwind CSS v4 |
| --- | --- | --- | --- |
| Vite | 250 ms | +139 ms | +529 ms |
| Vite + PostCSS | 250 ms | +207 ms | +715 ms |
| Rsbuild | 246 ms | +310 ms | +960 ms |
| Bun（Bun 运行时） | 68 ms | +96 ms | +320 ms |

## 为什么毫秒数都变大了：Node 二进制

teacss-rs 0.10 要求 Node 26，所以这一轮从 Node 24.14.1 换到了 Node 26.12.0。Vite 基线在每一格都多了约 75 ms，从 146 到 185 ms 变成 223 到 261 ms。

原因不在 Node 26 本身，而在这台机器上的 Node 是 Homebrew 编译的版本。它动态链接了 `libnode` 和几十个 Homebrew 库，每次启动都要先加载它们：

- 空进程 `node -e 0`：Homebrew 的 Node 26.12.0 要 102 ms，官方的 Node 26.7.0 要 32 ms，Node 24.12.0 要 28 ms。
- 同一个小项目的 Vite 构建：Node 24.12.0 要 107 ms，Homebrew 的 Node 26.12.0 要 180 ms。

每个 Node 进程都多付这约 70 ms，所有工具一样，两个命令行也一样（它们都通过 `#!/usr/bin/env node` 启动）。所以：

- 各工具在基线之上加的时间不受影响；
- 构建的倍数被压小了：去掉这 70 ms，Vite 构建 Rust 引擎对 Tailwind 的领先约为 2.2 倍，而不是表里的 2.0 倍。这对 TeaCSS 不利，不是有利；
- Bun 组不用 Node，不受影响。

换成官方的 Node 26.12.0 二进制重跑，就能去掉这部分。在那之前，构建和命令行的绝对时间请按偏高约 70 ms 来读。

同样因为换了 Node，这一轮的毫秒数不能直接和以前的报告比。Tailwind 版本没变，它的「加 10 个类」也从 140 变成了 116 ms，这是 Node 的变化，不是 Tailwind 的变化。

## 开发服务器的样式表不同，但只差字体

构建产物逐字节相同，开发服务器返回的样式表却在每一格都正好差 144 928 字节。差的是四个内置字体：

- `@teacss/vite` 在开发时把字体内联成 data URI；
- `@teacss/vite-ts` 把它们链接到 `/__teacss_fonts/`。

把每个字体换成它的摘要后，两份样式表完全相同。Rust 插件每次多发约 145 KB，如果有影响，也是让它更慢。报告生成器以前把引擎以外的任何差异都解释成修订 9 的 Lightning CSS 问题，这次改成分开统计 Vite 构建和开发服务器，并写明是字体。

## 对 TeaCSS 仍然不利的地方

- **TypeScript 引擎的构建仍比 Tailwind 慢。** 它参与的 18 组构建比较全部更慢。
- **TypeScript 命令行明显慢。** 300 个文件时 `teacss-cli` 要 2.2 到 2.8 秒，`teacss build` 约 0.3 秒。
- **TypeScript 引擎占内存更多。** 生成一次后常驻约 700 MB，Rust 引擎约 294 MB，Tailwind 约 530 MB。这个读数取决于垃圾回收最后一次运行的时机。

## 公平性

- 全部用 npm 上的发布版；
- 计时前逐类校验，78 000 个用例零差异；
- 所有对象逐轮随机交替，每格 30 次；
- 负载连续两分钟低于 2.4 才开始，各格负载份额 21% 到 42%，任何一格超过 50% 就作废；
- teacss-ts 和 teacss-rs 两个开发会话在整轮期间都停下了自己的构建和测试；
- 所有 Node 构建和开发服务器都使用命令行会设的编译缓存与 `NODE_ENV`，并且只加载本任务用到的包。

限制：

- 只有一台 Apple M2 Max，Linux 交叉验证未跑；
- Homebrew 的 Node 让每个 Node 进程多约 70 ms，见上文；
- 只有生成的配对语料，社区语料还在等仓库清单；
- 本基准的作者也开发 TeaCSS。

## 出处

数字来自[第八份正式报告](../reports/2026-11-03T13-22-12-mac.md)和它的[原始记录](../../results/2026-11-03T13-22-12-mac.json)，审核见[这里](../reports/2026-11-03T13-22-12-mac.audit.md)。上一轮 0.9.3 的结果见[第七份报告](../reports/2026-10-25T12-05-32-mac.md)和[那一轮的文章](teacss-0.9.3.md)。
