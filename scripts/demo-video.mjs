#!/usr/bin/env node
// Record the demo videos, once per interface language: `npm run demo`. Like
// the screenshots (scripts/screenshots.mjs), run it after visible changes to
// what they show, and watch the results before committing them.
//
// The videos show the page in use, in about half a minute: copying the
// barcode of a black-and-white film onto the strip, one bar missed, taking
// the correction offered, then, on a fresh page, reading the sample photo of
// a color negative and using its code. The corrections and each film found
// are marked by a red box. They come in two shapes:
//
// - 1120 × 840 pixels (4:3, wide enough for the whole strip), for the
//   README: English as .github/demo.webm, other languages as
//   .github/demo.<lang>.webm, each with a poster, the corrected code and its
//   film with a play button (.github/demo.png, .github/demo.<lang>.png).
//   Playwright records these.
// - 1120 × 1680 pixels (2:3, upright): .github/demo-vertical.mp4 and
//   .github/demo-vertical.<lang>.mp4. These are the frames Chromium paints,
//   encoded as H.264 in the browser (WebCodecs) and saved by
//   scripts/lib/mp4.mjs.
//
// Needs Playwright with Chromium, installed outside this repository; see
// scripts/run-e2e.mjs. Everything is found by ids, classes, cell numbers and
// film names, never by the interface's words, so every language plays the
// same steps.

import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';
import { isMain } from './lib/main.mjs';
import { mp4 } from './lib/mp4.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'site', 'index.html')).href;
const LANDSCAPE = { width: 1120, height: 840 };
const VERTICAL = { width: 1120, height: 1680 };
const LONGEST = 60; // seconds
const LONGEST_PAUSE = 3000; // milliseconds

// The vertical video's frames per second, and its H.264 encoding: High
// profile, level 4 (up to 8192 macroblocks a frame, and 1120 × 1680 is
// 7350), with a key frame every 2 seconds.
const FPS = 30;
const H264 = { codec: 'avc1.640028', bitrate: 4_000_000, keyEvery: 2 * FPS };

// The code copied by hand, on a black-and-white film: DX 109-9, frame 12
// (Ilford HP5 PLUS). The start pattern (cells 1–6) and the stop pattern
// (28–31) are already on the strip; these are the bars in between, without
// cell 8's, which the demo misses on purpose, as if cells 7 and 8 were read
// as one wide bar. HP5 PLUS is then the one listed film a one-bar
// correction gives.
const BARS = [7, 10, 11, 13, 15, 18, 21, 22, 27];
const COPIED = { dx: '109-9', frame: '12', film: 'HP5 PLUS' }; // as the I3A list writes it, in every language
const LOOK = (value) => `[data-control="look"] [data-value="${value}"]`;

// What the videos show: the file they are saved as (without shape, language
// and extension), and the codes on the strip (the copied one, then the
// sample photo's), whose entries from The Big Film Database put them under
// CC BY-SA, as REUSE.toml says (a unit test checks).
export const DEMO = { file: '.github/demo', codes: [COPIED.dx, '96-12'] };

// How long the important moments stay on screen, in milliseconds.
const HOLD = { problem: 2500, photo: 2500, film: 3000 };

// A play button over the poster, drawn only in its screenshot.
const PLAY = 'html::after { content: ""; position: fixed; z-index: 2147483647; left: 50%; top: 50%;'
  + ' width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%;'
  + ' background: rgba(16, 24, 32, 0.62) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M9 6.5v11l9-5.5z\' fill=\'white\'/%3E%3C/svg%3E") 56% 50% / 64px no-repeat;'
  + ' box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3); }';

function wait(page, ms) {
  if (ms > LONGEST_PAUSE) throw new Error(`a pause of ${ms} ms, over ${LONGEST_PAUSE} ms`);
  return page.waitForTimeout(ms);
}

/**
 * A pointer drawn on the page, as a recording shows none: a large arrow that
 * follows the mouse, and where it presses, a ring that spreads and fades
 * around a dot.
 */
