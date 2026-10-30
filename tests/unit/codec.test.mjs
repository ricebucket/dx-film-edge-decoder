import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ZINT_VECTORS } from './zint-vectors.mjs';

const require = createRequire(import.meta.url);
const dx = require('../../site/js/dx-codec.js');

const LONG_CLOCK = '1111101010101010101010101010111';
const SHORT_CLOCK = '11111010101010101010111';

function parseVector(input) {
  const [dxPart, framePart] = input.split('/');
  const [part1, part2] = dxPart.split('-').map(Number);
  if (framePart === undefined) return { part1, part2, format: 'short' };
  const half = framePart.endsWith('A');
  return { part1, part2, frame: parseInt(framePart, 10), half, format: 'long' };
}

describe('layouts', () => {
  test('clock patterns match the published patterns', () => {
    assert.equal(dx.FORMATS.long.clock, LONG_CLOCK);
    assert.equal(dx.FORMATS.short.clock, SHORT_CLOCK);
  });

  test('long clock has a 5-cell entry mark, 11 thin bars and a 3-cell exit mark', () => {
    const runs = LONG_CLOCK.match(/1+/g).map((r) => r.length);
    assert.deepEqual(runs, [5, ...Array(11).fill(1), 3]);
  });

  test('short clock has 7 thin bars (the "seven clock bars" of Fuji US 5,122,645)', () => {
    const runs = SHORT_CLOCK.match(/1+/g).map((r) => r.length);
    assert.deepEqual(runs, [5, ...Array(7).fill(1), 3]);
  });

  test('layout() describes every cell once, with binary weights', () => {
    for (const id of ['long', 'short']) {
      const cells = dx.layout(id);
      assert.equal(cells.length, dx.FORMATS[id].cells);
      assert.deepEqual(cells.map((c) => c.cell), cells.map((_, i) => i + 1));
      assert.equal(cells.map((c) => c.clock).join(''), dx.FORMATS[id].clock);
    }
    const long = dx.layout('long');
    assert.deepEqual(long.filter((c) => c.field === 'part1').map((c) => c.weight), [64, 32, 16, 8, 4, 2, 1]);
    assert.deepEqual(long.filter((c) => c.field === 'part2').map((c) => c.weight), [8, 4, 2, 1]);
    assert.deepEqual(long.filter((c) => c.field === 'frame').map((c) => c.weight), [32, 16, 8, 4, 2, 1]);
    assert.deepEqual(long.filter((c) => !c.editable).map((c) => c.cell), [1, 2, 3, 4, 5, 6, 28, 29, 30, 31]);
    assert.deepEqual(dx.layout('short').filter((c) => c.field === 'parity').map((c) => c.cell), [19]);
  });
});

describe('Zint reference vectors', () => {
  for (const [input, symbol] of ZINT_VECTORS) {
    test(`encodes and decodes ${input}`, () => {
      const v = parseVector(input);
      const width = dx.FORMATS[v.format].cells;
      assert.equal(symbol.length, width * 2, 'vector length');
      assert.equal(symbol.slice(0, width), dx.FORMATS[v.format].clock, 'clock row');
      const data = symbol.slice(width);
      assert.equal(dx.encode(v, v.format), data);
      const d = dx.decode(data, v.format);
      assert.equal(d.valid, true, JSON.stringify(d.issues));
      assert.equal(d.part1, v.part1);
      assert.equal(d.part2, v.part2);
      if (v.format === 'long') {
        assert.equal(d.frame, v.frame);
        assert.equal(d.half, v.half);
      } else {
        assert.equal(d.frame, null);
      }
    });
  }
});

