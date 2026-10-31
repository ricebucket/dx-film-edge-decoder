# 数据

解码器背后的胶片数据表，编译进网页加载的两个文件：来自 I3A 列表的 `site/js/dx-data.js` 和来自 The Big Film Database 的 `site/js/dx-data-community.js`。两者分开存放，因为这两个数据集的许可证不同。

| 命令 | 作用 |
|---|---|
| `npm run build:data` | 根据这里的 CSV 文件重新生成这两个文件（如果它们不是最新的，`npm test` 会失败） |
| `npm run update:community-data` | 重新下载 `source.json` 中记录的 The Big Film Database 快照；加上 `-- --latest` 则下载最新的快照 |
| `npm run stats:community-data` | 打印 [research/04](../research/04-community-database.zh-CN.md) 引用的关于该快照的数字 |
| `python3 scripts/extract-i3a-pdf.py <pdf> data/i3a-2008` | 根据 I3A 列表 PDF 的一份副本重新转录该列表（需要 PyMuPDF） |

来源变化时如何使用这些命令，在[更新数据](#更新数据)中说明。

## `i3a-2008/` – 2008 年 DX 码年度报告

国际影像行业协会（I3A）的 *DX Codes for 135-Size Film*（2008 年 2 月）中事实内容的转录。转录和核对的方法，以及列表包含的内容，在 [research/03](../research/03-dx-numbers-and-registry.zh-CN.md) 中说明。

| 文件 | 列 |
|---|---|
| `part1-assignments.csv` | `part1`（0–127）、`assignee`（空 = 未分配）、`aps`（`yes` = 为 APS（先进摄影系统）胶片分配）、`previously`（以前的分配，取自列表中的注释） |
| `products.csv` | `part1`、`part2`（空 = 列表中的“not identified”（未指明））、`product`、`sensitizer`（章节标题）、`status`（`in-use` 或 `discontinued`：后者指“no longer manufactured … but which may still be in the marketplace”（已不再生产……但可能仍在市面上）的胶片；所在的列表两者都没有说明时为空）、`page`（在 PDF 中的页码） |
| `augmented-cassette-codes.csv` | `cassette_code`、`product`、`sensitizer`：柯达的“augmented magazine bar code numbers”（增补暗盒条码编号；ISO 1007，附录 A.4） |

CSV 文件按印刷原样保留列表，包括出现了两次的三行；构建步骤会去掉这些重复行。

## `big-film-database/` – 社区数据

> **The Big Film Database (dxdatabase) © 2018 by Dxdatabase**，<https://github.com/dxdatabase/Open-source-film-database>，采用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 许可证。

这个文件夹中的文件是一个改编后的子集，仍然采用 CC BY-SA 4.0 许可证。`source.json` 记录了上游的提交和获取日期。对上游 `film_database.csv` 所做的修改：

1. 只保留带有 DX 码（`DX extract` 或 `DX full`）的行。
2. 删除了 `Pic` 列（包装盒图片的文件名）。

构建 `site/js/dx-data-community.js` 时，会去掉文本字段中的 HTML 标记，把 `#` 搜索标签从名称中分离出来，缺少的 `DX extract` 取自 `DX full` 中间的四位数字，并把各行压缩成数组。

| 列 | 含义 |
|---|---|
| `DX extract` | 16 × 第 1 部分 + 第 2 部分（四位数字） |
| `DX full` | 六位数的暗盒条码 |
| `Name` | 产品名称，可以带有 `#` 搜索标签 |
| `Original Film or informations` | 备注，常常是贴牌胶片背后的原厂乳剂 |
| `Manufacturer`、`Country`、`Distributor` | 自由文本 |
| `reliability` | 识别的可信度，从 0（低）到 4（高） |
| `Beginning year`、`End year` | 自由文本，例如 `~1990 ?` |
| `Ava` | 供应情况：2 表示在售，1 表示不确定是否停产，0 表示停产 |

数据质量检查，以及解码器如何呈现这些数据，在 [research/04](../research/04-community-database.zh-CN.md) 中说明。

## 更新数据

### The Big Film Database 更新时

1. 下载最新版本：

   ```sh
   npm run update:community-data -- --latest
   ```

   这会从 GitHub 获取 `film_database.csv`，保留带有 DX 码的行，并在 `big-film-database/source.json` 中记录该提交。要获取某个特定的提交，使用 `-- --commit` 加上它完整的 40 位哈希值。不加选项时，会重新下载已记录的那个提交，文件因此保持不变。
2. 重新生成页面的数据文件并运行测试：

   ```sh
   npm run build:data
   npm test
   npm run test:e2e
   ```

   测试检查的是数据的结构而不是数据量，所以新增的行不会让测试失败。如果上游重命名或删除了某一列，更新或构建会报错停止，并在错误信息中指出该列；请相应修改 `scripts/update-community-data.mjs` 或 `scripts/build-data.mjs`。如果测试“is a cleaned subset with DX numbers”（是带 DX 码的已清理子集）失败，说明某一行包含构建步骤还不会清理的内容，例如一种新的标记。
3. 更新 [research/04](../research/04-community-database.zh-CN.md) 及其英文版。`npm run stats:community-data` 会打印该报告在摘要、“所用快照”和“数据质量方面的发现”中引用的数字；提交的日期可以在 GitHub 上看到。再检查一遍“现代胶片的覆盖情况”中列出的胶片。

### I3A 列表需要更正时

2008 年 2 月的列表是能找到的最新版本（[research/03](../research/03-dx-numbers-and-registry.zh-CN.md)），所以它的表格只会因为更正转录错误而改变。请在 `scripts/extract-i3a-pdf.py` 中修正出错的原因，而不是手动编辑 CSV 文件，这样它们仍然可以从 PDF（链接见 [research/06](../research/06-sources-and-licensing.zh-CN.md#来源)）重新生成；然后再次运行该脚本。如果脚本提取出的第 1 部分表与列表自身的汇总页不一致，脚本会停止。然后按上面的步骤重新构建并测试。有几个单元测试检查 2008 年列表中的数量（91 个已分配的第 1 部分编号，386 个产品）；只有当更正改变了这些数量时，这些测试才需要修改。

### 如果出现更新的 I3A 版本

较新的列表会放在它自己的文件夹中，例如 `data/i3a-2009/`。这需要让提取脚本适应它的排版，把 `scripts/build-data.mjs` 中的路径和 `I3A_SOURCE` 描述指向它，在测试中写入新的数量，并在 research/03 中新增一节。页面在多处提到 2008 年版（“I3A registry, 2008”（I3A 年度报告，2008 年）、“in production in 2008”（2008 年仍在生产）等）；请在 `site/` 中搜索 `2008`。
