/*
 * The I3A 2008 reference: Part 1 assignments by manufacturer and the full
 * product list, filtered by manufacturer, Part 1 number and status.
 */
(function (root) {
  'use strict';
  const { h } = root.DX.dom;
  const codec = root.DX.codec;
  const ui = root.DX.ui;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  function createReference(host, { lookup, onShow }) {
    const bySensitizer = new Map();
    const assigned = [];
    const unassigned = [];
    const history = [];
    for (let n = 0; n < 128; n++) {
      const info = lookup.part1Info(n);
      if (info.previously) history.push(info);
      if (info.assigned) {
        assigned.push(info);
        const list = bySensitizer.get(info.sensitizer) || [];
        list.push(info);
        bySensitizer.set(info.sensitizer, list);
      } else {
        unassigned.push(info);
      }
    }

    // autocomplete off: a browser that puts back the old choices when Back
    // loads the page again would not draw the list for them.
    const maker = h('select', { id: 'ref-maker', class: 'input', autocomplete: 'off' },
      h('option', { value: '' }, t('All manufacturers')),
      lookup.sensitizers.map((s, i) => h('option', { value: String(i) }, s.label)));
    const part1 = h('select', { id: 'ref-part1', class: 'input', autocomplete: 'off' });
    const status = h('select', { id: 'ref-status', class: 'input', autocomplete: 'off' },
      h('option', { value: '' }, t('Any status')),
      h('option', { value: 'live' }, t('In production in 2008')),
      h('option', { value: 'gone' }, t('Discontinued by 2008')));
    /** The manufacturer chosen, or null for all. */
    const chosenMaker = () => (maker.value === '' ? null : lookup.sensitizers[Number(maker.value)]);
    /**
     * The Part 1 numbers to choose from: the chosen manufacturer's, or every
     * assigned one, as each belongs to one manufacturer. The number chosen
     * stays while it is among them; another manufacturer's goes.
     */
    function listPart1() {
      const m = chosenMaker();
      const numbers = assigned.filter((info) => !m || info.sensitizer === m).map((info) => String(info.part1));
      const kept = numbers.includes(part1.value) ? part1.value : '';
      part1.replaceChildren(h('option', { value: '' }, t('All')), ...numbers.map((n) => h('option', { value: n }, n)));
      part1.value = kept;
    }
    /** A Part 1 number chosen in the table: of another manufacturer than the one chosen, it sets that choice back to all. */
    function choosePart1(info) {
      if (chosenMaker() && chosenMaker() !== info.sensitizer) maker.value = '';
      listPart1();
      part1.value = String(info.part1);
      render();
    }
    // The count of the list as filtered; the whole list's is said once, above the filters.
    const count = h('p', { class: 'fineprint ref-count', 'aria-live': 'polite', tabindex: '-1' });
    /** Keyboard focus to the count of the list as filtered, from a control that scrolls there. */
    const focusCount = () => count.focus({ preventScroll: true });
    const tbody = h('tbody');

    const numberChip = (info) =>
      h('button', {
        type: 'button', class: `num-chip${info.aps ? ' num-chip--aps' : ''}`, 'data-part1': info.part1,
        title: info.aps ? t('Assigned for APS film') : null,
        'aria-label': info.aps
          ? t('Part 1 number {n}, APS film: show its products', { n: info.part1 })
          : t('Part 1 number {n}: show its products', { n: info.part1 }),
        onClick: () => {
          choosePart1(info);
          const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById('ref-table').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
          focusCount();
        },
      }, String(info.part1));

    const assignments = h('table', { class: 'assign-table' },
      h('caption', null, t('Part 1 numbers by manufacturer. APS numbers are marked with a dot.')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('Manufacturer')), h('th', { scope: 'col' }, t('Part 1 numbers')))),
      h('tbody', null,
        [...bySensitizer.entries()]
          .sort((a, b) => a[0].label.localeCompare(b[0].label, 'en'))
          .map(([s, infos]) => h('tr', null,
            h('th', { scope: 'row' }, s.name, s.aka ? h('span', { class: 'fineprint' }, ` (${s.aka})`) : null),
            h('td', null, h('div', { class: 'num-chips' }, infos.map(numberChip))))),
        h('tr', null,
          h('th', { scope: 'row' }, t('Not assigned in 2008')),
          h('td', null, h('p', { class: 'num-list' }, unassigned.map((u) => u.part1).join(root.DX.i18n.punctuation().list)))),
        h('tr', null,
          h('th', { scope: 'row' }, t('Earlier assignments')),
          h('td', null, h('ul', { class: 'history' }, history.map((u) => h('li', null, `${u.part1}: `, ui.source(u.previously))))))));

    /** The DX number as listed: Shanghai's four brands have no Part 2. */
    const label = (p) => (p.wildcard ? `${p.part1}-?` : codec.formatDxNumber(p.part1, p.part2));

    function rowFor(p) {
      const dx = label(p);
      // Named for screen readers with its film, also where it has no code to show.
      const show = h('button', { type: 'button', class: 'tool tool--small', disabled: p.wildcard ? true : null,
        'aria-label': t('Show the barcode of {name}', { name: p.name }) }, t('Show'));
      if (!p.wildcard) show.addEventListener('click', () => onShow({ part1: p.part1, part2: p.part2, frame: 1, half: false }, { kind: 'list', name: p.name, ids: [p.id], button: show }));
      return h('tr', null,
        h('td', { class: 'num' }, dx),
        h('td', null, p.name, p.wildcard ? h('span', { class: 'fineprint products-table__why' }, t('Part 2 not identified in the registry')) : null),
        h('td', null, p.sensitizer.label),
        h('td', null, p.status ? h('span', { class: `pill pill--${p.status === 'in-use' ? 'live' : 'gone'}` }, p.status === 'in-use' ? t('in production') : t('discontinued')) : null),
        h('td', null, show));
    }

    function render() {
      const m = chosenMaker();
      const number = part1.value === '' ? null : Number(part1.value);
      const st = status.value;
      const rows = lookup.products
        .filter((p) => number === null || p.part1 === number)
        .filter((p) => !m || p.sensitizer === m)
        .filter((p) => !st || p.status === (st === 'live' ? 'in-use' : 'discontinued'));
      // In code order, ranked as every list of films is (the lookup's
      // `ranked`): those listed without a Part 2 first under their Part 1,
      // then by name.
      const codeOrder = (p) => -(p.part1 * 17 + (p.part2 === null ? 0 : p.part2 + 1));
      tbody.replaceChildren(...root.DX.createLookup.ranked(rows, codeOrder).map(rowFor));
      // Nothing chosen: the whole list, whose count stands above the filters.
      // Otherwise how many they leave; the menus themselves say what was chosen.
      if (number === null && !m && !st) count.textContent = '';
      else {
        count.textContent = rows.length
          ? i18n.plural(rows.length, '{n} registered product.', '{n} registered products.')
          : t('No registered products match these filters.');
      }
    }

    maker.addEventListener('input', () => {
      listPart1();
      render();
    });
    for (const el of [part1, status]) el.addEventListener('input', render);

    host.replaceChildren(
      h('div', { class: 'table-scroll' }, assignments),
      h('div', { class: 'ref-head', id: 'ref-table' },
        h('p', { class: 'fineprint' }, t('{total} registered products in all.', { total: lookup.products.length })),
        h('div', { class: 'ref-filters' },
          h('div', { class: 'field' }, h('label', { for: 'ref-maker' }, t('Manufacturer')), maker),
          h('div', { class: 'field' }, h('label', { for: 'ref-part1' }, t('Part 1')), part1),
          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status))),
      count,
      h('div', { class: 'table-scroll table-scroll--tall' },
        h('table', { class: 'products-table' },
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'DX'), h('th', { scope: 'col' }, t('Product')), h('th', { scope: 'col' }, t('Manufacturer')),
            h('th', { scope: 'col' }, t('Status')), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, t('Barcode'))))),
          tbody)));
    listPart1();
    render();
  }

  ui.createReference = createReference;
})(globalThis);
