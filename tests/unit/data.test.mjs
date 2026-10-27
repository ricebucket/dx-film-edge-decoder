import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildData } from '../../scripts/build-data.mjs';
import { communityStats } from '../../scripts/community-stats.mjs';
import { SHOTS } from '../../scripts/screenshots.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../..', import.meta.url).pathname;
const data = require('../../site/js/dx-data.js');
const community = require('../../site/js/dx-data-community.js');
const createLookup = require('../../site/js/dx-lookup.js');

const product = (part1, part2) =>
  data.products.filter((p) => p[0] === part1 && p[1] === part2).map((p) => p[2]);
const sensitizerOf = (part1) => data.sensitizers[data.part1[part1][0]];

describe('generated data files', () => {
  test('site/js/dx-data*.js match the CSV sources (run `npm run build:data` if not)', async () => {
    for (const [path, text] of Object.entries(await buildData())) {
      assert.equal(await readFile(join(ROOT, path), 'utf8'), text, path);
    }
  });

  test('each file holds one dataset, so each has one licence (see REUSE.toml)', () => {
    assert.deepEqual(Object.keys(data), ['source', 'sensitizers', 'part1', 'products', 'augmented']);
    assert.deepEqual(Object.keys(community), ['source', 'rows']);
  });

  test('the community file carries attribution for the CC BY-SA data', async () => {
    const text = await readFile(join(ROOT, 'site/js/dx-data-community.js'), 'utf8');
    assert.match(text, /The Big Film Database \(dxdatabase\) © 2018 by\s+\*?\s*Dxdatabase/);
    assert.match(text, /creativecommons\.org\/licenses\/by-sa\/4\.0/);
    assert.equal(community.source.license, 'CC BY-SA 4.0');
    assert.match(community.source.commit, /^[0-9a-f]{40}$/);
  });
});

describe('I3A Part 1 assignments', () => {
  test('cover every 7-bit value', () => {
    assert.equal(data.part1.length, 128);
    assert.equal(data.part1[0][0], -1, 'Part 1 = 0 is unassigned');
    assert.equal(data.part1.filter(([s]) => s !== -1).length, 91);
  });

  test('match the assignment table', () => {
    assert.equal(sensitizerOf(8).label, 'FUJIFILM Corporation');
    assert.equal(sensitizerOf(79).label, 'Eastman Kodak');
    assert.equal(sensitizerOf(109).label, 'Harman Technologies');
    assert.equal(sensitizerOf(109).aka, 'ILFORD Photo');
    assert.equal(sensitizerOf(88).name, 'Shanghai General Photosensitive Film Factory');
    assert.equal(sensitizerOf(9).name, 'SVEMA Production Association');
    assert.equal(data.part1[33][1], 1, '33 is an APS number');
    assert.equal(data.part1[34][1], 0);
  });

  test('keep the history of released numbers', () => {
    assert.equal(data.part1[21][2], 'Assigned to Tudor in 1989; never renewed.');
    assert.equal(data.part1[65][2], 'Assigned to 3M in 1985; released 1993.');
    assert.equal(data.part1[119][2], 'Assigned to ORWO in 1988; released 1993.');
    assert.equal(data.part1[96][2], 'Assigned to Eastman Kodak in 1983; released 1988; reassigned 2003.');
  });
});

describe('I3A product list', () => {
  test('has 386 distinct rows (389 printed, three duplicated in the PDF)', () => {
    assert.equal(data.products.length, 386);
  });

  test('every product sits under the sensitizer its Part 1 is assigned to', () => {
    for (const [part1, , name, s] of data.products) {
      assert.equal(data.part1[part1][0], s, `${part1}: ${name}`);
    }
  });

  test('spot checks against the PDF and published examples', () => {
    assert.deepEqual(product(34, 6), ['FUJICHROME ASTIA 100 PROFESSIONAL']); // aurelien.lawley.com.au
    assert.deepEqual(product(79, 15), ['KODAK Professional BW400CN Film']); // Wikipedia sample
    assert.deepEqual(product(47, 1), ['Perutz Primera 200 (from 01/2002 on)']); // Wikimedia photo
    assert.deepEqual(product(109, 12), ['FP4 PLUS']); // cassette 017563 (ISO 125)
    assert.deepEqual(product(115, 3), ['Perutz SC 100-3 Color']); // Wikipedia: ISO 100 → 115-3
    assert.deepEqual(product(115, 4), ['Perutz SC 200-3 Color']); // Wikipedia: ISO 200 → 115-4
    assert.deepEqual(product(95, 2), ['KODAK High Definition 400 Film', 'KODAK Hawkeye Traffic Surveillance Color Film']);
    assert.deepEqual(product(20, 1), ['KODAK PROFESSIONAL EKTACHROME Duplicating Film EDUPE']); // wrapped line
    assert.deepEqual(product(87, 1), ['Ferrania Imaging Color FG100']); // printed as "01"
    assert.equal(product(88, -1).length, 4, 'Shanghai: Part 2 not identified');
  });

  test('records whether a film was still in production in 2008', () => {
    const gold200 = data.products.find((p) => p[0] === 78 && p[1] === 2);
    assert.equal(gold200[4], 0, 'KODAK GOLD 200 (78-2) is in the "no longer manufactured" list');
    const tmax = data.products.find((p) => p[0] === 67 && p[1] === 9);
    assert.equal(tmax[4], 1);
  });

  test('augmented cassette codes from ISO 1007 Annex A.4', () => {
    assert.deepEqual(data.augmented.map((a) => a[0]), ['832973', '732983', '832983', '733633', '833633']);
  });
});

describe('community data', () => {
  test('is a cleaned subset with DX numbers', () => {
    assert.equal(community.rows.length, community.source.rowsKept);
    for (const row of community.rows) {
      const [extract, full, name, tags, original] = row;
      assert.ok(Number.isInteger(extract) && extract >= 0, name);
      assert.ok(full === '' || /^\d{6}$/.test(full), `${name}: ${full}`);
      assert.ok(!name.includes('#'), name);
      assert.ok(!/<\/?[a-z][^>]*>/i.test(name + original), name);
      assert.ok(typeof tags === 'string');
    }
  });

  test('the figures quoted in research/04 agree with the page\'s own counts', async () => {
    const s = await communityStats();
    const page = createLookup(data, community).stats();
    assert.equal(s.rowsKept, community.source.rowsKept);
    assert.equal(s.withExtract + s.onlyCassette, s.rowsKept);
    assert.equal(s.edgeDxNumbers, page.communityDxNumbers);
    assert.equal(s.notInRegistry, page.communityOnlyDxNumbers);
  });
});

describe('documentation screenshots', () => {
  test('those that show community entries are the ones REUSE.toml puts under CC BY-SA', async () => {
    const reuse = await readFile(join(ROOT, 'REUSE.toml'), 'utf8');
    const ccBySa = reuse.split('[[annotations]]').find((a) => a.includes('"CC-BY-SA-4.0"'));
    const lookup = createLookup(data, community);
    for (const shot of SHOTS) {
      assert.equal(ccBySa.includes(`"${shot.file}*.png"`), Boolean(shot.communityData), shot.file);
      const dx = /dx=(\d+)-(\d+)/.exec(shot.query);
      if (dx) assert.equal(lookup.byDx(Number(dx[1]), Number(dx[2])).community.length > 0, Boolean(shot.communityData), shot.file);
    }
  });
});
