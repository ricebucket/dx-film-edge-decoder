// Accessibility checks with axe-core (its WCAG 2.2 level A and AA rules), in
// every interface language and in light and dark mode. axe-core is installed
// outside this repository, next to Playwright; see scripts/run-e2e.mjs.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { watchConsole } = require('./helpers.cjs');

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LANGUAGES = ['en', ...fs.readdirSync(path.join(__dirname, '..', '..', 'site', 'js', 'i18n'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3))];

/**
 * axe's findings, one line each (rule, element, advice); empty when the page
 * passes. `loading`: the page has not finished loading, and Safari's
 * document.fonts.ready waits for that.
 */
async function problems(page, include, { loading = false } = {}) {
  // From the top: on wide screens the sticky header would cover whatever is
  // scrolled under it, and axe would count those buttons as too small.
  await page.evaluate((loading) => {
    window.scrollTo(0, 0);
    return loading || document.fonts.ready;
  }, loading);
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}: ${v.help}`));
}

let checkConsole;
test.beforeEach(({ page }) => {
  checkConsole = watchConsole(page);
});
test.afterEach(() => checkConsole());

for (const lang of LANGUAGES) {
  for (const colorScheme of ['light', 'dark']) {
    test(`axe finds no WCAG A or AA problems (${lang}, ${colorScheme})`, async ({ page }) => {
      await page.addInitScript((code) => localStorage.setItem('dx-lang', code), lang);
      await page.emulateMedia({ colorScheme });

      // A decoded film, with the help panels, the photo reader, search and
      // cassette results, and two error messages showing.
      await page.goto('/?dx=96-12/14A');
      for (const help of await page.locator('[data-help]').all()) await help.click();
      await page.locator('#tab-photo').click();
      await page.locator('#photo .photo__drop .tool:not(.tool--primary)').click();
      await expect(page.locator('.photo__found')).toBeVisible();
      await page.locator('#finder-q').fill('hp5');
      await expect(page.locator('.finder__item').first()).toBeVisible();
      await page.locator('#cassette-code').fill('017563');
      await page.locator('#cassette-code').press('Enter');
      await expect(page.locator('.cassette__result')).toBeVisible();
      await page.locator('#finder-frame').fill('64');
      await page.locator('.finder__item .tool:not([disabled])').first().click();
      await expect(page.locator('#finder-frame-help.is-error')).toBeVisible();
      await page.locator('#direct-dx').fill('79');
      await page.locator('#direct-dx').press('Enter');
      await expect(page.locator('#direct-help.is-error')).toBeVisible();
      await expect(page.locator('#reference-ui .assign-table')).toHaveCount(1);
      expect(await problems(page)).toEqual([]);

      // The photo's code in use: the reader folded up, its bar above the strip.
      await page.locator('#photo .result__actions .tool--primary').click();
      await expect(page.locator('#source')).toBeVisible();
      expect(await problems(page, '#decoder')).toEqual([]);
      // A code shown from the search (the frame field held 64, an error, above): the bar says so, with a way back.
      await page.locator('#finder-frame').fill('');
      await page.locator('.finder__item .tool:not([disabled])').first().click();
      await expect(page.locator('#source .source__icon')).toBeVisible();
      expect(await problems(page, '#decoder')).toEqual([]);

      // An invalid code (the bar now says it was edited), then an empty strip: only the decoder changes.
      await page.locator('#strip .track--data [data-cell="8"]').click();
      await expect(page.locator('#strip .strip')).not.toHaveClass(/is-valid/);
      expect(await problems(page, '#decoder')).toEqual([]);
      await page.locator('#clear').click();
      await expect(page.locator('#strip .track--data button.is-bar')).toHaveCount(0);
      expect(await problems(page, '#decoder')).toEqual([]);
    });

    if (lang !== 'en') {
      test(`axe finds no WCAG A or AA problems in the note shown while the language file is slow (${lang}, ${colorScheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        await page.route(`**/js/i18n/${lang}.js`, async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(`/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.language-wait')).toBeVisible({ timeout: 6000 });
        expect(await problems(page, null, { loading: true })).toEqual([]);
        release();
        await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
      });
    }

    test(`axe finds no WCAG A or AA problems on the sources page (${lang}, ${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(lang === 'en' ? '/sources.html' : `/sources.${lang}.html`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('#lang-select option')).toHaveCount(LANGUAGES.length);
      expect(await problems(page)).toEqual([]);
    });
  }
}
