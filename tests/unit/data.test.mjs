import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { buildData, versionOf } from '../../scripts/build-data.mjs';
import { communityStats } from '../../scripts/community-stats.mjs';
import { resolveCommit, sourceRecord, assignIds } from '../../scripts/update-community-data.mjs';
import { parseCsv, formatCsv, readCsvObjects } from '../../scripts/lib/csv.mjs';
import { SHOTS } from '../../scripts/screenshots.mjs';
import { DEMO } from '../../scripts/demo-video.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync, cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // a path, even with spaces or other letters in it
const data = require('../../site/js/dx-data.js');
const community = require('../../site/js/dx-data-community.js');
const index = require('../../site/js/dx-index.js');
const createLookup = require('../../site/js/dx-lookup.js');

// Each row starts with its record ID.
const product = (part1, part2) =>
  data.products.filter((p) => p[1] === part1 && p[2] === part2).map((p) => p[3]);
const sensitizerOf = (part1) => data.sensitizers[data.part1[part1][0]];

describe('generated data files', () => {
  test('site/js/dx-data*.js and dx-index.js match the CSV sources (run `npm run build:data` if not)', async () => {
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
    assert.deepEqual(Object.keys(data), ['version', 'source', 'sensitizers', 'part1', 'products', 'augmented']);
    assert.deepEqual(Object.keys(community), ['version', 'source', 'rows']);
    // The record numbers of the rows of both, and nothing else.
    assert.deepEqual(Object.keys(index), ['version', 'dx', 'any', 'recorded', 'related', 'cassette', 'recordedOnly']);
    for (const [name, refs] of Object.entries(index)) if (name !== 'version') assert.ok(refs.every(Number.isInteger), name);
  });

  test('the three carry the version of the build that wrote them, which changes with anything it wrote', () => {
    assert.match(data.version, /^[0-9a-f]{16}$/);
    assert.equal(community.version, data.version);
    assert.equal(index.version, data.version);
    // A hash of what the build wrote, without the version itself.
    const content = (file) => Object.fromEntries(Object.entries(file).filter(([name]) => name !== 'version'));
    const [i3a, rows, refs] = [data, community, index].map(content);
    assert.equal(versionOf(i3a, rows, refs), data.version);
    assert.notEqual(versionOf(i3a, { ...rows, rows: rows.rows.slice(1) }, refs), data.version);
    assert.notEqual(versionOf(i3a, rows, { ...refs, dx: refs.dx.slice().reverse() }), data.version);
  });

  test('every row starts with a record ID of its own, by which the index and the page refer to it', () => {
    for (const rows of [data.products, data.augmented, community.rows]) {
      const ids = rows.map((r) => r[0]);
      assert.ok(ids.every((id) => Number.isInteger(id) && id >= 1));
      assert.equal(new Set(ids).size, ids.length);
    }
    // The database's IDs come from its snapshot, which records the highest ever given.
    assert.ok(Math.max(...community.rows.map((r) => r[0])) <= community.source.lastId);
    const lookup = createLookup(data, community, index);
    assert.equal(lookup.byId('i3a-1').name, 'AGFAPAN APX 400 Professional');
    assert.equal(lookup.byId('bfd-1').name, '3M Scotch ColorPrint HR200 Gen 2');
    assert.equal(lookup.byId('i3a-a1').code, '832973');
    assert.equal(lookup.byId('bfd-0'), null);
    const all = [...lookup.products, ...lookup.augmented, ...lookup.community].map((e) => e.id);
    assert.equal(new Set(all).size, all.length);
  });

  test('the community file and the index made from it carry attribution for the CC BY-SA data', async () => {
    for (const file of ['site/js/dx-data-community.js', 'site/js/dx-index.js']) {
      const text = await readFile(join(ROOT, file), 'utf8');
      assert.match(text, /The Big Film Database \(dxdatabase\) © 2018 by\s+\*?\s*Dxdatabase/, file);
      assert.match(text, /creativecommons\.org\/licenses\/by-sa\/4\.0/, file);
    }
    const reuse = await readFile(join(ROOT, 'REUSE.toml'), 'utf8');
    const ccBySa = reuse.split('[[annotations]]').find((a) => a.includes('"CC-BY-SA-4.0"'));
    assert.ok(ccBySa.includes('"site/js/dx-index.js"'));
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
    for (const [, part1, , name, s] of data.products) {
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
    const gold200 = data.products.find((p) => p[1] === 78 && p[2] === 2);
    assert.equal(gold200[5], 0, 'KODAK GOLD 200 (78-2) is in the "no longer manufactured" list');
    const tmax = data.products.find((p) => p[1] === 67 && p[2] === 9);
    assert.equal(tmax[5], 1);
  });

  test('augmented cassette codes from ISO 1007 Annex A.4', () => {
    assert.deepEqual(data.augmented.map((a) => a[1]), ['832973', '732983', '832983', '733633', '833633']);
  });

  test('a row\'s record ID is its row in its file, below the header (data/README.md)', async () => {
    const products = readCsvObjects(await readFile(join(ROOT, 'data/i3a-2008/products.csv'), 'utf8'));
    for (const [record, part1, part2, name] of data.products) {
      const p = products[record - 1];
      assert.deepEqual([Number(p.part1), p.part2 === '' ? -1 : Number(p.part2), p.product], [part1, part2, name], `i3a-${record}`);
    }
    const augmented = readCsvObjects(await readFile(join(ROOT, 'data/i3a-2008/augmented-cassette-codes.csv'), 'utf8'));
    for (const [record, code] of data.augmented) assert.equal(augmented[record - 1].cassette_code, code, `i3a-a${record}`);
  });
});

describe('community data', () => {
  test('is a cleaned subset of the rows with a DX extract or a cassette number', () => {
    assert.equal(community.rows.length, community.source.rowsKept);
    for (const row of community.rows) {
      const [, extract, full, name, tags, original] = row;
      // -1: only the cassette number is recorded, and no DX number is made up from it.
      assert.ok(Number.isInteger(extract) && (extract >= 0 || (extract === -1 && /^\d{6}$/.test(full))), name);
      assert.ok(full === '' || /^\d{6}$/.test(full), `${name}: ${full}`);
      assert.ok(!name.includes('#'), name);
      assert.ok(!/<\/?[a-z][^>]*>/i.test(name + original), name);
      assert.ok(typeof tags === 'string');
    }
  });

  test('the figures quoted in research/04 agree with the page\'s own counts', async () => {
    const s = await communityStats();
    const page = createLookup(data, community, index).stats();
    assert.equal(s.rowsKept, community.source.rowsKept);
    assert.equal(s.withExtract + s.onlyCassette, s.rowsKept);
    assert.equal(s.edgeDxNumbers, page.communityDxNumbers);
    assert.equal(s.notInRegistry, page.communityOnlyDxNumbers);
  });

  test('research/04 quotes the figures that `npm run stats:community-data` prints, in both its versions', async () => {
    const s = await communityStats();
    const numbers = (text) => [...text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)].map((m) => Number(m[0].replace(/,/g, '')));
    const expected = {
      answer: [s.edgeDxNumbers, s.notInRegistry],
      snapshot: [s.rowsUpstream, s.rowsKept, s.withExtract, s.onlyCassette],
      findings: [[s.extractDisagrees], [s.noCassette], [s.above2047], [s.below16], [s.htmlMarkup], [s.searchTags],
        [Object.values(s.certainty).reduce((a, b) => a + b, 0), ...Object.entries(s.certainty).flatMap(([k, v]) => [Number(k), v])],
        Object.values(s.availability)],
    };
    for (const file of ['research/04-community-database.md', 'research/04-community-database.zh-CN.md']) {
      // The same sections in both: the short answer, What it is, The file, Snapshot used, Data-quality findings …
      const sections = (await readFile(join(ROOT, file), 'utf8')).split(/^## /m);
      const answer = sections[0].trim().split(/\n\s*\n/).pop();
      const snapshot = sections[3].split(/\)\s*:|）：/).slice(1).join('');
      const rows = sections[4].split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|').slice(-2)[0]);
      assert.deepEqual({ answer: numbers(answer).slice(0, 2), snapshot: numbers(snapshot), findings: rows.map(numbers) }, expected, file);
    }
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

  test('a row keeps its record ID while it is unchanged; a new or changed one gets a number never given before', () => {
    const before = [['1', 'A', 'x'], ['2', 'B', 'y'], ['5', 'C', 'z']];
    // B is gone, C changed, D is new, and A stays: the highest ever given was 7.
    assert.deepEqual(assignIds([['A', 'x'], ['C', 'zz'], ['D', 'w']], before, 7), { ids: [1, 8, 9], lastId: 9 });
    // Downloaded again, the same rows keep the same IDs.
    assert.deepEqual(assignIds([['A', 'x'], ['B', 'y'], ['C', 'z']], before, 5), { ids: [1, 2, 5], lastId: 5 });
    // Two identical rows keep one ID each; the first snapshot numbers them from 1.
    assert.deepEqual(assignIds([['A', 'x'], ['A', 'x']], [['3', 'A', 'x'], ['4', 'A', 'x']], 4).ids, [3, 4]);
    assert.deepEqual(assignIds([['A', 'x'], ['B', 'y']], []), { ids: [1, 2], lastId: 2 });
    // Nor an ID in the snapshot above the lastId recorded.
    assert.deepEqual(assignIds([['N', 'x']], [['9', 'A', 'y']], 3), { ids: [10], lastId: 10 });
  });

  test('a column added or moved upstream leaves every unchanged row its ID; an upstream ID column stops the update', () => {
    // The update run offline, in a copy of its scripts, on a snapshot of two
    // rows with IDs 3 and 7 and a download given in place of GitHub's.
    const columns = ['DX extract', 'DX full', 'Name', 'Original Film or informations', 'Manufacturer', 'reliability', 'Country', 'Beginning year', 'End year', 'Distributor', 'Ava'];
    const rows = [['0291', '002910', 'A 200', '', 'Maker A', '', 'Japan', '', '', '', '0'], ['0293', '002930', 'B 400', '', 'Maker B', '3', 'Italy', '', '', '', '1']];
    const update = (header, upstream) => {
      const dir = mkdtempSync(join(tmpdir(), 'dx-update-'));
      try {
        for (const file of ['update-community-data.mjs', 'lib/csv.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
        const out = join(dir, 'data', 'big-film-database');
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'source.json'), JSON.stringify({ commit: 'a'.repeat(40), retrieved: '2030-01-01', lastId: 7 }));
        const snapshot = formatCsv([['ID', ...columns], ['3', ...rows[0]], ['7', ...rows[1]]], ';');
        writeFileSync(join(out, 'film_database_dx.csv'), snapshot);
        const text = formatCsv([header, ...upstream], ';');
        writeFileSync(join(dir, 'fetch.mjs'), `globalThis.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(text)} });\n`);
        const run = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fetch.mjs')).href, join(dir, 'scripts', 'update-community-data.mjs')], { encoding: 'utf8' });
        const written = readFileSync(join(out, 'film_database_dx.csv'), 'utf8');
        return { status: run.status, error: run.stderr, unchanged: written === snapshot, ids: parseCsv(written, ';').slice(1).map((r) => r[0]) };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    // As upstream gives them: with its Pic column, and a row without a number, which is not kept.
    const header = [...columns, 'Pic'];
    const upstream = [[...rows[0], 'a.jpg'], ['', '', 'No number', '', '', '', '', '', '', '', '0', ''], [...rows[1], '']];
    const at = (name) => header.indexOf(name);
    assert.deepEqual(update(header, upstream).ids, ['3', '7']);
    // A column added after Pic, two columns swapped, and Pic moved first.
    const insert = (r, i, value) => [...r.slice(0, i), value, ...r.slice(i)];
    assert.deepEqual(update(insert(header, at('Pic') + 1, 'Format'), upstream.map((r) => insert(r, at('Pic') + 1, '35 mm'))).ids, ['3', '7']);
    const swap = (r) => r.map((v, i) => (i === at('Manufacturer') ? r[at('Country')] : i === at('Country') ? r[at('Manufacturer')] : v));
    assert.deepEqual(update(swap(header), upstream.map(swap)).ids, ['3', '7']);
    const picFirst = (r) => [r[at('Pic')], ...r.filter((_, i) => i !== at('Pic'))];
    assert.deepEqual(update(picFirst(header), upstream.map(picFirst)).ids, ['3', '7']);
    // Still, a row that changed gets the next number.
    assert.deepEqual(update(header, [upstream[0], upstream[1], [...rows[1].slice(0, 2), 'B 400 Pro', ...rows[1].slice(3), '']]).ids, ['3', '8']);
    // An ID column upstream would be read in place of ours: nothing is written.
    const theirs = update(['ID', ...header], upstream.map((r, i) => [String(500 + i), ...r]));
    assert.equal(theirs.status, 1);
    assert.match(theirs.error, /Column "ID"/);
    assert.ok(theirs.unchanged);
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
    const lookup = createLookup(data, community, index);
    for (const shot of SHOTS) {
      assert.equal(ccBySa.includes(`"${shot.file}*.png"`), Boolean(shot.communityData), shot.file);
      const dx = /dx=(\d+)-(\d+)/.exec(shot.query);
      // The rows that record its DX number, and those only related to it by their cassette number.
      const shows = (hit) => hit.community.length + hit.related.length > 0;
      if (dx) assert.equal(shows(lookup.byDx(Number(dx[1]), Number(dx[2]))), Boolean(shot.communityData), shot.file);
    }
  });

  test('the demo videos are under CC BY-SA if their codes show community entries', async () => {
    const reuse = await readFile(join(ROOT, 'REUSE.toml'), 'utf8');
    const ccBySa = reuse.split('[[annotations]]').find((a) => a.includes('"CC-BY-SA-4.0"'));
    const lookup = createLookup(data, community, index);
    const shows = DEMO.codes.some((code) => {
      const [part1, part2] = code.split('-').map(Number);
      const hit = lookup.byDx(part1, part2);
      return hit.community.length + hit.related.length > 0;
    });
    assert.equal(ccBySa.includes(`"${DEMO.file}*"`), shows);
  });
});

describe('the scripts', () => {
  test('run when the project is reached through a symbolic link, instead of quietly doing nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dx-link-'));
    try {
      symlinkSync(ROOT, join(dir, 'repo'), 'junction');
      const run = spawnSync(process.execPath, [join(dir, 'repo', 'scripts', 'build-data.mjs'), '--check'], { encoding: 'utf8' });
      assert.match(run.stdout, /Up to date/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`npm test` fails when a suite fails outside its tests, which `node --test` alone lets pass', async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.test, 'node scripts/run-unit.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'dx-unit-'));
    try {
      // Run as from a shell: not as a test file of this run, which it would report to.
      const env = { ...process.env, NODE_TEST_CONTEXT: undefined };
      const status = (name, body) => {
        writeFileSync(join(dir, name), `import { describe, test } from 'node:test';\n${body}\n`);
        return spawnSync(process.execPath, [join(ROOT, 'scripts', 'run-unit.mjs'), join(dir, name)], { env, encoding: 'utf8' }).status;
      };
      assert.equal(status('passes.test.mjs', "describe('a', () => { test('b', () => {}); });"), 0);
      assert.equal(status('fails.test.mjs', "test('b', () => { throw new Error('it failed'); });"), 1);
      assert.equal(status('todo.test.mjs', "test('b', { todo: true }, () => { throw new Error('not yet'); });"), 0);
      // A suite whose setup throws, at once or later: its tests never run.
      assert.equal(status('throws.test.mjs', "describe('a', () => { throw new Error('no setup'); });"), 1);
      assert.equal(status('rejects.test.mjs', "describe('a', async () => { throw new Error('no setup'); });"), 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
