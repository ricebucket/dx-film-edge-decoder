const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { watchConsole, dataCell, setCells, sideOverflow } = require('./helpers.cjs');

test('the page is self-contained: every request stays on the site', async ({ page, baseURL }) => {
  const check = watchConsole(page);
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('/?dx=79-15/23');
  await page.getByRole('tab', { name: 'Read a photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toBeVisible();
  const external = requests.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(external).toEqual([]);
  check();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the page says it needs JavaScript in every language it has, since it cannot tell which is wanted', async ({ page }) => {
    await page.goto('/?lang=zh-CN');
    await expect(page.locator('.noscript p[lang="en"]')).toHaveText(/^This decoder needs JavaScript\./);
    await expect(page.locator('.noscript p[lang="zh-CN"]')).toHaveText(/^这个解码器需要 JavaScript。/);
  });
});

test('in Windows contrast themes the strip keeps its film and bars, and pressed controls stand out', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?dx=79-15/23');
  const bar = await page.locator('#strip .track--data [data-cell="1"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const gap = await page.locator('#strip .track--data [data-cell="2"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bar).not.toBe(gap);
  const style = (name) => page.locator('[data-control="format"]').getByRole('button', { name }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await style('11 thin bars')).not.toBe(await style('7 thin bars'));
});

test('in Windows contrast themes the labels around the strip take the theme\'s colors, and the steps\' buttons show when on', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'contrast themes are a Windows desktop feature');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?dx=79-15/23');
  const adjust = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).forcedColorAdjust);
  expect(await adjust('#strip .film')).toBe('none');
  expect(await adjust('#strip .annot')).toBe('auto');
  const mirror = page.locator('.inline-button[data-for="mirror-toggle"]').first();
  const before = await mirror.evaluate((el) => getComputedStyle(el).backgroundColor);
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  expect(await mirror.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
});

test('without JavaScript the notice comes first, before the decoder that needs it', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  const notice = await page.locator('.noscript').boundingBox();
  const decoder = await page.locator('#decoder').boundingBox();
  expect(notice.y).toBeLessThan(decoder.y);
  await context.close();
});

test('on a phone, "Copy failed" and the bar above the strip stay inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/?dx=79-15/23');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copy failed: copy the link below' })).toBeVisible();
  expect(await sideOverflow(page)).toEqual([]);
  // The longest "back" button, after a cassette lookup.
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Show the edge barcode' }).click();
  const fits = await page.locator('#source').evaluate((bar) => {
    const edge = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
    return [...bar.querySelectorAll('button')].every((b) => b.getBoundingClientRect().right <= edge + 0.5);
  });
  expect(fits).toBe(true);
});

test('a pressed button stays legible under the mouse', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  const mirror = page.locator('#toolbar').getByRole('button', { name: 'Mirror' });
  await mirror.click(); // the mouse stays on it
  const { color, background } = await mirror.evaluate((el) => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  expect(color).not.toBe(background);
  expect(background).not.toBe('rgb(255, 255, 255)');
});

test('the browser bar follows the theme chosen on the page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('#theme-toggle').click(); // to dark
  const colors = await page.locator('meta[name="theme-color"]').evaluateAll((metas) => metas.map((m) => [m.getAttribute('media'), m.getAttribute('content')]));
  expect(colors).toEqual([[null, '#151c23'], [null, '#151c23']]);
});

test('headings step down one level at a time, and the help button is named by its words', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await expect(page.locator('#result h4')).toHaveCount(0);
  await expect(page.locator('#result h3.source-block__title').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Which layout do I have?', exact: true })).toBeVisible();
  // The read-only diagram in "How it works" is no tab stop.
  await expect(page.locator('#layout-figure .strip__scroller')).toHaveAttribute('tabindex', '-1');
});

test('it also works opened straight from disk (file://)', async ({ page }) => {
  const check = watchConsole(page);
  await page.goto(pathToFileURL(path.join(__dirname, '..', '..', 'site', 'index.html')).href);
  await setCells(page, '1010101001111011110101110010101'); // DX 79-15, frame 23
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await page.locator('#finder-q').fill('hp5 plus');
  await page.locator('.finder__item').first().getByRole('button', { name: /^Show barcode of / }).click();
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  check();
});

