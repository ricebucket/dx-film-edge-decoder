/* Wires the page together: state, history, URL, preferences. */
(function () {
  'use strict';
  const DX = globalThis.DX;
  const { codec, ui, i18n } = DX;
  const t = i18n.t;
  const lookup = DX.createLookup(DX.data, DX.communityData);
  const $ = (id) => document.getElementById(id);

  // Examples are documented codes: Wikipedia's sample (and a real BW400CN
  // negative), the Wikimedia photo of Perutz Primera 200, I3A entries, and
  // Zint's test vector for the older 23-cell layout (79-7). Each is drawn in
  // its film's look; BW400CN is black-and-white film developed like color
  // negative film, and looks like it (Kodak F-4036; research/05). Their labels
  // are looked up when shown, as the page's language file may load after this.
  const examples = () => [
    { label: t('{film}, frame {frame}', { film: 'Kodak BW400CN', frame: '23' }), code: { part1: 79, part2: 15, frame: 23, half: false }, look: 'negative' },
    { label: t('{film}, frame {frame}', { film: 'Perutz Primera 200', frame: '22A' }), code: { part1: 47, part2: 1, frame: 22, half: true }, look: 'negative' },
    { label: t('{film}, frame {frame}', { film: 'Ilford HP5 Plus', frame: '12' }), code: { part1: 109, part2: 9, frame: 12, half: false }, look: 'bw' },
    { label: t('{film}, frame {frame}', { film: 'Fujichrome Velvia 50', frame: '5A' }), code: { part1: 32, part2: 6, frame: 5, half: true }, look: 'slide' },
    { label: t('{film}, older 7-bar code', { film: 'Kodacolor VR200' }), code: { part1: 79, part2: 7 }, format: 'short', look: 'negative' },
  ];

  const emptyCells = (format) =>
    codec.layout(format).map((c) => (c.fixed === null ? '0' : String(c.fixed))).join('');

  /** The start and stop cells are not editable, so always keep them standard. */
  const standardEnds = (cells, format) =>
    codec.layout(format).map((c) => (c.editable ? cells[c.cell - 1] : String(c.fixed))).join('');

  const scrollBehavior = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  // `loaded`: the code came from a link, an example, a search, a photo or a
  // correction, and has not been edited by hand since. Only the all-zero
  // strip needs it: loaded, it is DX 0-0; otherwise nothing is entered yet.
  const state = { format: 'long', cells: emptyCells('long'), loaded: false, mirrored: false, look: 'negative' };
  const isEmpty = () => !state.loaded && state.cells === emptyCells(state.format);
  const past = [];
  const future = [];

  // ---- preferences --------------------------------------------------------------

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('dx-prefs') || '{}');
      if (['negative', 'bw', 'slide'].includes(p.look)) state.look = p.look;
      state.mirrored = p.mirrored === true;
    } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
  }

  /** Called wherever a film look or mirroring is chosen (not on every edit), so the latest choice in any tab is kept. */
  function savePrefs() {
    try {
      localStorage.setItem('dx-prefs', JSON.stringify({ look: state.look, mirrored: state.mirrored }));
    } catch (e) { /* ignore */ }
  }

  // ---- URL ------------------------------------------------------------------------

  function codeFromUrl() {
    const params = new URLSearchParams(location.search);
    const dx = params.get('dx');
    if (dx) {
      const [num, frameText] = dx.split('/');
      const parsed = codec.parseDxNumber(num);
      if (!parsed || parsed.kind !== 'parts') return null;
      if (frameText === undefined) return { format: 'short', cells: codec.encode(parsed, 'short'), loaded: true };
      const frame = codec.parseFrameLabel(frameText);
      if (!frame) return null;
      return { format: 'long', cells: codec.encode(Object.assign({}, parsed, frame), 'long'), loaded: true };
    }
    const bits = params.get('bits');
    if (bits && /^[01]+$/.test(bits)) {
      const format = bits.length === 31 ? 'long' : bits.length === 23 ? 'short' : null;
      if (format) {
        return { format, cells: standardEnds(bits, format), loaded: true };
      }
    }
    // An empty strip in the 23-cell layout ("7 thin bars").
    if (params.get('layout') === '23') return { format: 'short', cells: emptyCells('short'), loaded: false };
    return null;
  }

  function stateQuery(decoded) {
    if (isEmpty()) return state.format === 'short' ? '?layout=23' : '';
    if (decoded.valid) {
      return `?dx=${decoded.dxNumber}${decoded.frame === null ? '' : `/${decoded.frameLabel}`}`;
    }
    return `?bits=${state.cells}`;
  }

  /** What "Copy link" copies: the code, and the language it is shown in. */
  function shareUrl(decoded) {
    const query = stateQuery(decoded);
    return `${location.href.split(/[?#]/)[0]}${query ? `${query}&` : '?'}lang=${encodeURIComponent(i18n.current)}`;
  }

  // The URL follows every edit at once, so a reload or bookmark gets the latest
  // code. Browsers limit how often a page may rewrite it (Safari: 100 times in
  // 10 s), so past 50 rewrites in 10 s (holding Ctrl+Z, say) it changes at most
  // every 250 ms, always ending with the latest state. A language in the URL
  // (?lang=) stays while it is the one shown.
  const rewrites = []; // performance.now() of recent rewrites; unlike Date.now(), never moves backwards
  let urlQuery = '';
  let urlTimer = null;

  function writeUrl() {
    clearTimeout(urlTimer);
    urlTimer = null;
    const lang = new URLSearchParams(location.search).get('lang');
    const query = lang && lang.toLowerCase() === i18n.current.toLowerCase()
      ? `${urlQuery ? `${urlQuery}&` : '?'}lang=${encodeURIComponent(i18n.current)}`
      : urlQuery;
    const url = location.pathname + query + location.hash;
    if (url === location.pathname + location.search + location.hash) return;
    rewrites.push(performance.now());
    try {
      history.replaceState(null, '', url);
    } catch (e) { /* some browsers refuse this on file:// pages */ }
  }

  function syncUrl(decoded) {
    urlQuery = stateQuery(decoded);
    if (urlTimer) return;
    const now = performance.now();
    while (rewrites.length && now - rewrites[0] > 10000) rewrites.shift();
    if (rewrites.length < 50) writeUrl();
    else urlTimer = setTimeout(writeUrl, Math.max(0, rewrites[rewrites.length - 1] + 250 - now));
  }

  function flushUrl() {
    if (urlTimer) writeUrl();
  }

  // ---- history --------------------------------------------------------------------------

  /** What undo brings back: the code, and where it came from. */
  function snapshot() {
    return { format: state.format, cells: state.cells, loaded: state.loaded, origin };
  }

  function record(previous) {
    past.push(previous || snapshot());
    if (past.length > 200) past.shift();
    future.length = 0;
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const s = from.pop();
    state.format = s.format;
    state.cells = s.cells;
    state.loaded = s.loaded;
    origin = s.origin;
    update();
  }

  // ---- rendering --------------------------------------------------------------------------

  const strip = ui.createStrip($('strip'), {
    onChange(cells, meta) {
      // A snapshot of another layout (possible if the layout changed during
      // a drag) would corrupt the history, so only same-length ones are kept.
      if (meta.commit && meta.previous !== undefined && meta.previous !== cells && meta.previous.length === cells.length) {
        record(Object.assign(snapshot(), { cells: meta.previous }));
      }
      state.cells = cells;
      // Edited by hand: taking the last bar off leaves an empty strip again.
      if (meta.commit) state.loaded = false;
      update();
    },
  });

  function hint(d) {
    if (isEmpty()) {
      return t('Start at cell 7, right after the fixed start pattern. Drag to fill several cells; keys 1 and 0 type bars and gaps.');
    }
    const problem = d.issues[0];
    if (problem && problem.code === 'blank') return t('Cell {cell} should always be empty.', { cell: problem.cell });
    if (problem && problem.code === 'parity') return t('The parity check fails: one bar is probably misread. See the suggestions below.');
    if (problem) return t('Not a valid code yet: see below.');
    if (d.part1 === 0) return t('Part 1 is 0. This is unlikely.');
    if (d.frame === null) return t('Valid code. No frame number present.');
    if (codec.shortCodeInLong(state.cells)) return t('Valid code, unless your top row has only 7 thin bars: see below.');
    return t('Valid code. Frame {frame}.', { frame: d.frameLabel });
  }

  function setPressed(group, value) {
    for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }

  // What the result shows: the code, and the way in while the strip is empty.
  // The film look and Mirror change neither, so the result stays as it is,
  // with any list opened in it.
  let resultShown = '';

  function update(options) {
    // Keyboard focus in the strip or the bar above it, which may be drawn anew.
    const focused = document.activeElement;
    const focusedCell = $('strip').contains(focused) ? focused.dataset.cell : undefined;
    const focusedBar = $('source').contains(focused);
    const decoded = codec.decode(state.cells, state.format);
    // A photo's barcode lines up over the strip only in the layout it was read in.
    const lined = origin && origin.lined && origin.format === state.format ? origin.lined : null;
    strip.render(Object.assign({}, state, { decoded, empty: isEmpty(), photo: lined }));
    if (options && options.develop) strip.develop();
    setPressed(document.querySelector('[data-control="format"]'), state.format);
    setPressed(document.querySelector('[data-control="look"]'), state.look);
    $('mirror-toggle').setAttribute('aria-pressed', String(state.mirrored));
    for (const b of document.querySelectorAll('.inline-button')) b.setAttribute('aria-pressed', $(b.dataset.for).getAttribute('aria-pressed'));
    // aria-disabled rather than disabled, so keyboard focus stays on the button.
    $('undo').setAttribute('aria-disabled', String(past.length === 0));
    $('redo').setAttribute('aria-disabled', String(future.length === 0));
    // A live region: rewritten only when its words change, so they are read out once.
    const text = hint(decoded);
    if ($('hint').textContent !== text) $('hint').textContent = text;
    renderSource();
    // The folded reader says its photo's code is on the strip: once another
    // code (or none) is there, it shows its steps again.
    if (photo && (!origin || origin.kind !== 'photo')) photo.unfold();
    const shown = `${state.format}:${state.cells}:${isEmpty() ? way : ''}`;
    if (shown !== resultShown) {
      resultShown = shown;
      const result = $('result');
      const hadFocus = result.contains(document.activeElement);
      ui.renderResult(result, {
        decoded,
        empty: isEmpty(),
        lookup,
        examples: examples(),
        shareUrl: shareUrl(decoded),
        way,
        onLoadExample: (ex) => loadCode(ex.code, { look: ex.look, format: ex.format || 'long', origin: { kind: 'example', label: ex.label } }),
        onApplyCells(cells) {
          record();
          state.cells = cells;
          state.loaded = true;
          update({ develop: true });
        },
        onUseShort(cells) {
          record();
          state.format = 'short';
          state.cells = cells;
          state.loaded = true;
          update({ develop: true });
        },
      });
      // A button used in the result (a correction, an example) is gone with
      // the old result: carry on at the new one's heading.
      if (hadFocus && !result.contains(document.activeElement)) $('result-title').focus({ preventScroll: true });
    }
    // The cell or button that had focus went with the old strip or bar: carry on
    // at the same cell, or at the bar's first button (Undo, if the bar went).
    if (focused !== document.body && !document.contains(focused)) {
      const again = focusedCell !== undefined
        ? $('strip').querySelector(`.track--data button.cell--edit[data-cell="${focusedCell}"]`) || $('strip').querySelector('.track--data .cell--edit')
        : focusedBar ? $('source').querySelector('button') || $('undo') : null;
      if (again) again.focus({ preventScroll: true });
    }
    syncUrl(decoded);
  }

  /** Put a code on the strip (in the current layout unless one is given) and bring the strip into view. */
  function loadCode(code, options) {
    const format = (options && options.format) || state.format;
    const cells = codec.encode(code, format);
    const from = options && options.origin;
    // The same code from the same place again changes nothing, so there is nothing to undo.
    const same = state.loaded && state.format === format && state.cells === cells && Boolean(origin) && Boolean(from) &&
      origin.kind === from.kind && origin.cells === cells && origin.label === originLabel(from, cells, format);
    if (!same) {
      record();
      state.format = format;
      state.cells = cells;
      state.loaded = true;
      setOrigin(from);
    }
    if (options && options.look) {
      state.look = options.look;
      savePrefs();
    }
    update({ develop: !same });
    if (!options || options.scroll !== false) {
      $('lighttable').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }

  // ---- toolbar ----------------------------------------------------------------------------

  function bindToolbar() {
    document.querySelector('[data-control="format"]').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b || b.dataset.value === state.format) return;
      record();
      state.cells = codec.transplant(state.cells, state.format, b.dataset.value);
      state.format = b.dataset.value;
      update();
    });
    document.querySelector('[data-control="look"]').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b) return;
      state.look = b.dataset.value;
      savePrefs();
      update();
    });
    $('mirror-toggle').addEventListener('click', () => {
      state.mirrored = !state.mirrored;
      savePrefs();
      update();
    });
    $('undo').addEventListener('click', () => restore(past, future));
    $('redo').addEventListener('click', () => restore(future, past));
    $('clear').addEventListener('click', () => {
      if (isEmpty()) return;
      record();
      origin = null;
      state.cells = emptyCells(state.format);
      state.loaded = false;
      update();
    });

    for (const dot of document.querySelectorAll('[data-help]')) {
      dot.addEventListener('click', () => {
        const panel = $(dot.getAttribute('aria-controls'));
        const open = dot.getAttribute('aria-expanded') !== 'true';
        dot.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); restore(past, future); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); restore(future, past); }
    });
  }

  // ---- two ways in: copy the bars, or read a photo ----------------------------------------

  // The photo reader (js/dx-image.js and js/ui-photo.js) is loaded the first
  // time it is opened, or about to be: most visits don't use it.
  let photo = null;
  let photoLoading = null;
  let way = 'copy';
  let ready = false; // set once start() has drawn the page

  /** Classic scripts, run in the order given as if they had been in the page (also from file://). */
  function loadScripts(srcs) {
    return Promise.all(srcs.map((src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${src} could not be loaded`));
      document.head.append(script);
    })));
  }

  /** The photo reader, loaded and set up the first time. */
  function photoReader() {
    if (!photoLoading) {
      photoLoading = loadScripts(['js/dx-image.js', 'js/ui-photo.js']).then(() => {
        photo = ui.createPhoto($('photo'), photoHooks);
        return photo;
      });
      photoLoading.catch(() => { photoLoading = null; }); // choosing the tab again tries again
    }
    return photoLoading;
  }

  /** Show the steps for copying by hand, or the photo reader, above the strip. */
  function setWay(next, options) {
    way = next;
    for (const tab of document.querySelectorAll('.ways [role="tab"]')) {
      const on = tab.id === `tab-${way}`;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    $('way-copy').hidden = way !== 'copy';
    $('photo').hidden = way !== 'photo';
    if (way === 'photo') {
      photoReader().then((reader) => {
        if (way === 'photo') reader.open(options);
      }, () => {
        if (way === 'photo') $('photo').replaceChildren(DX.dom.h('p', { class: 'form-message is-error' }, t('The photo reader could not be loaded. Choose “Read a photo” to try again.')));
      });
    } else if (photo) {
      photo.close();
    }
    if (ready) update(); // the empty result's heading follows the way in
  }

  function bindWays() {
    const tabs = [$('tab-copy'), $('tab-photo')];
    $('tab-copy').prepend(DX.dom.icon('pencil'));
    $('tab-photo').prepend(DX.dom.icon('photo'));
    for (const tab of tabs) tab.addEventListener('click', () => setWay(tab.id.slice(4)));
    // The reader starts loading as the pointer or focus comes to its tab.
    for (const type of ['pointerenter', 'focus']) $('tab-photo').addEventListener(type, () => photoReader().catch(() => {}), { once: true });
    // Arrow keys, Home and End move between the tabs and choose them.
    $('tab-copy').parentElement.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (i < 0 || next === undefined) return;
      e.preventDefault();
      const tab = tabs[(next + tabs.length) % tabs.length];
      tab.focus();
      setWay(tab.id.slice(4));
    });
  }

  // ---- where the code came from ----------------------------------------------------------

  // The bar above the strip says where its code came from (ui-source.js):
  // { kind, label, use, format, cells }, plus a photo's thumbnail, its
  // barcode lined up for the strip and what the reader needs to show it again
  // (kept); null for a code copied by hand.
  let origin = null;
  let originUses = 0;
  let sourceShown = '';

  /** Note where the code now on the strip came from: { kind, name } or { kind, label }, or nothing. */
  function setOrigin(from) {
    if (!from) {
      origin = null;
      return;
    }
    origin = Object.assign({}, from, { label: originLabel(from, state.cells, state.format), use: ++originUses, format: state.format, cells: state.cells });
  }

  /** What the bar says a code from `from` is: its label, or its name and frame. */
  function originLabel(from, cells, format) {
    const d = codec.decode(cells, format);
    return from.label || (d.frame === null ? from.name : t('{name}, frame {frame}', { name: from.name, frame: d.frameLabel }));
  }

  /** "Back to …": the place the code came from, with focus where to carry on. */
  function goBack(kind) {
    if (kind === 'photo') {
      // The photo this code came from, also when the reader has moved on to another.
      setWay('photo', { focus: true, kept: origin && origin.kind === 'photo' ? origin.kept : null });
      return;
    }
    const target = $({ finder: 'finder-q', cassette: 'cassette-code', list: 'codes-title' }[kind]);
    if (target.tagName !== 'INPUT') target.tabIndex = -1; // the code list's heading
    target.closest('section').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    target.focus({ preventScroll: true });
  }

  function renderSource() {
    const edited = Boolean(origin) && (origin.format !== state.format || origin.cells !== state.cells);
    const key = origin ? `${origin.use}:${edited}` : '';
    if (key === sourceShown) return;
    sourceShown = key;
    const kind = origin && origin.kind;
    ui.renderSource($('source'), origin, {
      edited,
      onBack: () => goBack(kind),
      onRemove() {
        if (kind === 'photo') photo.forget(origin.kept.picture);
        // Undo does not bring back what was removed: a photo, in none of its uses.
        const photoOf = (o) => (o && o.kind === 'photo' ? o.kept.picture : null);
        const removed = photoOf(origin);
        for (const s of past.concat(future)) {
          if (s.origin === origin || (removed && photoOf(s.origin) === removed)) s.origin = null;
        }
        origin = null;
        update();
        $(`tab-${way}`).focus();
      },
    });
  }

  // ---- phones: a shorter top of the page ------------------------------------------------

  /**
   * On phones the introduction folds away with the chevron by the title (kept
   * for later visits; js/prepaint.js applies it before first paint), and the
   * copying steps show their titles until "How to copy the bars" opens them.
   */
  function bindCompact() {
    const toggle = $('intro-toggle');
    const paint = () => {
      const shown = document.documentElement.dataset.intro !== 'hidden';
      toggle.setAttribute('aria-expanded', String(shown));
      toggle.setAttribute('aria-label', shown ? t('Hide the introduction') : t('Show the introduction'));
    };
    toggle.append(DX.dom.icon('chevron'));
    toggle.addEventListener('click', () => {
      const hide = document.documentElement.dataset.intro !== 'hidden';
      if (hide) document.documentElement.dataset.intro = 'hidden';
      else delete document.documentElement.dataset.intro;
      try { localStorage.setItem('dx-intro', hide ? 'hidden' : 'shown'); } catch (e) { /* ignore */ }
      paint();
    });
    paint();

    const more = $('steps-more');
    more.append(DX.dom.icon('chevron'));
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open));
      $('way-copy').classList.toggle('is-open', open);
    });
  }

  // ---- start --------------------------------------------------------------------------------

  function start() {
    i18n.applyLanguage(document);
    // Choosing a language reloads the page from its URL, so write any pending change first.
    ui.bindHeader({ beforeLanguageChange: flushUrl });
    loadPrefs();
    const fromUrl = codeFromUrl();
    if (fromUrl) Object.assign(state, fromUrl);
    bindToolbar();
    // A button named in running text ("turn on Mirror") works the one it names,
    // and pressed again turns it back off: "7 thin bars" goes back to the other layout.
    for (const b of document.querySelectorAll('.inline-button')) {
      b.addEventListener('click', () => {
        const target = $(b.dataset.for);
        const choice = target.closest('.segmented');
        if (choice && target.getAttribute('aria-pressed') === 'true') choice.querySelector('button[aria-pressed="false"]').click();
        else target.click();
      });
    }
    bindCompact();
    // Leaving or hiding the page writes a pending URL change at once.
    addEventListener('pagehide', flushUrl);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushUrl();
    });
    // Back and Forward between places on the page (the header's links) only
    // scroll, so the address they bring back gets the strip's code again.
    addEventListener('popstate', () => writeUrl());

    bindWays();
    setWay('copy');

    // Every "Show" button asks for a frame, which only the 31-cell layout has.
    // The page scrolls to the strip; focus goes along, to the result's heading.
    const show = (code, from) => {
      loadCode(code, { format: 'long', origin: from });
      $('result-title').focus({ preventScroll: true });
    };
    ui.createFinder($('finder-ui'), { lookup, onShow: show });
    ui.createCassette($('cassette-ui'), { lookup, onShow: show });
    // The code list holds most of the page's elements: built just after the
    // page is drawn, so that it doesn't hold up the decoder.
    const later = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 1));
    later(() => ui.createReference($('reference-ui'), { lookup, onShow: show }));

    // Read-only diagram for "How it works".
    ui.createStrip($('layout-figure'), { interactive: false }).render({
      format: 'long',
      cells: codec.encode({ part1: 79, part2: 15, frame: 23, half: false }, 'long'),
      look: 'negative',
    });

    update({ develop: Boolean(fromUrl && fromUrl.loaded) });
    ready = true;
  }

  /** What the photo reader calls back: a code to use, and its "Open the photo". */
  const photoHooks = {
    lookup,
    onApply(cells, format, polarity, shot) {
      record();
      state.format = format;
      state.cells = standardEnds(cells, format);
      state.loaded = true;
      // Clear bars on a dark edge are slide film; dark bars are not, so a
      // Slide look from before gives way to the negative.
      const look = polarity === 'light' ? 'slide' : state.look === 'slide' ? 'negative' : null;
      if (look) {
        state.look = look;
        savePrefs();
      }
      setOrigin(Object.assign({ kind: 'photo' }, shot));
      // The reader folds up; the bar above the strip keeps the photo in sight.
      photo.fold();
      update({ develop: true });
      $('lighttable').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      // The button that had focus is gone: continue at the result.
      $('result-title').focus({ preventScroll: true });
    },
    onOpen: () => goBack('photo'),
  };

  // The language file js/prepaint.js asked for may still be on its way.
  i18n.ready.then(start);
})();
