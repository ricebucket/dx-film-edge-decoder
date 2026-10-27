#!/usr/bin/env node
// Refresh data/big-film-database/ from The Big Film Database on GitHub.
//
//   node scripts/update-community-data.mjs              # the commit in source.json (reproducible)
//   node scripts/update-community-data.mjs --latest     # newest commit that changed film_database.csv
//   node scripts/update-community-data.mjs --commit <sha>
//
// The steps that follow an update are in data/README.md, "Updating the data".
//
// The Big Film Database (dxdatabase) © 2018 by Dxdatabase is licensed under
// CC BY-SA 4.0: https://github.com/dxdatabase/Open-source-film-database
// Changes made here: only rows that carry a DX number are kept, and the "Pic"
// column (box-image file names) is dropped. Everything else is copied verbatim.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv, formatCsv } from './lib/csv.mjs';

const REPO = 'dxdatabase/Open-source-film-database';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'big-film-database');

async function resolveCommit(args) {
  const i = args.indexOf('--commit');
  if (i !== -1) {
    if (!/^[0-9a-f]{7,40}$/.test(args[i + 1] || '')) throw new Error('--commit needs a commit hash');
    return args[i + 1];
  }
  if (!args.includes('--latest')) {
    return JSON.parse(await readFile(join(OUT_DIR, 'source.json'), 'utf8')).commit;
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?path=film_database.csv&per_page=1`);
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
  return (await res.json())[0].sha;
}

async function main() {
  const commit = await resolveCommit(process.argv.slice(2));
  const url = `https://raw.githubusercontent.com/${REPO}/${commit}/film_database.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const [header, ...rows] = parseCsv(await res.text(), ';');

  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" missing; upstream format changed`);
    return i;
  };
  const extract = col('DX extract');
  const full = col('DX full');
  const pic = col('Pic');
  // The other columns scripts/build-data.mjs reads: stop before writing anything if one has gone.
  ['Name', 'Original Film or informations', 'Manufacturer', 'reliability', 'Country',
    'Beginning year', 'End year', 'Distributor', 'Ava'].forEach(col);
  for (const [n, r] of rows.entries()) {
    if (r.length !== header.length) throw new Error(`Row ${n + 2}: ${r.length} fields, expected ${header.length}`);
  }

  const keep = rows.filter((r) => r[extract].trim() !== '' || r[full].trim() !== '');
  const dropPic = (r) => r.filter((_, i) => i !== pic);
  await writeFile(join(OUT_DIR, 'film_database_dx.csv'), formatCsv([dropPic(header), ...keep.map(dropPic)], ';'));

  const source = {
    title: 'The Big Film Database',
    author: 'Dxdatabase',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    repository: `https://github.com/${REPO}`,
    commit,
    file: 'film_database.csv',
    retrieved: new Date().toISOString().slice(0, 10),
    rowsUpstream: rows.length,
    rowsKept: keep.length,
    changes: [
      'Kept only rows with a "DX extract" or "DX full" number.',
      'Removed the "Pic" column (box-image file names).',
    ],
  };
  await writeFile(join(OUT_DIR, 'source.json'), JSON.stringify(source, null, 2) + '\n');
  console.log(`Kept ${keep.length} of ${rows.length} rows from ${REPO}@${commit.slice(0, 7)}`);
  console.log('Next: npm run build:data, then follow "Updating the data" in data/README.md.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
