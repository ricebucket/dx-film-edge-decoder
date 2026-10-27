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

  test('cassette 017563 is Ilford FP4 Plus, 24 exposures', () => {
    const hit = lookup.byCassette('017563');
    assert.equal(hit.parsed.exposures, 24);
    assert.deepEqual(hit.dx.products.map((p) => p.name), ['FP4 PLUS']);
  });

  test('Kodak augmented cassette code resolves without a DX number', () => {
    const hit = lookup.byCassette('832973');
    assert.equal(hit.dx, null);
    assert.equal(hit.augmented[0].name, 'KODAK Gold 100 Film for Jean Coutu Pharmacies in Canada');
  });

  test('stats are consistent', () => {
    const s = lookup.stats();
    assert.equal(s.products, 386);
    assert.equal(s.assignedPart1, 91);
    assert.ok(s.communityOnlyDxNumbers > 100, 'community data adds many codes beyond the 2008 list');
  });
});
