/*
 * The header's controls on every page: the theme button and the language
 * menu. index.html gets its text from js/i18n.js, and choosing a language
 * reloads it in that language. The sources page is written once per language
 * instead (sources.html in English, sources.zh-CN.html in Chinese), with its
 * menu in its HTML, and choosing a language opens its version in that
 * language. index.html's links to it lead to the version in the language
 * shown.
 */
(function (root) {
  'use strict';
  const { h, icon } = root.DX.dom;

  // The pages written once per language, and the file of each version.
  const PER_LANGUAGE = ['sources'];
  const fileIn = (page, code) => (code === 'en' ? `${page}.html` : `${page}.${code}.html`);

  function bindTheme(button) {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const current = () => document.documentElement.dataset.theme || (media.matches ? 'dark' : 'light');
    // The browser bar's color: the chosen theme's, or the system's.
    const bars = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => ({ meta, media: meta.getAttribute('media') }));
    const barColor = (theme) => bars.find((b) => b.media.includes(theme)).meta.getAttribute('content');
    const colors = { light: barColor('light'), dark: barColor('dark') };
    const paint = () => {
      const dark = current() === 'dark';
      const chosen = document.documentElement.dataset.theme;
      for (const b of bars) {
        if (chosen) b.meta.removeAttribute('media');
        else b.meta.setAttribute('media', b.media);
        b.meta.setAttribute('content', chosen ? colors[chosen] : colors[b.media.includes('dark') ? 'dark' : 'light']);
      }
      button.replaceChildren(icon(dark ? 'sun' : 'moon'));
      // Both names are in the page, in its language: data-to-light and data-to-dark.
      button.setAttribute('aria-label', dark ? button.dataset.toLight : button.dataset.toDark);
    };
    button.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('dx-theme', next); } catch (e) { /* ignore */ }
      paint();
    });
    media.addEventListener('change', paint);
    paint();
    return paint;
  }

  /**
   * Call `go` once a language is picked in the menu: at once from the
   * system's list or with a pointer, but not while arrow or letter keys step
   * through the closed menu, which some systems change at once (WCAG 3.2.2).
   * There, Enter goes, and leaving the menu puts back the language shown.
   */
  function onPick(select, shown, go) {
    let stepped = -Infinity;
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (select.value !== shown) {
          e.preventDefault();
          go();
        }
      } else if (!e.altKey && !e.ctrlKey && !e.metaKey && (/^(Arrow|Page)|^(Home|End)$/.test(e.key) || e.key.length === 1)) {
        stepped = performance.now();
      }
    });
    // A change straight after such a key comes from the key, not from a list.
    select.addEventListener('change', () => {
      if (performance.now() - stepped > 100) go();
    });
    select.addEventListener('blur', () => {
      if (select.value !== shown) select.value = shown;
    });
  }

  /** On index.html, every language listed in js/prepaint.js; choosing one reloads the page in it. */
  function bindLanguage(select, beforeChange) {
    const i18n = root.DX.i18n;
    for (const lang of i18n.available()) {
      select.append(h('option', { value: lang.code, lang: lang.code, selected: lang.code === i18n.current }, lang.name));
    }
    onPick(select, i18n.current, () => {
      if (beforeChange) beforeChange();
      i18n.select(select.value);
    });
    for (const a of document.querySelectorAll('a[href]')) {
      const [, page, hash = ''] = /^([\w-]+)\.html(#.*)?$/.exec(a.getAttribute('href')) || [];
      if (PER_LANGUAGE.includes(page)) a.setAttribute('href', fileIn(page, i18n.current) + hash);
    }
  }

  /**
   * On a page written once per language, choosing a language saves it, as on
   * index.html, and opens the page's version in it at the same place.
   */
  function bindVersions(select, page) {
    onPick(select, select.value, () => {
      try { localStorage.setItem('dx-lang', select.value); } catch (e) { /* storage blocked: each version links to index.html in its language */ }
      location.replace(fileIn(page, select.value) + location.hash);
    });
  }

  /**
   * Wire the header. index.html passes `beforeLanguageChange`, which runs just
   * before choosing a language reloads the page; a page written once per
   * language passes its name as `page`.
   */
  function bindHeader(options = {}) {
    const select = document.getElementById('lang-select');
    if (options.page) bindVersions(select, options.page);
    else bindLanguage(select, options.beforeLanguageChange);
    select.before(icon('globe', 'lang-picker__globe'));
    select.after(icon('chevron', 'lang-picker__chevron'));
    const paintTheme = bindTheme(document.getElementById('theme-toggle'));
    // Back or Forward can bring a page back as it was left, while a theme or
    // a language was chosen since, on another page.
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      let theme = null;
      let lang = null;
      try {
        theme = localStorage.getItem('dx-theme');
        lang = localStorage.getItem('dx-lang');
      } catch (err) {
        return;
      }
      if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
      paintTheme();
      // index.html follows; a page written once per language stays as it is.
      const i18n = root.DX.i18n;
      if (!options.page && lang && lang !== i18n.current && i18n.available().some((l) => l.code === lang)) {
        if (options.beforeLanguageChange) options.beforeLanguageChange();
        i18n.select(lang);
      }
    });
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.bindHeader = bindHeader;
})(globalThis);
