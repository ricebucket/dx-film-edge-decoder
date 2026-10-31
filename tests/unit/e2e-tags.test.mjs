import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// On GitHub, the phones run only the browser tests tagged @phone
// (.github/workflows/tests.yml). A test that works differently on a phone, or
// runs only there, asks for `isMobile` or `hasTouch`; unless it skips phones,
// it needs the tag, or GitHub would never run it on one.
const E2E = fileURLToPath(new URL('../e2e/', import.meta.url));
const DECLARATION = /^\s*test\((['"`])((?:\\.|(?!\1)[^\\])*)\1,\s*(\{[^{}]*\},\s*)?async\s*\(\{([^}]*)\}/gm;

test('browser tests that depend on the device are tagged @phone, unless they skip phones', () => {
  const untagged = [];
  const unread = [];
  let tests = 0;
  let tagged = 0;
  for (const file of readdirSync(E2E, { recursive: true }).filter((f) => /\.(spec|test)\.[cm]?js$/.test(f))) {
    const source = readFileSync(join(E2E, file), 'utf8');
    // Every test() the check can't read is one it can't vouch for.
    const declared = [...source.matchAll(DECLARATION)];
    const calls = (source.match(/^\s*test\(/gm) || []).length;
    if (declared.length !== calls) unread.push(`${file}: ${calls - declared.length} of ${calls} test() calls`);
    for (const [declaration, , title, options = '', fixtures] of declared) {
      tests++;
      const phone = /'@phone'/.test(options);
      if (phone) tagged++;
      if (!/\b(isMobile|hasTouch)\b/.test(fixtures) || phone) continue;
      // Desktop only: its first line skips the test where isMobile is true.
      const after = source.slice(source.indexOf(declaration) + declaration.length).slice(0, 300);
      const skip = /^\s*\)\s*=>\s*\{\s*test\.skip\(([^,]*),/.exec(after);
      const desktopOnly = skip && /^\s*(isMobile|.*\|\|\s*isMobile|isMobile\s*\|\|.*)\s*$/.test(skip[1]) && !/!\s*(isMobile|hasTouch)\b|isMobile\s*[=!]==?/.test(skip[1]);
      if (!desktopOnly) untagged.push(`${file}: ${title}`);
    }
  }
  assert.ok(tests > 100 && tagged > 0, `found ${tests} tests, ${tagged} tagged @phone`);
  assert.deepEqual(unread, [], 'test() calls in a form this check does not read');
  assert.deepEqual(untagged, []);
});
