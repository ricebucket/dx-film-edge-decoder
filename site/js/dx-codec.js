/*
 * DX film edge barcode codec — pure functions, no DOM.
 *
 * The DX edge code is a latent-image barcode exposed along the bottom edge of
 * 35 mm film, below the sprocket holes. It has two touching tracks:
 *   - the clock track (upper, next to the perforations): a fixed timing pattern;
 *   - the data track (lower, along the film edge): film identity + frame number.
 *
 * Two layouts exist:
 *   - "long"  (31 cells): adds a frame number and half-frame flag
 *                         (Kodak, US patent 4,965,628, 1990);
 *   - "short" (23 cells): the original 1983 layout, film identity only.
 *
 * Cells are numbered from 1 in reading order (the wide clock mark comes first).
 *
 * Sources: ISO 1007 §6.1 as summarised on Wikipedia ("DX number"), Kodak US
 * 4,965,628, zxing-cpp ODDXFilmEdgeReader.cpp, Zint dxfilmedge.c. See
 * docs/dx-edge-code-format.md for the full write-up.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.DX = root.DX || {}).codec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const START = '101010';
  const STOP = '0101';

  // kind: fixed = identical on every film; number = binary, MSB first;
  // flag = single bit; blank = unassigned, always empty; parity = even parity.
  const FORMATS = {
    long: {
      id: 'long',
      cells: 31,
      clock: '1111101010101010101010101010111',
      fields: [
        { id: 'start', kind: 'fixed', from: 1, to: 6, pattern: START },
        { id: 'part1', kind: 'number', from: 7, to: 13 },
        { id: 'blank1', kind: 'blank', from: 14, to: 14 },
        { id: 'part2', kind: 'number', from: 15, to: 18 },
        { id: 'frame', kind: 'number', from: 19, to: 24 },
        { id: 'half', kind: 'flag', from: 25, to: 25 },
        { id: 'blank2', kind: 'blank', from: 26, to: 26 },
        { id: 'parity', kind: 'parity', from: 27, to: 27 },
        { id: 'stop', kind: 'fixed', from: 28, to: 31, pattern: STOP },
      ],
    },
    short: {
      id: 'short',
      cells: 23,
      clock: '11111010101010101010111',
      fields: [
        { id: 'start', kind: 'fixed', from: 1, to: 6, pattern: START },
        { id: 'part1', kind: 'number', from: 7, to: 13 },
        { id: 'blank1', kind: 'blank', from: 14, to: 14 },
        { id: 'part2', kind: 'number', from: 15, to: 18 },
        { id: 'parity', kind: 'parity', from: 19, to: 19 },
        { id: 'stop', kind: 'fixed', from: 20, to: 23, pattern: STOP },
      ],
    },
  };

  // Fields that carry payload; parity is even over exactly these bits.
  const PAYLOAD = ['part1', 'part2', 'frame', 'half'];

  // Frame-number values with special printed labels. Kodak rolls run
  // X, XA, 00, 00A, 0, 0A, 1, 1A …; X and 00 are encoded as 62 and 63.
  // Zint documents S/K/F as alternative labels for 62/63/0.
  const SPECIAL_FRAMES = {
    62: { label: 'X', aliases: ['S'] },
    63: { label: '00', aliases: ['K'] },
    0: { label: '0', aliases: ['F'] },
  };

  // Last digit of the 6-digit cassette barcode (ANSI/NAPM IT1.14:1994 table,
  // as quoted on Wikipedia "DX number").
  const EXPOSURE_CODES = { 0: 72, 1: 12, 2: 20, 3: 24, 4: 36, 5: 48, 6: 60, 7: 'non-standard' };

  function getFormat(formatId) {
    const format = FORMATS[formatId || 'long'];
    if (!format) throw new RangeError(`Unknown DX format "${formatId}"`);
    return format;
  }

  function field(format, id) {
    return format.fields.find((f) => f.id === id) || null;
  }

  /** Normalise a cell sequence ("1010…", [1,0,…] or [true,false,…]) to a 0/1 string. */
  function toBitString(cells) {
    if (typeof cells === 'string') {
      if (!/^[01]*$/.test(cells)) throw new TypeError('Cell string may only contain 0 and 1');
      return cells;
    }
    if (Array.isArray(cells)) return cells.map((c) => (c ? '1' : '0')).join('');
    throw new TypeError('Cells must be a 0/1 string or an array');
  }

  function slice(bits, f) {
    return bits.slice(f.from - 1, f.to);
  }

  function bitsToInt(bits) {
    return bits === '' ? 0 : parseInt(bits, 2);
  }

  function intToBits(value, width) {
    return value.toString(2).padStart(width, '0');
  }

  function countOnes(bits) {
    let n = 0;
    for (const b of bits) if (b === '1') n++;
    return n;
  }

  function dxExtract(part1, part2) {
    return part1 * 16 + part2;
  }

  function formatDxNumber(part1, part2) {
    return `${part1}-${part2}`;
  }

  function frameLabel(frame, half) {
    const special = SPECIAL_FRAMES[frame];
    const base = special ? special.label : String(frame);
    return half ? `${base}A` : base;
  }

  /** Alternative labels some films print for this position (e.g. "S" for X). */
  function frameAliases(frame, half) {
    const special = SPECIAL_FRAMES[frame];
    if (!special) return [];
    return special.aliases.map((a) => (half ? `${a}A` : a));
  }

  /**
   * Position counted in half-frame steps from frame 0 (0, 0A, 1, 1A … → 0, 1, 2, 3 …),
   * handy with half-frame cameras. Null for the leader labels X and 00.
   */
  function halfFrameIndex(frame, half) {
    if (frame === null || frame === undefined || frame >= 62) return null;
    return frame * 2 + (half ? 1 : 0);
  }

  /** Parse a printed frame label such as "23", "23A", "X", "00A" or "K". */
  function parseFrameLabel(input) {
    const text = String(input || '').trim().toUpperCase();
    const m = /^(X|S|K|F|00|\d{1,2})(A?)$/.exec(text);
    if (!m) return null;
    const half = m[2] === 'A';
    const token = m[1];
    let frame;
    if (token === 'X' || token === 'S') frame = 62;
    else if (token === 'K' || token === '00') frame = 63;
    else if (token === 'F') frame = 0;
    else frame = parseInt(token, 10);
    if (frame > 63) return null;
    return { frame, half };
  }

  /**
   * Encode film identity (and frame, for the long format) as data-track cells.
   * @returns {string} 0/1 string, one character per cell, in reading order.
   */
  function encode(values, formatId) {
    const format = getFormat(formatId);
    const { part1, part2 } = values;
    const frame = values.frame === undefined ? 0 : values.frame;
    const half = Boolean(values.half);
    checkRange('Part 1', part1, 0, 127);
    checkRange('Part 2', part2, 0, 15);
    if (format.id === 'long') checkRange('Frame number', frame, 0, 63);

    const payload = {
      part1: intToBits(part1, 7),
      part2: intToBits(part2, 4),
      frame: intToBits(frame, 6),
      half: half ? '1' : '0',
    };
    let ones = 0;
    for (const id of PAYLOAD) if (field(format, id)) ones += countOnes(payload[id]);

    return format.fields
      .map((f) => {
        if (f.kind === 'fixed') return f.pattern;
        if (f.kind === 'blank') return '0';
        if (f.kind === 'parity') return ones % 2 ? '1' : '0';
        return payload[f.id];
      })
      .join('');
  }

  function checkRange(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
    }
  }

  /**
   * Decode data-track cells. Never throws for content problems: every rule the
   * code breaks is reported in `issues` so a UI can explain it.
   */
  function decode(cells, formatId) {
    const format = getFormat(formatId);
    const bits = toBitString(cells);
    if (bits.length !== format.cells) {
      throw new RangeError(`A ${format.id} DX code has ${format.cells} cells, got ${bits.length}`);
    }
    const issues = [];
    const read = (id) => {
      const f = field(format, id);
      return f ? slice(bits, f) : null;
    };

    for (const id of ['start', 'stop']) {
      const f = field(format, id);
      const got = slice(bits, f);
      if (got !== f.pattern) issues.push({ code: id, expected: f.pattern, actual: got, cells: [f.from, f.to] });
    }

    const blanks = format.fields
      .filter((f) => f.kind === 'blank')
      .map((f) => ({ cell: f.from, ok: bits[f.from - 1] === '0' }));
    for (const b of blanks) if (!b.ok) issues.push({ code: 'blank', cell: b.cell });

    const part1Bits = read('part1');
    const part2Bits = read('part2');
    const frameBits = read('frame');
    const halfBit = read('half');
    const part1 = bitsToInt(part1Bits);
    const part2 = bitsToInt(part2Bits);
    const frame = frameBits === null ? null : bitsToInt(frameBits);
    const half = halfBit === null ? null : halfBit === '1';

    let ones = 0;
    for (const id of PAYLOAD) {
      const b = read(id);
      if (b !== null) ones += countOnes(b);
    }
    const parityField = field(format, 'parity');
    const parityBit = Number(bits[parityField.from - 1]);
    const parityExpected = ones % 2;
    const parityOk = parityBit === parityExpected;
    if (!parityOk) issues.push({ code: 'parity', cell: parityField.from, expected: parityExpected, actual: parityBit });

    if (part1 === 0) issues.push({ code: 'part1-zero' });

    const hasFrame = frame !== null;
    return {
      format: format.id,
      bits,
      part1,
      part2,
      part1Bits,
      part2Bits,
      dxNumber: formatDxNumber(part1, part2),
      dxExtract: dxExtract(part1, part2),
      frame,
      frameBits,
      half,
      frameLabel: hasFrame ? frameLabel(frame, half) : null,
      frameAliases: hasFrame ? frameAliases(frame, half) : [],
      halfFrameIndex: hasFrame ? halfFrameIndex(frame, half) : null,
      parity: { cell: parityField.from, bit: parityBit, expected: parityExpected, ok: parityOk, ones },
      blanks,
      issues,
      valid: issues.length === 0,
    };
  }

  /**
   * Single-cell corrections that turn an invalid code into a valid one —
   * useful when one bar was misread. Only data-area cells are considered.
   */
  function nearMisses(cells, formatId) {
    const format = getFormat(formatId);
    const bits = toBitString(cells);
    const out = [];
    for (const f of format.fields) {
      if (f.kind === 'fixed') continue;
      for (let cell = f.from; cell <= f.to; cell++) {
        const i = cell - 1;
        const flipped = bits.slice(0, i) + (bits[i] === '1' ? '0' : '1') + bits.slice(i + 1);
        const result = decode(flipped, format.id);
        if (result.valid) out.push({ cell, field: f.id, bits: flipped, result });
      }
    }
    return out;
  }

  /**
   * Per-cell description of a layout, for drawing and annotating the strip.
   * weight is the binary place value within a number field (e.g. 64 … 1).
   */
  function layout(formatId) {
    const format = getFormat(formatId);
    const cells = [];
    for (const f of format.fields) {
      const width = f.to - f.from + 1;
      for (let cell = f.from; cell <= f.to; cell++) {
        const offset = cell - f.from;
        cells.push({
          cell,
          field: f.id,
          kind: f.kind,
          offset,
          weight: f.kind === 'number' ? 2 ** (width - 1 - offset) : null,
          clock: Number(format.clock[cell - 1]),
          fixed: f.kind === 'fixed' ? Number(f.pattern[offset]) : f.kind === 'blank' ? 0 : null,
          editable: f.kind !== 'fixed',
        });
      }
    }
    return cells;
  }

  /**
   * Move cells entered in one layout to the other. The editable cells up to
   * cell 18 (Part 1, blank, Part 2) sit in the same place in both layouts and
   * are kept as entered; the fixed cells get the target's pattern and the rest
   * stay empty, so parity is never filled in on the user's behalf.
   */
  function transplant(cells, fromFormat, toFormat) {
    const from = getFormat(fromFormat);
    const to = getFormat(toFormat);
    const bits = toBitString(cells);
    if (bits.length !== from.cells) throw new RangeError(`Expected ${from.cells} cells, got ${bits.length}`);
    const shared = field(to, 'part2').to;
    return layout(to.id)
      .map((c) => (!c.editable ? String(c.fixed) : c.cell <= shared ? bits[c.cell - 1] : '0'))
      .join('');
  }

  /**
   * An older 23-cell code copied into the 31-cell strip: its first 23 cells
   * form a valid short code and cells 24–27 stay empty. Such a copy always
   * also reads as a valid long code of the same film, at whole frame 10 or 42
   * (the short stop pattern lands in the frame field and parity still holds),
   * so only the clock track (7 or 11 thin bars) can tell the two apart.
   * Returns the 23 cells, or null.
   */
  function shortCodeInLong(cells) {
    const bits = toBitString(cells);
    if (bits.length !== FORMATS.long.cells || bits.slice(23, 27) !== '0000') return null;
    const head = bits.slice(0, FORMATS.short.cells);
    return decode(head, 'short').valid ? head : null;
  }

  /**
   * Parse a DX number as written by people: "79-15", "79 15", a 4-digit
   * "DX extract" (16 × Part 1 + Part 2, e.g. "1279") or a 6-digit cassette
   * number ("012794"). Returns null when the input cannot be a DX number.
   */
  function parseDxNumber(input) {
    const text = String(input || '').trim();
    let m = /^(\d{1,3})\s*[-–—/.\s]\s*(\d{1,2})$/.exec(text);
    if (m) {
      const part1 = parseInt(m[1], 10);
      const part2 = parseInt(m[2], 10);
      if (part1 > 127 || part2 > 15) return null;
      return { part1, part2, kind: 'parts' };
    }
    m = /^\d{1,4}$/.exec(text);
    if (m) {
      const extract = parseInt(text, 10);
      if (extract > 2047) return null;
      return { part1: extract >> 4, part2: extract & 15, kind: 'extract', extract };
    }
    const cassette = parseCassette(text);
    if (cassette && cassette.part1 !== null) return { part1: cassette.part1, part2: cassette.part2, kind: 'cassette', cassette };
    return null;
  }

  /**
   * Parse the 6-digit number printed under the cassette barcode (PHHHHE):
   * P = maker's prefix, HHHH = 16 × Part 1 + Part 2, E = exposure code.
   */
  function parseCassette(input) {
    const digits = String(input || '').replace(/[\s-]/g, '');
    if (!/^\d{6}$/.test(digits)) return null;
    const prefix = Number(digits[0]);
    const extract = parseInt(digits.slice(1, 5), 10);
    const exposureDigit = Number(digits[5]);
    const issues = [];
    let part1 = null;
    let part2 = null;
    if (extract > 2047) issues.push({ code: 'extract-range', extract });
    else {
      part1 = extract >> 4;
      part2 = extract & 15;
      if (part1 === 0) issues.push({ code: 'part1-zero' });
    }
    const exposures = Object.prototype.hasOwnProperty.call(EXPOSURE_CODES, exposureDigit)
      ? EXPOSURE_CODES[exposureDigit]
      : null;
    if (exposures === null) issues.push({ code: 'exposure-code', digit: exposureDigit });
    return {
      digits,
      prefix,
      extract,
      extractText: digits.slice(1, 5),
      part1,
      part2,
      dxNumber: part1 === null ? null : formatDxNumber(part1, part2),
      exposureDigit,
      exposures,
      issues,
      valid: issues.length === 0,
    };
  }

  return {
    FORMATS,
    SPECIAL_FRAMES,
    EXPOSURE_CODES,
    getFormat,
    encode,
    decode,
    nearMisses,
    layout,
    transplant,
    shortCodeInLong,
    dxExtract,
    formatDxNumber,
    frameLabel,
    frameAliases,
    halfFrameIndex,
    parseFrameLabel,
    parseDxNumber,
    parseCassette,
    toBitString,
  };
});
