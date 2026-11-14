import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, changedTests, commandOf, leftByHand, planned, runAll, testsOf, withoutOtherVersion } from '../../scripts/before-push.mjs';

// `npm run before-push` (scripts/before-push.mjs): the steps before a push
// that a command can do. The steps themselves are the project's other
// commands; these tests are of which it runs, when it stops, which browser
// tests it repeats and what it leaves to a person.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** The commands a DEVELOPING document lists under its step for `npm run before-push`, each once, in order. */
function listed(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => /^1\. .*`npm run before-push`/.test(line));
  assert.ok(at >= 0, 'a first step that names the command');
  const commands = [];
  for (const line of lines.slice(at + 1)) {
    if (/^(\d+\. |#)/.test(line)) break; // the next step, or the next section
    for (const [, command] of line.matchAll(/`(npm test|npm run [\w:-]+|reuse lint)\b[^`]*`/g)) {
      if (command !== 'npm run before-push' && !commands.includes(command)) commands.push(command);
    }
  }
  return commands;
}

test('before-push runs the commands that DEVELOPING.md lists under it, in that order, in each version of the document', () => {
  const steps = STEPS.map(commandOf);
  assert.deepEqual(steps, [...new Set(steps)], 'no command twice');
  const documents = readdirSync(ROOT).filter((name) => /^DEVELOPING(\.[\w-]+)?\.md$/.test(name)).sort();
  assert.deepEqual(documents, ['DEVELOPING.md', 'DEVELOPING.zh-CN.md']);
  for (const name of documents) assert.deepEqual(listed(read(name)), steps, name);
});

test('each step of before-push is a command of package.json that node runs with plain options, or a tool with a note for where it is missing', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.match(scripts['before-push'], /^node scripts\/before-push\.mjs$/);
  for (const step of STEPS) {
    if (step.tool) {
      assert.ok(step.tool.length > 0 && step.missing, step.name);
      continue;
    }
    assert.match(scripts[step.script] || '', /^node [\w./-]+\.mjs( --[\w-]+(=[\w-]+)?)*$/, step.script);
  }
  assert.equal(commandOf({ script: 'test' }), 'npm test');
  assert.equal(commandOf({ script: 'media', args: ['--force'] }), 'npm run media -- --force');
  assert.equal(commandOf({ tool: ['reuse', 'lint'] }), 'reuse lint');
});

test('before-push stops at the first step that fails and says which were not run; with --keep-going it runs them all', () => {
  const steps = [{ name: 'a', script: 'test' }, { name: 'b', script: 'x' }, { name: 'c', script: 'y' }, { name: 'd', script: 'z' }];
  const run = (ran) => (step) => {
    ran.push(step.name);
    return step.name === 'b' ? 1 : 0;
  };
  const statuses = (done) => done.map((step) => `${step.name} ${step.status}`);

  let ran = [];
  let said = [];
  assert.deepEqual(statuses(runAll(steps, run(ran), { say: (line) => said.push(line) })), ['a passed', 'b failed', 'c not run', 'd not run']);
  assert.deepEqual(ran, ['a', 'b']);
  assert.deepEqual(said, ['\n== 1 of 4: a (npm test)', '\n== 2 of 4: b (npm run x)']);

  ran = [];
  said = [];
  assert.deepEqual(statuses(runAll(steps, run(ran), { keepGoing: true, say: (line) => said.push(line) })), ['a passed', 'b failed', 'c passed', 'd passed']);
  assert.deepEqual(ran, ['a', 'b', 'c', 'd']);
  assert.equal(said.length, 4);

  // A step that ends without a status (stopped by a signal) has failed.
  assert.deepEqual(statuses(runAll(steps.slice(0, 1), () => null)), ['a failed']);
  assert.deepEqual(statuses(runAll(steps.slice(0, 1), () => 127)), ['a failed']);
});

test('before-push repeats the browser tests that changed, leaves the step out when none did, and records the videos in any case only when asked', () => {
  const steps = [{ name: 'repeat', script: 'test:repeat' }, { name: 'media', script: 'media' }, { name: 'last', script: 'test' }];
  const places = ['tests/e2e/a.spec.cjs:3', 'tests/e2e/b.spec.cjs:40'];

  const some = planned(steps, { places });
  assert.deepEqual(some, [{ name: 'repeat', script: 'test:repeat', args: places }, steps[1], steps[2]]);
  assert.equal(commandOf(some[0]), 'npm run test:repeat -- tests/e2e/a.spec.cjs:3 tests/e2e/b.spec.cjs:40');

  const none = planned(steps, { places: [], videos: true });
  assert.equal(none[0].skip, 'no browser test is new or changed');
  assert.deepEqual(none[1], { name: 'media', script: 'media', args: ['--force'] });
  assert.equal(planned(steps, { places: [], unknown: true })[0].skip, 'git could not tell which browser tests changed');
  assert.equal(planned(STEPS, { places }).filter((step) => step.args).length, 1, 'the steps have a repeat step');
  assert.equal(planned(STEPS, { places: [], videos: true }).filter((step) => step.args).length, 1, 'the steps have a media step');

  // A step left out is not run, takes no number of its own from the others, and stops nothing.
  const ran = [];
  const done = runAll(none, (step) => ran.push(step.name) && 0);
  assert.deepEqual(ran, ['media', 'last']);
  assert.deepEqual(done.map((step) => [step.name, step.status, step.why]), [
    ['repeat', 'not needed', 'no browser test is new or changed'],
    ['media', 'passed', undefined],
    ['last', 'passed', undefined],
  ]);
});

const FILE = `const { test, expect } = require('@playwright/test');

// A helper.
const open = (page) => page.goto('/');

test('one', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    document.body.click();
  });
});

test('two', { tag: '@phone' }, async ({ page }) => {
  await open(page);
});

test.describe('older film', () => {
  test.use({ locale: 'en' });

  test('three', async ({ page }) => {
    for (const n of [1, 2]) {
      await page.keyboard.press(String(n));
    }
  });
});

for (const lang of ['en', 'zh-CN']) {
  test(\`four (\${lang})\`, async ({ page }) => {
    await open(page);
  });
}
`;

test('the browser tests of a file are found by the line each starts on, with all of its text, at any indent', () => {
  const { tests, rest } = testsOf(FILE);
  assert.deepEqual(tests.map((found) => found.line), [6, 13, 20, 28]);
  assert.equal(tests[0].text, FILE.split('\n').slice(5, 11).join('\n'));
  assert.equal(tests[2].text, FILE.split('\n').slice(19, 24).join('\n'));
  assert.equal(tests[3].text, FILE.split('\n').slice(27, 30).join('\n'));
  // The rest: the code outside the tests, without blank lines and comments.
  assert.deepEqual(rest.split('\n'), [
    "const { test, expect } = require('@playwright/test');",
    "const open = (page) => page.goto('/');",
    "test.describe('older film', () => {",
    "  test.use({ locale: 'en' });",
    '});',
    "for (const lang of ['en', 'zh-CN']) {",
    '}',
  ]);
  assert.deepEqual(testsOf(''), { tests: [], rest: '' });
  // A test cut off at the end of a file runs to its end, and takes nothing with it that is not there.
  assert.deepEqual(testsOf("test('x', async () => {").tests, [{ line: 1, text: "test('x', async () => {" }]);
});

test('a browser test is repeated when it is new or reads differently, not when it only moved; a change outside the tests is named with its file', () => {
  const same = { lines: [], outside: false };
  assert.deepEqual(changedTests(FILE, FILE), same);

  // A line inside one test: that test, by the line it starts on now.
  assert.deepEqual(changedTests(FILE, FILE.replace('document.body.click();', 'document.body.focus();')), { lines: [6], outside: false });
  assert.deepEqual(changedTests(FILE, FILE.replace("{ tag: '@phone' }, ", '')), { lines: [13], outside: false });
  assert.deepEqual(changedTests(FILE, FILE.replace('[1, 2]', '[1, 2, 3]')), { lines: [20], outside: false });
  assert.deepEqual(changedTests(FILE, FILE.replace('four (', 'fourth (')), { lines: [28], outside: false });

  // A new test, with a comment and a blank line of its own: only that one, though the others moved down.
  const added = FILE.replace("test('two'", "// What a new test is for.\ntest('new', async ({ page }) => {\n  await open(page);\n});\n\ntest('two'");
  assert.deepEqual(changedTests(FILE, added), { lines: [14], outside: false });
  // A test taken out, or the tests in another order: nothing to repeat.
  assert.deepEqual(changedTests(added, FILE), same);
  const [one, two] = testsOf(FILE).tests;
  assert.deepEqual(changedTests(FILE, FILE.replace(one.text, 'ONE').replace(two.text, one.text).replace('ONE', two.text)), same);

  // Outside the tests: a helper, or the settings of a group. Comments and blank lines are no change.
  assert.deepEqual(changedTests(FILE, FILE.replace("page.goto('/')", "page.goto('/?lang=en')")), { lines: [], outside: true });
  assert.deepEqual(changedTests(FILE, FILE.replace("locale: 'en'", "locale: 'zh-CN'")), { lines: [], outside: true });
  assert.deepEqual(changedTests(FILE, FILE.replace('// A helper.', '// A helper, used by every test.\n')), same);
  // Both at once: the changed test is repeated, and the file is named for the others.
  assert.deepEqual(changedTests(FILE, FILE.replace("page.goto('/')", "page.goto('/#x')").replace('[1, 2]', '[2]')), { lines: [20], outside: true });

  // A new file: every test, and nothing is left over to name it for.
  assert.deepEqual(changedTests('', FILE), { lines: [6, 13, 20, 28], outside: false });
  // A file without tests of its own, such as the helpers: any change to its code is outside.
  assert.deepEqual(changedTests('const a = 1;\n', 'const a = 2;\n'), { lines: [], outside: true });
  assert.deepEqual(changedTests('const a = 1;\n', '// One.\nconst a = 1;\n'), same);
});

test('every browser test of the project starts and ends where before-push looks for it', () => {
  const files = readdirSync(join(ROOT, 'tests', 'e2e')).filter((name) => name.endsWith('.spec.cjs'));
  assert.ok(files.length >= 6, files.join(', '));
  let count = 0;
  for (const name of files) {
    const text = read(join('tests', 'e2e', name));
    const { tests } = testsOf(text);
    // None inside another: as many as there are lines that start one.
    assert.equal(tests.length, text.split('\n').filter((line) => /^\s*test\(/.test(line)).length, name);
    for (const found of tests) {
      const lines = found.text.split('\n');
      assert.match(lines[0], /^(\s*)test\(.*\{$/, `${name}:${found.line}`);
      assert.equal(lines.at(-1), `${/^\s*/.exec(lines[0])[0]}});`, `${name}:${found.line} ends at its own indent`);
    }
    count += tests.length;
  }
  assert.ok(count > 250, `${count} tests`);
});

test('before-push names a document or sources page changed without its other version', () => {
  assert.deepEqual(withoutOtherVersion([
    'README.md', 'README.zh-CN.md',
    'DEVELOPING.md',
    'research/02-frame-numbers.zh-CN.md',
    'site/sources.zh-CN.html',
    'site/index.html',
    'site/js/i18n/zh-CN.js',
    'data/README.md', 'data/README.zh-CN.md',
  ]), [
    ['DEVELOPING.md', 'DEVELOPING.zh-CN.md'],
    ['research/02-frame-numbers.zh-CN.md', 'research/02-frame-numbers.md'],
    ['site/sources.zh-CN.html', 'site/sources.html'],
  ]);
  assert.deepEqual(withoutOtherVersion([]), []);
});

test('before-push ends with what is left to do by hand: the pictures and videos to look at, the files to check, the tests it could not choose', () => {
  assert.deepEqual(leftByHand({ changed: [] }), ['- git status: nothing differs from the last commit.']);
  assert.deepEqual(leftByHand({ changed: null }), ['- git status: git could not list what changed.']);
  assert.deepEqual(leftByHand({ changed: ['site/js/app.js'] }), ['- git status: 1 file is changed or new. The snapshots, pictures and videos among them belong to the commit.']);

  const lines = leftByHand({
    changed: [
      '.github/screenshot.png', '.github/demo.webm', '.github/demo-vertical.zh-CN.mp4', 'research/img/layout.svg',
      'site/img/icon.svg', 'tests/regressions/page.en.txt', 'README.md',
    ],
    outside: ['tests/e2e/helpers.cjs'],
  });
  assert.deepEqual(lines, [
    '- tests/e2e/helpers.cjs changed outside a test, so the tests that use that part were not repeated.\n    To repeat one: npm run test:repeat -- -g "words of its name"',
    '- Look at the pictures that differ from the last commit:\n    .github/screenshot.png, research/img/layout.svg',
    '- Watch the videos that differ from the last commit:\n    .github/demo.webm, .github/demo-vertical.zh-CN.mp4',
    '- README.md is changed and its other version, README.zh-CN.md, is not.',
    '- git status: 7 files are changed or new. The snapshots, pictures and videos among them belong to the commit.',
  ]);
});

test('before-push runs nothing when given an option it does not know', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'before-push.mjs'), '--keep-going', '--force'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'Unknown option --force: the options are --keep-going and --videos.\n');
});
