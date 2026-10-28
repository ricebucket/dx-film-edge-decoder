const { test, expect } = require('@playwright/test');
const { watchConsole, dataCell, setCells } = require('./helpers.cjs');

// Data track of DX 79-15, frame 23 (Wikipedia's sample; Kodak BW400CN).
const BW400CN_23 = '1010101001111011110101110010101';
// Older 23-cell code of DX 79-7 (Zint's test vector; Kodacolor VR200 in the I3A list).
const VR200_SHORT = '10101010011110011100101';

let checkConsole;
test.beforeEach(async ({ page }) => {
  checkConsole = watchConsole(page);
});
test.afterEach(() => checkConsole());

test('starts empty, with examples to try', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DX Film Edge Decoder');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(31);
  await expect(page.locator('#strip .track--data button.cell')).toHaveCount(21);
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await expect(page.locator('#result .chip')).toHaveCount(5);
});

test('clicking the bars of a real code identifies the film', async ({ page }) => {
  await page.goto('/');
  await setCells(page, BW400CN_23);
  const result = page.locator('#result');
  await expect(result.locator('.status')).toHaveText('Valid DX code');
  await expect(result.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(result).toContainText('Part 1 = 79 is assigned to Eastman Kodak Company.');
  await expect(result.locator('.readout__value').first()).toHaveText('79-15');
  await expect(result.locator('.readout__value--edge')).toHaveText('23');
  // The number printed before the code, as on film: a whole frame, so no arrow.
  await expect(page.locator('#strip .film__label--before')).toHaveText('23');
  await expect(page.locator('#strip .film__label--before')).not.toHaveClass(/is-half/);
  await expect(page).toHaveURL(/\?dx=79-15\/23$/);
});

test('cells can be typed with the keyboard', async ({ page }) => {
  await page.goto('/');
  await dataCell(page, 7).focus();
  for (const bit of BW400CN_23.slice(6, 27)) await page.keyboard.press(bit);
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  // Arrow keys move without changing anything; Space toggles.
  await dataCell(page, 7).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dataCell(page, 8)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#result .status')).toHaveText('One problem to check');
});

test('dragging paints several cells in one stroke, undone in one step', async ({ page, isMobile }) => {
  test.skip(isMobile, 'drag painting is a mouse feature; touch scrolls the strip');
  await page.goto('/');
  // Raw mouse coordinates don't auto-scroll like locator.click() does.
  await dataCell(page, 9).scrollIntoViewIfNeeded();
  const from = await dataCell(page, 9).boundingBox();
  const to = await dataCell(page, 12).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  for (const n of [9, 10, 11, 12]) await expect(dataCell(page, n)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo' }).click();
  for (const n of [9, 10, 11, 12]) await expect(dataCell(page, n)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(dataCell(page, 12)).toHaveAttribute('aria-pressed', 'true');
});

test('tapping toggles cells on touch screens', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  await page.goto('/');
  await dataCell(page, 8).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
  await dataCell(page, 8).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
});

test('Ctrl+Z undoes and Ctrl+Y redoes', async ({ page }) => {
  await page.goto('/');
  await dataCell(page, 10).click();
  await expect(dataCell(page, 10)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await expect(dataCell(page, 10)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+y');
  await expect(dataCell(page, 10)).toHaveAttribute('aria-pressed', 'true');
});

test('a misread bar fails parity and the right correction is offered', async ({ page }) => {
  const misread = BW400CN_23.slice(0, 9) + '0' + BW400CN_23.slice(10); // cell 10 lost its bar
  await page.goto(`/?bits=${misread}`);
  const result = page.locator('#result');
  await expect(result.locator('.status')).toHaveText('One problem to check');
  await expect(result).toContainText('The parity check fails');
  await expect(result.locator('#result-title')).toContainText('As copied:');
  const fix = result.getByRole('button', { name: /Add the bar in cell 10/ });
  await expect(fix).toContainText('79-15, frame 23: KODAK Professional BW400CN Film');
  await fix.click();
  await expect(result.locator('.status')).toHaveText('Valid DX code');
  await expect(result.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
});

test('a bar in an unused cell is explained', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 14).click();
  await expect(page.locator('#result')).toContainText('Cell 14 should never have a bar');
  await expect(page.locator('#hint')).toContainText('shifted by one cell');
  await expect(dataCell(page, 14)).toHaveClass(/is-error/);
});

test('on phones the strip opens on cell 1, from the right end when mirrored', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only: wider screens show the whole strip');
  await page.goto('/?dx=79-15/23');
  // Cell 1 sits just clear of the 32 px fade that marks more strip to the side
  // (within 2 px: WebKit scrolls by whole pixels).
  const cellOneInset = () => page.locator('#strip .strip__scroller').evaluate((sc) => {
    const view = sc.getBoundingClientRect();
    const cell = sc.querySelector('.track--data [data-cell="1"]').getBoundingClientRect();
    return { left: Math.round(cell.left - view.left), right: Math.round(view.right - cell.right) };
  });
  await expect.poll(async () => Math.abs((await cellOneInset()).left - 32) <= 2).toBe(true);
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await expect.poll(async () => Math.abs((await cellOneInset()).right - 32) <= 2).toBe(true);
  // Editing does not move the strip.
  await page.locator('#strip .strip__scroller').evaluate((sc) => { sc.scrollLeft = 120; });
  await dataCell(page, 20).tap();
  expect(Math.abs(await page.locator('#strip .strip__scroller').evaluate((sc) => sc.scrollLeft) - 120)).toBeLessThanOrEqual(2);
});

test('mirror reverses the strip on screen but not the reading', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  const first = await dataCell(page, 1).boundingBox();
  const last = await dataCell(page, 31).boundingBox();
  expect(first.x).toBeLessThan(last.x);
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await expect(page.locator('#toolbar').getByRole('button', { name: 'Mirror' })).toHaveAttribute('aria-pressed', 'true');
  const mFirst = await dataCell(page, 1).boundingBox();
  const mLast = await dataCell(page, 31).boundingBox();
  expect(mFirst.x).toBeGreaterThan(mLast.x);
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
});

test('"7 thin bars" in the text chooses that layout and shows when it is chosen', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'How to copy the bars' }).click();
  const layout = page.locator('[data-control="format"]');
  const inStep = page.locator('#copy-steps').getByRole('button', { name: '7 thin bars' });
  const inHow = page.locator('#how').getByRole('button', { name: '7 thin bars' });
  await expect(inStep).toHaveAttribute('aria-pressed', 'false');
  await inStep.click();
  await expect(layout.getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#strip .track--data button.cell')).toHaveCount(23 - 6 - 4);
  await expect(inStep).toHaveAttribute('aria-pressed', 'true');
  await expect(inHow).toHaveAttribute('aria-pressed', 'true');
  await layout.getByRole('button', { name: '11 thin bars' }).click();
  await expect(inHow).toHaveAttribute('aria-pressed', 'false');
  await inHow.click();
  await expect(layout.getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  // Pressed again, the text goes back to 11 thin bars; the Layout button stays chosen when pressed again.
  await inHow.click();
  await expect(layout.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  await expect(inHow).toHaveAttribute('aria-pressed', 'false');
  await expect(inStep).toHaveAttribute('aria-pressed', 'false');
  await layout.getByRole('button', { name: '7 thin bars' }).click();
  await layout.getByRole('button', { name: '7 thin bars' }).click();
  await expect(layout.getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
});

test('"Mirror" in the steps works the Mirror button and shows when it is on', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'How to copy the bars' }).click();
  const inText = page.locator('#copy-steps').getByRole('button', { name: 'Mirror' });
  const button = page.locator('#toolbar').getByRole('button', { name: 'Mirror' });
  await expect(inText).toHaveAttribute('aria-pressed', 'false');
  await inText.click();
  await expect(page.locator('#strip .strip')).toHaveClass(/is-mirrored/);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(inText).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(page.locator('#strip .strip')).not.toHaveClass(/is-mirrored/);
  await expect(inText).toHaveAttribute('aria-pressed', 'false');
});

