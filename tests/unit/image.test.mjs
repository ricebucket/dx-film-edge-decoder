import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const image = require('../../site/js/dx-image.js');
const codec = require('../../site/js/dx-codec.js');

function photo(synthOptions, composeOptions) {
  const syn = image.synthesize(synthOptions);
  const rgba = image.compose(syn, composeOptions);
  return { syn, gray: image.grayFromRGBA(rgba, syn.width, syn.height) };
}

describe('clock-track matching', () => {
  test('finds the clock pattern in a clean row, either way around', () => {
    for (const format of ['long', 'short']) {
      const clock = codec.getFormat(format).clock;
      const unit = 5;
      for (const reversed of [false, true]) {
        const bits = reversed ? [...clock].reverse().join('') : clock;
        const row = [...'0'.repeat(20), ...[...bits].flatMap((b) => Array(unit).fill(b)), ...'0'.repeat(20)].map(Number);
        const found = image.matchClock(row, format);
        assert.ok(found.some((c) => c.x0 === 20 && c.reversed === reversed && Math.abs(c.unit - unit) < 1e-9), `${format} ${reversed}`);
      }
    }
  });

  test('runs() splits a profile into marks and gaps', () => {
    assert.deepEqual(image.runs([1, 1, 0, 1]).map((r) => [r.on, r.start, r.len]), [[true, 0, 2], [false, 2, 1], [true, 3, 1]]);
  });
});

// Track heights in cells: as measured on the Kodak negative (research/05),
// equal as the page draws them, and the two limits GB/T 9185-2003 allows for
// the border between the tracks (Table 1: T2 0.75–1.26 mm, T3 at least 2.06 mm).
const TRACKS = [
  ['measured', { clockHeight: 3.15, dataHeight: 2.5 }],
  ['equal', { clockHeight: 2.525, dataHeight: 2.525 }],
  ['thinnest data track', { clockHeight: 3.21, dataHeight: 1.84 }],
  ['thickest data track', { clockHeight: 1.96, dataHeight: 3.09 }],
];

