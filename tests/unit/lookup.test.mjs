import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildIndex } from '../../scripts/lib/dx-index.mjs';

const require = createRequire(import.meta.url);
const createLookup = require('../../site/js/dx-lookup.js');
const realData = require('../../site/js/dx-data.js');
const realCommunity = require('../../site/js/dx-data-community.js');
const realIndex = require('../../site/js/dx-index.js');

const names = (matches) => matches.map((m) => m.entry.name);
// Fixtures as the build writes them: the two tables and their index.
const built = (data, community) => [data, community, buildIndex(data, community)];
// The index lists rows by record number; the page ranks them when it shows them.
const rankedNames = (rows) => createLookup.ranked(rows, (e) => createLookup.scoreOf(e)).map((e) => e.name);

// A tiny hand-made dataset, so ranking and edge cases don't depend on the real tables.
const fixture = {
  source: {},
  sensitizers: [{ label: 'Acme', name: 'Acme Film Co.' }, { label: 'Zed', name: 'Zed GmbH', aka: 'ZED Photo' }],
  part1: Array.from({ length: 128 }, (_, n) => (n === 5 ? [0, 0, ''] : n === 6 ? [1, 1, ''] : [-1, 0, n === 7 ? 'Old.' : ''])),
  // Each row starts with its record ID.
  products: [
    [1, 5, 1, 'ACME Color 200', 0, 1],
    [2, 5, 2, 'ACME Chrome 100', 0, 0],
    [3, 6, -1, 'Zed Pan', 1, 1],
  ],
  augmented: [[1, '912345', 'ACME Special', 0]],
};
const communityFixture = {
  source: {},
  rows: [
    [1, 81, '000811', 'Shop Brand 200 #cheap', '', 'ACME Color 200', 'Acme', 3, 'Nowhere', '1999', '', 'Shop', 2],
    [2, 81, '200810', 'Other Brand 200', '', '', '', -1, '', '', '', '', 0],
    [3, 5391, '753914', 'Out Of Range Cine', '', '', '', -1, '', '', '', '', 1],
    [4, 5, '000054', 'Low Number Pan', '', '', '', -1, '', '', '', '', 0],
    // Its cassette gives 5-1, but it records 5-2.
    [5, 82, '000813', 'Odd Brand 100', '', '', '', -1, '', '', '', '', 0],
    // Only a cassette number, which gives 5-1.
    [6, -1, '100810', 'Unsure Brand 200', '', 'Uncertain DX', '', -1, '', '', '', '', 0],
    // 5-1, without a cassette number.
    [7, 81, '', 'Loose Brand 200', '', '', '', -1, '', '', '', '', 0],
    // 5-1, with a cassette number that gives 5-2.
    [9, 81, '300822', 'Mislabeled Brand 200', '', '', '', -1, '', '', '', '', 0],
  ],
};

