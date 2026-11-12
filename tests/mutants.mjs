// Mutants: the project with one thing broken, each beside the test that must
// then fail. `npm run test:mutants` tries them all (scripts/run-mutants.mjs),
// in copies of the project: a mutant whose test still passes shows a test that
// no longer guards what it was written for.
//
// A fix or a rule comes with its test, and the test with its mutant here: the
// fix taken out again, or the rule loosened the way a later change might.
//
//   name     what is broken, in a few words; no two the same
//   change   [file, the text taken out, the text put in its place] one or
//            more times. The text taken out must be in the file exactly once:
//            `npm test` fails when the code has moved on and it no longer is
//            (tests/unit/mutants.test.mjs), and names the mutant to bring up
//            to date.
//   fails    the test that must fail: `e2e(file, words, device)` for a browser
//            test in tests/e2e/<file>.spec.cjs with these words in its name,
//            on the desktop unless a device is named (android, iphone);
//            `unit(file, words)` for one in tests/unit/<file>.test.mjs;
//            `regressions` for the page's snapshots, which
//            `npm run check:regressions` compares.

const e2e = (file, name, device = 'desktop') => ({ kind: 'e2e', file: `tests/e2e/${file}.spec.cjs`, name, device });
const unit = (file, name) => ({ kind: 'unit', file: `tests/unit/${file}.test.mjs`, name });
const regressions = { kind: 'regressions' };

