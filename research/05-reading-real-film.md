# 05 – Reading real film

**Question:** where exactly is the code on a negative, how big is it, which
way round should it be read, and does the documented layout match real film?

**Answer in short:** the code runs along the bottom edge, between the sprocket
holes and the film edge, repeating every 19 mm. GB/T 9185-2003, China's
identical adoption of ISO 1007:2000, sets its size: cells 0.35–0.53 mm wide,
and the two tracks together reaching 2.06–2.60 mm in from the edge. A real
Kodak negative fits those limits, with 0.41 mm cells and tracks reaching
2.3 mm in, but its 31-cell code, 12.6 mm long, is longer than the 11.61 mm the
standard gives for a code with the blank space at its ends. The code is read with the wide clock mark first, which on correctly oriented film
is on the left. A photo of that negative decodes cell for cell exactly as the
standard's layout predicts.

## Where the code is

GB/T 9185-2003 puts the DX code on the edge that carries the half-frame
numbers, next to each of them (§6, §7.1); the other edge may carry whole-frame
numbers or a single-track frame-number barcode (§6, §7.3). Kodak's patent
US 4,965,628 likewise reserves the top edge of the film for eye-readable
information (maker, film type, frame numbers) and the bottom edge for the
barcode, with half-frame numbers and orientation arrows printed between
successive codes.

Measured from the film edge, the data track ends 0.75–1.26 mm in and the clock
track 2.06–2.60 mm in (Table 1, T2 and T3), and the standard's test method
scans the two tracks at 0.41 mm and 1.63 mm (Annex B.2). The LIBC reader patent
US 5,448,049 quotes similar guaranteed positions from ANSI PH1.14-1990: the
data track within 0–0.030 in (0–0.76 mm) and the clock track within
0.050–0.073 in (1.27–1.85 mm). The perforations begin 2.00 ± 0.15 mm from the
edge (Table 2, E), so the clock track can reach into them; alibosworth notes
that the perforations can slightly overlap the top of the clock track, so the
upper part of a clock bar may be cut off.

![A stretch of color negative film edge: perforations, then the clock and data tracks, with two codes labeled 23 and 23A](img/film-edge.svg)

