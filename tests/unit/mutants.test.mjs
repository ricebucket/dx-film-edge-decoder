import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from '../mutants.mjs';
import { applyTo, problemsOf } from '../../scripts/lib/mutants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every mutant (tests/mutants.mjs) is in step with the code: the text it takes out is in its file exactly once, and its test is there by name', () => {
  assert.deepEqual(problemsOf(MUTANTS, ROOT), []);
  assert.ok(MUTANTS.length >= 70, `${MUTANTS.length} mutants`);
});

/** A small project of its own, with the script that tries mutants and the list given. */
function project(mutants) {
  const dir = mkdtempSync(join(tmpdir(), 'dx-mutants-test-'));
  for (const file of ['scripts/run-mutants.mjs', 'scripts/lib/mutants.mjs', 'scripts/lib/playwright.mjs', 'scripts/lib/main.mjs']) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    cpSync(join(ROOT, file), join(dir, file));
  }
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'tests', 'unit'), { recursive: true });
  writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a + b;\n// a note\n');
  writeFileSync(join(dir, 'tests', 'unit', 'add.test.mjs'), [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { add } from '../../src/add.mjs';",
    "test('adds two numbers', () => assert.equal(add(2, 3), 5));",
    "test('has its note', () => assert.match(readFileSync(new URL('../../src/add.mjs', import.meta.url), 'utf8'), /a note/));",
    "test('never passes', () => assert.fail('no'));",
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'tests', 'mutants.mjs'), `export const MUTANTS = ${JSON.stringify(mutants)};\n`);
  const run = (...args) => spawnSync(process.execPath, [join(dir, 'scripts', 'run-mutants.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  return { dir, run };
}

const unit = (name) => ({ kind: 'unit', file: 'tests/unit/add.test.mjs', name });
const minus = { name: 'it takes away', change: [['src/add.mjs', 'a + b', 'a - b']], fails: unit('adds two numbers') };
const note = { name: 'another note', change: [['src/add.mjs', '// a note', '// a remark']], fails: unit('adds two numbers') };

test('`npm run test:mutants` reports a mutant as caught when its test then fails, and as survived when the test still passes', () => {
  const { dir, run } = project([minus, note]);
  try {
    const before = readFileSync(join(dir, 'src', 'add.mjs'), 'utf8');
    const all = run();
    assert.equal(all.status, 1, all.stdout + all.stderr);
    assert.match(all.stdout, /^caught +it takes away\n +add\.test\.mjs › adds two numbers: \d+ s$/m);
    assert.match(all.stdout, /^SURVIVED +another note\n +add\.test\.mjs › adds two numbers: its test still passes$/m);
    assert.match(all.stdout, /^2 mutants in [\d.]+ minutes: 1 caught, 1 survived\.$/m);
    // Words choose mutants by name; all caught is a pass.
    const one = run('takes', 'AWAY');
    assert.equal(one.status, 0, one.stdout + one.stderr);
    assert.match(one.stdout, /^1 mutant in [\d.]+ minutes: 1 caught\.$/m);
    assert.doesNotMatch(one.stdout, /another note/);
    const none = run('nothing');
    assert.equal(none.status, 1);
    assert.match(none.stderr, /No mutant has "nothing" in its name\./);
    assert.match(run('--fast').stderr, /Unknown option --fast/);
    // The project itself is never changed, and the copies are gone.
    assert.equal(readFileSync(join(dir, 'src', 'add.mjs'), 'utf8'), before);
    const left = readdirSync(tmpdir()).filter((name) => {
      if (!/^dx-mutants-(?!test-)/.test(name)) return false;
      try {
        return readFileSync(join(tmpdir(), name, 'copy-0', 'tests', 'mutants.mjs'), 'utf8').includes('it takes away');
      } catch {
        return false; // another run's copies, or none
      }
    });
    assert.deepEqual(left, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('`npm run test:mutants` wants the test named to be the one that fails, and to pass on the unchanged project', () => {
  // The note's own test fails without the note; the one named for it here does not.
  const elsewhere = { name: 'caught by another test', change: [['src/add.mjs', '// a note', '// a remark']], fails: unit('adds two numbers') };
  const right = { name: 'caught by its test', change: [['src/add.mjs', '// a note', '// a remark']], fails: unit('has its note') };
  const failing = { name: 'a test that fails anyway', change: [['src/add.mjs', 'a + b', 'a - b']], fails: unit('never passes') };
  const { dir, run } = project([elsewhere, right, failing]);
  try {
    const all = run('--jobs=1');
    assert.equal(all.status, 1, all.stdout + all.stderr);
    assert.match(all.stdout, /^SURVIVED +caught by another test$/m);
    assert.match(all.stdout, /^caught +caught by its test$/m);
    assert.match(all.stdout, /^BROKE +a test that fails anyway\n.*its test does not pass on the unchanged project/m);
    assert.match(all.stdout, /^3 mutants in [\d.]+ minutes: 1 caught, 1 survived, 1 could not be tried\.$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a list out of step with the code is named before anything is tried', () => {
  const gone = { name: 'gone', change: [['src/add.mjs', 'a * b', 'a - b']], fails: unit('adds two numbers') };
  const twice = { name: 'twice', change: [['src/add.mjs', 'a', 'c']], fails: unit('adds two numbers') };
  const untested = { name: 'untested', change: [['src/add.mjs', 'a + b', 'a - b']], fails: unit('multiplies') };
  const same = { name: 'same', change: [['src/add.mjs', 'a + b', 'a + b'], ['src/none.mjs', 'a', 'b']], fails: { kind: 'unit', file: 'tests/unit/none.test.mjs', name: 'x' } };
  const { dir, run } = project([gone, twice, untested, same, Object.assign({}, minus, { name: 'gone' })]);
  try {
    assert.deepEqual(problemsOf([gone, twice, untested, same, Object.assign({}, minus, { name: 'gone' })], dir), [
      '"gone": the text to take out is in src/add.mjs 0 times, not once: "a * b"',
      '"twice": the text to take out is in src/add.mjs 4 times, not once: "a"',
      '"untested": tests/unit/add.test.mjs has no test with "multiplies" in its name',
      '"same": it puts back what it takes out of src/add.mjs',
      '"same": src/none.mjs is missing',
      '"same": its test\'s file tests/unit/none.test.mjs is missing',
      '"gone": another mutant has this name',
    ]);
    const all = run();
    assert.equal(all.status, 1);
    assert.match(all.stderr, /^tests\/mutants\.mjs is out of step with the code:\n {2}"gone": the text to take out is in src\/add\.mjs 0 times/);
    assert.equal(all.stdout, '');
    assert.throws(() => applyTo(dir, gone), /"gone": the text to take out is not in src\/add\.mjs exactly once/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a mutant is made in every file it names and taken back whole', () => {
  const { dir } = project([]);
  try {
    const file = join(dir, 'src', 'add.mjs');
    const before = readFileSync(file, 'utf8');
    // A `$&` in the text put in is that text, not what was matched.
    const back = applyTo(dir, { name: 'two', change: [['src/add.mjs', 'a + b', 'a - b'], ['src/add.mjs', '// a note', '// $& $1']] });
    assert.equal(readFileSync(file, 'utf8'), 'export const add = (a, b) => a - b;\n// $& $1\n');
    back();
    assert.equal(readFileSync(file, 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
