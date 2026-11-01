# 04 – The community film database

**Question:** can a community source fill the gap left by the 2008 registry,
and how far can it be trusted?

**Answer in short:** The Big Film Database covers 637 DX numbers that can
appear on a film edge, 277 of them absent from the 2008 registry. The count
leaves out numbers with Part 1 = 0: valid under the standard, but held by no
maker in 2008. Of the database's rows with a DX extract or a cassette number,
90 are marked as on the market, and 82 of these have a DX number that can
appear on a film edge. It is openly licensed (CC BY-SA 4.0) and carries its own
certainty and availability fields, but it is built mostly from cassettes and
contains a few inconsistencies.

## What it is

The Big Film Database was started in February 2018 by its author, who
publishes as "Dxdatabase", as a website. In 2024 the data was released on
GitHub under CC BY-SA 4.0. The repository's README adds that the copyright of
the film box images belongs to their respective owners and that the images are
only available under "fair use". Antoine Mérino maintains a modified edition
with search by DX number and edge-barcode scanning. According to the database's
help page, it was first compiled from the I3A 2008 list and extended with DX
codes for 2011–2014 obtained from
IS&T, Kodak's film chronology, Tom Philo's Kodak film-number cross-reference,
a Flickr thread on DX numbers, Wikipedia's film lists, collectors and
manufacturers' staff.

## The file

`film_database.csv` is a semicolon-separated CSV with standard double-quote
escaping, one row per product or packaging variant. Its columns are described
in [data/README.md](../data/README.md#big-film-database--community-data); the
meaning of the two coded ones, `reliability` (certainty, "4=high, 0=low")
and `Ava` (availability), comes from the site's own PHP code. The site shows
the certainty only after an entry's note, on the line it labels "Information /
Suspected emulsion", so it rates that note, usually which film a rebrand is
thought to be, not the entry itself.

## Snapshot used

Commit `9aa3890` of the database's GitHub repository (October 10, 2026): 8,710
rows, of which 1,676 have a DX extract or a cassette number: 1,674 a DX
extract, 2 only a cassette number.
`npm run stats:community-data` prints these figures and the others this report
quotes; [data/README.md](../data/README.md#updating-the-data) describes how to
update the snapshot.

## Data-quality findings

The table counts only the rows with a DX extract or a cassette number.

| Finding | Rows |
|---|---|
| DX extract disagrees with the middle digits of the DX full number; the site's "similar emulsions" search lists such a row under its extract | 12 |
| DX extract without a cassette number; among them are 120, 16 mm and sheet films | 138 |
| Number above 2047, beyond the DX numbers a film edge can carry | 42 |
| Number below 16, so Part 1 would be 0: valid under the standard, but held by no maker in 2008, so such a number is most likely a filler | 14 |
| HTML markup inside a field (`<i>…</i>`) | 3 |
| `#` search tags appended to the name | 441 |
| Certainty recorded | 502 (0: 5, 1: 44, 2: 79, 3: 289, 4: 85) |
| Availability | 1,465 discontinued, 121 unsure, 90 on the market |

Two structural limits matter more than any single row:

- **Cassette, not film.** Most numbers were read from cassettes. Rebranded
  films carry the brand's cassette, while the edge code is exposed by the
  factory that made the film. For the original manufacturers' own films the two
  agree; for rebrands they usually do, but nothing guarantees it. GB/T 9185-2003
  has companies that package another maker's film get their DX number from
  that maker rather than from PIMA (Annex A.3.7).
- **One number, many names.** A popular emulsion appears under every brand
  that sold it, so one code can list dozens of entries.

The database's website also guesses a maker and film type from ranges of the
DX extract (the ranges are listed in its repository as
`Various documentation/Film type by DX.txt`). The site itself labels the guess
"not very accurate", and some ranges overlap: 46–127 is "Agfa Gevaert chrome
(slide) film" but also contains 64–79, "Kodak Technical film".

## Coverage of modern films

Of the rows with a DX extract or a cassette number, the database marks 90 as on
the market; 82 of them have a DX number that can appear on a film edge: 54
different numbers, 21 of them absent from the 2008 registry.

## Sources

All sources named above are listed in [report 06](06-sources-and-licensing.md#sources).
