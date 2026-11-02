import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { buildData, versionOf } from '../../scripts/build-data.mjs';
import { communityStats } from '../../scripts/community-stats.mjs';
import { resolveCommit, sourceRecord, assignIds, idsReport } from '../../scripts/update-community-data.mjs';
import { parseCsv, formatCsv, readCsvObjects } from '../../scripts/lib/csv.mjs';
import { SHOTS } from '../../scripts/screenshots.mjs';
import { DEMO } from '../../scripts/demo-video.mjs';
import { filesStarting, videosDue } from '../../scripts/media.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync, cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, appendFileSync, existsSync } from 'node:fs';
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

  test('a file the build cannot read stops it, with an error that names the file, and the column if one is missing', () => {
    // The build run on a copy of the scripts and the data, with the data changed by `edit`.
    const stops = (edit) => {
      const dir = mkdtempSync(join(tmpdir(), 'dx-build-'));
      try {
        for (const file of ['build-data.mjs', 'lib/csv.mjs', 'lib/dx-index.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
        for (const file of ['dx-codec.js', 'dx-lookup.js']) cpSync(join(ROOT, 'site', 'js', file), join(dir, 'site', 'js', file));
        cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
        edit(join(dir, 'data'));
        const run = spawnSync(process.execPath, [join(dir, 'scripts', 'build-data.mjs'), '--check'], { encoding: 'utf8' });
        assert.equal(run.status, 1, run.stdout);
        return run.stderr.trim();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const snapshot = (edit) => (dir) => {
      const csv = join(dir, 'big-film-database', 'film_database_dx.csv');
      writeFileSync(csv, formatCsv(edit(parseCsv(readFileSync(csv, 'utf8'), ';')), ';'));
    };
    // A snapshot from before there were IDs (scripts/update-community-data.mjs gives them).
    assert.equal(stops(snapshot((rows) => rows.map((r) => r.slice(1)))),
      'film_database_dx.csv has no column "ID": `npm run update:community-data` gives its rows their IDs');
    // A column the build reads, renamed in the snapshot only.
    assert.equal(stops(snapshot(([header, ...rows]) => [header.map((name) => (name === 'reliability' ? 'Reliability' : name)), ...rows])),
      'film_database_dx.csv has no column "reliability"');
    // A blank line at the end of a file: the row after its last, whatever a correction made of its rows.
    const [head, ...body] = parseCsv(readFileSync(join(ROOT, 'data', 'i3a-2008', 'products.csv'), 'utf8'));
    assert.equal(stops((dir) => appendFileSync(join(dir, 'i3a-2008', 'products.csv'), '\n')), `products.csv: CSV row ${body.length + 2} has 1 field, expected ${head.length}`);
    // An ID given twice, as after an edit by hand: the error names the row.
    assert.match(stops(snapshot(([header, first, second, ...rows]) => [header, first, [first[0], ...second.slice(1)], ...rows])),
      /^film_database_dx\.csv: CSV row 3: ID "\d+" is missing, repeated or not a whole number$/);
    // source.json, which records the database's commit: broken, or without it.
    const record = (text) => (dir) => writeFileSync(join(dir, 'big-film-database', 'source.json'), text);
    assert.match(stops(record('{ "commit": "abc", }')), /^source\.json: /);
    // … or with any other text than a full hash, which would go into the files' attribution.
    for (const text of ['{}', '{ "commit": "" }', '{ "commit": "main" }']) assert.equal(stops(record(text)), 'source.json has no full commit hash in "commit"', text);
  });

  test('every column the build reads, renamed in its file, stops it with the file and the column named; a column it does not read changes nothing', async () => {
    const delimiters = { 'i3a-2008/part1-assignments.csv': ',', 'i3a-2008/products.csv': ',', 'i3a-2008/augmented-cassette-codes.csv': ',', 'big-film-database/film_database_dx.csv': ';' };
    // The build, with --check, on a copy of the scripts, the generated files and the data, with one column renamed.
    const renamed = async (file, column) => {
      const dir = mkdtempSync(join(tmpdir(), 'dx-build-'));
      try {
        for (const f of ['build-data.mjs', 'lib/csv.mjs', 'lib/dx-index.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', f), join(dir, 'scripts', f));
        for (const f of ['dx-codec.js', 'dx-lookup.js', 'dx-data.js', 'dx-data-community.js', 'dx-index.js']) cpSync(join(ROOT, 'site', 'js', f), join(dir, 'site', 'js', f));
        cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
        const csv = join(dir, 'data', file);
        const [head, ...body] = parseCsv(readFileSync(csv, 'utf8'), delimiters[file]);
        writeFileSync(csv, formatCsv([head.map((name) => (name === column ? `${name} (renamed)` : name)), ...body], delimiters[file]));
        return await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [join(dir, 'scripts', 'build-data.mjs'), '--check'], { stdio: ['ignore', 'pipe', 'pipe'] });
          let said = '';
          child.stdout.on('data', (d) => { said += d; });
          child.stderr.on('data', (d) => { said += d; });
          child.on('error', reject);
          child.on('close', (status) => resolve({ status, said: said.trim() }));
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const cases = Object.keys(delimiters).flatMap((file) => parseCsv(readFileSync(join(ROOT, 'data', file), 'utf8'), delimiters[file])[0].map((column) => [file, column]));
    assert.ok(cases.length >= 20, `${cases.length} columns`);
    const runs = await Promise.all(cases.map(([file, column]) => renamed(file, column)));
    const unread = [];
    cases.forEach(([file, column], i) => {
      const { status, said } = runs[i];
      const name = file.slice(file.lastIndexOf('/') + 1);
      if (status === 0) {
        assert.match(said, /^Up to date/, `${name}: ${column}`);
        unread.push(`${name}: ${column}`);
      } else if (column === 'ID') {
        assert.equal(said, `${name} has no column "ID": \`npm run update:community-data\` gives its rows their IDs`);
      } else {
        assert.equal(said, `${name} has no column "${column}"`, `${name}: ${column}`);
      }
    });
    // In the registry's files, the page of the PDF, kept for checking the
    // transcription, is the only column the build does not read. (The
    // database's snapshot may gain columns upstream that it does not read.)
    assert.deepEqual(unread.filter((column) => !column.startsWith('film_database_dx.csv')), ['products.csv: page']);
  });

  test('are built the same on a computer set to another language', () => {
    // Czech sorts "ch" after "h"; the sensitizers must still come in the same order.
    const env = { ...process.env, LC_ALL: 'cs_CZ.UTF-8', LANG: 'cs_CZ.UTF-8' };
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-data.mjs'), '--check'], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });

  test('each file holds one dataset, so each has one license (see REUSE.toml)', () => {
    assert.deepEqual(Object.keys(data), ['version', 'build', 'source', 'sensitizers', 'part1', 'products', 'augmented']);
    assert.deepEqual(Object.keys(community), ['version', 'build', 'source', 'rows']);
    // The record numbers of the rows of both, and nothing else.
    assert.deepEqual(Object.keys(index), ['version', 'build', 'dx', 'any', 'recorded', 'related', 'cassette', 'recordedOnly']);
    for (const [name, refs] of Object.entries(index)) if (!['version', 'build'].includes(name)) assert.ok(refs.every(Number.isInteger), name);
  });

  test('the three carry the version of the build that wrote them, which changes with anything it wrote, and an empty deploy build', () => {
    assert.match(data.version, /^[0-9a-f]{16}$/);
    assert.equal(community.version, data.version);
    assert.equal(index.version, data.version);
    // Filled only in the copy published (scripts/stamp-build.mjs, tests/unit/stamp.test.mjs).
    for (const file of [data, community, index]) assert.equal(file.build, '');
    // A hash of the data the build wrote, without the version and the build.
    const content = (file) => Object.fromEntries(Object.entries(file).filter(([name]) => !['version', 'build'].includes(name)));
    const [i3a, rows, refs] = [data, community, index].map(content);
    assert.equal(versionOf(i3a, rows, refs), data.version);
    assert.notEqual(versionOf(i3a, { ...rows, rows: rows.rows.slice(1) }, refs), data.version);
    assert.notEqual(versionOf(i3a, rows, { ...refs, dx: refs.dx.slice().reverse() }), data.version);
    // Every part of every file counts, so that none can be kept from another build.
    const files = [i3a, rows, refs];
    for (const [n, file] of files.entries()) {
      for (const key of Object.keys(file)) {
        const changed = files.map((f, k) => (k === n ? { ...f, [key]: null } : f));
        assert.notEqual(versionOf(...changed), data.version, `${['dx-data.js', 'dx-data-community.js', 'dx-index.js'][n]}: ${key}`);
      }
    }
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
    // Each ID gives its own row, and only written as the row's own is.
    for (const id of all) assert.equal(lookup.byId(id).id, id);
    for (const id of ['bfd-01', 'bfd-0930', 'i3a-0141', 'i3a-a01', 'bfd-1 ', ' bfd-1', 'BFD-1', 'bfd-1e1', 'bfd-', '', undefined]) {
      assert.equal(lookup.byId(id), null, String(id));
    }
  });

  test('the examples in site/js/app.js name their films by record IDs that still give those films', async () => {
    // A correction that adds or removes a row of products.csv renumbers the
    // i3a- IDs after it, and an update gives a changed row a new bfd- ID: then
    // the examples' IDs need updating.
    const app = await readFile(join(ROOT, 'site/js/app.js'), 'utf8');
    const lookup = createLookup(data, community, index);
    const films = [...app.matchAll(/code: \{ part1: (\d+), part2: (\d+)\b[^\n]*\bids: \[([^\]]*)\]/g)].map(([, part1, part2, ids]) => [`DX ${part1}-${part2}`,
      ...[...ids.matchAll(/'([^']*)'/g)].map(([, id]) => {
        const e = lookup.byId(id);
        return e && `DX ${e.part1}-${e.part2} ${e.name}`;
      })]);
    assert.deepEqual(films, [
      ['DX 79-15', 'DX 79-15 KODAK Professional BW400CN Film'],
      ['DX 47-1', 'DX 47-1 Perutz Primera 200 (from 01/2002 on)'],
      ['DX 109-9', 'DX 109-9 HP5 PLUS'],
      ['DX 32-6', 'DX 32-6 FUJICHROME VELVIA 50'],
      ['DX 12-13', 'DX 12-13 Fujicolor Super HGV100 Asia'],
    ]);
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

  test('records certainty and availability only with the values data/README.md explains, or none', () => {
    // Others would rank by a certainty above 4, or drop out of the counts in research/04.
    for (const [, , , name, , , , reliability, , , , , availability] of community.rows) {
      assert.ok([-1, 0, 1, 2, 3, 4].includes(reliability), `${name}: reliability ${reliability}`);
      assert.ok([-1, 0, 1, 2].includes(availability), `${name}: Ava ${availability}`);
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
      onMarket: [s.availability[2], s.onMarketWithEdge],
      snapshot: [s.rowsUpstream, s.rowsKept, s.withExtract, s.onlyCassette],
      findings: [[s.extractDisagrees], [s.noCassette], [s.above2047], [s.below16], [s.htmlMarkup], [s.searchTags],
        [Object.values(s.certainty).reduce((a, b) => a + b, 0), ...Object.entries(s.certainty).flatMap(([k, v]) => [Number(k), v])],
        Object.values(s.availability)],
      coverage: [s.availability[2], s.onMarketWithEdge, s.onMarketDxNumbers, s.onMarketNotInRegistry, 2008],
    };
    for (const file of ['research/04-community-database.md', 'research/04-community-database.zh-CN.md']) {
      // The same sections in both: the short answer, What it is, The file, Snapshot used, Data-quality findings, Coverage of modern films.
      const sections = (await readFile(join(ROOT, file), 'utf8')).split(/^## /m);
      const answer = sections[0].trim().split(/\n\s*\n/).pop();
      const snapshot = sections[3].split(/\)\s*:|）：/).slice(1).join('');
      const rows = sections[4].split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|').slice(-2)[0]);
      // Then, after "Part 1 = 0" and the registry's year: how many rows are on the market, and how many of them have such a number.
      const onMarket = numbers(answer.split(/Part 1 = 0|第 1 部分为 0/)[1]).filter((n) => n !== 2008).slice(0, 2);
      const coverage = numbers(sections[5].split('\n').slice(1).join('\n'));
      assert.deepEqual({ answer: numbers(answer).slice(0, 2), onMarket, snapshot: numbers(snapshot), findings: rows.map(numbers), coverage }, expected, file);
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
    // The commit source.json records, downloaded again, is checked the same way: a branch name would be downloaded as it is today.
    for (const recorded of [{ commit: 'main' }, { commit: '' }, { commit: full.slice(0, 7) }, {}, null]) {
      await assert.rejects(resolveCommit([], recorded), /^Error: source\.json has no full commit hash in "commit": give one with --commit$/, JSON.stringify(recorded));
    }
  });

  test('an option the update does not know stops it before it downloads anything', async () => {
    const full = community.source.commit;
    const fetch = globalThis.fetch;
    let asked = 0;
    globalThis.fetch = async () => { asked++; throw new Error('no request expected'); };
    try {
      // Mistyped; one more; and the hash alone, as npm passes `npm run update:community-data --commit <hash>`, without its "--".
      for (const [args, unknown] of [[['--lastest'], '--lastest'], [['--comit', full], '--comit'], [['--commit', full, 'extra'], 'extra'], [['--latest', '--force'], '--force'], [[full], full]]) {
        await assert.rejects(resolveCommit(args, community.source), { message: `Unknown option ${unknown}: the options are --latest and --commit <full 40-character hash>.` }, args.join(' '));
      }
    } finally {
      globalThis.fetch = fetch;
    }
    assert.equal(asked, 0);
  });

  test('--latest takes the newest commit only as a full commit hash too', async () => {
    // GitHub's answer, given in place of a request.
    const fetch = globalThis.fetch;
    const answer = (body) => { globalThis.fetch = async () => ({ ok: true, json: async () => body }); };
    try {
      answer([{ sha: 'b'.repeat(40) }]);
      assert.equal(await resolveCommit(['--latest'], community.source), 'b'.repeat(40));
      for (const body of [[], [{}], [{ sha: 'b'.repeat(7) }], null]) {
        answer(body);
        await assert.rejects(resolveCommit(['--latest'], community.source), /no full commit hash/, JSON.stringify(body));
      }
    } finally {
      globalThis.fetch = fetch;
    }
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

  test('the update says what it did to the record IDs', () => {
    assert.equal(idsReport([1, 1677, 1678, 1679, 5], [1, 2, 3, 5]), '2 rows kept their IDs; 3 got new ones (1677–1679); 2 IDs were retired.');
    assert.equal(idsReport([1, 8], [1, 2]), '1 row kept its ID; 1 got a new one (8); 1 ID was retired.');
    assert.equal(idsReport(Array.from({ length: 1676 }, (_, i) => i + 1), []), 'No row kept its ID; 1,676 got new ones (1–1676); no ID was retired.');
    assert.equal(idsReport([3, 7], [3, 7]), '2 rows kept their IDs; none got a new one; no ID was retired.');
    assert.equal(idsReport([1677, 1678], [], 1676), 'No row kept its ID; 2 got new ones (1677–1678); 1,676 IDs were retired.');
  });

  // The update run offline, in a copy of its scripts, on a snapshot (by
  // default two rows with IDs 3 and 7) and a download given in place of GitHub's.
  // The snapshot and source.json can also be given as text, as edited by hand.
  const columns = ['DX extract', 'DX full', 'Name', 'Original Film or informations', 'Manufacturer', 'reliability', 'Country', 'Beginning year', 'End year', 'Distributor', 'Ava'];
  const rows = [['0291', '002910', 'A 200', '', 'Maker A', '', 'Japan', '', '', '', '0'], ['0293', '002930', 'B 400', '', 'Maker B', '3', 'Italy', '', '', '', '1']];
  const update = (header, upstream, snapshotRows = [['ID', ...columns], ['3', ...rows[0]], ['7', ...rows[1]]], recorded = { commit: 'a'.repeat(40), retrieved: '2030-01-01', rowsKept: 2, lastId: 7 }) => {
    const dir = mkdtempSync(join(tmpdir(), 'dx-update-'));
    try {
      for (const file of ['update-community-data.mjs', 'lib/csv.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
      const out = join(dir, 'data', 'big-film-database');
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'source.json'), typeof recorded === 'string' ? recorded : JSON.stringify(recorded));
      const snapshot = typeof snapshotRows === 'string' ? snapshotRows : formatCsv(snapshotRows, ';');
      writeFileSync(join(out, 'film_database_dx.csv'), snapshot);
      const text = formatCsv([header, ...upstream], ';');
      writeFileSync(join(dir, 'fetch.mjs'), `globalThis.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(text)} });\n`);
      const run = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fetch.mjs')).href, join(dir, 'scripts', 'update-community-data.mjs')], { encoding: 'utf8' });
      const written = readFileSync(join(out, 'film_database_dx.csv'), 'utf8');
      // `said`: its first two lines, what it kept and what it did to the IDs.
      return { status: run.status, error: run.stderr, said: run.stdout.split('\n').slice(0, 2), unchanged: written === snapshot, get ids() { return parseCsv(written, ';').slice(1).map((r) => r[0]); } };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  // As upstream gives them: with its Pic column, and a row without a number, which is not kept.
  const header = [...columns, 'Pic'];
  const upstream = [[...rows[0], 'a.jpg'], ['', '', 'No number', '', '', '', '', '', '', '', '0', ''], [...rows[1], '']];

  test('a column added or moved upstream leaves every unchanged row its ID; an upstream ID column, or a snapshot without a column the rows are matched by, stops the update', () => {
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
    // A snapshot without a column the build reads (one renamed upstream and in
    // the scripts, say): rows told apart only by it could pass their IDs to
    // each other, so nothing is written.
    const country = columns.indexOf('Country') + 1;
    const old = update(header, upstream, [['ID', ...columns], ['3', ...rows[0]], ['7', ...rows[1]]].map((r) => r.filter((_, i) => i !== country)));
    assert.equal(old.status, 1);
    assert.match(old.error, /no column "Country"/);
    assert.ok(old.unchanged);
    // A snapshot without an ID column: every row gets a new number, after the highest ever given (7).
    const first = update(header, upstream, [columns, ...rows]);
    assert.equal(first.status, 0, first.error);
    assert.deepEqual(first.ids, ['8', '9']);
  });

  test('the update prints how many rows it kept, then what it did to their record IDs', () => {
    // With a thousand more rows without a number, written as idsReport writes its counts.
    const same = update(header, [...upstream, ...Array(1000).fill(upstream[1])]);
    assert.deepEqual(same.said, [`Kept 2 of 1,003 rows from dxdatabase/Open-source-film-database@${'a'.repeat(7)}`, '2 rows kept their IDs; none got a new one; no ID was retired.']);
    const changed = update(header, [upstream[0], upstream[1], [...rows[1].slice(0, 2), 'B 400 Pro', ...rows[1].slice(3), '']]);
    assert.equal(changed.said[1], '1 row kept its ID; 1 got a new one (8); 1 ID was retired.');
    // Without a snapshot that has IDs, the IDs of the rows the last update kept are all retired.
    assert.equal(update(header, upstream, [columns, ...rows]).said[1], 'No row kept its ID; 2 got new ones (8–9); 2 IDs were retired.');
    // So are those of rows taken out of the snapshot by hand: all of them, or one.
    assert.equal(update(header, upstream, [['ID', ...columns]]).said[1], 'No row kept its ID; 2 got new ones (8–9); 2 IDs were retired.');
    assert.equal(update(header, upstream, [['ID', ...columns], ['3', ...rows[0]]]).said[1], '1 row kept its ID; 1 got a new one (8); 1 ID was retired.');
    // A row added by hand, which upstream lacks, retires its own ID and no other: one above
    // the last ID given (8), or one given before (5).
    const added = ['0295', '002950', 'C 100', '', 'Maker C', '', 'Japan', '', '', '', '0'];
    assert.equal(update(header, upstream, [['ID', ...columns], ['3', ...rows[0]], ['7', ...rows[1]], ['8', ...added]]).said[1], '2 rows kept their IDs; none got a new one; 1 ID was retired.');
    assert.equal(update(header, upstream, [['ID', ...columns], ['3', ...rows[0]], ['5', ...added], ['7', ...rows[1]]]).said[1], '2 rows kept their IDs; none got a new one; 1 ID was retired.');
    // A row taken out and another put in its place, or a row given another ID: the ID it had is retired all the same.
    assert.equal(update(header, upstream, [['ID', ...columns], ['3', ...rows[0]], ['8', ...added]]).said[1], '1 row kept its ID; 1 got a new one (9); 2 IDs were retired.');
    assert.equal(update(header, upstream, [['ID', ...columns], ['3', ...rows[0]], ['8', ...rows[1]]]).said[1], '2 rows kept their IDs; none got a new one; 1 ID was retired.');
    // None was in use before the first update that gave IDs: its source.json has no lastId.
    assert.equal(update(header, upstream, [columns, ...rows], { commit: 'a'.repeat(40), retrieved: '2030-01-01', rowsKept: 2 }).said[1],
      'No row kept its ID; 2 got new ones (1–2); no ID was retired.');
  });

  test('a column name given twice upstream, or a snapshot whose IDs are not as the update writes them, stops the update before it writes anything', () => {
    // The update matches rows by the first column of a name, the build reads the last.
    const twice = update([...header, 'Name'], upstream.map((r) => [...r, 'Another name']));
    assert.equal(twice.status, 1);
    assert.match(twice.error, /Column "Name" appears twice/);
    assert.ok(twice.unchanged);
    // The ID column first, and in it whole numbers from 1, each once: as the build reads them.
    for (const [snapshotRows, error] of [
      [[[...columns, 'ID'], [...rows[0], '3'], [...rows[1], '7']], /the "ID" column is not the first/],
      [[['ID', ...columns], ['x3', ...rows[0]], ['7', ...rows[1]]], /ID "x3" is missing, repeated or not a whole number/],
      [[['ID', ...columns], ['0', ...rows[0]], ['7', ...rows[1]]], /ID "0" is missing/],
      [[['ID', ...columns], ['3', ...rows[0]], ['3', ...rows[1]]], /CSV row 3: ID "3" is missing, repeated/],
    ]) {
      const run = update(header, upstream, snapshotRows);
      assert.equal(run.status, 1, String(error));
      assert.match(run.error, error);
      assert.ok(run.unchanged, String(error));
    }
  });

  test('a snapshot or source.json that the build would refuse, or a broken download, stops the update before it writes anything, with an error that names the file', () => {
    const snapshot = formatCsv([['ID', ...columns], ['3', ...rows[0]], ['7', ...rows[1]]], ';');
    for (const [text, error] of [
      // A quote typed at the start of a field takes in everything up to the next quote (here, in a name):
      // matched as they are, the rows would get new IDs.
      [snapshot.replace('3;0291', '3;"0291').replace('B 400', 'B" 400'), 'film_database_dx.csv: CSV row 2 has 10 fields, expected 12'],
      // … or, with none after it, every row to the end.
      [snapshot.replace('3;0291', '3;"0291'), 'film_database_dx.csv: CSV ends inside a quoted field: a quote is not closed'],
      // A blank line at the end.
      [`${snapshot}\n`, 'film_database_dx.csv: CSV row 4 has 1 field, expected 12'],
    ]) {
      const run = update(header, upstream, text);
      assert.equal(run.status, 1, error);
      assert.equal(run.error.trim(), error);
      assert.ok(run.unchanged, error);
    }
    // A row of the download with a field too few: the error names the download, not the snapshot.
    const short = update(header, [upstream[0], upstream[1].slice(1), upstream[2]]);
    assert.equal(short.status, 1);
    assert.equal(short.error.trim(), `https://raw.githubusercontent.com/dxdatabase/Open-source-film-database/${'a'.repeat(40)}/film_database.csv: CSV row 3 has 11 fields, expected 12`);
    assert.ok(short.unchanged);
    // source.json broken, or not a record.
    const broken = update(header, upstream, undefined, `{ "commit": "${'a'.repeat(40)}", }`);
    assert.equal(broken.status, 1);
    assert.match(broken.error, /^source\.json: /);
    assert.ok(broken.unchanged);
    const none = update(header, upstream, undefined, 'null');
    assert.equal(none.status, 1);
    assert.equal(none.error.trim(), 'source.json is not a JSON object');
    assert.ok(none.unchanged);
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

  test('`npm run media` records the videos again only when the screenshots show a change, or with --force', async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.media, 'node scripts/media.mjs');
    // The files it compares: each screenshot and video, in every language.
    const langs = readdirSync(join(ROOT, 'site', 'js', 'i18n')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
    const each = (base, ext) => [`${base}${ext}`, ...langs.map((lang) => `${base}.${lang}${ext}`)];
    assert.deepEqual(filesStarting(SHOTS.map((shot) => shot.file)), SHOTS.flatMap((shot) => each(shot.file, '.png')).sort());
    assert.deepEqual(filesStarting([DEMO.file]), [...each(DEMO.file, '.webm'), ...each(`${DEMO.file}-vertical`, '.mp4')].sort());
    const due = (state) => videosDue({ force: false, screensChanged: false, screensCommitted: true, videosCommitted: true, ...state });
    assert.equal(due({}), null);
    assert.match(due({ force: true }), /--force/);
    assert.match(due({ screensChanged: true }), /screenshots changed/);
    // Screenshots taken on their own since the last commit, whose videos are still there; not
    // once the videos have been recorded since; and where git can't tell, only a change in the run.
    assert.match(due({ screensCommitted: false }), /last commit/);
    assert.equal(due({ screensCommitted: false, videosCommitted: false }), null);
    assert.equal(due({ screensCommitted: null, videosCommitted: null }), null);
    // An option mistyped stops it before it makes anything.
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'media.mjs'), '--forced'], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal(run.stderr.trim(), 'Unknown option --forced: the only one is --force.');
    assert.equal(run.stdout, '');
  });

  test('`npm run media` itself: which runs record the videos, in a project with git and in one without', () => {
    // media.mjs in a throwaway project whose three steps are stand-ins: the
    // screenshots step writes $SHOT into the English screenshot, if given, and
    // the demo step only notes that it ran. Git there leaves out this
    // computer's settings, but for those a case sets.
    const root = mkdtempSync(join(tmpdir(), 'dx-media-'));
    try {
      const settings = join(root, 'gitconfig');
      writeFileSync(settings, '');
      const env = { ...process.env, GIT_CONFIG_GLOBAL: settings, GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: root };
      const project = (name) => {
        const dir = join(root, name);
        for (const file of ['media.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', file), join(dir, 'scripts', file));
        const stub = (file, exported, body) => writeFileSync(join(dir, 'scripts', file),
          `import { appendFileSync, writeFileSync } from 'node:fs';\nimport { isMain } from './lib/main.mjs';\n${exported}\nif (isMain(import.meta)) { ${body} }\n`);
        stub('make-figures.mjs', '', '');
        stub('screenshots.mjs', "export const SHOTS = [{ file: '.github/screenshot' }];",
          "if (process.env.SHOT) writeFileSync(new URL('../.github/screenshot.png', import.meta.url), process.env.SHOT);");
        stub('demo-video.mjs', "export const DEMO = { file: '.github/demo' };", "appendFileSync(new URL('../demo-ran', import.meta.url), 'x');");
        mkdirSync(join(dir, '.github'));
        for (const file of ['screenshot.png', 'screenshot.zh-CN.png']) writeFileSync(join(dir, '.github', file), 'a');
        writeFileSync(join(dir, '.github', 'demo.webm'), 'v');
        // Whether a run records the videos: `shot` for the screenshots step, `more` for git's settings.
        return (args = [], shot = '', more = {}) => {
          rmSync(join(dir, 'demo-ran'), { force: true });
          const run = spawnSync(process.execPath, [join(dir, 'scripts', 'media.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...env, SHOT: shot, ...more } });
          assert.equal(run.status, 0, run.stderr);
          return existsSync(join(dir, 'demo-ran'));
        };
      };
      const media = project('git');
      const dir = join(root, 'git');
      const git = (...args) => assert.equal(spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, env }).status, 0, args.join(' '));
      git('init', '-q');
      git('add', '.');
      git('commit', '-qm', 'start');
      // As committed, and nothing changes: no videos; with --force, videos.
      assert.equal(media(), false);
      assert.equal(media(['--force']), true);
      // A new language's screenshot taken on its own, which git does not have yet: videos, even
      // where git is set to leave untracked files, or pictures, out of what it lists.
      writeFileSync(join(dir, '.github', 'screenshot.fr.png'), 'a');
      writeFileSync(join(root, 'ignore'), '*.png\n');
      assert.equal(media([], '', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'status.showUntrackedFiles', GIT_CONFIG_VALUE_0: 'no' }), true);
      assert.equal(media([], '', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.excludesFile', GIT_CONFIG_VALUE_0: join(root, 'ignore') }), true);
      rmSync(join(dir, '.github', 'screenshot.fr.png'));
      // A screenshot that changes in the run: videos.
      assert.equal(media([], 'b'), true);
      // The same again: it differs from the commit, and the videos are still the commit's: videos.
      assert.equal(media([], 'b'), true);
      // Once the videos have been recorded since (here, changed), no more …
      writeFileSync(join(dir, '.github', 'demo.webm'), 'w');
      assert.equal(media([], 'b'), false);
      // … unless the screenshots change in the run again.
      assert.equal(media([], 'c'), true);
      // Where git can't tell, as outside a git project: only a change in the run.
      const alone = project('no-git');
      assert.equal(alone(), false);
      assert.equal(alone([], 'b'), true);
      assert.equal(alone([], 'b'), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
