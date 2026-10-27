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
 *      mark. Each row is normalised on its own, because on colour negatives
 *      the orange base sits halfway between the bars and the white holes.
 *   2. The best match fixes the cell grid. Its known bar/gap cells give the
 *      gray levels of "bar" and "gap" for this photo, in either polarity
 *      (dark bars on negatives, clear bars on slides).
 *   3. The data track is the nearby row whose cells best fit the fixed start
 *      and stop patterns and the parity rule. A reversed clock pattern means
 *      the film was mirrored or upside down; bits are read in clock order.
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

  /** Downscale by an integer factor (box filter) so the long side stays manageable. */
  function shrink(img, maxSide) {
    const factor = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxSide));
    if (factor === 1) return { img, factor };
    const width = Math.floor(img.width / factor);
    const height = Math.floor(img.height / factor);
    const data = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          const row = (y * factor + dy) * img.width + x * factor;
          for (let dx = 0; dx < factor; dx++) sum += img.data[row + dx];
        }
        data[y * width + x] = sum / (factor * factor);
      }
    }
    return { img: { width, height, data }, factor };
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

  /** Gray values along a row, slanted by `slope` around the image centre, averaged over ±band rows. */
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
   * A candidate is reversed when the shorter mark comes first.
   */
  function matchClock(marks, format) {
    const expected = clockRuns(format);
    const reversedPattern = [...expected].reverse();
    const cells = codec.getFormat(format).cells;
    const rs = runs(marks);
    const found = [];
    for (let i = 0; i + expected.length <= rs.length; i++) {
      if (!rs[i].on) continue;
      const window = rs.slice(i, i + expected.length);
      const total = window.reduce((s, r) => s + r.len, 0);
      const unit = total / cells;
      if (unit < 1.5) continue;
      for (const reversed of [false, true]) {
        const pattern = reversed ? reversedPattern : expected;
        let err = 0;
        for (let k = 0; k < pattern.length && err < 2; k++) {
          const d = window[k].len / unit - pattern[k];
          err += d * d;
        }
        if (err < 1.5) found.push({ x0: window[0].start, unit, reversed, err });
      }
    }
    return found;
  }

  function clockPattern(format, reversed) {
    const clock = codec.getFormat(format).clock;
    return reversed ? [...clock].reverse().join('') : clock;
  }

  /** Gray levels of bars and gaps, from cells whose expected state is known. */
  function calibrate(values, pattern) {
    let bar = 0;
    let gap = 0;
    let nb = 0;
    let ng = 0;
    for (let i = 0; i < values.length; i++) {
      if (pattern[i] === '1') { bar += values[i]; nb++; } else { gap += values[i]; ng++; }
    }
    return { bar: bar / nb, gap: gap / ng };
  }

  /** Map gray values to 0 (gap) … 1 (bar) using a calibration. */
  function normalise(values, cal) {
    const span = cal.bar - cal.gap;
    return values.map((v) => Math.min(1, Math.max(0, (v - cal.gap) / span)));
  }

  function fitScore(norm, pattern) {
    let err = 0;
    for (let i = 0; i < norm.length; i++) err += Math.abs(norm[i] - Number(pattern[i]));
    return 1 - err / norm.length;
  }

  /** Nudge origin and cell width so the sampled cells fit the clock pattern best. */
  function refineGrid(img, y, slope, band, cand, format, minContrast) {
    const cells = codec.getFormat(format).cells;
    const pattern = clockPattern(format, cand.reversed);
    let best = null;
    for (let du = -0.06; du <= 0.0601; du += 0.02) {
      for (let dx = -0.4; dx <= 0.401; dx += 0.1) {
        const unit = cand.unit * (1 + du);
        const x0 = cand.x0 + dx * unit;
        const values = sampleCells(img, y, slope, x0, unit, cells, band);
        const cal = calibrate(values, pattern);
        if (Math.abs(cal.bar - cal.gap) < minContrast) continue;
        const score = fitScore(normalise(values, cal), pattern);
        if (!best || score > best.score) best = { x0, unit, cal, score };
      }
    }
    return best;
  }

  // ---- data track -------------------------------------------------------------------

  /** How much a row looks like a DX data track: fixed cells, empty unused cells, parity. */
  function dataScore(bits, format) {
    let ok = 0;
    let total = 0;
    for (const c of codec.layout(format)) {
      if (c.fixed === null) continue;
      total++;
      if (Number(bits[c.cell - 1]) === c.fixed) ok++;
    }
    const d = codec.decode(bits, format);
    return ok / total + (d.parity.ok ? 0.25 : 0) + (d.part1 > 0 ? 0.05 : 0);
  }

  function readRow(img, y, slope, band, clock) {
    const values = sampleCells(img, y, slope, clock.x0, clock.unit, clock.cells, band);
    const norm = normalise(values, clock.cal);
    const ordered = clock.reversed ? norm.reverse() : norm;
    return { norm: ordered, bits: ordered.map((v) => (v >= 0.5 ? '1' : '0')).join('') };
  }

  /**
   * Find and read one DX edge code in a grayscale image in which the film runs
   * roughly horizontally (within about ±3°). Coordinates in the result are in
   * the input image's pixels.
   */
  function readBarcode(input, options) {
    const opts = Object.assign({ formats: ['long', 'short'], maxSide: 1600 }, options);
    const { img, factor } = shrink(input, opts.maxSide);
    const [p2, p98] = percentiles(img.data, [0.02, 0.98]);
    const range = p98 - p2;
    if (range < 20) return { found: false, reason: 'flat' };
    const minContrast = Math.max(10, range * 0.12);
    // Average three rows when scanning (enough against grain, thin enough for
    // small codes), and on tall images look at every other row.
    const band = 1;
    const step = img.height > 400 ? 2 : 1;

    let best = null;
    for (const slope of SLOPES) {
      for (let y = 1; y < img.height - 1; y += step) {
        const row = profile(img, y, slope, band);
        const [lo, hi] = percentiles(row, [0.05, 0.95]);
        if (hi - lo < minContrast) continue;
        for (const polarity of ['dark', 'light']) {
          const marks = row.map((v) => (polarity === 'dark' ? hi - v : v - lo) / (hi - lo));
          for (const format of opts.formats) {
            for (const cand of matchClock(marks, format)) {
              const grid = refineGrid(img, y, slope, band, cand, format, minContrast);
              if (!grid) continue;
              const score = grid.score - cand.err * 0.02;
              // Prefer the long layout on ties: its clock contains the short one's pattern.
              if (!best || score > best.score + 1e-6 || (score > best.score - 1e-6 && format === 'long' && best.format === 'short')) {
                best = { score, y, slope, format, reversed: cand.reversed, x0: grid.x0, unit: grid.unit, cal: grid.cal,
                  cells: codec.getFormat(format).cells, polarity: grid.cal.bar < grid.cal.gap ? 'dark' : 'light' };
              }
            }
          }
        }
      }
    }
    if (!best || best.score < 0.75) return { found: false, reason: 'no-clock' };

    // The data track touches the clock track, above or below it.
    const reach = Math.ceil(best.unit * 6);
    let data = null;
    for (let y = Math.max(0, best.y - reach); y <= Math.min(img.height - 1, best.y + reach); y++) {
      if (Math.abs(y - best.y) < best.unit * 0.5) continue;
      const row = readRow(img, y, best.slope, 0, best);
      const contrast = row.norm.reduce((s, v) => s + Math.abs(v - 0.5), 0) / row.norm.length;
      const score = dataScore(row.bits, best.format) + contrast * 0.3;
      if (!data || score > data.score) data = { y, score, bits: row.bits };
    }
    if (!data || data.score < 1.05) return Object.assign({ found: false, reason: 'no-data' }, describe(best, factor));

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
    // A code that fails its checks with blurred cells or a less than clean
    // clock match is more likely a stray pattern (say, a code tilted beyond
    // the search range) than a misread code, so it is not offered as a result.
    // Genuine reads, damaged ones included, fit the clock at 0.98 or better in
    // the tests; the stray matches seen fit at 0.92–0.95.
    if (!decoded.valid && (confidence < 0.3 || best.score < 0.97)) {
      return Object.assign({ found: false, reason: 'unclear' }, describe(best, factor));
    }

    return Object.assign(describe(best, factor), {
      found: true,
      dataY: mid * factor,
      bits: row.bits,
      decoded,
      confidence,
      values: row.norm,
    });
  }

  function describe(best, factor) {
    return {
      format: best.format,
      reversed: best.reversed,
      polarity: best.polarity,
      slope: best.slope,
      clockY: best.y * factor,
      x0: best.x0 * factor,
      unit: best.unit * factor,
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
    '>': '100110111110100',
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

  // Film geometry in cells (1 cell ≈ 0.41 mm): codes repeat every 19 mm,
  // perforations every 4.75 mm, each track ≈ 0.9 mm tall.
  const GEOMETRY = { pitch: 46.3, track: 2.2, perfPitch: 11.59, perfW: 6.8, perfH: 4.8, perfR: 1.1, glyph: 0.7 };

  /**
   * Draw a stretch of film edge carrying a DX code, with neighbouring codes,
   * printed labels and perforations. Returns ink (bars, labels) and hole
   * (perforations, space beyond the film) coverage per pixel, and the true bits
   * of the code in the middle.
   */
  function synthesize(options) {
    const o = Object.assign({
      part1: 79, part2: 15, frame: 23, half: false, format: 'long',
      module: 8, angle: 0, mirrored: false, upsideDown: false, width: null, height: null,
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
    const dataTop = clockTop + g.track;
    const trackEnd = dataTop + g.track;
    const edge = trackEnd + 0.7;
    const perfBottom = clockTop - 0.35;
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
        });
      }
      return codes.get(k);
    }

    // A label (arrow + frame number) ends just before the code it names.
    function labelInk(text, x, y, codeStart) {
      const glyphs = ['>', ...text];
      const step = 4 * g.glyph;
      const right = codeStart - 1.2;
      const left = right - glyphs.length * step;
      const top = clockTop + 0.4;
      if (x < left || x >= right || y < top || y >= top + 5 * g.glyph) return false;
      const gx = Math.floor(((x - left) % step) / g.glyph);
      if (gx > 2) return false;
      const glyph = GLYPHS[glyphs[Math.floor((x - left) / step)]];
      const gy = Math.floor((y - top) / g.glyph);
      return Boolean(glyph) && glyph[gy * 3 + gx] === '1';
    }

    function inPerforation(x, y) {
      const px = ((x % g.perfPitch) + g.perfPitch) % g.perfPitch;
      if (px >= g.perfW || y < perfTop || y >= perfBottom) return false;
      const r = g.perfR;
      const dx = Math.max(r - px, px - (g.perfW - r), 0);
      const dy = Math.max(perfTop + r - y, y - (perfBottom - r), 0);
      return dx * dx + dy * dy <= r * r;
    }

    /** [ink, hole] at film position (x, y), in cells. */
    function at(x, y) {
      if (y >= edge) return [0, 1];
      if (y >= clockTop && y < trackEnd) {
        const k = Math.floor((x - codeX) / g.pitch);
        const start = codeX + k * g.pitch;
        const cell = Math.floor(x - start);
        if (cell < cells) return [(y < dataTop ? fmt.clock : codeAt(k).bits)[cell] === '1' ? 1 : 0, 0];
        return [labelInk(codeAt(k + 1).label, x, y, start + g.pitch) ? 1 : 0, 0];
      }
      return [0, inPerforation(x, y) ? 1 : 0];
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

  /** Paint a synthetic edge as RGBA with film-like colours, grain and blur. */
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

  return { grayFromRGBA, readBarcode, synthesize, compose, matchClock, runs };
});
