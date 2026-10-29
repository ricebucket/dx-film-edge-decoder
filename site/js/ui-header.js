/*
 * The header's controls on every page: the theme button and the language
 * menu. A language named in the URL also goes along on the links between the
 * site's pages.
 */
(function (root) {
  'use strict';
  const { h, icon } = root.DX.dom;
  const i18n = root.DX.i18n;
  const t = i18n.t;

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

  function bindLanguage(select, beforeChange) {
    for (const lang of i18n.languages) {
      select.append(h('option', { value: lang.code, lang: lang.code, selected: lang.code === i18n.current }, lang.name));
    }
    select.before(icon('globe', 'lang-picker__globe'));
    select.after(icon('chevron', 'lang-picker__chevron'));
    select.addEventListener('change', () => {
      if (beforeChange) beforeChange();
      i18n.select(select.value);
    });
  }

  /**
   * Where storage is blocked the URL is the only place that keeps the
   * language, so it goes along on the links to the site's other pages.
   */
  function keepLanguageInLinks() {
    const lang = new URLSearchParams(location.search).get('lang');
    if (!lang || lang.toLowerCase() !== i18n.current.toLowerCase()) return;
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!/^[\w-]+\.html(#|$)/.test(href)) continue;
      const [file, hash] = href.split('#');
      a.setAttribute('href', `${file}?lang=${encodeURIComponent(i18n.current)}${hash === undefined ? '' : `#${hash}`}`);
    }
  }

  /** Wire the header; `beforeLanguageChange` runs just before choosing a language reloads the page. */
  function bindHeader(options) {
    bindLanguage(document.getElementById('lang-select'), options && options.beforeLanguageChange);
    bindTheme(document.getElementById('theme-toggle'));
    keepLanguageInLinks();
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.bindHeader = bindHeader;
})(globalThis);
