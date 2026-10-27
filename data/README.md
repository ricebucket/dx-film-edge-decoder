# Data

The film tables behind the decoder, compiled into the two files the web page
loads: `site/js/dx-data.js` from the I3A list and `site/js/dx-data-community.js`
from The Big Film Database. They are separate because the two datasets have
different licences.

| Command | What it does |
|---|---|
| `npm run build:data` | rebuilds both files from the CSV files here (`npm test` fails if they are out of date) |
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
| `products.csv` | `part1`, `part2` (empty = "not identified" in the list), `product`, `sensitizer` (section title), `status` (`in-use` or `discontinued`: films "no longer manufactured … but which may still be in the marketplace"), `page` (page of the PDF) |
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

1. Only rows with a DX number (`DX extract` or `DX full`) are kept.
2. The `Pic` column (box-image file names) is removed.

When building `site/js/dx-data-community.js`, HTML markup is removed from text
fields, `#` search tags are split off the names, a missing `DX extract` is taken
from the middle four digits of `DX full`, and the rows are compacted to arrays.

| Column | Meaning |
|---|---|
| `DX extract` | 16 × Part 1 + Part 2 (four digits) |
| `DX full` | the six-digit cassette number |
| `Name` | product name, with optional `#` search tags |
| `Original Film or informations` | notes, often the emulsion behind a rebranded film |
| `Manufacturer`, `Country`, `Distributor` | free text |
| `reliability` | certainty of the identification, 0 (low) to 4 (high) |
| `Beginning year`, `End year` | free text, e.g. `~1990 ?` |
| `Ava` | availability: 2 on the market, 1 not sure if discontinued, 0 discontinued |

The data-quality checks, and how the decoder presents this data, are described
in [research/04](../research/04-community-database.md).

## Updating the data

### When The Big Film Database changes

1. Download the newest version:

   ```sh
   npm run update:community-data -- --latest
   ```

   This fetches `film_database.csv` from GitHub, keeps the rows with a DX
   number and records the commit in `big-film-database/source.json`. Use
   `-- --commit <hash>` for a particular commit. Without an option, the
   recorded commit is downloaded again, which leaves the files unchanged.
2. Rebuild the page's data file and run the tests:

   ```sh
   npm run build:data
   npm test
   npm run test:e2e
   ```

   The tests check the structure of the data, not its size, so new rows do
   not break them. If a column is renamed or removed upstream, the update or
   the build stops with an error naming it; change
   `scripts/update-community-data.mjs` or `scripts/build-data.mjs` to match. If
   the test "is a cleaned subset with DX numbers" fails, a row contains
   something the build does not clean up yet, such as a new kind of markup.
3. Bring [research/04](../research/04-community-database.md) and its Chinese
   version up to date.
   `npm run stats:community-data` prints the figures it quotes in its
   summary, under "Snapshot used" and in "Data-quality findings"; the date of
   the commit is shown on GitHub. Check the films listed under "Coverage of
   modern films" again.

### When the I3A list needs a correction

The February 2008 list is the newest edition available
([research/03](../research/03-dx-numbers-and-registry.md)), so its tables
change only to correct a transcription error. Fix the cause in
`scripts/extract-i3a-pdf.py` rather than editing the CSV files by hand, so that
they can still be reproduced from the PDF (linked in
[research/06](../research/06-sources-and-licensing.md#sources)), and run it
again. The script stops if its Part 1 table disagrees with the list's own
summary page. Then rebuild and test as above. A few unit tests check counts of
the 2008 list (91 assigned Part 1 numbers, 386 products); they change only if
the correction changes those counts.

### If a newer I3A edition turns up

A newer list would go in a folder of its own, such as `data/i3a-2009/`. It
needs the extraction script adapted to its layout, the paths and the
`I3A_SOURCE` description in `scripts/build-data.mjs` pointed at it, new counts
in the tests, and a new section in research/03. The page names the 2008 edition
in several places ("I3A registry, 2008", "in production in 2008" and others);
search `site/` for `2008`.
