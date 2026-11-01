import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildIndex } from '../../scripts/lib/dx-index.mjs';

const require = createRequire(import.meta.url);
const createLookup = require('../../site/js/dx-lookup.js');
const codec = require('../../site/js/dx-codec.js');
const realData = require('../../site/js/dx-data.js');
const realCommunity = require('../../site/js/dx-data-community.js');
const realIndex = require('../../site/js/dx-index.js');

const names = (matches) => matches.map((m) => m.entry.name);
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
  const lookup = createLookup(fixture, communityFixture, buildIndex(fixture, communityFixture));

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
    assert.equal(lookup.isKnown(7, 0), false);
    assert.equal(lookup.isKnown(5, 2), true);
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
    assert.equal(lookup.isKnown(0, 5), false);
    assert.deepEqual(lookup.search('0-5'), []);
    assert.deepEqual(lookup.byCassette('000054').exact, [low]);
    assert.equal(lookup.search('low number')[0].entry, low, 'still searchable by name');
  });

  test('search ranks name matches and I3A entries first', () => {
    const found = names(lookup.search('acme'));
    assert.deepEqual(found.slice(0, 2), ['ACME Chrome 100', 'ACME Color 200']);
    assert.ok(found.includes('Shop Brand 200 #cheap'), 'matches the "original film" field');
    assert.deepEqual(names(lookup.search('5-1')).slice(0, 1), ['ACME Color 200']);
    assert.deepEqual(names(lookup.search('zed photo')), ['Zed Pan']);
    assert.deepEqual(lookup.search('   '), []);
    assert.equal(lookup.search('acme', 1).length, 1);
  });

  test('a DX number found by search lists the rows only related by digits last, marked', () => {
    const found = lookup.search('5-1');
    assert.deepEqual(found.map((m) => [m.entry.name, m.related]), [
      ['ACME Color 200', false], ['Other Brand 200', false], ['Shop Brand 200 #cheap', false], ['Loose Brand 200', false], ['Mislabeled Brand 200', false],
      ['Odd Brand 100', '0081'], ['Unsure Brand 200', '0081']]);
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

  test('a cassette number found by search lists its own records first, then those only related by digits, marked', () => {
    assert.deepEqual(lookup.search('000811').map((m) => [m.entry.name, m.related]), [
      ['ACME Color 200', false], ['Shop Brand 200 #cheap', false],
      ['Odd Brand 100', '0081'], ['Other Brand 200', '0081'], ['Unsure Brand 200', '0081'], ['Loose Brand 200', '0081'], ['Mislabeled Brand 200', '0081']]);
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
    assert.equal(names(lookup.search('79-15'))[0], 'KODAK Professional BW400CN Film');
    assert.equal(names(lookup.search('79 15'))[0], 'KODAK Professional BW400CN Film', 'space as separator');
    assert.ok(lookup.search('ilford delta').length > 0, 'ILFORD resolves through the sensitizer alias');
  });

  test('search reads a DX number in every form the codec does', () => {
    // As typed in "Know the number already?": any separator, full-width
    // signs, and the extract without its leading zero (Lawley writes 550).
    for (const q of ['79-15', '79–15', '79—15', '79/15', '79.15', '79 15', '７９－１５', '1279', '012794']) {
      assert.equal(names(lookup.search(q))[0], 'KODAK Professional BW400CN Film', q);
    }
    for (const q of ['550', '0550', '34-6']) assert.equal(names(lookup.search(q))[0], 'FUJICHROME ASTIA 100 PROFESSIONAL', q);
  });

  test('a DX number written as one lists only that code\'s films, if any, and then those only related by digits', () => {
    // "20-0" is not "200", "0-5" is not "400-5".
    assert.deepEqual(lookup.search('20-0'), []);
    assert.deepEqual(lookup.search('0-5'), []);
    for (const q of ['79-15', 'DX 79-15', 'DX 1279', '012794']) {
      const results = lookup.search(q);
      assert.ok(results.length > 0, q);
      assert.ok(results.every((m) => m.entry.part1 === 79 && m.entry.part2 === 15), q);
    }
    // 014061 and 114064 give 87-14, but record other numbers.
    const found = lookup.search('87-14');
    const related = found.filter((m) => m.related).map((m) => m.entry.full).sort();
    assert.deepEqual(related, ['014061', '114064']);
    assert.ok(found.findIndex((m) => m.related) > found.findLastIndex((m) => !m.related));
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

  test('a number typed with a space, or a DX number also printed in names, finds those names too', () => {
    // "400 135" is no cassette number, though its six digits could be one.
    assert.ok(names(lookup.search('400 135')).some((n) => /135/.test(n) && /400/.test(n)));
    // 100-2 is a DX number and a generation code: the code's films first, then names with it.
    const gen2 = lookup.search('100-2');
    assert.ok(gen2[0].entry.part1 === 100 && gen2[0].entry.part2 === 2);
    assert.ok(names(gen2).includes('AGFACOLOR OPTIMA 100-2'));
    assert.ok(names(lookup.search('100-4')).some((n) => /VR100-4/.test(n)));
    // Still: "20-0" is not "200", nor part of "120-0".
    assert.deepEqual(lookup.search('20-0'), []);
  });

  test('a bare number is a film speed first: its DX number comes after films with it in their name, before those that only mention it elsewhere', () => {
    // 1600 is also DX 100-0.
    const results = lookup.search('1600').map((m) => m.entry);
    const dx = lookup.byDx(100, 0).community;
    assert.ok(dx.length > 0);
    const firstDx = results.findIndex((e) => dx.includes(e));
    assert.ok(firstDx > 0);
    assert.ok(results.slice(0, firstDx).every((e) => /1600/.test(e.name)));
    assert.deepEqual(results.slice(firstDx, firstDx + dx.length), dx);
    const later = results.slice(firstDx + dx.length);
    assert.ok(later.length > 0 && later.every((e) => !/1600/.test(e.name)));
  });

  test('a cassette number typed one digit at a time is read as one, and comes before films that only contain its digits', () => {
    const found = (q) => lookup.search(q).map((m) => [m.entry.id, m.related]);
    // As typed together: the registry's BW400CN, then the database's three
    // rows that share 1279, marked as only related by those digits.
    const asNumber = found('012794');
    assert.equal(asNumber.length, 4);
    const typed = found('0 1 2 7 9 4');
    assert.deepEqual(typed.slice(0, asNumber.length), asNumber);
    // Then the names that have each digit somewhere: "VR-G400 Gen 2 – VRG 400-1 – Emulsion 5097".
    assert.ok(typed.slice(asNumber.length).some(([id]) => /VR-G400/.test(lookup.byId(id).name)));
    // Harman Phoenix II's 017765 gives 111-0, but it records 105-3: the film
    // with exactly this number, not one of 111-0's fuzzy matches.
    const [first] = lookup.search('0 1 7 7 6 5');
    assert.deepEqual([first.entry.full, first.related], ['017765', false]);
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

  test('a cassette number finds the films recorded with it, as recorded, whatever DX number they give', () => {
    // Harman Phoenix II: cassette 017765 (1776 = 111-0), recorded as 105-3, the code on its edge by its notes.
    const found = lookup.search('017765');
    assert.ok(found.some((m) => !m.related && m.entry.full === '017765' && m.entry.part1 === 105 && m.entry.part2 === 3));
    // Also where the number gives no DX number (5391 and 3297 are above 2047).
    const cinestill = lookup.search('753914').filter((m) => m.entry.full === '753914').map((m) => m.entry.name).sort();
    assert.deepEqual(cinestill, ['CineStill 800T Tungsten Xpro (new) 800Tungsten', 'Cinestill 50D Daylight C-41 / Xpro (new) 50Daylight']);
    assert.ok(lookup.search('753914').filter((m) => m.entry.full !== '753914').every((m) => m.related));
    assert.ok(lookup.search('832973').some((m) => m.entry.full === '832973'));
    // "DX" in front, as for other numbers.
    assert.ok(lookup.search('DX 753914').some((m) => m.entry.full === '753914'));
    // The registry's own augmented numbers come first, by number and by name.
    const coutu = lookup.search('832973')[0].entry;
    assert.equal(coutu.source, 'i3a');
    assert.equal(coutu.name, 'KODAK Gold 100 Film for Jean Coutu Pharmacies in Canada');
    assert.equal(coutu.part1, null);
    assert.ok(lookup.search('DX 733633').some((m) => m.entry.source === 'i3a' && m.entry.code === '733633'));
    assert.equal(lookup.search('jean coutu').filter((m) => m.entry.source === 'i3a').length, 5);
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
    assert.deepEqual(lookup.search('016834').map((m) => [m.entry.full, m.related]), [['017765', '1683']]);
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
    assert.deepEqual(lookup.search('832974').map((m) => [m.entry.source, m.entry.full, m.related]), [['i3a', '832973', '3297'], ['community', '832973', '3297']]);
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
  const lookup = createLookup(data, community, buildIndex(data, community));

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
  const lookup = createLookup(data, community, buildIndex(data, community));
  const found = (q) => lookup.search(q).map((m) => [m.entry.name, m.related]);

  test('a number that may also be a word: names with it as a word, as the start of one, inside one, then its DX number\'s films, then those only related by digits, then other fields', () => {
    assert.deepEqual(found('400'), [
      // Acme 400 Pro is found both as a word and as a film of DX 25-0: the better match counts.
      ['Acme 400', false], ['Acme 400 DX', false], ['Acme 400 Pro', false],
      ['Acme 4000', false],
      ['Acme X400', false],
      ['Registry Pan', false], ['Exact Cassette', false], ['Middle Digits', false], ['Roll Length', false], ['No Cassette', false],
      ['Related Row', '0400'],
      ['Plain', false],
    ]);
  });

  test('a cassette number that may also be words: its films, then the same first five digits, the same middle four, the films that record its DX number, then names with its pieces, then other fields', () => {
    assert.deepEqual(found('0 0 4 0 0 1'), [
      ['Registry Pan', false], ['Exact Cassette', false],
      ['Roll Length', '0400'],
      ['Middle Digits', '0400'], ['Related Row', '0400'],
      ['Acme 400 Pro', '0400'], ['No Cassette', '0400'],
      ['Film 1040', false],
      ['Plain', false],
    ]);
  });

  test('a DX number written as one: its films, those only related by digits, then the names that carry it as typed', () => {
    assert.deepEqual(found('25-0').slice(-2), [['Related Row', '0400'], ['Acme 25-0', false]]);
    // "DX 400" is a number first: its films, then the names with its words as typed.
    assert.deepEqual(found('DX 400').map(([name]) => name), ['Registry Pan', 'Exact Cassette', 'Middle Digits', 'Roll Length', 'Acme 400 Pro', 'No Cassette', 'Related Row', 'Acme 400 DX']);
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
    // Or none at all, from before there were versions.
    const { version, ...unversioned } = realIndex;
    assert.match(version, /^[0-9a-f]{16}$/);
    assert.throws(() => createLookup(realData, realCommunity, unversioned), /different builds/);
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
      assert.equal(lookup.isKnown(part1, part2), hit.products.length + hit.community.length > 0);
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

  test('a search\'s matches are the rows themselves; only a number finds rows related by digits, and after the exact ones', () => {
    const all = new Set([...lookup.products, ...lookup.community, ...lookup.augmented]);
    for (const q of ['portra', 'hp5', 'fomapan 100', 'tri-x', 'superia', 'kodak gold', 'cinestill']) {
      const found = lookup.search(q);
      assert.ok(found.length > 0 && found.every((m) => all.has(m.entry)), q);
      assert.ok(found.every((m) => !m.related), q);
    }
    for (const q of ['79-15', 'DX 87-14', '012794', '002720', '017765', '333098', '753914', 'DX 753914', '1600']) {
      const found = lookup.search(q);
      assert.ok(found.length > 0 && found.every((m) => all.has(m.entry)), q);
      const firstRelated = found.findIndex((m) => m.related);
      if (firstRelated >= 0) assert.ok(found.slice(firstRelated).every((m) => m.related), q);
    }
  });
});
