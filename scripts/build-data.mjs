#!/usr/bin/env node
// Compile the CSV files in data/ into the lookup tables the web app loads: one file
// per dataset, because the two have different licenses (see REUSE.toml). The
// output is deterministic, so `npm test` can check it is current.
//
//   node scripts/build-data.mjs           # write site/js/dx-data*.js
//   node scripts/build-data.mjs --check   # exit 1 if a file is out of date

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCsvObjects } from './lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (path) => readFile(join(ROOT, path), 'utf8');

// Harman Technologies Ltd makes ILFORD Photo films; Wikipedia's "DX number"
// article lists Part 1 numbers 105-110 under "Ilford Photo".
const ALSO_KNOWN_AS = { 'Harman Technologies': 'ILFORD Photo' };

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

/** The generated files, by path from the repository root. */
export async function buildData() {
  const part1Rows = readCsvObjects(await read('data/i3a-2008/part1-assignments.csv'));
  const productRows = readCsvObjects(await read('data/i3a-2008/products.csv'));
  const augmentedRows = readCsvObjects(await read('data/i3a-2008/augmented-cassette-codes.csv'));
  const communityRows = readCsvObjects(await read('data/big-film-database/film_database_dx.csv'), ';');
  const communitySource = JSON.parse(await read('data/big-film-database/source.json'));

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
  const labels = [...new Set(part1Rows.map((r) => r.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

  // The PDF lists three Agfa products twice; keep one of each.
  const seen = new Set();
  const products = [];
  for (const p of productRows) {
    const key = [p.part1, p.part2, p.product, p.status].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    products.push([
      Number(p.part1),
      p.part2 === '' ? -1 : Number(p.part2), // -1: Part 2 "not identified" in the list
      p.product,
      indexByFullName(p.sensitizer),
      p.status === 'in-use' ? 1 : 0,
    ]);
  }

  const augmented = augmentedRows.map((r) => [r.cassette_code, r.product, indexByFullName(r.sensitizer)]);

  const community = communityRows.map((r) => {
    const full = r['DX full'].trim();
    // A few rows only have the 6-digit cassette number; its middle four digits
    // are the DX extract by definition.
    const extract = toInt(r['DX extract'], /^\d{6}$/.test(full) ? parseInt(full.slice(1, 5), 10) : -1);
    const rawName = clean(r.Name);
    const hash = rawName.indexOf('#');
    const name = hash === -1 ? rawName : rawName.slice(0, hash).trim();
    const tags = hash === -1 ? '' : rawName.slice(hash).replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
    return [
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
 * The community data is in dx-data-community.js.
 */
`;
  const communityHeader = `/*
 * GENERATED by scripts/build-data.mjs from data/big-film-database/ — do not edit by hand.
 *
 * Community film data for the DX Film Edge Decoder, adapted from
 * The Big Film Database (dxdatabase) © 2018 by Dxdatabase,
 * https://github.com/dxdatabase/Open-source-film-database (commit ${communitySource.commit.slice(0, 7)}),
 * licensed under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/.
 * Changes: kept rows with a DX number, dropped image names, split "#" search
 * tags from names, removed HTML markup, compacted to arrays. This whole file,
 * including the code that loads the data, is under CC BY-SA 4.0.
 */
`;
  return {
    'site/js/dx-data.js': script(i3aHeader, 'data', { source: I3A_SOURCE, sensitizers, part1, products, augmented }),
    'site/js/dx-data-community.js': script(communityHeader, 'communityData', { source: communitySource, rows: community }),
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
