#!/usr/bin/env node
// Compile the CSV files in data/ into the lookup tables the web app loads: one file
// per dataset, because the two have different licenses (see REUSE.toml), and
// the indexes it searches them with (scripts/lib/dx-index.mjs). The output is
// deterministic, so `npm test` can check it is current.
//
//   node scripts/build-data.mjs           # write site/js/dx-data*.js and dx-index.js
//   node scripts/build-data.mjs --check   # exit 1 if a file is out of date

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCsvObjects } from './lib/csv.mjs';
import { buildIndex } from './lib/dx-index.mjs';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (path) => readFile(join(ROOT, path), 'utf8');

/**
 * The rows of a CSV file in data/ as objects keyed by its header, which must
 * have the columns the build reads: its errors name the file, and the column
 * missing.
 */
async function table(path, columns, delimiter) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  let rows;
  try {
    rows = readCsvObjects(await read(path), delimiter);
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
  const missing = rows.length ? columns.find((name) => !(name in rows[0])) : undefined;
  // A snapshot from before there were IDs has no ID column at all.
  if (missing === 'ID') throw new Error(`${file} has no column "ID": \`npm run update:community-data\` gives its rows their IDs`);
  if (missing !== undefined) throw new Error(`${file} has no column "${missing}"`);
  return rows;
}

/** source.json, which records the database's commit: its errors name it too. */
async function source(path) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  let record;
  try {
    record = JSON.parse(await read(path));
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
  // The full hash, as the update records it: it goes into the files' attribution.
  if (typeof record?.commit !== 'string' || !/^[0-9a-f]{40}$/.test(record.commit)) throw new Error(`${file} has no full commit hash in "commit"`);
  return record;
}

// Harman Technologies Ltd makes ILFORD Photo films; Wikipedia's "DX number"
// article lists Part 1 numbers 105-110 under "Ilford Photo".
const ALSO_KNOWN_AS = { 'Harman Technologies': 'ILFORD Photo' };

// The edition the page's texts name too ("in production in 2008",
// "discontinued by 2008" …): for a newer one, search site/ for 2008 as well.
const I3A_SOURCE = {
  title: 'DX Codes for 135-Size Film',
  publisher: 'International Imaging Industry Association (I3A)',
  date: 'February 2008',
  links: [
    'https://www.yumpu.com/it/document/view/3454560/dx-codes-for-135-size-film-international-imaging-industry-association',
    'https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/',
  ],
};

