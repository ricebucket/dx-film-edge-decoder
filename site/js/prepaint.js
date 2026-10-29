/*
 * Loaded without defer at the top of every page: applies the saved theme,
 * language and folded introduction (phones) before first paint, to avoid a
 * flash. A language in the URL (?lang=) wins over the saved one.
 */
(function () {
  'use strict';
  let theme = null;
  let intro = null;
  let lang = new URLSearchParams(location.search).get('lang');
  try {
    theme = localStorage.getItem('dx-theme');
    intro = localStorage.getItem('dx-intro');
    lang = lang || localStorage.getItem('dx-lang');
  } catch (e) { /* storage unavailable: follow the system theme */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (intro === 'hidden') document.documentElement.dataset.intro = 'hidden';
  if (lang && lang.toLowerCase() !== 'en') {
    // Hidden until js/i18n.js has put in that language's text (or after 3 s regardless).
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-i18n-pending', '');
    setTimeout(() => document.documentElement.removeAttribute('data-i18n-pending'), 3000);
  }
})();