describe('reading synthetic film edges', () => {
  const cases = [
    ['color negative', { part1: 79, part2: 15, frame: 23 }, { look: 'negative' }],
    ['slide film (clear bars on black)', { part1: 32, part2: 6, frame: 5, half: true }, { look: 'slide' }],
    ['B&W, seen from the back (mirrored)', { part1: 109, part2: 9, frame: 12, mirrored: true }, { look: 'bw' }],
    ['upside down', { part1: 47, part2: 1, frame: 22, half: true, upsideDown: true }, { look: 'negative' }],
    ['tilted by 2°', { part1: 95, part2: 14, frame: 5, angle: 2 }, { look: 'negative', noise: 14 }],
    ['tilted by -2.5°', { part1: 96, part2: 9, frame: 36, half: true, angle: -2.5 }, { look: 'negative' }],
    ['small cells (4 px)', { part1: 112, part2: 1, frame: 10, half: true, module: 4 }, { look: 'negative', blur: 0 }],
    ['grainy and soft', { part1: 23, part2: 12, frame: 3, module: 7 }, { look: 'negative', noise: 22, blur: 2 }],
    ['original 23-cell layout', { part1: 40, part2: 9, format: 'short' }, { look: 'negative' }],
    ['leader position XA', { part1: 79, part2: 2, frame: 62, half: true }, { look: 'negative' }],
  ];
  for (const [tracksName, tracks] of TRACKS) {
    for (const [name, synthOptions, composeOptions] of cases) {
      test(`${name}, ${tracksName} tracks`, () => {
        const { syn, gray } = photo(Object.assign({}, synthOptions, tracks), composeOptions);
        const r = image.readBarcode(gray);
        assert.equal(r.found, true, r.reason);
        assert.equal(r.format, syn.truth.format);
        assert.equal(r.bits, syn.truth.bits);
        assert.equal(r.decoded.valid, true);
        assert.equal(r.reversed, Boolean(synthOptions.mirrored || synthOptions.upsideDown));
        assert.equal(r.polarity, composeOptions.look === 'slide' ? 'light' : 'dark');
        assert.ok(r.confidence > 0.5, `confidence ${r.confidence}`);
      });
    }
  }

  test('a large scan is downscaled and coordinates map back to it', () => {
    const { syn, gray } = photo({ part1: 115, part2: 10, frame: 7, module: 30 }, { look: 'negative' });
    assert.ok(gray.width > 1600);
    const r = image.readBarcode(gray);
    assert.equal(r.bits, syn.truth.bits);
    const codeLeft = (syn.width - 31 * 30) / 2;
    assert.ok(Math.abs(r.x0 - codeLeft) < 30 / 4, `x0 ${r.x0} vs ${codeLeft}`);
    assert.ok(Math.abs(r.unit - 30) < 0.5, `unit ${r.unit}`);
  });

  test('a scan just over the size limit keeps its detail', () => {
    // Small cells, 3 pixels wide: halving the image would leave 1.5.
    for (const width of [1600, 1601, 2000]) {
      const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 3, width, height: 42 });
      const r = image.readBarcode(image.grayFromRGBA(image.compose(syn, { look: 'negative' }), syn.width, syn.height));
      assert.equal(r.found, true, `${width}: ${r.reason}`);
      assert.equal(r.decoded.dxNumber, '79-15', String(width));
    }
  });

  test('the search can run alongside a page, with the same result, and be stopped', async () => {
    const { gray } = photo({ part1: 95, part2: 14, frame: 5, angle: 2 }, { look: 'negative', noise: 14 });
    assert.deepEqual(await image.readBarcodeAsync(gray), image.readBarcode(gray));
    const stop = new AbortController();
    const reading = image.readBarcodeAsync(gray, null, stop.signal);
    stop.abort();
    assert.equal(await reading, null);
  });

  for (const [tracksName, tracks] of TRACKS) {
    test(`a scratched-out bar is still read, and the parity check catches it, ${tracksName} tracks`, () => {
      const module = 8;
      const syn = image.synthesize(Object.assign({ part1: 79, part2: 15, frame: 23, module }, tracks));
      // Erase the data bar in cell 10 (Part 1, weight 8). The synthesizer puts
      // the clock track at 42 % of the height.
      const dataTop = syn.height * 0.42 + tracks.clockHeight * module;
      const codeLeft = (syn.width - 31 * module) / 2;
      for (let y = Math.ceil(dataTop); y < syn.height; y++) {
        for (let x = 0; x < syn.width; x++) {
          if (Math.floor((x - codeLeft) / module) === 9) syn.ink[y * syn.width + x] = 0;
        }
      }
      const r = image.readBarcode(image.grayFromRGBA(image.compose(syn, { look: 'negative' }), syn.width, syn.height));
      assert.equal(r.found, true);
      assert.equal(r.decoded.parity.ok, false);
      const fixes = codec.nearMisses(r.bits, r.format);
      assert.ok(fixes.some((f) => f.cell === 10 && f.result.dxNumber === '79-15'));
    });
  }
});