function drawPointer() {
  const show = () => {
    const pointer = document.createElement('div');
    pointer.setAttribute('aria-hidden', 'true');
    pointer.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);';
    pointer.innerHTML = '<svg width="52" height="52" viewBox="0 0 26 26" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">'
      + '<path d="M3 2 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18 15.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.append(pointer);
    addEventListener('mousemove', (e) => {
      // The arrow's tip, at (3, 2) of its drawing, drawn twice as large.
      pointer.style.transform = `translate(${e.clientX - 6}px, ${e.clientY - 4}px)`;
    }, true);
    const mark = (e, size, look, ms, scale) => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;width:${size}px;height:${size}px;`
        + `border-radius:50%;z-index:2147483646;pointer-events:none;${look}`
        + `transition:transform ${ms}ms ease-out,opacity ${ms}ms ease-in;transform:scale(.25);opacity:1;`;
      document.documentElement.append(el);
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `scale(${scale})`; el.style.opacity = '0'; }));
      setTimeout(() => el.remove(), ms + 100);
    };
    addEventListener('mousedown', (e) => {
      mark(e, 84, 'border:5px solid rgba(10,111,129,.95);background:rgba(10,111,129,.16);', 1000, 1.25);
      mark(e, 26, 'background:rgba(10,111,129,.8);', 700, 1);
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', show);
  else show();
}

/**
 * Given to the page: a red box around a part of the result, to show where to
 * look, gone at the next click. The parts are the corrections offered, and
 * the film found (its name, its first list's entries, and its DX number and
 * frame).
 */
function defineMarks() {
  const parts = {
    fixes: () => [document.querySelector('#result .fixes')],
    film: () => [
      document.getElementById('result-title'),
      document.querySelector('#result .result__main .source-block'),
      ...document.querySelectorAll('#result .readouts .readout:nth-child(-n+2)'),
    ],
  };
  window.demoParts = (name) => parts[name]().filter(Boolean);
  window.demoMark = (name) => {
    const rects = window.demoParts(name).map((el) => el.getBoundingClientRect());
    const pad = 12;
    const left = Math.min(...rects.map((r) => r.left)) - pad;
    const right = Math.max(...rects.map((r) => r.right)) + pad;
    const top = Math.min(...rects.map((r) => r.top)) - pad;
    const bottom = Math.min(Math.max(...rects.map((r) => r.bottom)) + pad, innerHeight - 6);
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:absolute;left:${left + scrollX}px;top:${top + scrollY}px;width:${right - left}px;height:${bottom - top}px;`
      + 'border:4px solid #e0262b;border-radius:12px;box-shadow:0 0 0 5px rgba(224,38,43,.16);z-index:2147483645;pointer-events:none;'
      + 'opacity:0;transform:scale(1.04);transition:opacity .4s ease-out,transform .4s ease-out;';
    document.documentElement.append(box);
    requestAnimationFrame(() => requestAnimationFrame(() => { box.style.opacity = '1'; box.style.transform = 'none'; }));
    addEventListener('mousedown', () => box.remove(), { capture: true, once: true });
  };
}

/** Moves and clicks the way a hand would: gliding there, with a moment after. */
function hand(page) {
  const size = page.viewportSize();
  const start = { x: Math.round(size.width * 0.75), y: Math.round(size.height * 0.2) }; // clear of the strip
  let at = start;
  async function glide(to, ms = 380) {
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const e = f < 0.5 ? 2 * f * f : 1 - (2 - 2 * f) ** 2 / 2; // ease in and out
      await page.mouse.move(at.x + (to.x - at.x) * e, at.y + (to.y - at.y) * e);
      await wait(page, ms / steps);
    }
    at = to;
  }
  return {
    /** Show the pointer where it starts, as on a page just opened. */
    async appear() {
      at = start;
      await page.mouse.move(at.x, at.y);
    },
    /** Scroll the page smoothly so the element's top is `top` pixels from the window's. */
    async scrollTo(locator, top = 90, ms = 900) {
      const box = await locator.boundingBox();
      await page.evaluate((by) => window.scrollBy({ top: by, behavior: 'smooth' }), box.y - top);
      await wait(page, ms);
    },
    async click(locator, { ms = 380, after = 250 } = {}) {
      let box = await locator.boundingBox();
      if (box.y < 60 || box.y + box.height > size.height - 10) {
        // Out of sight: brought into the middle of the window first.
        await page.evaluate((by) => window.scrollBy({ top: by, behavior: 'smooth' }), box.y + box.height / 2 - size.height / 2);
        await wait(page, 900);
        box = await locator.boundingBox();
      }
      await glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, ms);
      await page.mouse.down();
      await wait(page, 70);
      await page.mouse.up();
      await wait(page, after);
    },
  };
}

