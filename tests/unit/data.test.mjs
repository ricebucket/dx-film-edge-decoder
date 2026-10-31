import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildData } from '../../scripts/build-data.mjs';
import { communityStats } from '../../scripts/community-stats.mjs';
import { resolveCommit, sourceRecord } from '../../scripts/update-community-data.mjs';
import { parseCsv } from '../../scripts/lib/csv.mjs';
import { SHOTS } from '../../scripts/screenshots.mjs';
import { DEMO } from '../../scripts/demo-video.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // a path, even with spaces or other letters in it
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

  test('are built the same on a computer set to another language', () => {
    // Czech sorts "ch" after "h"; the sensitizers must still come in the same order.
    const env = { ...process.env, LC_ALL: 'cs_CZ.UTF-8', LANG: 'cs_CZ.UTF-8' };
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-data.mjs'), '--check'], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });

  test('each file holds one dataset, so each has one license (see REUSE.toml)', () => {
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

describe('updating the community data (scripts/update-community-data.mjs)', () => {
  test('--commit takes only a full commit hash, as source.json records it', async () => {
    const full = community.source.commit;
    assert.equal(await resolveCommit(['--commit', full], null), full);
    await assert.rejects(resolveCommit(['--commit', full.slice(0, 7)], null), /full 40-character/);
    await assert.rejects(resolveCommit(['--commit'], null), /full 40-character/);
    assert.equal(await resolveCommit([], community.source), full);
  });

  test('a quote left open stops the CSV reader, instead of swallowing the rows after it', () => {
    assert.deepEqual(parseCsv('a;b\n1;"x;""y"""\n2;3\n', ';'), [['a', 'b'], ['1', 'x;"y"'], ['2', '3']]);
    assert.throws(() => parseCsv('a;b\n1;"open\n2;3\n4;5\n', ';'), /quote is not closed/);
  });

  test('downloading the recorded commit again leaves source.json as it is', async () => {
    const text = await readFile(join(ROOT, 'data/big-film-database/source.json'), 'utf8');
    const recorded = JSON.parse(text);
    const later = new Date('2030-01-15T12:00:00Z');
    const again = sourceRecord(recorded, recorded, later);
    assert.equal(`${JSON.stringify(again, null, 2)}\n`, text);
    // Another commit is dated the day it is downloaded.
    assert.equal(sourceRecord(Object.assign({}, recorded, { commit: 'f'.repeat(40) }), recorded, later).retrieved, '2030-01-15');
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

  test('the demo videos are under CC BY-SA if their codes show community entries', async () => {
    const reuse = await readFile(join(ROOT, 'REUSE.toml'), 'utf8');
    const ccBySa = reuse.split('[[annotations]]').find((a) => a.includes('"CC-BY-SA-4.0"'));
    const lookup = createLookup(data, community);
    const shows = DEMO.codes.some((code) => {
      const [part1, part2] = code.split('-').map(Number);
      return lookup.byDx(part1, part2).community.length > 0;
    });
    assert.equal(ccBySa.includes(`"${DEMO.file}*"`), shows);
  });
});

describe('the scripts', () => {
  test('run when the project is reached through a symbolic link, instead of quietly doing nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dx-link-'));
    try {
      symlinkSync(ROOT, join(dir, 'repo'));
      const run = spawnSync(process.execPath, [join(dir, 'repo', 'scripts', 'build-data.mjs'), '--check'], { encoding: 'utf8' });
      assert.match(run.stdout, /Up to date/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
