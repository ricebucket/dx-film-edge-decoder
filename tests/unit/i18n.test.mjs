import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { collectKeys, loadLanguages, checkLanguage, checkList, scriptKeys, pageKeys, noscriptLanguages, loadVersions, checkVersions, checkVersion, checkMenu, checkEnglishLinks } from '../../scripts/check-languages.mjs';
import { buildFigures } from '../../scripts/make-figures.mjs';

const require = createRequire(import.meta.url);
const i18n = require('../../site/js/i18n.js');
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // a path, even with spaces or other letters in it

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
    // A value that ends in a period takes the place of the one after it.
    assert.equal(i18n.t('Assigned to {maker}.', { maker: 'KONICA MINOLTA PHOTO IMAGING, INC.' }), 'Assigned to KONICA MINOLTA PHOTO IMAGING, INC.');
    assert.equal(i18n.t('{maker}. In production.', { maker: 'Acme Co.' }), 'Acme Co. In production.');
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

  test('js/prepaint.js lists every language file, which index.html loads only when shown in it', async () => {
    const languages = await loadLanguages();
    const { languages: listed } = require('../../site/js/prepaint.js');
    assert.deepEqual(checkList(listed, languages), []);
    assert.equal(checkList([], languages).length, 1, 'a file the list leaves out');
    assert.equal(checkList([...listed, { code: 'de', name: 'Deutsch', waiting: 'Wird geladen …', english: 'Auf Englisch zeigen' }], languages).length, 1, 'a language without a file');
    const bare = listed.map(({ code, name }) => ({ code, name }));
    assert.equal(checkList(bare, languages).length, 2 * listed.length, 'a language without the note and button shown while its file is slow to come');
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
    assert.deepEqual(zh.punctuation, { comma: '，', list: '、', colon: '：', semicolon: '；', period: '。', sentence: '。', space: '' });
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

  test('the key extractor reads every way the code calls i18n, and flags any other way of taking texts from it', () => {
    const read = (src) => scriptKeys('x.js', src);
    const src = [
      'const t = root.DX.i18n.t;',
      "i18n.t('On i18n'); root.DX.i18n.parts('In {pieces}', { pieces });",
      "// t('In a comment')",
      "const s = \"t('In a string')\"; t('It\\'s');",
      'i18n.parts(variable);',
    ].join('\n');
    const { keys, problems } = read(src);
    assert.deepEqual(keys.map((k) => k.key), ['On i18n', "It's", 'In {pieces}']);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /x\.js:5: i18n\.parts\(\) needs a literal string/);
    for (const other of ['const { parts } = i18n;', 'const piece = i18n.parts;', 'const say = i18n.t.bind(i18n);', 'const { t } = root.DX.i18n;', 'list.map(i18n.plural);',
      'const L = root.DX.i18n;', 'const { i18n: L } = DX;', "i18n?.t('x');", "root.DX.i18n?.parts('x');", "i18n['t']('x');"]) {
      assert.equal(read(other).problems.length, 1, other);
    }
    // Where t is i18n.t, it is only ever called.
    for (const other of ["['x', 'y'].map(t);", 'const say = t;', "t?.('x');"]) {
      assert.ok(read(`const t = i18n.t;\n${other}`).problems.length > 0, other);
    }
    // With a space before the parenthesis, the text is still read.
    assert.deepEqual(read("const t = i18n.t;\nt ('Spaced'); i18n.parts ('In {x}', { x }); i18n.plural (n, '{n} film', '{n} films');").keys.map((k) => k.key), ['Spaced', 'In {x}', '{n} films']);
    assert.equal(read("i18n.plural (n, label);").problems.length, 1);
    assert.match(read("t('unclosed);").problems[0], /x\.js: cannot read it/);
  });

  test('the page extractor reads marked elements and attributes', () => {
    const html = '<p data-i18n>Hello <strong>you</strong>\n  there</p><nav aria-label="Main &amp; more" data-i18n-attr="aria-label"><a data-i18n>Go</a></nav><br><script>if (a < b) x();</script>';
    assert.deepEqual(pageKeys('p.html', html).map((k) => k.key), ['Hello <strong>you</strong> there', 'Main & more', 'Go']);
  });
});

