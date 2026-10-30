/*
 * The interactive film strip: clock track, clickable data track, printed
 * edge labels and the field annotations underneath.
 *
 * Cells are kept in reading order in the DOM; mirroring is done with CSS
 * (direction: rtl on the grids), so cell N is always data-cell="N".
 */
(function (root) {
  'use strict';
  const { h } = root.DX.dom;
  const codec = root.DX.codec;
  const t = root.DX.i18n.t;

  // Looked up when the strip is drawn, not when this script loads: the page's
  // language file may come in after it (js/prepaint.js).
  const fieldNames = () => ({
    start: t('start pattern'),
    part1: t('Part 1'),
    blank1: t('unused cell'),
    part2: t('Part 2'),
    frame: t('frame number'),
    half: t('half-frame flag'),
    blank2: t('unused cell'),
    parity: t('parity'),
    stop: t('stop pattern'),
  });

  // "A" is printed on film and "P" marks the parity cell; both stay as they are.
  const fieldShort = () => ({
    start: t('Start'),
    part1: t('Part 1'),
    part2: t('Part 2'),
    frame: t('Frame'),
    half: 'A',
    parity: 'P',
    stop: t('Stop'),
  });

  function createStrip(host, options) {
    const opts = Object.assign({ interactive: true, onChange: null }, options);
    let state = null;
    let refs = null;
    let focusCell = null;
    let stroke = null;
    let resizeObserver = null;

    function build(format) {
      const layout = codec.layout(format);
      const n = layout.length;
      const names = fieldNames();
      const short = fieldShort();

      const clock = h('div', { class: 'track track--clock', 'aria-hidden': 'true' },
        layout.map((c) => h('span', { class: `cell${c.clock ? ' is-bar' : ''}` })));

      const dataCells = layout.map((c) => {
        const name = names[c.field];
        if (!c.editable || !opts.interactive) {
          return h('span', {
            class: `cell cell--${c.editable ? 'static' : 'fixed'}`,
            'data-cell': c.cell,
            'data-field': c.field,
            title: c.editable ? null : t('Same on every film'),
            style: { '--i': c.cell },
          });
        }
        const label = c.weight
          ? t('Cell {cell} of {total}: {field}, weight {weight}', { cell: c.cell, total: n, field: name, weight: c.weight })
          : t('Cell {cell} of {total}: {field}', { cell: c.cell, total: n, field: name });
        return h('button', {
          type: 'button',
          class: 'cell cell--edit',
          'data-cell': c.cell,
          'data-field': c.field,
          'aria-pressed': 'false',
          'aria-label': label,
          tabindex: '-1',
          style: { '--i': c.cell },
        });
      });
      const data = h('div', {
        class: 'track track--data',
        role: opts.interactive ? 'group' : null,
        'aria-label': opts.interactive ? t('Data track, lower row: press a cell to add or remove a bar. Arrow keys move, 1 and 0 type bars and gaps.') : null,
        'aria-hidden': opts.interactive ? null : 'true',
      }, dataCells);

      // The number printed before the code, as on film; an A position has an
      // arrow under it. The next number is printed beyond this view.
      const before = h('div', { class: 'film__label film__label--before', 'aria-hidden': 'true' },
        h('span', { class: 'edge-print' }, h('span', { class: 'edge-text' }), h('span', { class: 'film__arrow' })));

      const perfs = h('div', { class: 'film__perfs', 'aria-hidden': 'true' },
        Array.from({ length: 5 }, () => h('span', { class: 'perf' })));

      const film = h('div', { class: 'film' },
        perfs,
        h('div', { class: 'film__row' }, before, h('div', { class: 'film__code' }, clock, data)));

      const fields = codec.getFormat(format).fields;
      const brackets = fields.map((f) =>
        h('div', {
          class: `bracket bracket--${f.id}${f.kind === 'blank' ? ' bracket--blank' : ''}`,
          'data-field': f.id,
          'data-from': f.from,
          style: { 'grid-column': `${f.from} / ${f.to + 1}` },
          title: f.kind === 'blank' ? t('Unused: always empty') : null,
        },
        h('span', { class: 'bracket__name' }, short[f.id] || ''),
        h('span', { class: 'bracket__value' })));
      const weights = layout.map((c) =>
        h('span', { class: `weight weight--${c.field}`, 'data-cell': c.cell },
          c.weight ? String(c.weight) : c.field === 'half' ? 'A' : c.field === 'parity' ? 'P' : ''));

      const annot = h('div', { class: 'annot', 'aria-hidden': 'true' },
        h('div', { class: 'annot__grid annot__weights' }, weights),
        h('div', { class: 'annot__grid annot__fields' }, brackets));

      // A photo's barcode, stretched so each cell sits over its own (render's state.photo).
      const photoRow = h('div', { class: 'strip__photo', hidden: true, 'aria-hidden': 'true' },
        h('span', { class: 'strip__photo-label' }, t('Your photo')));
      // The read-only diagram's scroller is no tab stop (Chromium makes scrolling boxes ones).
      const scroller = h('div', { class: 'strip__scroller', tabindex: opts.interactive ? null : '-1' }, h('div', { class: 'strip__canvas' }, photoRow, film, annot));
      const swipe = h('p', { class: 'strip__swipe' }, opts.interactive
        ? t('Swipe sideways or turn your phone to landscape.')
        : t('Swipe sideways to see the whole code.'));
      const strip = h('div', { class: 'strip', 'data-format': format, style: { '--cells': n } }, h('div', { class: 'strip__viewport' }, scroller), swipe);
      host.replaceChildren(strip);

      // Fade the edges that hide more of the strip on narrow screens.
      const overflow = () => {
        const over = scroller.scrollWidth > scroller.clientWidth + 1;
        strip.classList.toggle('is-overflowing', over);
        strip.classList.toggle('more-left', over && scroller.scrollLeft > 2);
        strip.classList.toggle('more-right', over && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
      };
      scroller.addEventListener('scroll', overflow, { passive: true });
      if (resizeObserver) resizeObserver.disconnect(); // from the previous layout's strip
      resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(overflow) : null;
      if (resizeObserver) resizeObserver.observe(scroller);
      requestAnimationFrame(overflow);

      if (opts.interactive) bindEvents(data);
      return { format, strip, scroller, photoRow, film, clock, data, before, annot, layout, brackets, weights };
    }

    // ---- editing ----------------------------------------------------------

    function cellButton(target) {
      const el = target && target.closest ? target.closest('button.cell--edit') : null;
      return el && refs.data.contains(el) ? el : null;
    }

    function setCell(cellNo, bar) {
      const i = cellNo - 1;
      if ((state.cells[i] === '1') === bar) return false;
      state.cells = state.cells.slice(0, i) + (bar ? '1' : '0') + state.cells.slice(i + 1);
      return true;
    }

    function emit(commit, previous) {
      if (opts.onChange) opts.onChange(state.cells, { commit, previous });
    }

    function bindEvents(track) {
      // A finger that moves this far is scrolling the strip, not tapping a cell.
      const scrolled = (s, e) => Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10;

      track.addEventListener('pointerdown', (e) => {
        const btn = cellButton(e.target);
        if (!btn || e.button !== 0) return;
        const cellNo = Number(btn.dataset.cell);
        if (e.pointerType === 'touch') {
          // Toggled when the finger lifts; until then the cell shows what that
          // will do, as hovering does with a mouse.
          btn.classList.add('is-pressing');
          stroke = { touch: true, id: e.pointerId, x: e.clientX, y: e.clientY, cellNo, btn };
          return;
        }
        e.preventDefault();
        btn.focus({ preventScroll: true });
        setFocusCell(cellNo);
        const value = state.cells[cellNo - 1] !== '1';
        stroke = { touch: false, id: e.pointerId, value, previous: state.cells };
        try {
          track.setPointerCapture(e.pointerId);
        } catch (err) {
          // pointer already gone (or synthetic): painting still works without capture
        }
        if (setCell(cellNo, value)) emit(false);
      });

      track.addEventListener('pointermove', (e) => {
        if (!stroke || stroke.id !== e.pointerId) return;
        if (stroke.touch) {
          if (scrolled(stroke, e)) stroke.btn.classList.remove('is-pressing');
          return;
        }
        const btn = cellButton(document.elementFromPoint(e.clientX, e.clientY));
        if (btn && setCell(Number(btn.dataset.cell), stroke.value)) emit(false);
      });

      const end = (e) => {
        if (!stroke || stroke.id !== e.pointerId) return;
        const s = stroke;
        stroke = null;
        if (s.touch) {
          s.btn.classList.remove('is-pressing');
          if (e.type === 'pointerup' && !scrolled(s, e)) {
            const previous = state.cells;
            setCell(s.cellNo, state.cells[s.cellNo - 1] !== '1');
            setFocusCell(s.cellNo);
            emit(true, previous);
          }
          return;
        }
        if (s.previous !== state.cells) emit(true, s.previous);
      };
      track.addEventListener('pointerup', end);
      track.addEventListener('pointercancel', end);

      // Keyboard activation arrives as a click with detail 0.
      track.addEventListener('click', (e) => {
        const btn = cellButton(e.target);
        if (!btn || e.detail !== 0) return;
        const cellNo = Number(btn.dataset.cell);
        const previous = state.cells;
        setCell(cellNo, state.cells[cellNo - 1] !== '1');
        emit(true, previous);
      });

      track.addEventListener('keydown', (e) => {
        const btn = cellButton(e.target);
        if (!btn || e.altKey || e.ctrlKey || e.metaKey) return;
        const cellNo = Number(btn.dataset.cell);
        const editable = refs.layout.filter((c) => c.editable).map((c) => c.cell);
        const pos = editable.indexOf(cellNo);
        const step = state.mirrored ? -1 : 1;
        let target = null;
        if (e.key === 'ArrowRight') target = editable[pos + step];
        else if (e.key === 'ArrowLeft') target = editable[pos - step];
        else if (e.key === 'Home') target = state.mirrored ? editable[editable.length - 1] : editable[0];
        else if (e.key === 'End') target = state.mirrored ? editable[0] : editable[editable.length - 1];
        else if (['1', '0', 'Backspace', 'Delete'].includes(e.key)) {
          e.preventDefault();
          // Typing goes in reading order from cell 7, right after the start
          // pattern, as the hint says: on a mirrored strip, to the left.
          const previous = state.cells;
          if (e.key === 'Backspace') {
            // Step back, then clear: like correcting typed text.
            const back = editable[pos - 1];
            if (back !== undefined) {
              setCell(back, false);
              moveFocus(back);
            }
          } else {
            setCell(cellNo, e.key === '1');
            if (e.key !== 'Delete' && editable[pos + 1] !== undefined) moveFocus(editable[pos + 1]);
          }
          if (previous !== state.cells) emit(true, previous);
          return;
        } else return;
        e.preventDefault();
        if (target !== undefined && target !== null) moveFocus(target);
      });
    }

    function setFocusCell(cellNo) {
      focusCell = cellNo;
      for (const b of refs.data.querySelectorAll('button.cell--edit')) {
        b.tabIndex = Number(b.dataset.cell) === cellNo ? 0 : -1;
      }
    }

    function moveFocus(cellNo) {
      setFocusCell(cellNo);
      const btn = refs.data.querySelector(`button[data-cell="${cellNo}"]`);
      if (btn) {
        btn.focus();
        // keep the focused cell visible when the strip scrolls sideways
        if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    // ---- rendering ----------------------------------------------------------

    /**
     * On a screen too narrow for the whole strip (a phone), show the code from
     * cell 1, just clear of the edge fade; the printed number before the code
     * is then one swipe away. Mirrored, cell 1 is at the code's right end.
     */
    function startAtCellOne() {
      const { scroller, clock } = refs;
      requestAnimationFrame(() => {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
        const view = scroller.getBoundingClientRect();
        const code = clock.getBoundingClientRect();
        const fade = 32; // .strip__viewport::before and ::after
        scroller.scrollLeft += state.mirrored ? code.right - view.right + fade : code.left - view.left - fade;
      });
    }

    function render(next) {
      // A change from outside (undo, a loaded code, a layout switch) ends any
      // drag in progress, so it cannot later record cells of another layout.
      if (stroke && (!refs || refs.format !== next.format || next.cells !== state.cells)) {
        if (stroke.btn) stroke.btn.classList.remove('is-pressing');
        stroke = null;
      }
      state = Object.assign({}, next);
      const rebuilt = !refs || refs.format !== state.format;
      if (rebuilt) {
        refs = build(state.format);
        const first = refs.layout.find((c) => c.editable);
        if (opts.interactive) setFocusCell(focusCell && refs.layout[focusCell - 1] && refs.layout[focusCell - 1].editable ? focusCell : first.cell);
      }
      const d = state.decoded || codec.decode(state.cells, state.format);
      refs.strip.dataset.look = state.look || 'negative';
      const mirrored = Boolean(state.mirrored);
      if (rebuilt || refs.mirrored !== mirrored) {
        refs.strip.classList.toggle('is-mirrored', mirrored);
        refs.mirrored = mirrored;
        startAtCellOne();
      }
      refs.strip.classList.toggle('is-valid', d.valid);

      // Outline cells that are wrong in themselves. A parity failure means some
      // bar is misread, not necessarily the parity cell, so it is not outlined.
      const issueCells = new Set(d.issues.filter((i) => i.cell && i.code !== 'parity').map((i) => i.cell));
      for (const el of refs.data.children) {
        const cellNo = Number(el.dataset.cell);
        const bar = state.cells[cellNo - 1] === '1';
        el.classList.toggle('is-bar', bar);
        el.classList.toggle('is-error', issueCells.has(cellNo));
        if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(bar));
      }
      for (const el of refs.weights) el.classList.toggle('is-error', issueCells.has(Number(el.dataset.cell)));

      // Nothing entered yet: a blank strip (the page says so; on its own, no bars).
      const empty = state.empty !== undefined ? state.empty : refs.layout.every((c) => !c.editable || state.cells[c.cell - 1] === '0');
      for (const b of refs.brackets) {
        const id = b.dataset.field;
        const value = b.querySelector('.bracket__value');
        let text = '';
        let bad = false;
        if (id === 'part1') text = String(d.part1);
        else if (id === 'part2') text = String(d.part2);
        else if (id === 'frame') text = d.frame >= 61 ? `${d.frame} ${codec.frameLabel(d.frame, false)}` : String(d.frame);
        else if (id === 'half') text = d.half ? 'A' : '–';
        else if (id === 'parity') { text = d.parity.ok ? '✓' : '✗'; bad = !d.parity.ok; }
        else if (id === 'blank1' || id === 'blank2') bad = d.blanks.some((x) => !x.ok && x.cell === Number(b.dataset.from));
        value.textContent = text;
        b.classList.toggle('is-error', bad);
      }

      // The printed number before a code names that code's position: the one
      // the frame field stands for, faded until the code is entered and valid
      // (on a blank strip, frame 0). The 23-cell layout has no frame field.
      const hasFrame = d.frame !== null;
      refs.before.querySelector('.edge-text').textContent = hasFrame ? d.frameLabel : '';
      refs.before.classList.toggle('is-half', hasFrame && d.half);
      refs.film.classList.toggle('has-labels', hasFrame);
      refs.film.classList.toggle('labels-uncertain', hasFrame && (empty || !d.valid));

      const label = refs.photoRow.firstChild;
      if (state.photo) {
        if (refs.photoRow.lastChild !== state.photo) refs.photoRow.replaceChildren(label, state.photo);
      } else if (refs.photoRow.lastChild !== label) refs.photoRow.replaceChildren(label);
      refs.photoRow.hidden = !state.photo;
    }

    /** Bars fade in left to right, like a latent image developing. */
    function develop() {
      if (!refs) return;
      const film = refs.film;
      film.classList.remove('is-developing');
      void film.offsetWidth; // restart the animation
      film.classList.add('is-developing');
      clearTimeout(develop.timer);
      develop.timer = setTimeout(() => film.classList.remove('is-developing'), 1400);
    }

    return { render, develop };
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.createStrip = createStrip;
})(globalThis);
