import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { classesInRules, styleProblems } from '../../scripts/check-styles.mjs';
import { reported } from '../../scripts/check-types.mjs';

// The checks themselves (`npm run check:types`, `npm run check:styles`) are
// run by hand before a review; these tests are of what they report.

test('check:types reports unused and unreached code, undefined names, wrong argument counts and broken syntax, and nothing about guessed types', () => {
  const output = [
    "site/js/app.js(229,64): error TS2339: Property 'dataset' does not exist on type 'Element'.",
    "site/js/ui-result.js(332,32): error TS6133: 'd' is declared but its value is never read.",
    "tests/unit/lookup.test.mjs(6,7): error TS6133: 'require' is declared but its value is never read.",
    "tests\\unit\\lookup.test.mjs(8,7): error TS6133: 'codec' is declared but its value is never read.",
    "scripts/x.mjs(3,32): error TS2554: Expected 0-1 arguments, but got 3.",
    "scripts/x.mjs(1,10): error TS2305: Module '\"./lib/main.mjs\"' has no exported member 'nope'.",
    "scripts/x.mjs(4,1): error TS2304: Cannot find name 'lokup'.",
    "scripts/x.mjs(5,1): error TS7027: Unreachable code detected.",
    "scripts/x.mjs(6,9): error TS1005: ';' expected.",
    "tests/unit/data.test.mjs(172,59): error TS2365: Operator '>=' cannot be applied to types 'string | number' and 'number'.",
    "  Type '{}' is missing the following properties from type 'Location'",
    // The compiler's own trouble: no file, or the settings.
    "error TS18003: No inputs were found in config file '/x/tsconfig.json'. Specified 'include' paths were '[\"nothing-here\"]'.",
    "tsconfig.json(17,27): error TS5023: Unknown compiler option 'noSuchOption'.",
    '',
  ].join('\n');
  assert.deepEqual(reported(output), [
    "site/js/ui-result.js(332,32): 'd' is declared but its value is never read.",
    "tests/unit/lookup.test.mjs(8,7): 'codec' is declared but its value is never read.",
    'scripts/x.mjs(3,32): Expected 0-1 arguments, but got 3.',
    "scripts/x.mjs(1,10): Module '\"./lib/main.mjs\"' has no exported member 'nope'.",
    "scripts/x.mjs(4,1): Cannot find name 'lokup'.",
    'scripts/x.mjs(5,1): Unreachable code detected.',
    "scripts/x.mjs(6,9): ';' expected.",
    "No inputs were found in config file '/x/tsconfig.json'. Specified 'include' paths were '[\"nothing-here\"]'.",
    "tsconfig.json(17,27): Unknown compiler option 'noSuchOption'.",
  ]);
  assert.deepEqual(reported(''), []);
});

test('the classes of a stylesheet are those in its selectors: not in comments, strings, attribute values or declarations', () => {
  const css = `
    /* .gone { } */
    .a, .b-c > .d__e:not(.f--g)::before { content: ".x { }"; margin: 0.5em; }
    @media (min-width: 30.5em) {
      .h.is-on [data-kind=".y"] .i { color: red; }
      .j { .k & { top: 0; } }
    }
    @keyframes spin { from { rotate: 0.25turn; } to { rotate: 1turn; } }
    a[href$=".pdf"] { color: blue; }
  `;
  assert.deepEqual([...classesInRules(css)].sort(), ['a', 'b-c', 'd__e', 'f--g', 'h', 'i', 'is-on', 'j', 'k']);
});

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dx-styles-test-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

test('check:styles reports a rule for a class nothing names, and a class set that nothing uses', () => {
  const dir = project({
    'site/css/style.css': '.page { } .used { } .dead-rule { } .cell--bar { } .cell--gone { } .pill--a { } .is-on { } .in-comment { } .hooked { }',
    'site/index.html': '<body class="page"><p class="used set-in-page">x</p><p class="hooked-by-test"></p></body>',
    'site/js/app.js': [
      "const el = h('div', { class: 'used set-in-script' });",
      'el.className = `cell cell--${kind}`;',
      "el.classList.toggle('is-on', on); el.classList.add('added', 'pill--a');",
      "el.classList.remove('hooked-by-script');",
      "document.querySelector('.hooked-by-script');",
      "el.innerHTML = '<i class=\"in-text\"></i>';",
      '// .in-comment is only named here',
      "el.setAttribute('class', 'by-attribute');",
    ].join('\n'),
    // The film tables are data: a name there is no use of a class.
    'site/js/dx-data.js': "const rows = ['dead-rule', 'set-in-page'];",
    'tests/e2e/x.spec.cjs': "page.locator('.hooked-by-test');",
    'scripts/y.mjs': "page.locator('.cell');",
  });
  try {
    assert.deepEqual(styleProblems(dir), {
      // "cell--gone" is one of the names `cell--${kind}` builds; ".in-comment" is named, in a comment.
      unusedRules: ['dead-rule', 'hooked'],
      unusedClasses: ['added', 'by-attribute', 'in-text', 'set-in-page', 'set-in-script'],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check:styles has nothing to say about a project whose rules and classes match, or one without pages', () => {
  const dir = project({
    'site/css/style.css': '.a { } .b { }',
    'site/index.html': '<p class="a"></p>',
    'site/js/app.js': "el.classList.add('b');",
  });
  const empty = project({ 'README.md': '' });
  try {
    assert.deepEqual(styleProblems(dir), { unusedRules: [], unusedClasses: [] });
    assert.deepEqual(styleProblems(empty), { unusedRules: [], unusedClasses: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});