describe('worn, faded and unevenly lit codes', () => {
  const M = 8;
  const CODES = [[96, 12, 7, false], [67, 0, 42, true], [83, 6, 30, false], [17, 2, 3, false], [110, 3, 33, false]];

  /** Ink a clock cell (1-based) in or out over the track's full height. */
  function markClockCell(syn, cell, ink) {
    const left = (syn.width - 31 * M) / 2;
    const top = syn.height * 0.42;
    for (let y = Math.ceil(top * 1); y < top + 2.525 * M; y++) {
      for (let x = Math.ceil(left + (cell - 1) * M); x < left + cell * M; x++) syn.ink[y * syn.width + x] = ink;
    }
  }

  const read = (syn, composeOptions) => image.readBarcode(image.grayFromRGBA(image.compose(syn, composeOptions), syn.width, syn.height));

  test('a speck filling clock gap 22 does not turn a 31-cell code into a 23-cell one', () => {
    // Cells 21–23 then form a 3-cell mark, like the 23-cell clock's end mark.
    for (const [part1, part2, frame, half] of CODES) {
      const syn = image.synthesize({ part1, part2, frame, half, module: M });
      markClockCell(syn, 22, 1);
      const r = read(syn, { seed: 3 });
      assert.ok(!r.found || (r.format === 'long' && r.bits === syn.truth.bits), `${part1}-${part2}`);
    }
  });

  test('one clock bar scratched off or one gap filled, over the full track height, is read', () => {
    let read31 = 0;
    for (const [part1, part2, frame, half] of CODES) {
      for (const [cell, ink] of [[9, 0], [16, 1], [27, 0]]) {
        const syn = image.synthesize({ part1, part2, frame, half, module: M });
        markClockCell(syn, cell, ink);
        const r = read(syn, { seed: 5 });
        assert.ok(!r.found || r.bits === syn.truth.bits, `${part1}-${part2}, cell ${cell}`);
        if (r.found) read31++;
      }
    }
    assert.ok(read31 >= 12, `${read31} of 15 read`);
  });

  test('a faded code, and light that falls off along the film, are read on a second look', () => {
    for (const [part1, part2, frame, half] of CODES) {
      const faded = image.synthesize({ part1, part2, frame, half, module: M });
      for (let i = 0; i < faded.ink.length; i++) faded.ink[i] *= 0.1;
      const r = read(faded, { noise: 6, seed: 2 });
      assert.ok(r.found && r.weak && r.bits === faded.truth.bits, `faded ${part1}-${part2}`);

      const lit = image.synthesize({ part1, part2, frame, half, module: M });
      const rgba = image.compose(lit, { seed: 2 });
      for (let i = 0; i < lit.width * lit.height; i++) {
        const fall = 1 - 0.6 * ((i % lit.width) / (lit.width - 1));
        for (let ch = 0; ch < 3; ch++) rgba[i * 4 + ch] *= fall;
      }
      const s = image.readBarcode(image.grayFromRGBA(rgba, lit.width, lit.height));
      assert.ok(s.found && s.bits === lit.truth.bits, `uneven light ${part1}-${part2}`);
    }
  });

  test('a 23-cell code reads right up to the edge of the image, without a warning', () => {
    const { syn, gray } = photo({ part1: 79, part2: 7, format: 'short', module: M }, {});
    const left = Math.round((syn.width - 23 * M) / 2 - 3 * M);
    const crop = (after) => {
      const w = Math.round((26 + after) * M);
      const data = new Float32Array(w * gray.height);
      for (let y = 0; y < gray.height; y++) for (let x = 0; x < w; x++) data[y * w + x] = gray.data[y * gray.width + left + x];
      return image.readBarcode({ width: w, height: gray.height, data });
    };
    for (const after of [8, 2, 1, 0]) {
      const r = crop(after);
      assert.equal(r.format, 'short', `${after} cells after it`);
      assert.equal(r.decoded.dxNumber, '79-7', `${after} cells after it`);
      assert.ok(!r.elevenBars, `${after} cells after it`);
    }
  });

  test('a 23-cell code followed by marks like the rest of a 31-cell clock is still read, with a warning', () => {
    const syn = image.synthesize({ part1: 79, part2: 7, format: 'short', module: M });
    // Cells 24–31 of the 31-cell clock (01010111) inked just after the code.
    const left = (syn.width - 23 * M) / 2;
    const top = syn.height * 0.42;
    [...'01010111'].forEach((bit, i) => {
      if (bit !== '1') return;
      for (let y = Math.ceil(top); y < top + 2.525 * M; y++) {
        for (let x = Math.ceil(left + (23 + i) * M); x < left + (24 + i) * M; x++) syn.ink[y * syn.width + x] = 1;
      }
    });
    const r = read(syn, { seed: 4 });
    assert.equal(r.format, 'short');
    assert.equal(r.bits, syn.truth.bits);
    assert.equal(r.elevenBars, true);
  });

  test('an 11-bar code with dust in clock gap 22, boxed too tightly to read either way, says so', () => {
    const outcomes = [];
    for (const [part1, part2, frame, half] of [...CODES, [79, 15, 23, false]]) {
      const syn = image.synthesize({ part1, part2, frame, half, module: M });
      markClockCell(syn, 22, 1);
      const gray = image.grayFromRGBA(image.compose(syn, { seed: 6 }), syn.width, syn.height);
      // From 3 cells before the code to 3 cells after its cell 23.
      const left = Math.round((syn.width - 31 * M) / 2 - 3 * M);
      const w = Math.round(29 * M);
      const data = new Float32Array(w * gray.height);
      for (let y = 0; y < gray.height; y++) for (let x = 0; x < w; x++) data[y * w + x] = gray.data[y * gray.width + left + x];
      const r = image.readBarcode({ width: w, height: gray.height, data });
      // Read as 11 bars; or as 7 bars that happen to pass the checks, with the
      // warning; or not read, with the 11-bar advice.
      const ok = r.found
        ? (r.format === 'long' && r.bits === syn.truth.bits) || (r.format === 'short' && r.elevenBars === true)
        : r.reason === 'eleven';
      assert.ok(ok, `${part1}-${part2}: ${r.found ? r.format : r.reason}`);
      outcomes.push(r.found ? r.format : r.reason);
    }
    // 79-15 reads neither way here.
    assert.equal(outcomes[outcomes.length - 1], 'eleven');
  });

  test('on the second look, only readings that pass their checks are offered', () => {
    // Faint codes tilted beyond the search range: the second look can fit the
    // clock across both tracks and read the clock's own pattern as data.
    for (const angle of [7, 7.5, 8, -7, -7.5, -8]) {
      const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: M, angle });
      for (let i = 0; i < syn.ink.length; i++) syn.ink[i] *= 0.4;
      const r = read(syn, { seed: 1 });
      assert.ok(!r.found || !r.weak || r.decoded.valid, `angle ${angle}`);
    }
  });
});

