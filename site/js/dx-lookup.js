/*
 * Lookups over the DX tables in dx-data.js (the I3A list) and
 * dx-data-community.js (The Big Film Database): what a DX number means, film
 * search by name, and cassette-number matches. No DOM.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dx-codec.js'));
  else (root.DX = root.DX || {}).createLookup = factory(root.DX.codec);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (codec) {
  'use strict';

  function normalize(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function compact(text) {
    return text.replace(/[^a-z0-9]/g, '');
  }

  const AVAILABILITY = { 0: 'discontinued', 1: 'possibly discontinued', 2: 'on the market' };

  /** `data` from dx-data.js; `communityData` from dx-data-community.js, if loaded. */
  return function createLookup(data, communityData) {
    const sensitizers = data.sensitizers;

    const sensitizer = (i) => (i >= 0 ? sensitizers[i] : null);

    const products = data.products.map(([part1, part2, name, s, inUse], index) => ({
      source: 'i3a',
      index,
      part1,
      part2: part2 === -1 ? null : part2,
      wildcard: part2 === -1,
      name,
      sensitizer: sensitizer(s),
      inUse: inUse === 1,
    }));

    const community = (communityData ? communityData.rows : []).map((row, index) => {
      const [extract, full, name, tags, original, manufacturer, reliability, country, from, to, distributor, ava] = row;
      // Part 1 = 0 is valid (GB/T 9185-2003, Annex A.3.1), but no maker held it
      // in 2008, so community numbers below 16 are not taken as edge codes.
      const inRange = extract >= 16 && extract <= 2047;
      return {
        source: 'community',
        index,
        extract,
        part1: inRange ? extract >> 4 : null,
        part2: inRange ? extract & 15 : null,
        full,
        name,
        tags,
        original,
        manufacturer,
        reliability: reliability === -1 ? null : reliability,
        country,
        from,
        to,
        distributor,
        availability: AVAILABILITY[ava] || null,
      };
    });

    const augmented = data.augmented.map(([code, name, s]) => ({ code, name, sensitizer: sensitizer(s) }));

    const productsByDx = new Map();
    const wildcardByPart1 = new Map();
    for (const p of products) {
      if (p.wildcard) push(wildcardByPart1, p.part1, p);
      else push(productsByDx, codec.dxExtract(p.part1, p.part2), p);
    }
    // Every community number can match a cassette; only those that fit an
    // edge code (part1 set) can match the bars on a film's edge.
    const communityByExtract = new Map();
    const communityByDx = new Map();
    for (const c of community) {
      push(communityByExtract, c.extract, c);
      if (c.part1 !== null) push(communityByDx, c.extract, c);
    }

    function push(map, key, value) {
      const list = map.get(key);
      if (list) list.push(value);
      else map.set(key, [value]);
    }

    function part1Info(n) {
      const [s, aps, previously] = data.part1[n] || [-1, 0, ''];
      return { part1: n, assigned: s !== -1, sensitizer: sensitizer(s), aps: aps === 1, previously: previously || null };
    }

    /** Everything known about a DX number (Part 1, Part 2). */
    function byDx(part1, part2) {
      const extract = codec.dxExtract(part1, part2);
      return {
        part1,
        part2,
        dxNumber: codec.formatDxNumber(part1, part2),
        extract,
        part1Info: part1Info(part1),
        products: [...(productsByDx.get(extract) || []), ...(wildcardByPart1.get(part1) || [])],
        community: communityByDx.get(extract) || [],
      };
    }

    function isKnown(part1, part2) {
      const extract = codec.dxExtract(part1, part2);
      return productsByDx.has(extract) || wildcardByPart1.has(part1) || communityByDx.has(extract);
    }

    /** Matches for a 6-digit cassette number (see codec.parseCassette). */
    function byCassette(digits) {
      const parsed = codec.parseCassette(digits);
      if (!parsed) return null;
      const sameCode = community.filter((c) => c.full.slice(0, 5) === parsed.digits.slice(0, 5));
      return {
        parsed,
        augmented: augmented.filter((a) => a.code === parsed.digits),
        dx: parsed.part1 === null ? null : byDx(parsed.part1, parsed.part2),
        sameCode,
        sameExtract: (communityByExtract.get(parsed.extract) || []).filter((c) => !sameCode.includes(c)),
      };
    }

    // Search index: one normalized haystack per entry.
    const haystacks = [
      ...products.map((p) => ({
        entry: p,
        name: normalize(p.name),
        text: normalize([p.name, p.sensitizer && p.sensitizer.label, p.sensitizer && p.sensitizer.aka].join(' ')),
      })),
      ...community.map((c) => ({
        entry: c,
        name: normalize(c.name),
        text: normalize([c.name, c.tags, c.original, c.manufacturer, c.distributor].join(' ')),
      })),
    ];
    for (const h of haystacks) h.compact = compact(h.text);

    /**
     * Search by film name, maker or DX number. A DX number in any form the
     * codec reads ("79-15", "1279", "315223") lists that code's entries
     * first; a bare number such as "400" or "1600" can also be a film speed,
     * so its code's entries come after films with the number in their name.
     */
    function search(query, limit) {
      const q = normalize(query).trim();
      if (!q) return [];
      const ranks = new Map();
      const add = (entry, rank) => {
        const key = `${entry.source}:${entry.index}`;
        const known = ranks.get(key);
        if (!known || rank < known.rank) ranks.set(key, { entry, rank });
      };

      const dx = codec.parseDxNumber(q);
      if (dx) {
        const hit = byDx(dx.part1, dx.part2);
        const base = dx.kind === 'extract' ? 7 : 0;
        hit.products.forEach((p) => add(p, base));
        hit.community.forEach((c) => add(c, base + 1));
      }

      // Rank: whole words in the name, then word starts, then any substring,
      // then matches in other fields; registry entries before community ones.
      const tokens = q.split(/\s+/).filter(Boolean);
      for (const h of haystacks) {
        const ok = tokens.every((t) => h.text.includes(t) || (compact(t) && h.compact.includes(compact(t))));
        if (!ok) continue;
        const words = h.name.split(/[^a-z0-9]+/).filter(Boolean);
        let rank = 6;
        if (tokens.every((t) => words.includes(compact(t) || t))) rank = 2;
        else if (tokens.every((t) => words.some((w) => w.startsWith(compact(t) || t)))) rank = 3;
        else if (h.name.includes(q)) rank = 4;
        else if (tokens.every((t) => h.name.includes(t))) rank = 5;
        add(h.entry, rank + (h.entry.source === 'community' ? 0.5 : 0));
      }

      const results = [...ranks.values()].sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
      const out = results.map((r) => r.entry);
      return limit ? out.slice(0, limit) : out;
    }

    function stats() {
      const dxNumbers = new Set(products.filter((p) => !p.wildcard).map((p) => codec.dxExtract(p.part1, p.part2)));
      const communityDx = new Set(community.filter((c) => c.part1 !== null).map((c) => c.extract));
      return {
        products: products.length,
        productDxNumbers: dxNumbers.size,
        assignedPart1: data.part1.filter(([s]) => s !== -1).length,
        community: community.length,
        communityDxNumbers: communityDx.size,
        communityOnlyDxNumbers: [...communityDx].filter((x) => !dxNumbers.has(x)).length,
      };
    }

    return {
      sources: { i3a: data.source, community: communityData ? communityData.source : null },
      sensitizers,
      products,
      community,
      augmented,
      part1Info,
      byDx,
      isKnown,
      byCassette,
      search,
      stats,
    };
  };
});
