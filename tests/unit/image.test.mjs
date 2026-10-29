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
  test('finds the clock pattern in a clean row, either way round', () => {
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
  ['equal', { clockHeight: 2.55, dataHeight: 2.55 }],
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

  test('a blank image', () => {
    const blank = { width: 200, height: 60, data: new Float32Array(200 * 60).fill(128) };
    assert.deepEqual(image.readBarcode(blank), { found: false, reason: 'flat' });
  });

  test('random noise', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const data = Float32Array.from({ length: 300 * 80 }, () => rand() * 255);
    const r = image.readBarcode({ width: 300, height: 80, data });
    assert.equal(r.found, false);
  });

  test('film with perforations but no barcode', () => {
    const syn = image.synthesize({ part1: 79, part2: 15, frame: 23 });
    syn.ink.fill(0);
    const r = image.readBarcode(image.grayFromRGBA(image.compose(syn), syn.width, syn.height));
    assert.equal(r.found, false);
  });
});
