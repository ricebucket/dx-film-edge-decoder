import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const createLookup = require('../../site/js/dx-lookup.js');
const realData = require('../../site/js/dx-data.js');
const realCommunity = require('../../site/js/dx-data-community.js');

// A tiny hand-made dataset, so ranking and edge cases don't depend on the real tables.
const fixture = {
  source: {},
  sensitizers: [{ label: 'Acme', name: 'Acme Film Co.' }, { label: 'Zed', name: 'Zed GmbH', aka: 'ZED Photo' }],
  part1: Array.from({ length: 128 }, (_, n) => (n === 5 ? [0, 0, ''] : n === 6 ? [1, 1, ''] : [-1, 0, n === 7 ? 'Old.' : ''])),
  products: [
    [5, 1, 'ACME Color 200', 0, 1],
    [5, 2, 'ACME Chrome 100', 0, 0],
    [6, -1, 'Zed Pan', 1, 1],
  ],
  augmented: [['912345', 'ACME Special', 0]],
};
const communityFixture = {
  source: {},
  rows: [
    [81, '000811', 'Shop Brand 200 #cheap', '', 'ACME Color 200', 'Acme', 3, 'Nowhere', '1999', '', 'Shop', 2],
    [81, '200810', 'Other Brand 200', '', '', '', -1, '', '', '', '', 0],
    [5391, '753914', 'Out Of Range Cine', '', '', '', -1, '', '', '', '', 1],
    [5, '000054', 'Low Number Pan', '', '', '', -1, '', '', '', '', 0],
  ],
};