test('the sources and credits have a page of their own, reached from the footer', async ({ page, baseURL }) => {
  const check = watchConsole(page);
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('/?dx=79-15/23');
  await expect(page.locator('#community-credit')).toHaveCount(0);
  const footer = page.locator('.site-footer');
  await footer.getByRole('link', { name: 'The Big Film Database' }).click();
  await expect(page).toHaveURL(/\/sources\.html#community-credit$/);
  await expect(page).toHaveTitle('Sources and credits – DX Film Edge Decoder');
  await expect(page.locator('h1')).toHaveText('Sources and credits');
  await expect(page.locator('#community-credit')).toContainText('licensed under CC BY-SA 4.0');
  // Back on the decoder, the code is still on the strip.
  await page.goBack();
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  // The header works on the sources page too: a theme chosen there stays, and the name leads back.
  await footer.getByRole('link', { name: 'Sources and credits' }).click();
  await expect(page).toHaveURL(/\/sources\.html$/);
  await page.locator('#theme-toggle').click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole('link', { name: 'DX Film Edge Decoder', exact: true }).click();
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const external = requests.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(external).toEqual([]);
  check();
});

test('the sources page also works opened straight from disk (file://)', async ({ page }) => {
  const check = watchConsole(page);
  await page.goto(pathToFileURL(path.join(__dirname, '..', '..', 'site', 'index.html')).href);
  await page.locator('.site-footer').getByRole('link', { name: 'Sources and credits' }).click();
  await expect(page.locator('h1')).toHaveText('Sources and credits');
  await expect(page.locator('#lang-select option')).toHaveCount(2);
  check();
});

test('the theme choice is remembered', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#theme-toggle');
  const before = await page.evaluate(() => document.documentElement.dataset.theme || 'system');
  await toggle.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after === 'dark' || after === 'light').toBe(true);
  expect(after).not.toBe(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', after);
});

test('the film look is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Black-and-white negative' }).click();
  await page.reload();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'bw');
});

test('the film look is saved when chosen, not on every edit', async ({ page }) => {
  await page.addInitScript(() => {
    window.prefWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'dx-prefs') window.prefWrites++;
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 8).click();
  await dataCell(page, 9).click();
  expect(await page.evaluate(() => window.prefWrites)).toBe(0);
  await page.getByRole('button', { name: 'Black-and-white negative' }).click();
  expect(await page.evaluate(() => window.prefWrites)).toBe(1);
  // Choosing the look already shown saves it too: another tab may have saved a different one.
  await page.getByRole('button', { name: 'Black-and-white negative' }).click();
  expect(await page.evaluate(() => window.prefWrites)).toBe(2);
});

test('no horizontal page scrolling down to 320 px wide; only the strip scrolls sideways', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await page.getByRole('tab', { name: 'Read a photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toBeVisible();
  expect(await sideOverflow(page)).toEqual([]);
  // 320 px: the narrowest phones, and a 1280 px screen zoomed to 400%.
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await sideOverflow(page)).toEqual([]);
  await page.getByRole('button', { name: 'Which layout do I have?' }).click();
  await expect(page.locator('#layout-help')).toBeVisible();
  expect(await sideOverflow(page)).toEqual([]);
});

test('basic accessibility hooks are in place', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#decoder');
  const cell = page.locator('#strip .track--data button.cell').first();
  await expect(cell).toHaveAttribute('aria-label', 'Cell 7 of 31: Part 1, value 64');
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#strip .track--data')).toHaveAttribute('role', 'group');
  // Exactly one cell is in the tab order (roving tabindex).
  await expect(page.locator('#strip .track--data button[tabindex="0"]')).toHaveCount(1);
  for (const id of ['finder-q', 'direct-dx', 'direct-frame', 'cassette-code', 'ref-q', 'ref-maker', 'ref-status']) {
    await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  }
});

