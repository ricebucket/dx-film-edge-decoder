/*
 * Loaded without defer at the top of every page: applies the saved theme and
 * folded introduction (phones), and settles the page's language, before
 * first paint, to avoid a flash. The language is not saved: see `choose`.
 *
 * Below is the list of languages besides English, each a file in js/i18n/.
 * index.html loads only the file of the language it is shown in, and its
 * language menu lists them all. Each also gives, in that language, what the
 * page says when that file is slow to come (`waiting`), and the button that
 * shows the page in English instead (`english`).
 */
(function (root, languages) {
  'use strict';
  /**
   * The language a page is shown in, as its code: the one its address names
   * (?lang=), if the page has it; else the first of the browser's own
   * languages that the page has, by its whole tag or else by its first part
   * ("zh", "zh-TW" and "zh-Hans" all get the page's Chinese); else English.
   * Case does not matter. The browser keeps nothing about it: the decoder's
   * address names the language from then on (js/app.js), and choosing one in
   * the menu opens the page with it in the address (js/i18n.js).
   */
  function choose(named, preferred) {
    const codes = ['en', ...languages.map((l) => l.code)];
    const whole = (tag) => codes.find((code) => code.toLowerCase() === String(tag).toLowerCase());
    const first = (tag) => String(tag).split('-')[0].toLowerCase();
    if (named && whole(named)) return whole(named);
    for (const tag of preferred || []) {
      const code = tag && (whole(tag) || codes.find((c) => first(c) === first(tag)));
      if (code) return code;
    }
    return 'en';
  }
  // scripts/check-languages.mjs compares the list with the files.
  if (typeof module === 'object' && module.exports) {
    module.exports = { languages, choose };
    return;
  }
  (root.DX = root.DX || {}).languages = languages;
  // A published copy loads its scripts as "js/…?v=<build>" (scripts/stamp-build.mjs).
  // Files loaded later ask for the same build, rather than what a browser
  // kept of an earlier one.
  const v = document.currentScript ? new URL(document.currentScript.src).searchParams.get('v') : null;
  root.DX.query = v ? `?v=${encodeURIComponent(v)}` : '';
  let theme = null;
  let intro = null;
  try {
    theme = localStorage.getItem('dx-theme');
    intro = localStorage.getItem('dx-intro');
    // The language was saved here once: no longer read, and taken out where it is found.
    localStorage.removeItem('dx-lang');
  } catch (e) { /* storage unavailable: follow the system theme */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (intro === 'hidden') document.documentElement.dataset.intro = 'hidden';

  // Only a page whose text js/i18n.js puts in, with its title marked data-i18n
  // as in index.html, gets its language here. The sources page is written in
  // each language (sources.html, sources.zh-CN.html …) and shows at once.
  if (!document.querySelector('title[data-i18n]')) return;
  // js/i18n.js takes the page's language from here.
  root.DX.language = choose(new URLSearchParams(location.search).get('lang'), navigator.languages || [navigator.language]);
  const lang = languages.find((l) => l.code === root.DX.language);
  if (!lang) return; // English
  // Its file loads alongside the page's other scripts: js/i18n.js takes it in
  // whichever comes first, and app.js starts the page once it is there (or
  // has failed to load, and the page is in English).
  const html = document.documentElement;
  const script = document.createElement('script');
  script.src = `js/i18n/${lang.code}.js${root.DX.query}`;
  script.fetchPriority = 'high'; // the page waits for it, so ahead of the other scripts
  let settle = null;
  root.DX.languageLoaded = new Promise((resolve) => {
    settle = resolve;
    script.onload = resolve;
    script.onerror = resolve;
  });
  document.head.append(script);
  // Hidden until js/i18n.js has put in that language's text. After 3 s
  // without it, a note in that language says so, with a button that shows
  // the page in English instead: app.js then starts it so, and the file is
  // not used if it comes after.
  html.lang = lang.code;
  html.setAttribute('data-i18n-pending', '');
  const waiting = () => html.hasAttribute('data-i18n-pending');
  setTimeout(() => {
    if (!waiting()) return;
    const note = document.createElement('div');
    note.className = 'language-wait';
    note.setAttribute('role', 'status');
    const text = document.createElement('p');
    text.textContent = lang.waiting;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool';
    button.textContent = lang.english;
    button.addEventListener('click', () => {
      html.lang = 'en';
      html.removeAttribute('data-i18n-pending');
      settle();
    });
    note.append(text, button);
    (document.body || html).append(note);
    // Gone as the page shows, in either language.
    const shown = new MutationObserver(() => {
      if (waiting()) return;
      note.remove();
      shown.disconnect();
    });
    shown.observe(html, { attributeFilter: ['data-i18n-pending'] });
  }, 3000);
})(typeof globalThis !== 'undefined' ? globalThis : this, [
  { code: 'zh-CN', name: '简体中文', waiting: '正在加载中文界面……', english: '改用英文显示' },
]);
