import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildIndex } from '../../scripts/lib/dx-index.mjs';
import { LEVELS, ROWS, WORDS } from './search-words.mjs';

// The search by name has three stages (site/js/dx-lookup.js), each tested here
// on its own: the text typed into words (`analyze`), the words against a row
// (`matcher`), and the rows found into a ranked list (`search`).
// tests/unit/lookup.test.mjs then tests the search as a whole, on the real
// tables, and tests/regressions/lookups.txt keeps what every name finds.

const require = createRequire(import.meta.url);
const createLookup = require('../../site/js/dx-lookup.js');
const { analyze, indexRow, matcher, MATCH } = createLookup;
const lookup = createLookup(require('../../site/js/dx-data.js'), require('../../site/js/dx-data-community.js'), require('../../site/js/dx-index.js'));

describe('stage 1: the text typed, as words (analyze)', () => {
  /** A word of `analyze`, as the table writes it. */
  const written = (word) => {
    const text = word.text.normalize('NFC');
    if (word.kind === 'number') return `number ${text}`;
    if (word.kind === 'typed') return `typed ${text}`;
    return word.key === word.text ? text : `${text} → ${word.key}`;
  };

  test('the search takes each typed text of the table (search-words.mjs) as the words listed beside it', () => {
    const wrong = [];
    for (const [typed, words, number = false] of WORDS) {
      const got = analyze(typed);
      const row = `${JSON.stringify(typed)}: ${got.words.map(written).join(' | ') || '(no words)'}${got.number ? ', a number' : ''}`;
      if (got.number !== number || got.words.length !== words.length || got.words.some((word, i) => written(word) !== words[i])) wrong.push(row);
    }
    assert.deepEqual(wrong, []);
  });

  test('the table has every kind of word, and no typed text twice', () => {
    const kinds = new Set(WORDS.flatMap(([typed]) => analyze(typed).words.map((word) => word.kind)));
    assert.deepEqual([...kinds].sort(), ['letters', 'number', 'typed']);
    assert.equal(new Set(WORDS.map(([typed]) => typed)).size, WORDS.length);
  });

  test('a word of the search has only its text and kind, and the letters and digits it is matched by where it is matched by those', () => {
    for (const [typed] of WORDS) {
      for (const word of analyze(typed).words) {
        assert.deepEqual(Object.keys(word), word.kind === 'letters' ? ['text', 'kind', 'key'] : ['text', 'kind'], typed);
        if (word.kind === 'letters') assert.match(word.key, /^[a-z0-9]+$/, typed);
      }
    }
  });

  test('the text is the typed text in lower case, without accents and without the marks around digits joined by a mark', () => {
    assert.equal(analyze('  KODAK  Gold ').text, 'kodak  gold');
    assert.equal(analyze('Café (20-0).').text, 'cafe 20-0');
    assert.equal(analyze('１００－２').text, '100-2');
    assert.equal(analyze('').text, '');
    // Whatever is handed over is read as text.
    for (const nothing of [null, undefined]) assert.deepEqual(analyze(nothing), { text: '', words: [], number: false });
    assert.deepEqual(analyze(400).words, [{ text: '400', kind: 'letters', key: '400' }]);
  });
});

describe('stage 2: the words against a row (matcher)', () => {
  const NAMES = Object.fromEntries(Object.entries(MATCH).map(([name, level]) => [level, name]));
  const row = (key) => indexRow({ name: ROWS[key][0] }, ROWS[key]);
  const levelOf = (typed, key) => {
    const level = matcher(analyze(typed))(row(key));
    return level === 0 ? 'not found' : NAMES[level];
  };

  test('each typed text of the table (search-words.mjs) matches its example row as well as the table says', () => {
    const wrong = LEVELS.filter(([typed, key, level]) => levelOf(typed, key) !== level)
      .map(([typed, key, level]) => `${JSON.stringify(typed)} against ${JSON.stringify(ROWS[key][0])}: ${levelOf(typed, key)}, not ${level}`);
    assert.deepEqual(wrong, []);
  });

  test('the table has every level, "not found" too, and no pair of text and row twice', () => {
    assert.deepEqual([...new Set(LEVELS.map(([, , level]) => level))].sort(), [...Object.keys(MATCH), 'not found'].sort());
    assert.equal(new Set(LEVELS.map(([typed, key]) => `${typed}\n${key}`)).size, LEVELS.length);
    for (const [, key] of LEVELS) assert.ok(ROWS[key], key);
  });

  test('the levels are numbers from 10 down, in the order the table lists them: a better match always scores higher', () => {
    const order = ['words', 'starts', 'inName', 'pieces', 'elsewhere', 'elsewhereStarts', 'elsewhereInside'];
    assert.deepEqual(Object.keys(MATCH), order);
    const levels = order.map((name) => MATCH[name]);
    assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
    assert.equal(new Set(levels).size, levels.length);
    // Below an exact match (10, as the lookups by number give) and above no match at all.
    assert.ok(levels.every((level) => level > 0 && level < 10));
  });

  test('a row of the index keeps each field apart, its name first, and a row without a field has no words from it', () => {
    const film = { name: 'T-MAX 400' };
    const made = indexRow(film, ['T-MAX 400', '', null, 'Eastman Kodak', undefined]);
    assert.equal(made.entry, film);
    assert.equal(made.name, 't-max 400');
    assert.equal(made.text, 't-max 400 eastman kodak');
    assert.deepEqual(made.fieldWords, [['t', 'max', '400'], ['eastman', 'kodak']]);
    assert.deepEqual(made.words, ['t', 'max', '400', 'eastman', 'kodak']);
    // Words written together from each word on, within the field: never "400eastman".
    assert.deepEqual(made.runs, ['tmax400', 'max400', '400', 'eastmankodak', 'kodak']);
    assert.deepEqual(made.nameRuns, ['tmax400', 'max400', '400']);
    assert.deepEqual(made.nameJoins, ['t', 'tmax', 'tmax400', 'max', 'max400', '400']);
  });

  test('matching leaves the row and the words as they were, and gives the same level again', () => {
    const words = analyze('eastman 400');
    const before = JSON.stringify(words);
    const made = row('tmax');
    const first = matcher(words)(made);
    assert.equal(matcher(words)(made), first);
    assert.equal(JSON.stringify(words), before);
    assert.equal(made.name, 'kodak t-max 400 film');
  });
});

