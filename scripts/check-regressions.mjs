#!/usr/bin/env node
// Has anything changed that was not meant to? `npm run check:regressions`
// plays the page through its main states, in every language and on three
// screen sizes, and compares what it finds with the snapshots in
// tests/regressions/:
//
//   page.<language>.txt  the words of every part of the page (with the names
//                        and tips that only screen readers and pointers get),
//                        and facts about the layout that do not depend on the
//                        fonts of the machine: whether a photo sits over its
//                        cells, whether the page scrolls sideways, which
//                        buttons show …
//   lookups.txt          what every search, DX number and cassette number
//                        finds (see scripts/lib/lookup-snapshot.mjs)
//
// A difference fails the check and is printed. One that was meant is accepted
// with `npm run check:regressions -- --update`; `git diff tests/regressions`
// then shows all of it, to read before it is committed.
//
// `npm run check:regressions -- --against [commit]` compares the working tree
// with a commit instead (the last one, if none is named): the same states,
// down to the place and size of every element, both measured on this machine.
// In place of a commit it takes a folder with a copy of the project, or of
// its site/, made before a change that is not committed. It is for a change
// that is meant to move nothing. It reports and never fails.
//
// Needs Playwright with Chromium, installed outside this repository; see
// scripts/run-e2e.mjs. The snapshots change with the film data: update them
// after `npm run update:community-data`.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';
import { lookupSnapshot } from './lib/lookup-snapshot.mjs';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOTS = join(ROOT, 'tests', 'regressions');

// Chromium only: Safari's engine has its turn in the browser tests.
const SCREENS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
// Printed pages are laid out for the paper, not the window: A4 at 96 px an inch.
const PAPER = { width: 794, height: 1123 };

