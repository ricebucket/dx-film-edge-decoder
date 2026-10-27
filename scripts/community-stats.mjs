#!/usr/bin/env node
// Print the figures that research/04-community-database.md quotes for the
// snapshot of The Big Film Database in data/big-film-database/. Run it after
// updating that snapshot and copy the new figures into the report.
//
//   node scripts/community-stats.mjs

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCsvObjects } from './lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(join(ROOT, path), 'utf8');

export async function communityStats() {
  const source = JSON.parse(await read('data/big-film-database/source.json'));
  const rows = readCsvObjects(await read('data/big-film-database/film_database_dx.csv'), ';');
  const registry = new Set(
    readCsvObjects(await read('data/i3a-2008/products.csv'))
      .filter((p) => p.part2 !== '')
      .map((p) => 16 * Number(p.part1) + Number(p.part2)),
  );

  const count = (test) => rows.filter(test).length;
  const tally = (column, values) => Object.fromEntries(values.map((v) => [v, count((r) => r[column].trim() === v)]));
  const digits = (text) => /^\d+$/.test(text.trim());
  const full = (r) => (/^\d{6}$/.test(r['DX full'].trim()) ? r['DX full'].trim() : '');
  // The same rule as scripts/build-data.mjs: a missing DX extract is the
  // middle four digits of the cassette number.
  const extract = (r) => (digits(r['DX extract']) ? Number(r['DX extract']) : full(r) ? Number(full(r).slice(1, 5)) : -1);

  const edge = new Set(rows.map(extract).filter((x) => x >= 16 && x <= 2047));
  return {
    commit: source.commit.slice(0, 7),
    retrieved: source.retrieved,
    rowsUpstream: source.rowsUpstream,
    rowsKept: rows.length,
    withExtract: count((r) => digits(r['DX extract'])),
    onlyCassette: count((r) => !digits(r['DX extract']) && full(r)),
    extractDisagrees: count((r) => digits(r['DX extract']) && full(r) && Number(r['DX extract']) !== Number(full(r).slice(1, 5))),
    above2047: count((r) => extract(r) > 2047),
    below16: count((r) => extract(r) >= 0 && extract(r) < 16),
    htmlMarkup: count((r) => Object.values(r).some((v) => /<\/?[a-z][^>]*>/i.test(v))),
    searchTags: count((r) => r.Name.includes('#')),
    certainty: tally('reliability', ['0', '1', '2', '3', '4']),
    availability: tally('Ava', ['0', '1', '2']),
    edgeDxNumbers: edge.size,
    notInRegistry: [...edge].filter((x) => !registry.has(x)).length,
  };
}

async function main() {
  const s = await communityStats();
  const n = (x) => x.toLocaleString('en-GB');
  const certainty = Object.values(s.certainty).reduce((a, b) => a + b, 0);
  console.log(`Snapshot: commit ${s.commit}, retrieved ${s.retrieved}
Rows upstream: ${n(s.rowsUpstream)}; with a DX number: ${n(s.rowsKept)} (${n(s.withExtract)} with a DX extract, ${n(s.onlyCassette)} with only a cassette number)
DX numbers that can appear on a film edge (16-2047): ${n(s.edgeDxNumbers)}, of which not in the 2008 registry: ${n(s.notInRegistry)}

Data-quality findings:
  DX extract disagrees with the cassette number: ${s.extractDisagrees}
  number above 2047: ${s.above2047}
  number below 16: ${s.below16}
  HTML markup inside a field: ${s.htmlMarkup}
  "#" search tags in the name: ${s.searchTags}
  certainty recorded: ${certainty} (${Object.entries(s.certainty).map(([k, v]) => `${k}: ${v}`).join(', ')})
  availability: ${n(s.availability[0])} discontinued, ${s.availability[1]} unsure, ${s.availability[2]} on the market`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