describe('lookup with a fixture', () => {
  const lookup = createLookup(...built(fixture, communityFixture));

  test('needs all three files: without one, it stops with an error that names them', () => {
    assert.throws(() => createLookup(fixture, undefined, buildIndex(fixture, communityFixture)), /dx-data-community\.js/);
    assert.throws(() => createLookup(fixture, communityFixture), /dx-index\.js/);
    assert.throws(() => createLookup(undefined, communityFixture, buildIndex(fixture, communityFixture)), /dx-data\.js/);
  });

  test('byDx combines I3A products, the community entries that record the number, and those only related by their cassette number', () => {
    const hit = lookup.byDx(5, 1);
    assert.equal(hit.dxNumber, '5-1');
    assert.equal(hit.extract, 81);
    assert.deepEqual(hit.products.map((p) => p.name), ['ACME Color 200']);
    // Ranked: the one whose cassette number gives 5-1 and that has no note first, those whose cassette number does not give it last.
    assert.deepEqual(rankedNames(hit.community), ['Other Brand 200', 'Shop Brand 200 #cheap', 'Loose Brand 200', 'Mislabeled Brand 200']);
    assert.deepEqual(rankedNames(hit.related), ['Odd Brand 100', 'Unsure Brand 200']);
    assert.equal(hit.part1Info.sensitizer.label, 'Acme');
    assert.deepEqual(lookup.byDx(5, 2).community.map((c) => c.name), ['Odd Brand 100']);
    assert.deepEqual(lookup.byDx(5, 2).related.map((c) => c.name), ['Mislabeled Brand 200']);
  });

  test('a product listed without Part 2 matches every Part 2', () => {
    for (const part2 of [0, 9, 15]) {
      const hit = lookup.byDx(6, part2);
      assert.deepEqual(hit.products.map((p) => [p.name, p.wildcard]), [['Zed Pan', true]]);
    }
    assert.equal(lookup.part1Info(6).aps, true);
  });

  test('unassigned numbers report their history', () => {
    assert.deepEqual(lookup.part1Info(7), { part1: 7, assigned: false, sensitizer: null, aps: false, previously: 'Old.' });
    assert.deepEqual(lookup.byDx(7, 0).products, []);
    assert.ok(lookup.byDx(5, 2).products.length > 0);
  });

  test('community availability and reliability are decoded, and nothing is added to the rows', () => {
    const shop = lookup.community.find((c) => c.name === 'Shop Brand 200 #cheap');
    const other = lookup.community.find((c) => c.name === 'Other Brand 200');
    assert.equal(shop.availability, 'on the market');
    assert.equal(shop.reliability, 3);
    assert.equal(other.availability, 'discontinued');
    assert.equal(other.reliability, null);
    assert.deepEqual(Object.keys(shop), ['id', 'source', 'record', 'extract', 'part1', 'part2', 'full', 'name', 'tags', 'original', 'manufacturer', 'reliability', 'country', 'from', 'to', 'distributor', 'availability']);
    // Its record ID, by which the page refers to it, and the number its source's table gives it.
    assert.deepEqual([shop.id, shop.record], ['bfd-1', 1]);
    assert.equal(lookup.byId('bfd-9').name, 'Mislabeled Brand 200');
    assert.equal(lookup.byId('bfd-8'), null);
    // Only a cassette number: no DX number is made up from it.
    const unsure = lookup.community.find((c) => c.name === 'Unsure Brand 200');
    assert.equal(unsure.extract, null);
    assert.equal(unsure.part1, null);
  });

  test('entries outside the edge-code range never match a DX number', () => {
    const cine = lookup.community.find((c) => c.name === 'Out Of Range Cine');
    assert.equal(cine.part1, null);
    assert.equal(lookup.search('cine')[0].entry, cine, 'still searchable by name');
  });

  test('numbers below 16 match cassettes only, not the bars of DX 0-n (research/04)', () => {
    const low = lookup.community.find((c) => c.name === 'Low Number Pan');
    assert.equal(low.part1, null);
    assert.deepEqual(lookup.byDx(0, 5).community, []);
    assert.deepEqual(lookup.search('0-5'), []);
    assert.deepEqual(lookup.byCassette('000054').exact, [low]);
    assert.equal(lookup.search('low number')[0].entry, low, 'still searchable by name');
  });

  test('search ranks name matches and I3A entries first', () => {
    const found = names(lookup.search('acme'));
    assert.deepEqual(found.slice(0, 2), ['ACME Chrome 100', 'ACME Color 200']);
    assert.ok(found.includes('Shop Brand 200 #cheap'), 'matches the "original film" field');
    assert.deepEqual(names(lookup.search('zed photo')), ['Zed Pan']);
    assert.deepEqual(lookup.search('   '), []);
  });

  test('byCassette separates exact cassette matches from those where only the roll length differs, those with the same DX digits, and those recorded with them but no cassette number that carries them', () => {
    const hit = lookup.byCassette('000815');
    assert.equal(hit.parsed.dxNumber, '5-1');
    assert.deepEqual(hit.exact, []);
    // The one that records the DX number its digits give first.
    assert.deepEqual(hit.sameFirstFive.map((c) => c.name), ['Shop Brand 200 #cheap', 'Odd Brand 100']);
    assert.deepEqual(hit.sameMiddle.map((c) => c.name), ['Other Brand 200', 'Unsure Brand 200']);
    // Recorded as 5-1 (0081), with no cassette number or one that gives 5-2.
    assert.deepEqual(hit.recordedOnly.map((c) => c.name), ['Loose Brand 200', 'Mislabeled Brand 200']);
    assert.deepEqual(lookup.byCassette('000822').recordedOnly.map((c) => c.name), ['Odd Brand 100']);
    assert.deepEqual(lookup.byCassette('000822').sameMiddle.map((c) => c.name), ['Mislabeled Brand 200']);
    assert.deepEqual(lookup.byCassette('000811').exact.map((c) => c.name), ['Shop Brand 200 #cheap']);
    assert.deepEqual(lookup.byCassette('912345').augmented.map((a) => a.name), ['ACME Special']);
    assert.equal(lookup.byCassette('12'), null);
  });

  test('search finds names and makers, not films by their DX number or cassette number, which have lookups of their own', () => {
    assert.ok(lookup.byDx(5, 1).community.length > 0);
    assert.ok(lookup.byCassette('000811').exact.length > 0);
    for (const q of ['5-1', 'DX 5-1', '0081', '000811']) assert.deepEqual(lookup.search(q), [], q);
    assert.ok(lookup.search('acme').every((m) => !('related' in m)));
  });
});

