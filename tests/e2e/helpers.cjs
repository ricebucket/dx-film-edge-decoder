const { expect } = require('@playwright/test');
const { deflateSync, inflateSync } = require('node:zlib');

/** Fail the test on any console error or uncaught exception. */
function watchConsole(page) {
  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  return () => expect(problems, problems.join('\n')).toEqual([]);
}

const dataCell = (page, n) => page.locator(`#strip .track--data [data-cell="${n}"]`);

/** Click data cells until the editable ones match `bits` (a full data-track string). */
async function setCells(page, bits) {
  for (let n = 7; n <= bits.length - 4; n++) {
    const cell = dataCell(page, n);
    const pressed = (await cell.getAttribute('aria-pressed')) === 'true';
    if (pressed !== (bits[n - 1] === '1')) await cell.click();
  }
}

/**
 * List whatever sticks out sideways: the page past the screen, or a toolbar
 * control past the panel it sits in. An empty list means everything fits.
 */
function sideOverflow(page) {
  return page.evaluate(() => {
    const out = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) out.push(`page is ${root.scrollWidth - root.clientWidth}px wider than the screen`);
    const shown = (el) => el.getClientRects().length > 0;
    for (const panel of [...document.querySelectorAll('.lighttable, .photo')].filter(shown)) {
      const edge = panel.getBoundingClientRect().right - parseFloat(getComputedStyle(panel).borderRightWidth);
      for (const el of [...panel.querySelectorAll('.toolbar__group > *, .photo__control > *')].filter(shown)) {
        const by = Math.round(el.getBoundingClientRect().right - edge);
        const name = el.textContent.trim().replace(/\s+/g, ' ') || (el.id ? `#${el.id}` : el.tagName.toLowerCase());
        if (by > 0) out.push(`"${name}" sticks out of .${panel.classList[0]} by ${by}px`);
      }
    }
    return out;
  });
}

/** Minimal RGBA → PNG encoder, so tests can upload generated photos. */
function encodePng(rgba, width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Minimal PNG → RGBA decoder for the screenshots Playwright takes (8-bit RGB
 * or RGBA, not interlaced), so tests can look at the colors drawn.
 */
function decodePng(png) {
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  for (let pos = 8; pos < png.length;) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs');
      channels = { 2: 3, 6: 4 }[data[9]];
      if (!channels) throw new Error('only RGB or RGBA PNGs');
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) rgba[(y * width + x) * 4 + k] = line[x * channels + k];
      rgba[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: rgba };
}

module.exports = { watchConsole, dataCell, setCells, sideOverflow, encodePng, decodePng };