describe('when there is nothing reliable to read', () => {
  test('a code tilted beyond the search range is not misread', () => {
    for (const [tracksName, tracks] of TRACKS) {
      for (const angle of [7, -7]) {
        const { syn, gray } = photo(Object.assign({ part1: 79, part2: 15, frame: 23, module: 8, angle }, tracks), {});
        const r = image.readBarcode(gray);
        // Taller tracks can still be read at this angle; what matters is that
        // a code is never reported wrong.
        assert.ok(!r.found || r.bits === syn.truth.bits, `${tracksName}, angle ${angle}`);
      }
    }
  });

  test('a faded code in a tight box, which no perforation makes look less flat', () => {
    // Bars 10 gray levels from the film: the whole image reads, and so must a
    // box around just the code (the tracks start at 42 % of the height and are
    // 2 × 2.525 cells tall).
    const M = 8;
    const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: M });
    for (let i = 0; i < syn.ink.length; i++) syn.ink[i] *= 0.1;
    const gray = image.grayFromRGBA(image.compose(syn, { look: 'negative', noise: 2, seed: 2 }), syn.width, syn.height);
    const top = Math.round(syn.height * 0.42) + 2;
    const bottom = Math.round(syn.height * 0.42 + 5.05 * M) - 2;
    const left = Math.round((syn.width - 31 * M) / 2) - 2 * M;
    const box = { width: 35 * M, height: bottom - top, data: new Float32Array(35 * M * (bottom - top)) };
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) box.data[y * box.width + x] = gray.data[(top + y) * gray.width + left + x];
    }
    const r = image.readBarcode(box);
    assert.ok(r.found, r.reason);
    assert.equal(r.bits, syn.truth.bits);
  });

  test('a blank image', () => {
    const blank = { width: 200, height: 60, data: new Float32Array(200 * 60).fill(128) };
    assert.deepEqual(image.readBarcode(blank), { found: false, reason: 'flat' });
  });

  test('random noise', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 40; k++) {
      // Grain around mid-gray, as strong as on the noisiest scans.
      const data = Float32Array.from({ length: 420 * 120 }, () => Math.max(0, Math.min(255, 128 + (rand() + rand() + rand() - 1.5) * 120)));
      assert.equal(image.readBarcode({ width: 420, height: 120, data }).found, false, `image ${k}`);
    }
  });

  test('film with perforations but no barcode', () => {
    const syn = image.synthesize({ part1: 79, part2: 15, frame: 23 });
    syn.ink.fill(0);
    const r = image.readBarcode(image.grayFromRGBA(image.compose(syn), syn.width, syn.height));
    assert.equal(r.found, false);
  });
});
