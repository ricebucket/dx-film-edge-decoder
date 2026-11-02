#!/usr/bin/env node
// Stamps the copy of site/ about to be published with its build, the commit
// it comes from. GitHub's deploy job runs it on its own checkout, once every
// test has passed (.github/workflows/tests.yml); the repository keeps the
// slots empty, so site/ still opens from disk as it is.
//
//   node scripts/stamp-build.mjs <commit hash> <site directory>
//
// - dx-lookup.js and the three data files get the build, so that the page
//   stops on files of two deploys that a browser kept mixed.
// - So do the photo reader's two scripts, which the page loads later: from
//   another deploy, they make it ask for a reload (site/js/app.js).
// - Every page asks for its scripts and stylesheet as "…?v=<build>", so that
//   browsers fetch a new deploy's files rather than reuse old ones; the files
//   the page loads later ask for the same (site/js/prepaint.js).

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isMain } from './lib/main.mjs';

const DATA = ['js/dx-data.js', 'js/dx-data-community.js', 'js/dx-index.js'];
const READER = ['js/dx-image.js', 'js/ui-photo.js'];

/** `text` with its one `from` replaced by `to`: a slot missing, or found twice, stops the stamp. */
function once(text, from, to, file) {
  const at = text.indexOf(from);
  if (at === -1 || text.indexOf(from, at + 1) !== -1) throw new Error(`${file}: expected ${from} exactly once`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** Stamp the site in `dir` (a copy: its files are changed in place) with `build`. */
export async function stampBuild(dir, build) {
  if (!/^[0-9a-f]{7,40}$/.test(build)) throw new Error(`"${build}" is not a commit hash`);
  // A relative directory is read from where the command runs.
  const site = resolve(dir);
  // Every file is stamped in memory and checked before any is written: a
  // check that stops the stamp leaves the copy as it was.
  const stamped = new Map();
  const edit = async (file, change) => stamped.set(file, change(await readFile(join(site, file), 'utf8')));
  for (const file of ['js/dx-lookup.js', ...READER]) await edit(file, (text) => once(text, "const BUILD = '';", `const BUILD = '${build}';`, file));
  for (const file of DATA) await edit(file, (text) => once(text, '"build":""', `"build":"${build}"`, file));
  const pages = (await readdir(site)).filter((name) => name.endsWith('.html')).sort();
  for (const page of pages) {
    await edit(page, (text) => {
      const out = text
        .replace(/(<script\b[^>]*\ssrc="js\/[^"?#]+\.js)"/g, `$1?v=${build}"`)
        .replace(/(<link\b[^>]*\shref="css\/[^"?#]+\.css)"/g, `$1?v=${build}"`);
      if (out === text) throw new Error(`${page}: no script or stylesheet to stamp`);
      return out;
    });
  }
  // The stamped code takes the stamped data, as the page will: Node loads
  // them from a temporary folder, with the codec they need.
  const check = await mkdtemp(join(tmpdir(), 'dx-stamp-check-'));
  try {
    await mkdir(join(check, 'js'));
    // Loaded as CommonJS, like the repository's, whatever a package.json in a
    // folder above the temporary one says ("type": "module" would make them
    // ES modules, which take the browser's way and export nothing).
    await writeFile(join(check, 'package.json'), '{ "type": "commonjs" }\n');
    await writeFile(join(check, 'js', 'dx-codec.js'), await readFile(join(site, 'js', 'dx-codec.js')));
    for (const [file, text] of stamped) if (file.startsWith('js/')) await writeFile(join(check, file), text);
    const load = createRequire(join(check, 'js', 'stamp.cjs'));
    const createLookup = load('./dx-lookup.js');
    if (createLookup.BUILD !== build) throw new Error('js/dx-lookup.js: the build did not take');
    if (load('./dx-image.js').BUILD !== build) throw new Error('js/dx-image.js: the build did not take');
    createLookup(load('./dx-data.js'), load('./dx-data-community.js'), load('./dx-index.js'));
  } finally {
    await rm(check, { recursive: true, force: true });
  }
  for (const [file, text] of stamped) await writeFile(join(site, file), text);
  return { pages };
}

if (isMain(import.meta)) {
  // No directory of its own: a command without one would stamp the files in
  // the working tree, which the repository keeps unstamped. Nor a second:
  // anything after the directory would be left out.
  const args = process.argv.slice(2);
  const [build = '', dir] = args;
  if (!dir || args.length > 2) {
    console.error('Usage: node scripts/stamp-build.mjs <commit hash> <site directory>');
    process.exit(1);
  }
  stampBuild(dir, build).then(
    ({ pages }) => console.log(`Stamped build ${build} into ${dir}: js/dx-lookup.js, the photo reader, the three data files and ${pages.join(', ')}.`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
