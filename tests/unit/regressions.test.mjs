import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupSnapshot } from '../../scripts/lib/lookup-snapshot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The page's own snapshots need a browser (`npm run check:regressions`); this
// one needs only the lookup code and the data, so it runs with the unit tests.
test('tests/regressions/lookups.txt is what the lookups find (after a change that was meant: `npm run check:regressions -- --update`)', () => {
  const kept = readFileSync(join(ROOT, 'tests', 'regressions', 'lookups.txt'), 'utf8');
  const now = lookupSnapshot(join(ROOT, 'site'));
  if (kept === now) return;
  const [was, is] = [new Set(kept.split('\n')), now.split('\n')];
  const differ = is.filter((line) => !was.has(line));
  const gone = kept.split('\n').filter((line) => !is.includes(line));
  assert.fail(`${differ.length} lines differ and ${gone.length - differ.length > 0 ? gone.length - differ.length : 0} are gone; the first: ${[...differ, ...gone].slice(0, 5).map((line) => line.replace(/\t/g, ' ')).join(' | ')}`);
});

test('every language of the page has its snapshot of the page in tests/regressions (a new language: `npm run check:regressions -- --update`)', () => {
  const languages = ['en', ...readdirSync(join(ROOT, 'site', 'js', 'i18n')).filter((file) => file.endsWith('.js')).map((file) => file.slice(0, -3))];
  assert.deepEqual(languages.filter((language) => !existsSync(join(ROOT, 'tests', 'regressions', `page.${language}.txt`))), []);
});
