/*
 * Loaded without defer at the top of every page: applies the saved theme,
 * language and folded introduction (phones) before first paint, to avoid a
 * flash. A language in the URL (?lang=) wins over the saved one, if the page
 * has it, except after Back or Forward (below).
 *
 * Below is the list of languages besides English, each a file in js/i18n/.
 * index.html loads only the file of the language it is shown in, and its
 * language menu lists them all. Each also gives, in that language, what the
 * page says when that file is slow to come (`waiting`), and the button that
 * shows the page in English instead (`english`).
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
  let fromUrl = new URLSearchParams(location.search).get('lang');
  // Loaded again by Back or Forward, rather than kept as it was (which
  // Chromium never does for a file): a language chosen since the page was
  // left (js/ui-header.js), on another page, beats the one in its URL, as
  // for a page kept, and the URL changes to match. Built by hand, as in
  // js/i18n.js, so that "/" in ?dx=79-15/23 stays as it is.
  try {
    const visit = performance.getEntriesByType('navigation')[0];
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    const leftAt = Number(state.leftAt) || Number(sessionStorage.getItem(`dx-left:${location.pathname}${location.search}`)) || 0;
    const chosen = listed(saved);
    if (visit && visit.type === 'back_forward' && fromUrl && chosen && chosen.code.toLowerCase() !== fromUrl.toLowerCase()
      && leftAt && Number(localStorage.getItem('dx-lang-at')) > leftAt) {
      const others = location.search.slice(1).split('&').filter((p) => p && !/^lang=/i.test(p));
      history.replaceState(history.state, '', `${location.pathname}?${[...others, `lang=${encodeURIComponent(chosen.code)}`].join('&')}${location.hash}`);
      fromUrl = chosen.code;
    }
  } catch (e) { /* storage or history unavailable: the URL's language */ }
  const lang = listed(fromUrl) || listed(saved);
  if (!lang || lang.code === 'en') return;
  // Its file loads alongside the page's other scripts: js/i18n.js takes it in
  // whichever comes first, and app.js starts the page once it is there (or
  // has failed to load, and the page is in English).
  const html = document.documentElement;
  const script = document.createElement('script');
  script.src = `js/i18n/${lang.code}.js`;
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
