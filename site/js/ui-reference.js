/*
 * The I3A 2008 reference: Part 1 assignments by manufacturer and the full
 * product list, filterable.
 */
(function (root) {
  'use strict';
  const { h } = root.DX.dom;
  const codec = root.DX.codec;
  const ui = root.DX.ui;
  const t = root.DX.i18n.t;

  function createReference(host, { lookup, onShow }) {
    const bySensitizer = new Map();
    const unassigned = [];
    const history = [];
    for (let n = 0; n < 128; n++) {
      const info = lookup.part1Info(n);
      if (info.previously) history.push(info);
      if (info.assigned) {
        const list = bySensitizer.get(info.sensitizer) || [];
        list.push(info);
        bySensitizer.set(info.sensitizer, list);
      } else {
        unassigned.push(info);
      }
    }

    const text = h('input', { type: 'search', id: 'ref-q', class: 'input', placeholder: t('Filter products'), autocomplete: 'off' });
    const maker = h('select', { id: 'ref-maker', class: 'input' },
      h('option', { value: '' }, t('All manufacturers')),
      lookup.sensitizers.map((s, i) => h('option', { value: String(i) }, s.label)));
    const status = h('select', { id: 'ref-status', class: 'input' },
      h('option', { value: '' }, t('Any status')),
      h('option', { value: 'live' }, t('In production in 2008')),
      h('option', { value: 'gone' }, t('Discontinued by 2008')));
    const part1Filter = { value: null };
    const count = h('p', { class: 'fineprint', 'aria-live': 'polite' });
    const clearPart1 = h('button', { type: 'button', class: 'text-button', hidden: true }, t('Show all Part 1 numbers'));
    const tbody = h('tbody');

    const numberChip = (info) =>
      h('button', {
        type: 'button', class: `num-chip${info.aps ? ' num-chip--aps' : ''}`, 'data-part1': info.part1,
        title: info.aps ? t('Assigned for APS film') : null,
        'aria-label': info.aps
          ? t('Part 1 number {n}, APS film: show its products', { n: info.part1 })
          : t('Part 1 number {n}: show its products', { n: info.part1 }),
        onClick: () => {
          part1Filter.value = info.part1;
          render();
          const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById('ref-table').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        },
      }, String(info.part1));

    const assignments = h('table', { class: 'assign-table' },
      h('caption', null, t('Part 1 numbers by manufacturer. APS numbers are marked with a dot.')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('Manufacturer')), h('th', { scope: 'col' }, t('Part 1 numbers')))),
      h('tbody', null,
        [...bySensitizer.entries()]
          .sort((a, b) => a[0].label.localeCompare(b[0].label))
          .map(([s, infos]) => h('tr', null,
            h('th', { scope: 'row' }, s.name, s.aka ? h('span', { class: 'fineprint' }, ` (${s.aka})`) : null),
            h('td', null, h('div', { class: 'num-chips' }, infos.map(numberChip))))),
        h('tr', { class: 'assign-table__other' },
          h('th', { scope: 'row' }, t('Not assigned in 2008')),
          h('td', null, h('p', { class: 'num-list' }, unassigned.map((u) => u.part1).join(', ')))),
        h('tr', { class: 'assign-table__other' },
          h('th', { scope: 'row' }, t('Earlier assignments')),
          h('td', null, h('ul', { class: 'history' }, history.map((u) => h('li', null, `${u.part1}: ${u.previously}`)))))));

    function rowFor(p) {
      const dx = p.wildcard ? `${p.part1}-?` : codec.formatDxNumber(p.part1, p.part2);
      const show = h('button', { type: 'button', class: 'tool tool--small', disabled: p.wildcard ? true : null,
        'aria-label': p.wildcard ? null : t('Show the barcode of {name}', { name: p.name }),
        title: p.wildcard ? t('Part 2 not identified in the registry') : null }, t('Show'));
      if (!p.wildcard) show.addEventListener('click', () => onShow({ part1: p.part1, part2: p.part2, frame: 1, half: false }, { kind: 'list', name: p.name }));
      return h('tr', null,
        h('td', { class: 'num' }, dx),
        h('td', null, p.name),
        h('td', null, p.sensitizer.label),
        h('td', null, h('span', { class: `pill pill--${p.inUse ? 'live' : 'gone'}` }, p.inUse ? t('in production') : t('discontinued'))),
        h('td', null, show));
    }

    function render() {
      const q = text.value.trim().toLowerCase();
      const m = maker.value === '' ? null : lookup.sensitizers[Number(maker.value)];
      const st = status.value;
      const rows = lookup.products
        .filter((p) => part1Filter.value === null || p.part1 === part1Filter.value)
        .filter((p) => !m || p.sensitizer === m)
        .filter((p) => !st || (st === 'live') === p.inUse)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || codec.formatDxNumber(p.part1, p.part2 || 0).startsWith(q))
        .sort((a, b) => a.part1 - b.part1 || (a.part2 === null ? -1 : a.part2) - (b.part2 === null ? -1 : b.part2) || a.name.localeCompare(b.name));
      tbody.replaceChildren(...rows.map(rowFor));
      clearPart1.hidden = part1Filter.value === null;
      const n = { n: rows.length, total: lookup.products.length, part1: part1Filter.value };
      if (part1Filter.value === null) {
        count.textContent = rows.length
          ? t('{n} of {total} registered products.', n)
          : t('No registered products match these filters.');
      } else {
        count.textContent = rows.length
          ? t('{n} of {total} registered products with Part 1 = {part1}.', n)
          : t('No registered products with Part 1 = {part1} match these filters.', n);
      }
    }

    for (const el of [text, maker, status]) el.addEventListener('input', render);
    clearPart1.addEventListener('click', () => {
      part1Filter.value = null;
      render();
    });

    host.replaceChildren(
      h('div', { class: 'table-scroll' }, assignments),
      h('div', { class: 'ref-filters', id: 'ref-table' },
        h('div', { class: 'field' }, h('label', { for: 'ref-q' }, t('Product or DX number')), text),
        h('div', { class: 'field' }, h('label', { for: 'ref-maker' }, t('Manufacturer')), maker),
        h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status),
        clearPart1),
      count,
      h('div', { class: 'table-scroll table-scroll--tall' },
        h('table', { class: 'products-table' },
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'DX'), h('th', { scope: 'col' }, t('Product')), h('th', { scope: 'col' }, t('Manufacturer')),
            h('th', { scope: 'col' }, t('Status')), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, t('Barcode'))))),
          tbody)));
    render();
  }

  ui.createReference = createReference;
})(globalThis);
