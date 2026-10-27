# 02 – Frame numbers

**Question:** what does the frame field of the 31-cell code hold, and how does
it relate to the numbers printed along the film?

**Answer in short:** the frame field and the half-frame flag together count
half-frame positions along the roll. The code is printed twice per frame, at
the frame (`23`) and halfway to the next (`23A`), and the number printed just
before each code names that code. The leader positions printed `X` and `00`
are stored as 62 and 63, so the count runs …, 62, 62A, 63, 63A, 0, 0A, 1, …

## Why there are two codes per frame

Kodak's patent US 4,965,628 explains the design: photofinishing machines punch
a notch into the film edge at every frame, which can destroy a barcode. A code
short enough to fit twice per frame guarantees that "at least alternate ones of
the multi-field bar code images will always be readable", and missing ones "may
be reconstructed by interpolation". The patent describes the frame field as
"seven bits defining the frame number … defined as half frame intervals", so a
36-exposure roll has 72 frame numbers.

The repetition matches the film geometry: a 35 mm frame advances 8
perforations of 4.75 mm, 38 mm, and the code repeats about every 19 mm
(alibosworth's format reference).

Kodak's EP 0838718 describes how printers used this: Kodak's CLAS35 printer
read one frame number as a reference and used the fixed pitch between codes to
work out the frame number at every frame notch, so each print could carry its
frame number. The alternative, a separate frame-number barcode on the opposite
edge, was used by Fuji in the late 1980s
([report 07](07-history-and-related-markings.md)).

## What is printed around the codes

Per the patent (FIG. 4), successive codes within a frame are separated by an
orientation arrow and the half-frame number, and codes in adjacent frames by
the full frame number. Two photos confirm the order on real film, with the
label *before* the code it names:

![Two codes along the film edge, each preceded by its printed frame number: 23, then 23A](img/film-edge.svg)

| Photo | What is visible along the edge, left to right |
|---|---|
| Wikimedia, *Dx-film-edge-barcode.jpg* (Agfa, DX 47-1) | `▶22A`, the code for 22A, `23`, … |
| Wikimedia, *Kodak Telegraph negativ23a.jpg* (Kodak BW400CN) | `23`, the code for 23 (measured, see [report 05](05-reading-real-film.md)), `23A` with an arrow, … |

So when a user reads a code, the printed number just to its left should match
the decoded frame. The tool says so under the strip and draws those labels.

## The leader: X, 00 and 0

Before frame 1, rolls carry a few extra positions that are normally lost when
the film is loaded.

- alibosworth records the printed sequence on Kodak rolls as
  `X, XA, 00, 00A, 0, 0A, 1, 1A, …` (without having verified the bit values).
- Antoine Mérino decoded four consecutive codes on a 1998 Kodak roll (DX 79-2)
  as 62A, 63, 63A, 0.
- Zint's generator accepts the labels `X` or `S` for 62, `00` or `K` for 63 and
  `F` for 0, and its manual states the same.

Together: **X = 62, 00 = 63**, and the 6-bit field wraps from 63 to 0. Values
1–61 are ordinary frame numbers. The alternative labels S, K and F are
documented only by Zint; which films print them was not found, so the tool
mentions them as "also printed as" without attributing them to a maker.

| Printed | Frame field | Half-frame flag |
|---|---|---|
| X / XA | 62 | 0 / 1 |
| 00 / 00A | 63 | 0 / 1 |
| 0 / 0A | 0 | 0 / 1 |
| 1 … 61 (and A) | same number | 0 / 1 |

## Edge numbers are not camera frames

The edge code is exposed at the factory at a fixed pitch; pictures are
exposed later wherever the camera puts them. alibosworth points out that the
two are not phase-locked: a picture may sit on an `N`/`NA` pair, straddle `5A`
and `6`, or anything in between. The edge number therefore tells you roughly
where along the roll a picture is, which is enough to put frames in order, but
it need not equal the camera's frame counter.

## Half-frame cameras

Half-frame cameras expose two 18 × 24 mm pictures per 38 mm, about one per
code. Mérino suggests counting positions instead of frames: 0, 0A, 1, 1A, …
become half frames 0, 1, 2, 3, …, that is 2 × frame + flag. Kodak's printers
used the same numbering internally: in EP 0838718, half frame 22 becomes
decimal 44 and 22A becomes 45. The tool shows this "half-frame count" for
frames 0–61 and leaves it out for the leader values.

## Short codes

The 23-cell layout has no frame field at all (see [report 01](01-edge-code-format.md)).
Film with short codes still has printed frame numbers, but they cannot be read
from the barcode, so the tool shows no frame for it.

## Sources

All sources named above are listed in [report 06](06-sources-and-licensing.md#sources).