describe('lookup with the real tables', () => {
  const lookup = createLookup(realData, realCommunity, realIndex);

  test('decodes well-known DX numbers', () => {
    const bw = lookup.byDx(79, 15);
    assert.equal(bw.products[0].name, 'KODAK Professional BW400CN Film');
    assert.equal(bw.part1Info.sensitizer.label, 'Eastman Kodak');
    const shanghai = lookup.byDx(88, 3);
    assert.equal(shanghai.products.length, 4);
    assert.ok(shanghai.products.every((p) => p.wildcard));
  });

  test('finds films by loosely typed names', () => {
    for (const q of ['tri-x', 'tri x', 'trix', 'TRI-X pan']) {
      assert.ok(names(lookup.search(q)).includes('KODAK TRI-X Pan Film'), q);
    }
    assert.equal(names(lookup.search('hp5 plus'))[0], 'HP5 PLUS');
    // Whole-word matches beat word prefixes: Portra before Portrait.
    const portra = names(lookup.search('portra'));
    assert.match(portra[0], /PORTRA/);
    assert.ok(portra.findIndex((n) => /Portrait/i.test(n)) > portra.findIndex((n) => /PORTRA\b/.test(n)));
    assert.ok(lookup.search('ilford delta').length > 0, 'ILFORD resolves through the sensitizer alias');
  });

  test('a DX number or a cassette number finds a film only where its text has it: they have lookups of their own', () => {
    const text = (e) => [e.name, e.tags, e.original, e.manufacturer, e.distributor].filter(Boolean).join(' ').toLowerCase();
    for (const q of ['79-15', 'DX 1279', '012794', '017765', '753914', '832973', '333098']) {
      const words = q.toLowerCase().split(' ');
      assert.ok(lookup.search(q).every((m) => words.every((w) => text(m.entry).includes(w) || text(m.entry).replace(/[^a-z0-9]/g, '').includes(w.replace(/[^a-z0-9]/g, '')))), q);
    }
    assert.deepEqual(lookup.search('012794'), []);
  });

  test('names match by words within one field, or neighboring words written together', () => {
    // Not "PhotoPoint / Max" for tmax, nor "exp 2008" for xp2.
    const fields = (e) => [e.name, e.tags, e.original].join(' ');
    assert.ok(lookup.search('tmax').every((m) => /t[\s-]?max/i.test(fields(m.entry))));
    assert.ok(lookup.search('xp2').every((m) => /xp\s?2/i.test(fields(m.entry))));
    assert.equal(names(lookup.search('portra400'))[0], 'KODAK Professional PORTRA 400 Film');
    // A hyphenated name is a whole-word match too, so the registry entry comes first.
    assert.equal(lookup.search('T-MAX')[0].entry.source, 'i3a');
    assert.equal(names(lookup.search('Tri-X'))[0], 'KODAK TRI-X Pan Film');
    // Three or more words written together.
    assert.equal(names(lookup.search('tmax400'))[0], 'KODAK T-MAX 400 Professional Film');
    assert.equal(names(lookup.search('kodakgold200'))[0], 'KODAK GOLD 200 Film');
    assert.match(names(lookup.search('superiaxtra400'))[0], /SUPERIA X-TRA 400/i);
  });

  test('words that start with "DX" but give no number rank by name, as any words do', () => {
    // Names with both words before those that have them only in other fields.
    const found = names(lookup.search('dx coded'));
    const both = (name) => /\bdx\b/i.test(name) && /\bcoded\b/i.test(name);
    const firstOther = found.findIndex((name) => !both(name));
    assert.ok(firstOther >= 5, found.join(' | '));
    assert.ok(found.slice(firstOther).every((name) => !both(name)), found.join(' | '));
  });

  test('words that start with "DX" but give no number find the same films however "DX" is joined to them', () => {
    const ids = (q) => lookup.search(q).map((m) => m.entry.id).sort();
    const coded = ids('dx coded');
    assert.ok(coded.length >= 5, coded.join());
    for (const q of ['coded dx', 'dx-coded', 'DX-coded', 'dxcoded']) assert.deepEqual(ids(q), coded, q);
  });

  test('a number typed with a space, or a generation code printed in names, finds those names', () => {
    assert.ok(names(lookup.search('400 135')).some((n) => /135/.test(n) && /400/.test(n)));
    // 100-2 is also a generation code, which names carry.
    assert.ok(names(lookup.search('100-2')).includes('AGFACOLOR OPTIMA 100-2'));
    assert.ok(names(lookup.search('100-4')).some((n) => /VR100-4/.test(n)));
  });

  test('a bare number is a word: names with it first, then films that have it only in other fields', () => {
    const results = lookup.search('1600').map((m) => m.entry);
    const inName = results.findIndex((e) => !/1600/.test(e.name));
    assert.ok(inName > 0, 'names first');
    assert.ok(results.slice(inName).every((e) => !/1600/.test(e.name)));
    // DX 100-0 (16 × 100) gives none of its films by that number.
    const dx = lookup.byDx(100, 0).community.filter((e) => !/1600/.test([e.name, e.tags, e.original].join(' ')));
    assert.ok(dx.length > 0 && dx.every((e) => !results.includes(e)));
  });

  test('a registry film has the status its maker\'s section states, and none where it states none', () => {
    const status = (part1, part2, name) => lookup.byDx(part1, part2).products.find((p) => p.name === name).status;
    assert.equal(status(96, 12, 'KODAK GOLD 200 Film'), 'in-use');
    assert.equal(status(79, 7, 'KODACOLOR VR200 Film'), 'discontinued');
    assert.equal(status(8, 0, 'FUJICOLOR SUPERIA 100'), 'in-use');
    // Harman's section says neither; HP5 was long gone by 2008.
    assert.equal(status(109, 7, 'HP5'), null);
    // Agfa's first list has no heading either, though its "no longer
    // manufactured" list follows; it holds films named "(until 12/2001)".
    assert.equal(status(1, 3, 'AGFAPAN APX 400 Professional'), null);
    assert.equal(status(31, 1, 'Perutz Primera 200 (until 12/2001)'), null);
    const counts = {};
    for (const p of lookup.products) counts[p.status] = (counts[p.status] || 0) + 1;
    assert.deepEqual(counts, { 'in-use': 163, discontinued: 55, null: 168 });
  });

  test('the registry\'s augmented cassette numbers are found by their names', () => {
    const coutu = lookup.search('jean coutu').filter((m) => m.entry.source === 'i3a');
    assert.equal(coutu.length, 5);
    assert.ok(coutu.every((m) => m.entry.part1 === null && m.entry.code));
  });

  test('a row keeps its cassette number and its DX number apart, as the database records them', () => {
    // Where the two differ: a deliberate record or a slip, nothing says which.
    const differ = lookup.community.filter((e) => /^\d{6}$/.test(e.full) && e.extract !== null && Number(e.full.slice(1, 5)) !== e.extract).map((e) => e.full).sort();
    assert.deepEqual(differ, ['001742', '002723', '003534', '013980', '014061', '016164', '017765', '018523', '052323', '114064', '333098', '701310']);
    // Two have only a cassette number; one's note says its DX number is uncertain.
    const only = lookup.community.filter((e) => e.extract === null);
    assert.deepEqual(only.map((e) => e.full).sort(), ['015590', '606253']);
    assert.match(only.find((e) => e.full === '015590').original, /Uncertain DX/);
    // Both lists of the DX number index: under the number they record, and
    // under the one their cassette number gives, as only related.
    assert.ok(lookup.byDx(105, 3).community.some((e) => e.full === '017765'));
    assert.ok(lookup.byDx(111, 0).related.some((e) => e.full === '017765'));
    assert.ok(lookup.byDx(97, 7).related.some((e) => e.full === '015590'));
  });

  test('under a DX number, a 35 mm DX film without a note comes first, rather than 16 mm, 120 or sheet film, or a rebrand', () => {
    const first = (part1, part2) => rankedNames(lookup.byDx(part1, part2).community)[0];
    assert.match(first(84, 3), /KM135/); // not the 16 mm movie film
    assert.match(first(52, 13), /LPZ/); // not the 120 roll (LPP120)
    assert.match(first(112, 1), /5026/); // not the sheet film (4106)
    assert.match(first(12, 7), /^Fujicolor Super HGII100/); // not Tudor's rebrand of it
    assert.equal(first(2, 0), 'Sakuracolor SR-100 Dx coded');
    // An entry whose cassette gives another DX number comes after those whose cassette agrees.
    const astral = createLookup.ranked(lookup.byDx(81, 14).community, (e) => createLookup.scoreOf(e));
    assert.ok(astral.findIndex((e) => e.full === '701310') > astral.findIndex((e) => /^\d{6}$/.test(e.full) && Number(e.full.slice(1, 5)) === 1310));
  });

  test('a cassette number\'s films recorded with its DX extract but no cassette number that carries it come in a list of their own', () => {
    // 000004: Neopan Acros 100 (old package) and Acros II 100 have 100004; Neopan 400UG and Neopan SS (first version) no cassette number.
    const hit = lookup.byCassette('000004');
    assert.deepEqual(hit.sameMiddle.map((e) => e.full), ['100004', '100004']);
    assert.deepEqual(hit.recordedOnly.map((e) => e.name), ['Fujifilm Neopan 400UG (Uniform grain, first version)', 'Fujifilm Neopan SS - 100 ISO –']);
    assert.ok(hit.recordedOnly.every((e) => e.extract === 0 && e.full === ''));
    // Harman Phoenix II is recorded as 105-3 (1683) with cassette 017765: a
    // cassette number that gives 105-3 finds it there, as only related.
    const harman = lookup.byCassette('016834');
    assert.deepEqual(harman.recordedOnly.map((e) => e.full), ['017765']);
  });

  test('cassette 017563 is Ilford FP4 Plus, 24 exposures', () => {
    const hit = lookup.byCassette('017563');
    assert.deepEqual(hit.parsed.exposures, { from: 24, to: 24 });
    assert.deepEqual(hit.dx.products.map((p) => p.name), ['FP4 PLUS']);
  });

  test('Kodak augmented cassette numbers name their maker and their I3A entry, but no DX number (Annex A.4)', () => {
    // 832973: 3297 = 16 × 206 + 1, and 206 = 78 + 128, one of Kodak's Part 1 numbers.
    const hit = lookup.byCassette('832973');
    assert.equal(hit.dx, null);
    assert.equal(hit.augmented[0].name, 'KODAK Gold 100 Film for Jean Coutu Pharmacies in Canada');
    // The same film in another roll length: its record, as only related.
    assert.deepEqual(lookup.byCassette('832974').augmentedRelated.map((e) => e.code), ['832973']);
    assert.deepEqual(lookup.byCassette('832974').augmented, []);
    assert.deepEqual(lookup.byCassette('732983').augmentedRelated.map((e) => e.code), ['832983']);
    for (const [code, basePart1] of [['832973', 78], ['732983', 78], ['832983', 78], ['733633', 82], ['833633', 82]]) {
      const other = lookup.byCassette(code);
      assert.equal(other.parsed.augmented.basePart1, basePart1, code);
      assert.match(lookup.part1Info(basePart1).sensitizer.label, /Kodak/, code);
      assert.equal(other.augmented.length, 1, code);
    }
  });

  test('stats are consistent', () => {
    const s = lookup.stats();
    assert.equal(s.products, 386);
    assert.equal(s.assignedPart1, 91);
    assert.ok(s.communityOnlyDxNumbers > 100, 'community data adds many codes beyond the 2008 list');
  });
});

