#!/usr/bin/env node
// `npm run before-push`: the steps of DEVELOPING.md, "Before every push", that
// a command can do, one after another:
//
//   the unit tests, the type and style checks, the license check, the page
//   against its snapshots, every browser test on all three devices, each new
//   or changed browser test many times over, the mutants, and the diagrams,
//   screenshots and videos.
//
//   npm run before-push                   # stops at the first step that fails
//   npm run before-push -- --keep-going   # runs the rest all the same
//   npm run before-push -- --videos       # records the demo videos in any case
//
// It ends with what is left to do by hand: looking at the pictures and videos
// that changed, and at `git status`.
//
// The steps are the project's own commands, run as `npm run` runs them: each
// can still be run alone. A unit test keeps this list and the one in
// DEVELOPING.md the same (tests/unit/before-push.test.mjs).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The steps, the quick ones first. `script` is a command of package.json; the
 * license check is a tool of its own, installed outside the project.
 */
export const STEPS = [
  { name: 'unit tests', script: 'test' },
  { name: 'types', script: 'check:types' },
  { name: 'styles', script: 'check:styles' },
  { name: 'licenses', tool: ['reuse', 'lint'], missing: 'The REUSE tool was not found. Install it once: pipx install reuse' },
  { name: 'the page against its snapshots', script: 'check:regressions' },
  { name: 'browser tests on all three devices', script: 'test:e2e' },
  { name: 'new and changed browser tests, many times over', script: 'test:repeat' },
  { name: 'mutants', script: 'test:mutants' },
  { name: 'diagrams, screenshots and videos', script: 'media' },
];

/** A step's command as it is typed, with what this run adds to it. */
export function commandOf(step) {
  const command = step.tool ? step.tool.join(' ') : step.script === 'test' ? 'npm test' : `npm run ${step.script}`;
  return step.args?.length ? `${command}${step.tool ? '' : ' --'} ${step.args.join(' ')}` : command;
}

/**
 * The steps as one run takes them. The repeat step gets the tests to repeat,
 * each as Playwright is told it ("tests/e2e/x.spec.cjs:12"), or a reason to
 * leave it out when there are none; the media step records the videos in any
 * case when that is asked for.
 */
export function planned(steps, { places, unknown = false, videos = false }) {
  return steps.map((step) => {
    if (step.script === 'test:repeat') {
      if (unknown) return { ...step, skip: 'git could not tell which browser tests changed' };
      return places.length ? { ...step, args: places } : { ...step, skip: 'no browser test is new or changed' };
    }
    if (step.script === 'media' && videos) return { ...step, args: ['--force'] };
    return step;
  });
}

/**
 * Run the steps in turn with `run(step)`, which gives a step's exit status.
 * Stops after the first that fails unless `keepGoing`; a step with a reason
 * to `skip` is not run. Returns one record per step: { name, status:
 * 'passed' | 'failed' | 'not needed' | 'not run', seconds, why }.
 */
export function runAll(steps, run, { keepGoing = false, say = (_line) => {} } = {}) {
  const done = [];
  let stopped = false;
  for (const [i, step] of steps.entries()) {
    if (stopped) {
      done.push({ name: step.name, status: 'not run', seconds: 0 });
      continue;
    }
    if (step.skip) {
      done.push({ name: step.name, status: 'not needed', seconds: 0, why: step.skip });
      continue;
    }
    say(`\n== ${i + 1} of ${steps.length}: ${step.name} (${commandOf(step)})`);
    const started = Date.now();
    const status = run(step) === 0 ? 'passed' : 'failed';
    done.push({ name: step.name, status, seconds: Math.round((Date.now() - started) / 1000) });
    if (status === 'failed' && !keepGoing) stopped = true;
  }
  return done;
}

/**
 * The browser tests in the text of a test file, each with the line it starts
 * on (counted from 1) and its whole text, and the rest of the file without
 * its blank lines and comments. A test runs from a line that starts with
 * `test(` to the next line that closes it at the same indent.
 */
export function testsOf(text) {
  const lines = text.split('\n');
  const tests = [];
  const rest = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = /^(\s*)test\(/.exec(lines[i]);
    if (!start) {
      if (!/^\s*(\/\/.*)?$/.test(lines[i])) rest.push(lines[i]);
      continue;
    }
    let end = Math.min(i + 1, lines.length - 1);
    while (end < lines.length - 1 && !lines[end].startsWith(`${start[1]}});`)) end += 1;
    tests.push({ line: i + 1, text: lines.slice(i, end + 1).join('\n') });
    i = end;
  }
  return { tests, rest: rest.join('\n') };
}

/**
 * What a change to a file of the browser tests asks for: the lines of `now`
 * where a test starts that is new or reads differently than in `was`, and
 * whether the code outside the tests changed, which every other test of the
 * file may use. A file without tests of its own (the helpers, the settings)
 * has only the second.
 */
export function changedTests(was, now) {
  const before = testsOf(was);
  const after = testsOf(now);
  const old = new Set(before.tests.map((test) => test.text));
  const lines = after.tests.filter((test) => !old.has(test.text)).map((test) => test.line);
  const everyTest = after.tests.length > 0 && lines.length === after.tests.length;
  return { lines, outside: before.rest !== after.rest && !everyTest };
}

/**
 * Of the files changed, the documents and pages that have another language's
 * version which is not among them: [changed, its other version]. The two are
 * changed together.
 */
