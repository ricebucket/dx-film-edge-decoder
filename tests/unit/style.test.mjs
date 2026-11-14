import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('the stylesheet (site/css/style.css)', () => {
  test('the dark theme chosen with the switch has the colors of the system\'s dark theme, which the accessibility tests check', () => {
    const css = readFileSync(join(ROOT, 'site', 'css', 'style.css'), 'utf8');
    // The declarations of a block that holds no other block, comments left out.
    const block = (selector) => {
      const at = css.indexOf(`${selector} {`);
      assert.ok(at >= 0, selector);
      const open = css.indexOf('{', at);
      return css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((d) => d.trim()).filter(Boolean).sort();
    };
    const chosen = block(':root[data-theme="dark"]');
    assert.ok(chosen.length > 30, chosen.join('; '));
    assert.deepEqual(chosen, block(':root:not([data-theme="light"])'));
  });

  test('the strip is laid out with plain grid alone: nothing that lines up its rows needs a newer browser', () => {
    const css = readFileSync(join(ROOT, 'site', 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // A browser without subgrid drops the declaration, and the film's number then lands on its code.
    assert.doesNotMatch(css, /subgrid/);
    // The strip's one grid: its three columns by name, swapped once for the mirrored strip.
    const columns = [...css.matchAll(/^\s*grid-template-columns: (\[[^;]*);/gm)].map((m) => [...m[1].matchAll(/\[([^\]]*)\]/g)].map((n) => n[1]));
    assert.deepEqual(columns, [
      ['label-start', 'label-end code-start', 'code-end tail-start', 'tail-end'],
      ['tail-start', 'tail-end code-start', 'code-end label-start', 'label-end'],
    ]);
    // Its rows by name, from the top: the ruler over the film, the labels of its fields under it.
    const rows = [...css.matchAll(/^\s*grid-template-rows: (\[[^;]*);/gm)].map((m) => [...m[1].matchAll(/\[([^\]]*)\]/g)].map((n) => n[1]));
    assert.deepEqual(rows, [['caption-start', 'caption-end photo-start', 'photo-end ruler-start', 'ruler-end film-start', 'film-end fields-start', 'fields-end']]);
    // Each part of the strip names the row and the column it stands in.
    const block = (selector) => {
      const at = css.indexOf(`\n${selector} {`);
      assert.ok(at >= 0, selector);
      return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
    };
    for (const [selector, row, column] of [['.ruler', 'ruler', 'code'], ['.film', 'film', '1 / -1'], ['.annot', 'fields', 'code'], ['.strip__photo-label', 'photo', 'label'], ['.strip__photo canvas', 'photo', 'code']]) {
      assert.match(block(selector), new RegExp(`grid-row: ${row};`), selector);
      assert.ok(block(selector).includes(`grid-column: ${column};`), selector);
    }
  });

  test('no color is mixed by the browser: the colors worked out from others are written out, and are what the mix gives', () => {
    const css = readFileSync(join(ROOT, 'site', 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // color-mix() came in 2023 (Chrome 111, Safari 16.2, Firefox 113). A browser without it leaves the
    // property unset: no + in the empty cells, a bar that vanishes under the mouse, a see-through header.
    assert.doesNotMatch(css, /color-mix\(/);
    // The variables of every block that sets the color named, by name.
    const blocks = (name) => [...css.matchAll(/\{([^{}]*)\}/g)].map((m) => Object.fromEntries([...m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()])))
      .filter((variables) => name in variables);
    const rgb = (color) => {
      const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
      if (hex) return hex.slice(1).map((pair) => parseInt(pair, 16));
      return /^rgba?\((\d+), (\d+), (\d+)/.exec(color).slice(1).map(Number);
    };
    // `share` percent of one color over another (in whole numbers, as 24.5 must round up, to 25).
    const over = (share, a, b) => `#${rgb(a).map((v, i) => Math.round((share * v + (100 - share) * rgb(b)[i]) / 100).toString(16).padStart(2, '0')).join('')}`;
    const faint = (color, alpha) => `rgba(${rgb(color).join(', ')}, ${alpha})`;
    const each = (name, count, expected) => {
      const found = blocks(name);
      assert.equal(found.length, count, `${name} is set in ${found.length} blocks`);
      for (const variables of found) assert.equal(variables[name], expected(variables), name);
    };
    // Light, and dark twice (chosen with the switch, and the system's).
    each('--header-bg', 3, (v) => faint(v['--bg'], 0.88));
    each('--tint', 3, (v) => faint(v['--ink-3'], 0.16));
    each('--cassette-lip', 3, (v) => over(82, v['--cassette-metal'], '#000000'));
    each('--cassette-lip-top', 3, (v) => over(88, v['--cassette-paint'], '#ffffff'));
    // The three film looks.
    each('--film-plus', 3, (v) => faint(v['--film-mark'], 0.4));
    each('--film-over-bar', 3, (v) => over(82, v['--film-mark'], v['--film-base']));
  });
});