describe('published examples', () => {
  test('Wikipedia "DX number" sample: 79-15, frame 23 (also read from a real BW400CN negative)', () => {
    // Bits as tabulated on Wikipedia, and as measured on the photo
    // "Kodak Telegraph negativ23a.jpg" by Sergio Fabris (Wikimedia Commons).
    const bits = '101010' + '1001111' + '0' + '1111' + '010111' + '0' + '0' + '1' + '0101';
    const d = dx.decode(bits, 'long');
    assert.equal(d.valid, true);
    assert.equal(d.dxNumber, '79-15');
    assert.equal(d.frameLabel, '23');
    assert.equal(d.parity.bit, 1);
    assert.equal(d.parity.ones, 13);
    assert.equal(dx.encode({ part1: 79, part2: 15, frame: 23, half: false }), bits);
  });

  test('alibosworth worked example: Portra 160, 95-14 frame 5', () => {
    const bits = '101010' + '1011111' + '0' + '1110' + '000101' + '0' + '0' + '1' + '0101';
    const d = dx.decode(bits, 'long');
    assert.equal(d.valid, true);
    assert.equal(d.dxNumber, '95-14');
    assert.equal(d.frame, 5);
    assert.equal(d.half, false);
  });

  test('merinorus.com worked example: 112-1, frame 10A', () => {
    const bits = '101010' + '1110000' + '0' + '0001' + '001010' + '1' + '0' + '1' + '0101';
    const d = dx.decode(bits, 'long');
    assert.equal(d.valid, true);
    assert.equal(d.dxNumber, '112-1');
    assert.equal(d.frameLabel, '10A');
    assert.equal(d.halfFrameIndex, 21);
  });

  test('Wikimedia "Dx-film-edge-barcode.jpg": 47-1, frame 22A round-trips', () => {
    const bits = dx.encode({ part1: 47, part2: 1, frame: 22, half: true });
    const d = dx.decode(bits);
    assert.equal(d.valid, true);
    assert.equal(d.dxNumber, '47-1');
    assert.equal(d.frameLabel, '22A');
  });

  test('aurelien.lawley.com.au example: Part 1 = 34, Part 2 = 6 → DX extract 550', () => {
    const d = dx.decode(dx.encode({ part1: 34, part2: 6 }, 'short'), 'short');
    assert.equal(d.dxExtract, 550);
    assert.deepEqual([d.part1Bits, d.part2Bits], ['0100010', '0110']);
  });
});

describe('decode diagnostics', () => {
  const good = dx.encode({ part1: 79, part2: 15, frame: 23, half: false });

  const flip = (bits, cell) =>
    bits.slice(0, cell - 1) + (bits[cell - 1] === '1' ? '0' : '1') + bits.slice(cell);

  test('a single misread payload bar breaks parity', () => {
    for (let cell = 7; cell <= 25; cell++) {
      if (cell === 14) continue;
      const d = dx.decode(flip(good, cell), 'long');
      assert.equal(d.parity.ok, false, `cell ${cell}`);
      assert.deepEqual(d.issues.map((i) => i.code), ['parity']);
    }
  });

  test('a bar in an unused cell is reported', () => {
    for (const cell of [14, 26]) {
      const d = dx.decode(flip(good, cell), 'long');
      assert.equal(d.valid, false);
      assert.deepEqual(d.issues, [{ code: 'blank', cell }]);
    }
  });

  test('broken start and stop patterns are reported', () => {
    const d = dx.decode(flip(flip(good, 3), 30), 'long');
    assert.deepEqual(d.issues.map((i) => i.code), ['start', 'stop']);
  });

  test('Part 1 = 0 is a valid DX number (GB/T 9185-2003, Table 3 and Annex A.3.1)', () => {
    const d = dx.decode(dx.encode({ part1: 0, part2: 3, frame: 1 }), 'long');
    assert.ok(d.valid);
    assert.deepEqual(d.issues, []);
  });

  test('an empty data area decodes to Part 1 = 0 with intact sentinels', () => {
    const empty = dx.layout('long').map((c) => (c.fixed === null ? '0' : c.fixed)).join('');
    const d = dx.decode(empty, 'long');
    assert.deepEqual([d.dxNumber, d.frame, d.half, d.valid], ['0-0', 0, false, true]);
  });

  test('accepts arrays of booleans and rejects bad input', () => {
    const arr = good.split('').map((c) => c === '1');
    assert.equal(dx.decode(arr).dxNumber, '79-15');
    assert.throws(() => dx.decode('101', 'long'), RangeError);
    assert.throws(() => dx.decode(good.replace('1', '2')), TypeError);
    assert.throws(() => dx.decode(good, 'medium'), RangeError);
  });

  test('nearMisses finds the original code after one misread bar', () => {
    const bad = flip(good, 10);
    const fixes = dx.nearMisses(bad, 'long');
    assert.ok(fixes.length > 0);
    assert.ok(fixes.some((f) => f.cell === 10 && f.result.dxNumber === '79-15' && f.result.frame === 23));
    for (const f of fixes) assert.equal(f.result.valid, true);
  });

  test('nearMisses never touches the fixed start/stop cells', () => {
    const fixes = dx.nearMisses(flip(good, 8), 'long');
    for (const f of fixes) assert.ok(f.cell >= 7 && f.cell <= 27, `cell ${f.cell}`);
  });
});

