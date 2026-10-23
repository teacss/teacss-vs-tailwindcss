# TeaCSS 0.9.0（Rust 引擎）与 Tailwind CSS v4.3

**结论。** 同样的一批工具类，TeaCSS 的 Rust 引擎在 117 组正面比较里赢 102 组，Tailwind CSS v4 赢 10 组，5 组无可测差异。

- **TeaCSS 赢下的：** 所有生成 CSS 的场景、所有开发服务器场景，以及 5 000 个类以上的全部构建。
- **Tailwind 赢下的：** 都是 1 000 个类左右的小项目构建，领先 7 到 29 ms。

项目越大，差距越明显。在 20 000 个类的项目里：

- 开发服务器里保存一个文件，TeaCSS 要 100 ms，Tailwind 要 322 ms；
- Vite 生产构建，CSS 部分 TeaCSS 加 258 ms，Tailwind 加 558 ms。

## 一张表看完

20 000 个类、分在 300 个文件里，每格 30 次交替运行的中位数，方括号里是四分位范围：

| 场景 | TeaCSS（Rust 引擎） | Tailwind CSS v4 | 谁快、快多少 |
| --- | --- | --- | --- |
| 在已经启动的进程里生成全部 CSS | 52 ms [51–53] | 230 ms [218–270] | TeaCSS，4.4 倍 |
| 全新进程，从启动到生成完 | 154 ms [153–156] | 378 ms [372–385] | TeaCSS，2.5 倍 |
| 往运行中的编译器里加 10 个类 | 17 ms [16–17] | 127 ms [123–133] | TeaCSS，7.6 倍 |
| 开发服务器里保存一个带 10 个新类的文件 | 100 ms [99–102] | 322 ms [318–326] | TeaCSS，3.2 倍 |
| Vite 生产构建 | 492 ms [489–496] | 791 ms [785–801] | TeaCSS，1.6 倍 |
| 一次生成用掉的 CPU | 196 ms | 323 ms | TeaCSS 少 39% |
| 生成后的常驻内存 | 391 MB | 697 MB | TeaCSS 少 44% |

## 各构建工具里，CSS 工具加了多少时间

下表从构建总时间里减去同一工具不带任何 CSS 工具时的基线，20 000 × 300。基线这一列比的是打包器和运行时，不是 CSS 工具；后两列才是比较对象。

| 构建工具 | 基线 | TeaCSS（Rust 引擎） | Tailwind CSS v4 |
| --- | --- | --- | --- |
| Vite | 233 ms | +258 ms | +558 ms |
| Vite + PostCSS 插件 | 233 ms | +291 ms | +629 ms |
| Rsbuild | 224 ms | +314 ms | +981 ms |
| Bun（Bun 运行时） | 97 ms | +153 ms | +331 ms |

每种接法都按各自文档的写法：

- **TeaCSS：** `@teacss/vite`、`@teacss/postcss`、`@teacss/rsbuild`、`@teacss/bun`。
- **Tailwind：** `@tailwindcss/vite`、`@tailwindcss/postcss`、Rsbuild 官方的 `@rsbuild/plugin-tailwindcss`、Bun 官方的 `bun-plugin-tailwind`。

## Tailwind 赢的地方

**小项目的构建。** 1 000 个类、300 个文件：

| 构建 | TeaCSS（Rust 引擎） | Tailwind CSS v4 |
| --- | --- | --- |
| Vite | 362 ms | 333 ms |
| Vite + PostCSS | 376 ms | 352 ms |
| Bun | 177 ms | 164 ms |
| Rsbuild | 348 ms | 347 ms（无可测差异） |

1 000 个类的 15 张构建表里，Tailwind 的中位数都最低。其中 10 张差距可测，在 7 到 29 ms 之间；另 5 张无可测差异。差在固定成本上：TeaCSS 每次构建都要加载日志库 `consola`（约 11 ms）和预设，生成反而只要几毫秒。这一项已经作为优化卡片 T4 交给 teacss-ts。

**一个中间规模的细节。** 5 000 个类时，Tailwind 的开发服务器保存（97 ms）比 TeaCSS 的 TypeScript 引擎（101 ms）快，但仍比 TeaCSS 的 Rust 引擎（54 ms）慢。

## 产出不一样多

同样 20 010 个类，生产构建的产出：

| | CSS | gzip 后 | 规则数 |
| --- | --- | --- | --- |
| Tailwind CSS v4 | 2 761 KB | 229 KB | 30 010 |
| TeaCSS | 1 058 KB | 88 KB | 4 832 |