// The scores one part at a time: rows that tie on every part but one, in each
// list that uses them, so that a score changed in dx-lookup.js shows here and
// not only in an index rebuilt with it.
describe('the scores, one part at a time', () => {
  const data = { source: {}, sensitizers: [{ label: 'Acme', name: 'Acme Film Co.' }], part1: Array.from({ length: 128 }, (_, n) => (n === 5 ? [0, 0, ''] : [-1, 0, ''])), products: [], augmented: [] };
  let id = 0; // each row's record ID, in order
  const row = (extract, full, name, note = '', reliability = -1) => [++id, extract, full, name, '', note, '', reliability, '', '', '', '', 0];
  const community = {
    source: {},
    rows: [
      // 5-3: the same in all but the name.
      row(83, '000831', 'Name B'), row(83, '000831', 'Name A'),
      // 5-4: the same in all but the certainty, which rates the note.
      row(84, '000841', 'Sure C', 'A rebrand of X', 1), row(84, '000841', 'Sure D', 'A rebrand of X', 4),
      // 5-5: in each list of cassette 000851, the same in all but the note.
      row(85, '000851', 'Exact A', 'A rebrand of X'), row(85, '000851', 'Exact B'),
      row(85, '000852', 'Roll A', 'A rebrand of X'), row(85, '000852', 'Roll B'),
      row(85, '100851', 'Middle A', 'A rebrand of X'), row(85, '100851', 'Middle B'),
      row(85, '', 'Loose A', 'A rebrand of X'), row(85, '', 'Loose B'),
    ],
  };
  const lookup = createLookup(...built(data, community));

  test('by DX number: the cassette number agreeing, then no note, then the certainty, then the name', () => {
    const dx = (part2) => rankedNames(lookup.byDx(5, part2).community);
    assert.deepEqual(dx(3), ['Name A', 'Name B']);
    assert.deepEqual(dx(4), ['Sure D', 'Sure C']);
    assert.deepEqual(dx(5), ['Exact B', 'Middle B', 'Roll B', 'Exact A', 'Middle A', 'Roll A', 'Loose B', 'Loose A']);
  });

  test('each part of a score outweighs all the parts after it, and a score depends on its film alone', () => {
    const { scoreOf, UNRATED } = createLookup;
    const row = (agree, note, reliability) => ({ source: 'community', extract: 85, full: agree ? '000851' : '100861', original: note ? 'A rebrand of X' : '', reliability });
    const registry = { source: 'i3a', part2: 5 };
    const best = row(true, false, 4);
    const worst = row(false, true, 0);
    // Picked beats a better match; a better match beats the source; the registry beats the best database row.
    assert.ok(scoreOf(worst, 0, true) > scoreOf(registry, 10));
    assert.ok(scoreOf(worst, 7.5) > scoreOf(registry, 7));
    assert.ok(scoreOf(registry, 7) > scoreOf(best, 7));
    // The registry's films with their Part 2 come before those listed for the Part 1 alone, both before the database's.
    assert.ok(scoreOf({ source: 'i3a', part2: null }, 7) < scoreOf(registry, 7));
    assert.ok(scoreOf({ source: 'i3a', part2: null }, 7) > scoreOf(best, 7));
    // A cassette number that agrees beats no note and the highest certainty together; no note beats the certainty.
    assert.ok(scoreOf(row(true, true, 0)) > scoreOf(row(false, false, 4)));
    assert.ok(scoreOf(row(false, false, 0)) > scoreOf(row(false, true, 4)));
    // No certainty counts as the middle of the scale.
    assert.equal(UNRATED, 2);
    assert.equal(scoreOf(row(true, false, null)), scoreOf(row(true, false, 2)));
    assert.ok(scoreOf(row(true, false, null)) > scoreOf(row(true, false, 1)));
  });

  test('the sorter: highest score first, by name where scores are equal, then by record', () => {
    const { ranked } = createLookup;
    const films = [['B', 1, 3], ['A', 1, 4], ['C', 5, 1], ['A', 1, 2]].map(([name, score, record]) => ({ name, score, record }));
    assert.deepEqual(ranked(films, (f) => f.score).map((f) => `${f.name}${f.record}`), ['C1', 'A2', 'A4', 'B3']);
    // In the alphabet's order, whatever the case or the accents.
    const words = ['Beta', 'alpha', 'Éclair', 'Zed'].map((name, i) => ({ name, record: i + 1 }));
    assert.deepEqual(ranked(words, () => 0).map((f) => f.name), ['alpha', 'Beta', 'Éclair', 'Zed']);
  });

  test('by cassette number, in each of its lists: no note first, then the certainty, then the name', () => {
    assert.deepEqual(rankedNames(lookup.byCassette('000831').exact), ['Name A', 'Name B']);
    assert.deepEqual(rankedNames(lookup.byCassette('000841').exact), ['Sure D', 'Sure C']);
    const hit = lookup.byCassette('000851');
    assert.deepEqual([hit.exact, hit.sameFirstFive, hit.sameMiddle, hit.recordedOnly].map(rankedNames),
      [['Exact B', 'Exact A'], ['Roll B', 'Roll A'], ['Middle B', 'Middle A'], ['Loose B', 'Loose A']]);
  });
});

