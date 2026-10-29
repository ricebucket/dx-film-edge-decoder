import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { collectKeys, loadLanguages, checkLanguage, scriptKeys, pageKeys, noscriptLanguages } from '../../scripts/check-languages.mjs';
import { buildFigures } from '../../scripts/make-figures.mjs';

const require = createRequire(import.meta.url);
const i18n = require('../../site/js/i18n.js');
const ROOT = new URL('../..', import.meta.url).pathname;

// A made-up language with Polish plural rules, to test the plural forms.
i18n.register({
  code: 'pl',
  name: 'Test',
  strings: {
    'Hello {name}': 'Cześć {name}',
    '{n} films found.': { one: '{n} film', few: '{n} filmy', many: '{n} filmów', other: '{n} filmu' },
  },
});
after(() => i18n.use('en'));

describe('language layer', () => {
  test('English is the source: texts pass through with placeholders filled', () => {
    i18n.use('en');
    assert.equal(i18n.current, 'en');
    assert.equal(i18n.t('Hello {name}', { name: 'Ann' }), 'Hello Ann');
    assert.equal(i18n.t('Missing {x} stays {y}', { x: 1 }), 'Missing 1 stays {y}');
    assert.equal(i18n.plural(1, '{n} film found.', '{n} films found.'), '1 film found.');
    assert.equal(i18n.plural(3, '{n} film found.', '{n} films found.'), '3 films found.');
  });

  test('another language gives its own text, and falls back to English when a text is missing', () => {
    assert.equal(i18n.use('pl'), true);
    assert.equal(i18n.t('Hello {name}', { name: 'Ann' }), 'Cześć Ann');
    assert.equal(i18n.t('Not in the dictionary'), 'Not in the dictionary');
    assert.equal(i18n.use('xx'), false, 'unknown languages are ignored');
    assert.equal(i18n.current, 'pl');
  });

  test('plural forms follow the language’s own rules', () => {
    i18n.use('pl');
    const found = (n) => i18n.plural(n, '{n} film found.', '{n} films found.');
    assert.deepEqual([1, 3, 5, 22, 1.5].map(found), ['1 film', '3 filmy', '5 filmów', '22 filmy', '1.5 filmu']);
  });

  test('a language registered twice is an error', () => {
    assert.throws(() => i18n.register({ code: 'pl', name: 'Again', strings: {} }), /twice/);
  });

  test('punctuation and "or" lists follow the current language', () => {
    i18n.use('en');
    assert.equal(i18n.or(['S', 'K']), 'S or K');
    assert.equal(i18n.punctuation().comma, ', ');
  });
});

describe('which language a visitor sees', () => {
  /** A fresh copy of the language layer, loaded as a page with this URL query and saved choice would load it. */
  function shown(search, stored) {
    const file = require.resolve('../../site/js/i18n.js');
    const cached = require.cache[file];
    const had = { location: 'location' in globalThis, localStorage: 'localStorage' in globalThis };
    const before = { location: globalThis.location, localStorage: globalThis.localStorage };
    globalThis.location = { search };
    globalThis.localStorage = { getItem: () => stored };
    delete require.cache[file];
    try {
      const fresh = require(file);
      fresh.register({ code: 'zh-CN', name: '简体中文', strings: {} });
      return fresh.current;
    } finally {
      for (const key of ['location', 'localStorage']) {
        if (had[key]) globalThis[key] = before[key];
        else delete globalThis[key];
      }
      require.cache[file] = cached;
    }
  }

  test('the saved choice, or English', () => {
    assert.equal(shown('', 'zh-CN'), 'zh-CN');
    assert.equal(shown('', null), 'en');
  });

  test('a language in the URL wins, in any case, but only if the page has it', () => {
    assert.equal(shown('?lang=zh-CN', null), 'zh-CN', 'a link or bookmark names the language');
    assert.equal(shown('?lang=zh-cn', null), 'zh-CN');
    assert.equal(shown('?lang=en', 'zh-CN'), 'en');
    assert.equal(shown('?lang=fr', 'zh-CN'), 'zh-CN', 'unknown: the saved choice stays');
  });
});