describe('exhaustive round trip', () => {
  test('every DX number survives encode → decode in both layouts', () => {
    for (let part1 = 0; part1 <= 127; part1++) {
      for (let part2 = 0; part2 <= 15; part2++) {
        const s = dx.decode(dx.encode({ part1, part2 }, 'short'), 'short');
        assert.ok(s.valid && s.part1 === part1 && s.part2 === part2);
        const frame = (part1 * 7 + part2) % 64;
        const half = (part1 + part2) % 2 === 1;
        const l = dx.decode(dx.encode({ part1, part2, frame, half }, 'long'), 'long');
        assert.ok(l.valid && l.part1 === part1 && l.part2 === part2 && l.frame === frame && l.half === half);
      }
    }
  });

  test('parity always makes the payload + parity bit count even', () => {
    for (let frame = 0; frame < 64; frame++) {
      const bits = dx.encode({ part1: 109, part2: 9, frame, half: frame % 3 === 0 });
      const ones = (bits.slice(6, 13) + bits.slice(14, 25) + bits[26]).split('1').length - 1;
      assert.equal(ones % 2, 0);
    }
  });

  test('encode validates ranges', () => {
    assert.throws(() => dx.encode({ part1: 128, part2: 0 }), RangeError);
    assert.throws(() => dx.encode({ part1: 1, part2: 16 }), RangeError);
    assert.throws(() => dx.encode({ part1: 1, part2: 0, frame: 64 }), RangeError);
    assert.throws(() => dx.encode({ part1: 1.5, part2: 0 }), RangeError);
  });
});