describe('lookup with a fixture', () => {
  const lookup = createLookup(fixture, communityFixture);

  test('works without the community data', () => {
    const alone = createLookup(fixture);
    assert.deepEqual(alone.byDx(5, 1).products.map((p) => p.name), ['ACME Color 200']);
    assert.deepEqual(alone.byDx(5, 1).community, []);
    assert.equal(alone.sources.community, null);
  });

  test('byDx combines I3A products and community entries', () => {
    const hit = lookup.byDx(5, 1);
    assert.equal(hit.dxNumber, '5-1');
    assert.equal(hit.extract, 81);
    assert.deepEqual(hit.products.map((p) => p.name), ['ACME Color 200']);
    assert.deepEqual(hit.community.map((c) => c.name), ['Shop Brand 200 #cheap', 'Other Brand 200']);
    assert.equal(hit.part1Info.sensitizer.label, 'Acme');
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

  test('community availability and reliability are decoded', () => {
    const [shop, other] = lookup.byDx(5, 1).community;
    assert.equal(shop.availability, 'on the market');
    assert.equal(shop.reliability, 3);
    assert.equal(other.availability, 'discontinued');
    assert.equal(other.reliability, null);
  });

  test('entries outside the edge-code range never match a DX number', () => {
    const cine = lookup.community.find((c) => c.name === 'Out Of Range Cine');
    assert.equal(cine.part1, null);
    assert.equal(lookup.search('cine')[0], cine, 'still searchable by name');
  });

  test('numbers below 16 match cassettes only, not the bars of DX 0-n (research/04)', () => {
    const low = lookup.community.find((c) => c.name === 'Low Number Pan');
    assert.equal(low.part1, null);
    assert.deepEqual(lookup.byDx(0, 5).community, []);
    assert.equal(lookup.isKnown(0, 5), false);
    assert.deepEqual(lookup.search('0-5'), []);
    assert.deepEqual(lookup.byCassette('000054').sameCode, [low]);
    assert.equal(lookup.search('low number')[0], low, 'still searchable by name');
  });

  test('search ranks name matches and I3A entries first', () => {
    const names = lookup.search('acme').map((e) => e.name);
    assert.deepEqual(names.slice(0, 2), ['ACME Chrome 100', 'ACME Color 200']);
    assert.ok(names.includes('Shop Brand 200 #cheap'), 'matches the "original film" field');
    assert.deepEqual(lookup.search('5-1').map((e) => e.name).slice(0, 1), ['ACME Color 200']);
    assert.deepEqual(lookup.search('zed photo').map((e) => e.name), ['Zed Pan']);
    assert.deepEqual(lookup.search('   '), []);
    assert.equal(lookup.search('acme', 1).length, 1);
  });

  test('byCassette separates exact cassette matches from same-film matches', () => {
    const hit = lookup.byCassette('000815');
    assert.equal(hit.parsed.dxNumber, '5-1');
    assert.deepEqual(hit.sameCode.map((c) => c.name), ['Shop Brand 200 #cheap']);
    assert.deepEqual(hit.sameExtract.map((c) => c.name), ['Other Brand 200']);
    assert.deepEqual(lookup.byCassette('912345').augmented.map((a) => a.name), ['ACME Special']);
    assert.equal(lookup.byCassette('12'), null);
  });
});

describe('lookup with the real tables', () => {
  const lookup = createLookup(realData, realCommunity);

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
      assert.ok(lookup.search(q).some((e) => e.name === 'KODAK TRI-X Pan Film'), q);
    }
    assert.equal(lookup.search('hp5 plus')[0].name, 'HP5 PLUS');
    // Whole-word matches beat word prefixes: Portra before Portrait.
    const portra = lookup.search('portra');
    assert.match(portra[0].name, /PORTRA/);
    assert.ok(portra.findIndex((e) => /Portrait/i.test(e.name)) > portra.findIndex((e) => /PORTRA\b/.test(e.name)));
    assert.equal(lookup.search('79-15')[0].name, 'KODAK Professional BW400CN Film');
    assert.equal(lookup.search('79 15')[0].name, 'KODAK Professional BW400CN Film', 'space as separator');
    assert.ok(lookup.search('ilford delta').length > 0, 'ILFORD resolves through the sensitizer alias');
  });

  test('search reads a DX number in every form the codec does', () => {
    // As typed in "Know the number already?": any separator, full-width
    // signs, and the extract without its leading zero (Lawley writes 550).
    for (const q of ['79-15', '79–15', '79—15', '79/15', '79.15', '79 15', '７９－１５', '1279', '012794']) {
      assert.equal(lookup.search(q)[0].name, 'KODAK Professional BW400CN Film', q);
    }
    for (const q of ['550', '0550', '34-6']) assert.equal(lookup.search(q)[0].name, 'FUJICHROME ASTIA 100 PROFESSIONAL', q);
  });

  test('a DX number written as one lists only that code\'s films, if any', () => {
    // "20-0" is not "200", "0-5" is not "400-5".
    assert.deepEqual(lookup.search('20-0'), []);
    assert.deepEqual(lookup.search('0-5'), []);
    for (const q of ['79-15', 'DX 79-15', 'DX 1279', '012794']) {
      const results = lookup.search(q);
      assert.ok(results.length > 0, q);
      assert.ok(results.every((e) => e.part1 === 79 && e.part2 === 15), q);
    }
  });

  test('names match by words within one field, or neighboring words written together', () => {
    // Not "PhotoPoint / Max" for tmax, nor "exp 2008" for xp2.
    const fields = (e) => [e.name, e.tags, e.original].join(' ');
    assert.ok(lookup.search('tmax').every((e) => /t[\s-]?max/i.test(fields(e))));
    assert.ok(lookup.search('xp2').every((e) => /xp\s?2/i.test(fields(e))));
    assert.equal(lookup.search('portra400')[0].name, 'KODAK Professional PORTRA 400 Film');
    // A hyphenated name is a whole-word match too, so the registry entry comes first.
    assert.equal(lookup.search('T-MAX')[0].source, 'i3a');
    assert.equal(lookup.search('Tri-X')[0].name, 'KODAK TRI-X Pan Film');
    // Three or more words written together.
    assert.equal(lookup.search('tmax400')[0].name, 'KODAK T-MAX 400 Professional Film');
    assert.equal(lookup.search('kodakgold200')[0].name, 'KODAK GOLD 200 Film');
    assert.match(lookup.search('superiaxtra400')[0].name, /SUPERIA X-TRA 400/i);
  });

  test('a number typed with a space, or a DX number also printed in names, finds those names too', () => {
    // "400 135" is no cassette number, though its six digits could be one.
    assert.ok(lookup.search('400 135').some((e) => /135/.test(e.name) && /400/.test(e.name)));
    // 100-2 is a DX number and a generation code: the code's films first, then names with it.
    const gen2 = lookup.search('100-2');
    assert.ok(gen2[0].part1 === 100 && gen2[0].part2 === 2);
    assert.ok(gen2.some((e) => e.name === 'AGFACOLOR OPTIMA 100-2'));
    assert.ok(lookup.search('100-4').some((e) => /VR100-4/.test(e.name)));
    // Still: "20-0" is not "200", nor part of "120-0".
    assert.deepEqual(lookup.search('20-0'), []);
  });

  test('a bare number is a film speed first: its DX number comes after films with it in their name', () => {
    // 1600 is also DX 100-0.
    const results = lookup.search('1600');
    const dx = lookup.byDx(100, 0).community;
    assert.ok(dx.length > 0);
    const firstDx = results.findIndex((e) => dx.includes(e));
    assert.ok(firstDx > 0);
    assert.ok(results.slice(0, firstDx).every((e) => /1600/.test(`${e.name} ${e.original || ''}`)));
    assert.equal(firstDx, results.length - dx.length, 'last');
  });

  test('a registry film has the status its maker\'s section states, and none where it states none', () => {
    const status = (part1, part2, name) => lookup.byDx(part1, part2).products.find((p) => p.name === name).status;
    assert.equal(status(96, 12, 'KODAK GOLD 200 Film'), 'in-use');
    assert.equal(status(79, 7, 'KODACOLOR VR200 Film'), 'discontinued');
    assert.equal(status(1, 3, 'AGFAPAN APX 400 Professional'), 'in-use'); // before Agfa's "no longer manufactured" list
    assert.equal(status(8, 0, 'FUJICOLOR SUPERIA 100'), 'in-use');
    // Harman's section says neither; HP5 was long gone by 2008.
    assert.equal(status(109, 7, 'HP5'), null);
    const counts = {};
    for (const p of lookup.products) counts[p.status] = (counts[p.status] || 0) + 1;
    assert.deepEqual(counts, { 'in-use': 248, discontinued: 55, null: 83 });
  });

  test('a cassette number finds the films recorded with it, whose edge may carry another DX number', () => {
    // Harman Phoenix II: cassette 017765 (1776 = 111-0), edge code 105-3 in its notes.
    const found = lookup.search('017765');
    assert.ok(found.some((e) => e.source === 'community' && e.full === '017765' && e.part1 === 105 && e.part2 === 3));
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
