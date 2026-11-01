/*
 * Lookups over the DX tables in dx-data.js (the I3A list) and
 * dx-data-community.js (The Big Film Database), whose rows stay as the
 * sources give them: what a DX number means, cassette-number matches, and
 * film search by name. Each kind of search has its own index: dx-index.js
 * for a DX number and a cassette number (scripts/lib/dx-index.mjs builds
 * it), and one made here for names. Every list of films is ranked by score
 * (scoreOf, `ranked`). No DOM.
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

  /**
   * The rows of both sources as objects, with nothing added but what the
   * standard's rules give. Each has its record ID (`id`, such as "i3a-137" or
   * "bfd-1096"), by which everything outside this file refers to it, and the
   * number it is given in its source's table (`record`), by which the index
   * does.
   */
  function entriesOf(data, communityData) {
    const sensitizer = (i) => (i >= 0 ? data.sensitizers[i] : null);
    const products = data.products.map(([record, part1, part2, name, s, status]) => ({
      id: `i3a-${record}`,
      source: 'i3a',
      record,
      part1,
      part2: part2 === -1 ? null : part2,
      wildcard: part2 === -1,
      name,
      sensitizer: sensitizer(s),
      // 'in-use' or 'discontinued' as the registry says, or null where its maker's list says neither.
      status: status === 1 ? 'in-use' : status === 0 ? 'discontinued' : null,
    }));
    const community = (communityData ? communityData.rows : []).map((row) => {
      const [record, extract, full, name, tags, original, manufacturer, reliability, country, from, to, distributor, ava] = row;
      // Part 1 = 0 is valid (GB/T 9185-2003, Annex A.3.1), but no maker held
      // it in 2008, so numbers below 16 are not taken as edge codes.
      const edge = extract >= 16 && extract <= 2047;
      return {
        id: `bfd-${record}`,
        source: 'community',
        record,
        // The DX extract, where the database records one: a row can have only a cassette number.
        extract: extract === -1 ? null : extract,
        part1: edge ? extract >> 4 : null,
        part2: edge ? extract & 15 : null,
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
    // The registry's "augmented" cassette numbers (Annex A.4), which give no
    // DX number: found by search like its other films, by name or by number.
    const augmented = data.augmented.map(([record, code, name, s]) => ({
      id: `i3a-a${record}`, source: 'i3a', record, code, full: code, extract: parseInt(code.slice(1, 5), 10),
      part1: null, part2: null, name, sensitizer: sensitizer(s), status: null,
    }));
    return { products, community, augmented };
  }

  /** A cassette number's middle four digits, which give its DX number (GB/T 9185-2003, §9.3), or null. */
  function middleOf(full) {
    return /^\d{6}$/.test(full) ? parseInt(full.slice(1, 5), 10) : null;
  }

  /** Whether a row's cassette number gives the DX number it records. */
  const agrees = (e) => e.extract !== null && middleOf(e.full) === e.extract;
  // The database's certainty, 0 to 4, which rates its note. Most rows have
  // none: they count as the middle of the scale, so that a row it rates 0 or
  // 1 does not come ahead of them.
  const UNRATED = 2;
  const certainty = (e) => (e.reliability === null ? UNRATED : e.reliability);

  /**
   * Every list of films is ranked by one number, its score, highest first;
   * films with the same score go by name (then by record, for the same
   * name). So it sorts by name first, then, keeping that order for equal
   * scores, by score. `scoreOf(item)` gives an item's score, and `entryOf`
   * the row whose name it goes by.
   */
  function ranked(items, scoreOf, entryOf = (item) => item) {
    const scored = items.map((item) => ({ item, entry: entryOf(item), score: scoreOf(item) }));
    scored.sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'en') || a.entry.record - b.entry.record);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }

  /**
   * The parts of a film's score, each outweighing all the parts after it
   * can add up to (scoreOf).
   */
  const WEIGHT = {
    picked: 1e6, // picked to come first: its "Show barcode" was used
    match: 1e4, // × how well it matches what was looked up, 0 to 10
    registry: 1e3, // listed in the 2008 I3A registry
    partTwo: 500, // the registry gives its Part 2, not its Part 1 alone
    agrees: 100, // its cassette number gives the DX number it records
    noNote: 10, // the database has no note on it
    certainty: 1, // × the database's certainty, 0 to 4 (UNRATED where it gives none)
  };

  /**
   * A film's score, by which every list ranks it (`ranked`), from the film
   * alone: whether it was `picked` to come first; `match`, how well it
   * matches what was looked up, from 10 for an exact match down, as each
   * list says; its source, the registry's ahead of the database's, and
   * whether the registry gives the film's Part 2; and for a database row,
   * whether its cassette number gives the DX number it records
   * (a 35 mm DX film rather than 16 mm, 120 or sheet film), whether it has
   * no note (mostly the maker's own film rather than a rebrand), and the
   * database's certainty, which rates the note (UNRATED where it gives none).
   */
  function scoreOf(e, match = 0, picked = false) {
    return (picked ? WEIGHT.picked : 0) + match * WEIGHT.match
      + (e.source === 'i3a' ? WEIGHT.registry + (e.part2 !== null ? WEIGHT.partTwo : 0)
        : (agrees(e) ? WEIGHT.agrees : 0) + (e.original ? 0 : WEIGHT.noNote) + certainty(e) * WEIGHT.certainty);
  }

  /** A row's place in the cassette number index: its cassette number's middle four digits. */
  const cassetteKey = (e) => middleOf(e.full);

  // The deploy this code was published with: scripts/stamp-build.mjs writes
  // the commit into it and into the three data files of the copy published.
  // Empty in the repository, where the files come from disk and no browser
  // keeps an older one.
  const BUILD = '';

  /**
   * `data` from dx-data.js, `communityData` from dx-data-community.js and
   * `index` from dx-index.js, built from the two: all three are needed.
   */
  function createLookup(data, communityData, index) {
    if (!data || !communityData || !index) throw new Error('The film data did not load: the page needs dx-data.js, dx-data-community.js and dx-index.js.');
    // The three come from one build, which gives them one version (a hash of
    // the data it wrote), and from this code's deploy (BUILD). One of them
    // cached from another build would point the index at the wrong rows, and
    // searches would miss films without a word; files of another deploy might
    // be read with their columns out of place, as other values.
    if (data.version !== index.version || communityData.version !== index.version || [data, communityData, index].some((d) => (d.build || '') !== BUILD)) {
      throw new Error('The film data does not match: dx-data.js, dx-data-community.js and dx-index.js come from different builds, or from another deploy than dx-lookup.js.');
    }
    const sensitizers = data.sensitizers;
    const { products, community, augmented } = entriesOf(data, communityData);
    // The index refers to rows by their number in their source's table: the
    // registry's augmented numbers, in the cassette number index, as negative.
    const table = (entries) => {
      const at = [];
      for (const e of entries) at[e.record] = e;
      return at;
    };
    const productAt = table(products);
    const rowAt = table(community);
    const augmentedAt = table(augmented);
    const cassetteRow = (ref) => (ref < 0 ? augmentedAt[-ref] : rowAt[ref]);

    /** The rows `refs` lists under `key`, in its order: `refs` is sorted by keyOf. */
    function underKey(refs, key, keyOf, rowOf) {
      let lo = 0;
      let hi = refs.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (keyOf(rowOf(refs[mid])) < key) lo = mid + 1;
        else hi = mid;
      }
      const out = [];
      for (let i = lo; i < refs.length && keyOf(rowOf(refs[i])) === key; i++) out.push(rowOf(refs[i]));
      return out;
    }
    const product = (n) => productAt[n];
    const row = (n) => rowAt[n];
    const dxKey = (p) => codec.dxExtract(p.part1, p.part2);
    const part1Key = (p) => p.part1;
    const extractKey = (e) => e.extract;

    function part1Info(n) {
      const [s, aps, previously] = data.part1[n] || [-1, 0, ''];
      return { part1: n, assigned: s !== -1, sensitizer: s >= 0 ? sensitizers[s] : null, aps: aps === 1, previously: previously || null };
    }

    /**
     * What a DX number (Part 1, Part 2) means: the registry's films with it,
     * then those it lists for its Part 1 without a Part 2 (`wildcard`); the
     * database rows that record it; and `related`, rows whose cassette number
     * gives it but that record another DX number, or none.
     */
    function byDx(part1, part2) {
      const extract = codec.dxExtract(part1, part2);
      return {
        part1,
        part2,
        dxNumber: codec.formatDxNumber(part1, part2),
        extract,
        part1Info: part1Info(part1),
        products: [
          ...underKey(index.dx, extract, dxKey, product),
          ...underKey(index.any, part1, part1Key, product),
        ],
        community: underKey(index.recorded, extract, extractKey, row),
        related: underKey(index.related, extract, cassetteKey, row),
      };
    }

    function isKnown(part1, part2) {
      const hit = byDx(part1, part2);
      return hit.products.length > 0 || hit.community.length > 0;
    }

    /**
     * What a six-digit cassette number matches (see codec.parseCassette): the
     * registry's augmented record of it, and of others with the same middle
     * four digits (`augmentedRelated`), and what its DX number means; the
     * database rows with exactly this number (`exact`), with the same first
     * five digits, so that only the roll length differs (`sameFirstFive`), and
     * with the same middle four, the DX number's (`sameMiddle`); and those
     * that record these four digits as their DX number with no cassette
     * number, or one with other digits (`recordedOnly`).
     */
    function byCassette(digits) {
      const parsed = codec.parseCassette(digits);
      if (!parsed) return null;
      const hit = { parsed, augmented: [], augmentedRelated: [], dx: parsed.part1 === null ? null : byDx(parsed.part1, parsed.part2), exact: [], sameFirstFive: [], sameMiddle: [], recordedOnly: [] };
      for (const e of underKey(index.cassette, parsed.extract, cassetteKey, cassetteRow)) {
        if (e.source === 'i3a') (e.code === parsed.digits ? hit.augmented : hit.augmentedRelated).push(e);
        else if (e.full === parsed.digits) hit.exact.push(e);
        else if (e.full.slice(0, 5) === parsed.digits.slice(0, 5)) hit.sameFirstFive.push(e);
        else hit.sameMiddle.push(e);
      }
      hit.recordedOnly = underKey(index.recordedOnly, parsed.extract, extractKey, row);
      return hit;
    }

    // The name index, made from the rows when first needed rather than
    // stored, which would weigh more than half the database itself: one per
    // entry, with the words of each field and those words written together,
    // so that matches never run from one field into the next ("PhotoPoint /
    // Max" is no "tmax").
    let names = null;
    function nameIndex() {
      if (names) return names;
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
      names = [
        ...[...products, ...augmented].map((p) => haystack(p, [p.name, p.sensitizer && p.sensitizer.label, p.sensitizer && p.sensitizer.aka])),
        ...community.map((c) => haystack(c, [c.name, c.tags, c.original, c.manufacturer, c.distributor])),
      ];
      return names;
    }

    /**
     * Search by film name, maker or number, as [{ entry, related }]. A DX
     * number written as one ("79-15", "DX 1279") lists that code's entries, as
     * byDx finds them, and a cassette number ("315223") as byCassette does:
     * the exact matches, then those only related by digits, whose `related`
     * gives the four digits looked up ("1279"; otherwise false). Text that can
     * only be a number ("100-2", "DX 1279", "315223") also finds the names that
     * carry its pieces as typed, after those. A number that may also be words,
     * such as "400" (a film speed) or "0 1 2 7 9 4", lists the films it gives
     * after names that have it as a word, as the start of one, or as typed, and
     * before names that only contain each of its pieces, and matches in other
     * fields.
     *
     * Each result's score is scoreOf, with how well it matches (MATCH,
     * below); a film found in more than one way keeps its best score.
     */
    function search(query, limit) {
      const q = normalize(query).trim();
      if (!q) return [];
      const found = new Map();
      const add = (entry, score, related) => {
        const known = found.get(entry.id);
        if (!known || score > known.score) found.set(entry.id, { entry, score, related: related || false });
      };

      const dx = codec.parseDxNumber(q);
      const bare = q.replace(/^dx[\s\-‐-―−]*/, '');
      const cassette = codec.parseCassette(bare);
      // How it was typed says whether it can only be a number: "79-15",
      // "DX 1279" or six plain digits can; "400" (a film speed) or "400 135"
      // can also be part of a name. So how well each kind of match matches:
      // a number's own films (exact), and those that share some of its
      // digits (only the roll length differs, the same middle four digits, or
      // recorded with them as their DX number); names that carry it as typed;
      // and, for what may be words, names with them as whole words, as word
      // starts, or all as typed, ahead of the number's films, and names that
      // only contain each piece somewhere, or matches in other fields, after
      // them. Text that can only be a number lists names that match it too,
      // after all that the number finds: better more films, ranked, than too
      // few ("DX coded" is no number, and its names rank as usual).
      const only = (dx && dx.kind === 'parts') || (/^dx/.test(q) && Boolean(dx || cassette)) || /^\d{6}$/.test(bare);
      const MATCH = only
        ? { exact: 10, roll: 7, middle: 6, recorded: 5, typed: 4, words: 3.8, starts: 3.6, inName: 3.4, pieces: 3, elsewhere: 2 }
        : { words: 9, starts: 8.5, inName: 8, exact: 7, roll: 6, middle: 5.5, recorded: 5, pieces: 4, elsewhere: 3 };
      const product = (p) => scoreOf(p, MATCH.exact);
      if (cassette && (!dx || dx.kind === 'cassette')) {
        // As the cassette helper finds them: the registry's record of it or
        // the films of its DX number, the rows with exactly this number, then
        // those that share only some of its digits.
        const hit = byCassette(cassette.digits);
        hit.augmented.forEach((e) => add(e, scoreOf(e, MATCH.exact)));
        if (hit.dx) hit.dx.products.forEach((p) => add(p, product(p)));
        hit.exact.forEach((e) => add(e, scoreOf(e, MATCH.exact)));
        const near = cassette.extractText;
        [...hit.augmentedRelated, ...hit.sameFirstFive].forEach((e) => add(e, scoreOf(e, MATCH.roll), near));
        hit.sameMiddle.forEach((e) => add(e, scoreOf(e, MATCH.middle), near));
        hit.recordedOnly.forEach((e) => add(e, scoreOf(e, MATCH.recorded), near));
      } else if (dx) {
        const hit = byDx(dx.part1, dx.part2);
        hit.products.forEach((p) => add(p, product(p)));
        hit.community.forEach((e) => add(e, scoreOf(e, MATCH.exact)));
        hit.related.forEach((e) => add(e, scoreOf(e, MATCH.recorded), String(hit.extract).padStart(4, '0')));
        if (dx.kind === 'parts') {
          // Names that carry it as typed ("AGFACOLOR OPTIMA 100-2", "VR100-4");
          // "20-0" is still no "200", nor part of "120-0". Other fields that
          // carry it are found below, ranked after names.
          const typed = new RegExp(`(^|[^0-9])${escapeRegExp(q)}($|[^0-9])`);
          for (const h of nameIndex()) if (typed.test(h.name)) add(h.entry, scoreOf(h.entry, MATCH.typed));
        }
      }

      // A token matches the text as typed, part of one word, or the start of
      // neighboring words written together ("tmax" or "tmax400" for "T-MAX 400").
      // Text that can only be a number matches as typed, its digits not run
      // into others: "20-0" is no "200", nor part of "120-0".
      const tokens = q.split(/\s+/).filter(Boolean).map((t) => ({ t, c: compact(t) || t, bounded: new RegExp(`(^|[^0-9])${escapeRegExp(t)}($|[^0-9])`) }));
      const matches = only
        ? (h, { bounded }) => bounded.test(h.text)
        : (h, { t, c }) => h.text.includes(t) || h.words.some((w) => w.includes(c)) || h.runs.some((r) => r.startsWith(c));
      for (const h of nameIndex()) {
        if (!tokens.every((k) => matches(h, k))) continue;
        let match = MATCH.elsewhere;
        if (tokens.every(({ c }) => h.nameJoins.includes(c))) match = MATCH.words;
        else if (tokens.every(({ c }) => h.nameRuns.some((r) => r.startsWith(c)))) match = MATCH.starts;
        else if (h.name.includes(q)) match = MATCH.inName;
        else if (tokens.every(({ t }) => h.name.includes(t))) match = MATCH.pieces;
        add(h.entry, scoreOf(h.entry, match));
      }
      return finish();

      function finish() {
        const out = ranked([...found.values()], (r) => r.score, (r) => r.entry).map((r) => ({ entry: r.entry, related: r.related }));
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
      sources: { i3a: data.source, community: communityData.source },
      sensitizers,
      products,
      community,
      augmented,
      /**
       * The row with this record ID (entriesOf), or null: the ID names its
       * source's table and its number there, written as the row's own ID is
       * ("bfd-0930" is none).
       */
      byId(id) {
        const m = /^(i3a-a|i3a-|bfd-)(\d+)$/.exec(id);
        const at = m && { 'i3a-': productAt, 'i3a-a': augmentedAt, 'bfd-': rowAt }[m[1]];
        const e = at && at[Number(m[2])];
        return e && e.id === id ? e : null;
      },
      part1Info,
      byDx,
      isKnown,
      byCassette,
      search,
      stats,
    };
  }

  // For scripts/lib/dx-index.mjs, which builds the stored indexes ranked by
  // these scores, and for the page's other lists of films.
  createLookup.entriesOf = entriesOf;
  createLookup.middleOf = middleOf;
  createLookup.ranked = ranked;
  createLookup.scoreOf = scoreOf;
  createLookup.WEIGHT = WEIGHT;
  createLookup.UNRATED = UNRATED;
  createLookup.cassetteKey = cassetteKey;
  createLookup.BUILD = BUILD;
  return createLookup;
});
