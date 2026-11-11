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
// It is for a change that is meant to move nothing. It reports and never
// fails.
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

/**
 * One language's snapshot. Every part is written out once, for the first
 * state on the desktop; another state lists the parts and facts that differ
 * from that one, and another screen those that differ from the desktop's
 * same state.
 */
function pageSnapshot(lang, seen, sourcePages) {
  const lines = [
    `What the page shows in "${lang}", state by state: written by \`npm run check:regressions -- --update\`, never by hand.`,
    'Every part of the page is given in full once, for the state "empty" on the desktop. Each other state lists',
    'only the parts and facts that differ from it, and each other screen what differs from the desktop in the same state.',
    'Lines that start with @ are names and tips for screen readers and pointers.',
  ];
  const first = STATES[0].name;
  for (const screen of SCREENS) {
    for (const state of STATES) {
      const now = seen[screen.name][state.name];
      if (!now) continue;
      const reference = screen.name === SCREENS[0].name ? (state.name === first ? null : seen[screen.name][first]) : seen[SCREENS[0].name][state.name];
      const block = [];
      for (const [part, text] of Object.entries(now.parts)) {
        if (reference && same(text, reference.parts[part])) continue;
        block.push(`--- ${part}`, ...text);
      }
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
function firstDifference(was, now, limit = 30) {
  const a = was.split('\n');
  const b = now.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  // The heading above, to say where.
  let heading = start;
  while (heading > 0 && !a[heading].startsWith('===')) heading--;
  const out = [`  ${a[heading] || ''}`];
  const removed = a.slice(start, a.length - end);
  const added = b.slice(start, b.length - end);
  for (const line of removed.slice(0, limit)) out.push(`- ${line}`);
  if (removed.length > limit) out.push(`- … ${removed.length - limit} more lines`);
  for (const line of added.slice(0, limit)) out.push(`+ ${line}`);
  if (added.length > limit) out.push(`+ … ${added.length - limit} more lines`);
  return out.join('\n');
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
  const dir = siteAt(commit);
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
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.find((arg, i) => !['--update', '--against'].includes(arg) && args[i - 1] !== '--against');
  if (unknown) {
    console.error(`Unknown option ${unknown}: the options are --update and --against [commit].`);
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
    console.error(`tests/regressions/${name} ${was ? 'differs from what the page gives now' : 'is missing'}:\n${firstDifference(was, text)}\n`);
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
