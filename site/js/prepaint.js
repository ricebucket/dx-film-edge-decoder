/*
 * Loaded without defer at the top of every page: applies the saved theme,
 * language and folded introduction (phones) before first paint, to avoid a
 * flash. A language in the URL (?lang=) wins over the saved one, if the page
 * has it.
 *
 * Below is the list of languages besides English, each a file in js/i18n/.
 * index.html loads only the file of the language it is shown in, and its
 * language menu lists them all.
 */
(function (root, languages) {
  'use strict';
  // scripts/check-languages.mjs compares the list with the files.
  if (typeof module === 'object' && module.exports) {
    module.exports = { languages };
    return;
  }
  (root.DX = root.DX || {}).languages = languages;
  let theme = null;
  let intro = null;
  let saved = null;
  try {
    theme = localStorage.getItem('dx-theme');
    intro = localStorage.getItem('dx-intro');
    saved = localStorage.getItem('dx-lang');
  } catch (e) { /* storage unavailable: follow the system theme */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (intro === 'hidden') document.documentElement.dataset.intro = 'hidden';

  // Only a page whose text js/i18n.js puts in, with its title marked data-i18n
  // as in index.html, gets its language here. The sources page is written in
  // each language (sources.html, sources.zh-CN.html …) and shows at once.
  if (!document.querySelector('title[data-i18n]')) return;
  const listed = (code) => code && (code.toLowerCase() === 'en' ? { code: 'en' } : languages.find((l) => l.code.toLowerCase() === code.toLowerCase()));
  const lang = listed(new URLSearchParams(location.search).get('lang')) || listed(saved);
  if (!lang || lang.code === 'en') return;
  // Its file loads alongside the page's other scripts: js/i18n.js takes it in
  // whichever comes first, and app.js starts the page once it is there (or
  // has failed to load, and the page is in English).
  const script = document.createElement('script');
  script.src = `js/i18n/${lang.code}.js`;
  root.DX.languageLoaded = new Promise((resolve) => {
    script.onload = resolve;
    script.onerror = resolve;
  });
  document.head.append(script);
  // Hidden until js/i18n.js has put in that language's text, or after 3 s
  // regardless, then in English and marked so.
  document.documentElement.lang = lang.code;
  document.documentElement.setAttribute('data-i18n-pending', '');
  setTimeout(() => {
    if (!document.documentElement.hasAttribute('data-i18n-pending')) return;
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-i18n-pending');
  }, 3000);
})(typeof globalThis !== 'undefined' ? globalThis : this, [
  { code: 'zh-CN', name: '简体中文' },
]);
