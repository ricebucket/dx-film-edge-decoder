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
      // A dash between digits however typed, as the codec reads one (an en or
      // em dash, a minus sign, a Chinese input method's "——"), is the data's
      // hyphen; NFKD has made a full-width one a hyphen already.
      .replace(/(\d)[-\u2010-\u2015\u2212]+(?=\d)/g, '$1-')
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

  // ---- search by name, in three stages -------------------------------------------
  //
  //   analyze   the text typed → the words to look for, and the kind of each
  //   matcher   those words against one row of the name index (indexRow) →
  //             how well it matches (MATCH), or 0
  //   search    every row → the films found, ranked by score (in createLookup)
  //
  // tests/unit/search-words.mjs lists typed texts beside the words `analyze`
  // gives for them, and beside how well they match example rows. Those
  // tables are the contract: a way of typing that is not in them is not
  // supported, and a new rule is a new row there. tests/unit/search.test.mjs
  // tests each stage on its own.

  /** Digits joined by marks, with no marks around them: "20-0", "100-2". */
  const JOINED = /^\d+(?:[^a-z0-9]+\d+)+$/;
  /** A letter of another script: `normalize` leaves a to z of the Latin ones. */
  const OTHER = /[^\P{L}a-z]/u;
  /** The marks around a text: "(20-0)." is 20-0. */
  const AROUND = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

  /**
   * Stage 1: the text typed, as the words to look for.
   *
   *   text    the text normalized (`normalize`), and digits joined by marks
   *           without the marks around them: "(20-0)." is 20-0
   *   words   one for each run without a space. Letters of another script
   *           against Latin letters or digits are two words ("彩韵200" is 彩韵
   *           and 200); such a letter's own marks go with it (`normalize`
   *           writes ジ as シ and a mark). Each word has its `text` and `kind`:
   *             number   digits joined by marks ("20-0"): matched only as
   *                      typed, never run into other digits ("200", "120-0")
   *             typed    a word with letters of another script, or without a
   *                      letter or digit: matched as typed, its letters never
   *                      dropped (which would leave only "200" of "彩韵200")
   *             letters  any other word: matched by its letters and digits
   *                      (`key`: "t-max" is tmax) as a whole word, the start
   *                      of one or part of one, or as typed
   *   number  whether the whole text, without marks around it, reads as a DX
   *           number or a cassette number. Those have lookups of their own
   *           (byDx, byCassette): here they are words like any other.
   */
  function analyze(query) {
    const text = normalize(query).trim().replace(/\S+/g, (t) => {
      const core = t.replace(AROUND, '');
      return JOINED.test(core) ? core : t;
    });
    const words = text.replace(/([a-z0-9])([^\P{L}a-z])/gu, '$1 $2').replace(/([^\P{L}a-z]\p{M}*)([a-z0-9])/gu, '$1 $2')
      .split(/\s+/).filter(Boolean).map((t) => {
        if (JOINED.test(t)) return { text: t, kind: 'number' };
        const key = OTHER.test(t) ? '' : compact(t);
        return key ? { text: t, kind: 'letters', key } : { text: t, kind: 'typed' };
      });
    const bare = String(query || '').trim().replace(AROUND, '');
    return { text, words, number: Boolean(codec.parseDxNumber(bare) || codec.parseCassette(bare)) };
  }

  /**
   * A row of the name index: a film (`entry`) and the fields the search looks
   * in, its name first. It holds the words of each field and those words
   * written together, each field apart, so that a match never runs from one
   * field into the next ("PhotoPoint / Max" is no "tmax").
   */
  function indexRow(entry, fields) {
    const normal = fields.filter(Boolean).map(normalize);
    const words = normal.map(wordsOf);
    const nameWords = wordsOf(normalize(entry.name));
    return {
      entry,
      name: normalize(entry.name),
      text: normal.join(' '),
      words: words.flat(),
      runs: words.flatMap(runsFrom),
      fieldWords: words,
      joins: null, // made when a search first needs them (whole words outside the name)
      nameRuns: runsFrom(nameWords),
      nameJoins: joinsOf(nameWords),
    };
  }

  /**
   * How well a row matches the words, as `match` for its score (scoreOf):
   * names that have every word as a whole word, as the start of one, or the
   * text as typed; then names that only contain each word somewhere; then
   * matches in the row's other fields, where too a whole word comes first,
   * then the start of one, then a match inside one ("pan" in "Company").
   */
  const MATCH = { words: 9, starts: 8.5, inName: 8, pieces: 4, elsewhere: 3, elsewhereStarts: 2.5, elsewhereInside: 2 };

  /**
   * Stage 2: for the words of `analyze`, a function that gives how well a row
   * of the name index matches them (a MATCH level), or 0 for a row that lacks
   * one of them.
   *
   * A word matches a text as typed, as part of one of its words, or as the
   * start of neighboring words written together ("tmax" or "tmax400" for
   * "T-MAX 400"). A number matches as typed, not run into other digits:
   * "20-0" is no "200" (a film speed), nor part of "120-0". In a name it is
   * a whole word where no letter or digit touches it ("OPTIMA 100-2"), and
   * the start of one where none comes before; "XRG200-2" has "200-2" inside,
   * as "X400" has "400".
   */
  function matcher({ text, words }) {
    const asTyped = (t, before, after) => new RegExp(`(^|[^${before}])${escapeRegExp(t)}($|[^${after}])`);
    const joins = (h) => h.joins || (h.joins = h.fieldWords.flatMap(joinsOf));
    const tests = words.map((word) => {
      const t = word.text;
      if (word.kind === 'number') {
        const [typed, whole, start] = [asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, 'a-z0-9', '0-9')];
        return {
          t,
          found: (h) => typed.test(h.text),
          wordOfName: (h) => whole.test(h.name),
          startInName: (h) => start.test(h.name),
          wordElsewhere: (h) => whole.test(h.text),
          startElsewhere: (h) => start.test(h.text),
        };
      }
      // A word matched as typed has marks or letters that the index's words, all a to z and digits, never have.
      const c = word.kind === 'letters' ? word.key : t;
      return {
        t,
        found: (h) => h.text.includes(t) || h.words.some((w) => w.includes(c)) || h.runs.some((r) => r.startsWith(c)),
        wordOfName: (h) => h.nameJoins.includes(c),
        startInName: (h) => h.nameRuns.some((r) => r.startsWith(c)),
        wordElsewhere: (h) => joins(h).includes(c),
        startElsewhere: (h) => h.runs.some((r) => r.startsWith(c)),
      };
    });
    return (h) => {
      if (!tests.every((k) => k.found(h))) return 0;
      if (tests.every((k) => k.wordOfName(h))) return MATCH.words;
      if (tests.every((k) => k.startInName(h))) return MATCH.starts;
      if (h.name.includes(text)) return MATCH.inName;
      if (tests.every((k) => h.name.includes(k.t))) return MATCH.pieces;
      if (tests.every((k) => k.wordElsewhere(h))) return MATCH.elsewhere;
      if (tests.every((k) => k.startElsewhere(h))) return MATCH.elsewhereStarts;
      return MATCH.elsewhereInside;
    };
  }

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
    // DX number: found by search like its other films, by name.
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

    // The name index (indexRow), made from the rows when first needed rather
    // than stored, which would weigh more than half the database itself: one
    // row per entry.
    let names = null;
    function nameIndex() {
      if (names) return names;
      names = [
        // A registry film's maker by its short name and by the full one its row shows ("Eastman Kodak Company").
        ...[...products, ...augmented].map((p) => indexRow(p, [p.name, p.sensitizer && p.sensitizer.label, p.sensitizer && p.sensitizer.name, p.sensitizer && p.sensitizer.aka])),
        // Its words and years: not its numbers, which have lookups of their own, nor its certainty or availability.
        ...community.map((c) => indexRow(c, [c.name, c.tags, c.original, c.manufacturer, c.distributor, c.country, c.from, c.to])),
      ];
      return names;
    }

    /**
     * Stage 3 of the search by film name or maker (see `analyze`): every row
     * of the name index that has every word typed, as [{ entry }], ranked by
     * score (scoreOf, with how well the row matches). The words are matched
     * against names, tags, notes, makers, distributor, country and years.
     * Numbers are words too, never read as a DX or cassette number: those
     * have lookups of their own (byDx, byCassette) that the page offers apart.
     */
    function search(query) {
      const typed = analyze(query);
      if (!typed.words.length) return [];
      const matchOf = matcher(typed);
      const found = [];
      for (const h of nameIndex()) {
        const match = matchOf(h);
        if (match) found.push({ entry: h.entry, score: scoreOf(h.entry, match) });
      }
      return ranked(found, (r) => r.score, (r) => r.entry).map((r) => ({ entry: r.entry }));
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
      byCassette,
      search,
      analyze,
      stats,
    };
  }

  // For scripts/lib/dx-index.mjs, which builds the stored indexes ranked by
  // these scores, and for the page's other lists of films.
  createLookup.entriesOf = entriesOf;
  createLookup.middleOf = middleOf;
  createLookup.ranked = ranked;
  createLookup.scoreOf = scoreOf;
  // The stages of the search, for their tests (tests/unit/search.test.mjs).
  createLookup.analyze = analyze;
  createLookup.indexRow = indexRow;
  createLookup.matcher = matcher;
  createLookup.MATCH = MATCH;
  createLookup.WEIGHT = WEIGHT;
  createLookup.UNRATED = UNRATED;
  createLookup.cassetteKey = cassetteKey;
  createLookup.BUILD = BUILD;
  return createLookup;
});
