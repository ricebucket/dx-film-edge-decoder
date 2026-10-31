#!/usr/bin/env node
// Check the interface languages in site/js/i18n/ against the English text
// of the pages: every t('…'), i18n.parts('…') and plural(…) call in
// site/js, every element of site/*.html marked data-i18n and every attribute
// named in data-i18n-attr.
// The sources page is written once per language instead, and each language's
// version (site/sources.zh-CN.html …) is checked against site/sources.html.
//
//   node scripts/check-languages.mjs              # report on every language
//   node scripts/check-languages.mjs --template   # print a dictionary of all English texts
//
// It also checks that site/js/prepaint.js lists every language file, since
// index.html loads only the file of the language it is shown in.
//
// For each language it lists English texts it lacks, texts whose English is no
// longer used, texts whose {placeholders} or HTML tags differ from the English,
// a missing version of the message for visitors without JavaScript (the
// <noscript> block of site/index.html, which the language files cannot supply),
// and where its version of the sources page differs from the English page in
// more than its text. The exit code is 1 if anything is wrong.

import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from './lib/main.mjs';

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
  // i18n.parts('…', …): t() in pieces, for a text with elements in it.
  const parts = new RegExp(String.raw`\bi18n\.parts\(\s*(${STRING})?`, 'g');
  for (const m of text.matchAll(parts)) {
    if (m[1]) keys.push({ key: unquote(m[1]), where: `${file}:${lineOf(text, m.index)}` });
    else problems.push(`${file}:${lineOf(text, m.index)}: i18n.parts() needs a literal string`);
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

/** English texts of the elements and attributes that a page marks for other languages. */
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

/** The languages, by their lang attributes, of the message for visitors without JavaScript. */
export function noscriptLanguages(html) {
  const block = /<noscript>([\s\S]*?)<\/noscript>/.exec(html);
  return block ? [...block[1].matchAll(/\slang="([^"]+)"/g)].map((m) => m[1]) : [];
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
  for (const name of (await readdir(SITE)).filter((n) => n.endsWith('.html')).sort()) {
    pageKeys(`site/${name}`, await readFile(join(SITE, name), 'utf8')).forEach(add);
  }
  // Only the decoder needs JavaScript; the sources page is written in each language.
  const noscript = noscriptLanguages(await readFile(join(SITE, 'index.html'), 'utf8'));
  if (!noscript.includes('en')) problems.push('site/index.html: the message for visitors without JavaScript has no English version (lang="en")');
  return { used, problems, noscript };
}

/**
 * Whether js/prepaint.js lists every language file by its code and name, and
 * nothing else: index.html loads a file only for a language in that list, and
 * its language menu shows the list. Each also needs the two texts the page
 * shows when that file is slow to come.
 */
export function checkList(listed, languages) {
  const entry = (l) => `${l.code} ${l.name}`;
  const files = languages.map(entry).sort().join(', ');
  const list = listed.map(entry).sort().join(', ');
  const problems = list === files ? [] : [`site/js/prepaint.js lists ${list || 'no language'}, but site/js/i18n/ has ${files || 'no language'}`];
  const texts = { waiting: 'the note shown when its file is slow to come', english: 'the button that shows the page in English instead' };
  for (const l of listed) {
    for (const [key, what] of Object.entries(texts)) {
      if (typeof l[key] !== 'string' || !l[key].trim()) problems.push(`site/js/prepaint.js: ${l.code} needs \`${key}\`, ${what}`);
    }
  }
  return problems;
}

export async function loadLanguages() {
  const dir = join(SITE, 'js', 'i18n');
  const files = (await readdir(dir)).filter((n) => n.endsWith('.js')).sort();
  return files.map((name) => Object.assign({ file: `site/js/i18n/${name}` }, require(join(dir, name))));
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

/**
 * Every tag with all its attributes, however they are quoted, so that a
 * language can't add an attribute (an event handler, say) or a tag that the
 * English lacks: i18n.js puts these texts into the page as HTML.
 */
const tags = (text) => [...String(text).matchAll(/<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)]
  .map((m) => {
    const attrs = [...m[2].matchAll(/([^\s"'=<>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)]
      .map(([, name, value = '']) => `${name.toLowerCase()}=${value.replace(/^["']|["']$/g, '')}`);
    return `${m[1].toLowerCase()}[${attrs.sort().join(' ')}]`;
  }).sort().join('|');

/**
 * Whether every "<" in a text starts a tag written plainly, as the English
 * ones are: a name and double-quoted attributes. A browser reads stray quotes
 * in a tag differently from the comparison above, and could find an attribute
 * there that the comparison missed.
 */
const PLAIN_TAG = /<\/?[a-zA-Z][\w-]*(?:\s+[\w:-]+="[^"<>]*")*\s*>/g;
const plainTags = (text) => (String(text).match(/</g) || []).length === (String(text).match(PLAIN_TAG) || []).length;

/** Problems with one language's dictionary, and its message for visitors without JavaScript, as readable lines. */
export function checkLanguage(lang, used, noscript) {
  const lines = [];
  if (noscript && !noscript.includes(lang.code)) {
    lines.push(`no version of the message for visitors without JavaScript: add one with lang="${lang.code}" to the <noscript> block of site/index.html`);
  }
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
        else if (used.get(key).html && !plainTags(v)) lines.push(`HTML tags not written plainly (name and double-quoted attributes only): ${JSON.stringify(key)} → ${JSON.stringify(v)}`);
      }
    }
  }
  if (!lang.code || !lang.name) lines.push('the file must set code and name');
  return lines;
}

// ---- the pages written once per language ------------------------------------------

/** These pages are site/<page>.html in English and site/<page>.<code>.html in each other language. */
const PER_LANGUAGE = ['sources'];
const fileIn = (page, code) => (code === 'en' ? `${page}.html` : `${page}.${code}.html`);
const ENGLISH = require('../site/js/i18n.js').languages.find((l) => l.code === 'en');
// Attributes that hold text, which each version has in its language.
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'alt', 'data-to-light', 'data-to-dark']);

/** Every start tag of a page, in order, with its attributes, the text that follows it up to the next tag, and where it is. */
function startTags(html) {
  const tag = /<!--[\s\S]*?-->|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>([^<]*)/g;
  return [...html.matchAll(tag)].filter((m) => m[1]).map((m) => ({
    name: m[1].toLowerCase(),
    attrs: Object.fromEntries([...m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] === undefined ? '' : a[2]])),
    text: normalize(m[3]),
    index: m.index,
    line: lineOf(html, m.index),
  }));
}

