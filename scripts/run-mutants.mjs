#!/usr/bin/env node
// Does each test still guard what it was written for? `npm run test:mutants`
// tries the mutants of tests/mutants.mjs: each is the project with one thing
// broken (a fix taken out, a rule loosened), beside the test that must then
// fail. A mutant whose test still passes has "survived": the test no longer
// guards that fix.
//
//   npm run test:mutants                    every mutant
//   npm run test:mutants -- mirror photo    those with all these words in their names
//   npm run test:mutants -- --jobs=2        so many at once (4 by default, fewer on a small machine)
//
// It works on copies of the project in the system's temporary folder, removed
// afterward, and never changes the project itself. Each test is first run on
// an unchanged copy, where it must pass. Takes a few minutes: it is not part
// of `npm test`, and not run on GitHub. The browser tests among them need
// Playwright, installed outside this repository; see scripts/run-e2e.mjs.

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from '../tests/mutants.mjs';
import { applyTo, problemsOf } from './lib/mutants.mjs';
import { findPlaywright } from './lib/playwright.mjs';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINUTES = 5; // the longest one run may take
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Run a command in a copy; resolves with its exit code and everything it printed. */
function command(args, cwd, env) {
  return new Promise((resolve) => {
    // As from a shell: not as on GitHub (CI), which retries, nor as a test file of a test run that this one may be part of.
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, CI: '', NODE_TEST_CONTEXT: undefined, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), MINUTES * 60e3);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

/**
 * Run a mutant's test in the copy `at`: `passed` when the test named ran and
 * passed, `failed` when it ran and failed. Neither, when the run broke some
 * other way (`said` then has its last line).
 */
async function run(test, at) {
  const last = (output) => output.trim().split('\n').pop() || '';
  if (test.kind === 'e2e') {
    const { code, output } = await command(
      ['scripts/run-e2e.mjs', test.file, `--project=${test.device}`, '-g', escaped(test.name), '--workers=1', '--retries=0', '--trace=off', '--reporter=list'],
      at.copy, { PLAYWRIGHT_DIR: at.playwright, E2E_PORT: String(at.port), E2E_OUTPUT_DIR: join(at.copy, '..', `output-${at.port}`) },
    );
    return { passed: code === 0 && /\d+ passed/.test(output), failed: code !== 0 && /\d+ failed/.test(output), said: last(output) };
  }
  if (test.kind === 'unit') {
    const { code, output } = await command(['--test', '--test-reporter=tap', `--test-name-pattern=${escaped(test.name)}`, test.file], at.copy, {});
    const named = [...output.matchAll(/^\s*(not ok|ok) \d+ - (.*)$/gm)].filter((m) => m[2].includes(test.name) && !/# SKIP/i.test(m[2]));
    const failed = named.some((m) => m[1] === 'not ok');
    return { passed: code === 0 && named.length > 0 && !failed, failed, said: last(output) };
  }
  // The page's snapshots (`npm run check:regressions`).
  const { code, output } = await command(['scripts/check-regressions.mjs'], at.copy, { PLAYWRIGHT_DIR: at.playwright });
  return { passed: code === 0, failed: code === 1 && /differs from what/.test(output), said: last(output) };
}

const testName = (test) => (test.kind === 'regressions' ? 'check:regressions' : `${basename(test.file)} › ${test.name}${test.kind === 'e2e' ? ` (${test.device})` : ''}`);

async function main() {
  const args = process.argv.slice(2);
  const jobsArg = args.find((arg) => /^--jobs=\d+$/.test(arg));
  const unknown = args.find((arg) => arg.startsWith('--') && arg !== jobsArg);
  if (unknown) {
    console.error(`Unknown option ${unknown}: the only option is --jobs=N; other words choose mutants by name.`);
    process.exit(1);
  }
  const words = args.filter((arg) => arg !== jobsArg).map((word) => word.toLowerCase());
  const problems = problemsOf(MUTANTS, ROOT);
  if (problems.length) {
    console.error(`tests/mutants.mjs is out of step with the code:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const chosen = MUTANTS.filter((mutant) => words.every((word) => mutant.name.toLowerCase().includes(word)));
  if (!chosen.length) {
    console.error(`No mutant has ${words.map((word) => `"${word}"`).join(' and ')} in its name.`);
    process.exit(1);
  }
  const needsBrowser = chosen.some((mutant) => mutant.fails.kind !== 'unit');
  const playwright = needsBrowser ? findPlaywright() : '';
  const jobs = Math.min(chosen.length, jobsArg ? Math.max(1, Number(jobsArg.slice(7))) : Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))));

  const dir = mkdtempSync(join(tmpdir(), 'dx-mutants-'));
  const remove = () => rmSync(dir, { recursive: true, force: true });
  process.on('SIGINT', () => { remove(); process.exit(130); });
  const counts = { caught: 0, survived: 0, broke: 0 };
  const started = Date.now();
  try {
    const queue = [...chosen];
    const unchanged = new Map(); // each test's run on an unchanged copy, made once
    await Promise.all(Array.from({ length: jobs }, async (_, i) => {
      const at = { copy: join(dir, `copy-${i}`), port: 4180 + i, playwright };
      // The project as it is, changes not yet committed included; without its history and anything installed in it.
      cpSync(ROOT, at.copy, { recursive: true, filter: (from) => !['.git', 'node_modules'].includes(basename(from)) });
      for (let mutant = queue.shift(); mutant; mutant = queue.shift()) {
        const key = JSON.stringify(mutant.fails);
        if (!unchanged.has(key)) unchanged.set(key, run(mutant.fails, at));
        const before = await unchanged.get(key);
        let result;
        if (!before.passed) result = { word: 'BROKE', why: `its test does not pass on the unchanged project: ${before.said}` };
        else {
          const back = applyTo(at.copy, mutant);
          const t0 = Date.now();
          let after;
          try {
            after = await run(mutant.fails, at);
          } finally {
            back();
          }
          const seconds = `${Math.round((Date.now() - t0) / 1000)} s`;
          if (after.failed) result = { word: 'caught', why: seconds };
          else if (after.passed) result = { word: 'SURVIVED', why: 'its test still passes' };
          else result = { word: 'BROKE', why: `the run broke without the test failing: ${after.said}` };
        }
        counts[result.word.toLowerCase()]++;
        console.log(`${result.word.padEnd(9)} ${mutant.name}\n          ${testName(mutant.fails)}: ${result.why}`);
      }
    }));
  } finally {
    remove();
  }
  const minutes = ((Date.now() - started) / 60e3).toFixed(1);
  console.log(`\n${chosen.length} ${chosen.length === 1 ? 'mutant' : 'mutants'} in ${minutes} minutes: ${counts.caught} caught${counts.survived ? `, ${counts.survived} survived` : ''}${counts.broke ? `, ${counts.broke} could not be tried` : ''}.`);
  if (counts.survived) console.log('A mutant that survived: its test no longer fails when the thing it guards is broken. Strengthen the test, or change the mutant if the code now works another way.');
  if (counts.survived || counts.broke) process.exit(1);
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
