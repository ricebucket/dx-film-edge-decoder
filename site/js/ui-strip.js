/*
 * The interactive film strip: clock track, clickable data track, printed
 * edge labels, a ruler of cell numbers above and the field annotations
 * underneath.
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
    blank1: t('unassigned cell'),
    part2: t('Part 2'),
    frame: t('frame number'),
    half: t('half-frame flag'),
    blank2: t('unassigned cell'),
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
    let hovered = null; // the cell under the mouse, for the ruler
    // The latest input wins on the ruler: the mouse moving gives it to the
    // mouse; any key in the strip, Tab into it or a finger, to the cell they
    // are on. A scroll or a new layout under a resting mouse changes only
    // `hovered`.
    let mouseLeads = true;
    let mouseX = null; // where the mouse last was in the window
    let mouseY = null;
    let resizeObserver = null;
    // Fingers on the screen, anywhere: a second one makes a pinch or a
    // two-finger scroll, not a tap, so the first one's press is dropped and
    // neither changes a cell. The first finger of each new touch starts afresh.
    const touches = new Set();
    if (opts.interactive) {
      // Anywhere on the page, since a scroll can bring the strip under a
      // mouse resting elsewhere. Only a new place in the window is a move:
      // WebKit also reports a resting mouse as moving after a scroll.
      document.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const moved = mouseX !== null && (e.clientX !== mouseX || e.clientY !== mouseY);
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (moved && !mouseLeads) {
          mouseLeads = true;
          showHere();
        }
      }, { capture: true, passive: true });
      document.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        if (e.isPrimary) touches.clear();
        touches.add(e.pointerId);
        if (touches.size > 1 && stroke && stroke.touch) {
          stroke.btn.classList.remove('is-pressing');
          stroke = null;
          showHere();
        }
      }, true);
      const lift = (e) => { touches.delete(e.pointerId); };
      document.addEventListener('pointerup', lift, true);
      document.addEventListener('pointercancel', lift, true);
    }

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
        'aria-label': opts.interactive ? t('Data track, lower row: select a cell to add or remove a bar. Arrow keys move, 1 and 0 type bars and gaps.') : null,
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

      // Over the film, the cells' numbers, which the page's texts use ("Add
      // the bar in cell 18"): a tick for each cell, the number at 1 and every
      // fifth, and that of the cell pointed at (showHere).
      const ruler = layout.map((c) => h('span', { class: `ruler__cell${c.cell === 1 || c.cell % 5 === 0 ? ' is-major' : ''}`, 'data-cell': c.cell },
        h('span', { class: 'ruler__num' }, String(c.cell))));
      const rulerRow = h('div', { class: 'ruler', 'aria-hidden': 'true' }, h('div', { class: 'ruler__grid' }, ruler));

      const fields = codec.getFormat(format).fields;
      const brackets = fields.map((f) =>
        h('div', {
          class: `bracket bracket--${f.id}${f.kind === 'blank' ? ' bracket--blank' : ''}`,
          'data-field': f.id,
          'data-from': f.from,
          style: { 'grid-column': `${f.from} / ${f.to + 1}` },
          title: f.kind === 'blank' ? t('Unassigned: always empty') : null,
        },
        h('span', { class: 'bracket__name' }, short[f.id] || ''),
        h('span', { class: 'bracket__value' })));
      const annot = h('div', { class: 'annot', 'aria-hidden': 'true' },
        h('div', { class: 'annot__grid' }, brackets));

      // A photo's barcode, stretched so each cell sits over its own (render's state.photo).
      const photoRow = h('div', { class: 'strip__photo', hidden: true, 'aria-hidden': 'true' },
        h('span', { class: 'strip__photo-label' }, t('Photo detail')));
      // The read-only diagram's scroller is no tab stop (Chromium makes scrolling boxes ones).
      const scroller = h('div', { class: 'strip__scroller', tabindex: opts.interactive ? null : '-1' }, h('div', { class: 'strip__canvas' }, photoRow, rulerRow, film, annot));
      const swipe = h('p', { class: 'strip__swipe' }, t('Scroll sideways to see the whole strip.'));
      // As wide as the scroller, and of no height: watched in its place (below).
      const width = h('div');
      const strip = h('div', { class: 'strip', 'data-format': format, style: { '--cells': n } }, h('div', { class: 'strip__viewport' }, scroller), width, swipe);
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
      // Not the scroller itself: `is-overflowing` changes its height (a
      // photo's label goes above the photo), and an observer that resizes
      // what it watches is reported as an error, a loop.
      if (resizeObserver) resizeObserver.observe(width);
      requestAnimationFrame(overflow);

      if (opts.interactive) bindEvents(data);
      return { format, strip, scroller, photoRow, film, clock, data, before, annot, layout, brackets, ruler };
    }

    // ---- editing ----------------------------------------------------------

    function cellButton(target) {
      const el = target && target.closest ? target.closest('button.cell--edit') : null;
      return el && refs.data.contains(el) ? el : null;
    }

    /** The mouse is over `target`: the cell under it, for the ruler, if it is one of the data track's. */
    function point(target) {
      const el = target && target.closest ? target.closest('[data-cell]') : null;
      const cell = el && refs.data.contains(el) ? Number(el.dataset.cell) : null;
      if (cell === hovered) return;
      hovered = cell;
      showHere();
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
        // While more than one finger is down (`touches`), none presses a cell.
        if (e.pointerType === 'touch' && touches.size > 1) return;
        const btn = cellButton(e.target);
        if (!btn || e.button !== 0) return;
        const cellNo = Number(btn.dataset.cell);
        if (e.pointerType === 'touch') {
          // Toggled when the finger lifts; until then the cell shows what that
          // will do, as hovering does with a mouse.
          btn.classList.add('is-pressing');
          stroke = { touch: true, id: e.pointerId, x: e.clientX, y: e.clientY, cellNo, btn };
          mouseLeads = false; // a finger takes the ruler from a resting mouse
          showHere();
          return;
        }
        e.preventDefault();
        // The mouse's focus, ringed only once a key is used (style.css):
        // browsers ring focus a script gives when nothing was clicked before.
        track.classList.add('is-clicked');
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
        if (!stroke && e.pointerType === 'mouse') {
          point(e.target);
          return;
        }
        if (!stroke || stroke.id !== e.pointerId) return;
        if (stroke.touch) {
          if (scrolled(stroke, e)) {
            stroke.btn.classList.remove('is-pressing');
            showHere();
          }
          return;
        }
        const under = document.elementFromPoint(e.clientX, e.clientY);
        // The track holds the pointer while it paints (setPointerCapture), so
        // the cells it crosses get no pointerover: the ruler follows it here.
        point(under);
        const btn = cellButton(under);
        if (btn && setCell(Number(btn.dataset.cell), stroke.value)) emit(false);
      });

      const end = (e) => {
        if (!stroke || stroke.id !== e.pointerId) return;
        const s = stroke;
        stroke = null;
        showHere();
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

      // The cell under the mouse, for the ruler; a finger's is the one it
      // presses. While the track holds the pointer, the browser says it is
      // over the track itself, not over a cell: pointermove says where then.
      track.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch' || e.target === track) return;
        point(e.target);
      });
      track.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        hovered = null;
        showHere();
      });
      track.addEventListener('focusin', (e) => {
        // Focus the keyboard brought in (Tab) takes the ruler, as keys do.
        if (!track.classList.contains('is-clicked') && e.target.matches(':focus-visible')) mouseLeads = false;
        showHere();
      });
      track.addEventListener('focusout', (e) => {
        // Focus gone elsewhere on the page ends the mouse's; gone with the
        // window, it comes back as it was.
        if (!track.contains(e.relatedTarget) && document.hasFocus()) track.classList.remove('is-clicked');
        setTimeout(showHere);
      });

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
        // A modifier pressed on its own is not input to the strip: Shift for
        // scrolling it sideways with the wheel, Cmd or Alt for switching windows.
        if (!btn || ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'].includes(e.key)) return;
        // Any key in the strip, Ctrl+Z too, takes the ruler to the cell with
        // focus, until the mouse moves again.
        mouseLeads = false;
        showHere();
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        track.classList.remove('is-clicked'); // the keyboard's focus now, with its ring
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

    /**
     * The ruler names the cell pointed at: the one under the mouse, unless a
     * later input took the ruler from it (mouseLeads), else the one a finger
     * presses, else the one with focus.
     */
    function showHere() {
      if (!refs || !opts.interactive) return;
      const active = document.activeElement;
      const focused = active && refs.data.contains(active) ? Number(active.dataset.cell) : null;
      const pressed = stroke && stroke.touch && stroke.btn.classList.contains('is-pressing') ? stroke.cellNo : null;
      const here = refs.ruler[((mouseLeads && hovered) || pressed || focused) - 1] || null;
      // Only the cell that stops being marked and the one that starts: the
      // mouse calls this for each cell it crosses.
      if (here === refs.here) return;
      if (refs.here) refs.here.classList.remove('is-here');
      if (here) here.classList.add('is-here');
      refs.here = here;
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
        hovered = null; // its cells are gone: the browser names the new one under the mouse, if any
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
      showHere();
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
