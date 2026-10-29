/*
 * Interface languages. English is the source: the code and the pages are
 * written in English, and every other language is one file in js/i18n/ that
 * registers a dictionary from the English text to its own. Adding a language
 * means adding such a file and a <script> tag for it in each page; the
 * language menu and the tests pick it up from the registry.
 *
 * Text in the code goes through t('English text {name}', { name }). Elements
 * of the pages marked data-i18n get their content in the current language,
 * and data-i18n-attr="aria-label title …" names attributes that do too; in
 * both cases the key is the English text with runs of white space collapsed.
 *
 * Choosing a language saves it in localStorage and reloads the page with the
 * language in the URL (?lang=zh-CN), so links and bookmarks open in it too. A
 * language in the URL wins over the saved one without replacing it. The reload
 * keeps the code on the strip (it is in the URL as well) and the other
 * preferences.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DX = root.DX || {}).i18n = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'dx-lang';

  const ENGLISH = {
    code: 'en',
    name: 'English',
    // Separators used when the code joins pieces of text; `sentence` goes between two sentences.
    punctuation: { comma: ', ', colon: ': ', semicolon: '; ', period: '.', sentence: '. ', space: ' ' },
    strings: {},
  };
  const languages = [ENGLISH];
  let current = ENGLISH;

  function saved() {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null; // storage unavailable: English
    }
  }

  /** The language named in the URL (?lang=), if any. */
  function inUrl() {
    try {
      return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang');
    } catch (e) {
      return null;
    }
  }
  // The URL's language wins over the saved one, but only if the page has it,
  // so a wrong ?lang= falls back to the saved choice. Case does not matter.
  const fromUrl = inUrl();
  const fromStorage = saved();
  const same = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
  const rank = (code) => (same(code, fromUrl) ? 2 : same(code, fromStorage) ? 1 : 0);

  /** Called by each file in js/i18n/. */
  function register(lang) {
    if (languages.some((l) => l.code === lang.code)) throw new Error(`Language ${lang.code} registered twice`);
    languages.push(lang);
    if (rank(lang.code) > rank(current.code)) current = lang;
  }

  const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();

  function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m));
  }

  /**
   * A dictionary entry is a string, or an object of plural forms keyed by
   * Intl.PluralRules categories ({ one, few, many, other }), chosen by params.n.
   */
  function choose(entry, params) {
    if (typeof entry === 'string') return entry;
    const n = params && typeof params.n === 'number' ? params.n : 0;
    return entry[new Intl.PluralRules(current.code).select(n)] || entry.other;
  }

  /** The current language's text for an English source text, with {placeholders} filled from params. */
  function t(text, params) {
    const entry = current.strings[text];
    return fill(entry === undefined ? text : choose(entry, params), params);
  }

  /**
   * English has two forms; other languages give their text for the plural
   * one, as a string or as an object of plural forms.
   */
  function plural(n, one, other, params) {
    const p = Object.assign({ n }, params);
    if (current !== ENGLISH && current.strings[other] !== undefined) return t(other, p);
    return fill(new Intl.PluralRules('en').select(n) === 'one' ? one : other, p);
  }

  const punctuation = () => Object.assign({}, ENGLISH.punctuation, current.punctuation);

  /** "a or b": the language's own list style. */
  function or(items) {
    try {
      return new Intl.ListFormat(current.code, { type: 'disjunction' }).format(items);
    } catch (e) {
      return items.join(' / ');
    }
  }

  /** Put the current language's text into the marked parts of a page. */
  function applyLanguage(doc) {
    doc.documentElement.lang = current.code;
    if (current !== ENGLISH) {
      for (const el of doc.querySelectorAll('[data-i18n]')) {
        const entry = current.strings[normalize(el.innerHTML)];
        if (entry !== undefined) el.innerHTML = entry;
      }
      for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
        for (const name of el.getAttribute('data-i18n-attr').split(/\s+/)) {
          const value = el.getAttribute(name);
          const entry = value === null ? undefined : current.strings[normalize(value)];
          if (entry !== undefined) el.setAttribute(name, entry);
        }
      }
      doc.title = t(normalize(doc.title));
    }
    doc.documentElement.removeAttribute('data-i18n-pending');
  }

  /** Switch the current language without saving or reloading (scripts and tests). */
  function use(code) {
    const lang = languages.find((l) => l.code === code);
    if (lang) current = lang;
    return Boolean(lang);
  }

  /** Save a choice and reload the page in that language, named in the URL. */
  function select(code) {
    if (code === current.code || !languages.some((l) => l.code === code)) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (e) { /* storage blocked: the URL alone keeps the choice */ }
    // The query built by hand (URLSearchParams would escape the "/" in
    // ?dx=79-15/23), on the page's own address, so it can't lead elsewhere.
    const others = location.search.slice(1).split('&').filter((p) => p && !/^lang=/i.test(p));
    const url = new URL(location.href);
    url.search = `?${[...others, `lang=${encodeURIComponent(code)}`].join('&')}`;
    location.replace(url.href);
  }

  return {
    languages,
    register,
    t,
    plural,
    or,
    punctuation,
    normalize,
    applyLanguage,
    use,
    select,
    get current() { return current.code; },
  };
});