export const MUTANTS = [
  // ---- The search: its words (`analyze`), tests/unit/search-words.mjs
  {
    name: 'search: marks around digits joined by a mark stay on them',
    change: [['site/js/dx-lookup.js', 'return JOINED.test(core) ? core : t;', 'return t;']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: only the marks after such digits are dropped',
    change: [['site/js/dx-lookup.js', 'const AROUND = /^[^\\p{L}\\p{N}]+|[^\\p{L}\\p{N}]+$/gu;', 'const AROUND = /[^\\p{L}\\p{N}]+$/gu;']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: "search: a letter's own mark is split from it",
    change: [['site/js/dx-lookup.js', 'replace(/([^\\P{L}a-z]\\p{M}*)([a-z0-9])/gu', 'replace(/([^\\P{L}a-z])([a-z0-9])/gu']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: letters of another script stay joined to Latin letters before them',
    change: [['site/js/dx-lookup.js', ".replace(/([a-z0-9])([^\\P{L}a-z])/gu, '$1 $2')", '']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a word with letters of another script is matched by its Latin letters and digits alone',
    change: [['site/js/dx-lookup.js', "const key = OTHER.test(t) ? '' : compact(t);", 'const key = compact(t);']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a number with marks around it does not read as a number',
    change: [['site/js/dx-lookup.js', "const bare = String(query || '').trim().replace(AROUND, '');", "const bare = String(query || '').trim();"]],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a dash between digits stays as typed',
    change: [['site/js/dx-lookup.js', ".replace(/(\\d)[-\\u2010-\\u2015\\u2212]+(?=\\d)/g, '$1-')", '']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a text with no words is searched',
    change: [['site/js/dx-lookup.js', '      if (!typed.words.length) return [];\n', '']],
    fails: unit('search', 'a text with no words finds nothing'),
  },
  {
    name: 'search: the page asks about a number with the marks typed around it',
    change: [['site/js/ui-finder.js', 'else if (lookup.analyze(q).number)', 'else if (codec.parseDxNumber(q) || codec.parseCassette(q))']],
    fails: e2e('lookup', 'Find a film searches names'),
  },

  // ---- The search: how well a row matches (`matcher`) and the ranking
  {
    name: 'search: words of neighboring fields written together count as one',
    change: [['site/js/dx-lookup.js', 'h.fieldWords.flatMap(joinsOf)', 'joinsOf(h.words)']],
    fails: unit('lookup', 'words of neighboring fields written together are none'),
  },
  {
    name: 'search: a match in other fields comes before pieces of the name',
    change: [['site/js/dx-lookup.js', 'pieces: 4, elsewhere: 3', 'pieces: 2.9, elsewhere: 3']],
    fails: unit('lookup', 'every word somewhere in the name comes before a match in other fields'),
  },
  {
    name: 'search: pieces of the name come before the text as typed in it',
    change: [['site/js/dx-lookup.js', 'inName: 8, pieces: 4', 'inName: 3.5, pieces: 4']],
    fails: unit('lookup', 'every word somewhere in the name comes before a match in other fields'),
  },
  {
    name: 'search: the start of a word comes before a whole word',
    change: [['site/js/dx-lookup.js', 'words: 9, starts: 8.5', 'words: 8.5, starts: 9']],
    fails: unit('lookup', 'names match by words within one field'),
  },
  {
    name: 'search: digits joined by a mark run into other digits',
    change: [['site/js/dx-lookup.js', "asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, 'a-z0-9', '0-9')", "asTyped(t, '', ''), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, 'a-z0-9', '0-9')"]],
    fails: unit('lookup', 'digits joined by a mark stay apart'),
  },
  {
    name: 'search: digits joined by a mark are a whole word with a letter against them',
    change: [['site/js/dx-lookup.js', "asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, 'a-z0-9', '0-9')", "asTyped(t, '0-9', '0-9'), asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', '0-9')"]],
    fails: unit('lookup', 'a dash between digits finds the same films however it is typed'),
  },
  {
    name: 'search: digits joined by a mark start a word with a letter before them',
    change: [['site/js/dx-lookup.js', "asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, 'a-z0-9', '0-9')", "asTyped(t, '0-9', '0-9'), asTyped(t, 'a-z0-9', 'a-z0-9'), asTyped(t, '0-9', '0-9')"]],
    fails: unit('lookup', 'digits joined by a mark, outside the name'),
  },
  {
    name: 'search: digits joined by a mark are never a whole word outside the name',
    change: [['site/js/dx-lookup.js', 'wordElsewhere: (h) => whole.test(h.text),', 'wordElsewhere: () => false,']],
    fails: unit('lookup', 'digits joined by a mark, outside the name'),
  },
  {
    name: 'search: digits joined by a mark never start a word outside the name',
    change: [['site/js/dx-lookup.js', 'startElsewhere: (h) => start.test(h.text),', 'startElsewhere: () => false,']],
    fails: unit('lookup', 'digits joined by a mark, outside the name'),
  },
  {
    name: 'search: the start of a word counts as a whole word of the name',
    change: [['site/js/dx-lookup.js', 'wordOfName: (h) => h.nameJoins.includes(c),', 'wordOfName: (h) => h.nameRuns.some((r) => r.startsWith(c)),']],
    fails: unit('search', 'matches its example row as well as the table says'),
  },
  {
    name: 'search: a row that lacks a word is found by the others',
    change: [['site/js/dx-lookup.js', 'if (!tests.every((k) => k.found(h))) return 0;', 'if (!tests.some((k) => k.found(h))) return 0;']],
    fails: unit('search', 'matches its example row as well as the table says'),
  },
  {
    name: 'search: two levels change places',
    change: [['site/js/dx-lookup.js', 'starts: 8.5, inName: 8,', 'starts: 8, inName: 8.5,']],
    fails: unit('search', 'the levels are numbers from 10 down'),
  },
  {
    name: "search: a field's words run into the next field's",
    change: [['site/js/dx-lookup.js', '      runs: words.flatMap(runsFrom),', '      runs: runsFrom(words.flat()),']],
    fails: unit('search', 'a row of the index keeps each field apart'),
  },
  {
    name: 'search: films are ranked without how well they match',
    change: [['site/js/dx-lookup.js', 'if (match) found.push({ entry: h.entry, score: scoreOf(h.entry, match) });', 'if (match) found.push({ entry: h.entry, score: scoreOf(h.entry) });']],
    fails: unit('search', 'films are listed by how well they match first'),
  },
  {
    name: 'ranking: the registry weighs no more than a certainty',
    change: [['site/js/dx-lookup.js', 'registry: 1e3,', 'registry: 1,']],
    fails: unit('lookup', 'each part of a score outweighs all the parts after it'),
  },
  {
    name: 'ranking: a film without a note gets nothing for it',
    change: [['site/js/dx-lookup.js', 'noNote: 10,', 'noNote: 0,']],
    fails: unit('regressions', 'lookups.txt is what the lookups find'),
  },

  // ---- Mirror and the photo reader
  {
    name: "Mirror turns the strip with the reader's tab open",
    change: [['site/js/app.js', "  const mirrored = () => state.mirrored && state.way !== 'photo';", '  const mirrored = () => state.mirrored;']],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: "the Mirror button shows with the reader's tab open",
    change: [['site/js/app.js', "        $('mirror-toggle').hidden = !view.mirrorOffered;\n", '']],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: "the Mirror button is greyed, not hidden, with the reader's tab open",
    change: [['site/js/app.js', "        $('mirror-toggle').hidden = !view.mirrorOffered;\n", "        $('mirror-toggle').disabled = !view.mirrorOffered;\n"]],
    fails: e2e('photo', 'Mirror is for copying by hand', 'android'),
  },
  {
    name: 'Mirror comes back at copying with a photo on the strip',
    change: [['site/js/app.js', '    if (leavesReader && state.mirrored && photoOnStrip()) {\n      state.mirrored = false;\n      savePrefs();\n    }\n', '']],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: 'Mirror goes off at copying without a photo on the strip',
    change: [['site/js/app.js', '    if (leavesReader && state.mirrored && photoOnStrip()) {', '    if (leavesReader && state.mirrored) {']],
    fails: e2e('photo', 'Mirror is for copying by hand', 'iphone'),
  },
  {
    name: 'Mirror going off at copying is not kept',
    change: [['site/js/app.js', '      state.mirrored = false;\n      savePrefs();\n    }\n    update();', '      state.mirrored = false;\n    }\n    update();']],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: 'nothing is drawn again as a tab is chosen',
    change: [['site/js/app.js', "      savePrefs();\n    }\n    update();\n    if (next === 'photo') {", "      savePrefs();\n    }\n    if (next === 'photo') {"]],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: "a mirrored strip keeps the photo's row",
    change: [['site/js/app.js', 'const photoRow = () => (photoOnStrip() && !mirrored() ? state.origin.lined : null);', 'const photoRow = () => (photoOnStrip() ? state.origin.lined : null);']],
    fails: e2e('photo', 'while the strip is not mirrored and the layout stays'),
  },

  // ---- The page: one state, and parts drawn again when their view of it changes
  {
    name: 'every part is drawn again at every change',
    change: [['site/js/app.js', '      part.shown = view;\n', '']],
    fails: e2e('lookup', 'the film look and Mirror leave the result as it is'),
  },
  {
    name: 'the result is not drawn again for another film picked',
    change: [['site/js/app.js', 'empty: isEmpty(), picked: pickKey(state.picked) }),', 'empty: isEmpty() }),']],
    fails: e2e('lookup', 'a film picked to show its barcode comes first in the result'),
  },
  {
    name: 'the result takes the all-zero code for an empty strip',
    change: [['site/js/app.js', '      view: () => ({ format: state.format, cells: state.cells, empty: isEmpty(), picked: pickKey(state.picked) }),', '      view: () => ({ format: state.format, cells: state.cells, picked: pickKey(state.picked) }),']],
    fails: e2e('decoder', 'a link to the all-zero code shows it'),
  },
  {
    name: 'the bar above the strip is not drawn again when the strip is edited',
    change: [['site/js/app.js', '      view: () => ({ origin: state.origin, edited: edited() }),', '      view: () => ({ origin: state.origin }),']],
    fails: e2e('photo', 'while the strip is not mirrored and the layout stays'),
  },
  {
    name: 'the toolbar does not follow the tab that is open',
    change: [['site/js/app.js', "mirrored: mirrored(), mirrorOffered: state.way !== 'photo', canUndo", 'mirrored: mirrored(), mirrorOffered: true, canUndo']],
    fails: e2e('photo', 'Mirror is for copying by hand'),
  },
  {
    name: 'a part reads the state where it draws',
    change: [['site/js/app.js', "        $('way-copy').hidden = view.way !== 'copy';", "        $('way-copy').hidden = state.way !== 'copy';"]],
    fails: unit('app', 'each part of the page reads the state only in its'),
  },
  {
    name: 'the tab that is open is kept in a variable of its own',
    change: [['site/js/app.js', '  let photo = null;\n', "  let photo = null;\n  let way = 'copy';\n"]],
    fails: unit('app', 'the page keeps what it shows in one object'),
  },

  // ---- The strip's rows on one grid
  {
    name: "mirrored, the strip's columns stay as they are",
    change: [['site/css/style.css', '.strip.is-mirrored .strip__canvas {\n  grid-template-columns: [tail-start] var(--tail-w) [tail-end code-start] var(--code-w) [code-end label-start] var(--label-w) [label-end];\n}\n', '']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "mirrored, the film's number and code fall into two rows",
    change: [['site/css/style.css', '.strip__photo-label,\n.strip__photo canvas,\n.film__label,\n.film__code {\n  grid-row: 1;\n}\n', '']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the ruler is not in the code's column",
    change: [['site/css/style.css', '.strip__photo canvas,\n.ruler__grid,\n.film__code,', '.strip__photo canvas,\n.film__code,']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the labels under the strip are not in the code's column",
    change: [['site/css/style.css', '.film__code,\n.annot__grid {\n  grid-column: code;', '.film__code {\n  grid-column: code;']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the film's number is not in a column of its own",
    change: [['site/css/style.css', '.strip__photo-label,\n.film__label {\n  grid-column: label;', '.strip__photo-label {\n  grid-column: label;']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "a photo under its label is not in the code's column",
    change: [['site/css/style.css', '.strip__photo canvas,\n.ruler__grid,\n.film__code,', '.ruler__grid,\n.film__code,']],
    fails: e2e('photo', 'stands above the photo'),
  },
  {
    name: '"Photo detail" stays beside the photo on a strip that scrolls',
    change: [['site/css/style.css', '.strip[data-format="short"] .strip__photo-label,\n.strip.is-overflowing .strip__photo-label {', '.strip[data-format="short"] .strip__photo-label {']],
    fails: e2e('photo', 'stands above the photo', 'android'),
  },
  {
    name: '"Photo detail" stays before a 7-bar code, where there is no room',
    change: [['site/css/style.css', '.strip[data-format="short"] .strip__photo-label,\n.strip.is-overflowing .strip__photo-label {', '.strip.is-overflowing .strip__photo-label {']],
    fails: e2e('photo', 'lines up over the strip too'),
  },
  {
    name: '"Photo detail" lies over a photo it should stand above',
    change: [['site/css/style.css', '.strip[data-format="short"] .strip__photo canvas,\n.strip.is-overflowing .strip__photo canvas {\n  grid-row: 2;\n}\n', '']],
    fails: e2e('photo', 'lines up over the strip too'),
  },
  {
    name: "a photo's row keeps its own colors in forced colors",
    change: [['site/css/style.css', '  .film,\n  .looks__film {\n    forced-color-adjust: none;', '  .film,\n  .strip__photo,\n  .looks__film {\n    forced-color-adjust: none;']],
    fails: e2e('photo', 'label beside the photo takes'),
  },

  // ---- The photo reader
  {
    name: 'an SVG file is opened',
    change: [['site/js/ui-photo.js', "      if (/^image\\/svg/.test(blob.type)) throw new Error('not a photo');\n", '']],
    fails: e2e('photo', 'an SVG file is not opened'),
  },
  {
    name: 'only an SVG file of the exact type is refused',
    change: [['site/js/ui-photo.js', 'if (/^image\\/svg/.test(blob.type))', "if (blob.type === 'image/svg+xml')"]],
    fails: e2e('photo', 'an SVG file is not opened'),
  },
  {
    name: 'a flipped photo turns left the wrong way',
    change: [['site/js/ui-photo.js', 'turns = (turns + (flip ? 1 : 3)) % 4;', 'turns = (turns + 3) % 4;']],
    fails: e2e('photo', 'on a flipped photo'),
  },
  {
    name: 'a flipped photo turns right the wrong way',
    change: [['site/js/ui-photo.js', 'turns = (turns + (flip ? 3 : 1)) % 4;', 'turns = (turns + 1) % 4;']],
    fails: e2e('photo', 'on a flipped photo'),
  },
  {
    name: 'a photo is sent to the server',
    change: [['site/js/ui-photo.js', '      const ticket = ++loads;\n', "      const ticket = ++loads;\n      fetch('index.html', { method: 'POST', body: p.blob }).catch(() => {});\n"]],
    fails: e2e('photo', 'a photo stays in the page'),
  },
  {
    name: "a photo's name is kept in the browser",
    change: [['site/js/ui-photo.js', '      const ticket = ++loads;\n', "      const ticket = ++loads;\n      try { localStorage.setItem('dx-photo-name', p.blob.name); } catch (e) {}\n"]],
    fails: e2e('photo', 'a photo stays in the page'),
  },
  {
    name: 'a preview of a photo is kept in the browser',
    change: [['site/js/ui-photo.js', '      const ticket = ++loads;\n', "      const ticket = ++loads;\n      try { localStorage.setItem('dx-preview', 'x'.repeat(5000)); } catch (e) {}\n"]],
    fails: e2e('photo', 'a photo stays in the page'),
  },

  // ---- The cassette drawing
  {
    name: 'the cassette is not turned',
    change: [['site/css/style.css', '  forced-color-adjust: none;\n  transform: rotate(10deg);\n', '  forced-color-adjust: none;\n']],
    fails: e2e('lookup', 'lies turned 10'),
  },
  {
    name: 'the cassette is turned 5 degrees',
    change: [['site/css/style.css', '  transform: rotate(10deg);\n', '  transform: rotate(5deg);\n']],
    fails: e2e('lookup', 'lies turned 10'),
  },
  {
    name: "the cassette's shadow turns with it",
    change: [
      ['site/css/style.css', '  grid-area: figure;\n  filter: drop-shadow(0 3px 4px var(--cassette-drop));\n', '  grid-area: figure;\n'],
      ['site/css/style.css', '  transform: rotate(10deg);\n', '  transform: rotate(10deg);\n  filter: drop-shadow(0 3px 4px var(--cassette-drop));\n'],
    ],
    fails: e2e('lookup', 'lies turned 10'),
  },
  {
    name: 'the turned cassette has no room at its left',
    change: [['site/css/style.css', '    margin: 17px 0 22px 12px;\n', '    margin: 17px 0 22px;\n']],
    fails: e2e('lookup', 'lies turned 10'),
  },
  {
    name: 'the turned cassette has no room at its left, on an Android phone',
    change: [['site/css/style.css', '    margin: 17px 0 22px 12px;\n', '    margin: 17px 0 22px;\n']],
    fails: e2e('lookup', 'lies turned 10', 'android'),
  },
  {
    name: 'the turned cassette has no room at its left, on an iPhone',
    change: [['site/css/style.css', '    margin: 17px 0 22px 12px;\n', '    margin: 17px 0 22px;\n']],
    fails: e2e('lookup', 'lies turned 10', 'iphone'),
  },

  // ---- The code list
  {
    name: 'code list: the Part 1 menu lists every number whatever the manufacturer',
    change: [['site/js/ui-reference.js', 'const numbers = assigned.filter((info) => !m || info.sensitizer === m).map((info) => String(info.part1));', 'const numbers = assigned.map((info) => String(info.part1));']],
    fails: e2e('lookup', 'always go together'),
  },
  {
    name: 'code list: a number of another manufacturer keeps the manufacturer chosen',
    change: [['site/js/ui-reference.js', "      if (chosenMaker() && chosenMaker() !== info.sensitizer) maker.value = '';\n", '']],
    fails: e2e('lookup', 'always go together'),
  },
  {
    name: 'code list: any number chosen clears the manufacturer',
    change: [['site/js/ui-reference.js', "      if (chosenMaker() && chosenMaker() !== info.sensitizer) maker.value = '';\n", "      maker.value = '';\n"]],
    fails: e2e('lookup', 'always go together'),
  },
  {
    name: 'code list: choosing a manufacturer drops the number, its own too',
    change: [['site/js/ui-reference.js', "const kept = numbers.includes(part1.value) ? part1.value : '';", "const kept = '';"]],
    fails: e2e('lookup', 'always go together'),
  },
  {
    name: 'code list: choosing a manufacturer leaves the Part 1 menu as it was',
    change: [['site/js/ui-reference.js', "    maker.addEventListener('input', () => {\n      listPart1();\n      render();\n    });", "    maker.addEventListener('input', () => {\n      render();\n    });"]],
    fails: e2e('lookup', 'always go together'),
  },
  {
    name: 'code list: a number chosen in the table does not show in the menu',
    change: [['site/js/ui-reference.js', '      listPart1();\n      part1.value = String(info.part1);\n      render();', '      listPart1();\n      part1.value = String(info.part1);\n      render();\n      part1.selectedIndex = 0;']],
    fails: e2e('lookup', 'filters by Part 1 number'),
  },
  {
    name: 'code list: the total is said twice with no filter',
    change: [['site/js/ui-reference.js', "      if (number === null && !m && !st) count.textContent = '';\n      else {\n", '      {\n']],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: one product is counted as "products"',
    change: [['site/js/ui-reference.js', "? i18n.plural(rows.length, '{n} registered product.', '{n} registered products.')", "? t('{n} registered products.', { n: rows.length })"]],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: nothing matching names no filter',
    change: [['site/js/ui-reference.js', "          : t('No registered products match these filters.');", "          : t('No registered products.');"]],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: the count line collapses when empty',
    change: [['site/css/style.css', '.ref-count {\n  min-height: 1.8em;\n}\n', '']],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: the count line is too low for Chinese',
    change: [['site/css/style.css', '.ref-count {\n  min-height: 1.8em;\n}\n', '.ref-count {\n  min-height: 1.55em;\n}\n']],
    fails: e2e('i18n', 'counts its products in Chinese'),
  },
  {
    name: 'code list: the Chinese count names Part 1',
    change: [['site/js/i18n/zh-CN.js', '"显示 {n} 个登记产品。"', '"显示第 1 部分的登记产品 {n} 个。"']],
    fails: e2e('i18n', 'counts its products in Chinese'),
  },
  {
    name: 'code list: the total is not said',
    change: [['site/js/ui-reference.js', "        h('p', { class: 'fineprint' }, t('{total} registered products in all.', { total: lookup.products.length })),\n", '']],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: a text box is back',
    change: [['site/js/ui-reference.js', "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status))),", "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status), h('input', { type: 'search' }))),"]],
    fails: e2e('lookup', 'has no text box'),
  },
  {
    name: 'code list: the browser restores the Part 1 menu after Back',
    change: [['site/js/ui-reference.js', "const part1 = h('select', { id: 'ref-part1', class: 'input', autocomplete: 'off' });", "const part1 = h('select', { id: 'ref-part1', class: 'input' });"]],
    fails: e2e('lookup', 'after Back loads the page again'),
  },

  // ---- The strip, the result and the page
  {
    name: 'reduced motion: transitions only shortened',
    change: [['site/css/style.css', '    transition: none !important;', '    transition-duration: 1ms !important;']],
    fails: e2e('site', 'with reduced motion nothing'),
  },
  {
    name: 'a long word typed runs out of its box',
    change: [['site/css/style.css', '  overflow-wrap: anywhere; /* it repeats what was typed */\n', '']],
    fails: e2e('lookup', 'a long word typed'),
  },
  {
    name: 'a very long paste is searched whole',
    change: [['site/js/ui-finder.js', "      maxlength: '200', // more than any film's name needs: a long paste, cut here, can't hold up the page\n", '']],
    fails: e2e('lookup', 'a very long paste'),
  },
  {
    name: "a name's period is doubled by the sentence's, filled in",
    change: [['site/js/i18n.js', 'return text.replace(/\\{(\\w+)\\}([.。]?)/g, (m, key, period) => {', 'return text.replace(/\\{(\\w+)\\}(\\.?)/g, (m, key, period) => {']],
    fails: e2e('i18n', 'a name that ends in a period'),
  },
  {
    name: "a name's period is doubled by the sentence's, in parts",
    change: [['site/js/i18n.js', 'template.replace(/\\{(\\w+)\\}([.。]?)/g, (m, key, period, at) => {', 'template.replace(/\\{(\\w+)\\}(\\.?)/g, (m, key, period, at) => {']],
    fails: e2e('i18n', 'a name that ends in a period'),
  },
  {
    name: "a name's period is doubled by a Chinese full stop",
    change: [['site/js/ui-result.js', "return words.endsWith('.') ? pieces : pieces.concat(mark);", "return mark === '.' && words.endsWith('.') ? pieces : pieces.concat(mark);"]],
    fails: e2e('i18n', 'a name that ends in a period'),
  },
  {
    name: "the result's title takes no focus",
    change: [['site/js/ui-result.js', "h('span', { id: 'result-title', tabindex: '-1' }, t('Waiting for bars'))", "h('span', { id: 'result-title' }, t('Waiting for bars'))"]],
    fails: e2e('decoder', 'focus in the result goes'),
  },
  {
    name: 'focus moving within the track ends a click',
    change: [['site/js/ui-strip.js', "if (!track.contains(e.relatedTarget) && document.hasFocus()) track.classList.remove('is-clicked');", "if (document.hasFocus()) track.classList.remove('is-clicked');"]],
    fails: e2e('decoder', 'selecting one cell after'),
  },
  {
    name: 'focus leaving with the window ends a click',
    change: [['site/js/ui-strip.js', "if (!track.contains(e.relatedTarget) && document.hasFocus()) track.classList.remove('is-clicked');", "if (!track.contains(e.relatedTarget)) track.classList.remove('is-clicked');"]],
    fails: e2e('decoder', 'focus that goes with the window'),
  },
  {
    name: 'a clicked bar keeps its focus ring',
    change: [['site/css/style.css', '.track--data.is-clicked .cell--edit.is-bar:focus-visible {\n  box-shadow: none;\n}\n', '']],
    fails: e2e('decoder', 'selecting one cell after'),
  },
  {
    name: 'AltGraph on its own counts as a key',
    change: [['site/js/ui-strip.js', "['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'].includes(e.key)", "['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)"]],
    fails: e2e('decoder', 'a modifier key on its own'),
  },

  // ---- What GitHub runs (.github/workflows/tests.yml)
  {
    name: 'the deploy does not wait for the browser tests',
    change: [['.github/workflows/tests.yml', '    needs: [unit, browser]\n', '    needs: [unit]\n']],
    fails: unit('e2e-tags', 'deploys only after every job passed'),
  },
  {
    name: 'GitHub runs three of the four desktop parts',
    change: [['.github/workflows/tests.yml', '          - name: desktop, part 4 of 4\n            tests: --project=desktop --shard=4/4\n            browsers: --only-shell chromium\n', '']],
    fails: unit('e2e-tags', 'GitHub runs every browser test on the desktop, in parts'),
  },
  {
    name: 'GitHub runs no phone at all',
    change: [['.github/workflows/tests.yml', '          - name: iPhone\n            tests: --project=iphone --grep @phone\n            browsers: webkit\n', '']],
    fails: unit('e2e-tags', 'GitHub runs every browser test on the desktop, in parts'),
  },
  {
    name: 'GitHub runs every test on the iPhone, tagged or not',
    change: [['.github/workflows/tests.yml', '            tests: --project=iphone --grep @phone\n', '            tests: --project=iphone\n']],
    fails: unit('e2e-tags', 'GitHub runs every browser test on the desktop, in parts'),
  },
  {
    name: 'a run anywhere leaves out accessibility scans as GitHub does',
    change: [['tests/e2e/on-github.cjs', '  if (!onGitHub || languages.length < themes.length) return true;', '  if (languages.length < themes.length) return true;']],
    fails: unit('e2e-tags', 'GitHub leaves out only the second theme'),
  },
  {
    name: 'on GitHub every language is scanned in the same theme',
    change: [['tests/e2e/on-github.cjs', '  return themes[languages.indexOf(language) % themes.length] === theme;', '  return themes[0] === theme;']],
    fails: unit('e2e-tags', 'GitHub leaves out only the second theme'),
  },

  // ---- The page's snapshots (`npm run check:regressions`): a change no browser test is written for
  {
    name: "snapshot: the strip's edge fades are printed",
    change: [['site/css/style.css', '  .strip__viewport::before,\n  .strip__viewport::after {\n    display: none;\n  }\n', '']],
    fails: regressions,
  },
  {
    name: 'snapshot: a Chinese text loses two words',
    change: [['site/js/i18n/zh-CN.js', '"等待填写或读取"', '"等待填写"']],
    fails: regressions,
  },
  {
    name: "snapshot: a button's name for screen readers loses the film",
    change: [['site/js/ui-reference.js', "t('Show the barcode of {name}', { name: p.name })", "t('Show')"]],
    fails: regressions,
  },
];