/**
 * What an attribute of the English page is in a language's version: the same
 * value, but the page's language on <html>, the language named on links to
 * index.html (index.html?lang=zh-CN#how), the language chosen in the menu, and
 * in the header the language file's text for text it has. null means the
 * attribute is absent, undefined that it is free: other text in the language.
 */
function versionOf(el, name, code, strings, inHeader) {
  const value = el.attrs[name];
  if (el.name === 'html' && name === 'lang') return code;
  if (el.name === 'option' && name === 'selected') return el.attrs.value === code ? '' : null;
  if (value === undefined) return null;
  if (TEXT_ATTRIBUTES.has(name)) {
    const entry = inHeader ? strings[normalize(decode(value))] : undefined;
    return typeof entry === 'string' ? entry.replace(/&/g, '&amp;').replace(/"/g, '&quot;') : undefined;
  }
  const [, page, hash = ''] = name === 'href' ? /^([\w-]+)\.html(#.*)?$/.exec(value) || [] : [];
  if (page === 'index') return `index.html?lang=${encodeURIComponent(code)}${hash}`;
  if (PER_LANGUAGE.includes(page)) return fileIn(page, code) + hash;
  return value;
}

/**
 * Where a language's version of a page written once per language differs from
 * the English page in more than its text: both have the same elements with
 * the same attributes (see versionOf), and the same language names in the
 * menu. The header reads as on index.html, from the language file.
 */
export function checkVersion(lang, english, version, file) {
  const lines = [];
  const ours = startTags(english);
  const theirs = startTags(version);
  const headerEnd = english.indexOf('</header>');
  for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
    const a = ours[i];
    const b = theirs[i];
    if (!a || !b || a.name !== b.name) {
      const where = b ? `line ${b.line}: <${b.name}>` : 'its end';
      lines.push(`${file}, ${where} where the English page has ${a ? `<${a.name}> (line ${a.line})` : 'its end'}: the two need the same elements`);
      break;
    }
    const inHeader = a.index < headerEnd;
    const names = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs), ...(a.name === 'option' ? ['selected'] : [])]);
    for (const name of names) {
      const want = versionOf(a, name, lang.code, lang.strings, inHeader);
      const has = b.attrs[name] === undefined ? null : b.attrs[name];
      const at = `${file}, line ${b.line}: <${b.name}>`;
      if (want === null && has !== null) lines.push(`${at} should not have ${name}`);
      else if (want !== null && has === null) lines.push(`${at} lacks ${name}${want ? `=${JSON.stringify(want)}` : ''}`);
      else if (want && has !== want) lines.push(`${at} has ${name}=${JSON.stringify(has)}, should have ${JSON.stringify(want)}`);
    }
    const entry = inHeader && a.text ? lang.strings[a.text] : undefined;
    const text = a.name === 'option' ? a.text : typeof entry === 'string' ? normalize(entry) : null;
    if (text !== null && b.text !== text) lines.push(`${file}, line ${b.line}: <${b.name}> reads ${JSON.stringify(b.text)}, should read ${JSON.stringify(text)}`);
  }
  return lines;
}

