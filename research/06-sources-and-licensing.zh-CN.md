# 06 – 来源与许可

本报告列出本仓库中各文件的许可证，以及本项目查阅过的每一个来源。

## 本项目文件的许可证

`REUSE.toml` 以 [REUSE](https://reuse.software/) 格式记录了每个文件的版权和许可证，`LICENSES/` 存放各许可证的全文。每个文件只有一种许可证。

- **代码、测试、脚本、样式、网站图标、各语言的界面文字、文档中的图示和截图，以及这些研究笔记的中英文版本**是为本项目编写的，采用 GNU General Public License v3.0 许可证（见 `LICENSE`）。图示由 `scripts/make-figures.mjs` 绘制，截图由 `scripts/screenshots.mjs` 生成。显示了 The Big Film Database 条目的截图（`.github/screenshot*.png` 和 `research/img/community-result*.png`）则采用 CC BY-SA 4.0 许可证。
- **`data/i3a-2008/`** 存放 I3A 列表 *DX Codes for 135-Size Film*（2008 年 2 月）中事实内容的转录：Part 1（第一部分）的分配，以及与公布内容一致的 DX 编号和型号名称。它是用 `scripts/extract-i3a-pdf.py` 生成的，采用 GNU General Public License v3.0 许可证。I3A 文件的文本中没有版权声明或许可条款。
- **`data/big-film-database/`** 存放 The Big Film Database 的一个改编子集，采用 CC BY-SA 4.0 许可证；其署名和修改清单见 [data/README.md](../data/README.zh-CN.md)。
- **`site/js/dx-data.js`** 和 **`site/js/dx-data-community.js`** 由 `scripts/build-data.mjs` 根据 `data/` 生成，每个数据集一个文件。前者存放 I3A 数据表，采用 GNU General Public License v3.0 许可证；后者存放 The Big Film Database 的子集，文件头带有它的署名，采用 CC BY-SA 4.0 许可证。
- **`tests/unit/zint-vectors.mjs`** 存放 11 个位串，取自 Zint 条码库针对该格式的测试文件（`backend/tests/test_dxfilmedge.c`，版权 2024–2025 Antoine Mérino），并附有该版权声明，采用 BSD-3-Clause 许可证。使用这些位串的测试在 `tests/unit/codec.test.mjs` 中。
- 网页使用访问者设备上已安装的字体，不使用第三方代码，也不发出任何网络请求。
- 浏览器测试所用的 Playwright 是单独安装的，不属于本仓库。

## 来源

### 条码格式

- Olliver, Johnson & Patton（Eastman Kodak），美国专利 4,965,628，*Photographic film with latent image multi-field bar code and eye-readable symbols*，1990 — <https://patents.google.com/patent/US4965628A/en>
- Shafer & Easterly（Eastman Kodak），美国专利 5,448,049，*Film latent image bar-code (LIBC) reader*，1995 — <https://patents.google.com/patent/US5448049A/en>
- Rottner, Lindsay & Clare（Eastman Kodak），美国专利 5,665,950，*Fat bit bar code reader*，1997 — <https://patents.google.com/patent/US5665950A/en>
- Hamilton（Eastman Kodak），欧洲专利 EP 0838718，*Method of printing frame numbers from DX-coded photographic film not having frame number codes*，2001 — <https://patents.google.com/patent/EP0838718B1/en>
- Saeki 等（Fuji Photo Film），美国专利 5,122,645，*Method and apparatus for reading bar codes on photographic film and determining setting conditions of photographic film*，1992 — <https://patents.google.com/patent/US5122645A/en>
- Ujiie（Fuji Photo Film），日本专利申请 JP H02-45890 A，*コマ番号用バーコードの読取り方法*，1990 — <https://patents.google.com/patent/JPH0245890A/ja>
- Imamura（Fuji Photo Film），美国专利 5,336,873，*Photographic film having frame number bar codes*，1994 — <https://patents.google.com/patent/US5336873A/en>
- Enomoto（Fuji Photo Film），美国专利 6,324,345，*Photographic film with recorded information, method of acquiring the information recorded on photographic film, image processing method using the acquired information, and print system using the same*，2001 — <https://patents.google.com/patent/US6324345B1/en>
- FUJIFILM，*FUJICOLOR C200* 产品资料 — <https://asset.fujifilm.com/master/emea/files/2020-10/98c3d5087c253f51c132a5d46059f131/films_c200_datasheet_01.pdf>
- Wikipedia，*DX number* — <https://en.wikipedia.org/wiki/DX_number>
- Wikipedia，*DX encoding* — <https://en.wikipedia.org/wiki/DX_encoding>
- 中国国家标准 GB/T 9185-2003《摄影师 135规格胶片和暗盒 规范》，2003 年，等同采用 ISO 1007:2000：全国标准信息公共服务平台上的记录 — <https://std.samr.gov.cn/gb/search/gbDetailed?id=71F772D7655ED3A7E05397BE0A0AB82A>；国家标准全文公开系统因涉及版权，不提供该标准的文本阅读 — <https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=B197380D4FBB4B5E62D889D6902DE5DD>
- zxing-cpp，DX Film Edge 读取器（`ODDXFilmEdgeReader.cpp`），作者 Antoine Mérino 和 Axel Waggershauser — <https://github.com/zxing-cpp/zxing-cpp/blob/master/core/src/oned/ODDXFilmEdgeReader.cpp>
- Zint，DX Film Edge 生成器（`backend/dxfilmedge.c`）及其测试和手册第 6.4.5 节，作者 Antoine Mérino — <https://github.com/zint/zint>
- Antoine Mérino，*Identifying the manufacturer of your 35mm (and APS) films*，2024 — <https://www.merinorus.com/blog/identifying-manufacturer-35-mm-films/>
- Aurélien Lawley，*Decoding 35mm DX film edge barcodes* — <https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/>
- alibosworth，*DX Latent Edge Code — Format Reference* — <https://github.com/alibosworth/35mm-dx-edge-code/blob/main/readme.md>
- Wikimedia Commons，*Kodak Telegraph negativ23a.jpg*，作者 Sergio Fabris — <https://commons.wikimedia.org/wiki/File:Kodak_Telegraph_negativ23a.jpg>
- Wikimedia Commons，*Dx-film-edge-barcode.jpg*，作者 User:Caltrop — <https://commons.wikimedia.org/wiki/File:Dx-film-edge-barcode.jpg>

### 胶片数据和暗盒编码

- International Imaging Industry Association，*DX Codes for 135-Size Film*，2008 年 2 月 — Aurélien Lawley 的文章中链接的 PDF，<https://aurelien.lawley.com.au/pdf/I3A_DX_codes.pdf>（存档副本：<https://web.archive.org/web/20221222115315/https://aurelien.lawley.com.au/pdf/I3A_DX_codes.pdf>）；也可以在 <https://www.yumpu.com/it/document/view/3454560/dx-codes-for-135-size-film-international-imaging-industry-association> 查看
- The Big Film Database (dxdatabase)，作者 Dxdatabase — <https://github.com/dxdatabase/Open-source-film-database>，网站 <https://industrieplus.net/dxdatabase/>，帮助页面 <https://industrieplus.net/dxdatabase/help.html>
- The (Modified) Big Film Database，作者 Antoine Mérino — <https://thebigfilmdatabase.merinorus.com>
- Patton, Travis & McPherson（Eastman Kodak），美国专利 5,761,558，*Expanded film cartridge bar code*，1998 — <https://patents.google.com/patent/US5761558A/en>

### 许可证

- BSD 3-Clause License — <https://spdx.org/licenses/BSD-3-Clause.html>
- Creative Commons，CC BY-SA 4.0 — <https://creativecommons.org/licenses/by-sa/4.0/>
- GNU General Public License v3.0 — <https://www.gnu.org/licenses/gpl-3.0.html>
