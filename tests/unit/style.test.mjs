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
});
