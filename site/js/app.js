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
  // Zint's test vector for the older 23-cell layout (79-7).
  const EXAMPLES = [
    { label: t('{film}, frame {frame}', { film: 'Kodak BW400CN', frame: '23' }), code: { part1: 79, part2: 15, frame: 23, half: false } },
    { label: t('{film}, frame {frame}', { film: 'Perutz Primera 200', frame: '22A' }), code: { part1: 47, part2: 1, frame: 22, half: true } },
    { label: t('{film}, frame {frame}', { film: 'Ilford HP5 Plus', frame: '12' }), code: { part1: 109, part2: 9, frame: 12, half: false }, look: 'bw' },
    { label: t('{film}, frame {frame}', { film: 'Fujichrome Velvia 50', frame: '5A' }), code: { part1: 32, part2: 6, frame: 5, half: true }, look: 'slide' },
    { label: t('{film}, older 7-bar code', { film: 'Kodacolor VR200' }), code: { part1: 79, part2: 7 }, format: 'short' },
  ];

  const emptyCells = (format) =>
    codec.layout(format).map((c) => (c.fixed === null ? '0' : String(c.fixed))).join('');

  /** The start and stop cells are not editable, so always keep them standard. */
  const standardEnds = (cells, format) =>
    codec.layout(format).map((c) => (c.editable ? cells[c.cell - 1] : String(c.fixed))).join('');

  const scrollBehavior = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  const state = { format: 'long', cells: emptyCells('long'), mirrored: false, look: 'negative' };
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
      if (frameText === undefined) return { format: 'short', cells: codec.encode(parsed, 'short') };
      const frame = codec.parseFrameLabel(frameText);
      if (!frame) return null;
      return { format: 'long', cells: codec.encode(Object.assign({}, parsed, frame), 'long') };
    }
    const bits = params.get('bits');
    if (bits && /^[01]+$/.test(bits)) {
      const format = bits.length === 31 ? 'long' : bits.length === 23 ? 'short' : null;
      if (format) {
        return { format, cells: standardEnds(bits, format) };
      }
    }
    return null;
  }

  function stateQuery(decoded) {
    const empty = state.cells === emptyCells(state.format);
    if (empty) return '';
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

  function snapshot() {
    return { format: state.format, cells: state.cells };
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
    update();
  }

  // ---- rendering --------------------------------------------------------------------------

  const strip = ui.createStrip($('strip'), {
    onChange(cells, meta) {
      // A snapshot of another layout (possible if the layout changed during
      // a drag) would corrupt the history, so only same-length ones are kept.
      if (meta.commit && meta.previous !== undefined && meta.previous !== cells && meta.previous.length === cells.length) {
        record({ format: state.format, cells: meta.previous });
      }
      state.cells = cells;
      update();
    },
  });

  function hint(d) {
    if (state.cells === emptyCells(state.format)) {
      return t('Start right after the fixed start pattern: cells 7 to 13 hold Part 1. Drag across cells to fill several at once; keys 1 and 0 type bars and gaps.');
    }
    const problem = d.issues.find((i) => i.code !== 'part1-zero');
    if (problem && problem.code === 'blank') return t('Cell {cell} is never used: if you see a bar there, the copy is shifted by one cell.', { cell: problem.cell });
    if (problem && problem.code === 'parity') return t('The parity check fails: one bar is probably misread. See the suggestions below.');
    if (problem) return t('The code does not pass its checks yet: see below.');
    if (d.part1 === 0) return t('Part 1 is still 0: add the bars of cells 7 to 13.');
    if (d.frame === null) return t('Valid code. The 23-cell layout carries no frame number.');
    if (codec.shortCodeInLong(state.cells)) return t('Valid code, unless the top row of your film has only 7 thin bars: see below.');
    return t('Valid code. On your film, the number printed just before this barcode should read {frame}.', { frame: d.frameLabel });
  }

  function setPressed(group, value) {
    for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }

  function update(options) {
    const decoded = codec.decode(state.cells, state.format);
    // A photo's barcode lines up over the strip only in the layout it was read in.
    const lined = origin && origin.lined && origin.format === state.format ? origin.lined : null;
    strip.render(Object.assign({}, state, { decoded, photo: lined }));
    if (options && options.develop) strip.develop();
    setPressed(document.querySelector('[data-control="format"]'), state.format);
    setPressed(document.querySelector('[data-control="look"]'), state.look);
    $('mirror-toggle').setAttribute('aria-pressed', String(state.mirrored));
    // aria-disabled rather than disabled, so keyboard focus stays on the button.
    $('undo').setAttribute('aria-disabled', String(past.length === 0));
    $('redo').setAttribute('aria-disabled', String(future.length === 0));
    $('hint').textContent = hint(decoded);
    renderSource();
    ui.renderResult($('result'), {
      decoded,
      lookup,
      examples: EXAMPLES,
      shareUrl: shareUrl(decoded),
      way,
      onLoadExample: (ex) => loadCode(ex.code, { look: ex.look, format: ex.format || 'long', origin: { kind: 'example', label: ex.label } }),
      onApplyCells(cells) {
        record();
        state.cells = cells;
        update({ develop: true });
      },
      onUseShort(cells) {
        record();
        state.format = 'short';
        state.cells = cells;
        update({ develop: true });
      },
    });
    syncUrl(decoded);
  }

  /** Put a code on the strip (in the current layout unless one is given) and bring the strip into view. */
  function loadCode(code, options) {
    record();
    if (options && options.format) state.format = options.format;
    state.cells = codec.encode(code, state.format);
    if (options && options.look) {
      state.look = options.look;
      savePrefs();
    }
    setOrigin(options && options.origin);
    update({ develop: true });
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
      if (state.cells === emptyCells(state.format)) return;
      record();
      origin = null;
      state.cells = emptyCells(state.format);
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

  let photo = null; // the photo reader (ui-photo.js), created in start()
  let way = 'copy';
  let ready = false; // set once start() has drawn the page

  /** Show the steps for copying by hand, or the photo reader, above the strip. */
  function setWay(next, options) {
    way = next;
    for (const tab of document.querySelectorAll('.ways [role="tab"]')) {
      const on = tab.id === `tab-${way}`;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    $('way-copy').hidden = way !== 'copy';
    if (way === 'photo') photo.open(options);
    else photo.close();
    if (ready) update(); // the empty result's heading follows the way in
  }

  function bindWays() {
    const tabs = [$('tab-copy'), $('tab-photo')];
    $('tab-copy').prepend(DX.dom.icon('pencil'));
    $('tab-photo').prepend(DX.dom.icon('photo'));
    for (const tab of tabs) tab.addEventListener('click', () => setWay(tab.id.slice(4)));
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
  // { kind, label, use, format, cells }, plus a photo's thumbnail and its
  // barcode lined up for the strip; null for a code copied by hand.
  let origin = null;
  let originUses = 0;
  let sourceShown = '';

  /** Note where the code now on the strip came from: { kind, name } or { kind, label }, or nothing. */
  function setOrigin(from) {
    if (!from) {
      origin = null;
      return;
    }
    const d = codec.decode(state.cells, state.format);
    const label = from.label || (d.frame === null ? from.name : t('{name}, frame {frame}', { name: from.name, frame: d.frameLabel }));
    origin = Object.assign({}, from, { label, use: ++originUses, format: state.format, cells: state.cells });
  }

  /** "Back to …": the place the code came from, with focus where to carry on. */
  function goBack(kind) {
    if (kind === 'photo') {
      setWay('photo', { focus: true });
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
        if (kind === 'photo') photo.reset();
        origin = null;
        update();
        $(`tab-${way}`).focus();
      },
    });
  }

  // ---- phones: a shorter top of the page ------------------------------------------------

  /**
   * On phones the introduction folds away with the chevron by the title (kept
   * for later visits; index.html applies it before first paint), and the
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

  // ---- theme ------------------------------------------------------------------------------

  function bindTheme() {
    const button = $('theme-toggle');
    const media = matchMedia('(prefers-color-scheme: dark)');
    const current = () => document.documentElement.dataset.theme || (media.matches ? 'dark' : 'light');
    const paint = () => {
      const dark = current() === 'dark';
      button.replaceChildren(DX.dom.icon(dark ? 'sun' : 'moon'));
      button.setAttribute('aria-label', dark ? t('Switch to light theme') : t('Switch to dark theme'));
    };
    button.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('dx-theme', next); } catch (e) { /* ignore */ }
      paint();
    });
    media.addEventListener('change', paint);
    paint();
  }

  // ---- language -----------------------------------------------------------------------------

  function bindLanguage() {
    const select = $('lang-select');
    for (const lang of i18n.languages) {
      select.append(DX.dom.h('option', { value: lang.code, lang: lang.code, selected: lang.code === i18n.current }, lang.name));
    }
    select.before(DX.dom.icon('globe', 'lang-picker__globe'));
    select.after(DX.dom.icon('chevron', 'lang-picker__chevron'));
    select.addEventListener('change', () => {
      // The page reloads from its URL, so write any pending change first.
      flushUrl();
      i18n.select(select.value);
    });
  }

  // ---- start --------------------------------------------------------------------------------

  function start() {
    i18n.applyLanguage(document);
    bindLanguage();
    loadPrefs();
    const fromUrl = codeFromUrl();
    if (fromUrl) Object.assign(state, fromUrl);
    bindToolbar();
    bindTheme();
    bindCompact();
    // Leaving or hiding the page writes a pending URL change at once.
    addEventListener('pagehide', flushUrl);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushUrl();
    });

    photo = ui.createPhoto($('photo'), {
      lookup,
      onApply(cells, format, look, shot) {
        record();
        state.format = format;
        state.cells = standardEnds(cells, format);
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
    });
    bindWays();
    setWay('copy');

    // Every "Show" button asks for a frame, which only the 31-cell layout has.
    const show = (code, from) => loadCode(code, { format: 'long', origin: from });
    ui.createFinder($('finder-ui'), { lookup, onShow: show });
    ui.createCassette($('cassette-ui'), { lookup, onShow: show });
    ui.createReference($('reference-ui'), { lookup, onShow: show });

    // Read-only diagram for "How it works".
    ui.createStrip($('layout-figure'), { interactive: false }).render({
      format: 'long',
      cells: codec.encode({ part1: 79, part2: 15, frame: 23, half: false }, 'long'),
      look: 'negative',
    });

    update({ develop: Boolean(fromUrl) });
    ready = true;
  }

  start();
})();
