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
  // ---- `npm run check:types`
  {
    name: 'check:types says nothing of a name imported from a module that lacks it',
    change: [['scripts/check-types.mjs', '  2305, 2614, 2724, // a name imported from a module that does not export it\n', '']],
    fails: unit('checks', 'check:types reports unused and unreached code'),
  },

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
    name: 'search: a cassette number that gives no DX number does not read as a number',
    change: [['site/js/dx-lookup.js', 'number: Boolean(codec.parseDxNumber(bare) || codec.parseCassette(bare))', 'number: Boolean(codec.parseDxNumber(bare))']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a dash between digits stays as typed',
    change: [['site/js/dx-lookup.js', ".replace(/(\\d)[-\\u2010-\\u2015\\u2212]+(?=\\d)/g, '$1-')", '']],
    fails: unit('search', 'the search takes each typed text of the table'),
  },
  {
    name: 'search: a mark typed on its own is left out of the words',
    change: [['site/js/dx-lookup.js', ".split(/\\s+/).filter(Boolean).map((t) => {", ".split(/\\s+/).filter((t) => /[\\p{L}\\p{N}]/u.test(t)).map((t) => {"]],
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
    name: "the Mirror button is grayed out, not hidden, with the reader's tab open",
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
    name: "the ruler's row comes after the film's",
    change: [['site/css/style.css', '[photo-end ruler-start] auto [ruler-end film-start] auto [film-end fields-start] auto [fields-end];', '[photo-end film-start] auto [film-end ruler-start] auto [ruler-end fields-start] auto [fields-end];']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "a photo's row comes after the ruler's",
    change: [['site/css/style.css', '[caption-end photo-start] auto [photo-end ruler-start] auto [ruler-end film-start] auto', '[caption-end ruler-start] auto [ruler-end photo-start] auto [photo-end film-start] auto']],
    fails: e2e('photo', 'while the strip is not mirrored and the layout stays'),
  },
  {
    name: "mirrored, the strip's columns stay as they are",
    change: [['site/css/style.css', '.strip.is-mirrored .strip__canvas {\n  grid-template-columns: [tail-start] var(--tail-w) [tail-end code-start] var(--code-w) [code-end label-start] var(--label-w) [label-end];\n}\n', '']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "mirrored, the film's number stays before its code",
    change: [['site/css/style.css', '.strip.is-mirrored .film__row {\n  flex-direction: row-reverse;\n}\n', '']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the ruler is not in the code's column",
    change: [['site/css/style.css', '.ruler {\n  grid-row: ruler;\n  grid-column: code;\n}', '.ruler {\n  grid-row: ruler;\n}']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the labels under the strip are not in the code's column",
    change: [['site/css/style.css', '.annot {\n  grid-row: fields;\n  grid-column: code;\n}', '.annot {\n  grid-row: fields;\n}']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: "the film's number is not as wide as its column",
    change: [['site/css/style.css', '.film__label {\n  flex: none;\n  box-sizing: border-box;\n  width: var(--label-w);\n', '.film__label {\n  flex: none;\n  box-sizing: border-box;\n']],
    fails: e2e('decoder', 'mirror reverses the strip on screen'),
  },
  {
    name: 'the header needs color-mix() again: see-through in a browser without it',
    change: [['site/css/style.css', '  background: var(--header-bg);\n', '  background: color-mix(in srgb, var(--bg) 88%, transparent);\n']],
    fails: unit('style', 'no color is mixed by the browser'),
  },
  {
    name: 'a color written out is no longer the mix of the colors it comes from',
    change: [['site/css/style.css', '  --film-mark: #1f2327;\n', '  --film-mark: #2f3337;\n']],
    fails: unit('style', 'no color is mixed by the browser'),
  },
  {
    name: "a photo under its label is not in the code's column",
    change: [['site/css/style.css', '.strip__photo canvas {\n  grid-row: photo;\n  grid-column: code;\n', '.strip__photo canvas {\n  grid-row: photo;\n']],
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
    name: '"Photo detail" lies in the row of the photo it should stand above',
    change: [['site/css/style.css', '.strip.is-overflowing .strip__photo-label {\n  grid-row: caption;\n', '.strip.is-overflowing .strip__photo-label {\n']],
    fails: e2e('photo', 'lines up over the strip too'),
  },
  {
    name: "the stylesheet puts the ruler's row after the film's",
    change: [['site/css/style.css', '[photo-end ruler-start] auto [ruler-end film-start] auto [film-end fields-start] auto [fields-end];', '[photo-end film-start] auto [film-end ruler-start] auto [ruler-end fields-start] auto [fields-end];']],
    fails: unit('style', 'the strip is laid out with plain grid alone'),
  },
  {
    name: 'the strip needs subgrid again',
    change: [['site/css/style.css', '.film {\n  grid-row: film;\n  grid-column: 1 / -1;\n}', '.film {\n  grid-row: film;\n  grid-column: 1 / -1;\n  grid-template-columns: subgrid;\n}']],
    fails: unit('style', 'the strip is laid out with plain grid alone'),
  },
  {
    name: 'the photo on the strip touches the ruler',
    change: [['site/css/style.css', '  height: calc(var(--cell) * 2.6);\n  margin-bottom: 8px;\n', '  height: calc(var(--cell) * 2.6);\n']],
    fails: e2e('photo', 'while the strip is not mirrored and the layout stays'),
  },
  {
    name: 'the photo on the strip is half as tall',
    change: [['site/css/style.css', '  height: calc(var(--cell) * 2.6);\n  margin-bottom: 8px;\n', '  height: calc(var(--cell) * 1.3);\n  margin-bottom: 8px;\n']],
    fails: e2e('photo', 'while the strip is not mirrored and the layout stays'),
  },
  {
    name: '"Photo detail" beside the photo stands at the top of its row, not level with the photo',
    change: [['site/css/style.css', '  grid-column: label;\n  align-self: center;\n', '  grid-column: label;\n']],
    fails: e2e('photo', 'stands above the photo, at its left, where it shows whole'),
  },
  {
    name: 'no room under "Photo detail" where it stands above the photo',
    change: [['site/css/style.css', '  margin-bottom: 0;\n  padding: 0 0 4px;\n', '  margin-bottom: 0;\n  padding: 0;\n']],
    fails: e2e('photo', 'stands above the photo, at its left, where it shows whole', 'android'),
  },
  {
    name: "a photo's row keeps its own colors in forced colors",
    change: [['site/css/style.css', '  .film,\n  .looks__film {\n    forced-color-adjust: none;', '  .film,\n  .strip__photo,\n  .looks__film {\n    forced-color-adjust: none;']],
    fails: e2e('photo', 'label beside the photo takes'),
  },

  // ---- The photo reader
  {
    name: 'the strip watches its scroller for its width again',
    change: [['site/js/ui-strip.js', 'if (resizeObserver) resizeObserver.observe(width);', 'if (resizeObserver) resizeObserver.observe(scroller);']],
    fails: e2e('photo', 'starts and stops scrolling with a photo'),
  },
  {
    name: 'a paste takes the first image, file or not',
    change: [['site/js/ui-photo.js', "const item = images.find((i) => i.kind === 'file') || images[0];", 'const item = images[0];']],
    fails: e2e('photo', 'the first image that is a file'),
  },
  {
    name: 'the line that runs while the reader loads flickers under reduced motion',
    change: [['site/css/style.css', '.photo[aria-busy="true"]:empty::before { animation-duration: 3s !important; }', '.photo[aria-busy="true"]:empty::before { animation-duration: 3s; }']],
    fails: e2e('photo', 'the line that runs while the reader loads goes slowly'),
  },
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
  {
    name: 'a preview of a photo is stored while the photo is in use, and taken out when it is removed',
    change: [
      ['site/js/app.js', '    onApply(cells, format, polarity, shot) {\n      record();\n', "    onApply(cells, format, polarity, shot) {\n      record();\n      try { sessionStorage.setItem('dx-photo', shot.photo.toDataURL()); } catch (e) {}\n"],
      ['site/js/app.js', "    const origin = state.origin;\n    if (origin.kind === 'photo') photo.forget(origin.kept.picture);\n", "    const origin = state.origin;\n    try { sessionStorage.removeItem('dx-photo'); } catch (e) {}\n    if (origin.kind === 'photo') photo.forget(origin.kept.picture);\n"],
    ],
    fails: e2e('photo', 'a photo stays in the page'),
  },
  {
    name: 'a photo is sent as the page is left',
    change: [['site/js/ui-photo.js', '      const ticket = ++loads;\n', "      const ticket = ++loads;\n      addEventListener('pagehide', () => { navigator.sendBeacon('index.html', p.blob); }, { once: true });\n"]],
    fails: e2e('photo', 'a photo stays in the page'),
  },
  {
    name: 'a photo is sent when it is opened again from the bar',
    change: [['site/js/ui-photo.js', '    function restore(kept) {\n', "    function restore(kept) {\n      if (kept.picture.blob) fetch('index.html', { method: 'POST', body: kept.picture.blob }).catch(() => {});\n"]],
    fails: e2e('photo', 'a photo stays in the page'),
  },
  {
    name: "a photo's name is kept in the session history",
    change: [['site/js/ui-photo.js', '      const ticket = ++loads;\n', "      const ticket = ++loads;\n      try { history.replaceState({ photo: p.blob.name }, '', location.href); } catch (e) {}\n"]],
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
    change: [['site/js/ui-reference.js', "      if (whole) count.textContent = '';\n      else {\n", '      {\n']],
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
    change: [['site/css/style.css', '.ref-count-row {\n  min-height: 1.8em;\n  font-size: 0.875rem;\n}\n', '.ref-count-row {\n  font-size: 0.875rem;\n}\n']],
    fails: e2e('lookup', 'counts what its filters leave'),
  },
  {
    name: 'code list: the count line is too low for Chinese',
    change: [['site/css/style.css', '.ref-count-row {\n  min-height: 1.8em;\n', '.ref-count-row {\n  min-height: 1.55em;\n']],
    fails: e2e('i18n', 'counts its products in Chinese'),
  },
  {
    name: 'code list: “Clear filters” never shows',
    change: [['site/js/ui-reference.js', '      reset.hidden = whole;\n', '']],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” stays when nothing is chosen',
    change: [['site/js/ui-reference.js', '      reset.hidden = whole;\n', '      reset.hidden = false;\n']],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” leaves the manufacturer chosen',
    change: [['site/js/ui-reference.js', "      maker.value = '';\n      status.value = '';\n      listPart1();", "      status.value = '';\n      listPart1();"]],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” leaves the status chosen',
    change: [['site/js/ui-reference.js', "      maker.value = '';\n      status.value = '';\n      listPart1();", "      maker.value = '';\n      listPart1();"]],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” leaves the Part 1 number chosen',
    change: [['site/js/ui-reference.js', "      listPart1();\n      part1.value = '';\n      render();\n      // The link has gone", '      listPart1();\n      render();\n      // The link has gone']],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” brings the Manufacturer menu to the middle of the screen',
    change: [['site/js/ui-reference.js', "      maker.focus({ preventScroll: true });\n      maker.closest('.field').scrollIntoView({ block: 'nearest' });\n", '      maker.focus();\n']],
    fails: e2e('lookup', 'no further than it takes to show the Manufacturer menu'),
  },
  {
    name: 'code list: “Clear filters” leaves keyboard focus on a menu out of view',
    change: [['site/js/ui-reference.js', "      maker.closest('.field').scrollIntoView({ block: 'nearest' });\n", '']],
    fails: e2e('lookup', 'no further than it takes to show the Manufacturer menu'),
  },
  {
    name: 'code list: “Clear filters” shows the Manufacturer menu without its label',
    change: [['site/js/ui-reference.js', "      maker.closest('.field').scrollIntoView({ block: 'nearest' });\n", "      maker.scrollIntoView({ block: 'nearest' });\n"]],
    fails: e2e('lookup', 'no further than it takes to show the Manufacturer menu'),
  },
  {
    name: 'code list: after “Clear filters”, keyboard focus is nowhere',
    change: [['site/js/ui-reference.js', '      maker.focus({ preventScroll: true });\n', '']],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” stands after the count again, not beside the menus',
    change: [['site/js/ui-reference.js', "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status),\n          reset)),\n      h('div', { class: 'ref-count-row' }, count),\n", "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status))),\n      h('div', { class: 'ref-count-row' }, count, reset),\n"]],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'code list: “Clear filters” is lower than a menu, its words under theirs',
    change: [['site/css/style.css', '.ref-reset {\n  display: inline-flex;\n  align-items: center;\n  min-height: 40px;\n', '.ref-reset {\n  display: inline-flex;\n  align-items: center;\n']],
    fails: e2e('lookup', 'while a menu is chosen'),
  },
  {
    name: 'printed, a strip may be cut in two where a page ends',
    change: [['site/css/style.css', '  .strip {\n    break-inside: avoid;\n  }\n', '']],
    fails: e2e('site', 'printed, the strip keeps its film and bars'),
  },
  {
    name: 'code list: “Clear filters” is said in English on the Chinese page',
    change: [['site/js/i18n/zh-CN.js', '    "Clear filters":\n      "清除筛选条件",\n', '    "Clear filters":\n      "Clear filters",\n']],
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
    change: [['site/js/ui-reference.js', "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status),\n          reset)),", "          h('div', { class: 'field' }, h('label', { for: 'ref-status' }, t('Status in 2008')), status), h('input', { type: 'search' }),\n          reset)),"]],
    fails: e2e('lookup', 'has no text box'),
  },
  {
    name: 'code list: the browser restores the Part 1 menu after Back',
    change: [['site/js/ui-reference.js', "const part1 = h('select', { id: 'ref-part1', class: 'input', autocomplete: 'off' });", "const part1 = h('select', { id: 'ref-part1', class: 'input' });"]],
    fails: e2e('lookup', 'after Back loads the page again'),
  },

  // ---- The strip, the result and the page
  {
    name: 'a film row: its source comes after its name again',
    change: [['site/js/ui-result.js', "h('span', { class: 'match__title' }, sourceTag(kind), said(), dot(), h('span', { class: 'match__name' }, film.name)),", "h('span', { class: 'match__title' }, h('span', { class: 'match__name' }, film.name), said(), dot(), sourceTag(kind)),"]],
    fails: e2e('lookup', 'stands before its name as three letters'),
  },
  {
    name: "a film row: the tip of its source's letters is the letters again",
    change: [['site/js/ui-result.js', "title: 'The Big Film Database', lang:", "title: 'BFD', lang:"]],
    fails: e2e('lookup', 'stands before its name as three letters'),
  },
  {
    name: 'a film row: its source is a piece of its own, which a long name leaves alone on a line',
    change: [['site/js/ui-result.js', "      h('span', { class: 'match__title' }, sourceTag(kind), said(), dot(), h('span', { class: 'match__name' }, film.name)),", "      sourceTag(kind),\n      h('span', { class: 'match__name' }, film.name),"]],
    fails: e2e('lookup', 'stands before its name as three letters'),
  },
  {
    name: "a film row: its source's letters are not the ones “How the DX edge code works” explains",
    change: [['site/js/ui-result.js', "}, 'BFD');", "}, 'TBFD');"]],
    fails: e2e('lookup', 'says what the letters of a film’s source stand for'),
  },
  {
    name: 'the source tag has an outline, as a button has',
    change: [['site/css/style.css', '  letter-spacing: 0.02em;\n  text-decoration: none;\n', '  letter-spacing: 0.02em;\n  text-decoration: none;\n  border: 1px solid var(--rule-strong);\n']],
    fails: e2e('site', 'gray letters on a gray tint with square corners'),
  },
  {
    name: 'the source tags are as wide as their own letters, so the names after them start at two places',
    change: [['site/css/style.css', '  display: inline-block;\n  min-width: 3.2em;\n  margin-right: 8px;\n', '  display: inline-block;\n  margin-right: 8px;\n']],
    fails: e2e('site', 'source tags are one width'),
  },
  {
    name: 'the letters of the narrower source tag stand at its left, not in its middle',
    change: [['site/css/style.css', '  text-decoration: none;\n  text-align: center;\n  vertical-align: 1px;\n', '  text-decoration: none;\n  vertical-align: 1px;\n']],
    fails: e2e('site', 'source tags are one width'),
  },
  {
    name: 'a line under the strip is back, told to screen readers',
    change: [['site/index.html', '          <div class="strip-host" id="strip"></div>\n', '          <div class="strip-host" id="strip"></div>\n          <p class="visually-hidden" aria-live="polite">Valid code.</p>\n']],
    fails: e2e('decoder', 'nothing under the strip says what the code reads as'),
  },
  {
    name: "the browser's own language is not looked at: English wherever the address names none",
    change: [['site/js/prepaint.js', "  root.DX.language = choose(new URLSearchParams(location.search).get('lang'), navigator.languages || [navigator.language]);\n", "  root.DX.language = choose(new URLSearchParams(location.search).get('lang'), []);\n"]],
    fails: e2e('i18n', 'where the address names no language'),
  },
  {
    name: 'a language kept in the browser by an earlier version is read again',
    change: [
      ['site/js/prepaint.js', "    localStorage.removeItem('dx-lang');\n", ''],
      ['site/js/prepaint.js', "  root.DX.language = choose(new URLSearchParams(location.search).get('lang'), navigator.languages || [navigator.language]);\n", "  root.DX.language = choose(new URLSearchParams(location.search).get('lang') || localStorage.getItem('dx-lang'), navigator.languages || [navigator.language]);\n"],
    ],
    fails: e2e('i18n', 'browser keeps nothing about the language'),
  },
  {
    name: 'a language kept in the browser by an earlier version stays there',
    change: [['site/js/prepaint.js', "    localStorage.removeItem('dx-lang');\n", '']],
    fails: e2e('i18n', 'browser keeps nothing about the language'),
  },
  {
    name: 'choosing a language saves it in the browser again',
    change: [['site/js/i18n.js', "    if (code === current.code || !available().some((l) => l.code === code)) return;\n", "    if (code === current.code || !available().some((l) => l.code === code)) return;\n    try { localStorage.setItem('dx-lang', code); } catch (e) { /* blocked */ }\n"]],
    fails: unit('i18n', 'no script keeps the language in the browser'),
  },
  {
    name: "the browser's language counts only by its whole tag: zh-TW gets English",
    change: [['site/js/prepaint.js', "const code = tag && (whole(tag) || codes.find((c) => first(c) === first(tag)));", "const code = tag && whole(tag);"]],
    fails: unit('i18n', 'by its whole tag or its first part'),
  },
  {
    name: "the browser's language wins over the one the address names",
    change: [['site/js/prepaint.js', "    if (named && whole(named)) return whole(named);\n", '']],
    fails: unit('i18n', 'the language the URL names wins'),
  },
  {
    name: 'the address names the language only where a link or the menu chose it',
    change: [['site/js/app.js', "    const query = `${urlQuery ? `${urlQuery}&` : '?'}lang=${encodeURIComponent(i18n.current)}`;\n", "    const named = new URLSearchParams(location.search).get('lang');\n    const query = named && named.toLowerCase() === i18n.current.toLowerCase() ? `${urlQuery ? `${urlQuery}&` : '?'}lang=${encodeURIComponent(i18n.current)}` : urlQuery;\n"]],
    fails: e2e('i18n', 'address always names the language shown'),
  },
  {
    name: 'the result: two rules where the button that copied a link stood',
    change: [['site/css/style.css', '.result .readout:last-child {\n  padding-bottom: 0;\n  border-bottom: 0;\n}\n', '']],
    fails: e2e('decoder', 'has no button that copies a link'),
  },
  {
    name: 'the result: a button that copies a link is back',
    change: [['site/js/ui-result.js', "        h('div', null, side)),", "        h('div', null, side, h('button', { type: 'button', class: 'tool' }, 'Copy link'))),"]],
    fails: e2e('decoder', 'has no button that copies a link'),
  },
  {
    name: 'compared with a commit: what a closed fold holds counts as shown',
    change: [['scripts/check-regressions.mjs', ' && (!el.checkVisibility || el.checkVisibility());', ';']],
    fails: e2e('site', 'sees a part of the page that moves as a whole'),
  },
  {
    name: 'compared with a commit: where a part stands on the page is not looked at',
    change: [['scripts/check-regressions.mjs', '      places[name] = [Math.round((at.left + scrollX) * 2) / 2, Math.round((at.top + scrollY) * 2) / 2];\n', '']],
    fails: e2e('site', 'sees a part of the page that moves as a whole'),
  },
  {
    name: 'reduced motion: transitions only shortened',
    change: [['site/css/style.css', '    transition: none !important;', '    transition-duration: 1ms !important;']],
    fails: e2e('site', 'with reduced motion nothing'),
  },
  {
    name: "code list: the menus may be wider than their row",
    change: [['site/css/style.css', '.ref-filters .field,\n.ref-filters .input {\n  min-width: 0;\n  max-width: 100%;\n}\n', '']],
    fails: e2e('lookup', 'no wider than a 320 px screen'),
  },
  {
    name: "Find a film's box stands beside its label where the two fit",
    change: [['site/css/style.css', '  display: block; /* under its label, also where the two would fit on one line */\n', '']],
    fails: e2e('lookup', 'box stands under its label'),
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
    name: "a name's period is doubled by a Chinese period",
    change: [['site/js/ui-result.js', "return words.endsWith('.') ? pieces : pieces.concat(mark);", "return mark === '.' && words.endsWith('.') ? pieces : pieces.concat(mark);"]],
    fails: e2e('i18n', 'a name that ends in a period'),
  },
  {
    name: "the result's title takes no focus",
    change: [['site/js/ui-result.js', "h('span', { id: 'result-title', tabindex: '-1' }, t('Waiting for bars'))", "h('span', { id: 'result-title' }, t('Waiting for bars'))"]],
    fails: e2e('decoder', 'focus in the result goes'),
  },
  {
    name: 'a browser without :focus-visible throws where the page asks whether focus shows',
    change: [['site/js/ui-dom.js', "    try {\n      return el.matches(':focus-visible');\n    } catch (e) {\n      return true;\n    }\n", "    return el.matches(':focus-visible');\n"]],
    fails: e2e('photo', 'in a browser that does not know :focus-visible'),
  },
  {
    name: 'a browser without :focus-visible is taken to show no focus',
    change: [['site/js/ui-dom.js', "    } catch (e) {\n      return true;\n    }\n", "    } catch (e) {\n      return false;\n    }\n"]],
    fails: e2e('photo', 'in a browser that does not know :focus-visible'),
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

  // ---- The checks by machine
  {
    name: 'check:types passes when the compiler found nothing to check',
    change: [['scripts/check-types.mjs', '    if (own) {\n      out.push(own[1]);\n      continue;\n    }\n', '']],
    fails: unit('checks', 'check:types reports unused and unreached code'),
  },
  {
    name: 'check:types passes over a setting the compiler does not know',
    change: [['scripts/check-types.mjs', 'if (!settings && Number(code) >= 2000', 'if (Number(code) >= 2000']],
    fails: unit('checks', 'check:types reports unused and unreached code'),
  },

  // ---- What GitHub runs (.github/workflows/tests.yml)
  {
    name: 'the list of licenses (research/06) leaves out the snapshots, which are under CC BY-SA 4.0',
    change: [['research/06-sources-and-licensing.md', ' (`tests/regressions/`, written by', ' (written by']],
    fails: unit('data', 'carry attribution for the CC BY-SA data'),
  },
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
    name: 'the deploy runs whatever the tests say',
    change: [['.github/workflows/tests.yml', "    if: github.ref == 'refs/heads/main' && ", "    if: always() && github.ref == 'refs/heads/main' && "]],
    fails: unit('e2e-tags', 'deploys only after every job passed'),
  },
  {
    name: 'the config leaves the accessibility scans out on GitHub',
    change: [['playwright.config.cjs', '  fullyParallel: true,\n', '  fullyParallel: true,\n  grepInvert: process.env.CI ? /axe/ : undefined,\n']],
    fails: unit('e2e-tags', 'GitHub leaves out only the second theme'),
  },
  {
    name: 'GitHub runs every test on the iPhone, tagged or not',
    change: [['.github/workflows/tests.yml', '            tests: --project=iphone --grep @phone\n', '            tests: --project=iphone\n']],
    fails: unit('e2e-tags', 'GitHub runs every browser test on the desktop, in parts'),
  },
  {
    name: "GitHub keeps the browsers without the runner's Ubuntu release in the key",
    change: [['.github/workflows/tests.yml', 'key: playwright-${{ runner.os }}-${{ steps.system.outputs.release }}-', 'key: playwright-${{ runner.os }}-']],
    fails: unit('e2e-tags', 'kept by the Ubuntu release of the runner too'),
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

  // ---- The steps before a push (`npm run before-push`)
  {
    name: 'before-push: leaves out the mutants',
    change: [['scripts/before-push.mjs', "  { name: 'mutants', script: 'test:mutants' },\n", '']],
    fails: unit('before-push', 'runs the commands that DEVELOPING.md lists under it'),
  },
  {
    name: 'before-push: goes on after a step that failed',
    change: [['scripts/before-push.mjs', "    if (status === 'failed' && !keepGoing) stopped = true;\n", '']],
    fails: unit('before-push', 'stops at the first step that fails'),
  },
  {
    name: 'before-push: a step that ended without a status counts as passed',
    change: [['scripts/before-push.mjs', "run(step) === 0 ? 'passed' : 'failed'", "run(step) === 1 ? 'failed' : 'passed'"]],
    fails: unit('before-push', 'stops at the first step that fails'),
  },
  {
    name: 'before-push: with no test to repeat, the repeat step runs every test',
    change: [['scripts/before-push.mjs', "return places.length ? { ...step, args: places } : { ...step, skip: 'no browser test is new or changed' };", 'return { ...step, args: places };']],
    fails: unit('before-push', 'leaves the step out when none did'),
  },
  {
    name: 'before-push: a test counts as changed only when its first line does',
    change: [['scripts/before-push.mjs', 'const old = new Set(before.tests.map((test) => test.text));\n  const lines = after.tests.filter((test) => !old.has(test.text))', "const old = new Set(before.tests.map((test) => test.text.split('\\n')[0]));\n  const lines = after.tests.filter((test) => !old.has(test.text.split('\\n')[0]))"]],
    fails: unit('before-push', 'a browser test is repeated when it is new or reads differently'),
  },
  {
    name: 'before-push: a change outside the tests goes unsaid',
    change: [['scripts/before-push.mjs', 'outside: before.rest !== after.rest && !everyTest', 'outside: false']],
    fails: unit('before-push', 'a browser test is repeated when it is new or reads differently'),
  },
  {
    name: 'before-push: a comment outside the tests counts as a change to them all',
    change: [['scripts/before-push.mjs', '      if (!/^\\s*(\\/\\/.*)?$/.test(lines[i])) rest.push(lines[i]);\n', '      rest.push(lines[i]);\n']],
    fails: unit('before-push', 'a browser test is repeated when it is new or reads differently'),
  },
  {
    name: 'before-push: a test ends at the first closing line of any indent',
    change: [['scripts/before-push.mjs', '!lines[end].startsWith(`${start[1]}});`)', "!lines[end].trimStart().startsWith('});')"]],
    fails: unit('before-push', 'the browser tests of a file are found by the line each starts on'),
  },
  {
    name: 'before-push: a document changed alone goes unsaid',
    change: [['scripts/before-push.mjs', '  for (const [file, other] of withoutOtherVersion(changed)) lines.push(`- ${file} is changed and its other version, ${other}, is not.`);\n', '']],
    fails: unit('before-push', 'ends with what is left to do by hand'),
  },

  // ---- The page's snapshots (`npm run check:regressions`): a change no browser test is written for
  {
    name: 'snapshot: the film look chosen is not marked as chosen',
    change: [['site/js/app.js', "        setPressed(document.querySelector('[data-control=\"look\"]'), view.look);\n", '']],
    fails: regressions,
  },
  {
    name: "snapshot: the strip's edge fades are printed",
    change: [['site/css/style.css', '  .strip__viewport::before,\n  .strip__viewport::after {\n    display: none;\n  }\n', '']],
    fails: regressions,
  },
  {
    name: 'snapshot: the mouse rests on a cell of the strip as the page is looked at',
    change: [['scripts/check-regressions.mjs', 'await page.mouse.move(0, 0);', 'await page.locator(\'#strip .track--data [data-cell="2"]\').hover();']],
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
  {
    name: "snapshot: the code list's Chinese heading gets a space after DX",
    change: [['site/js/i18n/zh-CN.js', '    "DX code list":\n      "DX码列表",', '    "DX code list":\n      "DX 码列表",']],
    fails: regressions,
  },
];