test('switching layout keeps Part 1 and Part 2', async ({ page }) => {
  await page.goto('/?dx=109-9/12');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
  await expect(page.locator('#strip .bracket--part1 .bracket__value')).toHaveText('109');
  await expect(page.locator('#strip .bracket--part2 .bracket__value')).toHaveText('9');
  // The short layout's parity cell (19) is not filled in automatically.
  await dataCell(page, 19).click();
  await expect(page.locator('#result .status')).toHaveText('Valid DX code (23-cell layout)');
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  await expect(page).toHaveURL(/\?dx=109-9$/);
});

test('examples load a code with the matching film look', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fujichrome Velvia 50, frame 5A' }).click();
  await expect(page.locator('#result-title')).toHaveText('FUJICHROME VELVIA 50');
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'slide');
  await expect(page.locator('#strip .film__label--before')).toHaveText('5A');
  // BW400CN is black-and-white film developed like color negative film, and looks like one (Kodak F-4036).
  await page.locator('#clear').click();
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'negative');
});

test('links restore a code, and junk in the link is ignored', async ({ page }) => {
  await page.goto('/?dx=47-1/22A');
  await expect(page.locator('#result-title')).toHaveText('Perutz Primera 200 (from 01/2002 on)');
  await page.goto('/?dx=999-1/2');
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await page.goto('/?bits=10101');
  await expect(page.locator('#result')).toContainText('Waiting for bars');
});