describe('the check of the languages itself', () => {
  const used = new Map([['Hello {name}', { where: 'a.js:1' }], ['{n} films', { where: 'a.js:2' }]]);
  const check = (strings, more = {}) => checkLanguage({ code: 'de', name: 'Deutsch', strings, ...more }, used, null);
  const good = { 'Hello {name}': 'Hallo {name}', '{n} films': { one: '{n} Film', other: '{n} Filme' } };

  test('a dictionary in step with the English has no problem', () => {
    assert.deepEqual(check(good), []);
  });

  test('it names an English text the language lacks, and a text whose English is gone', () => {
    const { 'Hello {name}': gone, ...without } = good;
    assert.equal(gone, 'Hallo {name}');
    assert.deepEqual(check(without), ['missing: "Hello {name}" (a.js:1)']);
    assert.deepEqual(check({ ...good, 'Old English': 'Altes Englisch' }), ['not used any more: "Old English"']);
    // An English text reworded in the code, and its entry left under the old one: both.
    assert.deepEqual(check({ 'Hi {name}': 'Hallo {name}', '{n} films': good['{n} films'] }), ['missing: "Hello {name}" (a.js:1)', 'not used any more: "Hi {name}"']);
  });

  test('it names placeholders that differ, an empty text, and plural forms it cannot use', () => {
    assert.deepEqual(check({ ...good, 'Hello {name}': 'Hallo {who}' }), ['placeholders differ: "Hello {name}" → "Hallo {who}"']);
    assert.deepEqual(check({ ...good, 'Hello {name}': '  ' }), ['empty text for "Hello {name}"']);
    assert.deepEqual(check({ ...good, '{n} films': { one: '{n} Film' } }), ['plural forms without "other" for "{n} films"']);
    assert.deepEqual(check({ ...good, '{n} films': { uno: '{n} Film', other: '{n} Filme' } }), ['unknown plural form "uno" for "{n} films"']);
  });

  test('a language file must set its code and name', () => {
    assert.deepEqual(check(good, { name: '' }), ['the file must set code and name']);
  });
});

describe('the sources page, written once per language', () => {
  test('every language has its version, in step with the English one', async () => {
    const languages = await loadLanguages();
    const pages = await loadVersions(languages);
    assert.deepEqual(pages.map((p) => p.page), ['sources']);
    for (const { english } of pages) {
      assert.deepEqual(checkMenu(english, languages, 'site/sources.html'), []);
      assert.deepEqual(checkEnglishLinks(english, 'site/sources.html'), []);
    }
    for (const lang of languages) assert.deepEqual(checkVersions(lang, pages), [], lang.code);
  });

  test('a version has the same elements and links, names its language on links to index.html, and takes the header’s text from the language file', () => {
    const lang = { code: 'de', name: 'Deutsch', strings: { Sections: 'Abschnitte', 'How it works': 'So funktioniert es', 'DX number': 'DX-Nummer' } };
    const english = '<html lang="en"><header><nav aria-label="Sections"><a href="index.html?lang=en#how">How it works</a></nav></header>'
      + '<main><h1>Sources</h1><ul><li>Wikipedia’s <a href="https://example.org/dx">DX number</a> article</li></ul></main></html>';
    const version = '<html lang="de"><header><nav aria-label="Abschnitte"><a href="index.html?lang=de#how">So funktioniert es</a></nav></header>'
      + '<main><h1>Quellen</h1><ul><li>Der Wikipedia-Artikel <a href="https://example.org/dx">DX number</a></li></ul></main></html>';
    // Below the header the text is the version's own: an article's title stays as it is.
    assert.deepEqual(checkVersion(lang, english, version, 'v'), []);
    const broken = {
      'a source left out': version.replace(/<li>.*<\/li>/, ''),
      'another link': version.replace('/dx"', '/dx-encoding"'),
      'a link to index.html without the language': version.replace('?lang=de', ''),
      'header text other than the language file’s': version.replace('>So funktioniert es<', '>Wie es geht<'),
      'the wrong language': version.replace('<html lang="de">', '<html lang="en">'),
      'an attribute the English lacks': version.replace('<h1>', '<h1 class="big">'),
    };
    for (const [what, html] of Object.entries(broken)) assert.equal(checkVersion(lang, english, html, 'v').length, 1, what);
  });

  test('the English page’s links to index.html name English', () => {
    assert.deepEqual(checkEnglishLinks('<a class="brand" href="index.html?lang=en">x</a><a href="index.html?lang=en#how">y</a>', 'p'), []);
    for (const href of ['index.html', 'index.html#how', 'index.html?lang=zh-CN#how']) {
      assert.equal(checkEnglishLinks(`<p><a href="${href}">x</a></p>`, 'p').length, 1, href);
    }
  });

  test('a missing version is named, with the file to write', () => {
    const lines = checkVersions({ code: 'de', name: 'Deutsch', strings: {} }, [{ page: 'sources', english: '<p></p>', versions: { de: null } }]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /write site\/sources\.de\.html/);
  });

  test('the English page’s menu lists every language in its own name', async () => {
    const languages = await loadLanguages();
    const menu = '<select><option value="en" lang="en" selected>English</option></select>';
    assert.equal(checkMenu(menu, languages, 'p').length, 1);
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
