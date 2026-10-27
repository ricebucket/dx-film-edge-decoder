#!/usr/bin/env node
// Run the browser tests in tests/e2e with a Playwright installed *outside*
// this repository. Playwright, and axe-core for the accessibility checks, are
// deliberately not project dependencies.
//
// One-time setup on your machine, outside this folder: either globally
//   npm install -g @playwright/test @axe-core/playwright
// or in a parent folder such as your home directory
//   cd ~ && npm install @playwright/test @axe-core/playwright
// and then download the browsers:
//   npx playwright install --with-deps chromium webkit
//
// Then: npm run test:e2e [-- extra Playwright arguments]
// To use a Playwright installed elsewhere, set PLAYWRIGHT_DIR to the
// node_modules folder that contains @playwright/test. A copy in a parent
// folder always wins, because the test files load that one, and running a
// different copy would load Playwright twice.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlaywright } from './lib/playwright.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = findPlaywright();
if (!existsSync(join(nodeModules, '@axe-core', 'playwright'))) {
  console.error(`axe-core, for the accessibility checks, is missing. Install it next to Playwright, in ${dirname(nodeModules)}:`);
  console.error('  npm install @axe-core/playwright   (add -g if Playwright is installed globally)');
  process.exit(1);
}

// The specs are CommonJS, so NODE_PATH lets them require('@playwright/test').
const env = { ...process.env, NODE_PATH: [nodeModules, process.env.NODE_PATH].filter(Boolean).join(delimiter) };
const cli = join(nodeModules, '@playwright', 'test', 'cli.js');
const run = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], { cwd: ROOT, env, stdio: 'inherit' });
process.exit(run.status ?? 1);