export function withoutOtherVersion(changed) {
  const other = (file) => {
    const page = /^(.*?)(\.zh-CN)?\.(md|html)$/.exec(file);
    if (!page || !(file.endsWith('.md') || /(^|\/)sources(\.zh-CN)?\.html$/.test(file))) return null;
    return page[2] ? `${page[1]}.${page[3]}` : `${page[1]}.zh-CN.${page[3]}`;
  };
  return changed.filter((file) => other(file) && !changed.includes(other(file))).map((file) => [file, other(file)]);
}

/**
 * What is left to a person once the steps are through, as lines to print.
 * `changed`: the files `git status` lists, or null where git could not say;
 * `outside`: the files of the browser tests changed outside any test.
 */
export function leftByHand({ changed, outside = [] }) {
  const lines = [];
  for (const file of outside) {
    lines.push(`- ${file} changed outside a test, so the tests that use that part were not repeated.\n    To repeat one: npm run test:repeat -- -g "words of its name"`);
  }
  if (!changed) return [...lines, '- git status: git could not list what changed.'];
  const pictures = changed.filter((file) => /^(\.github|research\/img)\/[^/]+\.(png|svg)$/.test(file));
  if (pictures.length) lines.push(`- Look at the pictures that differ from the last commit:\n    ${pictures.join(', ')}`);
  const videos = changed.filter((file) => /^\.github\/[^/]+\.(webm|mp4)$/.test(file));
  if (videos.length) lines.push(`- Watch the videos that differ from the last commit:\n    ${videos.join(', ')}`);
  for (const [file, other] of withoutOtherVersion(changed)) lines.push(`- ${file} is changed and its other version, ${other}, is not.`);
  lines.push(changed.length
    ? `- git status: ${changed.length} ${changed.length === 1 ? 'file is' : 'files are'} changed or new. The snapshots, pictures and videos among them belong to the commit.`
    : '- git status: nothing differs from the last commit.');
  return lines;
}

/** What git prints for a command in the project, or null where it fails (no git, no repository, no such commit or file). */
function git(...args) {
  // --no-optional-locks: a look at the repository then writes nothing into it.
  const run = spawnSync('git', ['--no-optional-locks', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : null;
}

/** The files `git status` lists, the files of new folders one by one; null where git cannot say. */
function uncommitted() {
  const out = git('status', '--porcelain', '-z', '--untracked-files=all');
  if (out === null) return null;
  const files = [];
  const entries = out.split('\0').filter(Boolean);
  for (let i = 0; i < entries.length; i += 1) {
    files.push(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) i += 1; // a renamed file's old name follows it
  }
  return files;
}

/**
 * The browser tests to repeat: those new or changed since the commit that was
 * last pushed (the last commit, where the branch is pushed nowhere), with the
 * files changed outside any test. `unknown` where git cannot say.
 */
function browserTestsChanged() {
  const base = (git('merge-base', 'HEAD', '@{upstream}') || git('rev-parse', '--verify', 'HEAD') || '').trim();
  const where = ['tests/e2e', 'playwright.config.cjs'];
  const tracked = base && git('diff', '--name-only', '-z', base, '--', ...where);
  const fresh = git('ls-files', '--others', '--exclude-standard', '-z', '--', ...where);
  if (!base || tracked === null || fresh === null) return { places: [], outside: [], unknown: true };
  const places = [];
  const outside = [];
  for (const file of [...new Set(`${tracked}${fresh}`.split('\0').filter(Boolean))].sort()) {
    if (!/\.cjs$/.test(file) || !existsSync(join(ROOT, file))) continue;
    const change = changedTests(git('show', `${base}:${file}`) || '', readFileSync(join(ROOT, file), 'utf8'));
    places.push(...change.lines.map((line) => `${file}:${line}`));
    if (change.outside) outside.push(file);
  }
  return { places, outside, unknown: false };
}

/** Run one step in the project's folder; gives its exit status (127 for a tool that is not installed). */
function runStep(step) {
  const args = step.args || [];
  if (step.tool) {
    const run = spawnSync(step.tool[0], [...step.tool.slice(1), ...args], { cwd: ROOT, stdio: 'inherit' });
    if (run.error && run.error.code === 'ENOENT') {
      console.error(step.missing);
      return 127;
    }
    return run.status ?? 1;
  }
  // As `npm run <script>` runs it: every script of package.json named above is "node <file> [options]".
  const [node, ...own] = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts[step.script].split(' ');
  if (node !== 'node') throw new Error(`"${step.script}" in package.json is not a node script`);
  return spawnSync(process.execPath, [...own, ...args], { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== '--keep-going' && arg !== '--videos');
  if (unknown) {
    console.error(`Unknown option ${unknown}: the options are --keep-going and --videos.`);
    process.exit(1);
  }
  const tests = browserTestsChanged();
  const steps = planned(STEPS, { ...tests, videos: args.includes('--videos') });
  const done = runAll(steps, runStep, { keepGoing: args.includes('--keep-going'), say: console.log });

  console.log('\n== Before the push');
  for (const step of done) {
    const more = step.why ? `: ${step.why}` : step.status === 'not run' ? '' : ` (${step.seconds} s)`;
    console.log(`${step.status.padEnd(10)} ${step.name}${more}`);
  }
  console.log(`\nLeft to do by hand (DEVELOPING.md):\n${leftByHand({ changed: uncommitted(), outside: tests.outside }).join('\n')}`);
  const open = done.filter((step) => step.status === 'failed' || step.status === 'not run');
  if (open.length) {
    console.log(`\nNot ready to push: ${open.map((step) => `${step.name} ${step.status === 'failed' ? 'failed' : 'was not run'}`).join('; ')}.`);
    process.exit(1);
  }
  console.log('\nEvery step passed.');
}

if (isMain(import.meta)) main();