describe('frame numbers', () => {
  test('labels follow the printed sequence XX, XA … 00, 00A, 0, 0A, 1 … 60A (GB/T 9185-2003, Table 5)', () => {
    const seq = [[61, false], [61, true], [62, false], [62, true], [63, false], [63, true], [0, false], [0, true], [1, false], [36, true], [60, true]];
    assert.deepEqual(seq.map(([f, h]) => dx.frameLabel(f, h)), ['XX', 'XXA', 'X', 'XA', '00', '00A', '0', '0A', '1', '36A', '60A']);
  });

  test('alternative labels documented by Zint', () => {
    assert.deepEqual(dx.frameAliases(62, false), ['S']);
    assert.deepEqual(dx.frameAliases(63, true), ['KA']);
    assert.deepEqual(dx.frameAliases(0, false), ['F']);
    assert.deepEqual(dx.frameAliases(5, false), []);
    assert.deepEqual(dx.frameAliases(61, false), []);
  });

  test('parseFrameLabel understands printed labels', () => {
    const cases = {
      '23': [23, false], '23a': [23, true], ' 7A ': [7, true], XX: [61, false], xxa: [61, true], X: [62, false], xa: [62, true],
      S: [62, false], '00': [63, false], '00A': [63, true], K: [63, false], F: [0, false],
      FA: [0, true], '0': [0, false], '0A': [0, true], '60A': [60, true],
    };
    for (const [input, [frame, half]] of Object.entries(cases)) {
      assert.deepEqual(dx.parseFrameLabel(input), { frame, half }, input);
    }
    // Printed numbers end at 60A: 61 to 63 are printed XX, X and 00.
    for (const bad of ['', 'A', '61', '62', '63A', '64', '123', '2B', 'XXX', null]) assert.equal(dx.parseFrameLabel(bad), null, String(bad));
    // Full-width, as a Chinese input method may type it.
    assert.deepEqual(dx.parseFrameLabel('２３Ａ'), { frame: 23, half: true });
    // As the standard prints the X labels (GB/T 9185-2003, Table 5).
    assert.deepEqual(dx.parseFrameLabel('\u00D7'), { frame: 62, half: false });
    assert.deepEqual(dx.parseFrameLabel('\u00D7\u00D7A'), { frame: 61, half: true });
  });

  test('half-frame index counts 0, 0A, 1, 1A … as 0, 1, 2, 3 …', () => {
    assert.equal(dx.halfFrameIndex(0, false), 0);
    assert.equal(dx.halfFrameIndex(0, true), 1);
    assert.equal(dx.halfFrameIndex(1, false), 2);
    assert.equal(dx.halfFrameIndex(36, true), 73);
    assert.equal(dx.halfFrameIndex(60, true), 121);
    assert.equal(dx.halfFrameIndex(61, false), null);
    assert.equal(dx.halfFrameIndex(62, false), null);
    assert.equal(dx.halfFrameIndex(63, true), null);
  });
});

