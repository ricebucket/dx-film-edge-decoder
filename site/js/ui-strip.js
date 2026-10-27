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

  const FIELD_NAMES = {
    start: t('start pattern'),
    part1: t('Part 1'),
    blank1: t('unused cell'),
    part2: t('Part 2'),
    frame: t('frame number'),
    half: t('half-frame flag'),
    blank2: t('unused cell'),
    parity: t('parity'),
    stop: t('stop pattern'),
  };

  // "A" is printed on film and "P" marks the parity cell; both stay as they are.
  const FIELD_SHORT = {
    start: t('Start'),
    part1: t('Part 1'),
    part2: t('Part 2'),
    frame: t('Frame'),
    half: 'A',
    parity: 'P',
    stop: t('Stop'),
  };

  /** Label of the next printed position: 23 → 23A → 24, …, X → XA → 00 → 00A → 0. */
  function nextLabel(frame, half) {
    return half ? codec.frameLabel((frame + 1) % 64, false) : codec.frameLabel(frame, true);
  }

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

      const clock = h('div', { class: 'track track--clock', 'aria-hidden': 'true' },
        layout.map((c) => h('span', { class: `cell${c.clock ? ' is-bar' : ''}` })));

      const dataCells = layout.map((c) => {
        const name = FIELD_NAMES[c.field];
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
          ? t('Cell {cell} of {total}: {field}, value {weight}', { cell: c.cell, total: n, field: name, weight: c.weight })
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

      const before = h('div', { class: 'film__label film__label--before', 'aria-hidden': 'true' },
        h('span', { class: 'edge-arrow' }), h('span', { class: 'edge-text' }));
      const after = h('div', { class: 'film__label film__label--after', 'aria-hidden': 'true' },
        h('span', { class: 'edge-arrow' }), h('span', { class: 'edge-text' }));

      const perfs = h('div', { class: 'film__perfs', 'aria-hidden': 'true' },
        Array.from({ length: 6 }, () => h('span', { class: 'perf' })));

      const film = h('div', { class: 'film' },
        perfs,
        h('div', { class: 'film__row' }, before, h('div', { class: 'film__code' }, clock, data), after));

      const fields = codec.getFormat(format).fields;
      const brackets = fields.map((f) =>
        h('div', {
          class: `bracket bracket--${f.id}${f.kind === 'blank' ? ' bracket--blank' : ''}`,
          'data-field': f.id,
          'data-from': f.from,
          style: { 'grid-column': `${f.from} / ${f.to + 1}` },
          title: f.kind === 'blank' ? t('Unused: always empty') : null,
        },
        h('span', { class: 'bracket__name' }, FIELD_SHORT[f.id] || ''),
        h('span', { class: 'bracket__value' })));
      const weights = layout.map((c) =>
        h('span', { class: `weight weight--${c.field}`, 'data-cell': c.cell },
          c.weight ? String(c.weight) : c.field === 'half' ? 'A' : c.field === 'parity' ? 'P' : ''));

      const annot = h('div', { class: 'annot', 'aria-hidden': 'true' },
        h('div', { class: 'annot__grid annot__weights' }, weights),
        h('div', { class: 'annot__grid annot__fields' }, brackets));

      const scroller = h('div', { class: 'strip__scroller' }, h('div', { class: 'strip__canvas' }, film, annot));
      const swipe = h('p', { class: 'strip__swipe' }, opts.interactive
        ? t('Swipe the strip sideways to reach every cell, or turn your phone to landscape.')
        : t('Swipe sideways to see the whole code.'));
      const strip = h('div', { class: 'strip', style: { '--cells': n } }, h('div', { class: 'strip__viewport' }, scroller), swipe);
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
      return { format, strip, scroller, film, clock, data, before, after, annot, layout, brackets, weights };
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
          // Typing follows the visual direction, so a mirrored strip is
          // entered as seen, left to right.
          const previous = state.cells;
          if (e.key === 'Backspace') {
            // Step back, then clear: like correcting typed text.
            const back = editable[pos - step];
            if (back !== undefined) {
              setCell(back, false);
              moveFocus(back);
            }
          } else {
            setCell(cellNo, e.key === '1');
            if (e.key !== 'Delete' && editable[pos + step] !== undefined) moveFocus(editable[pos + step]);
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

    function render(next) {
      // A change from outside (undo, a loaded code, a layout switch) ends any
      // drag in progress, so it cannot later record cells of another layout.
      if (stroke && (!refs || refs.format !== next.format || next.cells !== state.cells)) {
        if (stroke.btn) stroke.btn.classList.remove('is-pressing');
        stroke = null;
      }
      state = Object.assign({}, next);
      if (!refs || refs.format !== state.format) {
        refs = build(state.format);
        const first = refs.layout.find((c) => c.editable);
        if (opts.interactive) setFocusCell(focusCell && refs.layout[focusCell - 1] && refs.layout[focusCell - 1].editable ? focusCell : first.cell);
      }
      const d = state.decoded || codec.decode(state.cells, state.format);
      refs.strip.dataset.look = state.look || 'negative';
      refs.strip.classList.toggle('is-mirrored', Boolean(state.mirrored));
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

      const issues = new Set(d.issues.map((i) => i.code));
      // Nothing entered yet is not an error, just a blank strip.
      const empty = refs.layout.every((c) => !c.editable || state.cells[c.cell - 1] === '0');
      for (const b of refs.brackets) {
        const id = b.dataset.field;
        const value = b.querySelector('.bracket__value');
        let text = '';
        let bad = false;
        if (id === 'part1') { text = String(d.part1); bad = issues.has('part1-zero') && !empty; }
        else if (id === 'part2') text = String(d.part2);
        else if (id === 'frame') text = d.frame >= 62 ? `${d.frame} ${codec.frameLabel(d.frame, false)}` : String(d.frame);
        else if (id === 'half') text = d.half ? 'A' : '–';
        else if (id === 'parity') { text = d.parity.ok ? '✓' : '✗'; bad = !d.parity.ok; }
        else if (id === 'blank1' || id === 'blank2') bad = d.blanks.some((x) => !x.ok && x.cell === Number(b.dataset.from));
        value.textContent = text;
        b.classList.toggle('is-error', bad);
      }

      // Printed edge labels: the label before a code names that code's position.
      const hasFrame = d.frame !== null && d.part1 !== 0;
      refs.before.querySelector('.edge-text').textContent = hasFrame ? d.frameLabel : '';
      refs.after.querySelector('.edge-text').textContent = hasFrame ? nextLabel(d.frame, d.half) : '';
      refs.film.classList.toggle('has-labels', hasFrame);
      refs.film.classList.toggle('labels-uncertain', hasFrame && !d.valid);
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
