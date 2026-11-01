# Data

The film tables behind the decoder, compiled into two of the files the web page
loads: `site/js/dx-data.js` from the I3A list and `site/js/dx-data-community.js`
from The Big Film Database. They are separate because the two datasets have
different licenses. The page also loads `site/js/dx-index.js`, made from both,
for its lookups by DX number and by cassette number.

| Command | What it does |
|---|---|
| `npm run build:data` | rebuilds the three files from the CSV files here (`npm test` fails if they are out of date) |
| `npm run update:community-data` | re-downloads the snapshot of The Big Film Database recorded in `source.json`; add `-- --latest` for the newest |
| `npm run stats:community-data` | prints the figures about the snapshot that [research/04](../research/04-community-database.md) quotes |
| `python3 scripts/extract-i3a-pdf.py <pdf> data/i3a-2008` | re-transcribes the I3A list from a copy of its PDF (needs PyMuPDF) |

How to use them when a source changes is described under
[Updating the data](#updating-the-data).

## `i3a-2008/` – the 2008 DX registry

A transcription of the factual content of the International Imaging Industry
Association's *DX Codes for 135-Size Film*, February 2008. How it was
transcribed and checked, and what the list contains, is described in
[research/03](../research/03-dx-numbers-and-registry.md).

| File | Columns |
|---|---|
| `part1-assignments.csv` | `part1` (0–127), `assignee` (empty = not assigned), `aps` (`yes` = assigned for APS film), `previously` (earlier assignments, from the list's note) |
| `products.csv` | `part1`, `part2` (empty = "not identified" in the list), `product`, `sensitizer` (section title), `status` (`in-use` or `discontinued`, the latter for films "no longer manufactured … but which may still be in the marketplace"; empty where its list says neither), `page` (page of the PDF) |
| `augmented-cassette-codes.csv` | `cassette_code`, `product`, `sensitizer`: Kodak's "augmented magazine bar code numbers" (ISO 1007, Annex A.4) |

The CSV files keep the list as printed, including three rows that appear
twice; the build step removes the duplicates.

## `big-film-database/` – community data

> **The Big Film Database (dxdatabase) © 2018 by Dxdatabase**,
> <https://github.com/dxdatabase/Open-source-film-database>, licensed under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The files in this folder are an adapted subset and remain under CC BY-SA 4.0.
`source.json` records the upstream commit and retrieval date. Changes made to
the upstream `film_database.csv`:

1. Only rows with a `DX extract` or a `DX full` number are kept.
2. The `Pic` column (box-image file names) is removed.
3. An `ID` column comes first: a record ID of our own for each row, as the
   database has none.

When building `site/js/dx-data-community.js`, HTML markup is removed from text
fields, `#` search tags are split off the names, and the rows are compacted to
arrays.

| Column | Meaning |
|---|---|
| `ID` | our record ID for the row (see above) |
| `DX extract` | 16 × Part 1 + Part 2 (four digits) |
| `DX full` | the six-digit cassette number |
| `Name` | product name, with optional `#` search tags |
| `Original Film or informations` | notes, often the emulsion behind a rebranded film |
| `Manufacturer`, `Country`, `Distributor` | free text |
| `reliability` | how sure the database is about the note in `Original Film or informations`, 0 (low) to 4 (high) |
| `Beginning year`, `End year` | free text, e.g. `~1990 ?` |
| `Ava` | availability: 2 on the market, 1 not sure if discontinued, 0 discontinued |

The data-quality findings are described in
[research/04](../research/04-community-database.md).

## Record IDs and versions

Each row has a record ID: `bfd-` with the row's `ID` in
`big-film-database/film_database_dx.csv`, and `i3a-` with the row's place in
`products.csv` (`i3a-a` in `augmented-cassette-codes.csv`), not counting the
header: `i3a-137` is on line 138. The update script keeps a database row's ID
while the row is unchanged, and never gives an ID to another row. The three
files `npm run build:data` writes share one version: publish them together.

## Updating the data

### When The Big Film Database changes

1. Download the newest version:

   ```sh
   npm run update:community-data -- --latest
   ```

   This fetches `film_database.csv` from GitHub, keeps the rows with a DX
   extract or a cassette number and records the commit in
   `big-film-database/source.json`. For a particular commit, use
   `-- --commit` with its full 40-character hash. Without an option, the
   recorded commit is downloaded again, which leaves the files unchanged.
2. Rebuild the page's data files and run the tests:

   ```sh
   npm run build:data
   npm test
   npm run test:e2e
   ```

   Besides the structure of the data, some tests check the snapshot itself:
   the test of the figures quoted in research/04 fails until step 3 is done,
   and a few tests name particular rows, such as those whose DX extract and
   cassette number differ. A row that changed gets a new `bfd-` ID; `npm test`
   then names any example in `site/js/app.js` whose ID needs updating. If a
   column is renamed or removed upstream, the update or the build stops with an
   error naming it; change `scripts/update-community-data.mjs` or
   `scripts/build-data.mjs` to match. If the test "is a cleaned subset of the
   rows with a DX extract or a cassette number" fails, a row contains something
   the build does not clean up yet, such as a new kind of markup.
3. Bring [research/04](../research/04-community-database.md) and its Chinese
   version up to date. `npm run stats:community-data` prints the figures it
   quotes in its summary, under "Snapshot used", in "Data-quality findings"
   and under "Coverage of modern films"; the date of the commit is shown on
   GitHub.

### When the I3A list needs a correction

The February 2008 list is the newest edition available
([research/03](../research/03-dx-numbers-and-registry.md)), so its tables
change only to correct a transcription error. Fix the cause in
`scripts/extract-i3a-pdf.py` rather than editing the CSV files by hand, so that
they can still be reproduced from the PDF (linked in
[research/06](../research/06-sources-and-licensing.md#sources)), and run it
again. The script stops if its Part 1 table disagrees with the list's own
summary page. Then rebuild and test as above. A few unit tests check counts of
the 2008 list (91 assigned Part 1 numbers, 386 different product rows); they
change only if the correction changes those counts. A correction that adds or
removes a row of `products.csv` renumbers the `i3a-` IDs after it; `npm test`
then names any example in `site/js/app.js` whose ID needs updating.

### If a newer I3A edition turns up

A newer list would go in a folder of its own, such as `data/i3a-2009/`. It
needs the extraction script adapted to its layout, the paths and the
`I3A_SOURCE` description in `scripts/build-data.mjs` pointed at it, new counts
in the tests, and a new section in research/03.
