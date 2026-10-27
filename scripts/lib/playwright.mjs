// Find the Playwright installed *outside* this repository (it is deliberately
// not a project dependency): in a parent folder's node_modules, in
// PLAYWRIGHT_DIR, or in the global npm folder. See scripts/run-e2e.mjs for
// the one-time setup. Exits with instructions if it is missing.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function candidates() {
  const dirs = [];
  try {
    // Ordinary resolution from the project looks in the node_modules folders
    // of every parent directory, e.g. ~/node_modules.
    const pkg = createRequire(join(ROOT, 'package.json')).resolve('@playwright/test/package.json');
    dirs.push(dirname(dirname(dirname(pkg))));
  } catch {
    // not installed in a parent folder
  }
  if (process.env.PLAYWRIGHT_DIR) dirs.push(process.env.PLAYWRIGHT_DIR);
  try {
    dirs.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim());
  } catch {
    // npm not on PATH: only PLAYWRIGHT_DIR can help
  }
  return dirs;
}

/** The node_modules folder that contains @playwright/test. */
export function findPlaywright() {
  const nodeModules = candidates().find((dir) => existsSync(join(dir, '@playwright', 'test', 'cli.js')));
  if (!nodeModules) {
    console.error([
      'Playwright was not found. It is not a dependency of this project; install it once on your machine:',
      '  npm install -g @playwright/test @axe-core/playwright',
      '  npx playwright install --with-deps chromium webkit',
      'or set PLAYWRIGHT_DIR to a node_modules folder that contains @playwright/test.',
    ].join('\n'));
    process.exit(1);
  }
  return nodeModules;
}

/** Load @playwright/test from that folder. */
export function loadPlaywright() {
  return createRequire(join(findPlaywright(), 'noop.js'))('@playwright/test');
}
