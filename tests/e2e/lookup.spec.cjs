const { test, expect } = require('@playwright/test');
const { watchConsole } = require('./helpers.cjs');

let checkConsole;
test.beforeEach(async ({ page }) => {
  checkConsole = watchConsole(page);
  await page.goto('/');
});
test.afterEach(() => checkConsole());

test('search finds a film and shows its barcode on the strip', async ({ page }) => {
  await page.locator('#finder-q').fill('hp5 plus');
  const first = page.locator('.finder__item').first();
  await expect(first.locator('.finder__name')).toHaveText('HP5 PLUS');
  await expect(first).toContainText('DX 109-9');
  await page.locator('#finder-frame').fill('12A');
  await first.getByRole('button', { name: 'Show barcode of HP5 PLUS' }).click();
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  await expect(page.locator('.readout__value--edge')).toHaveText('12A');
  await expect(page.locator('#lighttable')).toBeInViewport();
});

test('the frame field of the search rejects labels it cannot read', async ({ page }) => {
  await page.locator('#finder-q').fill('hp5 plus');
  const show = page.locator('.finder__item').first().getByRole('button', { name: 'Show barcode of HP5 PLUS' });
  await page.locator('#finder-frame').fill('64');
  await show.click();
  await expect(page.locator('#finder-frame-help')).toContainText('Write the frame as printed on film');
  await expect(page.locator('#finder-frame')).toBeFocused();
  await expect(page.locator('#result-title')).not.toHaveText('HP5 PLUS');
  await page.locator('#finder-frame').fill('');
  await expect(page.locator('#finder-frame-help')).toHaveText('as printed, e.g. 12 or 12A');
  await show.click();
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  await expect(page.locator('.readout__value--edge')).toHaveText('1');
});

test('search results without a usable DX number say why', async ({ page }) => {
  await page.locator('#finder-q').fill('neopan 400ug');
  const neopan = page.locator('.finder__item').first();
  await expect(neopan.getByRole('button', { name: 'No full code' })).toHaveAttribute('title', 'Part 1 = 0 is never used on film.');
  await expect(neopan.locator('.finder__dx')).toHaveCount(0); // no cassette number either
  await page.locator('#finder-q').fill('cinestill 800t');
  const cine = page.locator('.finder__item').first();
  await expect(cine.getByRole('button', { name: 'No full code' })).toHaveAttribute('title', /outside the range a film edge code can hold/);
  await expect(cine.locator('.finder__dx')).toHaveText('cassette 753914');
});

test('search by DX number lists that code first', async ({ page }) => {
  await page.locator('#finder-q').fill('79-15');
  await expect(page.locator('.finder__item .finder__name').first()).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.locator('#finder-help')).toContainText('found');
});

test('search explains when nothing matches', async ({ page }) => {
  await page.locator('#finder-q').fill('zzzz not a film');
  await expect(page.locator('#finder-help')).toContainText('Nothing matches');
});

test('a DX number and frame can be entered directly', async ({ page }) => {
  await page.locator('#direct-dx').fill('47-1');
  await page.locator('#direct-frame').fill('22A');
  await page.locator('.direct').getByRole('button', { name: 'Show barcode' }).click();
  await expect(page.locator('#result-title')).toHaveText('Perutz Primera 200 (from 01/2002 on)');
  await page.locator('#direct-dx').fill('128-3');
  await page.locator('.direct').getByRole('button', { name: 'Show barcode' }).click();
  await expect(page.locator('#direct-help')).toContainText('not a DX number');
  await page.locator('#direct-dx').fill('79'); // Part 1 alone, not DX 4-15
  await page.locator('.direct').getByRole('button', { name: 'Show barcode' }).click();
  await expect(page.locator('#direct-help')).toContainText('not a DX number');
});

test('a code shown with a frame uses the 31-cell layout, even after the 23-cell one', async ({ page }) => {
  await page.getByRole('button', { name: '7 thin bars' }).click();
  await page.locator('#direct-dx').fill('79-15');
  await page.locator('#direct-frame').fill('23A');
  await page.locator('.direct').getByRole('button', { name: 'Show barcode' }).click();
  await expect(page.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.readout__value--edge')).toHaveText('23A');
});

test('a cassette number gives the film, the roll length and the edge code', async ({ page }) => {
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  const out = page.locator('.cassette__result');
  await expect(out).toContainText('109-12');
  await expect(out).toContainText('24 exp.');
  await expect(out.locator('.match__name').first()).toHaveText('FP4 PLUS');
  await out.getByRole('button', { name: 'Show the edge barcode' }).click();
  await expect(page.locator('#result-title')).toHaveText('FP4 PLUS');
});

test('cassette input is validated', async ({ page }) => {
  await page.locator('#cassette-code').fill('12');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('#cassette-help')).toContainText('exactly six digits');
  await page.locator('#cassette-code').fill('832973');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('KODAK Gold 100 Film for Jean Coutu Pharmacies in Canada');
  await expect(page.locator('.cassette__result')).toContainText('not a standard DX number');
});

test('the code list filters by Part 1 number', async ({ page }) => {
  const rows = page.locator('.products-table tbody tr');
  await expect(rows).toHaveCount(386);
  await page.getByRole('button', { name: 'Part 1 number 109: show its products' }).click();
  await expect(rows).toHaveCount(15);
  await expect(page.locator('#codes')).toContainText('15 of 386 registered products with Part 1 = 109.');
  await page.getByRole('button', { name: 'Show all Part 1 numbers' }).click();
  await page.locator('#ref-status').selectOption('live');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThan(386);
});