function clean(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(text, fallback) {
  return /^\d+$/.test(text.trim()) ? parseInt(text, 10) : fallback;
}

/** A classic script that sets DX[name] in the browser and module.exports in Node. */
function script(header, name, value) {
  return `${header}(function (root) {
  'use strict';
  const data = ${JSON.stringify(value)};
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.DX = root.DX || {}).${name} = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

/**
 * The version the three files share: a hash of the data the build writes
 * into them, so that it changes whenever a build changes the data of any of
 * them, and stays the same when a build writes the same again. The page
 * stops if the three differ (site/js/dx-lookup.js), as when the browser kept
 * an old copy of one.
 */
export function versionOf(...datasets) {
  return createHash('sha256').update(JSON.stringify(datasets)).digest('hex').slice(0, 16);
}

/** The generated files, by path from the repository root. */
export async function buildData() {
  const part1Rows = await table('data/i3a-2008/part1-assignments.csv', ['part1', 'assignee', 'aps', 'previously']);
  const productRows = await table('data/i3a-2008/products.csv', ['part1', 'part2', 'product', 'sensitizer', 'status']);
  const augmentedRows = await table('data/i3a-2008/augmented-cassette-codes.csv', ['cassette_code', 'product', 'sensitizer']);
  const communityRows = await table('data/big-film-database/film_database_dx.csv', ['ID', 'DX extract', 'DX full', 'Name',
    'Original Film or informations', 'Manufacturer', 'reliability', 'Country', 'Beginning year', 'End year', 'Distributor', 'Ava'], ';');
  const communitySource = await source('data/big-film-database/source.json');

  // One table of sensitizers: the Part 1 table's short label ("Eastman Kodak")
  // paired with the full name used as the product-section title.
  const fullNameByLabel = new Map();
  const labelByPart1 = new Map(part1Rows.map((r) => [Number(r.part1), r.assignee]));
  for (const p of productRows) {
    const label = labelByPart1.get(Number(p.part1));
    if (!label) throw new Error(`Product ${p.product} uses unassigned Part 1 ${p.part1}`);
    const known = fullNameByLabel.get(label);
    if (known && known !== p.sensitizer) throw new Error(`${label} maps to both ${known} and ${p.sensitizer}`);
    fullNameByLabel.set(label, p.sensitizer);
  }
  const labels = [...new Set(part1Rows.map((r) => r.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en')); // the same order on any computer
  const sensitizers = labels.map((label) => {
    const name = fullNameByLabel.get(label);
    if (!name) throw new Error(`No product section for assignee ${label}`);
    return ALSO_KNOWN_AS[label] ? { label, name, aka: ALSO_KNOWN_AS[label] } : { label, name };
  });
  const sensitizerIndex = (label) => labels.indexOf(label);
  const indexByFullName = (name) => labels.findIndex((l) => fullNameByLabel.get(l) === name);

  const part1 = part1Rows.map((r, i) => {
    if (Number(r.part1) !== i) throw new Error('part1-assignments.csv must list 0..127 in order');
    return [r.assignee ? sensitizerIndex(r.assignee) : -1, r.aps === 'yes' ? 1 : 0, r.previously];
  });

  // Each row of both sources starts with its record ID, by which the page
  // refers to it: the registry's rows by their row in its files, and the
  // database's by the ID column of its snapshot, which keeps a row's ID
  // across updates (scripts/update-community-data.mjs). A correction that
  // adds or removes a registry row renumbers the rows after it.
  // The PDF lists three Agfa products twice; keep one of each.
  const seen = new Set();
  const products = [];
  for (const [n, p] of productRows.entries()) {
    const key = [p.part1, p.part2, p.product, p.status].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    products.push([
      n + 1,
      Number(p.part1),
      p.part2 === '' ? -1 : Number(p.part2), // -1: Part 2 "not identified" in the list
      p.product,
      indexByFullName(p.sensitizer),
      // The status its section states: 1 in use, 0 no longer made, -1 neither.
      p.status === 'in-use' ? 1 : p.status === 'discontinued' ? 0 : -1,
    ]);
  }

  const augmented = augmentedRows.map((r, n) => [n + 1, r.cassette_code, r.product, indexByFullName(r.sensitizer)]);

  const ids = new Set();
  const community = communityRows.map((r, n) => {
    const id = toInt(r.ID, -1);
    if (id < 1 || ids.has(id)) throw new Error(`film_database_dx.csv: CSV row ${n + 2}: ID "${r.ID}" is missing, repeated or not a whole number`);
    ids.add(id);
    const full = r['DX full'].trim();
    // As recorded: a few rows have only the cassette number (-1).
    const extract = toInt(r['DX extract'], -1);
    const rawName = clean(r.Name);
    const hash = rawName.indexOf('#');
    const name = hash === -1 ? rawName : rawName.slice(0, hash).trim();
    const tags = hash === -1 ? '' : rawName.slice(hash).replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
    return [
      id,
      extract,
      full,
      name,
      tags,
      clean(r['Original Film or informations']),
      clean(r.Manufacturer),
      toInt(r.reliability, -1),
      clean(r.Country),
      clean(r['Beginning year']),
      clean(r['End year']),
      clean(r.Distributor),
      toInt(r.Ava, -1),
    ];
  });

  const i3aHeader = `/*
 * GENERATED by scripts/build-data.mjs from data/i3a-2008/ — do not edit by hand.
 *
 * DX number tables for the DX Film Edge Decoder, transcribed from I3A, "DX Codes
 * for 135-Size Film", February 2008 (factual registry data; see data/README.md).
 * The community data is in dx-data-community.js. Its version is the build's,
 * the same in all three data files.
 */
`;
  const communityHeader = `/*
 * GENERATED by scripts/build-data.mjs from data/big-film-database/ — do not edit by hand.
 *
 * Community film data for the DX Film Edge Decoder, adapted from
 * The Big Film Database (dxdatabase) © 2018 by Dxdatabase,
 * https://github.com/dxdatabase/Open-source-film-database (commit ${communitySource.commit.slice(0, 7)}),
 * licensed under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/.
 * Changes: kept rows with a DX extract or a cassette number, dropped image
 * names, gave each row a record ID, split "#" search tags from names, removed
 * HTML markup, made no-break spaces plain and dropped repeated or outer
 * spaces, compacted to arrays, added the build's version and a field for the
 * commit it is published from. This whole file, including the code that loads
 * the data, is under CC BY-SA 4.0.
 */
`;
  const indexHeader = `/*
 * GENERATED by scripts/build-data.mjs from data/ — do not edit by hand.
 *
 * The indexes the DX Film Edge Decoder searches by DX number and by cassette
 * number (scripts/lib/dx-index.mjs): the record numbers of the rows of
 * dx-data.js and dx-data-community.js (the registry's augmented ones
 * negative), sorted by the number each search looks up and, under one
 * number, by score. As it is made from
 * The Big Film Database (dxdatabase) © 2018 by Dxdatabase,
 * https://github.com/dxdatabase/Open-source-film-database (commit ${communitySource.commit.slice(0, 7)}),
 * this whole file is under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/.
 * Its version is the build's, the same in all three data files.
 */
`;
  const i3a = { source: I3A_SOURCE, sensitizers, part1, products, augmented };
  const communityData = { source: communitySource, rows: community };
  const index = buildIndex(i3a, communityData);
  // First in each file, where they are seen; the build is left empty for
  // scripts/stamp-build.mjs to fill in the copy published.
  const version = versionOf(i3a, communityData, index);
  const build = '';
  return {
    'site/js/dx-data.js': script(i3aHeader, 'data', { version, build, ...i3a }),
    'site/js/dx-data-community.js': script(communityHeader, 'communityData', { version, build, ...communityData }),
    'site/js/dx-index.js': script(indexHeader, 'index', { version, build, ...index }),
  };
}

async function main() {
  const files = await buildData();
  if (process.argv.includes('--check')) {
    const stale = [];
    for (const [path, text] of Object.entries(files)) {
      if ((await readFile(join(ROOT, path), 'utf8').catch(() => '')) !== text) stale.push(path);
    }
    if (stale.length) {
      console.error(`Out of date: ${stale.join(', ')}; run \`npm run build:data\`.`);
      process.exit(1);
    }
    console.log(`Up to date: ${Object.keys(files).join(', ')}.`);
    return;
  }
  for (const [path, text] of Object.entries(files)) {
    await writeFile(join(ROOT, path), text);
    console.log(`Wrote ${path} (${(text.length / 1024).toFixed(0)} KB)`);
  }
}

if (isMain(import.meta)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