/**
 * Bring the strip and a part of the result into view (unless `scroll` is
 * false), the strip near the top of the window unless the part would then run
 * off its bottom, and mark the part with a red box.
 */
async function show(page, part, scroll = true) {
  if (scroll) {
    const by = await page.evaluate((name) => {
      const bottom = Math.max(...window.demoParts(name).map((el) => el.getBoundingClientRect().bottom)) + 24;
      const top = document.getElementById('lighttable').getBoundingClientRect().top - 70;
      return bottom - top > innerHeight ? bottom - innerHeight : top;
    }, part);
    await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), by);
    await wait(page, 1000);
  }
  await page.evaluate((name) => window.demoMark(name), part);
}

/**
 * The demo, step by step. `scrollPhoto: false` plays the photo example
 * without scrolling, for the vertical video, whose window it fits.
 */
async function play(page, { scrollPhoto = true } = {}) {
  const me = hand(page);
  const cell = (n) => page.locator(`#strip .track--data [data-cell="${n}"]`);

  // The page as it opens, then down to the strip, shown as black-and-white film.
  await page.locator('#strip .track--data .cell').first().waitFor();
  await me.appear();
  await wait(page, 1400);
  await me.scrollTo(page.locator('#lighttable'), 70);
  await me.click(page.locator(LOOK('bw')), { ms: 600, after: 700 });

  // Copying the barcode, bar by bar, but missing the one in cell 8.
  for (const n of BARS) await me.click(cell(n), { ms: 300, after: 110 });
  await wait(page, 700);

  // The parity check fails: the result says so and offers one-bar corrections.
  await show(page, 'fixes');
  await wait(page, HOLD.problem);
  await me.click(page.locator('#result .fix').filter({ hasText: COPIED.film }).first(), { ms: 600, after: 900 });

  // Corrected: the strip, and the film it names.
  await show(page, 'film');
  await wait(page, HOLD.film);

  // The other way in, on a fresh page (so the strip is color negative film
  // again): a photo of the film edge, here the sample, a color negative.
  await page.evaluate(() => localStorage.removeItem('dx-prefs'));
  await page.goto(PAGE);
  await page.locator('#strip .track--data .cell').first().waitFor();
  await me.appear();
  await wait(page, 1000);
  if (scrollPhoto) await me.scrollTo(page.locator('#tab-photo'), 70);
  await me.click(page.locator('#tab-photo'), { ms: 600, after: 900 });
  await me.click(page.locator('#photo .photo__drop .tool:not(.tool--primary)'), { ms: 600 });
  await page.locator('#photo .photo__found').waitFor();
  if (scrollPhoto) await me.scrollTo(page.locator('#photo .photo__canvas'), 90);
  await wait(page, HOLD.photo);

  // Its code goes onto the strip (the page scrolls to the strip itself) and names the film.
  await me.click(page.locator('#photo .tool--primary'), { ms: 600, after: 1600 });
  await show(page, 'film', scrollPhoto);
  await wait(page, HOLD.film);
}

/** Each language's interface: the language saved as the visitor's choice. */
async function newContext(browser, lang, size, options) {
  const context = await browser.newContext(Object.assign({ viewport: size, deviceScaleFactor: 1, colorScheme: 'light' }, options));
  await context.addInitScript((code) => {
    try { localStorage.setItem('dx-lang', code); } catch (e) { /* file:// without storage */ }
  }, lang);
  return context;
}

/** A page playing the demo, with its pointer and red boxes. */
async function demoPage(browser, lang, size, options) {
  const context = await newContext(browser, lang, size, Object.assign({ reducedMotion: 'no-preference' }, options));
  await context.addInitScript(drawPointer);
  await context.addInitScript(defineMarks);
  return { context, page: await context.newPage() };
}