test('leader frames show their printed labels', async ({ page }) => {
  await page.goto('/?dx=79-2/XA');
  await expect(page.locator('.readout__value--edge')).toHaveText('XA');
  await expect(page.locator('#strip .film__label--before')).toHaveText('XA');
  await expect(page.locator('#strip .film__label--before')).toHaveClass(/is-half/);
  await expect(page.locator('#result')).toContainText('also printed as SA');
});

test.describe('film from before the 1990 frame-number extension', () => {
  test('a 7-bar code is copied and decoded without a frame number', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
    await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
    await expect(page.locator('#strip .track--clock .cell.is-bar')).toHaveCount(5 + 7 + 3);
    await setCells(page, VR200_SHORT);
    const result = page.locator('#result');
    await expect(result.locator('.status')).toHaveText('Valid DX code (23-cell layout)');
    await expect(result.locator('#result-title')).toHaveText('KODACOLOR VR200 Film');
    await expect(result).toContainText('The 23-cell layout has no frame number.');
    await expect(page.locator('#strip .film')).not.toHaveClass(/has-labels/);
    await expect(page).toHaveURL(/\?dx=79-7$/);
  });

  test('a 7-bar code copied into the 11-bar strip is recognized', async ({ page }) => {
    await page.goto('/');
    // What a user sees on old film, entered cell by cell into the default strip.
    await setCells(page, VR200_SHORT + '0000' + '0101');
    // Such a copy is also a valid 31-cell code of the same film (frame 10),
    // so the page asks about the top row instead of reporting an error.
    await expect(page.locator('#result-title')).toHaveText('KODACOLOR VR200 Film');
    const hint = page.locator('.problem--suggest');
    await expect(hint).toContainText('Does the top row of your film have 7 thin bars?');
    await expect(hint).toContainText('DX 79-7');
    await hint.getByRole('button', { name: 'Switch to 7 thin bars' }).click();
    await expect(page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#result-title')).toHaveText('KODACOLOR VR200 Film');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the older-film example switches the layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Kodacolor VR200, older 7-bar code' }).click();
    await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
    await expect(page.locator('#result-title')).toHaveText('KODACOLOR VR200 Film');
  });

  test('a link to a code without a frame opens the 7-bar layout', async ({ page }) => {
    await page.goto('/?dx=109-12');
    await expect(page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#result-title')).toHaveText('FP4 PLUS');
  });
});

test('undo during a drag does not corrupt the history', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await page.goto('/');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await dataCell(page, 9).scrollIntoViewIfNeeded();
  const a = await dataCell(page, 9).boundingBox();
  const b = await dataCell(page, 11).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.keyboard.press('Control+z'); // back to the 31-cell layout mid-drag
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Control+z');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await page.getByRole('button', { name: '11 thin bars' }).click();
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(31);
});


test('the URL keeps up with fast edits (browsers limit how often it may change)', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 8).click();
  // 120 URL changes in a few seconds: more than Safari allows in 10 s.
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
  }
  await page.locator('#clear').click();
  await expect(page).toHaveURL(/:\d+\/$/);
});

test('a reload straight after quick edits keeps the latest code', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 8).click();
  await dataCell(page, 9).click(); // Part 1 is now 127
  await page.reload();
  await expect(page).toHaveURL(/\?dx=127-15\/23$/);
  await expect(dataCell(page, 9)).toHaveAttribute('aria-pressed', 'true');
});

test('empty cells that can be clicked show a faint +, which a bar replaces', async ({ page }) => {
  await page.goto('/');
  const plus = (n) => dataCell(page, n).evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
  expect(await plus(7)).toContain('linear-gradient');
  expect(await plus(1)).toBe('none'); // the start pattern is the same on every film
  expect(await plus(14)).toBe('none'); // an unused cell: it should stay empty
  await dataCell(page, 7).click();
  await expect(dataCell(page, 7)).toHaveAttribute('aria-pressed', 'true');
  expect(await plus(7)).toBe('none');
});

test('a finger on a cell shows what lifting it will do, unless it scrolls', async ({ page }) => {
  await page.goto('/');
  const cell = dataCell(page, 8);
  await cell.scrollIntoViewIfNeeded();
  // Playwright cannot hold a touch down, so the pointer events are sent directly.
  const touch = (type, dx = 0) => cell.evaluate((el, [type, dx]) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: r.x + r.width / 2 + dx, clientY: r.y + r.height / 2,
    }));
  }, [type, dx]);
  await touch('pointerdown');
  await expect(cell).toHaveClass(/\bis-pressing\b/);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  // The finger moves: it is scrolling the strip, so nothing changes.
  await touch('pointermove', 30);
  await expect(cell).not.toHaveClass(/\bis-pressing\b/);
  await touch('pointercancel', 30);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  // A tap that lifts in place adds the bar.
  await touch('pointerdown');
  await touch('pointerup');
  await expect(cell).not.toHaveClass(/\bis-pressing\b/);
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
});
