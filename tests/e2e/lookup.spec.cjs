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
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
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

test('community matches link once to their DX number on The Big Film Database', async ({ page }) => {
  const SEARCH = 'https://thebigfilmdatabase.merinorus.com/search?dx_number=';
  const links = (scope) => scope.getByRole('link', { name: /on The Big Film Database/ });
  // One link for all the films listed with the decoded number...
  await page.goto('/?dx=96-12/14A');
  const result = links(page.locator('#result'));
  await expect(result).toHaveText('Look up DX 96-12 on The Big Film Database, which has pictures of the film boxes (opens in a new tab)');
  await expect(result).toHaveAttribute('target', '_blank');
  await expect(result).toHaveAttribute('href', `${SEARCH}96-12`);
  // ...and for those of a cassette number.
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(links(page.locator('.cassette__result'))).toHaveAttribute('href', `${SEARCH}109-12`);
  // Search results lead to the decoder and its link; they have none of their own.
  await page.locator('#finder-q').fill('kentmere');
  await expect(page.locator('.finder__item').first()).toBeVisible();
  await expect(page.locator('#finder-ui').getByRole('link')).toHaveCount(0);
  // No community matches, no link.
  await page.goto('/?dx=88-1/1');
  await expect(page.locator('#result-title')).toHaveText('SHENGUANG / SHANGHAI / SEAGULL / RAINBOW');
  await expect(links(page.locator('#result'))).toHaveCount(0);
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

test('a shown code says where it came from, with a way back there', async ({ page }) => {
  const bar = page.locator('#source');
  await page.goto('/');
  await expect(bar).toBeHidden();
  await page.locator('.examples .chip').first().click();
  await expect(bar).toHaveText('Example: Kodak BW400CN, frame 23');

  await page.locator('#finder-q').fill('hp5 plus');
  await page.locator('.finder__item').first().getByRole('button', { name: /^Show barcode/ }).click();
  await expect(bar).toContainText('From Find a film: HP5 PLUS, frame 1');
  await bar.getByRole('button', { name: 'Back to the search' }).click();
  await expect(page.locator('#finder-q')).toBeFocused();

  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Show the edge barcode' }).click();
  await expect(bar).toContainText('From a cassette number: 017563, frame 1');
  await bar.getByRole('button', { name: 'Back to the cassette number' }).click();
  await expect(page.locator('#cassette-code')).toBeFocused();

  await page.locator('#reference-ui button.tool--small:not([disabled])').first().click();
  await expect(bar).toContainText('From the code list:');
  await bar.getByRole('button', { name: 'Back to the code list' }).click();
  await expect(page.locator('#codes-title')).toBeFocused();

  // Edits are marked; × hides the bar and keeps the code; Clear takes it away too.
  await page.locator('#strip .track--data [data-cell="8"]').click();
  await expect(bar).toContainText('edited since');
  const code = page.url();
  await bar.getByRole('button', { name: 'Hide where this code came from' }).click();
  await expect(bar).toBeHidden();
  expect(page.url()).toBe(code);
  await page.goto('/?dx=79-15/23');
  await expect(bar).toBeHidden(); // a shared link has no bar
  await page.locator('#finder-q').fill('hp5 plus');
  await page.locator('.finder__item').first().getByRole('button', { name: /^Show barcode/ }).click();
  await page.locator('#clear').click();
  await expect(bar).toBeHidden();
});
