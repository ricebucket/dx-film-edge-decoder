/*
 * Interface languages. English is the source: the code and index.html are
 * written in English, and every other language is one file in js/i18n/ that
 * registers a dictionary from the English text to its own. Adding a language
 * means adding such a file and a <script> tag for it; the language menu and
 * the tests pick it up from the registry.
 *
 * Text in the code goes through t('English text {name}', { name }). Elements
 * of index.html marked data-i18n have their content translated, and
 * data-i18n-attr="aria-label title …" names attributes to translate; in both
 * cases the key is the English text with runs of white space collapsed.
 *
 * The choice is saved in localStorage; changing it reloads the page, which
 * keeps the code on the strip (it is in the URL) and the other preferences.
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
    // Separators used when the code joins translated pieces; `sentence` goes between two sentences.
    punctuation: { comma: ', ', colon: ': ', semicolon: '; ', period: '.', sentence: '. ' },
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
  const wanted = saved();

  /** Called by each file in js/i18n/. */
  function register(lang) {
    if (languages.some((l) => l.code === lang.code)) throw new Error(`Language ${lang.code} registered twice`);
    languages.push(lang);
    if (lang.code === wanted) current = lang;
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

  /** Translate an English source text, filling {placeholders} from params. */
  function t(text, params) {
    const entry = current.strings[text];
    return fill(entry === undefined ? text : choose(entry, params), params);
  }

  /**
   * English has two forms; other languages translate the plural text, as a
   * string or as an object of plural forms.
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

  /** Translate the marked parts of a page (index.html) into the current language. */
  function translatePage(doc) {
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

  /** Save a choice and reload the page in that language. */
  function select(code) {
    if (code === current.code || !languages.some((l) => l.code === code)) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (e) { /* not remembered, but still shown below */ }
    location.reload();
  }

  return {
    languages,
    register,
    t,
    plural,
    or,
    punctuation,
    normalize,
    translatePage,
    use,
    select,
    get current() { return current.code; },
  };
});