/** The landscape video, as Playwright records it. Returns its length in seconds. */
async function recordWebm(browser, lang, file, dir) {
  const { context, page } = await demoPage(browser, lang, LANDSCAPE, { recordVideo: { dir, size: LANDSCAPE } });
  const started = Date.now();
  await page.goto(PAGE);
  await play(page);
  const seconds = (Date.now() - started) / 1000;
  await context.close(); // finishes the video
  if (seconds > LONGEST) throw new Error(`${file} runs ${seconds.toFixed(1)} s, over ${LONGEST} s`);
  await page.video().saveAs(file);
  return seconds;
}

/**
 * The vertical video: the frames Chromium paints as the demo plays (its
 * screencast), each kept for as many of the video's frames as it stays on
 * screen, then encoded and saved as MP4. Returns its length in seconds.
 */
async function recordMp4(browser, lang, file, dir) {
  const { context, page } = await demoPage(browser, lang, VERTICAL);
  await page.goto(PAGE);
  // Started once the page is built and painted, with the pointer where the
  // demo starts it (not in the corner, where the page may have drawn it), as
  // players often show the first frame before the video plays.
  await page.locator('#strip .track--data .cell').first().waitFor();
  await hand(page).appear();
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
  const cdp = await context.newCDPSession(page);
  const shots = new Set(); // the video frames from which a new picture shows, saved in `dir`
  let start = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (start === null) start = metadata.timestamp;
    // From the first video frame at or after the moment it was painted; of
    // several painted before one video frame, the last.
    const at = Math.ceil((metadata.timestamp - start) * FPS);
    writeFileSync(join(dir, `${at}.jpg`), Buffer.from(data, 'base64'));
    shots.add(at);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VERTICAL.width, maxHeight: VERTICAL.height });
  await play(page, { scrollPhoto: false });
  const end = Date.now() / 1000; // the same clock as the frames' times
  await cdp.send('Page.stopScreencast');
  await context.close();
  const seconds = end - start;
  if (seconds > LONGEST) throw new Error(`${file} runs ${seconds.toFixed(1)} s, over ${LONGEST} s`);
  await encodeMp4(browser, dir, [...shots].sort((a, b) => a - b), Math.ceil(seconds * FPS), file);
  return seconds;
}

/**
 * In the encoder's page: an H.264 encoder (WebCodecs), given pictures by
 * `window.picture` and finished by `window.encoded`.
 */
function startEncoder({ width, height, fps, codec, bitrate, keyEvery }) {
  const chunks = [];
  let config = null;
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && !config) config = meta.decoderConfig;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, key: chunk.type === 'key', timestamp: chunk.timestamp });
    },
    error: (e) => { failure = String(e); },
  });
  encoder.configure({ codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } });
  const g = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });

  // A picture as limited-range BT.709 4:2:0, the usual form of HD video.
  // (Given the canvas itself, Chromium encodes full range, which some
  // players show too dark and too bright.)
  const space = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
  function i420(rgba) {
    const out = new Uint8ClampedArray(width * height * 3 / 2);
    const u = width * height;
    const v = u + u / 4;
    for (let p = 0, i = 0; p < u; p++, i += 4) {
      out[p] = 16 + 0.18259 * rgba[i] + 0.61423 * rgba[i + 1] + 0.06201 * rgba[i + 2];
    }
    for (let y = 0, q = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2, q++) {
        const i = (y * width + x) * 4;
        const j = i + width * 4;
        const r = (rgba[i] + rgba[i + 4] + rgba[j] + rgba[j + 4]) / 4;
        const gr = (rgba[i + 1] + rgba[i + 5] + rgba[j + 1] + rgba[j + 5]) / 4;
        const b = (rgba[i + 2] + rgba[i + 6] + rgba[j + 2] + rgba[j + 6]) / 4;
        out[u + q] = 128 - 0.10064 * r - 0.33857 * gr + 0.43922 * b;
        out[v + q] = 128 + 0.43922 * r - 0.39894 * gr - 0.04027 * b;
      }
    }
    return out;
  }

  /** A painted picture (a JPEG, in base64), as video frames `first` to `first + count - 1`. */
  window.picture = async (jpeg, first, count) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
    g.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const yuv = i420(g.getImageData(0, 0, width, height).data);
    for (let n = first; n < first + count; n++) {
      const frame = new VideoFrame(yuv, {
        format: 'I420', codedWidth: width, codedHeight: height, colorSpace: space,
        timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: n % keyEvery === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 4) await new Promise((done) => encoder.addEventListener('dequeue', done, { once: true }));
    }
  };

  /** The encoded frames, in base64, with each one's size, key-frame flag and time. */
  window.encoded = async () => {
    await encoder.flush();
    if (failure) throw new Error(failure);
    const all = new Blob(chunks.map((c) => c.data));
    const data = await new Promise((done) => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.readAsDataURL(all);
    });
    const d = config.description;
    return {
      data,
      sizes: chunks.map((c) => c.data.length),
      keys: chunks.map((c) => c.key),
      times: chunks.map((c) => c.timestamp),
      description: Array.from(ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d)),
    };
  };
}

