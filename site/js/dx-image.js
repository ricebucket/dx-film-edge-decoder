/*
 * Reading a DX edge code from a photo or scan, and drawing synthetic film
 * edges for tests and the "try a sample" button. Pure functions on plain
 * arrays: no DOM, so the same code runs in Node tests.
 *
 * Images are { width, height, data } with one gray value (0–255) per pixel.
 *
 * How the reader works:
 *   1. Along every row (and a few slight slants) it looks for the clock
 *      track's run pattern: a 5-cell mark, 23 (or 15) single cells, a 3-cell
 *      mark. Each row is normalized on its own, because on color negatives
 *      the orange base sits halfway between the bars and the white holes.
 *   2. The best match fixes the cell grid. Its known bar/gap cells give the
 *      gray levels of "bar" and "gap" for this photo, in either polarity
 *      (dark bars on negatives, clear bars on slides).
 *   3. The data track is the nearby row whose cells best fit the fixed start
 *      and stop patterns and the parity rule. A reversed clock pattern means
 *      the film was mirrored or upside down; bits are read in clock order.
 *   4. If no clock track turns up, a second look allows for a faded or
 *      damaged one: less contrast, light that changes along the film, and one
 *      clock bar scratched off or one gap filled.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dx-codec.js'));
  else (root.DX = root.DX || {}).image = factory(root.DX.codec);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (codec) {
  'use strict';

  const SLOPES = [0, -0.0175, 0.0175, -0.035, 0.035, -0.0525, 0.0525]; // 0°, ±1°, ±2°, ±3°

  // ---- image helpers ------------------------------------------------------------

  function grayFromRGBA(rgba, width, height) {
    const data = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
    return { width, height, data };
  }

  /**
   * Shrink an image so its long side is at most maxSide. Each new pixel is the
   * average of the area it covers, parts of pixels included, so an image just
   * over the limit keeps nearly all its detail. `scale` maps positions back:
   * x in the input is (x' + 0.5) * scale.x - 0.5, and likewise y.
   */
  function shrink(img, maxSide) {
    const long = Math.max(img.width, img.height);
    if (long <= maxSide) return { img, scale: { x: 1, y: 1 } };
    const width = Math.max(1, Math.round((img.width * maxSide) / long));
    const height = Math.max(1, Math.round((img.height * maxSide) / long));
    // Across, then down.
    const across = new Float32Array(width * img.height);
    const xs = areaSpans(img.width, width);
    for (let y = 0; y < img.height; y++) {
      const row = y * img.width;
      for (let x = 0; x < width; x++) {
        const { first, weights } = xs[x];
        let sum = 0;
        for (let k = 0; k < weights.length; k++) sum += img.data[row + first + k] * weights[k];
        across[y * width + x] = sum;
      }
    }
    const data = new Float32Array(width * height);
    const ys = areaSpans(img.height, height);
    for (let y = 0; y < height; y++) {
      const { first, weights } = ys[y];
      const out = y * width;
      for (let k = 0; k < weights.length; k++) {
        const from = (first + k) * width;
        for (let x = 0; x < width; x++) data[out + x] += across[from + x] * weights[k];
      }
    }
    return { img: { width, height, data }, scale: { x: img.width / width, y: img.height / height } };
  }

  /** For each of `m` new pixels along a line of `n` (m < n): the first old pixel it covers and the weights of those it covers. */
  function areaSpans(n, m) {
    const step = n / m;
    const spans = [];
    for (let i = 0; i < m; i++) {
      const a = i * step;
      const b = (i + 1) * step;
      const first = Math.floor(a);
      const weights = [];
      for (let j = first; j < Math.min(n, Math.ceil(b)); j++) weights.push((Math.min(b, j + 1) - Math.max(a, j)) / step);
      spans.push({ first, weights });
    }
    return spans;
  }

  /** Percentiles of gray values (0–255) via a histogram: linear time, no sorting. */
  function percentiles(values, ps) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, values[i] | 0))]++;
    return ps.map((p) => {
      const target = p * (values.length - 1);
      let seen = 0;
      for (let v = 0; v < 256; v++) {
        seen += hist[v];
        if (seen > target) return v;
      }
      return 255;
    });
  }

  /** Bilinear sample, clamped to the image. */
  function sample(img, x, y) {
    const w = img.width;
    const cx = Math.min(w - 1.001, Math.max(0, x));
    const cy = Math.min(img.height - 1.001, Math.max(0, y));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const i = y0 * w + x0;
    const d = img.data;
    return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
  }

  /** The lowest (sign 1) or highest (sign -1) value within `half` pixels of each position, in linear time. */
  function envelope(values, half, sign) {
    const n = values.length;
    const out = new Float32Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let x = 0; x < n; x++) {
      for (const end = Math.min(n - 1, x + half); next <= end; next++) {
        while (tail > head && sign * values[queue[tail - 1]] >= sign * values[next]) tail--;
        queue[tail++] = next;
      }
      while (queue[head] < x - half) head++;
      out[x] = values[queue[head]];
    }
    return out;
  }

  /** Gray values along a row, slanted by `slope` around the image center, averaged over ±band rows. */
  function profile(img, y, slope, band) {
    const out = new Float32Array(img.width);
    const cx = img.width / 2;
    for (let x = 0; x < img.width; x++) {
      const yy = y + (x - cx) * slope;
      let sum = 0;
      for (let b = -band; b <= band; b++) sum += sample(img, x, yy + b);
      out[x] = sum / (2 * band + 1);
    }
    return out;
  }

  /** Mean gray over the middle half of each cell. */
  function sampleCells(img, y, slope, x0, unit, cells, band) {
    const out = new Array(cells);
    const cx = img.width / 2;
    for (let c = 0; c < cells; c++) {
      const a = x0 + (c + 0.25) * unit;
      const b = x0 + (c + 0.75) * unit;
      const steps = Math.max(2, Math.round(b - a));
      let sum = 0;
      let n = 0;
      for (let k = 0; k <= steps; k++) {
        const x = a + ((b - a) * k) / steps;
        const yy = y + (x - cx) * slope;
        for (let d = -band; d <= band; d++) {
          sum += sample(img, x, yy + d);
          n++;
        }
      }
      out[c] = sum / n;
    }
    return out;
  }

  // ---- clock track ----------------------------------------------------------------

  function runs(marks) {
    const out = [];
    let start = 0;
    let on = marks[0] >= 0.5;
    for (let x = 1; x <= marks.length; x++) {
      const v = x < marks.length ? marks[x] >= 0.5 : !on;
      if (v !== on) {
        out.push({ on, start, len: x - start });
        start = x;
        on = v;
      }
    }
    return out;
  }

  /** Run widths of the clock track, in cells: wide entry mark, single cells, shorter exit mark. */
  function clockRuns(format) {
    return [5, ...Array(format === 'long' ? 23 : 15).fill(1), 3];
  }

  /**
   * Candidate clock tracks in one row, from its "markness" profile (1 = bar).
   * A candidate is reversed when the shorter mark comes first. With `damaged`,
   * three neighboring single cells may also have run together (a bar
   * scratched off, or a gap filled by dust).
   */
  function matchClock(marks, format, damaged) {
    const cells = codec.getFormat(format).cells;
    const rs = runs(marks);
    // Running totals of the run lengths: a window's width is one subtraction.
    const sum = new Float64Array(rs.length + 1);
    for (let i = 0; i < rs.length; i++) sum[i + 1] = sum[i] + rs[i].len;
    const found = [];
    for (const reversed of [false, true]) {
      const expected = reversed ? [...clockRuns(format)].reverse() : clockRuns(format);
      const first = expected[0];
      const last = expected[expected.length - 1];
      for (const size of damaged ? [expected.length, expected.length - 2] : [expected.length]) {
        for (let i = 0; i + size <= rs.length; i++) {
          if (!rs[i].on) continue;
          const unit = (sum[i + size] - sum[i]) / cells;
          if (unit < 1.5) continue;
          // The two end marks are in every pattern: if they alone miss, so does the window.
          const a = rs[i].len / unit - first;
          const b = rs[i + size - 1].len / unit - last;
          if (a * a + b * b >= 1.5) continue;
          const window = rs.slice(i, i + size);
          // Undamaged, the runs follow the pattern; damaged, one run in the
          // single cells is three cells long.
          const patterns = size === expected.length ? [expected] : [];
          for (let k = 1; size < expected.length && k + 1 < size; k++) {
            if (Math.abs(window[k].len / unit - 3) < 0.7) patterns.push([...expected.slice(0, k), 3, ...expected.slice(k + 3)]);
          }
          for (const pattern of patterns) {
            let err = 0;
            for (let k = 0; k < pattern.length && err < 2; k++) {
              const d = window[k].len / unit - pattern[k];
              err += d * d;
            }
            if (err < 1.5) found.push({ x0: window[0].start, unit, reversed, err });
          }
        }
      }
    }
    return found;
  }

  function clockPattern(format, reversed) {
    const clock = codec.getFormat(format).clock;
    return reversed ? [...clock].reverse().join('') : clock;
  }

  /**
   * Gray levels of bars and gaps, from cells whose expected state is known:
   * their means at the middle cell, and with `drift` also how much each
   * changes per cell (a straight-line fit), for light that changes along the
   * film.
   */
  function calibrate(values, pattern, drift) {
    const mid = (values.length - 1) / 2;
    const fit = (want) => {
      let n = 0;
      let sx = 0;
      let sv = 0;
      let sxx = 0;
      let sxv = 0;
      for (let i = 0; i < values.length; i++) {
        if (pattern[i] !== want) continue;
        const x = i - mid;
        n++;
        sx += x;
        sv += values[i];
        sxx += x * x;
        sxv += x * values[i];
      }
      const slope = drift && n > 2 ? (n * sxv - sx * sv) / (n * sxx - sx * sx) : 0;
      return { level: (sv - slope * sx) / n, slope };
    };
    const bar = fit('1');
    const gap = fit('0');
    return { bar: bar.level, gap: gap.level, barSlope: bar.slope, gapSlope: gap.slope, mid };
  }

  /** Map gray values to 0 (gap) … 1 (bar) using a calibration. */
  function normalize(values, cal) {
    return values.map((v, i) => {
      const x = i - cal.mid;
      const gap = cal.gap + cal.gapSlope * x;
      const bar = cal.bar + cal.barSlope * x;
      return Math.min(1, Math.max(0, (v - gap) / (bar - gap)));
    });
  }

  function fitScore(norm, pattern) {
    let err = 0;
    for (let i = 0; i < norm.length; i++) err += Math.abs(norm[i] - Number(pattern[i]));
    return 1 - err / norm.length;
  }

  /** Nudge origin and cell width so the sampled cells fit the clock pattern best. */
  function refineGrid(img, y, slope, band, cand, format, minContrast, drift) {
    const cells = codec.getFormat(format).cells;
    const pattern = clockPattern(format, cand.reversed);
    let best = null;
    for (let du = -0.06; du <= 0.0601; du += 0.02) {
      for (let dx = -0.4; dx <= 0.401; dx += 0.1) {
        const unit = cand.unit * (1 + du);
        const x0 = cand.x0 + dx * unit;
        const values = sampleCells(img, y, slope, x0, unit, cells, band);
        const cal = calibrate(values, pattern, drift);
        if (Math.abs(cal.bar - cal.gap) < minContrast) continue;
        const score = fitScore(normalize(values, cal), pattern);
        if (!best || score > best.score) best = { x0, unit, cal, score };
      }
    }
    return best;
  }

  /**
   * A 31-cell clock with one gap filled can pass for the 23-cell clock: its
   * cells 21–23 then form the 3-cell end mark. It would go on with cells
   * 24–31 (01010111), while the film after a real 23-cell code is blank. How
   * well the next cells (up to 8) fit the rest of the 31-cell clock, or null
   * when fewer than 2 of them are in the image (cell 25 is the first bar).
   */
  function longTail(img, clock, band) {
    const room = clock.reversed ? clock.x0 / clock.unit : (img.width - clock.x0) / clock.unit - 23;
    const n = Math.min(8, Math.floor(room));
    if (n < 2) return null;
    const tail = codec.getFormat('long').clock.slice(23, 23 + n);
    const x = clock.reversed ? clock.x0 - n * clock.unit : clock.x0 + 23 * clock.unit;
    const values = sampleCells(img, clock.y, clock.slope, x, clock.unit, n, band);
    const cal = Object.assign({}, clock.cal, { mid: clock.cal.mid + (clock.reversed ? n : -23) });
    return fitScore(normalize(values, cal), clock.reversed ? [...tail].reverse().join('') : tail);
  }

  /**
   * Whether a 7-bar clock's end mark (cells 21–23) has a clear gap in its
   * middle on a row 30% or 40% of the way to the data track (`dataY`), where
   * the clock's single cells 6–20 still read cleanly: an 11-bar clock, cut
   * short. (Nearer the data track, its stop pattern would look the same; the
   * rows that drift there fit the single cells at 0.93 or worse in the tests,
   * those that show a cut-off clock at 0.99.)
   */
  function endMarkGap(img, clock, dataY, band) {
    const pattern = codec.getFormat('short').clock;
    const singles = pattern.slice(5, 20);
    return [0.3, 0.4].some((f) => {
      const values = sampleCells(img, clock.y + (dataY - clock.y) * f, clock.slope, clock.x0, clock.unit, 23, band);
      if (clock.reversed) values.reverse();
      const cal = calibrate(values.slice(5, 20), singles, false);
      if (!(Math.abs(cal.bar - cal.gap) > 1e-6)) return false;
      const norm = normalize(values, cal);
      return fitScore(norm.slice(5, 20), singles) >= 0.97 && norm[20] >= 0.5 && norm[21] < 0.3 && norm[22] >= 0.5;
    });
  }

  // ---- data track -------------------------------------------------------------------

  /** The share of a row's fixed cells (start, stop, unused) that read as they should. */
  function fixedFit(bits, format) {
    let ok = 0;
    let total = 0;
    for (const c of codec.layout(format)) {
      if (c.fixed === null) continue;
      total++;
      if (Number(bits[c.cell - 1]) === c.fixed) ok++;
    }
    return ok / total;
  }

  /** How much a row looks like a DX data track: fixed cells, empty unused cells, parity. */
  function dataScore(bits, format) {
    const d = codec.decode(bits, format);
    return fixedFit(bits, format) + (d.parity.ok ? 0.25 : 0) + (d.part1 > 0 ? 0.05 : 0);
  }

  function readRow(img, y, slope, band, clock) {
    const values = sampleCells(img, y, slope, clock.x0, clock.unit, clock.cells, band);
    const norm = normalize(values, clock.cal);
    const ordered = clock.reversed ? norm.reverse() : norm;
    return { norm: ordered, bits: ordered.map((v) => (v >= 0.5 ? '1' : '0')).join('') };
  }

  /**
   * Find and read one DX edge code in a grayscale image in which the film runs
   * roughly horizontally (within about ±3°). Coordinates in the result are in
   * the input image's pixels.
   */
  function readBarcode(input, options) {
    const steps = search(input, options);
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
    }
  }

  /**
   * The same, without holding up a page: every 10 ms or so the search lets
   * the browser draw and handle input. If `signal` (an AbortSignal) fires,
   * the search stops and the promise resolves to null.
   */
  async function readBarcodeAsync(input, options, signal) {
    const steps = search(input, options);
    let since = -Infinity; // the caller has just been busy too (reading the pixels): give way at once
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
      if (performance.now() - since > 10) {
        await giveWay();
        if (signal && signal.aborted) return null;
        since = performance.now();
      }
    }
  }

  /** A turn for whatever else is waiting (unlike setTimeout, with no minimum delay). */
  function giveWay() {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }

  /** The search behind readBarcode, as a generator that pauses (yields) between rows. */
  function* search(input, options) {
    const opts = Object.assign({ formats: ['long', 'short'], maxSide: 1600 }, options);
    yield;
    const { img, scale } = shrink(input, opts.maxSide);
    yield;
    const [p2, p98] = percentiles(img.data, [0.02, 0.98]);
    const range = p98 - p2;
    // Flatter than the faintest bars the second look below accepts (6 levels):
    // a tight box around a faded code can be this flat and still read.
    if (range < 6) return { found: false, reason: 'flat' };
    // A code as printed first. Only if no clock track turns up, a second look
    // for a faded or damaged one, so that a code that reads at once reads the
    // same way it always did.
    // The rows' gray values are the same on both looks: kept for the second.
    const profiles = new Map();
    const first = yield* look(img, scale, opts, { minContrast: Math.max(10, range * 0.12), weak: false, profiles });
    if (first.found || first.reason !== 'no-clock') return first;
    return yield* look(img, scale, opts, { minContrast: Math.max(6, range * 0.05), weak: true, profiles });
  }

  /**
   * One look for a code. `weak`: bars fainter than the perforations and the
   * film around them would suggest, light that changes along the row, and one
   * clock run damaged.
   */
  function* look(img, scale, opts, { minContrast, weak, profiles }) {
    // Average three rows when scanning (enough against grain, thin enough for
    // small codes), and on tall images look at every other row.
    const band = 1;
    const step = img.height > 400 ? 2 : 1;
    // For light that changes along the row: each pixel against the darkest and
    // lightest within an eighth of the width on either side.
    const around = Math.max(16, Math.round(img.width / 8));
    const marks = new Float32Array(img.width); // one row's, filled anew for each

    // The best clock match for each slope, and each row's best score there.
    // A tall clock track fits slightly tilted lines too, and one of them can
    // score a hair better than the true angle, so the slope chosen is the one
    // at which the most rows match nearly as well as the best: the clock track
    // is thickest along its true direction.
    const bySlope = SLOPES.map(() => ({ best: null, rows: new Map() }));
    for (const [si, slope] of SLOPES.entries()) {
      for (let y = 1; y < img.height - 1; y += step) {
        yield;
        const key = si * img.height + y;
        let kept = profiles.get(key);
        if (!kept) {
          const values = profile(img, y, slope, band);
          const [lo, hi] = percentiles(values, [0.05, 0.95]);
          kept = { values, lo, hi };
          profiles.set(key, kept);
        }
        const { values: row, lo, hi } = kept;
        if (hi - lo < minContrast) continue;
        const near = weak ? { lo: envelope(row, around, 1), hi: envelope(row, around, -1) } : null;
        for (const polarity of ['dark', 'light']) {
          // How much each pixel looks like a bar (1) or a gap (0).
          for (let x = 0; x < row.length; x++) {
            const v = row[x];
            if (near) {
              const span = Math.max(near.hi[x] - near.lo[x], minContrast);
              marks[x] = (polarity === 'dark' ? near.hi[x] - v : v - near.lo[x]) / span;
            } else {
              marks[x] = (polarity === 'dark' ? hi - v : v - lo) / (hi - lo);
            }
          }
          for (const format of opts.formats) {
            for (const cand of matchClock(marks, format, weak)) {
              const grid = refineGrid(img, y, slope, band, cand, format, minContrast, weak);
              if (!grid) continue;
              const score = grid.score - cand.err * 0.02;
              const at = bySlope[si];
              at.rows.set(y, Math.max(at.rows.get(y) || 0, score));
              // Prefer the long layout on ties: its clock contains the short one's pattern.
              const best = at.best;
              if (!best || score > best.score + 1e-6 || (score > best.score - 1e-6 && format === 'long' && best.format === 'short')) {
                at.best = { score, y, slope, format, reversed: cand.reversed, x0: grid.x0, unit: grid.unit, cal: grid.cal,
                  cells: codec.getFormat(format).cells, polarity: grid.cal.bar < grid.cal.gap ? 'dark' : 'light' };
              }
            }
          }
        }
      }
    }
    const top = Math.max(...bySlope.map((at) => (at.best ? at.best.score : -Infinity)));
    let best = null;
    let thickest = -1;
    for (const at of bySlope) { // flattest first, so ties keep the flatter slope
      if (!at.best) continue;
      let rows = 0;
      for (const score of at.rows.values()) if (score >= top - 0.02) rows++;
      if (rows > thickest) { thickest = rows; best = at.best; }
    }
    // On the second look, chance patterns in grain fit a clock at up to about
    // 0.85; faded and damaged codes in the tests fit at 0.94 or better.
    if (!best || best.score < (weak ? 0.9 : 0.75)) return { found: false, reason: 'no-clock' };

    // A 23-cell clock that goes on as a 31-cell one is most likely a 31-cell
    // clock with a filled gap: it is read as one if its data track reads.
    // Otherwise, and where the clock runs to the edge of the image so that
    // this can't be seen, the code is read as it looks; `elevenBars` warns
    // when that reading may be an 11-bar code's, cut short.
    if (best.format === 'short' && opts.formats.includes('long')) {
      const tail = longTail(img, best, band);
      const asShort = readData(img, scale, best, weak);
      if (tail !== null && tail >= 0.75) {
        const cand = { x0: best.reversed ? best.x0 - 8 * best.unit : best.x0, unit: best.unit, reversed: best.reversed };
        const grid = refineGrid(img, best.y, best.slope, band, cand, 'long', minContrast, weak);
        const long = grid && Object.assign({}, best, { format: 'long', cells: 31, x0: grid.x0, unit: grid.unit, cal: grid.cal, score: grid.score });
        const asLong = long && readData(img, scale, long, weak);
        // A reading that passes its checks wins; if neither does, the 31-cell one.
        const valid = (r) => r && r.found && r.decoded.valid;
        const chosen = valid(asLong) || (!valid(asShort) && asLong && asLong.found) ? asLong : asShort;
        if (chosen === asShort && asShort.found) asShort.elevenBars = true;
        // Neither reads: most likely an 11-bar code, cut short or damaged.
        if (!chosen.found) return Object.assign({}, chosen, { reason: 'eleven' });
        return chosen;
      }
      // At the edge, an 11-bar code cut off after cell 23 looks like a 7-bar
      // one wherever something fills its clock gap 22: dust, or a perforation
      // that looks like a bar (on slides, and in a black scanner holder). Its
      // reading can even pass the checks, the data row drifting into the
      // clock. So the end mark is looked at again nearer the data track,
      // where perforations don't reach: a gap there warns, as does a reading
      // that fails its checks.
      if (tail === null && asShort.found
        && (!asShort.decoded.valid || endMarkGap(img, best, (asShort.dataY + 0.5) / scale.y - 0.5, band))) {
        asShort.elevenBars = true;
      }
      // A box that cuts off an 11-bar code's entry mark can leave a clock
      // that fits the 7-bar one poorly (0.88–0.92), a few cells into the box.
      // A 7-bar code whose clock fits that poorly, through blur, noise or
      // tiny cells, shows more of the film before it in a whole photo (19
      // cells or more in the tests).
      const head = best.reversed ? (img.width - best.x0) / best.unit - 23 : best.x0 / best.unit;
      if (asShort.found && best.score < 0.95 && head < 10) asShort.elevenBars = true;
      return asShort;
    }
    return readData(img, scale, best, weak);
  }

  /** Read the data track along the clock track found (`best`), and decide whether the reading can be offered. */
  function readData(img, scale, best, weak) {
    // The data track touches the clock track, above or below it. A single row
    // on the border between the tracks can read a wrong bar that happens to
    // pass parity, so prefer bits that at least half a cell's height of rows
    // agree on (falling back to the best row when no bits are that stable).
    const reach = Math.ceil(best.unit * 6);
    const rows = [];
    for (let y = Math.max(0, best.y - reach); y <= Math.min(img.height - 1, best.y + reach); y++) {
      if (Math.abs(y - best.y) < best.unit * 0.5) continue;
      const row = readRow(img, y, best.slope, 0, best);
      const contrast = row.norm.reduce((s, v) => s + Math.abs(v - 0.5), 0) / row.norm.length;
      rows.push({ y, score: dataScore(row.bits, best.format) + contrast * 0.3, bits: row.bits });
    }
    const support = new Map();
    for (const r of rows) support.set(r.bits, (support.get(r.bits) || 0) + 1);
    const stable = Math.max(2, best.unit * 0.5);
    let data = null;
    for (const r of rows) {
      // Blank film agrees with itself too, so only rows with most fixed cells
      // right count: a blank row gets 7 of 12, a scratched stop bar 11.
      if (fixedFit(r.bits, best.format) >= 0.75 && support.get(r.bits) >= stable && (!data || r.score > data.score)) data = r;
    }
    const agreed = Boolean(data);
    if (!data) for (const r of rows) if (!data || r.score > data.score) data = r;
    if (!data || data.score < 1.05) return Object.assign({ found: false, reason: 'no-data' }, describe(best, scale));

    // Read across the middle of the band of rows that give the same bits.
    const side = Math.sign(data.y - best.y);
    const same = (y) => y >= 0 && y < img.height && Math.sign(y - best.y) === side &&
      Math.abs(y - best.y) >= best.unit * 0.5 && readRow(img, y, best.slope, 0, best).bits === data.bits;
    let y0 = data.y;
    let y1 = data.y;
    while (same(y0 - 1)) y0--;
    while (same(y1 + 1)) y1++;
    const mid = (y0 + y1) / 2;
    const row = readRow(img, mid, best.slope, Math.floor((y1 - y0) / 4), best);
    const margin = row.norm.reduce((m, v) => Math.min(m, Math.abs(v - 0.5)), 0.5);
    // 0: some cell sits right on the bar/gap threshold; 1: every cell is clear-cut.
    const confidence = Math.round(margin * 200) / 100;
    const decoded = codec.decode(row.bits, best.format);
    // A code that fails its checks with blurred cells, a less than clean clock
    // match, or bits that no band of rows agrees on is more likely a stray
    // pattern (say, a code tilted beyond the search range, read across both
    // tracks) than a misread code, so it is not offered as a result. Genuine
    // reads, damaged ones included, fit the clock at 0.98 or better in the
    // tests; the stray matches seen fit at 0.92–0.95.
    if (!decoded.valid && (!agreed || confidence < 0.3 || best.score < 0.97)) {
      return Object.assign({ found: false, reason: 'unclear' }, describe(best, scale));
    }
    // From the second look, only readings that pass their checks, with
    // clear-cut cells. A code tilted past the search range can fit the
    // clock well there and give a stray reading that fails them; chance
    // patterns that pass them have cells near the threshold (0.26 or less in
    // the tests).
    if (weak && (!decoded.valid || confidence < 0.3)) return Object.assign({ found: false, reason: 'unclear' }, describe(best, scale));

    return Object.assign(describe(best, scale), {
      found: true,
      weak, // found on the second look: faint, damaged or unevenly lit
      dataY: back(mid, scale.y),
      bits: row.bits,
      decoded,
      confidence,
      values: row.norm,
    });
  }

  /** A position in the shrunk image, back in the input's pixels (see shrink). */
  const back = (v, s) => (v + 0.5) * s - 0.5;

  function describe(best, scale) {
    return {
      format: best.format,
      reversed: best.reversed,
      polarity: best.polarity,
      slope: (best.slope * scale.y) / scale.x,
      clockY: back(best.y, scale.y),
      x0: back(best.x0, scale.x),
      unit: best.unit * scale.x,
      cells: best.cells,
      clockScore: Math.round(best.score * 1000) / 1000,
    };
  }

  // ---- synthetic film edges ---------------------------------------------------------

  // 3×5 pixel font for printed edge labels.
  const GLYPHS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
    4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010',
    8: '111101111101111', 9: '111101111001111', A: '010101111101101', X: '101101010101101',
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Film geometry in cells (1 cell = 0.408 mm), as on the Kodak negative of
  // research/05 and in GB/T 9185-2003 Tables 1 and 2: codes every 19 mm, four
  // perforations of 4.75 mm; both tracks 2.525 cells tall, the smallest equal
  // height the standard allows (Table 1, T3), the data track along the film
  // edge; perforations 4.85 × 6.85 cells, their lower edge 4.95 cells from the
  // film edge (so they cut the top of the clock track), one starting 2.32 cells
  // before each code. Printed numbers: a whole frame 3.4 cells tall (0.68 per
  // font pixel), an A position 2 cells (0.4).
  const GEOMETRY = {
    pitch: 46.56, clock: 2.525, data: 2.525,
    perfPitch: 11.64, perfW: 4.85, perfH: 6.85, perfR: 1.2, perfEdge: 4.95, perfShift: -2.32,
    glyphWhole: 0.68, glyphHalf: 0.4,
  };

  /**
   * Draw a stretch of film edge carrying a DX code, with neighboring codes,
   * printed labels and perforations. Returns ink (bars, labels) and hole
   * (perforations, space beyond the film) coverage per pixel, and the true bits
   * of the code in the middle.
   */
  function synthesize(options) {
    const o = Object.assign({
      part1: 79, part2: 15, frame: 23, half: false, format: 'long',
      module: 8, angle: 0, mirrored: false, upsideDown: false, width: null, height: null,
      // Track heights in cells; the tests also draw other heights the standard allows.
      clockHeight: GEOMETRY.clock, dataHeight: GEOMETRY.data,
    }, options);
    const g = GEOMETRY;
    const fmt = codec.getFormat(o.format);
    const cells = fmt.cells;
    const width = o.width || Math.round(o.module * 62);
    const height = o.height || Math.round(o.module * 14);
    const filmW = width / o.module;
    const filmH = height / o.module;
    const codeX = (filmW - cells) / 2;
    const clockTop = filmH * 0.42;
    const dataTop = clockTop + o.clockHeight;
    const edge = dataTop + o.dataHeight;
    const perfBottom = edge - g.perfEdge;
    const perfTop = perfBottom - g.perfH;

    const codes = new Map();
    function codeAt(k) {
      if (!codes.has(k)) {
        let idx = (o.frame * 2 + (o.half ? 1 : 0) + k) % 128; // k half-frame steps along the roll
        if (idx < 0) idx += 128;
        const frame = idx >> 1;
        const half = (idx & 1) === 1;
        codes.set(k, {
          bits: codec.encode({ part1: o.part1, part2: o.part2, frame, half }, o.format),
          label: o.format === 'long' ? codec.frameLabel(frame, half) : '',
          half,
        });
      }
      return codes.get(k);
    }

    // A printed number ends just before the code it names: a whole frame's
    // 0.6 cells above the film edge and 1.6 cells before the code; an A
    // position's higher and 2.8 cells before the code, over an arrow that runs
    // 1 cell above the edge.
    function labelInk(text, half, x, y, codeStart) {
      if (!text) return false;
      const size = half ? g.glyphHalf : g.glyphWhole;
      const right = codeStart - (half ? 2.8 : 1.6);
      const left = right - (4 * text.length - 1) * size;
      if (x < left || x >= right) return false;
      if (half) {
        const tipStart = right - 1;
        const arrowY = Math.abs(y - (edge - 1));
        if (x < tipStart ? arrowY <= 0.1 : arrowY <= 0.3 * (right - x)) return true;
      }
      const bottom = edge - (half ? 2.4 : 0.6);
      const top = bottom - 5 * size;
      if (y < top || y >= bottom) return false;
      const column = Math.floor((x - left) / size);
      if (column % 4 > 2) return false;
      const glyph = GLYPHS[text[Math.floor(column / 4)]];
      const gy = Math.floor((y - top) / size);
      return Boolean(glyph) && glyph[gy * 3 + (column % 4)] === '1';
    }

    function inPerforation(x, y) {
      const px = (((x - codeX - g.perfShift) % g.perfPitch) + g.perfPitch) % g.perfPitch;
      if (px >= g.perfW || y < perfTop || y >= perfBottom) return false;
      const r = g.perfR;
      const dx = Math.max(r - px, px - (g.perfW - r), 0);
      const dy = Math.max(perfTop + r - y, y - (perfBottom - r), 0);
      return dx * dx + dy * dy <= r * r;
    }

    /** [ink, hole] at film position (x, y), in cells. */
    function at(x, y) {
      if (y >= edge || inPerforation(x, y)) return [0, 1];
      if (y < clockTop) return [0, 0];
      const k = Math.floor((x - codeX) / g.pitch);
      const start = codeX + k * g.pitch;
      const cell = Math.floor(x - start);
      if (cell < cells) return [(y < dataTop ? fmt.clock : codeAt(k).bits)[cell] === '1' ? 1 : 0, 0];
      const next = codeAt(k + 1);
      return [labelInk(next.label, next.half, x, y, start + g.pitch) ? 1 : 0, 0];
    }

    const ink = new Float32Array(width * height);
    const hole = new Float32Array(width * height);
    const cos = Math.cos((o.angle * Math.PI) / 180);
    const sin = Math.sin((o.angle * Math.PI) / 180);
    const ss = 3; // supersampling for anti-aliased edges
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let a = 0;
        let b = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const u = px + (sx + 0.5) / ss - width / 2;
            const v = py + (sy + 0.5) / ss - height / 2;
            let x = cos * u + sin * v;
            let y = -sin * u + cos * v;
            if (o.mirrored) x = -x;
            if (o.upsideDown) { x = -x; y = -y; }
            const [i, h] = at(x / o.module + filmW / 2, y / o.module + filmH / 2);
            a += i;
            b += h;
          }
        }
        ink[py * width + px] = a / (ss * ss);
        hole[py * width + px] = b / (ss * ss);
      }
    }
    return { width, height, ink, hole, truth: { bits: codeAt(0).bits, format: o.format } };
  }

  const LOOKS = {
    negative: { base: [208, 103, 46], ink: [44, 26, 20] },
    bw: { base: [196, 202, 206], ink: [36, 38, 42] },
    slide: { base: [22, 20, 22], ink: [232, 224, 205] },
  };

  /** Paint a synthetic edge as RGBA with film-like colors, grain and blur. */
  function compose(syn, options) {
    const o = Object.assign({ look: 'negative', hole: [244, 248, 250], noise: 10, blur: 1, seed: 1 }, options);
    const look = LOOKS[o.look];
    const { width, height } = syn;
    const rand = mulberry32(o.seed);
    const channels = [0, 1, 2].map((c) => {
      const out = new Float32Array(width * height);
      for (let i = 0; i < out.length; i++) {
        const v = look.base[c] + (look.ink[c] - look.base[c]) * syn.ink[i];
        out[i] = v + (o.hole[c] - v) * syn.hole[i];
      }
      if (o.blur > 0) boxBlur(out, width, height, o.blur);
      return out;
    });
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const n = (rand() + rand() + rand() - 1.5) * o.noise;
      rgba[i * 4] = channels[0][i] + n;
      rgba[i * 4 + 1] = channels[1][i] + n;
      rgba[i * 4 + 2] = channels[2][i] + n;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; }
        }
        tmp[y * w + x] = s / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; }
        }
        a[y * w + x] = s / n;
      }
    }
  }

  return { grayFromRGBA, readBarcode, readBarcodeAsync, synthesize, compose, matchClock, runs };
});
