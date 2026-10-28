# Research notes

These reports record what was found while researching the DX film edge
barcode for this project: how the code is laid out, what its numbers mean,
where the film data comes from and how far each source can be trusted. Each
report opens with a short answer, and notes its open questions where they
arise. All sources are listed once, in report 06.

| Report | Covers |
|---|---|
| [01 – Edge code format](01-edge-code-format.md) | The two tracks, both layouts (31 and 23 cells), every field, parity, and how the sources were cross-checked |
| [02 – Frame numbers](02-frame-numbers.md) | Half-frame positions, printed labels such as `23A`, the leader values XX, X and 00, half-frame cameras |
| [03 – DX numbers and the registry](03-dx-numbers-and-registry.md) | Part 1 / Part 2, who assigned them, the 2008 I3A list and how it was transcribed, the cassette barcode |
| [04 – Community film database](04-community-database.md) | The Big Film Database: data-quality findings, coverage of modern films, how the tool presents it |
| [05 – Reading real film](05-reading-real-film.md) | Physical layout and size, reading direction, slide film, damaged codes, validation on a real negative, the photo reader |
| [06 – Sources and licensing](06-sources-and-licensing.md) | The licenses of this project's files, and every source consulted |
| [07 – History and related markings](07-history-and-related-markings.md) | Timeline from 1983, cassette contacts, barcode and information panel, other marks on the film edge, APS and 120 film |

## Method

The format is specified in ISO 1007. The reports follow its 2000 edition as
published in China, GB/T 9185-2003, an identical adoption; the US standards
(ANSI PH1.14 → NAPM IT1.14 → PIMA IT3.42) were not consulted. Every rule the
decoder uses is also backed by at least two independent sources among Kodak's
patents, Wikipedia's summaries of ISO 1007, two open-source implementations
(zxing-cpp and Zint) and community write-ups, and was confirmed on a real
negative ([report 05](05-reading-real-film.md)). The film tables were
transcribed with two independent parsers and checked against the list itself
([report 03](03-dx-numbers-and-registry.md)).
