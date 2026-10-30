#!/usr/bin/env node
// Draw the diagrams used in the documentation (research/img/*.svg) from the
// project's own codec, so they always show the format exactly as the decoder
// reads it. Each diagram is drawn once per language in LABELS: <name>.svg in
// English and <name>.<lang>.svg in the others.
//
//   node scripts/make-figures.mjs           # write the diagrams
//   node scripts/make-figures.mjs --check   # exit 1 if any diagram is out of date

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'research', 'img');
const require = createRequire(import.meta.url);
const codec = require('../site/js/dx-codec.js');

// Labels per language. English is the source; a language added to the
// interface can add its labels here (missing ones fall back to English).
const LABELS = {
  en: {
    layoutLong: '31-cell layout: DX {dx}, frame {frame}',
    layoutShort: '23-cell layout, without a frame number: DX {dx}',
    clockTrack: 'Clock track',
    clockNote: 'the same on every film',
    dataTrack: 'Data track',
    dataNote: '1 = bar, 0 = gap',
    cellNumbers: 'Cell',
    weights: 'Weight',
    start: 'Start',
    part1: 'Part 1',
    part2: 'Part 2',
    frame: 'Frame',
    stop: 'Stop',
    legendLong: 'A = half-frame flag, P = even parity over Part 1, Part 2, the frame and A; dotted = always empty',
    legendShort: 'P = even parity over Part 1 and Part 2; dotted = always empty',
    edgeTitle: 'Where the code sits: two codes along the edge of a color negative',
    perforations: 'Perforations',
    filmEdge: 'Film edge',
    codeLength: 'one code: 31 cells, about 12.6 mm',
    repeat: 'the code repeats about every 19 mm, twice per frame',
    printedNote: 'The number printed just before a code (23, then 23A) is the frame that code carries.',
    casTitle: 'Cassette contacts (DX CAS), example: ISO 400, 36 exposures, tolerance +3/−1',
    spool: 'spool post side',
    row1: 'Row 1: ground (G) and film speed (S1–S5)',
    row2: 'Row 2: ground, length (L1–L3) and exposure tolerance (T1–T2)',
    metal: 'bare metal = 1',
    painted: 'painted = 0',
    cassetteTitle: 'The six digits of the cassette barcode: {digits}',
    prefixNote: 'first digit, chosen by the maker',
    extractNote: '16 × {part1} + {part2} = {extract}, so DX {dx}',
    exposureNote: '{digit} = {n} exposures',
  },
  'zh-CN': {
    layoutLong: '31 位条码：DX {dx}，画幅 {frame}',
    layoutShort: '23 位条码，不含画幅号：DX {dx}',
    clockTrack: '时钟道',
    clockNote: '所有胶片都相同',
    dataTrack: '数据道',
    dataNote: '1 = 条，0 = 空',
    cellNumbers: '相应位分配号',
    weights: '对应数字',
    start: '输入模式',
    part1: '第 1 部分',
    part2: '第 2 部分',
    frame: '画幅号',
    stop: '输出模式',
    legendLong: 'A = 半画幅标志，P = 奇偶检验位，使第 1 部分到 A 的条数加上 P 为偶数；虚线 = 始终为空',
    legendShort: 'P = 奇偶检验位，使第 1 部分和第 2 部分的条数加上 P 为偶数；虚线 = 始终为空',
    edgeTitle: '条码的位置：彩色负片片边上的两个条码',
    perforations: '片孔',
    filmEdge: '片边',
    codeLength: '一个条码：31 位，约 12.6 mm',
    repeat: '条码约每 19 mm 重复一次，每个画幅两次',
    printedNote: '紧挨在条码前面印的数字（先是 23，然后是 23A）就是该条码所带的画幅号。',
    casTitle: '照相机自动传感区（DX CAS），示例：ISO 400，36 张，宽容度 +3/−1',
    spool: '轴芯伸出的一端',
    row1: '第 1 行：公用接触区（G）和感光度（S1–S5）',
    row2: '第 2 行：公用接触区、可拍摄画幅数（L1–L3）和曝光宽容度（T1–T2）',
    metal: '导电区（裸露金属）= 1',
    painted: '绝缘区（涂漆）= 0',
    cassetteTitle: '暗盒条码的六位数字：{digits}',
    prefixNote: '首位数字，由制造厂自行安排',
    extractNote: '16 × {part1} + {part2} = {extract}，即 DX {dx}',
    exposureNote: '{digit} = {n} 张',
  },
};

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
// Numbers printed on film, in a bold grotesque like the page's strip.
const PRINT_FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif";
// The light-theme colors of site/css/style.css.
const C = {
  ink: '#1f2328', muted: '#59636e', rule: '#d0d7de', card: '#ffffff',
  film: '#d0672d', mark: '#2b1a14', hole: '#ffffff', grid: 'rgba(43, 26, 20, 0.22)',
  start: '#8995a1', stop: '#8995a1', blank1: '#8995a1', blank2: '#8995a1',
  part1: '#2c66cf', part2: '#8649c4', frame: '#19865a', half: '#a86400', parity: '#bd3560',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x) => (Math.round(x * 100) / 100).toString();
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));

