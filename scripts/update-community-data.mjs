#!/usr/bin/env node
// Refresh data/big-film-database/ from The Big Film Database on GitHub.
//
//   node scripts/update-community-data.mjs              # the commit in source.json (reproducible)
//   node scripts/update-community-data.mjs --latest     # newest commit that changed film_database.csv
//   node scripts/update-community-data.mjs --commit <full 40-character hash>
//
// The steps that follow an update are in data/README.md, "Updating the data".
//
// The Big Film Database (dxdatabase) © 2018 by Dxdatabase is licensed under
// CC BY-SA 4.0: https://github.com/dxdatabase/Open-source-film-database
// Changes made here: only rows with a "DX extract" or "DX full" number are
// kept, the "Pic" column (box-image file names) is dropped, and an "ID" column
// comes first: a record ID of this tool's own (see assignIds). Everything else
// is copied verbatim.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv, formatCsv, checkFieldCounts } from './lib/csv.mjs';
import { isMain } from './lib/main.mjs';

const REPO = 'dxdatabase/Open-source-film-database';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'big-film-database');

// A commit goes into the download's address and source.json, wherever it
// comes from: only as a full hash. GitHub also serves a short one, but it can
// become ambiguous as the repository grows.
const fullHash = (sha) => typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha);

/**
 * The answer at `url`, as text or JSON (`as`). Its errors name `name`, the
 * address unless given, and for a network failure the cause: fetch itself
 * says only "fetch failed".
 */
async function download(url, as, name = url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`${name}: ${err.cause?.message || err.message}`);
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  try {
    return await res[as]();
  } catch (err) {
    throw new Error(`${name}: ${err.cause?.message || err.message}`);
  }
}

/** The commit to download: the one named, the newest (--latest) or the one recorded. */
export async function resolveCommit(args, recorded) {
  const i = args.indexOf('--commit');
  // An option it does not know, such as a typo, would download the recorded commit again.
  const unknown = args.find((arg, n) => arg !== '--commit' && arg !== '--latest' && !(i !== -1 && n === i + 1));
  // Nor is one of two commits, or --latest beside one, left out without a word.
  if (args.lastIndexOf('--commit') !== i) throw new Error('--commit is given twice: give one commit.');
  if (unknown !== undefined) throw new Error(`Unknown option ${unknown}: the options are --latest and --commit <full 40-character hash>.`);
  if (i !== -1 && args.includes('--latest')) throw new Error('Give --latest or --commit, not both.');
  if (i !== -1) {
    if (!fullHash(args[i + 1])) throw new Error('--commit needs the full 40-character commit hash, in lowercase');
    return args[i + 1];
  }
  if (!args.includes('--latest')) {
    if (!fullHash(recorded?.commit)) throw new Error('source.json has no full commit hash in "commit": give one with --commit');
    return recorded.commit;
  }
  const answer = await download(`https://api.github.com/repos/${REPO}/commits?path=film_database.csv&per_page=1`, 'json', 'GitHub API');
  const sha = answer?.[0]?.sha;
  if (!fullHash(sha)) throw new Error('GitHub API: no full commit hash of film_database.csv in its answer');
  return sha;
}

/**
 * What source.json records. Downloaded again, the recorded commit keeps the
 * date it was first retrieved: a commit's content never changes, so the files
 * stay unchanged.
 */
export function sourceRecord({ commit, rowsUpstream, rowsKept, lastId }, recorded, today = new Date()) {
  return {
    title: 'The Big Film Database',
    author: 'Dxdatabase',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    repository: `https://github.com/${REPO}`,
    commit,
    file: 'film_database.csv',
    retrieved: recorded && recorded.commit === commit ? recorded.retrieved : today.toISOString().slice(0, 10),
    rowsUpstream,
    rowsKept,
    lastId,
    changes: [
      'Kept only rows with a "DX extract" or "DX full" number.',
      'Removed the "Pic" column (box-image file names).',
      'Added an "ID" column: a record ID of our own for each row, kept while the row is unchanged.',
    ],
  };
}

/**
 * The record IDs of the rows kept, as the database gives none: a row
 * unchanged since the snapshot before keeps its ID, and a new or changed one
 * gets the next number after the highest ever given (`lastId`), so that an ID
 * never names another row. `rows` are the rows kept, without an ID; `before`,
 * the snapshot's rows, with theirs first.
 */
