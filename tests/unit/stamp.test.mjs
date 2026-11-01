import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('publishing (scripts/stamp-build.mjs)', () => {
  test('the repository keeps the build empty in the code and the three data files, which match so', () => {
    const { createLookup, data } = files(SITE);
    assert.equal(createLookup.BUILD, '');
    for (const file of data) assert.equal(file.build, '');
    assert.doesNotThrow(() => createLookup(...data));
  });

  test('the copy published carries the commit in the code and the data, and asks for every script and stylesheet by it', async () => {
    await withCopy(async (dir) => {
      const { pages } = await stampBuild(dir, 'a1b2c3d4e5f6');
      assert.deepEqual(pages, ['index.html', 'sources.html', 'sources.zh-CN.html']);
      const { createLookup, data } = files(dir);
      assert.equal(createLookup.BUILD, 'a1b2c3d4e5f6');
      for (const file of data) assert.equal(file.build, 'a1b2c3d4e5f6');
      assert.doesNotThrow(() => createLookup(...data));
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

  test('code and data of different deploys stop the page, either way round', async () => {
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
    const stamp = deploy.search(/^ {8}run: node scripts\/stamp-build\.mjs "\$\{GITHUB_SHA::12\}"\s*$/m);
    const upload = deploy.search(/^ {8}uses: actions\/upload-pages-artifact@/m);
    assert.ok(stamp > 0 && upload > stamp, 'the stamp comes before the upload, in the deploy job');
  });
});
