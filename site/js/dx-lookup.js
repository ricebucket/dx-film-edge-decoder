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

  /** The words of a normalized text, letters and digits only ("t-max 100" gives t, max, 100). */
  function wordsOf(text) {
    return text.split(/[^a-z0-9]+/).filter(Boolean);
  }

  /**
   * A field's words written together from each word on, up to six of them,
   * as people also type them: "t", "max", "400" gives tmax400, max400, 400.
   */
  function runsFrom(words) {
    return words.map((_, i) => words.slice(i, i + 6).join(''));
  }

  /** Every run of neighboring words written together, a whole name's words included: t, tmax, tmax400, max … */
  function joinsOf(words) {
    const out = [];
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j <= Math.min(words.length, i + 6); j++) out.push(words.slice(i, j).join(''));
    return out;
  }

  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const AVAILABILITY = { 0: 'discontinued', 1: 'possibly discontinued', 2: 'on the market' };

  /** `data` from dx-data.js; `communityData` from dx-data-community.js, if loaded. */
  return function createLookup(data, communityData) {
    const sensitizers = data.sensitizers;

    const sensitizer = (i) => (i >= 0 ? sensitizers[i] : null);

    const products = data.products.map(([part1, part2, name, s, status], index) => ({
      source: 'i3a',
      index,
      part1,
      part2: part2 === -1 ? null : part2,
      wildcard: part2 === -1,
      name,
      sensitizer: sensitizer(s),
      // 'in-use' or 'discontinued' as the registry says, or null where its maker's list says neither.
      status: status === 1 ? 'in-use' : status === 0 ? 'discontinued' : null,
    }));

    const community = (communityData ? communityData.rows : []).map((row, index) => {
      const [extract, full, name, tags, original, manufacturer, reliability, country, from, to, distributor, ava] = row;
      // Part 1 = 0 is valid (GB/T 9185-2003, Annex A.3.1), but no maker held it
      // in 2008, so community numbers below 16 are not taken as edge codes.
      const inRange = extract >= 16 && extract <= 2047;
      // The database keeps the cassette number and the DX number apart, and
      // they can differ (Harman Phoenix II: cassette 017765, DX 105-3; Black's
      // Astral 200: cassette 701310, DX 1310). Worked out once, here:
      // - agrees: the cassette's own digits give the DX number recorded
      //   (GB/T 9185-2003 §9.3);
      // - edge: the DX number recorded, where the entry says it was read
      //   from the film's edge (or its barcode); otherwise nothing says which
      //   code the edge carries.
      const agrees = /^\d{6}$/.test(full) && parseInt(full.slice(1, 5), 10) === extract;
      const edge = inRange && /film (edge|barcode)/i.test(`${name} ${original}`) ? { part1: extract >> 4, part2: extract & 15 } : null;
      const rated = reliability === -1 ? null : reliability;
      return {
        source: 'community',
        index,
        extract,
        part1: inRange ? extract >> 4 : null,
        part2: inRange ? extract & 15 : null,
        full,
        agrees,
        edge,
        name,
        tags,
        original,
        manufacturer,
        reliability: rated,
        country,
        from,
        to,
        distributor,
        availability: AVAILABILITY[ava] || null,
        // How readily the entry names its DX number, for every list of them:
        // a cassette that carries the number shows a 35 mm DX film (not 16 mm,
        // 120 or sheet film); an entry without a note is mostly the maker's own
        // film, not a rebrand; then the database's certainty, which rates the
        // note (one without counts as the middle of its 0–4 scale).
        score: (agrees ? 4 : 0) + (original ? 0 : 2) + (rated === null ? 2 : rated) / 4,
      };
    });

    // The registry's "augmented" cassette numbers (Annex A.4), which give no
    // DX number: found by search like its other films, by name or by number.
    const augmented = data.augmented.map(([code, name, s], index) => ({
      source: 'i3a', index: `augmented-${index}`, code, full: code, extract: parseInt(code.slice(1, 5), 10),
      part1: null, part2: null, name, sensitizer: sensitizer(s), status: null,
    }));

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

    // Search index: one per entry, with the words of each field and those
    // words written together, so that matches never run from one field into
    // the next ("PhotoPoint / Max" is no "tmax").
    const haystack = (entry, fields) => {
      const normal = fields.filter(Boolean).map(normalize);
      const words = normal.map(wordsOf);
      const nameWords = wordsOf(normalize(entry.name));
      return {
        entry,
        name: normalize(entry.name),
        text: normal.join(' '),
        words: words.flat(),
        runs: words.flatMap(runsFrom),
        nameRuns: runsFrom(nameWords),
        nameJoins: joinsOf(nameWords),
      };
    };
    const haystacks = [
      ...[...products, ...augmented].map((p) => haystack(p, [p.name, p.sensitizer && p.sensitizer.label, p.sensitizer && p.sensitizer.aka])),
      ...community.map((c) => haystack(c, [c.name, c.tags, c.original, c.manufacturer, c.distributor])),
    ];

    /**
     * Search by film name, maker or DX number. A DX number written as one
     * ("79-15", "DX 1279", the cassette number "315223") lists only that
     * code's entries; a bare number such as "400" or "1600" can also be a
     * film speed, so its code's entries come after films with the number in
     * their name.
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
      if (!dx) {
        // A cassette number that gives no DX number (augmented, or above
        // 8191) still finds the films recorded with it.
        const bare = q.replace(/^dx[\s\-\u2010-\u2015\u2212]*/, '');
        const cassette = codec.parseCassette(bare);
        if (cassette) {
          const only = /^\d{6}$/.test(bare);
          let found = false;
          for (const a of augmented) {
            if (a.code === cassette.digits) {
              add(a, only ? 0 : 7);
              found = true;
            }
          }
          for (const c of community) {
            if (c.full.slice(0, 5) === cassette.digits.slice(0, 5)) {
              add(c, only ? 1 : 8);
              found = true;
            }
          }
          if (only && found) return finish();
        }
      }
      if (dx) {
        const hit = byDx(dx.part1, dx.part2);
        // How it was typed says whether it can only be a DX number: "79-15",
        // "DX 1279" or six plain digits can; "400" (a film speed) or "400 135"
        // can also be part of a name, so their code's entries come last.
        const only = dx.kind === 'parts' || /^dx/.test(q) || (dx.kind === 'cassette' && /^\d{6}$/.test(q));
        hit.products.forEach((p) => add(p, only ? 0 : 7));
        hit.community.forEach((c) => add(c, only ? 1 : 8));
        // The films recorded with this very cassette number, which can give
        // another DX number for their edge (as byCassette finds them).
        if (dx.kind === 'cassette') {
          for (const c of community) if (c.full.slice(0, 5) === dx.cassette.digits.slice(0, 5)) add(c, only ? 1 : 8);
        }
        if (dx.kind === 'parts') {
          // Names that carry it as typed ("AGFACOLOR OPTIMA 100-2", "VR100-4")
          // come next; "20-0" is still no "200", nor part of "120-0".
          const typed = new RegExp(`(^|[^0-9])${escapeRegExp(q)}($|[^0-9])`);
          for (const h of haystacks) if (typed.test(h.text)) add(h.entry, 4 + (h.entry.source === 'community' ? 0.5 : 0));
        }
        if (only) return finish();
      }

      // A token matches the text as typed, part of one word, or the start of
      // neighboring words written together ("tmax" or "tmax400" for "T-MAX 400").
      const tokens = q.split(/\s+/).filter(Boolean).map((t) => ({ t, c: compact(t) || t }));
      const found = (h, { t, c }) => h.text.includes(t) || h.words.some((w) => w.includes(c)) || h.runs.some((r) => r.startsWith(c));
      // Rank: whole words in the name, then word starts, then any substring,
      // then matches in other fields; registry entries before community ones.
      for (const h of haystacks) {
        if (!tokens.every((k) => found(h, k))) continue;
        let rank = 6;
        if (tokens.every(({ c }) => h.nameJoins.includes(c))) rank = 2;
        else if (tokens.every(({ c }) => h.nameRuns.some((r) => r.startsWith(c)))) rank = 3;
        else if (h.name.includes(q)) rank = 4;
        else if (tokens.every(({ t }) => h.name.includes(t))) rank = 5;
        add(h.entry, rank + (h.entry.source === 'community' ? 0.5 : 0));
      }
      return finish();

      function finish() {
        // As well matched: the entry that names its DX number most readily (score) first.
        const results = [...ranks.values()].sort((a, b) => a.rank - b.rank || (b.entry.score || 0) - (a.entry.score || 0) || a.entry.name.localeCompare(b.entry.name, 'en'));
        const out = results.map((r) => r.entry);
        return limit ? out.slice(0, limit) : out;
      }
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
