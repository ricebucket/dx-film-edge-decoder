#!/usr/bin/env node
// Makes the generated pictures and videos again, in every language: the
// diagrams (make-figures.mjs), the screenshots (screenshots.mjs) and the
// demo videos (demo-video.mjs).
//
//   npm run media              # the videos only if the screenshots changed
//   npm run media -- --force   # the videos in any case
//
// Each recording of the videos comes out a little different, and each one
// committed adds about 27 MB to the repository's history, so they are
// recorded again only when the screenshots show a change: when this run
// changed them, or when they differ from the last commit while the videos
// are still its own (screenshots taken on their own since).

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './screenshots.mjs';
import { DEMO } from './demo-video.mjs';
import { isMain } from './lib/main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The files whose paths, from the repository root, start with one of `prefixes` (".github/demo" …). */
export function filesStarting(prefixes, root = ROOT) {
  return prefixes.flatMap((prefix) => {
    const dir = dirname(prefix);
    const start = prefix.slice(dir.length + 1);
    let names;
    try {
      names = readdirSync(join(root, dir));
    } catch {
      return [];
    }
    return names.filter((name) => name.startsWith(start)).map((name) => `${dir}/${name}`);
  }).sort();
}

/** Each file's contents as a hash, by path. */
function hashes(files) {
  return new Map(files.map((file) => [file, createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex')]));
}

/** Whether `files` are as the last commit has them; null where git can't tell (no checkout, no files). */
function asCommitted(files) {
  if (!files.length) return null;
  // New files count, also where git is set to leave untracked or ignored files out.
  const run = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--ignored', '--', ...files], { cwd: ROOT, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() === '' : null;
}

/**
 * Why the videos are to be recorded again, or null if they are not: asked
 * for; the screenshots changed in this run; or the screenshots differ from
 * the last commit while the videos are still the commit's own.
 */
export function videosDue({ force, screensChanged, screensCommitted, videosCommitted }) {
  if (force) return 'asked for with --force';
  if (screensChanged) return 'the screenshots changed';
  if (screensCommitted === false && videosCommitted === true) return 'the screenshots differ from the last commit, and the videos are still its own';
  return null;
}

function step(script) {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], { stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== '--force');
  if (unknown) {
    console.error(`Unknown option ${unknown}: the only one is --force.`);
    process.exit(1);
  }
  step('make-figures.mjs');
  const screens = () => hashes(filesStarting(SHOTS.map((shot) => shot.file)));
  const before = screens();
  step('screenshots.mjs');
  const after = screens();
  const reason = videosDue({
    force: args.includes('--force'),
    screensChanged: after.size !== before.size || [...after].some(([file, hash]) => before.get(file) !== hash),
    screensCommitted: asCommitted([...after.keys()]),
    videosCommitted: asCommitted(filesStarting([DEMO.file])),
  });
  if (!reason) {
    console.log('The screenshots are as before: the demo videos were not recorded again (`npm run media -- --force` records them).');
    return;
  }
  console.log(`Recording the demo videos: ${reason}.`);
  step('demo-video.mjs');
}

if (isMain(import.meta)) main();
