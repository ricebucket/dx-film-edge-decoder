#!/usr/bin/env node
// Run the unit tests in tests/unit (`npm test`), or the test files given, as
// `node --test` does, except that every failure fails the run. Node 22's
// `node --test` reports a describe() whose callback throws as failed, but
// counts no failure and exits 0, so the tests it never reached would be
// missed without a word.

import { run } from 'node:test';
import { spec, tap } from 'node:test/reporters';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'unit');
const files = process.argv.length > 2
  ? process.argv.slice(2).map((file) => resolve(file))
  : readdirSync(UNIT, { recursive: true }).filter((file) => file.endsWith('.test.mjs')).sort().map((file) => join(UNIT, file));

const tests = run({ files, concurrency: true });
// Failed as `node --test` counts it, and also where it counts nothing.
tests.on('test:summary', (summary) => {
  if (!summary.success) process.exitCode = 1;
});
tests.on('test:fail', (failed) => {
  if (!failed.todo) process.exitCode = 1;
});
// The same report as `node --test`: readable in a terminal, TAP otherwise.
tests.compose(process.stdout.isTTY ? spec : tap).pipe(process.stdout);