function text(x, y, content, { size = 13, weight = 400, color = C.ink, anchor = 'start', family = null } = {}) {
  const font = family ? ` font-family="${family}"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${font}>${esc(content)}</text>`;
}
const rect = (x, y, w, h, attrs) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${attrs}/>`;
const line = (x1, y1, x2, y2, attrs) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`;

function svg(width, height, title, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<g font-family="${FONT}">`,
    rect(0.5, 0.5, width - 1, height - 1, `rx="8" fill="${C.card}" stroke="${C.rule}"`),
    ...body,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

/** Dimension line with end ticks and a label underneath. */
function dimension(x1, x2, y, label) {
  return [
    line(x1, y, x2, y, `stroke="${C.muted}" stroke-width="1"`),
    line(x1, y - 5, x1, y + 5, `stroke="${C.muted}" stroke-width="1"`),
    line(x2, y - 5, x2, y + 5, `stroke="${C.muted}" stroke-width="1"`),
    text((x1 + x2) / 2, y + 17, label, { size: 12, color: C.muted, anchor: 'middle' }),
  ];
}

/** The cells of one code: clock and data bars on the film base. */
function codeBars(format, bits, x0, clockY, dataY, cell, trackH, outlines) {
  const clock = codec.getFormat(format).clock;
  const out = [];
  for (let i = 0; i < bits.length; i++) {
    const x = x0 + i * cell;
    if (clock[i] === '1') out.push(rect(x, clockY, cell, trackH, `fill="${C.mark}"`));
    if (bits[i] === '1') out.push(rect(x, dataY, cell, trackH, `fill="${C.mark}"`));
    else if (outlines) out.push(rect(x + 0.5, dataY + 0.5, cell - 1, trackH - 1, `fill="none" stroke="${C.grid}"`));
  }
  return out;
}

// ---- the cell layout ------------------------------------------------------------------

function layoutFigure(format, code, L) {
  const fmt = codec.getFormat(format);
  const layout = codec.layout(format);
  const bits = codec.encode(code, format);
  const d = codec.decode(bits, format);
  const cell = 22;
  const trackH = 36;
  const left = 150;
  const width = left + fmt.cells * cell + 24;
  const x = (c) => left + (c - 1) * cell; // left edge of cell c
  const title = format === 'long'
    ? fill(L.layoutLong, { dx: d.dxNumber, frame: d.frameLabel })
    : fill(L.layoutShort, { dx: d.dxNumber });

  const numbersY = 58;
  const filmY = 66;
  const clockY = filmY + 6;
  const dataY = clockY + trackH;
  const filmBottom = dataY + trackH + 6;
  const weightsY = filmBottom + 16;
  const bracketY = weightsY + 10;
  const legendY = bracketY + 56;
  const height = legendY + 22;

  const body = [text(20, 30, title, { size: 15, weight: 650 })];
  body.push(text(left - 12, numbersY, L.cellNumbers, { size: 10, color: C.muted, anchor: 'end' }));
  for (const c of layout) body.push(text(x(c.cell) + cell / 2, numbersY, c.cell, { size: 10, color: C.muted, anchor: 'middle' }));
  body.push(rect(left - 10, filmY, fmt.cells * cell + 20, filmBottom - filmY, `rx="3" fill="${C.film}"`));
  body.push(...codeBars(format, bits, left, clockY, dataY, cell, trackH, true));
  body.push(text(left - 18, clockY + 16, L.clockTrack, { size: 13, weight: 600, anchor: 'end' }));
  body.push(text(left - 18, clockY + 31, L.clockNote, { size: 11, color: C.muted, anchor: 'end' }));
  body.push(text(left - 18, dataY + 16, L.dataTrack, { size: 13, weight: 600, anchor: 'end' }));
  body.push(text(left - 18, dataY + 31, L.dataNote, { size: 11, color: C.muted, anchor: 'end' }));

  body.push(text(left - 12, weightsY, L.weights, { size: 10, color: C.muted, anchor: 'end' }));
  for (const c of layout) {
    const label = c.weight ? c.weight : c.field === 'half' ? 'A' : c.field === 'parity' ? 'P' : '';
    if (label !== '') body.push(text(x(c.cell) + cell / 2, weightsY, label, { size: 10, color: C[c.field], anchor: 'middle' }));
  }

  const values = {
    start: fmt.fields[0].pattern,
    part1: d.part1,
    part2: d.part2,
    frame: d.frame === null ? '' : d.frame,
    half: d.half ? 1 : 0,
    parity: bits[fmt.fields.find((f) => f.id === 'parity').from - 1],
    stop: fmt.fields[fmt.fields.length - 1].pattern,
  };
  for (const f of fmt.fields) {
    const x1 = x(f.from) + 2;
    const x2 = x(f.to + 1) - 2;
    const blank = f.kind === 'blank';
    const stroke = `stroke="${C[f.id]}" stroke-width="2"${blank ? ' stroke-dasharray="2 3"' : ''}`;
    body.push(line(x1, bracketY, x2, bracketY, stroke));
    body.push(line(x1, bracketY - 5, x1, bracketY, stroke), line(x2, bracketY - 5, x2, bracketY, stroke));
    if (blank) continue;
    const mid = (x1 + x2) / 2;
    const name = { start: L.start, part1: L.part1, part2: L.part2, frame: L.frame, half: 'A', parity: 'P', stop: L.stop }[f.id];
    body.push(text(mid, bracketY + 17, name, { size: 12, color: C[f.id] === '#8995a1' ? C.muted : C[f.id], anchor: 'middle', weight: 600 }));
    const v = values[f.id];
    const isPattern = f.kind === 'fixed';
    body.push(text(mid, bracketY + 36, v, { size: isPattern ? 11 : 15, weight: isPattern ? 400 : 700, color: isPattern ? C.muted : C.ink, anchor: 'middle' }));
  }
  body.push(text(20, legendY, format === 'long' ? L.legendLong : L.legendShort, { size: 12, color: C.muted }));
  return svg(width, height, title, body);
}

// ---- the film edge -------------------------------------------------------------------------

function filmEdgeFigure(L) {
  // To scale, as the page's strip (research/05): 1 cell = 0.408 mm; both
  // tracks 2.525 cells tall, the data track along the film edge;
  // perforations 4.85 × 6.85 cells, 4.95 cells from the edge, every 11.64
  // cells, one starting 2.32 cells before each code; codes every 4 perforations.
  const u = 8.5; // pixels per cell
  const left = 118;
  const pitch = 4 * 11.64;
  const from = -15; // cells before the first code
  const to = pitch + 13;
  const width = Math.round(left + (to - from) * u + 20);
  const X = (cells) => left + (cells - from) * u;
  const top = 46;
  const Y = (cells) => top + cells * u;
  const edge = 9.35; // film shown from 9.35 cells above its edge
  const dataTop = edge - 2.525;
  const clockTop = edge - 5.05;
  const perfBottom = edge - 4.95;
  const codes = [{ at: 0, frame: 23, half: false }, { at: pitch, frame: 23, half: true }];

  const body = [text(20, 28, L.edgeTitle, { size: 15, weight: 650 })];
  body.push(`<clipPath id="film"><rect x="${n(X(from))}" y="${n(Y(0))}" width="${n((to - from) * u)}" height="${n(edge * u)}"/></clipPath>`);
  const film = [rect(X(from), Y(0), (to - from) * u, edge * u, `fill="${C.film}"`)];
  for (const c of codes) {
    const bits = codec.encode({ part1: 79, part2: 15, frame: c.frame, half: c.half }, 'long');
    film.push(...codeBars('long', bits, X(c.at), Y(clockTop), Y(dataTop), u, 2.525 * u, false));
    // The number printed before each code names it: a whole frame 3.4 cells
    // tall; an A position 2 cells tall, over an arrow (as on the Kodak negative).
    const label = codec.frameLabel(c.frame, c.half);
    if (c.half) {
      const size = 2.8 * u;
      const right = X(c.at - 2.8);
      const textW = [...label].reduce((w, ch) => w + (ch === 'A' ? 0.722 : ch === 'X' ? 0.667 : 0.556), 0) * size;
      film.push(text(right, Y(edge - 2.4), label, { size, weight: 700, color: C.mark, anchor: 'end', family: PRINT_FONT }));
      film.push(rect(right - textW, Y(edge - 1.1), textW - u, 0.2 * u, `fill="${C.mark}"`));
      film.push(`<path d="M${n(right - u)} ${n(Y(edge - 1.3))} L${n(right)} ${n(Y(edge - 1))} L${n(right - u)} ${n(Y(edge - 0.7))} Z" fill="${C.mark}"/>`);
    } else {
      film.push(text(X(c.at - 1.6), Y(edge - 0.6), label, { size: 4.75 * u, weight: 700, color: C.mark, anchor: 'end', family: PRINT_FONT }));
    }
  }
  // Drawn over the code, which they cut where the clock track reaches past them.
  for (let k = -2; k < 7; k++) {
    film.push(rect(X(-2.32 + k * 11.64), Y(perfBottom - 6.85), 4.85 * u, 6.85 * u, `rx="${n(1.2 * u)}" fill="${C.hole}"`));
  }
  body.push(`<g clip-path="url(#film)">${film.join('')}</g>`);
  // Soft ends, so the strip reads as a piece of a longer film.
  body.push(`<defs><linearGradient id="fadeL"><stop offset="0" stop-color="${C.card}"/><stop offset="1" stop-color="${C.card}" stop-opacity="0"/></linearGradient><linearGradient id="fadeR"><stop offset="0" stop-color="${C.card}" stop-opacity="0"/><stop offset="1" stop-color="${C.card}"/></linearGradient></defs>`);
  body.push(rect(X(from), Y(0), 3 * u, edge * u, 'fill="url(#fadeL)"'), rect(X(to) - 3 * u, Y(0), 3 * u, edge * u, 'fill="url(#fadeR)"'));

  const labels = [
    [perfBottom / 2, L.perforations],
    [clockTop + 1.275, L.clockTrack],
    [dataTop + 1.275, L.dataTrack],
    [edge, L.filmEdge],
  ];
  for (const [cy, label] of labels) {
    body.push(text(left - 16, Y(cy) + (cy === edge ? 9 : 4), label, { size: 12, color: C.ink, anchor: 'end' }));
    body.push(line(left - 12, Y(cy), X(from) + 2 * u, Y(cy), `stroke="${C.muted}" stroke-width="1" stroke-dasharray="2 2"`));
  }

  const dim1 = Y(edge) + 18;
  const dim2 = dim1 + 40;
  body.push(...dimension(X(0), X(31), dim1, L.codeLength));
  body.push(...dimension(X(0), X(pitch), dim2, L.repeat));
  const noteY = dim2 + 46;
  body.push(text(20, noteY, L.printedNote, { size: 12, color: C.muted }));
  return svg(width, noteY + 18, L.edgeTitle, body);
}

// ---- cassette contacts ------------------------------------------------------------------

function contactsFigure(L) {
  // ISO 400 = 00110, 36 exposures = 001, tolerance +3/−1 = 11 (research/07).
  const rows = [
    [['G', 1], ['S1', 0], ['S2', 0], ['S3', 1], ['S4', 1], ['S5', 0]],
    [['G', 1], ['L1', 0], ['L2', 0], ['L3', 1], ['T1', 1], ['T2', 1]],
  ];
  const padW = 62;
  const padH = 38;
  const gap = 8;
  const x0 = 176;
  const y0 = 58;
  const gridW = 6 * padW + 5 * gap;
  const width = x0 + gridW + 250;
  const body = [text(20, 30, L.casTitle, { size: 15, weight: 650 })];
  body.push(rect(x0 - 14, y0 - 12, gridW + 28, 2 * padH + gap + 24, `rx="6" fill="#e9ecef" stroke="${C.rule}"`));
  rows.forEach((row, r) => {
    row.forEach(([name, bit], i) => {
      const x = x0 + i * (padW + gap);
      const y = y0 + r * (padH + gap);
      body.push(rect(x, y, padW, padH, bit ? `rx="3" fill="#c3c9cf" stroke="#8b949e"` : `rx="3" fill="#2d3136" stroke="#2d3136"`));
      body.push(text(x + padW / 2, y + 17, name, { size: 12, weight: 700, color: bit ? C.ink : '#ffffff', anchor: 'middle' }));
      body.push(text(x + padW / 2, y + 31, bit, { size: 11, color: bit ? C.ink : '#ffffff', anchor: 'middle' }));
    });
  });
  const midY = y0 + padH + gap / 2;
  body.push(text(x0 - 34, midY + 4, L.spool, { size: 12, color: C.muted, anchor: 'end' }));
  body.push(line(x0 - 28, midY, x0 - 16, midY, `stroke="${C.muted}" stroke-width="1" stroke-dasharray="2 2"`));
  const lx = x0 + gridW + 30;
  body.push(rect(lx, y0 + 2, 16, 12, `rx="2" fill="#c3c9cf" stroke="#8b949e"`), text(lx + 24, y0 + 12, L.metal, { size: 12 }));
  body.push(rect(lx, y0 + 24, 16, 12, `rx="2" fill="#2d3136"`), text(lx + 24, y0 + 34, L.painted, { size: 12 }));
  const notesY = y0 + 2 * padH + gap + 40;
  body.push(text(20, notesY, L.row1, { size: 12, color: C.muted }));
  body.push(text(20, notesY + 20, L.row2, { size: 12, color: C.muted }));
  return svg(width, notesY + 36, L.casTitle, body);
}

// ---- cassette number -------------------------------------------------------------------

function cassetteFigure(L) {
  const c = codec.parseCassette('017563'); // FP4 PLUS, 24 exposures (research/03)
  const groups = [
    { digits: String(c.prefix), color: C.muted, note: L.prefixNote },
    { digits: c.extractText, color: C.part1, note: fill(L.extractNote, { part1: c.part1, part2: c.part2, extract: c.extract, dx: c.dxNumber }) },
    { digits: String(c.exposureDigit), color: C.frame, note: fill(L.exposureNote, { digit: c.exposureDigit, n: c.exposures.from }) },
  ];
  const digitW = 30;
  let x = 40;
  const y = 64;
  const body = [text(20, 30, fill(L.cassetteTitle, { digits: c.digits }), { size: 15, weight: 650 })];
  const notes = [];
  groups.forEach((g, i) => {
    const w = g.digits.length * digitW + 16;
    body.push(rect(x, y, w, 52, `rx="6" fill="none" stroke="${g.color}" stroke-width="2"`));
    body.push(text(x + w / 2, y + 37, g.digits, { size: 32, weight: 700, color: C.ink, anchor: 'middle', family: "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace" }));
    const ny = y + 52 + 24 + (groups.length - 1 - i) * 22;
    notes.push(line(x + w / 2, y + 52, x + w / 2, ny - 4, `stroke="${g.color}" stroke-width="1.5"`));
    notes.push(text(x + w / 2 + 8, ny, g.note, { size: 13, color: g.color === C.muted ? C.muted : g.color }));
    x += w + 12;
  });
  body.push(...notes);
  return svg(560, y + 52 + 24 + 2 * 22 + 22, fill(L.cassetteTitle, { digits: c.digits }), body);
}

// ---------------------------------------------------------------------------------------------

export function buildFigures() {
  const files = {};
  for (const [lang, own] of Object.entries(LABELS)) {
    const L = Object.assign({}, LABELS.en, own);
    const suffix = lang === 'en' ? '' : `.${lang}`;
    files[`layout-31${suffix}.svg`] = layoutFigure('long', { part1: 79, part2: 15, frame: 23, half: false }, L);
    files[`layout-23${suffix}.svg`] = layoutFigure('short', { part1: 79, part2: 7 }, L);
    files[`film-edge${suffix}.svg`] = filmEdgeFigure(L);
    files[`cassette-contacts${suffix}.svg`] = contactsFigure(L);
    files[`cassette-number${suffix}.svg`] = cassetteFigure(L);
  }
  return files;
}

async function main() {
  const files = buildFigures();
  if (process.argv.includes('--check')) {
    const stale = [];
    for (const [name, content] of Object.entries(files)) {
      const current = await readFile(join(OUT, name), 'utf8').catch(() => null);
      if (current !== content) stale.push(name);
    }
    if (stale.length) {
      console.error(`Out of date (run npm run figures): ${stale.join(', ')}`);
      process.exit(1);
    }
    console.log(`${Object.keys(files).length} diagrams are up to date`);
    return;
  }
  await mkdir(OUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(OUT, name), content);
  console.log(`wrote ${Object.keys(files).length} diagrams to research/img/`);
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