describe('interface languages', () => {
  test('every language has every English text of the page, with matching placeholders and tags', async () => {
    const { used, problems, noscript } = await collectKeys();
    assert.deepEqual(problems, []);
    assert.ok(used.size > 300, `${used.size} texts`);
    const languages = await loadLanguages();
    assert.ok(languages.some((l) => l.code === 'zh-CN'));
    for (const lang of languages) assert.deepEqual(checkLanguage(lang, used, noscript), [], lang.file);
  });

  test('a language cannot add a tag or attribute the English lacks, however it is written', () => {
    const used = new Map([['Go <em>here</em>', { where: 'x', html: true }]]);
    const check = (text) => checkLanguage({ code: 'de', name: 'Deutsch', strings: { 'Go <em>here</em>': text } }, used, null);
    assert.deepEqual(check('Geh <em>hierhin</em>'), []);
    for (const bad of [
      "Geh <em>hierhin</em><img src='x' onerror='alert(1)'>",
      'Geh <em onmouseover="alert(1)">hierhin</em>',
      'Geh <em style=color:red>hierhin</em>',
      // Stray quotes: a browser finds onmouseover in this tag, a plain comparison of attributes doesn't.
      'Geh <em " <=">" onmouseover=alert(1)>hierhin</em>',
    ]) assert.equal(check(bad).length, 1, bad);
  });

  test('the message for visitors without JavaScript is in index.html in every language, as the language files cannot supply it', () => {
    const html = '<p lang="fr">elsewhere</p><noscript><!-- x --><div><p lang="en">a</p><p lang="zh-CN">b</p></div></noscript>';
    assert.deepEqual(noscriptLanguages(html), ['en', 'zh-CN']);
    const lines = checkLanguage({ code: 'de', name: 'Deutsch', strings: {} }, new Map(), noscriptLanguages(html));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /lang="de"/);
  });

  test('Chinese uses its own punctuation when joining pieces', async () => {
    const zh = (await loadLanguages()).find((l) => l.code === 'zh-CN');
    // No space between pieces of Chinese text, as between "（可信度 3/4）" and the notes before it.
    assert.deepEqual(zh.punctuation, { comma: '，', colon: '：', semicolon: '；', period: '。', sentence: '。', space: '' });
  });

  test('the key extractor finds literal texts and flags calls it cannot read', () => {
    const src = [
      "t('Plain {x}', { x }); t(\"Double\"); t(`Back`);",
      "i18n.plural(n, 'One', '{n} many');",
      'node.textContent = t(variable);',
      'const s = o.t(\'not ours\');',
    ].join('\n');
    const { keys, problems } = scriptKeys('x.js', src);
    assert.deepEqual(keys.map((k) => k.key), ['Plain {x}', 'Double', 'Back', '{n} many']);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /x\.js:3: t\(\) needs a literal string/);
  });

  test('the page extractor reads marked elements and attributes', () => {
    const html = '<p data-i18n>Hello <strong>you</strong>\n  there</p><nav aria-label="Main &amp; more" data-i18n-attr="aria-label"><a data-i18n>Go</a></nav><br><script>if (a < b) x();</script>';
    assert.deepEqual(pageKeys('p.html', html).map((k) => k.key), ['Hello <strong>you</strong> there', 'Main & more', 'Go']);
  });
});

describe('documentation diagrams', () => {
  test('research/img/*.svg match scripts/make-figures.mjs (run `npm run figures` if not)', async () => {
    const files = buildFigures();
    assert.ok(Object.keys(files).some((f) => f.endsWith('.zh-CN.svg')));
    for (const [name, content] of Object.entries(files)) {
      assert.equal(await readFile(join(ROOT, 'research', 'img', name), 'utf8'), content, name);
    }
  });
});
