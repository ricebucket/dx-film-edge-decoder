#!/usr/bin/env node
// `npm run check:types`: what a compiler can tell about the code without
// running it. It runs TypeScript over the JavaScript as it is (tsconfig.json;
// nothing is built) and reports
//
//   code that is never used or never reached
//   names that are not defined anywhere
//   calls with more arguments than the function takes, also from one of the
//     page's scripts into another (globals.d.ts)
//   anything that is not JavaScript at all
//
// and nothing else: the code has no type annotations, so the compiler's
// other complaints are about types it had to guess (which element a page
// holds, what a test's table contains).
//
// TypeScript is deliberately not a dependency of this project. Install it
// once, outside this folder, with the types of Node's own modules:
//   cd ~ && npm install typescript @types/node
// or globally (`npm install -g typescript @types/node`), or set
// TYPESCRIPT_DIR to the node_modules folder that contains it.
//
// Not part of `npm test`, and not run on GitHub: it is for a look before a
// review, with `npm run check:styles`.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The compiler's messages that are reported, by their numbers. */
const REPORTED = new Set([
  2304, 2552, // a name that is not defined
  2305, 2614, 2724, // a name imported from a module that does not export it
  2554, 2555, // a call with the wrong number of arguments
  2300, 2451, // a name declared twice
  2448, 2454, // a variable used before it is declared, or before it has a value
  6133, 6192, 6196, 6198, 6199, // declared and never used
  7027, 7028, // code never reached; a label never used
]);

/**
 * The lines of the compiler's output worth reporting, as "file(line,col): message".
 * Messages below 2000 are about text that is not JavaScript: always reported.
 * So is the compiler's own trouble, which leaves the code unchecked or checked
 * another way: a message with no file (no settings, nothing to check) and any
 * message about tsconfig.json.
 */
export function reported(output) {
  const out = [];
  for (const line of output.split('\n')) {
    const own = /^error TS\d+: (.*)$/.exec(line);
    if (own) {
      out.push(own[1]);
      continue;
    }
    const m = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(line);
    if (!m) continue;
    const [, file, row, column, code, message] = m;
    const settings = /(^|[\\/])tsconfig\.json$/.test(file);
    if (!settings && Number(code) >= 2000 && !REPORTED.has(Number(code))) continue;
    // `const require = createRequire(…)`: the compiler reads the calls of it as imports, and so takes the constant for unused.
    if (code === '6133' && message.startsWith("'require' is declared")) continue;
    out.push(`${file.replace(/\\/g, '/')}(${row},${column}): ${message}`);
  }
  return out;
}

/** The node_modules folder that contains TypeScript, outside this project; undefined if there is none. */
function findTypeScript() {
  const dirs = [];
  try {
    dirs.push(dirname(dirname(createRequire(join(ROOT, 'package.json')).resolve('typescript/package.json'))));
  } catch {
    // not installed in a parent folder
  }
  if (process.env.TYPESCRIPT_DIR) dirs.push(process.env.TYPESCRIPT_DIR);
  try {
    dirs.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim());
  } catch {
    // npm not on PATH: only TYPESCRIPT_DIR can help
  }
  return dirs.find((dir) => existsSync(join(dir, 'typescript', 'bin', 'tsc')));
}

function main() {
  const nodeModules = findTypeScript();
  if (!nodeModules) {
    console.error([
      'TypeScript was not found. It is not a dependency of this project; install it once, outside this folder:',
      '  cd ~ && npm install typescript @types/node',
      'or set TYPESCRIPT_DIR to a node_modules folder that contains typescript.',
    ].join('\n'));
    process.exit(1);
  }
  if (!existsSync(join(nodeModules, '@types', 'node'))) {
    console.error(`The types of Node's own modules are missing. Install them next to TypeScript, in ${dirname(nodeModules)}:\n  npm install @types/node   (add -g if TypeScript is installed globally)`);
    process.exit(1);
  }
  // The types beside the compiler, wherever that is: a global folder is not on the project's own path.
  const run = spawnSync(process.execPath, [join(nodeModules, 'typescript', 'bin', 'tsc'), '-p', join(ROOT, 'tsconfig.json'), '--pretty', 'false', '--typeRoots', join(nodeModules, '@types')], { cwd: ROOT, encoding: 'utf8' });
  const output = `${run.stdout}${run.stderr}`;
  const lines = reported(output).map((line) => (line.startsWith('/') ? relative(ROOT, line) : line));
  // Output with no message in it, and a failure: the compiler itself did not run.
  if (run.status !== 0 && !/error TS\d+/.test(output)) {
    console.error(output.trim() || `TypeScript stopped with status ${run.status}.`);
    process.exit(1);
  }
  if (lines.length) {
    console.error(`${lines.join('\n')}\n\n${lines.length} ${lines.length === 1 ? 'thing' : 'things'} to look at.`);
    process.exit(1);
  }
  console.log('Nothing unused, unreached or undefined, and no call with the wrong number of arguments.');
}

if (isMain(import.meta)) main();
