# Developing and deploying

A push to `main` publishes the site: GitHub runs part of the tests and then
deploys `site/`. This page lists every step around that, in the order they
come. What each command does is explained in the [README](README.md#tests);
the steps for the film data are in
[data/README.md](data/README.md#updating-the-data).

## Once, on a new machine

1. Install [Node.js](https://nodejs.org/) 22 or later.
2. Install Playwright and axe-core outside this folder, with their browsers:

   ```sh
   cd ~ && npm install @playwright/test @axe-core/playwright && npx playwright install --with-deps chromium webkit
   ```

3. Install TypeScript and the types of Node's modules outside this folder:

   ```sh
   cd ~ && npm install typescript @types/node
   ```

4. Install the REUSE tool: `pipx install reuse`.
5. For the Chinese screenshots and videos, install a Chinese font (on Ubuntu,
   the `fonts-noto-cjk` package).
6. Only to transcribe the I3A list again: Python 3 with PyMuPDF.
7. Once for the repository on GitHub: in Settings → Pages, set "Source" to
   "GitHub Actions".

Nothing is installed in this folder. `package.json` has no dependencies, and
it stays that way.

## With every change

- Before changing the codec, read [research/01](research/01-edge-code-format.md)
  and [research/02](research/02-frame-numbers.md). Before changing the film
  data, read [research/03](research/03-dx-numbers-and-registry.md) and
  [research/04](research/04-community-database.md).
- Keep to one concern per change.
- Add or adjust a test with it: a unit test in `tests/unit/`, or a browser test
  in `tests/e2e/`.
- Tag a browser test `@phone` if it works differently on a phone or runs only
  there. `npm test` fails when the tag is missing.
- In a browser test, take sizes and places that must agree in one step (one
  `page.evaluate`): a phone's strip scrolls a moment after it is drawn.
- Add a mutant for it to `tests/mutants.mjs`: the change taken out again, beside
  the test that must then fail.
- A text of the page is looked up with `t()`, and goes into every language file
  in `site/js/i18n/` in the same change. The sources page is changed in each of
  its versions.
- A document is changed in both its versions, `X.md` and `X.zh-CN.md`, in the
  same change.
- A value the page shows (a film, a maker, a rule, a number) comes from a
  source listed in [research/06](research/06-sources-and-licensing.md), and
  from nowhere else. A new source is added there.
- A finding about the format or the data is written into the research note
  that owns the topic, in both versions. Findings about the data are counts
  that `npm run stats:community-data` prints. The research notes never say
  what the tool does: that belongs in code comments, tests and the README.
- Code that means one film refers to it by its record ID (`lookup.byId`),
  never by a DX number, a cassette number or a name. The page never shows an
  ID.
- A new file needs a license in `REUSE.toml`. A file from elsewhere also needs
  an entry of its own there, its license text in `LICENSES/`, and its source in
  research/06.
- A script that produces or checks a part of the project goes into `scripts/`.
- A script or stylesheet the page loads stands under `site/js/` or `site/css/`,
  where the deploy stamps it.
- The page makes no request to another site, and still opens from disk
  (`site/index.html`): classic scripts, no modules and no workers.
- No browser feature that is discouraged (`document.write`, synchronous
  requests and the like), and none that only recent browsers have for
  anything the page's layout or working depends on.

## When a change is meant to move nothing

1. Before the change, copy `site/` to a folder outside the project.
2. After it, run `npm run check:regressions -- --against <that folder>`. It
   lists every element of the page that moved or changed size.
3. Run the browser tests on all three devices: `npm run test:e2e`.

## When a particular part changes

- **The strip, or what a hover or a key does in it:** measure the cost of
  moving the mouse across the cells at pixel ratio 1 and at 2, with the
  browser's performance panel and the processor slowed. The repo has no script
  for this.
- **Anything drawn with a background or a mask, in the strip or the result:**
  look at the printed page.
- **A drawing of film (the strip, the photo samples, the diagrams, the
  cassette):** it stays to scale, sized by the cell
  ([research/05](research/05-reading-real-film.md)).
- **The photo reader:** 7-bar codes must still be read. Compare what it reads
  from 7-bar photos with the version before the change.
- **The codec, or the labels of the diagrams:** run `npm run figures` (part of
  `npm run media`). `npm test` fails while a diagram is out of date.
- **The film data:** follow
  [data/README.md](data/README.md#updating-the-data).
- **A new language:** follow the [README](README.md#languages), then run
  `npm run check:regressions -- --update`, which writes a snapshot for it.
- **The GitHub workflow:** `npm test` checks which tests it names. The workflow
  itself runs only on GitHub: watch its first run.

## Before every push

1. `npm run before-push`. It runs these in turn and stops at the first that
   fails; `npm run before-push -- --keep-going` runs the rest all the same.
   It takes about ten minutes, and longer when many browser tests changed.
   - `npm test`: the unit tests. They also check that the data files, the
     diagrams, the texts in every language, the list of mutants and the links
     in the documents are up to date.
   - `npm run check:types` and `npm run check:styles`.
   - `reuse lint`.
   - `npm run check:regressions`: the page against its snapshots.
   - `npm run test:e2e`: every browser test on the desktop, the Android phone
     and the iPhone. This is the only run of the Android phone. Port 4173 must
     be free (or set `E2E_PORT`).
   - `npm run test:repeat` for each browser test that is new or changed since
     the last push: 20 times on each device.
   - `npm run test:mutants`. It takes about four minutes.
   - `npm run media`. It records the videos again only when the screenshots
     changed. When only the videos show a change (the photo reader, say),
     `npm run before-push -- --videos` records them in any case.
2. When the snapshots differ, settle the difference and run step 1 again:
   - A difference that was not meant: fix it.
   - A difference that was meant: run `npm run check:regressions -- --update`
     and read `git diff tests/regressions`.
3. When the command names a file of the browser tests that changed outside
   its tests (a helper, say): repeat the tests that use that part, each with
   `npm run test:repeat -- -g "words of its name"`.
4. Look at the pictures and watch the videos that the command lists as
   changed: the screenshots and the four videos in `.github/` (both shapes,
   both languages), and the diagrams in `research/img/`.
5. `git status` before the commit:
   - the snapshots, screenshots and videos that changed are part of it;
   - each changed document has its other version in it (the command names one
     that has not);
   - no file of `site/` carries a deploy stamp (`BUILD = ''` stays empty).

## What GitHub runs, and what it leaves to the steps above

GitHub runs, on every push and pull request:

- `npm test`;
- every browser test on the desktop, in four parts;
- the browser tests tagged `@phone` on the iPhone.

When all of these pass on `main`, it stamps the commit into a copy of `site/`
and publishes that. It does not publish from a pull request or from a fork.

GitHub does not run:

- the browser tests on the Android phone;
- the full accessibility scan in each language's second theme;
- `npm run check:regressions`, `npm run test:mutants` and
  `npm run test:repeat`;
- `npm run check:types` and `npm run check:styles`;
- `reuse lint`;
- `npm run media`.

## After the push

1. Open the run in the repository's Actions tab. Every job must pass; "Deploy
   to GitHub Pages" comes last.
2. A browser job that failed keeps its traces for seven days, as an artifact of
   the run.
3. Only the newest commit of `main` is published. If the site lags behind
   `main` (the newer push's run failed, say), "Run workflow" on `main` in the
   Actions tab publishes it again.
4. Open the published page and reload it. A tab that was open before the
   deploy may say "This page is out of date. Reload it." when it loads the
   photo reader.
