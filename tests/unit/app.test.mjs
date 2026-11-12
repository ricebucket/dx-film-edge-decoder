import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../site/js/app.js', import.meta.url), 'utf8');

// The parts of the page (PARTS in site/js/app.js) are drawn again when their
// view of the state changes. A part that read the state anywhere else would
// show something it does not list, and miss its changes: the bug this
// structure is there to prevent.
test('each part of the page reads the state only in its `view`, which is what decides when it is drawn again', () => {
  const start = app.indexOf('  const PARTS = {\n');
  const end = app.indexOf('\n  };\n', start);
  assert.ok(start > 0 && end > start, 'PARTS not found in site/js/app.js');
  const lines = app.slice(start, end).split('\n');
  const parts = lines.filter((line) => /^ {4}\w+: \{$/.test(line)).map((line) => line.trim().split(':')[0]);
  assert.deepEqual(parts, ['strip', 'toolbar', 'tabs', 'hint', 'source', 'result']);
  // One `view` and one `draw` each; the state is named on the lines of the views alone.
  assert.equal(lines.filter((line) => /^ {6}view: /.test(line)).length, parts.length);
  assert.equal(lines.filter((line) => /^ {6}draw[:(]/.test(line)).length, parts.length);
  const outside = lines.filter((line) => /\bstate\b/.test(line) && !/^ {6}view: /.test(line) && !/^\s*\/\//.test(line));
  assert.deepEqual(outside, []);
  // What follows from the state by a rule (isEmpty, mirrored, photoRow, edited) is asked in the views too.
  const rules = lines.filter((line) => /\b(isEmpty|mirrored|photoOnStrip|photoRow|edited)\(\)/.test(line) && !/^ {6}view: /.test(line));
  assert.deepEqual(rules, []);
});

test('the page keeps what it shows in one object: no part of it in a variable of its own', () => {
  // The tab that is open and where the code came from were such variables once.
  assert.doesNotMatch(app, /^\s*let (way|origin|resultShown|sourceShown)\b/m);
  assert.match(app, /const state = \{ format: 'long', cells: emptyCells\('long'\), loaded: false, picked: \[\], origin: null, way: 'copy', mirrored: false, look: 'negative' \};/);
});