describe('stage 3: the rows found, ranked (search)', () => {
  // A small set of films of its own: for "gold 200", one or two at every level.
  const data = {
    source: {},
    sensitizers: [{ label: 'Acme', name: 'Acme Film Co.' }],
    part1: Array.from({ length: 128 }, (_, n) => (n === 5 ? [0, 0, ''] : [-1, 0, ''])),
    // record, Part 1, Part 2, name, maker, status
    products: [
      [1, 5, 1, 'ACME Gold 200', 0, 1],
      [2, 5, 2, 'ACME Marigold 200X', 0, 1],
      [3, 5, 3, 'ACME Silver 100', 0, 1],
    ],
    augmented: [],
  };
  const community = {
    source: {},
    // record, DX extract, cassette number, name, tags, note, maker, certainty, country, from, to, distributor, availability
    rows: [
      [1, 81, '000811', 'Budget Gold 200', '', '', '', 3, '', '', '', '', 0],
      [2, 81, '000811', 'Bargain Gold 200', '', '', '', 3, '', '', '', '', 0],
      [3, 81, '000811', 'Aurum Gold 2000', '', '', '', 3, '', '', '', '', 0],
      [4, 81, '000811', 'Golden 1200', '', '', '', 3, '', '', '', '', 0],
      [5, 81, '000811', 'Plain Film', '', 'Gold 200 under another name', '', 3, '', '', '', '', 0],
      [6, 81, '000811', 'Other Film', 'golden 2000s', '', '', 3, '', '', '', '', 0],
      [7, 81, '000811', 'Third Film', '', '', 'Marigold 1200 Works', 3, '', '', '', '', 0],
      [8, 81, '000811', 'Gold Only', '', '', '', 3, '', '', '', '', 0],
      [9, 81, '000811', 'Only 200', '', '', '', 3, '', '', '', '', 0],
    ],
  };
  const small = createLookup(data, community, buildIndex(data, community));
  const names = (found) => found.map((f) => f.entry.name);

  test('films are listed by how well they match first, then by their own score, then by name; a film that lacks a word is left out', () => {
    assert.deepEqual(names(small.search('gold 200')), [
      'ACME Gold 200', // whole words of the name; the registry's before the database's …
      'Bargain Gold 200', // … and the database's two, equal in everything else, by name
      'Budget Gold 200',
      'Aurum Gold 2000', // "200" starts a word: ahead of the registry's film below, which matches less well
      'ACME Marigold 200X', // the text as typed, inside a word
      'Golden 1200', // each word somewhere in the name
      'Plain Film', // whole words of its note
      'Other Film', // the start of words of its tags
      'Third Film', // inside words of its maker
    ]);
  });

  test('a search gives the rows themselves, each once, as { entry }', () => {
    const found = small.search('gold');
    assert.ok(found.length > 0);
    for (const item of found) assert.deepEqual(Object.keys(item), ['entry']);
    assert.equal(new Set(found.map((f) => f.entry.id)).size, found.length);
    assert.equal(found[0].entry, small.products[0]);
  });

  test('the order is that of the scores: the match level outweighs everything a film has of its own', () => {
    const { scoreOf } = createLookup;
    const [registry] = small.products;
    const database = small.community[0];
    // One level apart, the weaker source wins with the better match …
    assert.ok(scoreOf(database, MATCH.starts) > scoreOf(registry, MATCH.inName));
    assert.ok(scoreOf(database, MATCH.elsewhereStarts) > scoreOf(registry, MATCH.elsewhereInside));
    // … and at the same level the registry's film comes first.
    assert.ok(scoreOf(registry, MATCH.words) > scoreOf(database, MATCH.words));
  });

  test('a text with no words finds nothing; the lookup gives the same first stage as the page asks', () => {
    assert.deepEqual(lookup.search(''), []);
    assert.deepEqual(lookup.search('   '), []);
    assert.deepEqual(small.search(null), []);
    assert.equal(lookup.analyze, analyze);
  });

  test('the rows of the table that the film data has words for find films', () => {
    for (const typed of ['portra 400', 'T-MAX 100', 'superia x-tra 400', 'tmax400', '彩韵200', '200彩韵', '業務用カラーフィルム100', '写ルンです', '写ルンで1600', 'Свема', 'ДС100', '100-2 optima']) {
      assert.ok(lookup.search(typed).length > 0, typed);
    }
  });
});