describe('DX numbers and cassette codes', () => {
  test('parseDxNumber accepts the usual spellings', () => {
    assert.deepEqual(dx.parseDxNumber('79-15'), { part1: 79, part2: 15, kind: 'parts' });
    assert.deepEqual(dx.parseDxNumber(' 79 – 15 '), { part1: 79, part2: 15, kind: 'parts' });
    assert.deepEqual(dx.parseDxNumber('115/4'), { part1: 115, part2: 4, kind: 'parts' });
    assert.equal(dx.parseDxNumber('1279').part1, 79);
    assert.equal(dx.parseDxNumber('1279').part2, 15);
    assert.equal(dx.parseDxNumber('550').part1, 34); // Lawley's 16 × 34 + 6
    assert.deepEqual(dx.parseDxNumber('0079'), { part1: 4, part2: 15, kind: 'extract', extract: 79 });
    const c = dx.parseDxNumber('315223');
    assert.equal(c.kind, 'cassette');
    assert.equal(`${c.part1}-${c.part2}`, '95-2');
    for (const bad of ['128-0', '79-16', '2048', 'abc', '', '12345', '1-2-3']) {
      assert.equal(dx.parseDxNumber(bad), null, bad);
    }
    // Full-width, as a Chinese input method may type it.
    assert.deepEqual(dx.parseDxNumber('７９－１５'), { part1: 79, part2: 15, kind: 'parts' });
    assert.equal(dx.parseDxNumber('３１５２２３').kind, 'cassette');
  });

  test('parseDxNumber also reads "DX" in front, leading zeros and other dashes', () => {
    const parts = { part1: 79, part2: 15, kind: 'parts' };
    // As the page itself writes numbers; a run of dashes, as a Chinese input
    // method types "——"; the hyphen, non-breaking hyphen and minus signs.
    for (const q of ['DX 79-15', 'dx79-15', 'DX-79-15', '0079-15', '79——15', '79\u201015', '79\u201115', '79\u221215']) {
      assert.deepEqual(dx.parseDxNumber(q), parts, q);
    }
    // Four digits and two, split by a hyphen: Part 1 with zeros, not cassette 011201.
    assert.deepEqual(dx.parseDxNumber('0112-01'), { part1: 112, part2: 1, kind: 'parts' });
    // Parts out of range can still be a cassette number written with a hyphen, or any dash.
    assert.equal(dx.parseDxNumber('0127-94').kind, 'cassette');
    assert.equal(dx.parseCassette('0127\u201394').dxNumber, '79-15');
    // Long input is refused at once (no backtracking over the spaces).
    const started = Date.now();
    assert.equal(dx.parseDxNumber(`79${' '.repeat(50000)}x`), null);
    assert.ok(Date.now() - started < 100);
  });

  test('parseDxNumber does not read a lone Part 1 as an extract', () => {
    // "79" is more likely Part 1 of 79-15 than the extract of DX 4-15.
    for (const short of ['79', '109', '127', '5']) assert.equal(dx.parseDxNumber(short), null, short);
    assert.equal(dx.parseDxNumber('128').part1, 8, 'above 127 it can only be an extract');
  });

  test('dxExtract follows the 16 × Part 1 + Part 2 rule (Kodak US 5,761,558: 83-2 → 1330)', () => {
    assert.equal(dx.dxExtract(83, 2), 1330);
    assert.equal(dx.dxExtract(115, 4), 1844);
  });

  test('cassette barcodes from Wikipedia and merinorus.com', () => {
    const kodak = dx.parseCassette('315223');
    assert.deepEqual(
      [kodak.prefix, kodak.extract, kodak.dxNumber, kodak.exposures, kodak.augmented, kodak.valid],
      [3, 1522, '95-2', { from: 24, to: 24 }, null, true]
    );
    const ilford = dx.parseCassette('017563');
    assert.deepEqual([ilford.dxNumber, ilford.exposures], ['109-12', { from: 24, to: 24 }]);
    const gold = dx.parseCassette('4 1250 3');
    assert.deepEqual([gold.prefix, gold.dxNumber], [4, '78-2']);
    assert.equal(dx.parseCassette('018500').dxNumber, '115-10');
  });

  test('the last digit gives the exposures of GB/T 9185-2003 Table 9, with the 1994 meaning where it differs', () => {
    const exposures = (digit) => dx.parseCassette(`01279${digit}`).exposures;
    assert.deepEqual(exposures(0), { from: 1, to: 8, before2000: 72 });
    assert.deepEqual(exposures(2), { from: 18, to: 23, before2000: 20 });
    assert.deepEqual(exposures(4), { from: 36, to: 36 });
    assert.deepEqual(exposures(7), { from: 25, to: 29, before2000: 'other' });
    assert.deepEqual(exposures(9), { from: 37, to: null, before2000: null });
    for (let digit = 0; digit <= 9; digit++) assert.deepEqual(dx.parseCassette(`01279${digit}`).issues, [], String(digit));
  });

  test('middle digits from 2048 to 8191 are augmented numbers, with no DX number derived (GB/T 9185-2003, Annex A.4)', () => {
    // The standard adds 128, 256 or 384 to Part 1 but says nothing about Part 2.
    const augmented = dx.parseCassette('832973');
    assert.deepEqual([augmented.dxNumber, augmented.part1, augmented.valid], [null, null, true]);
    assert.deepEqual(augmented.augmented, { part1: 206, part2: 1, basePart1: 78, added: 128 });
    assert.deepEqual(dx.parseCassette('081919').augmented, { part1: 511, part2: 15, basePart1: 127, added: 384 });
    const beyond = dx.parseCassette('081920');
    assert.equal(beyond.dxNumber, null);
    assert.deepEqual(beyond.issues, [{ code: 'extract-range', extract: 8192 }]);
    assert.equal(dx.parseCassette('000108').dxNumber, '0-10');
    assert.equal(dx.parseCassette('12345'), null);
  });
});