Some cameras exposed further marks on the same edge, three or four times
wider than a DX bar; they are not part of the code
([report 07](07-history-and-related-markings.md#other-marks-along-the-film-edge)).

## Size

This table puts the sizes from Table 1 of GB/T 9185-2003 next to those
measured on a real negative (described below):

| Quantity | Standard | Measured |
|---|---|---|
| Width of one cell (T1) | 0.35–0.53 mm | 0.41 mm |
| Data track, from the film edge (T2) | 0.75–1.26 mm | 1.0 mm |
| Both tracks, from the film edge (T3) | 2.06–2.60 mm | 2.3 mm |
| Perforations, from the film edge (Table 2, E) | 2.00 ± 0.15 mm | 2.0 mm |
| Whole code, 31 cells | 10.9–16.4 mm (31 × T1) | 12.6 mm |
| Code with the blank space at its ends (Y14) | 11.61 mm | more than 12.6 mm |
| Blank space at each end of the code (T4) | at least 0.38 mm | — |

The negative fits every limit except Y14. A 31-cell code fits in 11.61 mm only
with the narrowest cells and the shortest blank space
(31 × 0.35 + 2 × 0.38 = 11.61 mm); with this negative's 0.41 mm cells, the code
alone is 12.6 mm. The standard leaves the distance to the next code (Y13, at
least 6.35 mm) unspecified for codes with frame numbers (note 8), but does not
say how Y14 applies to them.

The measurements were taken on the Wikimedia photo *Kodak Telegraph
negativ23a.jpg* (2,598 × 2,203 pixels), on the code between the printed `23`
and `23A`. The scale is the perforation pitch of 4.75 mm (Table 2, B; 8 per
frame), averaged over eight perforations; at that scale the film is 35.0 mm
wide, against the standard's 34.95 mm (Table 2, A):

| Quantity | Pixels | Millimeters |
|---|---|---|
| Perforation pitch | 291 | 4.75 (scale) |
| Width of the film | 2,146 | 35.0 |
| One cell | 25.0 | 0.41 |
| Whole code, 31 cells | 774 | 12.6 |
| Data track | 62 | 1.0 |
| Clock track, between perforations | 79 | 1.3 |
| Clock track, under a perforation | 60 | 1.0 |
| Film edge to the perforations | 124 | 2.0 |

These come from a single photo. The clock track reaches past the edge of the
perforations, so it is cut short wherever a perforation lies. On this negative
the data track is 2.5 cells tall and the clock track 3.15 (2.4 where a
perforation cuts it). The page's strip, the photo reader's sample images and the
diagram above draw both tracks 2.55 cells (1.04 mm) tall instead, because equal
tracks look better; that is the smallest equal height the standard allows
(T3). Everything else follows this negative: the perforations are at their
standard size, spacing and distance from the edge, placed against the code as
here.

Two other sources agree. Kodak's US 5,665,950, filed in 1995, gives the DX code
a minimum bar width of 0.015 in (0.38 mm); the 2000 edition of the standard
allows narrower cells than its previous edition did (foreword, item d), down to
0.35 mm. Zint's generator
draws each track 3 cells tall by default and no less than 2.2; its source
code says the ratio was measured on 35 mm film and varies "depending on the
brands". The tracks on the Kodak photo, 2.5 and 3.15 cells tall, are close to
that default.

## Validation: decoding a real negative

The code between the printed `23` and `23A` on that photo was cropped, and the
middle of each cell was sampled in both tracks:

| Track | Read from the negative | Expected |
|---|---|---|
| Clock | `1111101010101010101010101010111` | the standard 31-cell clock, exactly |
| Data | `101010 1001111 0 1111 010111 0 0 1 0101` | start, Part 1 = 79, empty, Part 2 = 15, frame 23, whole frame, empty, parity 1, stop |

Part 1 + Part 2 + frame contain 13 bars and the parity cell holds one, so the
total is even. DX 79-15 is *KODAK Professional BW400CN Film* in the I3A list,
matching the film name printed on the same strip, and the printed number just
before the code is `23`, matching the frame field. These bits are used as a
test case in `tests/unit/codec.test.mjs`.

The lower-resolution Wikimedia photo of an Agfa negative (DX 47-1, frame 22A)
was too small to sample reliably; its printed labels agree
([report 02](02-frame-numbers.md#what-is-printed-around-the-codes)).

Two practical observations from both photos shaped the tool's strip: the two
tracks touch, so clock and data bars in the same column merge into one tall
bar (the start pattern looks like a comb); and the printed number before each
code is large. On the Kodak negative a whole-frame number is 3.4 cells (1.4 mm)
tall, 0.6 cells above the film edge and 1.6 cells before its code; an A
position's number is 2 cells tall, over an arrow, 2.8 cells before its code.
The next number starts at least 4.3 cells after a code, so the strip, which
shows one code, draws only the number before it.

## Which way round

- Read with the wide (5-cell) clock mark first. On both photos, with the
  printed numbers reading normally, the wide mark is on the left.
- Antoine Mérino advises reading on the shiny (base) side, not the matte
  (emulsion) side.
- Seen from the other side, everything is mirrored: the wide mark is on the
  right and the printed numbers are mirror-written. The tool's Mirror switch
  draws the strip that way so it can be copied as seen.
- Upside down (rotated 180°), the code runs above the perforations with the
  data track on top; turning the film fixes this.
- GB/T 9185-2003 draws the film turned by 180° from this view: in its
  Figure 1 the code runs along the top edge and starts on the right, and the
  printed numbers are upside down.
- Machines handle both: the Kodak LIBC reader checks whether the entry and exit
  patterns arrive in the right order, and Fuji's reader in US 5,122,645 reads
  its buffer backwards when the end pattern comes first.

## Negatives and slides

On negatives the bars are exposed, so they are dense: dark on the clear or
orange-masked base. The standard designs the code for color negative
processing and leaves it optional on other film (§7.1). It sets the contrast
for processed film: a gap may have a Status M red density of at most 0.50, and
a bar must be at least 0.50 denser (§7.4). Reversal (slide) processing turns
exposed areas clear, so on slide film the bars appear as clear marks on the
black edge. This follows from how reversal processing works; none of the
sources, the standard included, describe edge codes on slide film. The tool draws the strip that way when the black piece
of film under it (the Slide look) is chosen, and the photo reader detects either
polarity by itself.

Black-and-white film developed in color-negative chemistry looks like color
negative film. Of BW400CN, processed in C-41, Kodak says: "The appearance of
processed negatives on BW400CN Film is similar to color negative films, but
with no color in the negative images" (F-4036). The page's BW400CN example is
therefore drawn in the color-negative look.

## Damage

- The code repeats every half frame, so a scratched, faded or notched copy can
  be checked against the next one along the film.
- Parity detects any single misread bar. The tool then lists every single-bar
  change that gives a valid code, with known films first.
- Photos of faded codes have little contrast; the photo reader reports a
  confidence value and warns when some cells are close to its threshold.

## Reading codes from photos

The photo reader (`site/js/dx-image.js`) works without any machine-learning or
external service:

1. Each row of the image, also tilted by up to ±3°, is normalized on its own
   (on color negatives the orange base lies halfway between dark bars and the
   white perforations, so one global threshold would fail).
2. Runs of bars and gaps are matched against the clock pattern, in either
   direction and for both layouts, and the best match is refined by small
   shifts of the cell grid. A tall clock track also fits slightly tilted lines,
   so the slope taken is the one along which the most rows match nearly as
   well as the best.
3. The clock track's known bars and gaps give the gray levels of "bar" and
   "gap" in this photo, in either polarity.
4. The data track is the neighboring row whose cells best fit the fixed
   start and stop patterns and the parity rule, among rows that have most of
   the fixed cells right and whose bits at least half a cell's height of rows
   agree on: a single row on the border between the tracks can misread a bar
   and still pass parity, and blank film agrees with itself. Bits are read in
   clock order, so mirrored or upside-down photos come out right.

It is tested on film edges drawn by the project's own renderer: color
negative, black-and-white and slide; mirrored and upside down; tilted by up to
2.5°; cells only 4 pixels wide; grain and blur; the 23-cell layout; leader
frames; a scratched-out bar; and large images that have to be reduced, one of
them with 3-pixel cells just over the size limit. Each
case is drawn with four pairs of track heights: as measured on the Kodak
negative, equal as the page draws them, and the thinnest and thickest data
track the standard allows (T2 of 0.75 and 1.26 mm). A code that fails its
checks is only offered when its cells and its clock match are clear-cut and a
band of rows agrees on its bits; otherwise the photo is reported as unclear
rather than misread. A code tilted by 7° is read correctly or reported as
unclear, depending on the track heights; from about 8° it needs the page's
Straighten control. It needs at least 3–4 pixels per cell; strong perspective or
curled film is not handled. Photos larger than 1,600 pixels on the long side
are first reduced to that size, each new pixel the average of the area it
covers, so a photo just over the limit keeps nearly all its detail. Reading a
1,600 × 1,200 photo takes about a quarter of a second in Node.js (measured
October 2026). On the page, the search lets the browser draw and respond every
10 ms or so, so the page does not freeze while it runs.

![The photo reader after reading a computer-drawn sample: the cells it read are outlined in the photo](img/photo-reader.png)

## Sources

All sources named above are listed in [report 06](06-sources-and-licensing.md#sources).
