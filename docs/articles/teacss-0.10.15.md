# TeaCSS 0.10.15：换成官方 Node 后的第二轮测试

**结论。** 这一轮测的是 TeaCSS 0.10.15，teacss-rs 和 teacss-ts 两个生态都是这个版本，跑在官方的 Node 26.12.0 二进制上。在 20 000 个类、300 个文件的项目里：

- 开发服务器里保存一个文件：teacss-rs 44.5 ms，teacss-ts 272 ms，Tailwind CSS v4 318 ms；
- Vite 生产构建：teacss-rs 314 ms，Tailwind 705 ms，teacss-ts 969 ms；
- 构建里 CSS 那部分：teacss-rs 加 137 ms，Tailwind 加 528 ms，teacss-ts 加 792 ms。

和 Tailwind 的 117 组正面比较，teacss-rs 全部更快。上一轮还有 1 组测不出差别，这一轮没有了。

## 这一轮改了什么

- **Node 二进制。** 上一轮用的是 Homebrew 编译的 Node 26.12.0，每个 Node 进程启动都要多花约 70 ms。这一轮换成 nodejs.org 的官方二进制，版本号相同，下载后核对过官方公布的 SHA-256。
- **开发服务器。** `@teacss/vite` 0.10.6 起，开发时不再把字体内联成 data URI；0.10.7 起又把字体地址写成大写的 `URL(`，和 `@teacss/vite-ts` 一样。Vite 8 查 `url(` 时区分大小写，找不到小写的，就跳过 PostCSS。现在两个 Vite 插件的开发样式表逐字节相同。
- **版本。** 两边都从 0.10.5 升到 0.10.15，生成的 CSS 一个字节都没变：300 个文件时三档构建的哈希和上一轮完全一样。

## 20 000 个类、300 个文件

每格 30 次交替运行的中位数：

| 场景 | TeaCSS（Rust 引擎） | Tailwind CSS v4 | TeaCSS（TypeScript 引擎） |
| --- | --- | --- | --- |
| 全新进程，从启动到生成完 | 54.5 ms | 318 ms | 640 ms |
| 在已经启动的进程里生成全部 CSS | 42.9 ms | 245 ms | 464 ms |
| 往运行中的引擎里加 10 个类 | 6.3 ms | 119 ms | 113 ms |
| 开发服务器里保存一个带 10 个新类的文件 | 44.5 ms | 318 ms | 272 ms |
| Vite 生产构建 | 314 ms | 705 ms | 969 ms |

各构建工具里，CSS 工具在基线之上加的时间：

| 构建工具 | 基线 | TeaCSS（Rust 引擎） | Tailwind CSS v4 |
| --- | --- | --- | --- |
| Vite | 177 ms | +137 ms | +528 ms |
| Vite + PostCSS | 177 ms | +209 ms | +710 ms |
| Rsbuild | 177 ms | +316 ms | +958 ms |
| Bun（Bun 运行时） | 72 ms | +102 ms | +318 ms |

两个命令行：`teacss build` 要 200 ms，`teacss-cli` 要 2 582 ms。

## 换了 Node 之后

上一轮的审核预言过：Homebrew 的 Node 只把基线抬高，不影响各工具加的那部分时间。这一轮印证了：

- Vite 基线从 250 降到 177 ms，Rsbuild 基线从 246 降到 177 ms；
- 三个工具的 Vite 构建都少了约 73 ms：314、705、969 ms；
- 各工具在基线上加的时间几乎不动：+139 变 +137，+529 变 +528，+793 变 +792 ms；
- Rust 引擎对 Tailwind 的构建倍数从 2.0 倍变成 2.25 倍，和上一轮估计的约 2.2 倍相符。

所以这一轮的毫秒数不能直接和上一轮比，各工具加的时间可以比。

## 开发服务器快了 30 ms

Rust 引擎在开发服务器里保存一个文件，从 74 ms 降到 44.5 ms；加 100 个类时从 81 降到 53 ms。这个时间是在已经运行的服务器里测的，不含 Node 启动，所以不是换 Node 的功劳。teacss-ts（271 到 272 ms）和 Tailwind（310 到 318 ms）都没动。

省下的这 30 ms 来自 `URL(` 改写：Vite 不再对开发样式表跑 PostCSS。teacss-rs 发版前在同样规模上测过，每次处理样式表从 52 降到 18 ms，和这里看到的差不多。

## 一个没想到的变化

Tailwind 版本没变，但它在已启动进程里生成 CSS 从 226 变成 245 ms，慢了 8%；TeaCSS 两个引擎的变化都在 2% 以内。这一档不含进程启动，唯一变了的是 Node 二进制，所以推测官方二进制跑 Tailwind 的 JavaScript 比 Homebrew 版慢一些。这一轮没有做剖析，只是推测。所有对象用的是同一个二进制，不偏向谁。

## 对 TeaCSS 仍然不利的地方

- **TypeScript 引擎的构建仍比 Tailwind 慢。** 18 组构建比较全部更慢。
- **TypeScript 命令行明显慢。** 300 个文件时 `teacss-cli` 要 2.6 秒，`teacss build` 0.2 秒。
- **Rust 引擎的常驻内存涨了。** 生成一次后从 294 MB 涨到 337 MB；它的 JavaScript 堆只有 39 MB，多出来的大部分在堆外。Tailwind 约 539 MB，TypeScript 引擎约 695 MB。

## 公平性

- 全部用 npm 上的发布版，锁文件里的校验值和 npm 一致；
- 计时前逐类校验，78 000 个用例零差异；
- 所有对象逐轮随机交替，每格 30 次；
- 负载连续两分钟低于 2.4 才开始，各格负载份额 15% 到 25%，任何一格超过 50% 就作废；
- teacss-ts 和 teacss-rs 两个开发会话在整轮期间都停下了自己的构建和测试；
- 运行脚本确认 `node` 指向官方二进制，否则不开跑。

限制：

- 只有一台 Apple M2 Max，Linux 交叉验证未跑；
- 只有生成的配对语料，社区语料还在等仓库清单；
- 本基准的作者也开发 TeaCSS。

## 出处

数字来自[第九份正式报告](../reports/2026-11-20T13-06-39-mac.md)和它的[原始记录](../../results/2026-11-20T13-06-39-mac.json)，审核见[这里](../reports/2026-11-20T13-06-39-mac.audit.md)。上一轮 0.10.5 的结果见[第八份报告](../reports/2026-11-03T13-22-12-mac.md)和[那一轮的文章](teacss-0.10.5.md)。