/** Encode the pictures saved in `dir`, as `frames` video frames, and save them as an MP4 file. */
async function encodeMp4(browser, dir, shots, frames, file) {
  // WebCodecs needs a secure context, which a file:// page is.
  const html = join(dir, 'encoder.html');
  await writeFile(html, '<!doctype html><title>Encoder</title>');
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(startEncoder, { ...VERTICAL, fps: FPS, ...H264 });
  const from = shots.filter((n) => n < frames);
  for (const [i, first] of from.entries()) {
    const jpeg = (await readFile(join(dir, `${first}.jpg`))).toString('base64');
    const count = (i + 1 < from.length ? from[i + 1] : frames) - first;
    await page.evaluate(([j, f, c]) => window.picture(j, f, c), [jpeg, first, count]);
  }
  const out = await page.evaluate(() => window.encoded());
  await page.close();
  // The MP4 file gives every frame the same length and decodes them in the
  // order they are shown, so the encoder must have kept them all in order.
  if (out.times.length !== frames || out.times.some((t, n) => t !== Math.round((n * 1e6) / FPS))) {
    throw new Error(`the encoder gave ${out.times.length} frames out of order or missing, of ${frames}`);
  }
  const data = Buffer.from(out.data, 'base64');
  let at = 0;
  const samples = out.sizes.map((size, n) => {
    at += size;
    return { data: data.subarray(at - size, at), key: out.keys[n] };
  });
  await writeFile(file, mp4({ ...VERTICAL, timescale: 90000, sampleDuration: 90000 / FPS, description: Buffer.from(out.description), samples }));
}

/** The poster: the strip and the film as the correction leaves them, recorded apart from the video. */
async function savePoster(browser, lang, file) {
  const context = await newContext(browser, lang, LANDSCAPE, { reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    try { localStorage.setItem('dx-prefs', JSON.stringify({ look: 'bw', mirrored: false })); } catch (e) { /* file:// without storage */ }
  });
  const page = await context.newPage();
  await page.goto(`${PAGE}?dx=${COPIED.dx}/${COPIED.frame}`);
  // Once the page is drawn: the bars on the strip, done developing, in their fonts.
  await page.locator('#strip .track--data .cell.is-bar').first().waitFor();
  await page.locator('#strip .film.is-developing').waitFor({ state: 'detached' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('lighttable').getBoundingClientRect().top + window.scrollY - 70));
  await wait(page, 500);
  await page.screenshot({ path: file, style: PLAY });
  await context.close();
}

async function languages() {
  const files = await readdir(join(ROOT, 'site', 'js', 'i18n'));
  return ['en', ...files.filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort()];
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const dir = await mkdtemp(join(tmpdir(), 'dx-demo-'));
  try {
    await mkdir(join(ROOT, dirname(DEMO.file)), { recursive: true });
    for (const lang of await languages()) {
      const suffix = lang === 'en' ? '' : `.${lang}`;
      const files = { webm: `${DEMO.file}${suffix}.webm`, poster: `${DEMO.file}${suffix}.png`, mp4: `${DEMO.file}-vertical${suffix}.mp4` };
      const wide = await recordWebm(browser, lang, join(ROOT, files.webm), dir);
      await savePoster(browser, lang, join(ROOT, files.poster));
      const shots = await mkdtemp(join(dir, 'frames-'));
      const tall = await recordMp4(browser, lang, join(ROOT, files.mp4), shots);
      await rm(shots, { recursive: true, force: true });
      console.log(`wrote ${files.webm} (${wide.toFixed(1)} s), ${files.poster} and ${files.mp4} (${tall.toFixed(1)} s)`);
    }
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