// How well a search matches, one kind of match at a time: a row for each,
// around DX 25-0, which is 400 written as one number, and its cassette
// number 004001.
describe('search, by how well each film matches', () => {
  const data = {
    source: {},
    sensitizers: [{ label: 'Acme', name: 'Acme Film Co.' }],
    part1: Array.from({ length: 128 }, (_, n) => (n === 5 || n === 25 ? [0, 0, ''] : [-1, 0, ''])),
    products: [[1, 25, 0, 'Registry Pan', 0, 1]],
    augmented: [],
  };
  const row = (id, extract, full, name, note = '') => [id, extract, full, name, '', note, '', -1, '', '', '', '', 0];
  const community = {
    source: {},
    rows: [
      row(1, 400, '004001', 'Exact Cassette'), // records 25-0, with exactly this cassette number
      row(2, 400, '004002', 'Roll Length'), // the same first five digits
      row(3, 400, '104001', 'Middle Digits'), // the same middle four
      row(4, 400, '', 'No Cassette'), // records 25-0, without a cassette number
      row(5, 81, '', 'Acme 400'), // 400 as a word
      row(6, 81, '', 'Acme 4000'), // a word that starts with 400
      row(7, 81, '', 'Acme X400'), // 400 inside a word
      row(8, 81, '', 'Plain', 'Same as 4001'), // 400 only in its note
      row(9, 400, '', 'Acme 400 Pro'), // records 25-0, and has 400 as a word
      row(10, 81, '204005', 'Related Row'), // records 5-1; its cassette number gives 25-0
      row(11, 81, '', 'Film 1040'), // the digits 0, 4 and 1, but not as words
      row(12, 81, '', 'Acme 25-0'), // the DX number as typed
      row(13, 81, '', 'Acme 400 DX'), // "DX 400" as words, which that number is not
    ],
  };
  const lookup = createLookup(...built(data, community));
  const found = (q) => names(lookup.search(q));

  test('a number is a word like any other: names with it as a word, as the start of one, inside one, then other fields', () => {
    // Not the films of DX 25-0 (400 = 16 × 25), nor those of cassette numbers with 0400: they have lookups of their own.
    assert.deepEqual(found('400'), ['Acme 400', 'Acme 400 DX', 'Acme 400 Pro', 'Acme 4000', 'Acme X400', 'Plain']);
    assert.deepEqual(found('25-0'), ['Acme 25-0']);
    assert.deepEqual(found('DX 400'), ['Acme 400 DX']);
    assert.deepEqual(found('004001'), []);
  });

  test('a name that carries a number comes before a row that has it only in its note', () => {
    // Both have a note and no certainty, so only how they match tells them apart; by name alone, the note's row would come first.
    const notes = { source: {}, rows: [row(1, 81, '', 'Aaa Note Only', 'Box says 25-0'), row(2, 81, '', 'Acme 25-0', 'A rebrand')] };
    const search = createLookup(...built(data, notes)).search;
    assert.deepEqual(names(search('25-0')), ['Acme 25-0', 'Aaa Note Only']);
  });

  test('every field a row shows is searched, and outside the name a whole word ranks first, then the start of one, then a match inside one', () => {
    const r = (id, name, { note = '', maker = '', country = '', from = '', to = '' } = {}) => [id, 81, '', name, '', note, maker, -1, country, from, to, '', 0];
    const fields = {
      source: {},
      rows: [
        r(1, 'Acme Inside', { maker: 'Acme Company' }), // "pan" inside a word
        r(2, 'Acme Start', { note: 'Panchromatic' }), // the start of a word
        r(3, 'Acme Whole', { note: 'A pan film' }), // a whole word
        r(4, 'Pan F'), // in the name: names come first
        r(5, 'Acme Made', { country: 'Made in Japan', from: '~1991', to: '2004' }), // inside "Japan"
      ],
    };
    const search = createLookup(...built(data, fields)).search;
    const found = (q) => names(search(q));
    // Nothing found is left out: the weaker matches rank lower.
    assert.deepEqual(found('pan'), ['Registry Pan', 'Pan F', 'Acme Whole', 'Acme Start', 'Acme Inside', 'Acme Made']);
    // The country and the years too.
    assert.deepEqual(found('japan'), ['Acme Made']);
    assert.deepEqual(found('1991'), ['Acme Made']);
    assert.deepEqual(found('2004'), ['Acme Made']);
  });

  test('digits joined by a mark stay apart, whatever the mark: "25-0" is no film speed 250, nor part of "125-0" or "25-05"', () => {
    const marks = {
      source: {},
      rows: [
        row(1, 81, '', 'Acme 25-0'), row(2, 81, '', 'Acme 250'), row(3, 81, '', 'Acme 1250'), row(4, 81, '', 'Acme 125-0'), row(5, 81, '', 'Acme 25-05'),
        row(6, 81, '', 'Acme 100 (24+3)'), row(7, 81, '', 'Acme 100 243'), row(8, 81, '', 'Acme 1/125'), row(9, 81, '', 'Acme 1125'), row(10, 81, '', 'Acme Gold 100-2'),
      ],
    };
    const search = createLookup(...built(data, marks)).search;
    const found = (q) => names(search(q));
    assert.deepEqual(found('25-0'), ['Acme 25-0']);
    assert.deepEqual(found('5-0'), []);
    assert.deepEqual(found('100-2'), ['Acme Gold 100-2']);
    // Other marks, one a regular expression reads as more than a mark too.
    assert.deepEqual(found('24+3'), ['Acme 100 (24+3)']);
    assert.deepEqual(found('1/125'), ['Acme 1/125']);
    // Words with letters keep their marks optional, as before.
    assert.deepEqual(found('gold 100'), ['Acme Gold 100-2']);
    // Marks around them are no part of them, as in a sentence: "25-0." is 25-0, not 250.
    for (const q of ['25-0.', '(25-0)', '“25-0”', '25-0，', '25-0。', '「25-0」']) assert.deepEqual(found(q), ['Acme 25-0'], q);
    assert.deepEqual(found('100-2,'), ['Acme Gold 100-2']);
    assert.deepEqual(found('(gold 100-2)'), ['Acme Gold 100-2']);
    // Letters of another script are no marks.
    assert.notDeepEqual(found('甲25-0'), found('25-0'));
  });

  test('digits joined by a mark, outside the name: a whole word first, then the start of one, then inside one', () => {
    const rows = { source: {}, rows: [row(1, 81, '', 'Aaa Inside', 'XRG200-2'), row(2, 81, '', 'Bbb Start', 'box 200-2N'), row(3, 81, '', 'Ccc Whole', 'sold as 200-2 here')] };
    const search = createLookup(...built(data, rows)).search;
    assert.deepEqual(names(search('200-2')), ['Ccc Whole', 'Bbb Start', 'Aaa Inside']);
  });

  test('a whole word in other fields is one field\'s: words of neighboring fields written together are none', () => {
    // "foo" ends the name and "bar" starts the note, and the note has "foobar" inside a word: only inside.
    const rows = { source: {}, rows: [row(1, 81, '', 'Aaa Foo', 'bar xfoobarx'), row(2, 81, '', 'Bbb Start', 'foobarish')] };
    const search = createLookup(...built(data, rows)).search;
    assert.deepEqual(names(search('foobar')), ['Bbb Start', 'Aaa Foo']);
  });

  test('every word somewhere in the name comes before a match in other fields; those typed side by side, before those apart', () => {
    // All with a note and no certainty, so that only how they match tells them apart; by name alone, they would come in the opposite order.
    const rows = {
      source: {},
      rows: [
        row(1, 81, '', 'Zzz xquill glossy', 'A note'), // the words as typed, inside the name
        row(2, 81, '', 'Mmm gloss xquillx', 'A note'), // each word somewhere in the name
        row(3, 81, '', 'Aaa Other', 'quill gloss'), // only in the note
      ],
    };
    const search = createLookup(...built(data, rows)).search;
    assert.deepEqual(names(search('quill gloss')), ['Zzz xquill glossy', 'Mmm gloss xquillx', 'Aaa Other']);
  });

  test('with other words, digits joined by a mark count as a whole word of the name, or the start of one, as words do', () => {
    const rows = { source: {}, rows: [row(1, 81, '', 'Zed Gold 100-2'), row(2, 81, '', 'Acme Golden 100-2'), row(3, 81, '', 'Acme Gold Pack 100-2')] };
    const search = createLookup(...built(data, rows)).search;
    // Every word whole, by name; then "gold" only as the start of a word.
    assert.deepEqual(names(search('gold 100-2')), ['Acme Gold Pack 100-2', 'Zed Gold 100-2', 'Acme Golden 100-2']);
  });

  test('a dash between digits finds the same films however it is typed, and digits joined by one inside a word are no whole word, nor its start', () => {
    const rows = { source: {}, rows: [row(1, 81, '', 'Aaa XRG200-2'), row(2, 81, '', 'Acme XRG 200-2'), row(3, 81, '', 'Acme 200-2N'), row(4, 81, '', 'Acme 2002')] };
    const search = createLookup(...built(data, rows)).search;
    // A whole word, the start of one, then inside one; with an en or em dash,
    // a minus sign, a Chinese input method's "——", or full-width signs.
    for (const q of ['200-2', '200–2', '200—2', '200−2', '200——2', '２００－２']) assert.deepEqual(names(search(q)), ['Acme XRG 200-2', 'Acme 200-2N', 'Aaa XRG200-2'], q);
  });

  test('letters of another script typed against Latin letters or digits are a word of their own, and a word with such letters is matched as typed', () => {
    // Made-up rows: a name that is also given in Chinese, others with the same number, and a name in Cyrillic.
    const rows = { source: {}, rows: [row(1, 81, '', 'Acme Color 200 (彩韵200)'), row(2, 81, '', 'Acme 200'), row(3, 81, '', 'Zed Gold 200'), row(4, 81, '', 'Свема 64'), row(5, 81, '', 'Acme 64')] };
    const search = createLookup(...built(data, rows)).search;
    const found = (q) => names(search(q));
    // Not every film with 200: the letters count, before or after the digits or Latin letters they are typed against.
    for (const q of ['彩韵200', '200彩韵', '彩韵 200', '彩韵acme', 'acme彩韵', '彩韵']) assert.deepEqual(found(q), ['Acme Color 200 (彩韵200)'], q);
    // Letters that no film has find nothing, as they do typed apart.
    for (const q of ['柯达200', '柯达 200', '200柯达']) assert.deepEqual(found(q), [], q);
    // Another alphabet, in either case.
    for (const q of ['свема64', 'Свема64', '64свема']) assert.deepEqual(found(q), ['Свема 64'], q);
    // What the split leaves joined to such letters is matched as typed: found as the name has it, not otherwise.
    assert.deepEqual(found('(彩韵200)'), ['Acme Color 200 (彩韵200)']);
    assert.deepEqual(found('彩韵-200'), []);
    // Words of Latin letters and digits are read as before, full-width ones too.
    assert.deepEqual(found('200').sort(), ['Acme 200', 'Acme Color 200 (彩韵200)', 'Zed Gold 200']);
    assert.deepEqual(found('acme200'), ['Acme 200']);
    assert.deepEqual(found('ａｃｍｅ２００'), ['Acme 200']);
    assert.deepEqual(found('zedgold200'), ['Zed Gold 200']);
  });

  test('a letter of another script written with a mark of its own (a voiced kana, a vowel sign) is split from what is typed after it, as any other letter is', () => {
    // Made-up rows: names also given in kana or Devanagari that end in such a letter (ジ is シ and a voicing mark, once taken apart), and others with the same number.
    const rows = { source: {}, rows: [row(1, 81, '', 'Acme Color 400 (フジ 400)'), row(2, 81, '', 'Acme 400'), row(3, 81, '', 'Zed 400 (コダック 400)'), row(4, 81, '', 'Zed हिंदी 800'), row(5, 81, '', 'Zed 800')] };
    const search = createLookup(...built(data, rows)).search;
    const found = (q) => names(search(q));
    // Together or apart, in either order; half-width, or with its mark typed apart; against Latin letters too.
    for (const q of ['フジ400', '400フジ', 'フジ 400', 'ﾌｼﾞ400', 'フシ\u3099400', 'フジacme', 'acmeフジ']) assert.deepEqual(found(q), ['Acme Color 400 (フジ 400)'], q);
    for (const q of ['हिंदी800', '800हिंदी', 'हिंदी 800']) assert.deepEqual(found(q), ['Zed हिंदी 800'], q);
    // A mark inside the word was never in the way.
    assert.deepEqual(found('コダック400'), ['Zed 400 (コダック 400)']);
    // Letters that no film has still find nothing.
    assert.deepEqual(found('ゴジ400'), []);
  });

  test('words that start with "DX" but give no number are searched as words, however "DX" is joined to them', () => {
    // Rows of their own: names that say "DX coded" in three ways, and one that does not.
    const words = { source: {}, rows: [row(1, 81, '', 'Acme DX coded'), row(2, 81, '', 'Acme DX-coded'), row(3, 81, '', 'Acme dxcoded'), row(4, 81, '', 'Acme coded')] };
    const search = createLookup(...built(data, words)).search;
    const sorted = (q) => names(search(q)).sort();
    assert.deepEqual(sorted('dx coded'), ['Acme DX coded', 'Acme DX-coded', 'Acme dxcoded']);
    for (const q of ['coded dx', 'dx-coded', 'DX-coded', 'dxcoded']) assert.deepEqual(sorted(q), sorted('dx coded'), q);
  });
});