describe('helpers', () => {
  test('every 23-cell code copied into the 31-cell strip reads as frame 10 or 42 of the same film', () => {
    // As copied into the long strip: the 23 cells as seen, then empty cells
    // 24–27, with the long layout's own stop pattern drawn at 28–31.
    for (let part1 = 0; part1 <= 127; part1++) {
      for (let part2 = 0; part2 <= 15; part2++) {
        const short = dx.encode({ part1, part2 }, 'short');
        const copied = short + '0000' + '0101';
        const d = dx.decode(copied, 'long');
        assert.ok(d.valid && d.part1 === part1 && d.part2 === part2 && !d.half && [10, 42].includes(d.frame));
        assert.equal(dx.shortCodeInLong(copied), short);
      }
    }
  });

  test('shortCodeInLong only flags whole frame 10 or 42', () => {
    for (const [part1, part2, expected] of [[79, 7, 10], [79, 15, 42]]) {
      const flagged = [];
      for (let frame = 0; frame < 64; frame++) {
        for (const half of [false, true]) {
          if (dx.shortCodeInLong(dx.encode({ part1, part2, frame, half }))) flagged.push([frame, half]);
        }
      }
      assert.deepEqual(flagged, [[expected, false]], `${part1}-${part2}`);
    }
    const good = dx.encode({ part1: 79, part2: 15, frame: 23 });
    assert.equal(dx.shortCodeInLong(good.slice(0, 9) + '0' + good.slice(10)), null, 'misread long code');
    assert.equal(dx.shortCodeInLong(dx.encode({ part1: 79, part2: 7 }, 'short')), null, 'wrong length');
  });

  test('transplant keeps cells 1–18 and never invents parity', () => {
    const long = dx.encode({ part1: 79, part2: 15, frame: 23 }, 'long');
    const short = dx.transplant(long, 'long', 'short');
    assert.equal(short.slice(0, 18), long.slice(0, 18));
    assert.equal(short.slice(18), '0' + '0101');
    const back = dx.transplant(short, 'short', 'long');
    assert.equal(back.slice(0, 18), long.slice(0, 18));
    assert.equal(back.slice(18), '000000' + '0' + '0' + '0' + '0101');
    // A damaged start pattern is restored, since those cells cannot be edited.
    assert.equal(dx.transplant('0' + long.slice(1), 'long', 'short').slice(0, 6), '101010');
  });
});

describe('cassette barcode (GB/T 9185-2003 §9)', () => {
  test('six digits in Interleaved 2 of 5 always take 63 narrow units, 20.79 mm at 0.33 mm', () => {
    for (const digits of ['017563', '000000', '999999', '315223']) {
      assert.equal(dx.cassetteBars(digits).reduce((a, b) => a + b, 0), 63, digits);
    }
    assert.equal(dx.cassetteBars('12345'), null);
    assert.equal(dx.cassetteBars('12345a'), null);
  });

  test('read back by the weights 1, 2, 4, 7 and parity, the bars give the digits again', () => {
    const WEIGHTS = [1, 2, 4, 7, 0];
    const digit = (widths) => {
      assert.equal(widths.filter((w) => w === 3).length, 2, 'two wide elements of five');
      const sum = widths.reduce((total, w, i) => total + (w === 3 ? WEIGHTS[i] : 0), 0);
      return sum === 11 ? 0 : sum;
    };
    // Between them, these put every digit in the bars and every digit in the spaces.
    for (const digits of ['091827', '364554', '637281', '901756', '017563']) {
      const bars = dx.cassetteBars(digits);
      assert.deepEqual(bars.slice(0, 4), [1, 1, 1, 1], 'start');
      assert.deepEqual(bars.slice(-3), [3, 1, 1], 'stop');
      let read = '';
      for (let p = 0; p < 3; p++) {
        const pair = bars.slice(4 + 10 * p, 14 + 10 * p);
        read += digit(pair.filter((_, i) => i % 2 === 0)) + '' + digit(pair.filter((_, i) => i % 2 === 1));
      }
      assert.equal(read, digits);
    }
  });
});
