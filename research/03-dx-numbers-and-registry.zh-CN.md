# 03 – DX 编号与登记表

**问题**：Part 1（第一部分）和 Part 2（第二部分）标识的是什么，由谁分配，本工具可以依据哪一份分配列表？

**简短回答**：Part 1 标识一家生产商的型号类别，是统一分配的；Part 2 区分这家生产商的各个型号。可以免费获取的最新一份分配列表，是 I3A 的 2008 年 2 月版 *DX Codes for 135-Size Film*。这份列表已用两个相互独立的解析器转录到 `data/i3a-2008/`，并与列表本身做了核对。

## DX 编号

DX 编号写作 `Part 1-Part 2`，例如 `79-15`。Part 1 有 7 位（0–127，其中 0 未使用），Part 2 有 4 位（0–15），因此共有 2,032 个可能的编号。这个编号代表一种胶片型号；它并不编码感光度或冲洗工艺，这些由型号决定（alibosworth；维基百科 *DX number*）。2008 年列表中的型号名称大多带有感光度，但并非全部。

暗盒上也使用同一个编号，它的中间四位数字为 16 × Part 1 + Part 2（见下文）。柯达 1990 年的专利把这对数字称为“NAPM number”（NAPM 编号），这个名称来自最早分配 Part 1 编号的 National Association of Photographic Manufacturers（全国摄影器材生产商协会）。这项工作后来先后移交给 PIMA 和 I3A（alibosworth 对这段沿革的总结）；维基百科称 I3A “published and sold a proprietary list of DX numbers … yearly or as needed”（每年或按需出版并出售一份专有的 DX 编号列表），最后一版的日期为 2009 年 1 月。网上没有找到这一版。The Big Film Database 提到了从影像科学与技术学会（IS&T）获得的 2011–2014 年 DX 编码，这些编码尚未公开。

## 2008 年 2 月的列表

这份文件分为两部分。

**Part 1 分配表（0–127）**。有 91 个编号分配给了 12 家“sensitizers”（感光材料生产商，即胶片生产商）；其中 9 个（33、37、38、44、45、72、86、91、94）标为“APS Film”（先进摄影系统胶片）。一条注释列出了过去分配过的编号：21 和 22 于 1989 年分配给 Tudor（从未续期），65 分配给 3M（1985–1993 年），119 分配给 ORWO（1988–1993 年），96 分配给 Eastman Kodak（1983 年分配，1988 年释放，2003 年重新分配）。

| 受让方（按表中写法） | Part 1 编号数 | 型号行数 |
|---|---|---|
| Agfa-Gevaert | 14 | 99 |
| China Lucky Film | 3 | 10 |
| Eastman Kodak | 30 | 91 |
| ERA Photo | 1 | 1 |
| Ferrania Imaging | 7 | 23 |
| FUJIFILM Corporation | 12 | 74 |
| Harman Technologies (ILFORD Photo) | 6 | 29 |
| KONICA MINOLTA | 11 | 39 |
| ORWO Media | 4 | 12 |
| Shanghai General Photo | 1 | 4 |
| SVEMA Production | 1 | 1 |
| Xiamen FUDA | 1 | 3 |

**型号列表**。每家感光材料生产商下有若干行，每行是 Part 1、Part 2 和型号名称。Agfa-Gevaert、Eastman Kodak 和 Konica Minolta 把各自的行分为两类：“DX numbers that are currently being used”（目前正在使用的 DX 编号），以及“no longer manufactured … but which may still be in the marketplace”（已不再生产……但可能仍在市面上）的胶片；本工具把这一区分显示为“2008 年仍在生产”或“2008 年前已停产”。列表共印有 389 行。

### 文件中发现的不寻常之处