// Each index over its whole input space, against the rows read directly.
describe('the indexes, swept', () => {
  const lookup = createLookup(realData, realCommunity, realIndex);
  const { middleOf } = createLookup;
  // As the index stores them: ranked by their own score, by name where scores are equal.
  const inOrder = (rows) => assert.deepEqual(rows.map((e) => e.id), createLookup.ranked(rows, (e) => createLookup.scoreOf(e)).map((e) => e.id));
  const sameRows = (a, b) => assert.deepEqual(a.map((e) => e.id).sort(), b.map((e) => e.id).sort());

  test('files from different builds stop it with an error, as a missing file does, rather than miss films', () => {
    // A build's version is in all three; one kept from another build has another.
    const other = (file) => ({ ...file, version: '0000000000000000' });
    for (const files of [[other(realData), realCommunity, realIndex], [realData, other(realCommunity), realIndex], [realData, realCommunity, other(realIndex)]]) {
      assert.throws(() => createLookup(...files), /different builds/);
    }
    // Or none at all, from before there were versions, in any one of them.
    assert.match(realIndex.version, /^[0-9a-f]{16}$/);
    const unversioned = ({ version, ...rest }) => rest;
    for (const [n, name] of ['dx-data.js', 'dx-data-community.js', 'dx-index.js'].entries()) {
      const files = [realData, realCommunity, realIndex].map((f, k) => (k === n ? unversioned(f) : f));
      assert.throws(() => createLookup(...files), /different builds/, name);
    }
    // Or files of another deploy than this dx-lookup.js, in any one of them (tests/unit/stamp.test.mjs stamps whole copies).
    for (const n of [0, 1, 2]) {
      const files = [realData, realCommunity, realIndex].map((f, k) => (k === n ? { ...f, build: '0123456789ab' } : f));
      assert.throws(() => createLookup(...files), /another deploy than dx-lookup\.js/, String(n));
    }
    assert.doesNotThrow(() => createLookup(realData, realCommunity, realIndex));
  });

  test('the rows are the sources\' own, unchanged by any lookup', () => {
    const before = JSON.stringify([lookup.products, lookup.community, lookup.augmented]);
    for (let n = 0; n < 2048; n++) lookup.byDx(n >> 4, n & 15);
    for (const e of lookup.community) if (e.full) lookup.byCassette(e.full);
    for (const q of ['portra', 'hp5', '79-15', '012794', '1600', 'fuji 200']) lookup.search(q);
    assert.equal(JSON.stringify([lookup.products, lookup.community, lookup.augmented]), before);
    lookup.community.forEach((e, i) => {
      const [id, extract, full, name] = realCommunity.rows[i];
      assert.deepEqual([e.id, e.extract === null ? -1 : e.extract, e.full, e.name], [`bfd-${id}`, extract, full, name]);
    });
  });

  test('every DX number: the registry\'s films with it, the rows that record it, and those whose cassette number gives it, each complete and in order', () => {
    for (let n = 0; n < 2048; n++) {
      const [part1, part2] = [n >> 4, n & 15];
      const hit = lookup.byDx(part1, part2);
      const exact = lookup.products.filter((p) => p.part1 === part1 && p.part2 === part2);
      const any = lookup.products.filter((p) => p.wildcard && p.part1 === part1);
      // Those with this Part 2 first; the registry's films have the same score, so by name.
      const byScore = (rows) => createLookup.ranked(rows, (e) => createLookup.scoreOf(e));
      assert.deepEqual(hit.products, [...byScore(exact), ...byScore(any)], `${part1}-${part2}`);
      const edge = n >= 16;
      sameRows(hit.community, lookup.community.filter((e) => edge && e.extract === n));
      inOrder(hit.community);
      sameRows(hit.related, lookup.community.filter((e) => edge && middleOf(e.full) === n && e.extract !== n));
      inOrder(hit.related);
    }
  });

  test('every cassette number recorded, and its neighbors: exact, then the same first five digits, then the same middle four, then recorded with that DX extract but no cassette number that carries it, each complete and in order', () => {
    const numbers = new Set();
    for (const e of [...lookup.community, ...lookup.augmented]) {
      // And the numbers that carry the DX extract a row records.
      if (e.extract !== null && e.extract <= 9999) for (let d = 0; d < 10; d++) numbers.add(`${d}${String(e.extract).padStart(4, '0')}${d}`);
      if (!/^\d{6}$/.test(e.full)) continue;
      for (let d = 0; d < 10; d++) numbers.add(e.full.slice(0, 5) + d).add(d + e.full.slice(1));
    }
    // And every middle four digits, so that each row without a cassette number is looked up too.
    for (let m = 0; m < 10000; m++) numbers.add(`0${String(m).padStart(4, '0')}0`);
    // The rows by their middle four digits, to read each number's matches
    // from, and those whose cassette number, if any, does not give the DX
    // extract they record, by that extract.
    const byMiddle = new Map();
    const without = new Map();
    for (const e of lookup.community) {
      if (/^\d{6}$/.test(e.full)) byMiddle.set(e.full.slice(1, 5), [...(byMiddle.get(e.full.slice(1, 5)) || []), e]);
      if (e.extract !== null && middleOf(e.full) !== e.extract) without.set(e.extract, [...(without.get(e.extract) || []), e]);
    }
    for (const digits of numbers) {
      const hit = lookup.byCassette(digits);
      const rows = byMiddle.get(digits.slice(1, 5)) || [];
      sameRows(hit.exact, rows.filter((e) => e.full === digits));
      sameRows(hit.sameFirstFive, rows.filter((e) => e.full !== digits && e.full.slice(0, 5) === digits.slice(0, 5)));
      sameRows(hit.sameMiddle, rows.filter((e) => e.full.slice(0, 5) !== digits.slice(0, 5)));
      sameRows(hit.recordedOnly, without.get(Number(digits.slice(1, 5))) || []);
      for (const list of [hit.exact, hit.sameFirstFive, hit.sameMiddle, hit.recordedOnly]) inOrder(list);
      assert.deepEqual(hit.augmented, lookup.augmented.filter((a) => a.code === digits));
      assert.deepEqual(hit.augmentedRelated, lookup.augmented.filter((a) => a.code !== digits && a.code.slice(1, 5) === digits.slice(1, 5)));
    }
  });

  test('a search\'s matches are the rows themselves', () => {
    const all = new Set([...lookup.products, ...lookup.community, ...lookup.augmented]);
    for (const q of ['portra', 'hp5', 'fomapan 100', 'tri-x', 'superia', 'kodak gold', 'cinestill', '1600']) {
      const found = lookup.search(q);
      assert.ok(found.length > 0 && found.every((m) => all.has(m.entry)), q);
    }
  });
});