/** Whether an English page's language menu lists every language, in its own name, with English chosen. */
export function checkMenu(english, languages, file) {
  const listed = startTags(english).filter((el) => el.name === 'option')
    .map((el) => `${el.attrs.value}/${el.attrs.lang} ${el.text}${'selected' in el.attrs ? ' (chosen)' : ''}`);
  const wanted = [ENGLISH, ...languages].map((l) => `${l.code}/${l.code} ${l.name}${l.code === 'en' ? ' (chosen)' : ''}`);
  return listed.join(', ') === wanted.join(', ') ? [] : [`${file}: the language menu lists ${listed.join(', ') || 'nothing'} instead of ${wanted.join(', ')}`];
}

/** The English text of each page written once per language, and its version in each language (null where it is missing). */
export async function loadVersions(languages) {
  const read = (name) => readFile(join(SITE, name), 'utf8').catch(() => null);
  return Promise.all(PER_LANGUAGE.map(async (page) => ({
    page,
    english: await read(fileIn(page, 'en')),
    versions: Object.fromEntries(await Promise.all(languages.map(async (l) => [l.code, await read(fileIn(page, l.code))]))),
  })));
}

/** Problems with one language's versions of the pages written once per language, as readable lines. */
export function checkVersions(lang, pages) {
  return pages.flatMap(({ page, english, versions }) => {
    const file = `site/${fileIn(page, lang.code)}`;
    if (versions[lang.code] === null) return [`no version of site/${fileIn(page, 'en')}: write ${file}, with the same elements and links`];
    return checkVersion(lang, english, versions[lang.code], file);
  });
}

async function main() {
  const { used, problems, noscript } = await collectKeys();
  if (process.argv.includes('--template')) {
    const entries = [...used.keys()].map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(k)},`);
    console.log(`  strings: {\n${entries.join('\n')}\n  },`);
    return;
  }
  const languages = await loadLanguages();
  problems.push(...checkList(require('../site/js/prepaint.js').languages, languages));
  const pages = await loadVersions(languages);
  for (const { page, english } of pages) problems.push(...checkMenu(english, languages, `site/${fileIn(page, 'en')}`));
  let failed = problems.length > 0;
  for (const p of problems) console.log(p);
  for (const lang of languages) {
    const lines = [...checkLanguage(lang, used, noscript), ...checkVersions(lang, pages)];
    failed = failed || lines.length > 0;
    const versions = pages.map(({ page }) => `site/${fileIn(page, lang.code)}`).join(', ');
    console.log(`${lang.file} (${lang.code}, ${lang.name}): ${lines.length ? `${lines.length} problems` : `all ${used.size} texts present; ${versions} in step with the English`}`);
    for (const l of lines) console.log(`  ${l}`);
  }
  process.exit(failed ? 1 : 0);
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
