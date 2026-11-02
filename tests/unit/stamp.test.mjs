import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampBuild } from '../../scripts/stamp-build.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SITE = join(ROOT, 'site');
const DATA = ['dx-data.js', 'dx-data-community.js', 'dx-index.js'];

/** A copy of site/ in a temporary folder, removed after `use`. */
async function withCopy(use) {
  const dir = mkdtempSync(join(tmpdir(), 'dx-stamp-'));
  try {
    cpSync(SITE, dir, { recursive: true });
    return await use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The page's lookup code and data files in `dir`, freshly required. */
function files(dir) {
  const load = createRequire(join(dir, 'js', 'test.cjs'));
  return { createLookup: load('./dx-lookup.js'), data: DATA.map((file) => load(`./${file}`)) };
}

/**
 * The build the photo reader's two scripts carry in `dir`: dx-image.js as
 * Node loads it, ui-photo.js (which needs a browser) as written.
 */
function readerBuilds(dir) {
  const image = createRequire(join(dir, 'js', 'test.cjs'))('./dx-image.js').BUILD;
  const slots = [...readFileSync(join(dir, 'js', 'ui-photo.js'), 'utf8').matchAll(/const BUILD = '([^']*)';/g)].map((m) => m[1]);
  assert.equal(slots.length, 1, 'ui-photo.js has one build');
  return [image, slots[0]];
}

describe('publishing (scripts/stamp-build.mjs)', () => {
  test('the repository keeps the build empty in the code and the three data files, which match so', () => {
    const { createLookup, data } = files(SITE);
    assert.equal(createLookup.BUILD, '');
    for (const file of data) assert.equal(file.build, '');
    assert.doesNotThrow(() => createLookup(...data));
    // The photo reader, which the page checks against its own when it loads it.
    assert.deepEqual(readerBuilds(SITE), ['', '']);
  });

  test('the copy published carries the commit in the code and the data, and asks for every script and stylesheet by it', async () => {
    await withCopy(async (dir) => {
      const { pages } = await stampBuild(dir, 'a1b2c3d4e5f6');
      assert.deepEqual(pages, ['index.html', 'sources.html', 'sources.zh-CN.html']);
      const { createLookup, data } = files(dir);
      assert.equal(createLookup.BUILD, 'a1b2c3d4e5f6');
      for (const file of data) assert.equal(file.build, 'a1b2c3d4e5f6');
      assert.doesNotThrow(() => createLookup(...data));
      assert.deepEqual(readerBuilds(dir), ['a1b2c3d4e5f6', 'a1b2c3d4e5f6']);
      for (const page of pages) {
        const html = readFileSync(join(dir, page), 'utf8');
        const local = [...html.matchAll(/\s(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
        assert.ok(local.length > 0, page);
        for (const url of local) assert.match(url, /\.(?:js|css)\?v=a1b2c3d4e5f6$/, `${page}: ${url}`);
      }
      // Nothing but those changed: the data is the same, and so is its version.
      const before = files(SITE).data;
      data.forEach((file, i) => assert.deepEqual({ ...file, build: '' }, before[i]));
    });
  });

  test('code and data of different deploys stop the page, either way around', async () => {
    await withCopy(async (dir) => {
      await stampBuild(dir, '0123456789ab');
      const stamped = files(dir);
      const unstamped = files(SITE);
      assert.throws(() => stamped.createLookup(...unstamped.data), /another deploy/);
      assert.throws(() => unstamped.createLookup(...stamped.data), /another deploy/);
      for (let n = 0; n < 3; n++) {
        const mixed = stamped.data.map((file, k) => (k === n ? unstamped.data[k] : file));
        assert.throws(() => stamped.createLookup(...mixed), /another deploy/, DATA[n]);
      }
    });
  });

  test('the command stamps only the directory it is given', async () => {
    await withCopy(async (dir) => {
      // The script in a copy of the project, run without a directory: the copy's site/ stays as it was.
      for (const file of ['stamp-build.mjs', 'lib/main.mjs']) cpSync(join(ROOT, 'scripts', file), join(dir, 'project', 'scripts', file));
      cpSync(SITE, join(dir, 'project', 'site'), { recursive: true });
      const index = readFileSync(join(dir, 'project', 'site', 'index.html'), 'utf8');
      const run = spawnSync(process.execPath, [join(dir, 'project', 'scripts', 'stamp-build.mjs'), 'a1b2c3d4e5f6'], { cwd: join(dir, 'project'), encoding: 'utf8' });
      assert.equal(run.status, 1);
      assert.match(run.stderr, /^Usage: node scripts\/stamp-build\.mjs <commit hash> <site directory>/);
      assert.equal(readFileSync(join(dir, 'project', 'site', 'index.html'), 'utf8'), index);
    });
  });

  test('the command stamps a copy named by a path relative to where it runs', async () => {
    await withCopy(async (dir) => {
      const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'stamp-build.mjs'), 'a1b2c3d4e5f6', basename(dir)], { cwd: dirname(dir), encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const { createLookup, data } = files(dir);
      assert.equal(createLookup.BUILD, 'a1b2c3d4e5f6');
      for (const file of data) assert.equal(file.build, 'a1b2c3d4e5f6');
    });
  });

  test('a stamp that stops leaves the copy as it was: every slot and page is checked before a file is written', async () => {
    await withCopy(async (dir) => {
      const all = () => Object.fromEntries(readdirSync(dir, { recursive: true }).filter((name) => /\.(?:js|html)$/.test(name)).map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
      // The last data file with its slot twice: the code and the other two would be stamped by then.
      const index = join(dir, 'js', 'dx-index.js');
      const text = readFileSync(index, 'utf8');
      writeFileSync(index, text.replace('"build":""', '"build":"","build":""'));
      let before = all();
      await assert.rejects(stampBuild(dir, 'a1b2c3d4e5f6'), /js\/dx-index\.js: expected "build":"" exactly once/);
      assert.deepEqual(all(), before);
      // A page with no script or stylesheet: the code and the data would be stamped by then.
      writeFileSync(index, text);
      writeFileSync(join(dir, 'extra.html'), '<!doctype html><title>Nothing to stamp</title>');
      before = all();
      await assert.rejects(stampBuild(dir, 'a1b2c3d4e5f6'), /extra\.html: no script or stylesheet to stamp/);
      assert.deepEqual(all(), before);
    });
  });

  test('the stamp checks the copy it stamped: code and data that do not go together stop it', async () => {
    await withCopy(async (dir) => {
      // dx-index.js of another build: its version is another.
      const file = join(dir, 'js', 'dx-index.js');
      writeFileSync(file, readFileSync(file, 'utf8').replace(/"version":"[0-9a-f]{16}"/, '"version":"0000000000000000"'));
      await assert.rejects(stampBuild(dir, 'a1b2c3d4e5f6'), /different builds/);
    });
  });

  test('a stamp needs a commit hash, and the empty slots: a copy is stamped once', async () => {
    await withCopy(async (dir) => {
      for (const bad of ['', 'main', 'A1B2C3D', 'a1b2c3', '0'.repeat(41), 'a1b2c3d"; alert(1)//']) {
        await assert.rejects(stampBuild(dir, bad), /not a commit hash/, bad);
      }
      await stampBuild(dir, 'a1b2c3d');
      await assert.rejects(stampBuild(dir, 'a1b2c3d'), /exactly once/);
    });
  });

  test('the repository\'s pages ask for every script and stylesheet the stamp reaches, and nothing outside js/ and css/', () => {
    for (const page of readdirSync(SITE).filter((name) => name.endsWith('.html'))) {
      const html = readFileSync(join(SITE, page), 'utf8');
      const scripts = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
      const sheets = [...html.matchAll(/<link\b[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
      for (const url of scripts) assert.match(url, /^js\/[^"?#]+\.js$/, `${page}: ${url}`);
      for (const url of sheets) assert.match(url, /^css\/[^"?#]+\.css$/, `${page}: ${url}`);
    }
  });

  test('GitHub stamps the commit into the copy it publishes, before it uploads it', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/tests.yml'), 'utf8');
    const deploy = workflow.slice(workflow.search(/^ {2}deploy:$/m));
    const stamp = deploy.search(/^ {8}run: node scripts\/stamp-build\.mjs "\$\{GITHUB_SHA::12\}" site\s*$/m);
    const upload = deploy.search(/^ {8}uses: actions\/upload-pages-artifact@/m);
    assert.ok(stamp > 0 && upload > stamp, 'the stamp comes before the upload, in the deploy job');
    // … whenever the upload runs, and a stamp that fails stops the deploy.
    const step = (at) => deploy.slice(deploy.lastIndexOf('\n      - ', at), deploy.indexOf('\n      - ', at));
    const when = (text) => (/^ {6}(?:- | {2})if: (.+)$/m.exec(text) || [])[1];
    assert.ok(when(step(upload)), 'the upload has its condition');
    assert.equal(when(step(stamp)), when(step(upload)));
    assert.doesNotMatch(step(stamp), /continue-on-error:/);
    // What it uploads is the folder the stamp wrote.
    assert.match(step(upload), /^ {10}path: site\s*$/m);
  });
});
