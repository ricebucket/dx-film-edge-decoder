import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The documentation and the pages: every .md and .html file outside .git. */
function documents(dir = '') {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return d.name === '.git' || d.name === 'node_modules' ? [] : documents(path);
    return /\.(md|html)$/.test(d.name) ? [path] : [];
  });
}

/**
 * The places a link can lead to in a file: the ids of a page, or of each
 * heading of a .md file as GitHub makes them (lowercase, without punctuation,
 * spaces as hyphens, and -1, -2 … after a heading that repeats).
 */
function places(text, isPage) {
  if (isPage) return new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const ids = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const id = heading[1].replace(/\]\([^)]*\)/g, ']').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    ids.add(n ? `${id}-${n}` : id);
  }
  return ids;
}

test('the links and images in the documentation and the pages lead to files that exist, and to places in them that exist', () => {
  const files = documents();
  const broken = [];
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const targets = file.endsWith('.md')
      ? [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
      : [...text.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const target of targets) {
      if (/^[a-z][\w+.-]*:|^\/\//i.test(target)) continue; // another site
      const [, address, place] = /^([^#]*)(?:#(.*))?$/.exec(target);
      const path = decodeURI(address.split('?')[0]);
      const to = path ? join(dirname(file), path) : file;
      if (!existsSync(join(ROOT, to))) broken.push(`${file}: ${target}`);
      else if (place && /\.(md|html)$/.test(to) && !places(readFileSync(join(ROOT, to), 'utf8'), to.endsWith('.html')).has(decodeURIComponent(place))) {
        broken.push(`${file}: ${target}`);
      }
    }
  }
  assert.ok(files.length > 20, `${files.length} files`);
  assert.deepEqual(broken, []);
});

test('a heading\'s place is named as GitHub names it', () => {
  const ids = places('# 04 – The data\n## `big-film-database/` – community data\n```sh\n# not a heading\n```\n## Fuji’s frame-number barcode\n## 更新数据\n## Notes\n## Notes\n', false);
  assert.deepEqual([...ids], ['04--the-data', 'big-film-database--community-data', 'fujis-frame-number-barcode', '更新数据', 'notes', 'notes-1']);
});

test('the npm commands that the documentation, the scripts and the workflow name are scripts in package.json', () => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const code = readdirSync(join(ROOT, 'scripts'), { recursive: true }).filter((name) => name.endsWith('.mjs')).map((name) => join('scripts', name));
  const named = new Set();
  for (const file of [...documents().filter((name) => name.endsWith('.md')), ...code, '.github/workflows/tests.yml']) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const [, run, alias] of text.matchAll(/\bnpm (?:run ([\w:-]+)|(test|start)\b)/g)) named.add(run || alias);
  }
  assert.ok(named.size >= 10, [...named].join(', '));
  assert.deepEqual([...named].filter((name) => !Object.hasOwn(scripts, name)), []);
});