export function assignIds(rows, before, lastId = 0) {
  const free = new Map();
  for (const [id, ...fields] of before) {
    const key = JSON.stringify(fields);
    if (!free.has(key)) free.set(key, []);
    free.get(key).push(Number(id));
  }
  let last = Math.max(lastId, ...before.map(([id]) => Number(id)));
  const ids = rows.map((fields) => {
    const same = free.get(JSON.stringify(fields));
    return same && same.length ? same.shift() : ++last;
  });
  return { ids, lastId: last };
}

/**
 * What an update did to the record IDs, in a sentence for its maintainer:
 * `ids` from assignIds, `before` the snapshot's IDs, and `unseen` how many
 * IDs were in use that no snapshot shows (all of them retired).
 */
export function idsReport(ids, before, unseen = 0) {
  const had = new Set(before);
  const now = new Set(ids);
  const added = ids.filter((id) => !had.has(id)).sort((a, b) => a - b);
  const kept = ids.length - added.length;
  const retired = before.filter((id) => !now.has(id)).length + unseen;
  const n = (count) => count.toLocaleString('en-US');
  return [
    kept === 0 ? 'No row kept its ID' : kept === 1 ? '1 row kept its ID' : `${n(kept)} rows kept their IDs`,
    added.length === 0 ? 'none got a new one'
      : added.length === 1 ? `1 got a new one (${added[0]})` : `${n(added.length)} got new ones (${added[0]}–${added[added.length - 1]})`,
    retired === 0 ? 'no ID was retired' : retired === 1 ? '1 ID was retired' : `${n(retired)} IDs were retired`,
  ].join('; ') + '.';
}

/**
 * What assignIds compares rows by: their values under the column names the
 * download and the snapshot share, so that a column added, dropped or moved
 * upstream changes no unchanged row's ID. `header` is the download's
 * columns kept, `oldHeader` the snapshot's, its ID column first. They must
 * share every column `needed`: with fewer values, rows could look alike
 * and an ID pass to another row.
 */
export function sharedColumns(header, oldHeader, needed) {
  const shared = header.filter((name) => name !== 'ID' && oldHeader.includes(name));
  const missing = needed.find((name) => !shared.includes(name));
  if (missing) throw new Error(`film_database_dx.csv has no column "${missing}" to match its rows by; move it away to number every row anew`);
  return {
    now: (row) => shared.map((name) => row[header.indexOf(name)]),
    before: ([id, ...fields]) => [id, ...shared.map((name) => fields[oldHeader.indexOf(name) - 1])],
  };
}

