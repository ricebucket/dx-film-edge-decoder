// What the lookups of a copy of the site find, as text: one line for every
// search, DX number and cassette number, with how many films it finds and a
// mark that changes when the films or their order change. The searches are the
// names in the data, their words, and forms people type. It is kept in
// tests/regressions/lookups.txt (scripts/check-regressions.mjs), and a unit
// test compares it with the lookups as they are.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

/** Typed forms that the names and their words do not give. */
const TYPED = [
  'portra 400', 'portra400', 'PORTRA', 'tmax', 't-max 100', 'tmax400', 'kodak gold', 'kodakgold200', 'hp5 plus', 'hp5+', 'fp4', 'xp2',
  'fuji 200', 'fujicolor 200', 'superia x-tra 400', 'ilford delta', 'agfa vista', 'jean coutu', 'eastman kodak company', 'made in japan',
  '400', '200', '1600', '100-2', '200-2', '20-0', '(20-0).', '40-0.', '“79-15”', '79-15', '012794', 'DX 400', 'dx coded',
  '２００', 'ｆｕｊｉ２００', '200–2', 'café', 'pan', 'japan', '1991', '彩韵200', '200彩韵', '彩韵 200', '彩韵-200', '柯达400', '写ルンです', '写ルンで1600', 'свема',
  'zzzzqq', 'a', '0 0',
];

const mark = (ids) => createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 8);

export function lookupSnapshot(site) {
  const require = createRequire(join(resolve(site), 'js', 'noop.js'));
  const createLookup = require('./dx-lookup.js');
  const lookup = createLookup(require('./dx-data.js'), require('./dx-data-community.js'), require('./dx-index.js'));
  const rows = [...lookup.products, ...lookup.augmented, ...lookup.community];

  const queries = new Set(TYPED);
  for (const row of rows) {
    queries.add(row.name);
    for (const word of row.name.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (word.length > 1) queries.add(word);
  }
  const lines = [
    'What the lookups find: written by `npm run check:regressions -- --update`, never by hand.',
    'Each line: what is looked up, how many films it finds, and a mark that changes when the films or their order change.',
    '',
  ];
  for (const query of [...queries].sort()) {
    const ids = lookup.search(query).map((found) => found.entry.id);
    lines.push(`search\t${query}\t${ids.length}\t${ids.length ? mark(ids) : '-'}`);
  }
  const lists = (hit, names) => names.map((name) => (hit[name] || []).map((entry) => entry.id));
  for (let part1 = 0; part1 < 128; part1++) {
    for (let part2 = 0; part2 < 16; part2++) {
      const ids = lists(lookup.byDx(part1, part2), ['products', 'community', 'related']);
      if (ids.some((list) => list.length)) lines.push(`DX\t${part1}-${part2}\t${ids.map((list) => list.length).join('+')}\t${mark(ids.map((list) => list.join(',')))}`);
    }
  }
  const cassettes = new Set(rows.map((row) => row.full).filter((full) => /^\d{6}$/.test(full || '')));
  for (const digits of [...cassettes].sort()) {
    const hit = lookup.byCassette(digits);
    const ids = lists(hit, ['augmented', 'augmentedRelated', 'exact', 'sameFirstFive', 'sameMiddle', 'recordedOnly']);
    lines.push(`cassette\t${digits}\t${ids.map((list) => list.length).join('+')}\t${mark(ids.map((list) => list.join(',')))}`);
  }
  return `${lines.join('\n')}\n`;
}
