#!/usr/bin/env node
// Check the interface languages in site/js/i18n/ against the English text
// of the page: every t('…') and plural(…) call in site/js, every element of
// site/index.html marked data-i18n and every attribute named in
// data-i18n-attr.
//
//   node scripts/check-languages.mjs              # report on every language
//   node scripts/check-languages.mjs --template   # print a dictionary of all English texts
//
// For each language it lists English texts it lacks, texts whose English is no
// longer used, and texts whose {placeholders} or HTML tags differ from the
// English. The exit code is 1 if anything is wrong.

import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const require = createRequire(import.meta.url);
const { normalize } = require('../site/js/i18n.js');

// Files whose text is not interface text: the language layer itself and the generated data.
const SKIP = new Set(['i18n.js', 'dx-data.js', 'dx-data-community.js']);
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const STRING = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\`(?:[^\`\\$]|\\.)*\``;

function unquote(literal) {
  const body = literal.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (m, c) => {
    if (c[0] === 'u') return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16));
    return { n: '\n', t: '\t' }[c] || c;
  });
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** English texts used by the scripts, and calls whose text cannot be read statically. */
export function scriptKeys(file, text) {
  const keys = [];
  const problems = [];
  const call = new RegExp(String.raw`(?<![\w.$])t\(\s*(${STRING})?`, 'g');
  for (const m of text.matchAll(call)) {
    if (m[1]) keys.push({ key: unquote(m[1]), where: `${file}:${lineOf(text, m.index)}` });
    else problems.push(`${file}:${lineOf(text, m.index)}: t() needs a literal string`);
  }
  const plural = new RegExp(String.raw`\bplural\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*(${STRING})\s*,\s*(${STRING})`, 'g');
  const pluralCalls = [...text.matchAll(/\bplural\(/g)].length;
  const pluralKeys = [...text.matchAll(plural)];
  for (const m of pluralKeys) keys.push({ key: unquote(m[2]), where: `${file}:${lineOf(text, m.index)}` });
  if (pluralKeys.length !== pluralCalls) problems.push(`${file}: plural() needs a count and two literal strings`);
  return { keys, problems };
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** English texts of the elements and attributes that index.html marks for other languages. */
export function pageKeys(file, html) {
  const keys = [];
  const stack = [];
  const tag = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const m of html.matchAll(tag)) {
    const [whole, , closing, rawName, attrs = ''] = m;
    if (!rawName) continue; // comment, script or style
    const name = rawName.toLowerCase();
    if (closing) {
      while (stack.length) {
        const open = stack.pop();
        if (open.name === name) {
          if (open.marked) keys.push({ key: normalize(html.slice(open.start, m.index)), where: `${file}:${lineOf(html, open.start)}`, html: true });
          break;
        }
      }
      continue;
    }
    const attr = Object.fromEntries([...attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] === undefined ? '' : decode(a[2])]));
    for (const a of (attr['data-i18n-attr'] || '').split(/\s+/).filter(Boolean)) {
      if (attr[a] !== undefined) keys.push({ key: normalize(attr[a]), where: `${file}:${lineOf(html, m.index)} [${a}]` });
    }
    if (!VOID.has(name) && !whole.endsWith('/>')) stack.push({ name, marked: 'data-i18n' in attr, start: m.index + whole.length });
  }
  return keys;
}

export async function collectKeys() {
  const used = new Map();
  const problems = [];
  const add = ({ key, where, html }) => {
    if (!used.has(key)) used.set(key, { where, html: Boolean(html) });
  };
  const jsDir = join(SITE, 'js');
  for (const name of (await readdir(jsDir)).filter((n) => n.endsWith('.js') && !SKIP.has(n)).sort()) {
    const r = scriptKeys(`site/js/${name}`, await readFile(join(jsDir, name), 'utf8'));
    r.keys.forEach(add);
    problems.push(...r.problems);
  }
  pageKeys('site/index.html', await readFile(join(SITE, 'index.html'), 'utf8')).forEach(add);
  return { used, problems };
}

export async function loadLanguages() {
  const dir = join(SITE, 'js', 'i18n');
  const files = (await readdir(dir)).filter((n) => n.endsWith('.js')).sort();
  return files.map((name) => Object.assign({ file: `site/js/i18n/${name}` }, require(join(dir, name))));
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (text) => [...String(text).matchAll(/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*")*)>/g)]
  .map((m) => `${m[1].toLowerCase()}${(m[2].match(/\b(?:href|class|data-[\w-]+)="[^"]*"/g) || []).sort().join(' ')}`).sort().join('|');

/** Problems with one language's dictionary, as readable lines. */
export function checkLanguage(lang, used) {
  const lines = [];
  for (const [key, info] of used) {
    if (!(key in lang.strings)) lines.push(`missing: ${JSON.stringify(key)} (${info.where})`);
  }
  for (const [key, value] of Object.entries(lang.strings)) {
    if (!used.has(key)) {
      lines.push(`not used any more: ${JSON.stringify(key)}`);
      continue;
    }
    const forms = typeof value === 'string' ? [value] : Object.entries(value).map(([form, v]) => {
      if (!PLURAL_FORMS.has(form)) lines.push(`unknown plural form "${form}" for ${JSON.stringify(key)}`);
      return v;
    });
    if (typeof value !== 'string' && !('other' in value)) lines.push(`plural forms without "other" for ${JSON.stringify(key)}`);
    for (const v of forms) {
      if (typeof v !== 'string' || !v.trim()) lines.push(`empty text for ${JSON.stringify(key)}`);
      else {
        if (placeholders(v) !== placeholders(key)) lines.push(`placeholders differ: ${JSON.stringify(key)} → ${JSON.stringify(v)}`);
        if (used.get(key).html && tags(v) !== tags(key)) lines.push(`HTML tags differ: ${JSON.stringify(key)} → ${JSON.stringify(v)}`);
      }
    }
  }
  if (!lang.code || !lang.name) lines.push('the file must set code and name');
  return lines;
}

async function main() {
  const { used, problems } = await collectKeys();
  if (process.argv.includes('--template')) {
    const entries = [...used.keys()].map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(k)},`);
    console.log(`  strings: {\n${entries.join('\n')}\n  },`);
    return;
  }
  let failed = problems.length > 0;
  for (const p of problems) console.log(p);
  for (const lang of await loadLanguages()) {
    const lines = checkLanguage(lang, used);
    failed = failed || lines.length > 0;
    console.log(`${lang.file} (${lang.code}, ${lang.name}): ${lines.length ? `${lines.length} problems` : `all ${used.size} texts present`}`);
    for (const l of lines) console.log(`  ${l}`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
