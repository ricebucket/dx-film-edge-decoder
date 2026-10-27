/*
 * "Find a film's code" (search + direct entry) and "Have the cassette?".
 * Both end in onShow({ part1, part2, frame, half }, { kind, name }), which
 * puts the code on the strip and says where it came from.
 */
(function (root) {
  'use strict';
  const { h, icon } = root.DX.dom;
  const codec = root.DX.codec;
  const ui = root.DX.ui;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  const PAGE = 25;

  function dxOf(entry) {
    return entry.part1 === null ? null : codec.formatDxNumber(entry.part1, entry.part2);
  }

  /** The frame typed in `field` (1 when empty), or null after saying in `message` why it can't be read. */
  function readFrame(field, message) {
    if (field.value.trim() === '') return { frame: 1, half: false };
    const frame = codec.parseFrameLabel(field.value);
    if (!frame) {
      message.textContent = t('Write the frame as printed on film: a number up to 63, optionally followed by A, or X, 00.');
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
      // 16 (where Part 1 would be 0).
      const showable = dx !== null && !entry.wildcard;
      const why = entry.wildcard
        ? t('The registry does not give the Part 2 number for this film')
        : entry.extract > 2047
          ? t('This cassette number is outside the range a film edge code can hold')
          : t('Part 1 = 0 is never used on film.');
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
      results = q.length >= 2 || /\d/.test(q) ? lookup.search(q) : [];
      if (!q) status.textContent = t('Type at least two letters, or a DX number such as 79-15.');
      else if (!results.length) status.textContent = t('Nothing matches “{q}”. Try fewer words, or part of the name.', { q });
      else status.textContent = i18n.plural(results.length, '{n} film found.', '{n} films found.');
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
        directMsg.textContent = t('That is not a DX number. Part 1 runs from 1 to 127 and Part 2 from 0 to 15, e.g. 79-15.');
        directMsg.classList.add('is-error');
        dxInput.focus();
        return;
      }
      if (dx.part1 === 0) {
        directMsg.textContent = t('Part 1 = 0 is never used on film.');
        directMsg.classList.add('is-error');
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

  function createCassette(host, { lookup, onShow }) {
    const input = h('input', {
      type: 'text', id: 'cassette-code', class: 'input input--code', inputmode: 'numeric', autocomplete: 'off',
      placeholder: '017563', maxlength: '8', 'aria-describedby': 'cassette-help',
    });
    const msg = h('p', { class: 'form-message', id: 'cassette-help', 'aria-live': 'polite' },
      t('Six digits, printed under the barcode next to the film slot.'));
    const out = h('div', { class: 'cassette__result' });
    const form = h('form', { class: 'cassette__form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'cassette-code' }, t('Cassette number')), input),
      h('button', { type: 'submit', class: 'tool tool--primary' }, t('Look up')),
      msg);

    function render(hit) {
      const p = hit.parsed;
      const facts = h('dl', { class: 'readouts readouts--inline' },
        h('div', { class: 'readout' }, h('dt', null, t('First digit')), h('dd', { class: 'readout__value readout__value--small' }, String(p.prefix)),
          h('dd', { class: 'readout__note' }, t('Chosen by the maker.'))),
        h('div', { class: 'readout' }, h('dt', null, t('DX number')), h('dd', { class: 'readout__value readout__value--small' }, p.dxNumber || '—'),
          h('dd', { class: 'readout__note' }, p.dxNumber ? `${p.extractText} = 16 × ${p.part1} + ${p.part2}` : t('{extract} is above 2047, so it is not a standard DX number.', { extract: p.extractText }))),
        h('div', { class: 'readout' }, h('dt', null, t('Roll length')), h('dd', { class: 'readout__value readout__value--small' },
          typeof p.exposures === 'number' ? t('{n} exp.', { n: p.exposures }) : p.exposures === 'non-standard' ? t('other') : '—'),
          h('dd', { class: 'readout__note' }, p.exposures === 'non-standard'
            ? t('Code 7: a non-standard length such as 24 + 3.')
            : p.exposures === null ? t('Last digit {digit} is not a defined length code.', { digit: p.exposureDigit }) : t('Last digit {digit}.', { digit: p.exposureDigit }))));

      const blocks = [];
      if (hit.augmented.length) {
        blocks.push(h('div', { class: 'source-block' },
          h('h4', { class: 'source-block__title' }, t('Registered special cassette number'), h('span', { class: 'source-tag source-tag--i3a' }, t('I3A registry, 2008'))),
          h('ul', { class: 'matches' }, hit.augmented.map((a) => h('li', { class: 'match' }, h('span', { class: 'match__name' }, a.name),
            h('span', { class: 'match__facts' }, t('Listed by Kodak as an “augmented” cassette number (ISO 1007, Annex A.4), outside the normal DX range.')))))));
      }
      if (hit.dx) {
        if (hit.dx.products.length) {
          blocks.push(h('div', { class: 'source-block' },
            h('h4', { class: 'source-block__title' }, t('Registered product'), h('span', { class: 'source-tag source-tag--i3a' }, t('I3A registry, 2008'))),
            h('ul', { class: 'matches' }, hit.dx.products.map(ui.productItem))));
        }
        const s = hit.dx.part1Info.sensitizer;
        blocks.push(h('p', { class: 'result__lead' }, s
          ? t('Part 1 = {part1} is assigned to {maker}.', { part1: p.part1, maker: ui.sensitizerName(s) })
          : t('Part 1 = {part1} was not assigned in the 2008 registry.', { part1: p.part1 })));
      }
      const exact = ui.groupCommunity(hit.sameCode);
      if (exact.length) {
        blocks.push(h('div', { class: 'source-block' },
          h('h4', { class: 'source-block__title' }, t('Cassettes with this number'), h('span', { class: 'source-tag source-tag--community' }, 'The Big Film Database')),
          h('ul', { class: 'matches' }, exact.map(ui.communityItem))));
      }
      const similar = ui.groupCommunity(hit.sameExtract);
      if (similar.length) {
        blocks.push(h('details', { class: 'source-block source-block--more' },
          h('summary', null, i18n.plural(similar.length, '{n} other film uses the same DX number', '{n} other films use the same DX number')),
          h('ul', { class: 'matches' }, similar.map(ui.communityItem))));
      }
      const link = exact.length || similar.length ? ui.bfdLink(p.part1, p.part2) : null;
      if (link) blocks.push(link);
      if (!blocks.length || (!hit.augmented.length && hit.dx && !hit.dx.products.length && !exact.length && !similar.length)) {
        blocks.push(h('p', { class: 'fineprint' }, t('This number is not in the 2008 registry or the community database.')));
      }
      const actions = [];
      if (p.part1 !== null && p.part1 > 0) {
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
      msg.textContent = t('Cassette {digits}.', { digits: hit.parsed.digits });
      render(hit);
    });

    host.replaceChildren(form, out);
    return { lookup(code) { input.value = code; form.requestSubmit(); } };
  }

  ui.createFinder = createFinder;
  ui.createCassette = createCassette;
})(globalThis);
