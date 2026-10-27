# 06 – Sources and licensing

This report lists the licences of the files in this repository and every
source consulted for the project.

## Licences of this project's files

`REUSE.toml` records the copyright and licence of every file in the
[REUSE](https://reuse.software/) format, and `LICENSES/` holds the licence
texts. Each file has a single licence.

- **Code, tests, scripts, styles, the favicon, the interface translations, the
  diagrams and screenshots in the documentation, and these research notes and
  their translations** were written for this project and are licensed under the
  GNU General Public License v3.0 (see `LICENSE`). The diagrams are drawn by
  `scripts/make-figures.mjs` and the screenshots taken by
  `scripts/screenshots.mjs`. The screenshots that show entries from The Big
  Film Database (`.github/screenshot*.png` and
  `research/img/community-result*.png`) are licensed under CC BY-SA 4.0
  instead.
- **`data/i3a-2008/`** holds a transcription of the factual content of the
  I3A list *DX Codes for 135-Size Film* (February 2008): the Part 1
  assignments, and the DX numbers and product names as published. It was
  produced with `scripts/extract-i3a-pdf.py` and is licensed under the GNU
  General Public License v3.0. The text of the I3A document contains no
  copyright notice or licence terms.
- **`data/big-film-database/`** holds an adapted subset of The Big Film
  Database, licensed under CC BY-SA 4.0; its attribution and the list of
  changes are in [data/README.md](../data/README.md).
- **`site/js/dx-data.js`** and **`site/js/dx-data-community.js`** are generated
  from `data/` by `scripts/build-data.mjs`, one file per dataset. The first
  holds the I3A tables and is licensed under the GNU General Public License
  v3.0; the second holds the Big Film Database subset, carries its attribution
  in its header and is licensed under CC BY-SA 4.0.
- **`tests/unit/zint-vectors.mjs`** holds 11 bit strings from the Zint barcode
  library's test file for this format (`backend/tests/test_dxfilmedge.c`,
  copyright 2024–2025 Antoine Mérino), with that copyright notice, and is
  licensed under BSD-3-Clause. The tests that use them are in
  `tests/unit/codec.test.mjs`.
- The web page uses the fonts installed on the visitor's device and no
  third-party code, and it makes no network requests.
- Playwright, used for the browser tests, is installed separately and is not
  part of the repository.

## Sources

### Barcode format

- Olliver, Johnson & Patton (Eastman Kodak), US patent 4,965,628, *Photographic film with latent image multi-field bar code and eye-readable symbols*, 1990 — <https://patents.google.com/patent/US4965628A/en>
- Shafer & Easterly (Eastman Kodak), US patent 5,448,049, *Film latent image bar-code (LIBC) reader*, 1995 — <https://patents.google.com/patent/US5448049A/en>
- Rottner, Lindsay & Clare (Eastman Kodak), US patent 5,665,950, *Fat bit bar code reader*, 1997 — <https://patents.google.com/patent/US5665950A/en>
- Hamilton (Eastman Kodak), European patent EP 0838718, *Method of printing frame numbers from DX-coded photographic film not having frame number codes*, 2001 — <https://patents.google.com/patent/EP0838718B1/en>
- Saeki et al. (Fuji Photo Film), US patent 5,122,645, *Method and apparatus for reading bar codes on photographic film and determining setting conditions of photographic film*, 1992 — <https://patents.google.com/patent/US5122645A/en>
- Wikipedia, *DX number* — <https://en.wikipedia.org/wiki/DX_number>
- Wikipedia, *DX encoding* — <https://en.wikipedia.org/wiki/DX_encoding>
- zxing-cpp, DX Film Edge reader (`ODDXFilmEdgeReader.cpp`) by Antoine Mérino and Axel Waggershauser — <https://github.com/zxing-cpp/zxing-cpp/blob/master/core/src/oned/ODDXFilmEdgeReader.cpp>
- Zint, DX Film Edge generator (`backend/dxfilmedge.c`), its tests and manual section 6.4.5, by Antoine Mérino — <https://github.com/zint/zint>
- Antoine Mérino, *Identifying the manufacturer of your 35mm (and APS) films*, 2024 — <https://www.merinorus.com/blog/identifying-manufacturer-35-mm-films/>
- Aurélien Lawley, *Decoding 35mm DX film edge barcodes* — <https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/>
- alibosworth, *DX Latent Edge Code — Format Reference* — <https://github.com/alibosworth/35mm-dx-edge-code/blob/main/readme.md>
- Wikimedia Commons, *Kodak Telegraph negativ23a.jpg* by Sergio Fabris — <https://commons.wikimedia.org/wiki/File:Kodak_Telegraph_negativ23a.jpg>
- Wikimedia Commons, *Dx-film-edge-barcode.jpg* by User:Caltrop — <https://commons.wikimedia.org/wiki/File:Dx-film-edge-barcode.jpg>

### Film data and cassette codes

- International Imaging Industry Association, *DX Codes for 135-Size Film*, February 2008 — PDF linked from Aurélien Lawley's article, <https://aurelien.lawley.com.au/pdf/I3A_DX_codes.pdf> (archived copy: <https://web.archive.org/web/20221222115315/https://aurelien.lawley.com.au/pdf/I3A_DX_codes.pdf>); also viewable at <https://www.yumpu.com/it/document/view/3454560/dx-codes-for-135-size-film-international-imaging-industry-association>
- The Big Film Database (dxdatabase) by Dxdatabase — <https://github.com/dxdatabase/Open-source-film-database>, help page <https://industrieplus.net/dxdatabase/help.html>
- The (Modified) Big Film Database by Antoine Mérino — <https://thebigfilmdatabase.merinorus.com>
- Patton, Travis & McPherson (Eastman Kodak), US patent 5,761,558, *Expanded film cartridge bar code*, 1998 — <https://patents.google.com/patent/US5761558A/en>

### Licences

- BSD 3-Clause License — <https://spdx.org/licenses/BSD-3-Clause.html>
- Creative Commons, CC BY-SA 4.0 — <https://creativecommons.org/licenses/by-sa/4.0/>
- GNU General Public License v3.0 — <https://www.gnu.org/licenses/gpl-3.0.html>