const sample = async (page) => {
  await page.locator('#tab-photo').click();
  await page.locator('.photo__drop button:nth-of-type(2)').click();
  await page.locator('.photo__found').waitFor();
};
const useSample = async (page) => {
  await sample(page);
  await page.locator('.photo__result button').first().click();
  await page.locator('#strip .strip__photo:not([hidden])').waitFor();
};
// A photo of a 7-bar code, drawn by the reader's own sample maker and opened as a file would be.
const useSevenBarPhoto = async (page) => {
  await page.locator('#tab-photo').click();
  await page.locator('.photo__drop').waitFor();
  await page.evaluate(async () => {
    const reader = globalThis.DX.image;
    const drawn = reader.synthesize({ part1: 79, part2: 7, format: 'short', module: 8, angle: 1 });
    const canvas = Object.assign(document.createElement('canvas'), { width: drawn.width, height: drawn.height });
    canvas.getContext('2d').putImageData(new ImageData(reader.compose(drawn, { look: 'negative' }), drawn.width, drawn.height), 0, 0);
    const files = new DataTransfer();
    files.items.add(new File([await new Promise((done) => canvas.toBlob(done, 'image/png'))], 'edge.png', { type: 'image/png' }));
    const input = document.getElementById('photo-file');
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('.photo__found').waitFor();
  await page.locator('.photo__result button').first().click();
  await page.locator('#strip .strip__photo:not([hidden])').waitFor();
};
const find = (text) => async (page) => {
  await page.locator('#finder-q').fill(text);
  // The search waits a moment after the last key: its reply is no longer the opening one.
  await page.waitForFunction((opening) => document.getElementById('finder-help').textContent !== opening, await page.locator('#finder-help').textContent());
};
const cassette = (digits) => async (page) => {
  await page.locator('#cassette-code').fill(digits);
  await page.locator('#cassette-code').press('Enter');
  await page.locator('.cassette__result > *').first().waitFor();
};

/** The states: a name, the address the page opens at, and what is done there. */
const STATES = [
  { name: 'empty' },
  { name: 'empty, 7 thin bars', query: '?layout=23' },
  { name: 'a code', query: '?dx=79-15/23' },
  { name: 'a code with a half frame', query: '?dx=96-12/14A' },
  { name: 'a code, mirrored', query: '?dx=79-15/23', steps: (page) => page.locator('#mirror-toggle').click() },
  { name: 'a 7-bar code', steps: async (page) => { await page.locator('.examples .chip').nth(4).click(); await page.locator('#result .readout__value').first().waitFor(); } },
  { name: 'a code on slide film', query: '?dx=12-1/3', steps: (page) => page.locator('.looks button').nth(2).click() },
  { name: 'a code that fails its check', query: '?dx=79-15/23', steps: async (page) => { for (const cell of [9, 10]) await page.locator(`#strip .track--data [data-cell="${cell}"]`).click(); } },
  { name: 'the all-zero code', query: '?dx=0-0/0' },
  { name: 'a number the registry lists without a Part 2', query: '?dx=88-1/1' },
  { name: 'a film picked', query: '?dx=3-9/1', steps: async (page) => { await page.locator('#ref-part1').selectOption('3'); await page.locator('.products-table tbody tr button:not([disabled])').last().click(); } },
  { name: 'Find a film: a name', steps: find('portra') },
  { name: 'Find a film: nothing found', steps: find('zzzzqq') },
  { name: 'Find a film: a number', steps: find('79-15') },
  { name: 'Find a film: letters of another script', steps: find('彩韵200') },
  { name: 'Find a film: a film shown', steps: async (page) => { await find('hp5 plus')(page); await page.locator('.finder__item button').first().click(); } },
  { name: 'a number entered directly', steps: async (page) => { await page.locator('#direct-dx').fill('47-1'); await page.locator('#direct-frame').fill('22A'); await page.locator('.direct button').click(); } },
  { name: 'a cassette number', steps: cassette('106253') },
  { name: 'an augmented cassette number', steps: cassette('854011') },
  { name: 'a cassette number with no film', steps: cassette('004004') },
  { name: 'Read a photo', steps: async (page) => { await page.locator('#tab-photo').click(); await page.locator('.photo__drop').waitFor(); } },
  { name: 'a sample photo read', steps: sample },
  { name: 'a photo’s code used', steps: useSample },
  { name: 'a photo’s code used, back at copying', steps: async (page) => { await useSample(page); await page.locator('#tab-copy').click(); } },
  { name: 'a photo’s code used, back at copying, mirrored', steps: async (page) => { await useSample(page); await page.locator('#tab-copy').click(); await page.locator('#mirror-toggle').click(); } },
  { name: 'a 7-bar photo’s code used', steps: useSevenBarPhoto },
  { name: 'a 7-bar photo’s code used, back at copying', steps: async (page) => { await useSevenBarPhoto(page); await page.locator('#tab-copy').click(); } },
  { name: 'the code list: a Part 1 number chosen in the table', steps: (page) => page.locator('.num-chip[data-part1="109"]').click() },
  { name: 'the code list: a manufacturer and a status', steps: async (page) => { await page.locator('#ref-maker').selectOption({ index: 3 }); await page.locator('#ref-status').selectOption('gone'); } },
  { name: 'the code list: nothing matches', steps: async (page) => { await page.locator('#ref-maker').selectOption({ index: 7 }); await page.locator('#ref-status').selectOption('live'); } },
  { name: 'printed: a code', query: '?dx=79-15/23', print: true },
  { name: 'printed: a photo’s code', steps: useSample, print: true },
];

/**
 * Runs in the page: its words by part, facts about its layout and, with
 * `full`, the box of every element (for --against).
 */
function look(full) {
  const PARTS = {
    header: '.site-header',
    intro: '.intro',
    tabs: '.ways',
    'copy steps': '#way-copy',
    'photo reader': '#photo',
    toolbar: '#toolbar',
    'where the code came from': '#source',
    strip: '#strip',
    'film look': '.looks',
    hint: '#hint',
    result: '#result',
    'Find a film': '#finder',
    cassette: '#cassette',
    'How it works': '#how',
    'code list: manufacturers': '#reference-ui .table-scroll',
    'code list: filters': '#reference-ui .ref-head',
    'code list: count': '#codes p[aria-live]',
    'code list: products': '#reference-ui .table-scroll--tall',
    footer: '.site-footer',
  };
  const shown = (el) => Boolean(el) && el.getClientRects().length > 0;
  const tidy = (text) => text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const parts = {};
  for (const [name, selector] of Object.entries(PARTS)) {
    const el = document.querySelector(selector);
    if (!el) parts[name] = ['(missing)'];
    else if (!shown(el)) parts[name] = ['(not shown)'];
    else {
      // What screen readers and pointers get beside the words: names, tips and hints in boxes.
      const said = [];
      for (const node of [el, ...el.querySelectorAll('[aria-label], [title], [placeholder], [alt]')]) {
        if (!shown(node)) continue;
        for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
          const value = node.getAttribute(attribute);
          if (value) said.push(`@${attribute} ${value.replace(/\s+/g, ' ').trim()}`);
        }
      }
      parts[name] = [...tidy(el.innerText), ...said];
    }
  }

  const round = (n) => Math.round(n * 10) / 10;
  const box = (selector, root = document) => {
    const el = root.querySelector(selector);
    return shown(el) ? el.getBoundingClientRect() : null;
  };
  const facts = {};
  facts.title = document.title;
  facts.address = location.search || '(none)';
  facts['tab open'] = (document.querySelector('.ways [aria-selected="true"]') || {}).id || '(none)';
  const active = document.activeElement;
  facts.focus = !active || active === document.body ? '(nowhere)' : active.id ? `#${active.id}` : `${active.tagName.toLowerCase()}.${String(active.className).split(' ')[0]}`;
  facts['page wider than the screen by'] = `${document.documentElement.scrollWidth - document.documentElement.clientWidth} px`;
  facts['toolbar shows'] = [...document.querySelectorAll('#toolbar button')].filter(shown).map((b) => `${b.id || b.dataset.value}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}${b.disabled || b.getAttribute('aria-disabled') === 'true' ? '(off)' : ''}`).join(' ');
  // The strip: the page's own, not the diagram in "How it works".
  const strip = document.querySelector('#strip .strip');
  if (strip) {
    const scroller = strip.querySelector('.strip__scroller');
    const code = box('.film__code', strip);
    const cell = box('.track--data .cell', strip);
    facts['strip layout'] = `${strip.dataset.format}${strip.classList.contains('is-mirrored') ? ', mirrored' : ''}${scroller.scrollWidth > scroller.clientWidth + 1 ? ', scrolls sideways' : ''}`;
    facts['strip cell'] = cell ? `${round(cell.width)} px` : '(none)';
    for (const track of ['clock', 'data']) facts[`bars, ${track} track`] = [...strip.querySelectorAll(`.track--${track} .cell`)].map((c) => (c.classList.contains('is-bar') ? '1' : '0')).join('');
    const film = box('.film', strip);
    const canvas = box('.strip__canvas', strip);
    facts['strip wider than its film by'] = film && canvas ? `${round(canvas.width - film.width)} px` : '(none)';
    for (const [name, selector] of [['ruler', '.ruler__grid'], ['labels under the strip', '.annot__grid']]) {
      const grid = box(selector, strip);
      facts[`${name} against the code`] = grid && code ? `${round(grid.left - code.left)} px left, ${round(grid.width - code.width)} px wider` : '(none)';
    }
    const photo = box('.strip__photo canvas', strip);
    if (!photo || !code) facts['photo over the strip'] = '(none)';
    else {
      const words = document.createRange();
      words.selectNodeContents(strip.querySelector('.strip__photo-label'));
      const label = words.getBoundingClientRect();
      const where = label.bottom <= photo.top + 0.5 ? `above, ${round(label.left - photo.left)} px from the photo's left edge` : label.right <= photo.left + 0.5 ? 'beside, at the left' : label.left >= photo.right - 0.5 ? 'beside, at the right' : 'over the photo';
      facts['photo over the strip'] = `${round(photo.left - code.left)} px left of the code, ${round(photo.width - code.width)} px wider; label ${where}`;
    }
  }
  const drawing = document.querySelector('.cassette-figure');
  if (shown(drawing)) {
    const turn = new DOMMatrixReadOnly(getComputedStyle(drawing).transform);
    facts['cassette drawing turned'] = `${round((Math.atan2(turn.b, turn.a) * 180) / Math.PI)}°`;
  }
  facts['result lists'] = `${document.querySelectorAll('#result .match').length} films`;
  facts['Find a film lists'] = `${document.querySelectorAll('.finder__item').length} films`;
  facts['cassette helper lists'] = `${document.querySelectorAll('.cassette__result .match').length} films`;
  if (document.querySelector('#ref-maker')) {
    facts['code list'] = `${['ref-maker', 'ref-part1', 'ref-status'].map((id) => document.getElementById(id).value || 'all').join(' / ')}: ${document.querySelectorAll('.products-table tbody tr').length} rows`;
  }
  if (matchMedia('print').matches) {
    facts['printed parts left out'] = ['.site-header', '.ways', '#toolbar', '#finder', '#cassette', '#codes'].filter((s) => !shown(document.querySelector(s))).join(' ');
    const table = box('#lighttable');
    const film = strip && box('.film', strip);
    facts['printed film inside the light table'] = table && film ? `${round(film.left - table.left)} px from its left, ${round(table.right - film.right)} px from its right` : '(none)';
    const viewport = strip && strip.querySelector('.strip__viewport');
    facts['printed edge fades'] = viewport ? ['::before', '::after'].map((p) => getComputedStyle(viewport, p).display).join(' ') : '(none)';
  }

  let boxes = null;
  if (full) {
    boxes = {};
    for (const [name, selector] of Object.entries(PARTS)) {
      const root = document.querySelector(selector);
      if (!shown(root)) continue;
      const at = root.getBoundingClientRect();
      boxes[name] = [root, ...root.querySelectorAll('*')].filter((el) => !el.closest('svg') || el.tagName === 'svg').filter(shown).map((el) => {
        const r = el.getBoundingClientRect();
        const cls = typeof el.className === 'string' ? el.className : el.className.baseVal;
        return `${el.tagName.toLowerCase()}${cls ? `.${cls.trim().replace(/\s+/g, '.')}` : ''} ${Math.round((r.left - at.left) * 2) / 2},${Math.round((r.top - at.top) * 2) / 2} ${Math.round(r.width * 2) / 2}x${Math.round(r.height * 2) / 2}`;
      });
    }
  }
  return { parts, facts, boxes };
}

async function languages(site) {
  return ['en', ...readdirSync(join(site, 'js', 'i18n')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort()];
}

/** Every state of one copy of the site, as { language: { screen: { state: what `look` saw } } }. */
async function collect(site, { full = false, only = null } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const index = pathToFileURL(join(site, 'index.html')).href;
  const out = {};
  try {
    const jobs = [];
    for (const lang of await languages(site)) {
      out[lang] = {};
      for (const screen of SCREENS) {
        out[lang][screen.name] = {};
        jobs.push(async () => {
          for (const state of STATES) {
            if (only && !state.name.includes(only)) continue;
            const context = await browser.newContext({
              viewport: state.print ? PAPER : screen.viewport,
              isMobile: Boolean(screen.isMobile),
              hasTouch: Boolean(screen.hasTouch),
              colorScheme: 'light',
              reducedMotion: 'reduce',
              deviceScaleFactor: 1,
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', (err) => errors.push(err.message));
            page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
            const where = `${lang}, ${screen.name}, "${state.name}"`;
            try {
              await page.goto(`${index}${state.query || ''}${state.query ? '&' : '?'}lang=${lang}`);
              // The code list is built once the page is idle.
              await page.waitForFunction(() => document.querySelector('#reference-ui .assign-table') && !document.documentElement.hasAttribute('data-i18n-pending'));
              if (state.steps) await state.steps(page);
              if (state.print) await page.emulateMedia({ media: 'print' });
              // Let what the steps set off settle: a search, a scroll, a drawing.
              await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), 250))));
              const seen = await page.evaluate(look, full);
              if (errors.length) throw new Error(`the page reported: ${errors.join('; ')}`);
              out[lang][screen.name][state.name] = seen;
            } catch (err) {
              throw new Error(`${where}: ${err.message}`);
            } finally {
              await context.close();
            }
          }
        });
      }
    }
    await Promise.all(jobs.map((job) => job()));
  } finally {
    await browser.close();
  }
  return out;
}