- 汇总页给出的 Eastman Kodak 的 Part 1 编号数是 28 个，但列出的是 30 个；按编号逐行列出的表里也是 30 个。
- 爱克发有三行（Part 1 为 17，Part 2 为 2）各印了两次；本工具每行只保留一份，剩下 386 行。
- Shanghai General 的四个品牌（Shenguang、Shanghai、Seagull、Rainbow）的 Part 2 标为“not identified”（未指明），因此在 Part 1 为 88 时，任何 Part 2 都与它们匹配。
- Ferrania 的 Part 2 编号印成带前导零的形式（`01` … `10`）。
- 有 17 个 DX 编号由两个或更多型号共用，例如 `3-9` 由五种 Agfachrome 和 Perutz 反转片共用，`95-2` 由 Kodak High Definition 400 和 Kodak Hawkeye Traffic Surveillance 胶片共用。本工具会把它们全部显示出来。
- 列表中没有把 Harman Technologies 称为 ILFORD；它的型号（HP5 PLUS、FP4 PLUS、DELTA 等）都是 ILFORD 胶片，而且维基百科的表格把这些编号标为“Ilford Photo”，所以本工具在括号里加上了这个名称。

### 列表是如何转录的

1. PDF 的文本层是连同单词坐标一起读取的（PyMuPDF），因此可以根据位置重建表格的行，并把折到第二行的型号名称重新接起来。
2. 第二个独立的解析器处理的是纯文本流。两者得到了相同的 389 行。
3. 把 Part 1 表与文件自身的 *Assignment Summary* 页对照：12 个受让方全部一致。
4. 把各页渲染成图像，用肉眼与提取出的行进行比对。
5. 用已公开的例子做抽查：34-6 是 FUJICHROME ASTIA 100 PROFESSIONAL（Lawley），115-3 和 115-4 是 Perutz SC 100-3 和 200-3 Color（维基百科），79-15 是 KODAK Professional BW400CN Film（维基百科示例）。

`scripts/extract-i3a-pdf.py` 可以从 PDF 的副本重新生成这份转录；`tests/unit/data.test.mjs` 中的单元测试会对 CSV 文件重复这些一致性检查。

## 暗盒条码

135 规格暗盒上有一个 Interleaved 2 of 5（交插二五码）条码，印有六位数字 `PHHHHE`（维基百科 *DX number*；柯达 US 5,761,558）：

![暗盒编号 017563 拆成首位数字 0、DX extract 1756（DX 109-12）和表示长度的末位数字 3（24 张）](img/cassette-number.zh-CN.svg)

| 数位 | 含义 |
|---|---|
| P | 由生产商选定，0–9 |
| HHHH | 16 × Part 1 + Part 2，例如 79-15 → `1279` |
| E | 张数：1 = 12，2 = 20，3 = 24，4 = 36，5 = 48，6 = 60，0 = 72，7 = 其他长度，如 24 + 3（维基百科引用的 ANSI/NAPM IT1.14:1994） |

计算示例：`315223` → 95-2，24 张（维基百科）；`017563` → 109-12，24 张（维基百科上一张 ISO 125 暗盒的照片，而 109-12 在 I3A 列表中是 FP4 PLUS）；`412503` → 78-2（Mérino）；柯达的专利算出 83-2 → 1330。E 位为 8 和 9 的情况在来源中没有定义，本工具会说明这一点。

最大的真实 DX 编号得出 HHHH = 2047。I3A 列表还记录了五个柯达的“augmented magazine bar code numbers”（扩展暗盒条码编号；ISO 1007，附录 A.4），用于通过加拿大 Jean Coutu 药店销售的柯达胶卷，例如 `832973`；它们的中间几位数字超过 2047，因此不可能出现在片边上。暗盒查询功能会根据完整编号识别它们。

维基百科引用这项暗盒条码专利时，标题、发明人和日期都正确，但专利号写成了“US 5661558A”，这个号码属于一项无关的专利（一种用于流动样品的光学检测器）。正确的号码是 US 5,761,558，与 Mérino 的引用一致。

## 2008 年以后

在这份列表之后推出的胶片（例如 2010 年的 Kodak Portra 400 或 2008 年的 Ektar 100）都不在列表中。它们的编码只能从社区来源得知，见[报告 04](04-community-database.zh-CN.md)。

## 来源

上文提到的所有来源都列在[报告 06](06-sources-and-licensing.zh-CN.md#来源) 中。
