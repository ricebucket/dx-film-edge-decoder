import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blank } from '../../scripts/lib/js-source.mjs';

// On GitHub, the phones run only the browser tests tagged @phone
// (.github/workflows/tests.yml). A test that works differently on a phone, or
// runs only there, asks for `isMobile` or `hasTouch`; unless it skips phones,
// it needs the tag, or GitHub would never run it on one. The check fails
// closed: whatever it cannot read, and any `isMobile` or `hasTouch` outside a
// test it can vouch for (a describe's skip, a hook, a helper), fails it.
const E2E = fileURLToPath(new URL('../e2e/', import.meta.url));
const FILES = /\.(spec|test)\.[cm]?[jt]sx?$/; // the files Playwright runs by default
// What a test can tell the device by: the phones' own fixtures, the size of
// its screen, the browser or project it runs in (here WebKit runs only on the
// iPhone), and what the page itself can ask of touch, the pointer and the
// browser.
const DEVICE = String.raw`\b(isMobile|hasTouch|viewport(?:Size)?|browserName|channel|defaultBrowserType|browserType|project|matchMedia|maxTouchPoints|ontouchstart|userAgent)\b`;

/** Where the bracket at `open` closes, or -1. */
function closing(code, open) {
  const pair = { '{': '}', '(': ')', '[': ']' }[code[open]];
  let level = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === code[open]) level++;
    else if (code[k] === pair && --level === 0) return k;
  }
  return -1;
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;

