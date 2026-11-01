// JavaScript source with only its code left: for checks that read code with
// regular expressions (scripts/check-languages.mjs, tests/unit/e2e-tags.test.mjs)
// and must not be misled by a comment or a string.

/**
 * The source with comments and the insides of strings, templates and regular
 * expressions blanked, keeping every offset and line. Throws where it cannot
 * tell where one of them ends, so that a check fails rather than misreads.
 */
export function blank(src) {
  const out = src.split('');
  const wipe = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  const NAME = /[\p{ID_Continue}$]/u; // a letter of a name, a keyword or a number, in any script
  const back = (k) => { while (k >= 0 && /\s/.test(out[k])) k--; return k; }; // the code at or before k
  // The word that ends at k, and whether a . comes before it, which makes it a property name.
  const wordAt = (k) => {
    let from = k;
    while (from > 0 && NAME.test(out[from - 1])) from--;
    const before = back(from - 1);
    return { word: out.slice(from, k + 1).join(''), before, property: before >= 0 && out[before] === '.' };
  };
  const parens = []; // for each ( still open, whether it holds the condition of an if, while, for or with
  const conditions = new Set(); // where the ) of such a condition is
  // Whether a / starts a regular expression rather than a division, by the
  // code before it (comments are blank by then): a division follows a name, a
  // number, ) or ], a ++ or -- after them, or the end of a string, template or
  // regular expression; a regular expression follows any other sign, a keyword
  // such as return (not a property named so), and the ) of if (…), while (…),
  // for (…) and with (…).
  const startsRegExp = (at) => {
    const k = back(at - 1);
    if (k < 0) return true;
    if (out[k] === ')') return conditions.has(k);
    if (out[k] === '+' || out[k] === '-') {
      // A run of them is read in pairs from the left, so an even run ends in ++ or --.
      let from = k;
      while (from > 0 && out[from - 1] === out[k]) from--;
      return (k - from + 1) % 2 === 1;
    }
    if (!NAME.test(out[k])) return !/[\]'"`/]/.test(out[k]);
    const { word, property } = wordAt(k);
    return !property && /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(word);
  };
  // Whether the ( at `at` holds a condition: after if, while, for, for await or with.
  const opensCondition = (at) => {
    const k = back(at - 1);
    if (k < 0 || !NAME.test(out[k])) return false;
    const { word, before, property } = wordAt(k);
    if (property) return false;
    if (word === 'await') return before >= 0 && NAME.test(out[before]) && wordAt(before).word === 'for' && !wordAt(before).property;
    return /^(?:if|while|for|with)$/.test(word);
  };
  const holes = []; // the brace depth at each open ${ of a template
  let depth = 0;
  let i = 0;
  const template = () => { // from just after ` or after the } that closes a ${
    const start = i;
    while (i < src.length && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) i += src[i] === '\\' ? 2 : 1;
    if (i >= src.length) throw new Error('unclosed template');
    wipe(start, i);
    if (src[i] === '`') i++;
    else { holes.push(depth); depth++; i += 2; }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      wipe(i, stop);
      i = stop;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unclosed comment');
      wipe(i, end + 2);
      i = end + 2;
    } else if (c === "'" || c === '"') {
      const start = ++i;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\n') throw new Error('unclosed string');
        i += src[i] === '\\' ? 2 : 1;
      }
      if (i >= src.length) throw new Error('unclosed string');
      wipe(start, i);
      i++;
    } else if (c === '`') {
      i++;
      template();
    } else if (c === '/' && startsRegExp(i)) {
      const start = ++i;
      let inClass = false;
      while (i < src.length && (inClass || src[i] !== '/')) {
        if (src[i] === '\n') throw new Error('unclosed regular expression');
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        i += src[i] === '\\' ? 2 : 1;
      }
      if (i >= src.length) throw new Error('unclosed regular expression');
      wipe(start, i);
      i++;
    } else if (c === '(') {
      parens.push(opensCondition(i));
      i++;
    } else if (c === ')') {
      if (!parens.length) throw new Error('unbalanced parentheses');
      if (parens.pop()) conditions.add(i);
      i++;
    } else if (c === '{') {
      depth++;
      i++;
    } else if (c === '}') {
      depth--;
      i++;
      if (holes.length && holes[holes.length - 1] === depth) {
        holes.pop();
        template();
      }
    } else i++;
  }
  if (depth !== 0 || holes.length) throw new Error('unbalanced braces');
  if (parens.length) throw new Error('unbalanced parentheses');
  return out.join('');
}
