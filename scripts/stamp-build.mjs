#!/usr/bin/env node
// Stamps the copy of site/ about to be published with its build, the commit
// it comes from. GitHub's deploy job runs it on its own checkout, once every
// test has passed (.github/workflows/tests.yml); the repository keeps the
// slots empty, so site/ still opens from disk as it is.
//
//   node scripts/stamp-build.mjs <commit hash> [site directory]
//
// - dx-lookup.js and the three data files get the build, so that the page
//   stops on files of two deploys that a browser kept mixed.
// - Every page asks for its scripts and stylesheet as "…?v=<build>", so that
//   browsers fetch a new deploy's files rather than reuse old ones; the files
//   the page loads later ask for the same (site/js/prepaint.js).

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['js/dx-data.js', 'js/dx-data-community.js', 'js/dx-index.js'];

/** `text` with its one `from` replaced by `to`: a slot missing, or found twice, stops the stamp. */
function once(text, from, to, file) {
  const at = text.indexOf(from);
  if (at === -1 || text.indexOf(from, at + 1) !== -1) throw new Error(`${file}: expected ${from} exactly once`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** Stamp the site in `dir` (a copy: its files are changed in place) with `build`. */
export async function stampBuild(dir, build) {
  if (!/^[0-9a-f]{7,40}$/.test(build)) throw new Error(`"${build}" is not a commit hash`);
  const edit = async (file, change) => {
    const path = join(dir, file);
    await writeFile(path, change(await readFile(path, 'utf8')));
  };
  await edit('js/dx-lookup.js', (text) => once(text, "const BUILD = '';", `const BUILD = '${build}';`, 'js/dx-lookup.js'));
  for (const file of DATA) await edit(file, (text) => once(text, '"build":""', `"build":"${build}"`, file));
  const pages = (await readdir(dir)).filter((name) => name.endsWith('.html')).sort();
  for (const page of pages) {
    await edit(page, (text) => {
      const out = text
        .replace(/(<script\b[^>]*\ssrc="js\/[^"?#]+\.js)"/g, `$1?v=${build}"`)
        .replace(/(<link\b[^>]*\shref="css\/[^"?#]+\.css)"/g, `$1?v=${build}"`);
      if (out === text) throw new Error(`${page}: no script or stylesheet to stamp`);
      return out;
    });
  }
  // The stamped code takes the stamped data, as the page will.
  const load = createRequire(join(dir, 'js', 'stamp.cjs'));
  const createLookup = load('./dx-lookup.js');
  if (createLookup.BUILD !== build) throw new Error('js/dx-lookup.js: the build did not take');
  createLookup(load('./dx-data.js'), load('./dx-data-community.js'), load('./dx-index.js'));
  return { pages };
}

if (isMain(import.meta)) {
  const [build = '', dir = join(ROOT, 'site')] = process.argv.slice(2);
  stampBuild(dir, build).then(
    ({ pages }) => console.log(`Stamped build ${build} into ${dir}: js/dx-lookup.js, the three data files and ${pages.join(', ')}.`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