/** The sources page in each language: its words. */
async function sources(site) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const out = {};
  try {
    for (const file of readdirSync(site).filter((f) => /^sources(\.[\w-]+)?\.html$/.test(f)).sort()) {
      const page = await browser.newPage({ viewport: SCREENS[0].viewport, reducedMotion: 'reduce' });
      await page.goto(pathToFileURL(join(site, file)).href);
      out[file] = (await page.evaluate(() => document.body.innerText)).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

/** What turns the lines `from` into `to`: each line taken out or put in, with its number in its own text. */
function changes(from, to) {
  // The longest run of lines the two share, by the usual table.
  const table = Array.from({ length: from.length + 1 }, () => new Uint16Array(to.length + 1));
  for (let i = from.length - 1; i >= 0; i--) {
    for (let j = to.length - 1; j >= 0; j--) table[i][j] = from[i] === to[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const out = [];
  let [i, j] = [0, 0];
  while (i < from.length || j < to.length) {
    if (i < from.length && j < to.length && from[i] === to[j]) { i++; j++; }
    else if (j < to.length && (i === from.length || table[i][j + 1] >= table[i + 1][j])) { out.push(`+${j + 1}\t${to[j]}`); j++; }
    else { out.push(`-${i + 1}\t${from[i]}`); i++; }
  }
  return out;
}

/**
 * One language's snapshot. Every part is written out in full once, for the
 * first state on the desktop. After that a part is left out where it is the
 * same as in the state it is compared with: on the desktop the first state,
 * on another screen the desktop's same state. A part that differs is given as
 * the lines that differ from the nearest of the states it could be compared
 * with, or in full where that is shorter.
 */
function pageSnapshot(lang, seen, sourcePages) {
  const lines = [
    `What the page shows in "${lang}", state by state: written by \`npm run check:regressions -- --update\`, never by hand.`,
    'Every part of the page is given in full once, for the state "empty" on the desktop. After that, a part that is',
    'not listed is the same as on the desktop in the same state (for the desktop: as in its state "empty"). A part',
    'that differs is listed with the state it is nearest to, and the lines that differ: +12 is line 12 of the part as',
    'it is, -12 is line 12 of the part in that other state. Lines that start with @ are names and tips for screen',
    'readers and pointers. Facts are listed where they differ in the same way.',
  ];
  const [desktop, first] = [SCREENS[0].name, STATES[0].name];
  for (const screen of SCREENS) {
    for (const state of STATES) {
      const now = seen[screen.name][state.name];
      if (!now) continue;
      // The states to compare with, the one whose parts go unlisted first.
      const others = [];
      if (screen.name !== desktop) others.push([`${desktop} / ${state.name}`, seen[desktop][state.name]]);
      if (state.name !== first) others.push([`${screen.name} / ${first}`, seen[screen.name][first]]);
      const block = [];
      for (const [part, text] of Object.entries(now.parts)) {
        if (!others.length) { block.push(`--- ${part}`, ...text); continue; }
        if (same(text, others[0][1].parts[part])) continue;
        const [name, differ] = others.map(([other, saw]) => [other, changes(saw.parts[part], text)]).sort((x, y) => x[1].length - y[1].length)[0];
        if (!differ.length) block.push(`--- ${part}: as in "${name}"`);
        else if (differ.length < text.length) block.push(`--- ${part}: as in "${name}", but`, ...differ);
        else block.push(`--- ${part}`, ...text);
      }
      const reference = others.length ? others[0][1] : null;
      const facts = Object.entries(now.facts).filter(([name, value]) => !reference || reference.facts[name] !== value);
      const gone = reference ? Object.keys(reference.facts).filter((name) => !(name in now.facts)) : [];
      if (facts.length || gone.length) block.push('--- facts', ...facts.map(([name, value]) => `${name}: ${value}`), ...gone.map((name) => `${name}: (does not apply)`));
      lines.push('', `=== ${screen.name} / ${state.name}`, ...(block.length ? block : ['(nothing differs)']));
    }
  }
  for (const [file, text] of Object.entries(sourcePages)) {
    const mine = file === (lang === 'en' ? 'sources.html' : `sources.${lang}.html`);
    if (mine) lines.push('', `=== ${file}`, ...text);
  }
  return `${lines.join('\n')}\n`;
}

/** The lines where two texts first differ, with what follows: enough to see what it is about. */
/** Where a snapshot differs from what it was: under each heading, the lines gone and the new ones. */
function differences(was, now, limit = 60) {
  const sections = (text) => {
    const parts = new Map([['', []]]);
    let heading = '';
    for (const line of text.split('\n')) {
      if (line.startsWith('=== ')) parts.set(heading = line, []);
      else parts.get(heading).push(line);
    }
    return parts;
  };
  const [before, after] = [sections(was), sections(now)];
  const out = [];
  let [differing, left] = [0, 0];
  for (const heading of new Set([...before.keys(), ...after.keys()])) {
    let [a, b] = [before.get(heading) || [], after.get(heading) || []];
    if (same(a, b)) continue;
    differing++;
    // Only the lines between the first and the last that differ: the table of `changes` stays small.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let end = 0;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    [a, b] = [a.slice(start, a.length - end), b.slice(start, b.length - end)];
    const lines = a.length * b.length > 2e7
      ? [...a.filter((line) => !b.includes(line)).map((line) => `-\t${line}`), ...b.filter((line) => !a.includes(line)).map((line) => `+\t${line}`)]
      : changes(a, b);
    if (before.size + after.size > 2) out.push(`  ${heading || '(above the first heading)'}`);
    for (const line of lines) {
      if (out.length > limit) { left++; continue; }
      out.push(`    ${line[0] === '-' ? 'gone:' : 'new: '} ${line.slice(line.indexOf('\t') + 1)}`);
    }
  }
  if (left) out.push(`  … and ${left} more lines`);
  const headings = Math.max(before.size, after.size) - 1;
  return `${headings ? `under ${differing} of its ${headings} headings` : `in ${out.length - (left ? 1 : 0) + left} lines`}:\n${out.join('\n')}`;
}

async function snapshots(site) {
  const [seen, sourcePages] = await Promise.all([collect(site), sources(site)]);
  const files = { 'lookups.txt': lookupSnapshot(site) };
  for (const lang of Object.keys(seen)) files[`page.${lang}.txt`] = pageSnapshot(lang, seen[lang], sourcePages);
  return files;
}

/** The site of a commit, in a temporary folder. */
function siteAt(commit) {
  const dir = mkdtempSync(join(tmpdir(), 'dx-regressions-'));
  const tar = execFileSync('git', ['archive', '--format=tar', commit, 'site'], { cwd: ROOT, maxBuffer: 1 << 30 });
  const unpack = spawnSync('tar', ['-x', '-C', dir], { input: tar });
  if (unpack.status !== 0) throw new Error(`could not unpack ${commit}: ${unpack.stderr}`);
  return dir;
}

/** What differs between a commit and the working tree, down to every element's box. */
async function against(commit) {
  // A folder with a copy of the project made earlier, in place of a commit.
  const copy = existsSync(join(commit, 'site', 'index.html'));
  const dir = copy ? commit : siteAt(commit);
  try {
    const [was, now] = [await collect(join(dir, 'site'), { full: true }), await collect(join(ROOT, 'site'), { full: true })];
    let states = 0;
    let changed = 0;
    for (const lang of Object.keys(now)) {
      for (const screen of SCREENS) {
        for (const state of STATES) {
          const [a, b] = [(was[lang] || {})[screen.name][state.name], now[lang][screen.name][state.name]];
          states++;
          const report = [];
          if (!a) report.push('  not in the commit');
          else {
            for (const part of Object.keys(b.parts)) {
              const [x, y] = [a.parts[part] || ['(missing)'], b.parts[part]];
              if (!same(x, y)) {
                const gone = x.filter((line) => !y.includes(line));
                const came = y.filter((line) => !x.includes(line));
                report.push(`  words of "${part}": ${gone.length} lines gone, ${came.length} new`, ...gone.slice(0, 3).map((line) => `    - ${line}`), ...came.slice(0, 3).map((line) => `    + ${line}`));
              }
              const [p, q] = [(a.boxes || {})[part] || [], (b.boxes || {})[part] || []];
              if (!same(p, q)) {
                const count = (list) => list.reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
                const [before, after] = [count(p), count(q)];
                const moved = q.filter((item) => (before.get(item) || 0) < after.get(item));
                const left = p.filter((item) => (after.get(item) || 0) < before.get(item));
                report.push(`  layout of "${part}": ${left.length} boxes gone or moved, ${moved.length} new`, ...left.slice(0, 2).map((item) => `    - ${item}`), ...moved.slice(0, 2).map((item) => `    + ${item}`));
              }
            }
            for (const name of new Set([...Object.keys(a.facts), ...Object.keys(b.facts)])) {
              if (a.facts[name] !== b.facts[name]) report.push(`  ${name}: ${a.facts[name]} → ${b.facts[name]}`);
            }
          }
          if (report.length) {
            changed++;
            console.log(`${lang}, ${screen.name}, "${state.name}"`);
            console.log(report.join('\n'));
          }
        }
      }
    }
    const [before, after] = [lookupSnapshot(join(dir, 'site')), lookupSnapshot(join(ROOT, 'site'))];
    const lookupsDiffer = before !== after;
    if (lookupsDiffer) {
      const old = new Set(before.split('\n'));
      const fresh = after.split('\n').filter((line) => !old.has(line));
      console.log(`lookups: ${fresh.length} lines differ`, ...fresh.slice(0, 10).map((line) => `\n  + ${line}`));
    }
    console.log(`\nAgainst ${commit}: ${changed} of ${states} page states differ; the lookups ${lookupsDiffer ? 'differ' : 'are the same'}.`);
  } finally {
    if (!copy) rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.find((arg, i) => !['--update', '--against'].includes(arg) && args[i - 1] !== '--against');
  if (unknown) {
    console.error(`Unknown option ${unknown}: the options are --update and --against [commit or folder].`);
    process.exit(1);
  }
  if (args.includes('--against')) {
    const commit = args[args.indexOf('--against') + 1];
    await against(commit && !commit.startsWith('--') ? commit : 'HEAD');
    return;
  }
  const files = await snapshots(join(ROOT, 'site'));
  if (args.includes('--update')) {
    mkdirSync(SNAPSHOTS, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      const file = join(SNAPSHOTS, name);
      const was = existsSync(file) ? readFileSync(file, 'utf8') : null;
      if (was !== text) writeFileSync(file, text);
      console.log(`${was === text ? 'unchanged' : 'wrote'} tests/regressions/${name}`);
    }
    return;
  }
  let differ = 0;
  for (const [name, text] of Object.entries(files)) {
    const file = join(SNAPSHOTS, name);
    const was = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (was === text) continue;
    differ++;
    console.error(was ? `tests/regressions/${name} differs from what the ${name === 'lookups.txt' ? 'lookups give' : 'page gives'} now, ${differences(was, text)}\n` : `tests/regressions/${name} is missing.\n`);
  }
  if (differ) {
    console.error('If these changes were meant, accept them with `npm run check:regressions -- --update` and read `git diff tests/regressions` before committing.');
    process.exit(1);
  }
  console.log(`The page and the lookups are as the snapshots in tests/regressions say (${Object.keys(files).length} files).`);
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
