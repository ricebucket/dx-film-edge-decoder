/*
 * Result panel: what the bars on the strip mean, in plain language, with the
 * raw fields underneath. Re-rendered from scratch on every change.
 */
(function (root) {
  'use strict';
  const { h, icon, replace } = root.DX.dom;
  const codec = root.DX.codec;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  const COMMUNITY_PREVIEW = 6;

  function rangeText(from, to) {
    return from === to ? String(from) : `${from}–${to}`;
  }

  function years(entry) {
    const from = entry.from || '';
    const to = entry.to || '';
    if (!from && !to) return '';
    if (from && !to) return entry.availability === 'on the market' ? t('{from} to today', { from }) : t('from {from}', { from });
    if (!from) return t('until {to}', { to });
    return t('{from} to {to}', { from, to });
  }

  /** The availability values of dx-lookup.js, as shown. */
  function availabilityLabel(value) {
    return {
      discontinued: t('discontinued'),
      'possibly discontinued': t('possibly discontinued'),
      'on the market': t('on the market'),
    }[value] || value;
  }

  /** Merge community rows that differ only by cassette number (e.g. 24 and 36 exposures). */
  function groupCommunity(entries) {
    const groups = new Map();
    for (const e of entries) {
      const key = [e.name, e.manufacturer, e.original, e.from, e.to].join('|');
      const g = groups.get(key);
      if (g) {
        if (e.full && !g.cassettes.includes(e.full)) g.cassettes.push(e.full);
      } else {
        groups.set(key, Object.assign({}, e, { cassettes: e.full ? [e.full] : [] }));
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function sensitizerName(s) {
    if (!s) return '';
    return s.aka ? `${s.name} (${s.aka})` : s.name;
  }

  // Antoine Mérino's edition of The Big Film Database looks up a DX number on
  // its site. Community matches link there once for their number, not once
  // per film. (The database's box pictures are not ours to copy: research/04.)
  const BFD_SEARCH = 'https://thebigfilmdatabase.merinorus.com/search?dx_number=';

  /** A link to this DX number on The Big Film Database's site; null for Part 1 = 0, which film never uses. */
  function bfdLink(part1, part2) {
    if (!(part1 > 0)) return null;
    const dx = `${part1}-${part2}`;
    return h('p', { class: 'source-block__link' },
      h('a', { href: BFD_SEARCH + dx }, t('Look up DX {dx} on The Big Film Database', { dx })));
  }

  function communityItem(e) {
    const p = i18n.punctuation();
    const facts = [];
    if (e.manufacturer) facts.push(t('Made by {maker}', { maker: e.manufacturer }));
    const y = years(e);
    if (y) facts.push(y);
    if (e.country) facts.push(e.country);
    if (e.distributor) facts.push(t('sold by {distributor}', { distributor: e.distributor }));
    return h('li', { class: 'match match--community' },
      h('span', { class: 'match__name' }, e.name),
      e.availability ? h('span', { class: `pill pill--${e.availability === 'on the market' ? 'live' : 'gone'}` }, availabilityLabel(e.availability)) : null,
      facts.length ? h('span', { class: 'match__facts' }, facts.join(p.comma) + p.period) : null,
      e.original
        ? h('span', { class: 'match__original' }, t('Notes: {notes}', { notes: e.original }),
          e.reliability !== null ? h('span', { class: 'certainty', title: t('How sure the database is about this (0 = guess, 4 = certain)') }, ' ', t('(certainty {n}/4)', { n: e.reliability })) : null)
        : null,
      e.cassettes.length ? h('span', { class: 'match__cassette' }, i18n.plural(e.cassettes.length, 'Cassette number {numbers}', 'Cassette numbers {numbers}', { numbers: e.cassettes.join(p.comma) })) : null);
  }

  function productItem(p) {
    return h('li', { class: 'match match--i3a' },
      h('span', { class: 'match__name' }, p.name),
      h('span', { class: `pill pill--${p.inUse ? 'live' : 'gone'}` }, p.inUse ? t('in production in 2008') : t('discontinued by 2008')),
      p.wildcard ? h('span', { class: 'match__facts' }, t('Listed by I3A for this Part 1 without a Part 2 number.')) : null);
  }

  function communityBlock(entries, title, d) {
    const groups = groupCommunity(entries);
    if (!groups.length) return null;
    const list = h('ul', { class: 'matches' }, groups.slice(0, COMMUNITY_PREVIEW).map(communityItem));
    const block = h('div', { class: 'source-block' },
      h('h4', { class: 'source-block__title' }, title,
        h('span', { class: 'source-tag source-tag--community' }, 'The Big Film Database')),
      list);
    if (groups.length > COMMUNITY_PREVIEW) {
      const more = h('button', { type: 'button', class: 'text-button' }, t('Show all {n}', { n: groups.length }));
      more.addEventListener('click', () => {
        list.replaceChildren(...groups.map(communityItem));
        more.remove();
      });
      block.append(more);
    }
    const link = bfdLink(d.part1, d.part2);
    if (link) block.append(link);
    block.append(h('p', { class: 'fineprint' },
      t('Community-maintained and mostly based on cassette numbers, so it includes rebranded films. Entries are as reliable as their sources.')));
    return block;
  }

  /** Plain-language explanation for each problem the decoder reports. */
  function explainIssue(issue, d) {
    switch (issue.code) {
      case 'part1-zero':
        return {
          title: t('Part 1 is 0, which no film uses'),
          text: t('Part 1 sits in cells 7 to 13, right after the start pattern. Copy those bars first.'),
        };
      case 'blank':
        return {
          title: t('Cell {cell} should never have a bar', { cell: issue.cell }),
          text: t('If your film shows a bar there, the copy is probably shifted by one cell. Line the wide mark of the top row up with the start of the strip and compare again.'),
        };
      case 'parity': {
        const n = d.parity.ones + d.parity.bit;
        return {
          title: t('The parity check fails'),
          text: d.format === 'long'
            ? t('The bars in Part 1, Part 2, the frame number, the A cell and the parity cell should add up to an even number, but there are {n}. One bar is probably misread: look again at faint or scratched bars, or compare with the next code along the film.', { n })
            : t('The bars in Part 1, Part 2 and the parity cell should add up to an even number, but there are {n}. One bar is probably misread: look again at faint or scratched bars, or compare with the next code along the film.', { n }),
        };
      }
      case 'start':
        return { title: t('The start pattern is not the standard one'), text: t('These cells are identical on every DX code.') };
      case 'stop':
        return { title: t('The stop pattern is not the standard one'), text: t('These cells are identical on every DX code.') };
      default:
        return { title: issue.code, text: '' };
    }
  }

  function fieldsTable(d) {
    const format = codec.getFormat(d.format);
    const rows = format.fields.map((f) => {
      const bits = d.bits.slice(f.from - 1, f.to);
      let value = '';
      let ok = true;
      if (f.kind === 'fixed') { ok = bits === f.pattern; value = ok ? t('fixed pattern') : t('should be {pattern}', { pattern: f.pattern }); }
      else if (f.kind === 'blank') { ok = bits === '0'; value = ok ? t('empty, as it should be') : t('should be empty'); }
      else if (f.id === 'part1') { value = String(d.part1); ok = d.part1 !== 0; }
      else if (f.id === 'part2') value = String(d.part2);
      else if (f.id === 'frame') value = d.frame >= 62 ? t('{value} (printed {label})', { value: d.frame, label: codec.frameLabel(d.frame, false) }) : String(d.frame);
      else if (f.id === 'half') value = d.half ? t('A position') : t('whole frame');
      else if (f.kind === 'parity') {
        ok = d.parity.ok;
        value = ok ? t('expected {bit}, matches', { bit: d.parity.expected }) : t('expected {bit}, does not match', { bit: d.parity.expected });
      }
      return h('tr', { class: ok ? null : 'is-error' },
        h('th', { scope: 'row' }, h('span', { class: `swatch swatch--${f.kind === 'blank' ? 'blank' : f.kind === 'fixed' ? 'fixed' : f.id}` }),
          { start: t('Start'), part1: t('Part 1'), blank1: t('Unused'), part2: t('Part 2'), frame: t('Frame'), half: t('A flag'), blank2: t('Unused'), parity: t('Parity'), stop: t('Stop') }[f.id]),
        h('td', null, rangeText(f.from, f.to)),
        h('td', null, h('code', { class: 'bits' }, bits)),
        h('td', null, value));
    });
    return h('table', { class: 'raw-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('Field')), h('th', { scope: 'col' }, t('Cells')), h('th', { scope: 'col' }, t('Bits')), h('th', { scope: 'col' }, t('Value')))),
      h('tbody', null, rows));
  }

  function textForm(d) {
    return d.frame === null ? d.dxNumber : `${d.dxNumber}/${d.frameLabel}`;
  }

  async function copyText(text, button, done) {
    // Remember the label once, so quick repeated clicks don't keep "Copied" for good.
    if (!button.dataset.label) button.dataset.label = button.textContent;
    clearTimeout(button.resetTimer);
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = done;
    } catch (e) {
      button.textContent = t('Copy failed: select and copy by hand');
    }
    button.resetTimer = setTimeout(() => { button.textContent = button.dataset.label; }, 1800);
  }

  function emptyState(ctx) {
    return [
      h('div', { class: 'status status--idle' }, icon('info'), h('span', null, t('Waiting for bars'))),
      h('h2', { id: 'result-title', class: 'result__title', tabindex: '-1' },
        ctx.way === 'photo' ? t('Read a photo of your barcode') : t('Copy the lower row of your barcode')),
      h('p', { class: 'result__lead' }, t('The decoding appears here as you go. Not sure what a barcode looks like? Load an example and compare it with your film.')),
      h('div', { class: 'examples' }, ctx.examples.map((ex) =>
        h('button', { type: 'button', class: 'chip', onClick: () => ctx.onLoadExample(ex) }, ex.label))),
    ];
  }

  /** An older 23-cell code entered in the 31-cell strip: offer to switch. */
  function shortCodeHint(d, ctx) {
    if (d.format !== 'long') return null;
    const head = codec.shortCodeInLong(d.bits);
    if (!head) return null;
    const s = codec.decode(head, 'short');
    // The copy also reads as a valid 31-cell code of the same film (frame 10
    // or 42), so only the clock row can settle it: ask the user to look.
    return h('div', { class: 'problems' }, h('div', { class: 'problem problem--suggest' },
      h('p', { class: 'problem__title' }, t('Does the top row of your film have 7 thin bars?')),
      h('p', null, t('Then this is an older 23-cell code without a frame number. The film is the same, DX {dx}, but the frame shown below would be meaningless. With 11 thin bars, the reading below is right as it is.', { dx: s.dxNumber })),
      h('button', { type: 'button', class: 'tool tool--primary', onClick: () => ctx.onUseShort(head) }, t('Switch to 7 thin bars'))));
  }

  function suggestions(d, ctx) {
    if (!d.issues.some((i) => i.code === 'parity' || i.code === 'blank')) return null;
    const fixes = codec.nearMisses(d.bits, d.format);
    if (!fixes.length) return null;
    const known = [];
    const unknown = [];
    for (const f of fixes) {
      const info = ctx.lookup.byDx(f.result.part1, f.result.part2);
      const name = info.products.length ? info.products[0].name : info.community.length ? groupCommunity(info.community)[0].name : null;
      (name ? known : unknown).push({ f, name });
    }
    const item = ({ f, name }) => {
      const code = f.result.frame === null ? f.result.dxNumber : t('{dx}, frame {frame}', { dx: f.result.dxNumber, frame: f.result.frameLabel });
      return h('li', null, h('button', { type: 'button', class: 'fix', onClick: () => ctx.onApplyCells(f.bits) },
        h('span', { class: 'fix__cell' }, d.bits[f.cell - 1] === '1' ? t('Remove the bar in cell {cell}', { cell: f.cell }) : t('Add the bar in cell {cell}', { cell: f.cell })),
        h('span', { class: 'fix__what' }, name ? t('{code}: {name}', { code, name }) : t('{code} (not in the lists)', { code }))));
    };
    const block = h('div', { class: 'fixes' },
      h('h3', { class: 'fixes__title' }, t('Possible one-bar corrections')),
      known.length ? h('ul', { class: 'fixes__list' }, known.map(item)) : h('p', { class: 'fineprint' }, t('No single-bar correction gives a listed film.')));
    if (unknown.length) {
      const list = h('ul', { class: 'fixes__list' }, unknown.map(item));
      const summary = i18n.plural(unknown.length, 'One other correction gives a valid but unlisted code', '{n} other corrections give valid but unlisted codes');
      block.append(h('details', { class: 'fixes__more' }, h('summary', null, summary), list));
    }
    return block;
  }

  function identity(d, info) {
    const s = info.part1Info.sensitizer;
    const parts = [];
    const products = info.products;
    const groups = groupCommunity(info.community);
    let title;
    if (products.length) title = products.length === 1 ? products[0].name : products.map((p) => p.name).join(' / ');
    else if (groups.length) title = groups[0].name;
    else if (!d.valid) title = t('DX {dx}, not in the lists', { dx: d.dxNumber });
    else if (s) title = t('Unlisted {maker} film', { maker: s.label });
    else title = t('Unregistered DX number');
    // A code that fails its checks is probably misread: say what it reads as, no more.
    if (!d.valid) title = t('As copied: {title}', { title });

    const lines = [];
    const part1 = { part1: d.part1, maker: sensitizerName(s), dx: d.dxNumber };
    if (s) {
      lines.push(h('p', { class: 'result__lead' }, info.part1Info.aps
        ? t('Part 1 = {part1} is assigned to {maker}, for APS film.', part1)
        : t('Part 1 = {part1} is assigned to {maker}.', part1)));
    } else {
      lines.push(h('p', { class: 'result__lead' }, t('Part 1 = {part1} was not assigned to any manufacturer in the 2008 registry.', part1),
        info.part1Info.previously ? [' ', t('History: {history}', { history: info.part1Info.previously })] : ''));
    }
    if (!products.length && groups.length) {
      lines.push(h('p', { class: 'fineprint' }, t('DX {dx} is not in the 2008 registry; the name above comes from the community database.', part1)));
    }
    if (!products.length && !groups.length) {
      lines.push(h('p', { class: 'fineprint' }, t('DX {dx} is in neither the 2008 registry nor the community database. Films introduced after 2008 are often missing.', part1)));
    }

    if (products.length) {
      parts.push(h('div', { class: 'source-block' },
        h('h4', { class: 'source-block__title' }, products.length > 1 ? t('Registered products with this number') : t('Registered product'),
          h('span', { class: 'source-tag source-tag--i3a' }, t('I3A registry, 2008'))),
        h('ul', { class: 'matches' }, products.map(productItem))));
    }
    const cb = communityBlock(info.community, products.length ? t('Also listed for this number') : t('Films listed for this number'), d);
    if (cb) parts.push(cb);
    return { title, lines, parts };
  }

  function readouts(d) {
    const items = [
      h('div', { class: 'readout' },
        h('dt', null, t('DX number')),
        h('dd', { class: 'readout__value' }, d.dxNumber),
        h('dd', { class: 'readout__note' }, t('Part 1 = {part1}, Part 2 = {part2}', { part1: d.part1, part2: d.part2 }))),
    ];
    if (d.frame !== null) {
      const p = i18n.punctuation();
      const notes = [];
      notes.push(d.half ? t('Half-frame (A) position') : t('Whole-frame position'));
      if (d.frameAliases.length) notes.push(t('also printed as {labels}', { labels: i18n.or(d.frameAliases) }));
      if (d.halfFrameIndex !== null) notes.push(t('half-frame count {n}', { n: d.halfFrameIndex }));
      else notes.push(t('before frame 0'));
      items.push(h('div', { class: 'readout' },
        h('dt', null, t('Printed frame label')),
        h('dd', { class: 'readout__value readout__value--edge' }, h('span', { class: 'edge-arrow', 'aria-hidden': 'true' }), d.frameLabel),
        h('dd', { class: 'readout__note' }, notes.join(p.semicolon) + p.period)));
    } else {
      items.push(h('div', { class: 'readout' },
        h('dt', null, t('Frame')),
        h('dd', { class: 'readout__value readout__value--muted' }, t('none')),
        h('dd', { class: 'readout__note' }, t('The 23-cell layout has no frame number.'))));
    }
    items.push(h('div', { class: 'readout' },
      h('dt', null, t('Cassette number')),
      h('dd', { class: 'readout__value readout__value--small' },
        h('span', { class: 'placeholder', 'aria-hidden': 'true' }, '?'),
        String(d.dxExtract).padStart(4, '0'),
        h('span', { class: 'placeholder', 'aria-hidden': 'true' }, '?')),
      h('dd', { class: 'readout__note' }, t('The middle four digits of this film’s cassette barcode. The first digit is chosen by the maker, the last gives the roll length.'))));
    return h('dl', { class: 'readouts' }, items);
  }

  /**
   * ctx: { decoded, lookup, examples, shareUrl, way ('copy' or 'photo'), onLoadExample(ex), onApplyCells(bits), onUseShort(bits) }
   */
  function renderResult(container, ctx) {
    const d = ctx.decoded;
    const empty = codec.layout(d.format).every((c) => !c.editable || d.bits[c.cell - 1] === '0');
    if (empty) {
      container.replaceChildren(...emptyState(ctx));
      return;
    }

    const info = ctx.lookup.byDx(d.part1, d.part2);
    const real = d.issues.filter((i) => i.code !== 'part1-zero');
    const status = d.valid
      ? h('div', { class: 'status status--ok' }, icon('check'), h('span', null, d.format === 'short' ? t('Valid DX code (23-cell layout)') : t('Valid DX code')))
      : real.length
        ? h('div', { class: 'status status--error' }, icon('cross'), h('span', null, i18n.plural(real.length, 'One problem to check', '{n} problems to check')))
        : h('div', { class: 'status status--idle' }, icon('info'), h('span', null, t('Not a film code yet')));

    const problems = d.issues.length
      ? h('div', { class: 'problems' }, d.issues.map((issue) => {
        const { title, text } = explainIssue(issue, d);
        return h('div', { class: 'problem' }, h('p', { class: 'problem__title' }, title), h('p', null, text));
      }), suggestions(d, ctx))
      : null;

    const main = [];
    const side = [];
    if (d.part1 !== 0) {
      const id = identity(d, info);
      main.push(
        h('h2', { id: 'result-title', class: `result__title${d.valid ? '' : ' result__title--tentative'}`, tabindex: '-1' }, id.title),
        d.valid ? null : h('p', { class: 'fineprint' }, t('The code does not pass its checks yet, so this will probably change once the misread bar is fixed.')),
        ...id.lines,
        ...id.parts);
      side.push(readouts(d));
    } else {
      main.push(h('h2', { id: 'result-title', class: 'result__title', tabindex: '-1' }, t('Keep copying')));
    }

    const actions = h('div', { class: 'result__actions' });
    if (d.part1 !== 0) {
      const share = h('button', { type: 'button', class: 'tool' }, t('Copy link'));
      share.addEventListener('click', () => copyText(ctx.shareUrl, share, t('Link copied')));
      actions.append(share);
    }

    // Keep "Raw fields" open across re-renders while the user edits the strip.
    const wasOpen = Boolean(container.querySelector('details.raw[open]'));
    const p = i18n.punctuation();
    const raw = h('details', { class: 'raw', open: wasOpen },
      h('summary', null, t('Raw fields')),
      h('div', { class: 'table-scroll' }, fieldsTable(d)),
      h('p', { class: 'raw__line' }, t('Data track') + p.colon, h('code', { class: 'bits' }, d.bits)),
      h('p', { class: 'raw__line' }, t('Clock track') + p.colon, h('code', { class: 'bits' }, codec.getFormat(d.format).clock)),
      h('p', { class: 'raw__line' }, t('Text form (as used by zxing-cpp and Zint)') + p.colon, h('code', null, textForm(d))));

    replace(container,
      status,
      shortCodeHint(d, ctx),
      problems,
      h('div', { class: 'result__grid' },
        h('div', { class: 'result__main' }, main),
        h('div', { class: 'result__side' }, side, actions)),
      raw);
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.renderResult = renderResult;
  root.DX.ui.groupCommunity = groupCommunity;
  root.DX.ui.sensitizerName = sensitizerName;
  root.DX.ui.communityItem = communityItem;
  root.DX.ui.bfdLink = bfdLink;
  root.DX.ui.productItem = productItem;
})(globalThis);
