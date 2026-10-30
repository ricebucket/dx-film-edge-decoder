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

  // The cassette in the drawing: the one in the Wikimedia Commons photo
  // DX-Codierung_asb_PICT3739.JPG (research/06). Its barcode and its printed
  // digits read 105514: DX 34-7, FUJICHROME SENSIA II 100 in the 2008
  // registry, 36 exposures. Its contact areas agree (Tables 11–13): ISO 100
  // (areas 3 and 5), 36 exposures (10) and ±1/2 stop (neither 11 nor 12).
  const DRAWN = { digits: '105514', bare: [1, 3, 5, 7, 10] };

  /**
   * A 35 mm cassette in three-quarter view, to scale in millimeters within
   * GB/T 9185-2003 Figure 4 and Tables 2, 7, 8 and 10. Round its side, from
   * the top: the contact areas cameras read (two rows of six, area 1 and 7 at
   * the knob's end), the barcode, the six digits printed between it and the
   * lip, centered on the barcode (§9.1), and the lip the film comes out of.
   */
  function cassetteFigure() {
    const DEG = Math.PI / 180;
    // The cassette lies along x, from its plain end (datum C, x = 0) to the
    // end its spool's knob comes out of. Angles go round it as in Figures 3
    // and 5: the contact rows at 191.7° and 225.6°, the bars from 257° to
    // 294°, then the digits and the lip.
    const L = 43.1; // Z2 42.39–43.80
    const R = 11.9; // the body, Z32 ≥ 23.40
    const RC = 12.55; // the end caps, Z24 24.89–25.30
    const RIM = 1.6;
    const KNOB = { r: 5.5, length: 4.35 }; // Z12 ≤ 11.40; Z1 − Z2
    const AREA = { pitch: 5.51, first: 7.95, rows: [174.75, 208.65, 242.55] }; // X6, X5 = 35.50 for areas 1 and 7, X10, X11
    const narrow = 0.33; // Table 8, target; wide is three times that
    const codeLeft = 11.3; // W3 9.40–13.21 from datum C
    // The lip, as in the photo: a thin metal rim, then velvet along the whole
    // length, a little past the end caps. Across the cassette (d toward the
    // viewer, v down) it leaves the body 56° below the front, comes forward to
    // 9.4 mm from the axis, and goes down to the caps' rims.
    const LIP = { from: 56, d: 9.4, top: 10, bottom: RC, rim: 0.3, over: 0.5 };
    // The film: 34.95 mm wide, perforations 2.80 by 1.98 mm, 4.75 mm apart,
    // 2.00 mm from its edges, corners 0.50 mm (Table 2). It comes straight out
    // of the velvet, pointing 20° down so that it shows from the front, and
    // fades out: a leader sticks out 43.91 to 71.76 mm and ends in a narrower
    // tongue (Table 1, Y7, Y4 and Y5), more than fits here.
    const FILM = { width: 34.95, length: 18, dip: 20 * DEG, firstHole: 1.4 };
    // Seen from 258°, turned 20° toward the knob's end.
    const FRONT = 258;
    const yaw = 20 * DEG;
    /** A point x along the cassette, d toward the viewer and v down. */
    const pt = (x, d, v) => [x * Math.cos(yaw) - d * Math.sin(yaw), v];
    const at = (x, deg, r = R) => {
      const th = (deg - FRONT) * DEG;
      return pt(x, r * Math.cos(th), r * Math.sin(th));
    };
    const path = (pts) => `M${pts.map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)}`).join('L')}Z`;
    /** The visible part of the side between x1 and x2 and between two angles. */
    const band = (x1, x2, from, to, r = R) => {
      const lo = Math.max(from, FRONT - 90);
      const hi = Math.min(to, FRONT + 90);
      const n = Math.max(2, Math.ceil((hi - lo) / 4));
      const arc = (x, a, b) => Array.from({ length: n + 1 }, (_, i) => at(x, a + ((b - a) * i) / n, r));
      return path([...arc(x1, lo, hi), ...arc(x2, hi, lo)]);
    };
    /** A rectangle with corners of radius r, as points: u from u0 to u1, w from w0 to w1. */
    const rounded = (u0, u1, w0, w1, r) => {
      const corner = (cu, cw, from) => Array.from({ length: 7 }, (_, i) => {
        const a = (from + 15 * i) * DEG;
        return [cu + r * Math.cos(a), cw + r * Math.sin(a)];
      });
      return [...corner(u1 - r, w0 + r, 270), ...corner(u1 - r, w1 - r, 0), ...corner(u0 + r, w1 - r, 90), ...corner(u0 + r, w0 + r, 180)];
    };
    const shape = (cls, d) => svg('path', { class: `cassette-figure__${cls}`, d });
    const end = (x, r) => {
      const [cx] = at(x, FRONT + 90, r);
      return { cx: cx.toFixed(2), cy: 0, rx: (r * Math.sin(yaw)).toFixed(2), ry: r };
    };
    const top = FRONT - 90;
    const bottom = FRONT + 90;
    const lipFrom = FRONT + LIP.from;

    // The contact areas: bare metal where a camera's probe makes contact, painted elsewhere.
    const areas = [];
    for (let col = 0; col < 6; col++) {
      for (const row of [0, 1]) {
        const n = (row === 0 ? 7 : 1) + (5 - col); // 1 and 7 nearest the knob
        if (!DRAWN.bare.includes(n)) continue;
        const x = AREA.first - AREA.pitch / 2 + AREA.pitch * col;
        areas.push(shape('metal', band(x + 0.15, x + AREA.pitch - 0.15, AREA.rows[row] + 0.6, AREA.rows[row + 1] - 0.6)));
      }
    }
    const bars = [];
    let x = codeLeft;
    codec.cassetteBars(DRAWN.digits).forEach((units, i) => {
      if (i % 2 === 0) bars.push(shape('bar', band(x, x + units * narrow, 257, 294)));
      x += units * narrow;
    });
    // The digits, centered on the barcode and laid on the side as printed.
    const middle = codeLeft + (63 * narrow) / 2;
    const textAt = 308; // the baseline, between the bars (to 294°) and the lip (from 314°)
    const [tx, ty] = at(middle, textAt);
    const th = (textAt - FRONT) * DEG;
    const onSide = `matrix(${Math.cos(yaw).toFixed(3)} 0 ${(Math.sin(th) * Math.sin(yaw)).toFixed(3)} ${Math.cos(th).toFixed(3)} ${tx.toFixed(2)} ${ty.toFixed(2)})`;
    const mark = band(middle - 6.6, middle + 6.6, 296, 310);

    // The lip: its end at the knob's end, its top, and its front, where the
    // velvet is.
    const corner = [[R * Math.cos(LIP.from * DEG), R * Math.sin(LIP.from * DEG)], [LIP.d, LIP.top], [LIP.d, LIP.bottom], [0, LIP.bottom]];
    const under = Array.from({ length: 9 }, (_, i) => {
      const a = (90 - ((90 - LIP.from) * i) / 8) * DEG;
      return [R * Math.cos(a), R * Math.sin(a)];
    });
    const lipEnd = path([...corner, ...under].map(([d, v]) => pt(L + LIP.over, d, v)));
    const lipTop = path([pt(-LIP.over, ...corner[0]), pt(L + LIP.over, ...corner[0]), pt(L + LIP.over, ...corner[1]), pt(-LIP.over, ...corner[1])]);
    const onFront = (x0, x1, v0, v1, r) => path(rounded(x0, x1, v0, v1, r).map(([fx, v]) => pt(fx, LIP.d, v)));
    const velvetTop = LIP.top + LIP.rim;
    const velvetBottom = LIP.bottom - 0.12;

    // The film, out of the middle of the velvet: x across it, s along it.
    const fl = L / 2 - FILM.width / 2;
    const fr = L / 2 + FILM.width / 2;
    const mouth = (velvetTop + velvetBottom) / 2;
    const on = ([fx, s]) => pt(fx, LIP.d + s * Math.cos(FILM.dip), mouth + s * Math.sin(FILM.dip));
    const holes = [];
    for (let s = FILM.firstHole; s + 1.98 <= FILM.length; s += 4.75) {
      for (const left of [fl + 2, fr - 2 - 2.8]) holes.push(rounded(left, left + 2.8, s, s + 1.98, 0.5));
    }
    const filmPath = [[[fl, 0], [fr, 0], [fr, FILM.length], [fl, FILM.length]], ...holes].map((ring) => path(ring.map(on))).join('');
    // Its shading runs along it: lines across the film stay level on the page.
    const along = (s0, s1) => {
      const [x1, y1] = on([L / 2, s0]);
      const [, y2] = on([L / 2, s1]);
      return { gradientUnits: 'userSpaceOnUse', x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x1.toFixed(2), y2: y2.toFixed(2) };
    };

    const knobEnd = end(L + KNOB.length, KNOB.r);
    const [left] = at(0, FRONT, RC);
    const right = Number(knobEnd.cx) + KNOB.r * Math.sin(yaw);
    const lowest = on([L / 2, FILM.length])[1];
    const box = [left - 0.6, -RC - 0.6, right - left + 1.2, RC + 0.6 + lowest + 0.6];
    return svg('svg', { class: 'cassette-figure', viewBox: box.map((v) => v.toFixed(2)).join(' '), 'aria-hidden': 'true', focusable: 'false' },
      svg('defs', null,
        svg('linearGradient', { id: 'cassette-light', gradientUnits: 'userSpaceOnUse', x1: 0, y1: -RC, x2: 0, y2: RC },
          svg('stop', { offset: 0, class: 'cassette-figure__shade-edge' }),
          svg('stop', { offset: 0.18, class: 'cassette-figure__shade-none' }),
          svg('stop', { offset: 0.3, class: 'cassette-figure__shade-shine' }),
          svg('stop', { offset: 0.42, class: 'cassette-figure__shade-none' }),
          svg('stop', { offset: 0.75, class: 'cassette-figure__shade-soft' }),
          svg('stop', { offset: 1, class: 'cassette-figure__shade-edge' })),
        // The film is opaque until 45% of the way out, then fades.
        svg('linearGradient', Object.assign({ id: 'cassette-film' }, along(0, FILM.length)),
          svg('stop', { offset: 0, class: 'cassette-figure__film-stop' }),
          svg('stop', { offset: 0.45, class: 'cassette-figure__film-stop' }),
          svg('stop', { offset: 1, class: 'cassette-figure__film-stop', 'stop-opacity': 0 })),
        // In the lip's shadow for its first 3 mm.
        svg('linearGradient', Object.assign({ id: 'cassette-film-shade' }, along(0, 3)),
          svg('stop', { offset: 0, class: 'cassette-figure__shade-edge' }),
          svg('stop', { offset: 1, class: 'cassette-figure__shade-none' })),
        svg('pattern', { id: 'cassette-velvet', patternUnits: 'userSpaceOnUse', width: 2.1, height: 1.3 },
          svg('rect', { class: 'cassette-figure__velvet-base', width: 2.1, height: 1.3 }),
          [[0.2, 0.3], [0.9, 0.15], [1.5, 0.55], [0.55, 0.9], [1.25, 1.05], [1.9, 0.95], [0.1, 1.15], [1.7, 0.2]].map(([cx, cy], i) =>
            svg('circle', { class: 'cassette-figure__velvet-fibre', cx, cy, r: 0.07 + (i % 3) * 0.02 }))),
        svg('clipPath', { id: 'cassette-side' }, svg('path', { d: band(0, L, top, bottom, RC) }))),
      svg('g', { class: 'cassette-figure__drop' },
        shape('paint', band(0, L, top, lipFrom, R)),
        shape('label', band(RIM, L - RIM, 246, lipFrom)),
        areas,
        bars,
        svg('path', { class: 'cassette-figure__mark', d: mark }),
        svg('text', { class: 'cassette-figure__digits', transform: onSide, 'text-anchor': 'middle' }, DRAWN.digits),
        shape('cap', band(0, RIM, top, bottom, RC)),
        shape('cap', band(L - RIM, L, top, bottom, RC)),
        svg('rect', { class: 'cassette-figure__light', x: box[0], y: -RC, width: box[2], height: 2 * RC, 'clip-path': 'url(#cassette-side)' }),
        shape('lip-top', lipTop),
        shape('lip', onFront(-LIP.over, L + LIP.over, LIP.top, LIP.bottom, 0.5)),
        shape('velvet', onFront(0.35 - LIP.over, L + LIP.over - 0.35, velvetTop, velvetBottom, 0.4)),
        svg('ellipse', Object.assign({ class: 'cassette-figure__end' }, end(L, RC))),
        shape('lip-end', lipEnd),
        svg('ellipse', Object.assign({ class: 'cassette-figure__end-ring' }, end(L, RC - 1.1))),
        shape('knob', band(L, L + KNOB.length, top, bottom, KNOB.r)),
        svg('ellipse', Object.assign({ class: 'cassette-figure__knob-end' }, knobEnd)),
        svg('rect', { class: 'cassette-figure__key', x: (Number(knobEnd.cx) - 0.45).toFixed(2), y: -3.6, width: 0.9, height: 7.2, rx: 0.4 }),
        svg('path', { class: 'cassette-figure__film', d: filmPath, 'fill-rule': 'evenodd' }),
        svg('path', { class: 'cassette-figure__film-shade', d: filmPath, 'fill-rule': 'evenodd' })));
  }

  function createCassette(host, { lookup, onShow }) {
    const input = h('input', {
      type: 'text', id: 'cassette-code', class: 'input input--code', inputmode: 'numeric', autocomplete: 'off',
      placeholder: DRAWN.digits, maxlength: '20', 'aria-describedby': 'cassette-help',
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
        msg.textContent = t('Enter exactly six digits, for example 105514.');
        msg.classList.add('is-error');
        out.replaceChildren();
        input.focus();
        return;
      }
      msg.classList.remove('is-error');
      msg.textContent = HELP;
      render(hit);
    });

    // Beside the heading, the lead and the form (index.html), or between the
    // lead and the form on phones: where the digits are, on the example number
    // of the placeholder. The results go below.
    host.append(form, h('div', { class: 'cassette__figure' }, cassetteFigure()), out);
    return { lookup(code) { input.value = code; form.requestSubmit(); } };
  }

  ui.createFinder = createFinder;
  ui.createCassette = createCassette;
})(globalThis);
