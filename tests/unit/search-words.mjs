// The contract of the search by name (site/js/dx-lookup.js), as two tables
// of examples. A way of typing that is not listed here is not supported: a
// new rule for the search starts as a new row, and tests/unit/search.test.mjs
// then shows what it does to every other row.
//
//   WORDS    stage 1, `analyze`: a text as typed, beside the words the search
//            then looks for
//   LEVELS   stage 2, `matcher`: a text as typed and a row of films' texts,
//            beside how well the row matches (further down)
//
// WORDS
//
// Each row: the text typed, its words, and NUMBER where the whole text also
// reads as a DX number or a cassette number (which have lookups of their own:
// the search still takes it as words). A word is written
//
//   portra           matched by its letters and digits, as a whole word, the
//                    start of one or part of one
//   t-max → tmax     the same, with the letters and digits it is matched by
//                    where marks are typed in it
//   number 20-0      digits joined by marks: matched only as typed, never run
//                    into other digits ("200", "120-0")
//   typed 彩韵       letters of another script, or no letter or digit at all:
//                    matched as typed
//
// Words are written composed here (で); `analyze` gives a letter and its mark
// apart (て and ゛), which the test puts together again.

export const NUMBER = true;

export const WORDS = [
  // Words: lower case, accents dropped, full-width letters and digits as plain ones.
  ['portra 400', ['portra', '400']],
  ['PORTRA', ['portra']],
  ['  kodak   gold ', ['kodak', 'gold']],
  ['café', ['cafe']],
  ['ｆｕｊｉ２００', ['fuji200']],
  ['tmax400', ['tmax400']],
  ['made in japan', ['made', 'in', 'japan']],

  // Marks in or around a word are not matched: only its letters and digits.
  ['T-MAX 100', ['t-max → tmax', '100']],
  ['superia x-tra 400', ['superia', 'x-tra → xtra', '400']],
  ['hp5+', ['hp5+ → hp5']],
  ['(kodak)', ['(kodak) → kodak']],
  ['portra,400', ['portra,400 → portra400']],
  // A letter against digits joined by a mark makes them such a word too.
  ['x100-2', ['x100-2 → x1002']],

  // Digits joined by marks are a number, with any dash as a hyphen and
  // without the marks around them.
  ['20-0', ['number 20-0'], NUMBER],
  ['(20-0).', ['number 20-0'], NUMBER],
  ['“79-15”', ['number 79-15'], NUMBER],
  ['200–2', ['number 200-2']],
  ['１００－２', ['number 100-2'], NUMBER],
  ['100——2', ['number 100-2'], NUMBER],
  ['100/21', ['number 100/21']],
  ['100-2 optima', ['number 100-2', 'optima']],

  // Digits on their own are a word like any other.
  ['200', ['200'], NUMBER],
  ['79', ['79']],
  ['1991', ['1991'], NUMBER],
  ['012794', ['012794'], NUMBER],
  ['(012794)', ['(012794) → 012794'], NUMBER],
  ['DX 400', ['dx', '400'], NUMBER],
  ['dx coded', ['dx', 'coded']],

  // Letters of another script: a word of their own against Latin letters or
  // digits, with or without a space, and matched as typed.
  ['彩韵200', ['typed 彩韵', '200']],
  ['200彩韵', ['200', 'typed 彩韵']],
  ['彩韵 200', ['typed 彩韵', '200']],
  // With a mark between them they stay one word, matched as typed: its
  // letters are never dropped, which would leave only 200.
  ['彩韵-200', ['typed 彩韵-200']],
  ['業務用カラーフィルム100', ['typed 業務用カラーフィルム', '100']],
  ['写ルンです', ['typed 写ルンです']],
  // A letter's own mark stays with it: で is not て, a mark and 1600.
  ['写ルンで1600', ['typed 写ルンで', '1600']],
  ['Свема', ['typed свема']],
  ['ДС100', ['typed дс', '100']],

  // Nothing typed, or only spaces: no words, and nothing is found.
  ['', []],
  ['   ', []],
];

// LEVELS
//
// Each row: the text typed, the example row it is matched against (ROWS), and
// how well that row matches: one of the levels of MATCH in dx-lookup.js, best
// first, or 'not found' where the row lacks one of the words.
//
//   words             every word is a whole word of the name, or neighboring
//                     words of it written together
//   starts            every word starts a word of the name
//   inName            the name has the text as typed
//   pieces            the name has every word somewhere, not side by side
//   elsewhere         every word is a whole word of some field
//   elsewhereStarts   every word starts a word of some field
//   elsewhereInside   every word is somewhere in the row's fields
//
// An example row is a film's name, then its other fields (a maker, a note,
// tags), each a field of its own: a match never runs from one into the next.

export const ROWS = {
  tmax: ['KODAK T-MAX 400 Film', 'Eastman Kodak Company', 'Tabular grain #pan'],
  optima: ['AGFA OPTIMA 100-2', 'Agfa-Gevaert'],
  xrg: ['Agfacolor XRG200-2'],
  speed: ['FILM 200'],
  longer: ['X 120-0'],
  frames: ['OPTIMA 100-24'],
  touching: ['OPTIMA 100-2X'],
  rebrand: ['Shop Brand 200', 'rebrand of DX 25-0 film'],
  apart: ['Photo Point', 'Max 400'],
  lucky: ['LUCKY COLOR 200 / Lucky Charm 200 (乐凯 彩韵200)'],
};

export const LEVELS = [
  // Whole words of the name, in any order, and neighboring words written together.
  ['tmax 400', 'tmax', 'words'],
  ['t-max', 'tmax', 'words'],
  ['tmax400', 'tmax', 'words'],
  ['kodak film', 'tmax', 'words'],
  // The start of a word, or of words written together.
  ['tma', 'tmax', 'starts'],
  ['kod 40', 'tmax', 'starts'],
  // Inside words, as typed; then word by word.
  ['odak t', 'tmax', 'inName'],
  ['odak ilm', 'tmax', 'pieces'],
  // Outside the name: a whole word, the start of one, the inside of one.
  ['eastman', 'tmax', 'elsewhere'],
  ['pan', 'tmax', 'elsewhere'],
  ['eastm', 'tmax', 'elsewhereStarts'],
  ['astman', 'tmax', 'elsewhereInside'],
  // A word in the name and one outside it count as the weaker of the two.
  ['kodak eastman', 'tmax', 'elsewhere'],
  // Every word typed must be in the row.
  ['portra', 'tmax', 'not found'],
  ['kodak portra', 'tmax', 'not found'],
  // A field's words are its own: "Point" and "Max" are no "pointmax".
  ['pointmax', 'apart', 'not found'],
  ['max 400', 'apart', 'elsewhere'],

  // Digits joined by a mark: a whole word where no letter or digit touches them …
  ['100-2', 'optima', 'words'],
  ['optima 100-2', 'optima', 'words'],
  // … the start of one where none comes before them, and inside one otherwise.
  ['100-2', 'touching', 'starts'],
  ['200-2', 'xrg', 'inName'],
  // They never run into other digits: "20-0" is no 200, nor part of "120-0"; "100-2" none of "100-24".
  ['20-0', 'speed', 'not found'],
  ['20-0', 'longer', 'not found'],
  ['100-2', 'frames', 'not found'],
  ['25-0', 'rebrand', 'elsewhere'],

  // Letters of another script are matched as typed: in the name, that is the text as typed.
  ['彩韵', 'lucky', 'inName'],
  ['彩韵200', 'lucky', 'inName'],
  ['彩韵 200', 'lucky', 'pieces'],
  ['lucky 200', 'lucky', 'words'],
];
