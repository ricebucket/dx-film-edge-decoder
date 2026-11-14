/*
 * Interface languages. English is the source: the code and index.html are
 * written in English, and every other language is one file in js/i18n/ that
 * registers a dictionary from the English text to its own. Adding a language
 * means adding such a file and listing it in js/prepaint.js, which loads the
 * file only for a page shown in that language; the language menu lists it
 * from there. The sources page is written once per language instead
 * (sources.html, sources.zh-CN.html …) and loads none of this.
 *
 * Text in the code goes through t('English text {name}', { name }), or
 * i18n.parts() and i18n.plural() for text with elements in it or a count,
 * looked up when it is drawn, never as a script loads: the language file can
 * come in after the scripts (js/prepaint.js), and text looked up before it
 * would stay English. tests/e2e/i18n.spec.cjs holds the file back to catch
 * that.
 *
 * Elements of the page marked data-i18n get their content in the current
 * language, and data-i18n-attr="aria-label title …" names attributes that do
 * too; in both cases the key is the English text with runs of white space
 * collapsed.
 *
 * Which language a page is shown in is settled by js/prepaint.js before first
 * paint: the one its URL names (?lang=zh-CN), else the browser's own, else
 * English. Choosing a language reloads the page with that language in the
 * URL, so links and bookmarks open in it too; nothing is saved in the
 * browser. The reload keeps the code on the strip (it is in the URL as well)
 * and the preferences. The decoder page keeps the language it shows in its
 * URL, also when none was chosen (js/app.js).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  const i18n = factory();
  (root.DX = root.DX || {}).i18n = i18n;
  // A language file may load before this script (js/prepaint.js adds it to
  // the page): it waits in DX.languageFiles, and later ones register at once.
  const queued = root.DX.languageFiles || [];
  root.DX.languageFiles = { push: i18n.register };
  queued.forEach(i18n.register);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENGLISH = {
    code: 'en',
    name: 'English',
    // Separators used when the code joins pieces of text; `sentence` goes between two sentences, `list` between list items.
    punctuation: { comma: ', ', list: ', ', colon: ': ', semicolon: '; ', period: '.', sentence: '. ', space: ' ' },
    strings: {},
  };
  const languages = [ENGLISH];
  let current = ENGLISH;

  /**
   * The language the page is to be shown in, as js/prepaint.js settled it
   * (DX.language); without that script, as in Node, English.
   */
  const chosen = () => (typeof globalThis !== 'undefined' && globalThis.DX && globalThis.DX.language) || ENGLISH.code;

  /** Called by each file in js/i18n/. */
  function register(lang) {
    if (languages.some((l) => l.code === lang.code)) throw new Error(`Language ${lang.code} registered twice`);
    languages.push(lang);
    // A page already shown keeps its language: a file that comes after the
    // visitor chose English while waiting (js/prepaint.js) is only listed.
    const page = typeof document !== 'undefined' ? document : null;
    if ((page && !page.documentElement.hasAttribute('data-i18n-pending')) || lang.code !== chosen()) return;
    current = lang;
    // The page gets this text as soon as it is parsed, without waiting for its other scripts.
    if (page && page.readyState !== 'loading') applyLanguage(page);
    else if (page) page.addEventListener('readystatechange', () => applyLanguage(page), { once: true });
  }

  /**
   * Every language the page has, for the menu: English and those listed in
   * js/prepaint.js, whose files load only when chosen (without that list, as
   * in Node, the ones registered).
   */
  function available() {
    const listed = typeof globalThis !== 'undefined' && globalThis.DX && globalThis.DX.languages;
    return [ENGLISH, ...(listed || languages.slice(1))].map(({ code, name }) => ({ code, name }));
  }

  const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();

  /** The text with its {names} filled in. A value that ends in a period, such as "…, INC.", takes the place of the period after it, or the "。". */
  function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}([.。]?)/g, (m, key, period) => {
      if (!(key in params)) return m;
      const value = String(params[key]);
      return value.endsWith('.') ? value : value + period;
    });
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
   * As t(), but in pieces: the text around each placeholder, and the value
   * given for it as it is, so that a value can be an element (words in
   * another language, marked so). A value's own closing period stands for
   * the one after it, as in fill().
   */
  function parts(text, params) {
    const entry = current.strings[text];
    const template = entry === undefined ? text : choose(entry, params);
    const out = [];
    let last = 0;
    template.replace(/\{(\w+)\}([.。]?)/g, (m, key, period, at) => {
      if (!(key in params)) return m;
      const value = params[key];
      const words = typeof value === 'object' && value !== null ? value.textContent : String(value);
      out.push(template.slice(last, at), typeof value === 'object' && value !== null ? value : words, words.endsWith('.') ? '' : period);
      last = at + m.length;
      return m;
    });
    out.push(template.slice(last));
    return out.filter((piece) => piece !== '');
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

  const applied = new WeakSet();

  /** Settles once the language file js/prepaint.js added has loaded, or failed to. */
  const ready = Promise.resolve(typeof globalThis !== 'undefined' && globalThis.DX ? globalThis.DX.languageLoaded : undefined);

  /** Put the current language's text into the marked parts of a page, once. */
  function applyLanguage(doc) {
    if (applied.has(doc)) return;
    applied.add(doc);
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

  /** Switch the current language without reloading (scripts and tests). */
  function use(code) {
    const lang = languages.find((l) => l.code === code);
    if (lang) current = lang;
    return Boolean(lang);
  }

  /** Reload the page in the language chosen, named in the URL: the URL alone keeps the choice. */
  function select(code) {
    if (code === current.code || !available().some((l) => l.code === code)) return;
    // The query built by hand (URLSearchParams would escape the "/" in
    // ?dx=79-15/23), on the page's own address, so it can't lead elsewhere.
    const others = location.search.slice(1).split('&').filter((p) => p && !/^lang=/i.test(p));
    const url = new URL(location.href);
    url.search = `?${[...others, `lang=${encodeURIComponent(code)}`].join('&')}`;
    // No anchor: the page keeps its place itself (app.js), and the browser's
    // jump to an anchor, once the page has loaded, would undo that.
    url.hash = '';
    location.replace(url.href);
  }

  return {
    languages,
    available,
    register,
    ready,
    t,
    parts,
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
