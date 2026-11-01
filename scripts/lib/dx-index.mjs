// The indexes the page searches by DX number and by cassette number
// (site/js/dx-index.js): for each, the record numbers of the rows of
// dx-data.js and dx-data-community.js, sorted by the key that search looks up
// and, under one key, by the rows' own score, so that they come almost in the
// order the page shows them (it adds how each matches, and a pick: see
// site/js/dx-lookup.js). Nothing else: the rows stay as the sources give
// them, and the page reads every detail, keys included, from them.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const codec = require('../../site/js/dx-codec.js');
const createLookup = require('../../site/js/dx-lookup.js');

const { entriesOf, middleOf, ranked, scoreOf, cassetteKey } = createLookup;
const isEdgeCode = (extract) => extract !== null && extract >= 16 && extract <= 2047;

/**
 * `items` sorted by keyOf, and under one key ranked by their own score
 * (scoreOf, without a match or a pick), by name where scores are equal: the
 * sort by key keeps the ranking's order.
 */
function sorted(items, keyOf) {
  return ranked(items, (e) => scoreOf(e)).sort((a, b) => keyOf(a) - keyOf(b));
}

/** The indexes for `data` (dx-data.js) and `communityData` (dx-data-community.js). */
export function buildIndex(data, communityData) {
  const { products, community, augmented } = entriesOf(data, communityData);
  // The registry's augmented numbers as the negative of their record number.
  const ref = (e) => (e.source === 'i3a' ? -e.record : e.record);
  const record = (e) => e.record;
  return {
    // Registry films with a Part 2, by DX number (16 × Part 1 + Part 2).
    dx: sorted(products.filter((p) => !p.wildcard), (p) => codec.dxExtract(p.part1, p.part2)).map(record),
    // Registry films listed for a Part 1 without a Part 2, by Part 1.
    any: sorted(products.filter((p) => p.wildcard), (p) => p.part1).map(record),
    // Database rows that record a DX number an edge can carry, by that number.
    recorded: sorted(community.filter((e) => e.part1 !== null), (e) => e.extract).map(record),
    // Database rows whose cassette number gives a DX number an edge can carry
    // that they do not record, by that number.
    related: sorted(community.filter((e) => isEdgeCode(middleOf(e.full)) && middleOf(e.full) !== e.extract), (e) => middleOf(e.full)).map(record),
    // The registry's augmented numbers and the database rows with a cassette
    // number, by its middle four digits.
    cassette: sorted([...augmented, ...community.filter((e) => cassetteKey(e) !== null)], cassetteKey).map(ref),
    // The database rows that record a DX extract with no cassette number, or
    // one whose middle four digits differ, by that extract.
    recordedOnly: sorted(community.filter((e) => e.extract !== null && cassetteKey(e) !== e.extract), (e) => e.extract).map(record),
  };
}