/** The rows of a CSV file: its errors name it, as the build's do. */
function readCsv(text, file) {
  try {
    return parseCsv(text, ';');
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
}

/** source.json, which records the commit downloaded last: its errors name it, as the build's do. */
async function readRecord() {
  let recorded;
  try {
    recorded = JSON.parse(await readFile(join(OUT_DIR, 'source.json'), 'utf8'));
  } catch (err) {
    throw new Error(`source.json: ${err.message}`);
  }
  if (recorded === null || typeof recorded !== 'object') throw new Error('source.json is not a JSON object');
  // Whole numbers, as the update writes them, or missing, as before IDs: new
  // IDs follow lastId, and rowsKept gives how many IDs were in use.
  for (const key of ['lastId', 'rowsKept']) {
    if (key in recorded && !(Number.isSafeInteger(recorded[key]) && recorded[key] >= 0)) throw new Error(`source.json: "${key}" is not a whole number`);
  }
  return recorded;
}

async function main() {
  const recorded = await readRecord();
  const commit = await resolveCommit(process.argv.slice(2), recorded);
  const url = `https://raw.githubusercontent.com/${REPO}/${commit}/film_database.csv`;
  const [header, ...lines] = readCsv(await download(url, 'text'), url);
  if (!header) throw new Error(`${url}: the file is empty`);

  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" missing; upstream format changed`);
    return i;
  };
  // The ID column is this script's own: one upstream would be read in its place.
  if (header.includes('ID')) throw new Error('Column "ID" is upstream now, under the name of the column this script adds; upstream format changed');
  // Rows are matched by the first column of a name, but the build reads the
  // last: under a name given twice, rows would keep their IDs with other values.
  const twice = header.find((name, i) => header.indexOf(name) !== i);
  if (twice !== undefined) throw new Error(`Column "${twice}" appears twice; upstream format changed`);
  const extract = col('DX extract');
  const full = col('DX full');
  const pic = col('Pic');
  // The other columns scripts/build-data.mjs reads: stop before writing anything if one has gone.
  const read = ['DX extract', 'DX full', 'Name', 'Original Film or informations', 'Manufacturer', 'reliability', 'Country',
    'Beginning year', 'End year', 'Distributor', 'Ava'];
  read.forEach(col);
  // A blank line in the download holds no row: it is skipped, as only
  // upstream could remove it (the snapshot and the build still stop on one).
  // Rows keep their numbers in the errors.
  const blank = (r) => r.length === 1 && r[0].trim() === '';
  checkFieldCounts(header, lines.map((r) => (blank(r) ? header : r)), url);
  const rows = lines.filter((r) => !blank(r));

  const keep = rows.filter((r) => r[extract].trim() !== '' || r[full].trim() !== '');
  // A header with no rows under it, or only rows without a number: the snapshot would be replaced with nothing.
  if (!keep.length) throw new Error(`${url}: no row has a "DX extract" or "DX full" number`);
  const dropPic = (r) => r.filter((_, i) => i !== pic);
  // The rows of the snapshot this replaces, with their IDs, if it has them.
  const path = join(OUT_DIR, 'film_database_dx.csv');
  const [oldHeader, ...oldRows] = readCsv(await readFile(path, 'utf8').catch(() => ''), 'film_database_dx.csv');
  const snapshot = Boolean(oldHeader) && oldHeader[0] === 'ID';
  // Its rows and IDs, checked as the build checks them, before anything is
  // written: a stray quote would join rows into one, an ID column that is not
  // first would have every row numbered anew, and a bad or repeated ID would
  // be passed on to the rows written.
  if (oldHeader) checkFieldCounts(oldHeader, oldRows, 'film_database_dx.csv');
  if (!snapshot && oldHeader && oldHeader.includes('ID')) throw new Error('film_database_dx.csv: the "ID" column is not the first; move it back to the front');
  const given = new Set();
  for (const [n, [id]] of (snapshot ? oldRows : []).entries()) {
    const value = /^\d+$/.test(id.trim()) ? Number(id) : 0;
    if (value < 1 || given.has(value)) throw new Error(`film_database_dx.csv: CSV row ${n + 2}: ID "${id}" is missing, repeated or not a whole number`);
    given.add(value);
  }
  const by = sharedColumns(dropPic(header), snapshot ? oldHeader : ['ID', ...dropPic(header)], read);
  const { ids, lastId } = assignIds(keep.map((r) => by.now(dropPic(r))), snapshot ? oldRows.map(by.before) : [], recorded.lastId);
  await writeFile(path, formatCsv([['ID', ...dropPic(header)], ...keep.map((r, i) => [String(ids[i]), ...dropPic(r)])], ';'));

  const source = sourceRecord({ commit, rowsUpstream: rows.length, rowsKept: keep.length, lastId }, recorded);
  await writeFile(join(OUT_DIR, 'source.json'), JSON.stringify(source, null, 2) + '\n');
  const n = (count) => count.toLocaleString('en-US');
  console.log(`Kept ${n(keep.length)} of ${n(rows.length)} rows from ${REPO}@${commit.slice(0, 7)}`);
  // The IDs in use that the snapshot no longer shows are retired too: one for
  // each row the last update kept, less the snapshot's IDs that update could
  // have given (those up to its lastId). Without a snapshot that has IDs, all
  // of them are; before IDs, none was in use.
  const before = snapshot ? oldRows.map(([id]) => Number(id)) : [];
  const shown = before.filter((id) => id <= recorded.lastId).length;
  console.log(idsReport(ids, before, recorded.lastId > 0 ? Math.max(0, (recorded.rowsKept || 0) - shown) : 0));
  console.log('Next: npm run build:data, then follow "Updating the data" in data/README.md.');
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
