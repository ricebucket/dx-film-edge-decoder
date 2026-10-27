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
  await page.getByRole('button', { name: 'B&W negative' }).click();
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
  await page.getByRole('button', { name: 'B&W negative' }).click();
  expect(await page.evaluate(() => window.prefWrites)).toBe(1);
  // Choosing the look already shown saves it too: another tab may have saved a different one.
  await page.getByRole('button', { name: 'B&W negative' }).click();
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
  await page.getByRole('button', { name: 'What does the film look option do?' }).click();
  await expect(page.locator('#look-help')).toBeVisible();
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

test('the chosen film look shows its full name, the others a short one', async ({ page }) => {
  await page.goto('/');
  const looks = page.locator('[data-control="look"]');
  const color = looks.getByRole('button', { name: 'Color negative', exact: true });
  const bw = looks.getByRole('button', { name: 'B&W negative', exact: true });
  // What shows: the hidden label is still in the page, so compare the rendered text.
  const shown = { useInnerText: true };
  await expect(color).toHaveText('Color negative', shown);
  await expect(bw).toHaveText('B&W', shown);
  await bw.click();
  await expect(bw).toHaveText('B&W negative', shown);
  await expect(color).toHaveText('Color', shown);
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