/** The tests in one file, how many are tagged @phone, and what is wrong. */
function check(file, src) {
  const problems = [];
  let tests = 0;
  let tagged = 0;
  let code;
  try {
    code = blank(src);
  } catch (e) {
    return { tests, tagged, problems: [`${file}: cannot read it (${e.message})`] };
  }
  const devices = []; // [from, to] of each test that asks for isMobile or hasTouch
  // Every test declared, test('…', …) or test.fail('…', …), wherever it is on its line.
  for (const m of code.matchAll(/(?<![\w.$])test(?:\.fail)?\(\s*(['"`])/g)) {
    const at = m.index;
    const where = `${file}:${lineOf(src, at)}`;
    const unread = () => problems.push(`${where}: a test this check cannot read`);
    const titleEnd = code.indexOf(m[1], at + m[0].length);
    let k = titleEnd + 1;
    const shape = /^\s*,\s*(\{)?/.exec(code.slice(k));
    if (!shape) { unread(); continue; }
    let options = '';
    if (shape[1]) {
      const open = k + shape[0].length - 1;
      const end = closing(code, open);
      options = src.slice(open, end + 1);
      k = end + 1;
      if (end < 0 || !/^\s*,/.test(code.slice(k))) { unread(); continue; }
      k = code.indexOf(',', k) + 1;
    } else k += shape[0].length;
    const head = /^\s*async\s*\(\s*(\{)?/.exec(code.slice(k));
    if (!head) { unread(); continue; }
    let fixtures = '';
    let p = k + head[0].length - (head[1] ? 1 : 0);
    if (head[1]) {
      const end = closing(code, p);
      if (end < 0) { unread(); continue; }
      fixtures = code.slice(p, end + 1);
      p = end + 1;
    }
    const arrow = /^[^{]*?\)\s*=>\s*\{/.exec(code.slice(p));
    if (!arrow) { unread(); continue; }
    const bodyOpen = p + arrow[0].length - 1;
    const bodyEnd = closing(code, bodyOpen);
    if (bodyEnd < 0) { unread(); continue; }
    tests++;
    const phone = /(['"`])@phone\1/.test(options);
    if (phone) tagged++;
    const body = code.slice(bodyOpen + 1, bodyEnd);
    if (!new RegExp(DEVICE).test(fixtures + body)) continue;
    devices.push([at, bodyEnd]);
    // Desktop only: its first line skips the test where isMobile is true.
    const skip = /^\s*test\.skip\(([^,]*),/.exec(body);
    const desktopOnly = skip && /^\s*(isMobile|.*\|\|\s*isMobile|isMobile\s*\|\|.*)\s*$/.test(skip[1]) && !/!\s*(isMobile|hasTouch)\b|isMobile\s*[=!]==?/.test(skip[1]);
    if (!phone && !desktopOnly) problems.push(`${where}: ${src.slice(at + m[0].length, titleEnd)} depends on the device (isMobile, hasTouch, the screen size, the browser, the project, or what the page asks of touch, the pointer or the browser) without the @phone tag`);
  }
  for (const m of code.matchAll(new RegExp(DEVICE, 'g'))) {
    if (!devices.some(([from, to]) => m.index > from && m.index < to)) problems.push(`${file}:${lineOf(src, m.index)}: ${m[0]} outside a test this check can vouch for`);
  }
  return { tests, tagged, problems };
}

test('browser tests that depend on the device are tagged @phone, unless they skip phones', () => {
  const problems = [];
  let tests = 0;
  let tagged = 0;
  for (const file of readdirSync(E2E, { recursive: true }).filter((f) => FILES.test(f))) {
    const found = check(file, readFileSync(join(E2E, file), 'utf8'));
    tests += found.tests;
    tagged += found.tagged;
    problems.push(...found.problems);
  }
  assert.ok(tests > 100 && tagged > 0, `found ${tests} tests, ${tagged} tagged @phone`);
  assert.deepEqual(problems, []);
});

test('the helpers of the browser tests do not depend on the device', () => {
  // A test that calls one that does would work differently on a phone, with
  // nothing in the test itself for the check above to see.
  const problems = [];
  for (const file of readdirSync(E2E, { recursive: true }).filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !FILES.test(f))) {
    const code = blank(readFileSync(join(E2E, file), 'utf8'));
    for (const m of code.matchAll(new RegExp(DEVICE, 'g'))) problems.push(`${file}:${lineOf(code, m.index)}: ${m[0]}`);
  }
  assert.deepEqual(problems, []);
});

test('the check passes tests it can vouch for and fails all else', () => {
  const passes = {
    'tagged': "test('a', { tag: '@phone' }, async ({ page, isMobile }) => {\n  if (isMobile) await page.tap('b');\n});",
    'desktop only': "test('a', async ({ page, isMobile }) => {\n  test.skip(isMobile, 'a mouse');\n  await page.hover('b');\n});",
    'Chromium on the desktop only': "test('a', async ({ page, browserName, isMobile }) => {\n  test.skip(browserName !== 'chromium' || isMobile, 'Windows');\n});",
    'no device': "test('a', async ({ page }) => {\n  await page.goto('/'); // isMobile in a comment\n  const s = 'hasTouch';\n});",
  };
  for (const [what, src] of Object.entries(passes)) assert.deepEqual(check('p.spec.cjs', src).problems, [], what);
  const fails = {
    'a skip in a describe': "test.describe('d', () => {\n  test.skip(({ isMobile }) => !isMobile, 'phones');\n  test('a', async ({ page }) => {});\n});",
    'a skip in a hook': "test.beforeEach(async ({ hasTouch }) => {\n  test.skip(!hasTouch, 'a tap');\n});\ntest('a', async ({ page }) => {});",
    'the same declaration twice': "test('a', async ({ isMobile }) => {\n  test.skip(isMobile, 'x');\n});\ntest('a', async ({ isMobile }) => {\n  if (isMobile) {}\n});",
    'test.fail': "test.fail('a', async ({ isMobile }) => {\n  if (isMobile) {}\n});",
    'a loop on one line': 'for (const n of [1, 2]) test(`a ${n}`, async ({ isMobile }) => { if (isMobile) {} });',
    'nested fixtures': "test('a', async ({ viewport: { width }, isMobile }) => {\n  if (isMobile) {}\n});",
    'a phone-only skip': "test('a', async ({ hasTouch }) => {\n  test.skip(!hasTouch, 'a tap');\n});",
    'a helper': "const tap = (isMobile) => isMobile;\ntest('a', async ({ page }) => {});",
    'unreadable': "test('a', async ({ isMobile }) => {\n  const s = `x ${isMobile;\n});",
    'only in WebKit, the iPhone': "test('a', async ({ page, browserName }) => {\n  test.skip(browserName !== 'webkit', 'Safari');\n});",
    'only in one project': "test('a', async ({ page }, testInfo) => {\n  test.skip(testInfo.project.name !== 'iphone', 'iPhone');\n});",
    'a browser skip in a describe': "test.describe('d', () => {\n  test.skip(({ browserName }) => browserName !== 'webkit', 'Safari');\n  test('a', async ({ page }) => {});\n});",
    'the screen size': "test('a', async ({ page }) => {\n  const { width } = page.viewportSize();\n});",
    'the viewport fixture': "test('a', async ({ page, viewport }) => {\n  if (viewport.width < 500) {}\n});",
    'the project from test.info()': "test('a', async ({ page }) => {\n  const { project } = test.info();\n});",
    'the browser type': "test('a', async ({ browser }) => {\n  if (browser.browserType().name() === 'webkit') {}\n});",
    'the default browser type': "test('a', async ({ page, defaultBrowserType }) => {\n  if (defaultBrowserType === 'webkit') {}\n});",
    'the page\'s own pointer': "test('a', async ({ page }) => {\n  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {}\n});",
    'the page\'s own touch points': "test('a', async ({ page }) => {\n  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {}\n});",
    'the page\'s own touch events': "test('a', async ({ page }) => {\n  if (await page.evaluate(() => window.ontouchstart !== undefined)) {}\n});",
    'the browser\'s name for itself': "test('a', async ({ page }) => {\n  if ((await page.evaluate(() => navigator.userAgent)).includes('iPhone')) {}\n});",
  };
  for (const [what, src] of Object.entries(fails)) assert.ok(check('p.spec.cjs', src).problems.length > 0, what);
  for (const name of ['a.spec.js', 'a.spec.cjs', 'a.spec.ts', 'a.test.mjs', 'a.spec.tsx']) assert.ok(FILES.test(name), name);
});

test('blank() tells a regular expression from a division by the code before it', () => {
  const cases = [
    // After =>, with /*, // or a quote inside: the code after it stays.
    ['const f = (u) => /^\\/*x/.test(u); isMobile;', 'const f = (u) => /     /.test(u); isMobile;'],
    ['const f = (u) => /\\/\\//.test(u) && isMobile;', 'const f = (u) => /    /.test(u) && isMobile;'],
    ["const f = (x) => /'/.test(x); isMobile;", 'const f = (x) => / /.test(x); isMobile;'],
    // After a keyword, and after other signs.
    ["if (typeof /'/ === 'object') isMobile;", "if (typeof / / === '      ') isMobile;"],
    ["const ok = a < /'/.source.length || isMobile;", 'const ok = a < / /.source.length || isMobile;'],
    // A / inside a class does not end it.
    ['/[/]/.test(s); isMobile;', '/   /.test(s); isMobile;'],
    // After the ) of if (…), while (…) or for (…), unlike other ).
    ['if (ok) /^\\/*x/.test(u); isMobile;', 'if (ok) /     /.test(u); isMobile;'],
    ["while (a) /'/.test(b); isMobile;", 'while (a) / /.test(b); isMobile;'],
    // Divisions: after a name, a number, ) or ], also at the start of an indented line.
    ['const x = a / b / 2 + f(x) / y[0] / 4;', 'const x = a / b / 2 + f(x) / y[0] / 4;'],
    ['const x = a\n              / 2; // isMobile\nisMobile;', 'const x = a\n              / 2;            \nisMobile;'],
    // … and after a ++ or --, a property named like a keyword, and a name in another script.
    ['a++ / 2; isMobile / 3;', 'a++ / 2; isMobile / 3;'],
    ['o.return / 2; isMobile / 3;', 'o.return / 2; isMobile / 3;'],
    ['名 / 2; isMobile / 3;', '名 / 2; isMobile / 3;'],
    // After each keyword a regular expression can follow, and after the ) of for await (…).
    ...['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']
      .map((word) => [`${word} /'/; isMobile;`, `${word} / /; isMobile;`]),
    ["for await (const x of s) /'/.test(x); isMobile;", 'for await (const x of s) / /.test(x); isMobile;'],
  ];
  for (const [src, code] of cases) assert.equal(blank(src), code, src);
  // Where a ( or ) is left over, it cannot tell which ) ends a condition.
  for (const src of ['f(a; isMobile;', 'a); isMobile;']) assert.throws(() => blank(src), /unbalanced parentheses/, src);
});

test('GitHub runs every browser test on the desktop, in parts, and the @phone tests on every other device the config has', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const config = readFileSync(join(root, 'playwright.config.cjs'), 'utf8');
  const workflow = readFileSync(join(root, '.github/workflows/tests.yml'), 'utf8');
  // Every name in the config's list of projects, however it is written.
  const code = blank(config);
  const open = code.indexOf('[', code.indexOf('projects:'));
  const end = closing(code, open);
  assert.ok(open >= 0 && end > open, 'the projects: [ … ] list');
  const projects = [...config.slice(open, end).matchAll(/\bname:\s*(['"`])([\w-]+)\1/g)].map((m) => m[2]);
  const phones = projects.filter((name) => name !== 'desktop');
  assert.ok(projects.includes('desktop') && phones.length >= 2, projects.join());
  // The jobs' `tests:` lines: on the desktop all, in parts 1/n … n/n; on the phones those tagged @phone.
  const runs = [...workflow.matchAll(/^\s*tests:(.*)$/gm)].map((m) => m[1].trim().split(/\s+/));
  const desktop = runs.filter((r) => r.includes('--project=desktop'));
  assert.ok(desktop.length > 0, 'desktop jobs');
  assert.deepEqual(desktop, desktop.map((_, i) => ['--project=desktop', `--shard=${i + 1}/${desktop.length}`]));
  assert.deepEqual(runs.filter((r) => !desktop.includes(r)), [[...phones.map((name) => `--project=${name}`), '--grep', '@phone']]);
  // … and each job runs the tests its line names, in a step that is not turned off or let fail.
  const step = /^( +)- run: npm run test:e2e -- \$\{\{ matrix\.tests \}\}[ \t]*\n((?:\1 {2,}.*\n)*)/m.exec(workflow);
  assert.ok(step, 'the step that runs the browser tests');
  assert.doesNotMatch(step[2], /^\s+(?:if|continue-on-error):/m);
  const browser = /^ {2}browser:\n((?: {4}.*\n|\s*\n)*)/m.exec(workflow);
  assert.ok(browser && browser[1].includes(step[0]), 'the browser job');
  assert.doesNotMatch(browser[1], /^ {4}(?:if|continue-on-error):/m);
});

test('GitHub runs the unit tests with `npm test`, fails a run on a test.only or a flaky test, and deploys only after every job passed', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const config = blank(readFileSync(join(root, 'playwright.config.cjs'), 'utf8'));
  const workflow = readFileSync(join(root, '.github/workflows/tests.yml'), 'utf8');
  // `npm test` (scripts/run-unit.mjs) fails where `node --test` alone would not, and it also checks the generated data files.
  const unit = /^ {2}unit:\n((?: {4}.*\n|\s*\n)*)/m.exec(workflow);
  assert.ok(unit, 'the unit job');
  assert.match(unit[1], /^ {6}- run: npm test\s*$/m);
  // Neither the job nor a step of it is turned off, or let fail.
  assert.doesNotMatch(unit[1], /^\s+(?:if|continue-on-error):/m);
  // A test.only left in would run alone, and a test that passes only when retried would pass.
  assert.match(config, /\bforbidOnly:\s*Boolean\(process\.env\.CI\)/);
  assert.match(config, /\bfailOnFlakyTests:\s*Boolean\(process\.env\.CI\)/);
  assert.match(workflow, /^ {4}needs: \[unit, licenses, browser\]\s*$/m);
});
