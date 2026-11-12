#!/usr/bin/env node
// `npm run check:styles`: do the stylesheet and the classes the page sets
// still match? It reads the files as text, with nothing to install, and
// reports
//
//   rules for a class that no page or script names: nothing can ever have it
//   classes a page or script sets that nothing uses: no rule of the
//     stylesheet, and no script or test that looks for them
//
// It errs toward saying nothing. A class counts as named where its name
// stands anywhere in a page or script, a comment included, or where a script
// builds names that start like it (`cell--${kind}` names every "cell--…").
// A class counts as set only where it is written out: in a page's
// class="…", in a script's `class: '…'`, or handed to classList.add,
// .remove or .toggle. One that is put together some other way is not checked.
//
// Not part of `npm test`, and not run on GitHub: it is for a look before a
// review, with `npm run check:types`.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /-?[_a-zA-Z][\w-]*/g;
// The film tables: data, with no class names of the page in them.
const DATA = /(^|[\\/])dx-(data|data-community|index)\.js$/;

const filesIn = (root, dir, kinds) => {
  try {
    return readdirSync(join(root, dir), { recursive: true }).filter((file) => kinds.test(file)).sort().map((file) => join(dir, file));
  } catch {
    return []; // a project without this folder
  }
};
const read = (root, file) => readFileSync(join(root, file), 'utf8');

/** The classes in the selectors of a stylesheet. */
export function classesInRules(css) {
  // Without comments and strings, which can hold braces and periods of their own.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  const classes = new Set();
  let prelude = '';
  for (const ch of text) {
    if (ch === '{') {
      // What stands before a block: a selector, or an at-rule (@media …), which names no class.
      const selector = prelude.trim();
      if (!selector.startsWith('@')) for (const m of selector.replace(/\[[^\]]*\]/g, ' ').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1]);
      prelude = '';
    } else if (ch === '}' || ch === ';') prelude = '';
    else prelude += ch;
  }
  return classes;
}

/** The classes written out where a script sets them, and the script without those places. */
function setInScript(text) {
  const set = new Set();
  const take = (names) => {
    for (const name of names.split(/\s+/)) if (/^-?[_a-zA-Z][\w-]*$/.test(name)) set.add(name);
    return ' '.repeat(names.length);
  };
  const rest = text
    // h('div', { class: 'a b' }), el.className = 'a b', setAttribute('class', 'a b')
    .replace(/(\bclass(?:Name)?\s*[:=]\s*|'class',\s*)(['"`])((?:(?!\2)[^\\\n$]|\\.)*)\2/g, (_, lead, quote, names) => `${lead}${quote}${take(names)}${quote}`)
    // class="a b" in a piece of a page that a script holds as text
    .replace(/(\bclass=\\?")([^"\\]*)(\\?")/g, (_, lead, names, end) => `${lead}${take(names)}${end}`)
    // classList.add('a', 'b'), .remove, .toggle('a', on)
    .replace(/(\bclassList\.(?:add|remove|toggle)\()([^()]*)\)/g, (_, lead, args) => `${lead}${args.replace(/(['"])([\w -]*)\1/g, (__, quote, names) => `${quote}${take(names)}${quote}`)})`);
  return { set, rest };
}

/**
 * What no longer matches in the project in `root`, as two lists of class
 * names: `unusedRules` (in the stylesheet's rules, named by no page or
 * script) and `unusedClasses` (set by a page or script, used by nothing).
 */
export function styleProblems(root = ROOT) {
  const inRules = new Set(filesIn(root, 'site/css', /\.css$/).flatMap((file) => [...classesInRules(read(root, file))]));
  const scripts = filesIn(root, 'site/js', /\.js$/).filter((file) => !DATA.test(file)).map((file) => read(root, file));
  const pages = filesIn(root, 'site', /\.html$/).map((file) => read(root, file));

  // Named: every name that stands in a page or script, and the start of every name a script builds.
  const named = new Set([...scripts, ...pages].flatMap((text) => text.match(NAME) || []));
  const starts = [...new Set(scripts.flatMap((text) => [...text.matchAll(/([_a-zA-Z][\w-]*[-_])\$\{/g)].map((m) => m[1])))];
  const unusedRules = [...inRules].filter((name) => !named.has(name) && !starts.some((start) => name.startsWith(start))).sort();

  // Set: in a page's class="…" and where a script writes a class out.
  const set = new Set(pages.flatMap((page) => [...page.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean))));
  // Used: by a rule, or named by a script anywhere but where it sets it, or by a test or a script of the project.
  const used = new Set(inRules);
  for (const text of scripts) {
    const found = setInScript(text);
    for (const name of found.set) set.add(name);
    for (const name of found.rest.match(NAME) || []) used.add(name);
  }
  for (const file of [...filesIn(root, 'tests', /\.(cjs|mjs)$/), ...filesIn(root, 'scripts', /\.mjs$/)]) {
    for (const name of read(root, file).match(NAME) || []) used.add(name);
  }
  const unusedClasses = [...set].filter((name) => !used.has(name)).sort();
  return { unusedRules, unusedClasses };
}

if (isMain(import.meta)) {
  const { unusedRules, unusedClasses } = styleProblems();
  if (unusedRules.length) console.error(`The stylesheet has rules for ${unusedRules.length === 1 ? 'a class' : `${unusedRules.length} classes`} that no page or script names:\n  ${unusedRules.join('\n  ')}\n`);
  if (unusedClasses.length) console.error(`The pages and scripts set ${unusedClasses.length === 1 ? 'a class' : `${unusedClasses.length} classes`} that no rule, script or test uses:\n  ${unusedClasses.join('\n  ')}\n`);
  if (unusedRules.length || unusedClasses.length) process.exit(1);
  console.log('Every class in the stylesheet is named by a page or script, and every class they set is used.');
}
