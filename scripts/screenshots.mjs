#!/usr/bin/env node
// Take the screenshots used in the documentation, once per interface
// language: `npm run screenshots`. Run it after every visible change to
// site/, and look at the results before committing them.
//
// English images are saved as <name>.png, other languages as
// <name>.<lang>.png (for example screenshot.zh-CN.png), so the documents in
// each language can show the interface in that language.
//
// Needs Playwright with Chromium, installed outside this repository; see
// scripts/run-e2e.mjs.

import { readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'site', 'index.html')).href;
const WIDTH = 1120;

/** A region of the page around an element, at most `maxHeight` tall. */
async function region(page, selector, { above = 16, maxHeight = 832 } = {}) {
  const box = await page.locator(selector).boundingBox(); // relative to the viewport
  const y = Math.max(0, box.y + (await page.evaluate(() => window.scrollY)) - above);
  return { x: 0, y, width: WIDTH, height: Math.min(maxHeight, box.height + above + 16) };
}

// `communityData`: the picture shows Big Film Database entries, so REUSE.toml
// puts it under CC BY-SA 4.0 (a unit test checks that the two agree).
export const SHOTS = [
  {
    // The README's main picture: the strip and the decoded result.
    file: '.github/screenshot',
    query: '?dx=96-12/14A',
    communityData: true,
    clip: (page) => region(page, '#lighttable', { above: 16, maxHeight: 832 }).then((r) => ({ ...r, height: 832 })),
  },
  {
    // Report 05: the photo reader, after reading the first sample.
    file: 'research/img/photo-reader',
    query: '',
    async prepare(page) {
      await page.locator('#tab-photo').click();
      await page.locator('#photo .photo__drop .tool:not(.tool--primary)').click();
      await page.locator('.photo__found').waitFor();
    },
    clip: (page) => region(page, '#photo', { above: 8, maxHeight: 900 }),
  },
  {
    // Report 04: a film known only from the community database.
    file: 'research/img/community-result',
    query: '?dx=95-13/1',
    communityData: true,
    clip: (page) => region(page, '#result', { above: 8, maxHeight: 760 }),
  },
];

async function languages() {
  const files = await readdir(join(ROOT, 'site', 'js', 'i18n'));
  return ['en', ...files.filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort()];
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    for (const lang of await languages()) {
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: 900 },
        colorScheme: 'light',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      await context.addInitScript((code) => {
        try { localStorage.setItem('dx-lang', code); } catch (e) { /* file:// without storage */ }
      }, lang);
      for (const shot of SHOTS) {
        const page = await context.newPage();
        await page.goto(PAGE + shot.query);
        await page.locator('#result-title').waitFor();
        if (shot.prepare) await shot.prepare(page);
        const file = join(ROOT, `${shot.file}${lang === 'en' ? '' : `.${lang}`}.png`);
        await mkdir(dirname(file), { recursive: true });
        await page.screenshot({ path: file, clip: await shot.clip(page), fullPage: true });
        console.log(`wrote ${file.slice(ROOT.length + 1)}`);
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
