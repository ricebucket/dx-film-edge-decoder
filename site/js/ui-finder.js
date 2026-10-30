/*
 * "Find a film's code" (search + direct entry) and "Have the cassette?".
 * Both end in onShow({ part1, part2, frame, half }, { kind, name }), which
 * puts the code on the strip and says where it came from.
 */
(function (root) {
  'use strict';
  const { h, s: svg, icon } = root.DX.dom;
  const codec = root.DX.codec;
  const ui = root.DX.ui;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  const PAGE = 25;

  function dxOf(entry) {
    return entry.part1 === null ? null : codec.formatDxNumber(entry.part1, entry.part2);
  }

  /** Search results without community rows that differ only by cassette number: in this list they look the same. */
  function distinct(entries) {
    const seen = new Set();
    return entries.filter((e) => {
      if (e.source !== 'community') return true;
      // Rows without a DX number are listed by cassette number, so that tells them apart.
      const key = `${e.extract}:${e.part1 === null ? e.full : ''}:${ui.communityKey(e)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** The frame typed in `field` (1 when empty), or null after saying in `message` why it can't be read. */
  function readFrame(field, message) {
    if (field.value.trim() === '') return { frame: 1, half: false };
    const frame = codec.parseFrameLabel(field.value);
    if (!frame) {
      message.textContent = t('Write the frame as printed, e.g. 23, 23A, X, 00.');
      message.classList.add('is-error');
      field.focus();
    }
    return frame;
  }

  function createFinder(host, { lookup, onShow }) {
    const input = h('input', {
      type: 'search', id: 'finder-q', class: 'input input--search', autocomplete: 'off', spellcheck: 'false',
      placeholder: t('e.g. Portra 400, HP5, Fujicolor 200, 79-15'),
      'aria-describedby': 'finder-help',
    });
    const status = h('p', { class: 'finder__status', id: 'finder-help', 'aria-live': 'polite' },
      t('Type at least two letters, or a DX number such as 79-15.'));
    const list = h('ul', { class: 'finder__results' });
    const more = h('button', { type: 'button', class: 'text-button', hidden: true }, t('Show more'));

    const frameInput = h('input', { type: 'text', id: 'finder-frame', class: 'input input--short', value: '1', inputmode: 'text', autocomplete: 'off', 'aria-describedby': 'finder-frame-help' });
    const frameHelp = h('span', { id: 'finder-frame-help', class: 'fineprint' }, t('as printed, e.g. 12 or 12A'));
    let results = [];
    let shown = 0;

    frameInput.addEventListener('input', () => {
      frameHelp.textContent = t('as printed, e.g. 12 or 12A');
      frameHelp.classList.remove('is-error');
    });

    function resultItem(entry) {
      const dx = dxOf(entry);
      const isI3a = entry.source === 'i3a';
      const maker = ui.sensitizerName(entry.sensitizer);
      const detail = isI3a
        ? (entry.inUse ? t('{maker}. In production in 2008.', { maker }) : t('{maker}. Discontinued by 2008.', { maker }))
        : [entry.manufacturer && t('Made by {maker}', { maker: entry.manufacturer }), entry.original].filter(Boolean).join(i18n.punctuation().sentence);
      // Rows without a usable DX number can't be drawn: registry rows whose
      // Part 2 was never identified, and community numbers above 2047 or below
      // 16 (where Part 1 would be 0, which no maker held).
      const showable = dx !== null && !entry.wildcard;
      const why = entry.wildcard
        ? t('The registry does not give the Part 2 number for this film')
        : entry.extract > 2047
          ? t('This cassette number is outside the range a film edge code can hold')
          : t('Part 1 would be 0, which no maker held in 2008');
      const button = h('button', {
        type: 'button', class: 'tool', disabled: showable ? null : true,
        title: showable ? null : why,
        // Starts with the visible text, so speech users can say what they see.
        'aria-label': showable ? t('Show barcode of {name}', { name: entry.name }) : null,
      }, showable ? t('Show barcode') : t('No full code'));
      if (showable) {
        button.addEventListener('click', () => {
          const frame = readFrame(frameInput, frameHelp);
          if (frame) onShow(Object.assign({ part1: entry.part1, part2: entry.part2 }, frame), { kind: 'finder', name: entry.name });
        });
      }
      const label = dx ? `DX ${entry.wildcard ? `${entry.part1}-?` : dx}` : entry.full ? t('cassette {number}', { number: entry.full }) : null;
      return h('li', { class: 'finder__item' },
        h('div', { class: 'finder__text' },
          h('p', { class: 'finder__name' }, entry.name),
          h('p', { class: 'finder__meta' },
            label ? h('span', { class: 'finder__dx' }, label) : null,
            h('span', { class: `source-tag source-tag--${isI3a ? 'i3a' : 'community'}` }, isI3a ? t('I3A 2008') : t('Community')),
            detail ? h('span', { class: 'finder__detail' }, detail) : null)),
        button);
    }

    function showPage() {
      const next = results.slice(shown, shown + PAGE);
      list.append(...next.map(resultItem));
      shown += next.length;
      more.hidden = shown >= results.length;
      more.textContent = t('Show {n} more', { n: Math.min(PAGE, results.length - shown) });
    }

    let timer = null;
    function run() {
      const q = input.value.trim();
      list.replaceChildren();
      shown = 0;
      const tooShort = q.length < 2 && !/\d/.test(q);
      results = q && !tooShort ? distinct(lookup.search(q)) : [];
      const dx = results.length ? null : codec.parseDxNumber(q);
      if (!q || tooShort) status.textContent = t('Type at least two letters, or a DX number such as 79-15.');
      else if (results.length) status.textContent = i18n.plural(results.length, '{n} film found.', '{n} films found.');
      else if (dx) status.textContent = t('No film in the lists has DX {dx}.', { dx: codec.formatDxNumber(dx.part1, dx.part2) });
      else status.textContent = t('Nothing matches “{q}”. Try fewer words, or part of the name.', { q });
      showPage();
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
    more.addEventListener('click', showPage);

    // Direct entry: DX number + frame.
    const dxInput = h('input', { type: 'text', id: 'direct-dx', class: 'input input--short', placeholder: '79-15', autocomplete: 'off', 'aria-describedby': 'direct-help' });
    const directFrame = h('input', { type: 'text', id: 'direct-frame', class: 'input input--short', placeholder: '23A', value: '1', autocomplete: 'off', 'aria-describedby': 'direct-help' });
    const directMsg = h('p', { class: 'form-message', id: 'direct-help', 'aria-live': 'polite' },
      t('DX number as 79-15, or the 4-digit form 1279. Frame as printed: 23, 23A, X, 00 …'));
    const directForm = h('form', { class: 'direct', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'direct-dx' }, t('DX number')), dxInput),
      h('div', { class: 'field' }, h('label', { for: 'direct-frame' }, t('Frame')), directFrame),
      h('button', { type: 'submit', class: 'tool tool--primary' }, t('Show barcode')),
      directMsg);
    directForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const dx = codec.parseDxNumber(dxInput.value);
      if (!dx) {
        directMsg.textContent = t('That is not a DX number. Part 1 runs from 0 to 127 and Part 2 from 0 to 15, e.g. 79-15.');
        directMsg.classList.add('is-error');
        dxInput.focus();
        return;
      }
      const frame = readFrame(directFrame, directMsg);
      if (!frame) return;
      directMsg.classList.remove('is-error');
      directMsg.textContent = t('Showing DX {dx}, frame {frame}.', { dx: `${dx.part1}-${dx.part2}`, frame: codec.frameLabel(frame.frame, frame.half) });
      onShow({ part1: dx.part1, part2: dx.part2, frame: frame.frame, half: frame.half }, { kind: 'finder', name: `DX ${dx.part1}-${dx.part2}` });
    });

    host.replaceChildren(
      h('div', { class: 'finder__search' },
        h('label', { for: 'finder-q', class: 'field-label' }, icon('search'), t('Film name, maker or DX number')),
        input,
        h('div', { class: 'finder__frame' },
          h('label', { for: 'finder-frame' }, t('Show with frame')), frameInput, frameHelp),
        status, list, more),
      h('div', { class: 'finder__direct' },
        h('h3', null, t('Know the number already?')),
        directForm));

    return { search(q) { input.value = q; run(); } };
  }

  /**
   * A 35 mm cassette, seen from its film slot's side and drawn to scale in
   * millimeters, with values inside the limits of GB/T 9185-2003 Tables 7
   * and 8: the six digits printed between the barcode and the film slot,
   * centered on the barcode (§9.1), under 2.381 mm tall (B.6). The barcode is
   * the real one for these digits.
   */
  function cassetteFigure(digits) {
    const cy = 12.85; // the spool's axis
    const knob = 4.35; // the spool's long end beyond the cap, Z1 − Z2
    const right = knob + 43.1; // Z2 42.39–43.80; datum C, the short end's face
    const rim = 2; // the end caps, Z3 ≤ 3.30
    const cap = 25.1; // Z24 24.89–25.30
    const wall = 23.4; // Z32 ≥ 23.40
    const top = cy - wall / 2;
    const bottom = cy + wall / 2;
    const narrow = 0.33; // Table 8, target width; wide is three times that
    const codeRight = right - 11.3; // W3 9.40–13.21
    const codeLeft = codeRight - 63 * narrow;
    const quiet = 3.3; // W8 ≥ 3.3
    const lip = 1.6;
    const digitsBase = bottom - lip - 0.8;
    const digitsTop = digitsBase - 2.2;
    const film = { left: (knob + right) / 2 - 17.5, width: 35, length: 8 };
    // Perforations 2.80 mm across and 1.98 mm along the film, 4.75 mm apart, 2.0 mm in from its edges (Table 2).
    const perf = (x, y) => svg('rect', { class: 'cassette-figure__perf', x, y, width: 2.8, height: 1.98, rx: 0.49 });

    const bars = [];
    let x = codeLeft;
    codec.cassetteBars(digits).forEach((units, i) => {
      if (i % 2 === 0) bars.push(svg('rect', { class: 'cassette-figure__bar', x: x.toFixed(3), y: top, width: (units * narrow).toFixed(3), height: (digitsTop - 0.8 - top).toFixed(3) }));
      x += units * narrow;
    });
    const middle = (codeLeft + codeRight) / 2;
    return svg('svg', { class: 'cassette-figure', viewBox: '-0.3 0 48.05 32.85', 'aria-hidden': 'true', focusable: 'false' },
      svg('defs', null, svg('linearGradient', { id: 'cassette-shade', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: 0, class: 'cassette-figure__light' }),
        svg('stop', { offset: 0.45, class: 'cassette-figure__mid' }),
        svg('stop', { offset: 1, class: 'cassette-figure__dark' }))),
      svg('rect', { class: 'cassette-figure__film', x: film.left, y: bottom - 0.4, width: film.width, height: film.length + 0.4 }),
      [0, 1].map((n) => [perf(film.left + 2, bottom + 1.2 + 4.75 * n), perf(film.left + film.width - 4.8, bottom + 1.2 + 4.75 * n)]),
      svg('rect', { class: 'cassette-figure__knob', x: 0, y: cy - 5.7, width: knob + 0.5, height: 11.4, rx: 0.8 }),
      svg('rect', { class: 'cassette-figure__body', x: knob + rim, y: top, width: right - knob - 2 * rim, height: wall }),
      svg('rect', { class: 'cassette-figure__label', x: codeLeft - quiet - 0.6, y: top, width: codeRight - codeLeft + 2 * quiet + 1.2, height: wall - lip }),
      bars,
      svg('rect', { class: 'cassette-figure__mark', x: middle - 6.4, y: digitsTop - 0.45, width: 12.8, height: 3.1, rx: 0.5 }),
      svg('text', { class: 'cassette-figure__digits', x: middle, y: digitsBase, 'text-anchor': 'middle' }, digits),
      svg('rect', { class: 'cassette-figure__lip', x: knob + rim, y: bottom - lip, width: right - knob - 2 * rim, height: lip }),
      svg('rect', { class: 'cassette-figure__cap', x: knob, y: cy - cap / 2, width: rim, height: cap, rx: 0.9 }),
      svg('rect', { class: 'cassette-figure__cap', x: right - rim, y: cy - cap / 2, width: rim, height: cap, rx: 0.9 }));
  }

  function createCassette(host, { lookup, onShow }) {
    const input = h('input', {
      type: 'text', id: 'cassette-code', class: 'input input--code', inputmode: 'numeric', autocomplete: 'off',
      placeholder: '017563', maxlength: '20', 'aria-describedby': 'cassette-help',
    });
    const HELP = t('Printed between the barcode and the film slot.');
    const msg = h('p', { class: 'form-message', id: 'cassette-help', 'aria-live': 'polite' }, HELP);
    const out = h('div', { class: 'cassette__result' });
    const form = h('form', { class: 'cassette__form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'cassette-code' }, t('Cassette number')), input),
      h('button', { type: 'submit', class: 'tool tool--primary' }, t('Look up')),
      msg);

    /** The exposures a cassette's last digit stands for, e.g. "24 exposures" or "18–23 exposures". */
    function exposuresText(e) {
      if (e.to === null) return t('{n} or more exposures', { n: e.from });
      return e.from === e.to ? t('{n} exposures', { n: e.from }) : t('{from}–{to} exposures', { from: e.from, to: e.to });
    }

    /** What the 1994 standard used the last digit for, where that differs; null where it doesn't. */
    function exposuresNote(p) {
      const before = p.exposures.before2000;
      if (before === undefined) return null;
      if (before === null) return t('The 1994 standard did not use it.');
      if (before === 'other') return t('The 1994 standard used it for other lengths, such as 24 + 3.');
      return t('The 1994 standard used it for {n} exposures.', { n: before });
    }

    function render(hit) {
      const p = hit.parsed;
      const a = p.augmented;
      const dxNote = a
        ? t('{extract} = 16 × {cassette} + {part2}: an augmented number, which only cassettes carry.', { extract: p.extractText, cassette: a.part1, part2: a.part2 })
        : p.dxNumber === null
          ? t('{extract} is above 8191, so it is not a DX number.', { extract: p.extractText })
          : `${p.extractText} = 16 × ${p.part1} + ${p.part2}`;
      const facts = h('dl', { class: 'readouts readouts--inline' },
        h('div', { class: 'readout' }, h('dt', null, t('First digit')), h('dd', { class: 'readout__value readout__value--small' }, String(p.prefix)),
          h('dd', { class: 'readout__note' }, t('For the maker’s own use; 0 if unused.'))),
        h('div', { class: 'readout' }, h('dt', null, t('DX number')), h('dd', { class: 'readout__value readout__value--small' }, p.dxNumber || '—'),
          h('dd', { class: 'readout__note' }, dxNote)),
        h('div', { class: 'readout' }, h('dt', null, t('Last digit {digit}', { digit: p.exposureDigit })), h('dd', { class: 'readout__value readout__value--small' }, exposuresText(p.exposures)),
          exposuresNote(p) && h('dd', { class: 'readout__note' }, exposuresNote(p))));

      // An augmented number names a film only where the I3A list records it;
      // Annex A.4 says which maker it belongs to, but not which DX number the
      // film carries.
      const registry = a
        ? hit.augmented.map((entry) => h('li', { class: 'match' }, h('span', { class: 'match__name' }, entry.name),
          h('span', { class: 'match__facts' }, t('Listed by Kodak as an “augmented” cassette number (ISO 1007, Annex A.4), outside the normal DX range.'))))
        : (hit.dx ? hit.dx.products.map(ui.productItem) : []);
      const blocks = [];
      if (registry.length) {
        blocks.push(h('div', { class: 'source-block' },
          h('h3', { class: 'source-block__title' }, t('I3A registry, 2008')),
          h('ul', { class: 'matches' }, registry)));
      }
      if (a) {
        const s = lookup.part1Info(a.basePart1).sensitizer;
        const parts = { cassette: a.part1, part1: a.basePart1, added: a.added };
        blocks.push(h('p', { class: 'result__lead' }, s
          ? t('Part 1 {cassette} is {part1} + {added}. Part 1 = {part1} is assigned to {maker} in the 2008 registry; under the standard, a maker adds 128, 256 or 384 only to its own Part 1 number. The standard does not say which DX number the film carries.', { ...parts, maker: ui.sensitizerName(s) })
          : t('Part 1 {cassette} is {part1} + {added}; Part 1 = {part1} was not assigned in the 2008 registry. The standard does not say which DX number the film carries.', parts)));
      }
      if (hit.dx) {
        const s = hit.dx.part1Info.sensitizer;
        blocks.push(h('p', { class: 'result__lead' }, s
          ? t('Part 1 = {part1} is assigned to {maker}.', { part1: p.part1, maker: ui.sensitizerName(s) })
          : t('Part 1 = {part1} was not assigned in the 2008 registry.', { part1: p.part1 })));
      }
      const exact = ui.groupCommunity(hit.sameCode);
      if (exact.length) {
        blocks.push(h('div', { class: 'source-block' },
          h('h3', { class: 'source-block__title' }, 'The Big Film Database'),
          h('ul', { class: 'matches' }, exact.map(ui.communityItem))));
      }
      const similar = ui.groupCommunity(hit.sameExtract);
      if (similar.length) {
        blocks.push(h('details', { class: 'source-block source-block--more' },
          // Without a DX number (augmented, or above 8191), they share only the digits.
          h('summary', null, p.part1 === null
            ? i18n.plural(similar.length, '{n} other film has the same middle four digits', '{n} other films have the same middle four digits')
            : i18n.plural(similar.length, '{n} other film uses the same DX number', '{n} other films use the same DX number')),
          h('ul', { class: 'matches' }, similar.map(ui.communityItem))));
      }
      // Part 1 = 0 is valid, but no maker held it in 2008: as in the search
      // above, such a number has no edge code to show or look up.
      const edgeCode = p.part1 !== null && p.part1 > 0;
      const link = (exact.length || similar.length) && edgeCode ? ui.bfdLink(p.part1, p.part2) : null;
      if (link) blocks.push(link, h('p', { class: 'fineprint' }, t('The site has pictures of the films') + i18n.punctuation().period));
      if (!registry.length && !exact.length && !similar.length) {
        blocks.push(h('p', { class: 'fineprint' }, t('Not found in either the 2008 I3A registry or The Big Film Database.')));
      }
      const actions = [];
      if (edgeCode) {
        const show = h('button', { type: 'button', class: 'tool tool--primary' }, t('Show the edge barcode'));
        show.addEventListener('click', () => onShow({ part1: p.part1, part2: p.part2, frame: 1, half: false }, { kind: 'cassette', name: p.digits }));
        actions.push(h('div', { class: 'result__actions' }, show));
      }
      out.replaceChildren(facts, ...blocks, ...actions);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const hit = lookup.byCassette(input.value);
      if (!hit) {
        msg.textContent = t('Enter exactly six digits, for example 017563.');
        msg.classList.add('is-error');
        out.replaceChildren();
        input.focus();
        return;
      }
      msg.classList.remove('is-error');
      msg.textContent = HELP;
      render(hit);
    });

    // Where the digits are, on the example number of the placeholder.
    host.replaceChildren(h('div', { class: 'cassette__top' }, form, h('div', { class: 'cassette__figure' }, cassetteFigure('017563'))), out);
    return { lookup(code) { input.value = code; form.requestSubmit(); } };
  }

  ui.createFinder = createFinder;
  ui.createCassette = createCassette;
})(globalThis);