test('the film look is picked from small pieces of film under the strip, in its colors', async ({ page }) => {
  await page.goto('/');
  const looks = page.locator('.looks');
  const strip = page.locator('#strip .strip');
  // Not in the toolbar, whose buttons change the code.
  await expect(page.locator('#toolbar [data-control="look"]')).toHaveCount(0);
  const colors = (el) => el.evaluate((e) => ['--film-base', '--film-mark'].map((v) => getComputedStyle(e).getPropertyValue(v).trim()));
  for (const [name, look] of [['Black-and-white negative', 'bw'], ['Slide', 'slide'], ['Color negative', 'negative']]) {
    const film = looks.getByRole('button', { name, exact: true });
    await film.click();
    await expect(film).toHaveAttribute('aria-pressed', 'true');
    await expect(looks.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(strip).toHaveAttribute('data-look', look);
    expect(await colors(film)).toEqual(await colors(strip));
  }
});

test('only what can be clicked has a ring or a pill-shaped outline', async ({ page }) => {
  // Step numbers, statuses, the source bar's icon and the source tags are
  // plain or tinted, so they cannot be mistaken for the ? buttons or the chips.
  const outlinedButNotClickable = () => page.evaluate(() => {
    const CLICKABLE = 'button, a[href], input, select, textarea, summary, [role="tab"]';
    const ringed = (el, pseudo) => {
      const s = getComputedStyle(el, pseudo);
      if (!(parseFloat(s.borderTopWidth) > 0) || s.borderTopStyle === 'none') return false;
      const size = Math.min(parseFloat(s.width), parseFloat(s.height));
      const r = s.borderTopLeftRadius;
      const radius = r.endsWith('%') ? (parseFloat(r) / 100) * parseFloat(s.width) : parseFloat(r);
      return radius >= size / 2 - 1;
    };
    const found = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.getClientRects().length) continue; // not shown
      // A group of buttons, such as the layout choice, may have one around it.
      const group = el.children.length && [...el.children].every((c) => c.matches(CLICKABLE));
      if (ringed(el) && !el.matches(CLICKABLE) && !group) found.push(el.className || el.tagName);
      if (ringed(el, '::before')) found.push(`${el.className || el.tagName}::before`);
    }
    return found;
  });
  // A result with registry and community entries, search results and a cassette number.
  await page.goto('/?dx=96-12/14A');
  await page.locator('#finder-q').fill('cinestill');
  await expect(page.locator('.finder__item').first()).toBeVisible();
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toBeVisible();
  expect(await outlinedButNotClickable()).toEqual([]);
  // The copying steps and "Waiting for bars"; then the photo reader's steps and the example's source bar.
  await page.locator('#clear').click();
  expect(await outlinedButNotClickable()).toEqual([]);
  await page.locator('.examples .chip').first().click();
  await page.locator('#tab-photo').click();
  await expect(page.locator('#photo .photo__step').first()).toBeVisible();
  await expect(page.locator('#source')).toBeVisible();
  expect(await outlinedButNotClickable()).toEqual([]);
});

test('on phones the introduction can be folded away, and stays folded', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only: wider screens always show it');
  await page.goto('/');
  const lead = page.locator('#intro-lead');
  const toggle = page.locator('#intro-toggle');
  await expect(lead).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Hide the introduction' }).click();
  await expect(lead).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAccessibleName('Show the introduction');
  await page.reload();
  await expect(lead).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(lead).toBeVisible();
  await page.reload();
  await expect(lead).toBeVisible();
  await expect(toggle).toHaveAccessibleName('Hide the introduction');
});

test('on phones the steps show their titles until opened', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only: wider screens always show the steps in full');
  await page.goto('/');
  const steps = page.locator('#copy-steps');
  const more = page.getByRole('button', { name: 'How to copy the bars' });
  await expect(steps.getByRole('heading', { name: 'Copy the lower row' })).toBeVisible();
  await expect(steps.locator('li p').first()).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  for (const p of await steps.locator('li p').all()) await expect(p).toBeVisible();
  await more.click();
  await expect(steps.locator('li p').first()).toBeHidden();
});

test('wider screens show the introduction and the steps in full', async ({ page, isMobile }) => {
  test.skip(isMobile, 'wide screens only');
  // Folded earlier on a narrow screen: that choice is for phones.
  await page.addInitScript(() => localStorage.setItem('dx-intro', 'hidden'));
  await page.goto('/');
  await expect(page.locator('#intro-lead')).toBeVisible();
  await expect(page.locator('#intro-toggle')).toBeHidden();
  await expect(page.locator('#steps-more')).toBeHidden();
  for (const p of await page.locator('#copy-steps li p').all()) await expect(p).toBeVisible();
});