两者不是在做完全一样的事：

- Tailwind 每个类基本各占一条规则，另外输出主题层的 CSS 变量；
- TeaCSS 把声明相同的选择器合并成一条规则，所以 20 010 个类只有 4 832 条规则。

所以这里比的是「得到一份覆盖同样类、同样属性与条件的正确样式表要多久」，不是每字节的速度。Tailwind 有一部分时间花在产出更多 CSS 上。

## 怎么保证公平

- **同样的类。** 配对语料里，每个用例在两种语法里表达同一件事：同样的属性族、同样的条件（悬停、聚焦、首子元素、断点）。计时之前，两边的产物都逐类校验。9 种语料与文件分布、78 000 个用例，零差异。

  两套设计系统的颜色、单位、断点宽度本来就不同，所以校验比的是结构（选择器存在、声明了期望的属性、条件形状一致），不比具体数值。Bun 的 CSS 打包器会把 Tailwind 的 `padding-inline` 这类逻辑简写拆成 `-start` 与 `-end` 两个长写；校验按等价处理，并在报告里计数（1 287 个用例）。
- **双方都按生产方式运行。** 两边都用发布版。Tailwind 用它文档推荐的 `source(none)` 加显式 `@source`。开箱默认的 `@import "tailwindcss"` 另测，构建时间是推荐写法的 1.01 倍，结论不变。
- **同样的运行条件。** Node 24.14.1，同一台机器；每次测量一个全新进程；所有对象逐轮随机交替，每格 30 次；负载连续两分钟低于 2.4 才开始计时。
- **构建计时到构建返回为止。** 上一轮发现，基准程序在构建之后、进程退出之前，还要对产物做哈希、压缩和规则计数。这部分时间随产物大小增长，对产出更多 CSS 的 Tailwind 不利。已经改为只计到构建返回（规格 v01.1 修订 4），先前发布的三份报告的审核里都补记了这一偏差。
- **开发服务器的完成判定与工具无关。** 从写入新文件开始计时，到页面请求的样式表里第一次出现全部新类为止，每 5 ms 轮询一次，两边相同。
- **统计规则事先写好。** 差距小于较大的四分位距、或 Mann-Whitney 检验 p ≥ 0.01，就写「无可测差异」。

逐条对照 teacss-ts 的 `docs/plans/perf-iteration-loop.md` §2：

| 要求 | 本文 |
| --- | --- |
| 做同样的工作并校验产物 | 逐类结构校验，78 000 个用例零差异，错误计数为零 |
| 按生产方式运行 | 发布版、各自文档的推荐配置，开箱默认另测 |
| 交替运行、多次取中位数、报范围 | 每格 30 次，中位数与四分位范围 |
| 负载门槛 | 连续两分钟低于 2.4，各格负载份额 18% 到 42% |
| 写出不利结果 | 见「Tailwind 赢的地方」与「产出不一样多」 |
| 覆盖率与第二台机器 | 见「限制」 |

## 限制

- **只有一台机器：** Apple M2 Max，12 核，macOS。Linux 上的交叉验证还没跑。
- **只有生成的配对语料。** 「来自真实 Tailwind 项目的社区语料」这套工具已经就绪，但仓库清单还没定，所以没有进本轮。配对表版本 1 的覆盖面窄：在两个本机示例里只能翻译 30% 的 Tailwind 工具类。社区语料跑过之后，结论才能推广到「真实项目里常用的那些类」。
- **Bun 组跑在 Bun 运行时里。** 它的基线与绝对时间同时比较了运行时；只看相对基线的增量。
- **本基准的作者也开发 TeaCSS。** 方法在运行前提交，配对表与原始样本全部公开，可以从干净的克隆复现。

## 自己复现

```bash
git clone https://github.com/teacss/teacss-vs-tailwindcss
```

```bash
cd teacss-vs-tailwindcss && git checkout e9a94c03 && bun install
```

```bash
bun run bench:verify --utilities 20000 --files 300 --group main,default-config,postcss,rsbuild,bun
```

```bash
bun run bench --group main,default-config,postcss,rsbuild,bun --out results
```

需要 Node 24.14.1 与 Bun 1.4.3；版本不对时，测量命令会拒绝运行。全量约 70 分钟。

每个数字都来自[第三份正式报告](../reports/2026-10-23T20-14-57-mac.md)和它的[原始记录](../../results/2026-10-23T20-14-57-mac.json)，审核见[这里](../reports/2026-10-23T20-14-57-mac.audit.md)。
