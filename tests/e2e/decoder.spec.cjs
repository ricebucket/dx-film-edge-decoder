const { test, expect } = require('@playwright/test');
const { watchConsole, dataCell, setCells, decodePng } = require('./helpers.cjs');

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
  // No heading until there is a code; the status still names the section.
  await expect(page.locator('#result h2')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Waiting for bars' })).toBeVisible();
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

test('with Mirror on, typing also starts at cell 7 and goes on in reading order', async ({ page }) => {
  await page.goto('/');
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  // Cell 7, the strip's tab stop, is now its right-most cell: typing goes to the left.
  await expect(dataCell(page, 7)).toHaveAttribute('tabindex', '0');
  await dataCell(page, 7).focus();
  for (const bit of BW400CN_23.slice(6, 27)) await page.keyboard.press(bit);
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  // Backspace steps back in reading order too: to cell 26, right of cell 27 here.
  await page.keyboard.press('Backspace');
  await expect(dataCell(page, 26)).toBeFocused();
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
  // Back to the empty strip, not to the all-zero code DX 0-0.
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(dataCell(page, 12)).toHaveAttribute('aria-pressed', 'true');
});

test('tapping toggles cells on touch screens', { tag: '@phone' }, async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch only');
  await page.goto('/');
  await dataCell(page, 8).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
  await dataCell(page, 8).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
});

test('a second finger on the strip, as in a pinch, leaves no cell pressed and changes none', async ({ page }) => {
  await page.goto('/');
  // Synthetic touches, so that every browser can play them: two fingers down
  // on cells 8 and 10, then lifted, or taken over by the browser.
  for (const end of ['pointerup', 'pointercancel']) {
    await page.locator('#strip .track--data').evaluate((track, type) => {
      const touch = (kind, cell, id) => track.querySelector(`[data-cell="${cell}"]`).dispatchEvent(
        new PointerEvent(kind, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0 }));
      touch('pointerdown', 8, 1);
      touch('pointerdown', 10, 2);
      touch(type, 8, 1);
      touch(type, 10, 2);
    }, end);
    await expect(page.locator('#strip .is-pressing')).toHaveCount(0);
    await expect(page.locator('#strip .ruler__cell.is-here')).toHaveCount(0); // nor does the ruler name one
    await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'false');
    await expect(dataCell(page, 10)).toHaveAttribute('aria-pressed', 'false');
  }
  // The second finger beside the strip, lifted first or last.
  for (const order of [[2, 1], [1, 2]]) {
    await page.locator('#strip .track--data').evaluate((track, lifts) => {
      const cell = track.querySelector('[data-cell="8"]');
      const touch = (kind, target, id) => target.dispatchEvent(
        new PointerEvent(kind, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0 }));
      touch('pointerdown', cell, 1);
      touch('pointerdown', document.body, 2);
      for (const id of lifts) touch('pointerup', id === 1 ? cell : document.body, id);
    }, order);
    await expect(page.locator('#strip .is-pressing')).toHaveCount(0);
    await expect(page.locator('#strip .ruler__cell.is-here')).toHaveCount(0);
    await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'false');
  }
  // One finger again: a tap.
  await dataCell(page, 8).evaluate((cell) => {
    for (const kind of ['pointerdown', 'pointerup']) cell.dispatchEvent(new PointerEvent(kind, { bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true, button: 0 }));
  });
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
  // Before the result's own heading, so not a heading itself.
  await expect(result.locator('.fixes__title')).toHaveJSProperty('tagName', 'P');
  const fix = result.getByRole('button', { name: /Add the bar in cell 10/ });
  await expect(fix).toContainText('79-15, frame 23: KODAK Professional BW400CN Film');
  await fix.press('Enter');
  await expect(result.locator('.status')).toHaveText('Valid DX code');
  await expect(result.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  // The correction is gone with the old result: the keyboard carries on at the new one.
  await expect(result.locator('#result-title')).toBeFocused();
});

test('a bar in an unassigned cell is explained', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 14).click();
  await expect(page.locator('#result')).toContainText('Cell 14 should never have a bar');
  await expect(page.locator('#hint')).toHaveText('Cell 14 should always be empty.');
  await expect(page.locator('#result')).toContainText('shifted by one cell');
  await expect(dataCell(page, 14)).toHaveClass(/is-error/);
});

test('on phones the strip opens on cell 1, from the right end when mirrored', { tag: '@phone' }, async ({ page, isMobile }) => {
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

test('the strip draws both tracks at the smallest equal height the standard allows (GB/T 9185-2003, Table 1, T3)', async ({ page }) => {
  await page.goto('/');
  // In millimeters, at the 0.408 mm cell of the Kodak negative in research/05.
  const mm = await page.evaluate(() => {
    const cell = parseFloat(getComputedStyle(document.querySelector('#strip .strip')).getPropertyValue('--cell'));
    const height = (selector) => (document.querySelector(selector).getBoundingClientRect().height / cell) * 0.408;
    return { clock: height('#strip .track--clock'), data: height('#strip .track--data') };
  });
  expect(mm.clock).toBeCloseTo(mm.data, 3);
  expect(mm.clock + mm.data).toBeGreaterThanOrEqual(2.06);
  expect(mm.clock + mm.data).toBeLessThan(2.065);
});

test('mirror reverses the strip on screen but not the reading', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  const first = await dataCell(page, 1).boundingBox();
  const last = await dataCell(page, 31).boundingBox();
  expect(first.x).toBeLessThan(last.x);
  // The rows of the strip against its code: the printed number, the ruler over the film and the labels under it.
  const rows = () => page.evaluate(() => {
    const box = (part) => document.querySelector(`#strip ${part}`).getBoundingClientRect();
    const [code, number, ruler, labels, film] = ['.film__code', '.film__label', '.ruler__grid', '.annot__grid', '.film'].map(box);
    const near = (a, b) => Math.abs(a - b) < 0.5;
    return {
      number: number.right <= code.left + 0.5 ? 'before the code' : number.left >= code.right - 0.5 ? 'after the code' : 'over the code',
      numberInTheRowOfTheCode: near(number.bottom, code.bottom),
      rulerOverTheCode: near(ruler.left, code.left) && near(ruler.width, code.width),
      labelsUnderTheCode: near(labels.left, code.left) && near(labels.width, code.width) && labels.top >= code.bottom,
      filmBeforeTheCode: Math.round(code.left - film.left),
      filmAfterTheCode: Math.round(film.right - code.right),
    };
  });
  const front = await rows();
  expect(front).toMatchObject({ number: 'before the code', numberInTheRowOfTheCode: true, rulerOverTheCode: true, labelsUnderTheCode: true });
  expect(front.filmBeforeTheCode).toBeGreaterThan(front.filmAfterTheCode);
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await expect(page.locator('#toolbar').getByRole('button', { name: 'Mirror' })).toHaveAttribute('aria-pressed', 'true');
  const mFirst = await dataCell(page, 1).boundingBox();
  const mLast = await dataCell(page, 31).boundingBox();
  expect(mFirst.x).toBeGreaterThan(mLast.x);
  // From the back, the number is at the code's other side, and every row is still in its place against the code.
  expect(await rows()).toEqual({ ...front, number: 'after the code', filmBeforeTheCode: front.filmAfterTheCode, filmAfterTheCode: front.filmBeforeTheCode });
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
});

test('"7 thin bars" in the text chooses that layout and shows when it is chosen', { tag: '@phone' }, async ({ page, isMobile }) => {
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

test('the table of printed frame labels agrees with the decoder for every value 0–63 (GB/T 9185-2003, Table 5)', async ({ page }) => {
  await page.goto('/');
  const problems = await page.locator('.frames-table tbody tr').evaluateAll((rows) => {
    const codec = window.DX.codec;
    const found = [];
    const seen = [];
    for (const row of rows) {
      const [printed, value, , alias] = [...row.cells].map((td) => td.textContent.trim());
      const range = /^(\d+)–(\d+)$/.exec(printed);
      if (range) {
        for (let n = Number(range[1]); n <= Number(range[2]); n++) {
          if (codec.frameLabel(n, false) !== String(n)) found.push(`${n} is printed ${codec.frameLabel(n, false)}`);
          seen.push(n);
        }
        continue;
      }
      const n = Number(value);
      if (printed !== `${codec.frameLabel(n, false)} / ${codec.frameLabel(n, true)}`) found.push(`${n} is not printed ${printed}`);
      if (alias && !codec.frameAliases(n, false).includes(alias)) found.push(`${n} is not printed ${alias}`);
      seen.push(n);
    }
    seen.sort((a, b) => a - b);
    if (seen.join() !== Array.from({ length: 64 }, (_, n) => n).join()) found.push(`values listed: ${seen.join()}`);
    return found;
  });
  expect(problems).toEqual([]);
});

test('"Mirror" in the steps works the Mirror button and shows when it is on', { tag: '@phone' }, async ({ page, isMobile }) => {
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
  await page.getByRole('button', { name: 'Fujichrome Velvia 50, frame 5A' }).press('Enter');
  await expect(page.locator('#result-title')).toHaveText('FUJICHROME VELVIA 50');
  await expect(page.locator('#result-title')).toBeFocused();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'slide');
  await expect(page.locator('#strip .film__label--before')).toHaveText('5A');
  // BW400CN is black-and-white film developed like color negative film, and looks like one (Kodak F-4036).
  await page.locator('#clear').click();
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'negative');
});

test('once the strip is in use, the examples can be brought back and hidden again', async ({ page }) => {
  await page.goto('/?dx=96-12/14A');
  const show = page.getByRole('button', { name: 'Show examples' });
  await expect(page.getByRole('button', { name: 'Ilford HP5 Plus, frame 12' })).toBeHidden();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await show.click();
  await page.getByRole('button', { name: 'Ilford HP5 Plus, frame 12' }).click();
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  // Still open, to compare one example after another.
  await page.getByRole('button', { name: 'Fujichrome Velvia 50, frame 5A' }).click();
  await expect(page.locator('#result-title')).toHaveText('FUJICHROME VELVIA 50');
  await page.getByRole('button', { name: 'Hide examples' }).click();
  await expect(page.getByRole('button', { name: 'Fujichrome Velvia 50, frame 5A' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show examples' })).toHaveAttribute('aria-expanded', 'false');
});

test('a blank strip shows the printed number faded; the 7-bar layout has none', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#strip .film__label--before')).toHaveText('0');
  await expect(page.locator('#strip .film')).toHaveClass(/labels-uncertain/);
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(page.locator('#strip .film')).not.toHaveClass(/has-labels/);
});

test('links restore a code, and junk in the link is ignored', async ({ page }) => {
  await page.goto('/?dx=47-1/22A');
  await expect(page.locator('#result-title')).toHaveText('Perutz Primera 200 (from 01/2002 on)');
  await page.goto('/?dx=999-1/2');
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await page.goto('/?bits=10101');
  await expect(page.locator('#result')).toContainText('Waiting for bars');
});

test('a link to the all-zero code shows it, while bars taken off by hand leave an empty strip', async ({ page }) => {
  // Part 1 = 0 is a valid code (GB/T 9185-2003, Annex A.3.1), not "nothing entered".
  await page.goto('/?dx=0-0/0');
  await expect(page.locator('#result .status')).toHaveText('Valid DX code');
  await expect(page.locator('#result .readout__value').first()).toHaveText('0-0');
  await expect(page).toHaveURL(/\?dx=0-0\/0$/);
  await expect(page.locator('#strip .film')).not.toHaveClass(/labels-uncertain/);
  await dataCell(page, 10).click();
  await dataCell(page, 10).click();
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await expect(page.locator('#strip .film')).toHaveClass(/labels-uncertain/);
  await expect(page).not.toHaveURL(/\?/);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await expect(page.locator('#result .readout__value').first()).toHaveText('0-0');
  await page.locator('#clear').click();
  await expect(page.locator('#result')).toContainText('Waiting for bars');
  await expect(page).not.toHaveURL(/\?/);
});

test('undo brings back where a code came from, but not a source that was removed', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('#source');
  const title = page.locator('#result-title');
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  await expect(bar).toContainText('Example: Kodak BW400CN, frame 23');
  await page.getByRole('tab', { name: 'Read a photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(bar).toContainText('From the photo: DX 96-12, frame 14A');
  await page.locator('#undo').click();
  await expect(title).toHaveText('KODAK Professional BW400CN Film');
  await expect(bar).toContainText('Example: Kodak BW400CN, frame 23');
  await expect(bar).not.toContainText('edited since');
  await expect(page.locator('#strip .strip__photo canvas')).toHaveCount(0);
  await page.locator('#redo').click();
  await expect(bar).toContainText('From the photo: DX 96-12, frame 14A');
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  // Clear, undone, brings the photo back with its code...
  await page.locator('#clear').click();
  await expect(bar).toBeHidden();
  await page.locator('#undo').click();
  await expect(bar).toContainText('From the photo: DX 96-12, frame 14A');
  // ...but a photo removed with × stays removed.
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await page.locator('#undo').click();
  await expect(bar).toContainText('Example: Kodak BW400CN, frame 23');
  await page.locator('#redo').click();
  await expect(title).toHaveText('KODAK GOLD 200 Film');
  await expect(bar).toBeHidden();
});

test('leader frames show their printed labels', async ({ page }) => {
  await page.goto('/?dx=79-2/XA');
  await expect(page.locator('.readout__value--edge')).toHaveText('XA');
  await expect(page.locator('#strip .film__label--before')).toHaveText('XA');
  await expect(page.locator('#strip .film__label--before')).toHaveClass(/is-half/);
  await expect(page.locator('#result')).toContainText('also printed as SA');
});

test('frames 61 to 63 open from their numbers, and the text form writes them so, as zxing-cpp does', async ({ page }) => {
  await page.goto('/?dx=79-7/62A');
  await expect(page.locator('.readout__value--edge')).toHaveText('XA');
  await expect(page).toHaveURL(/\?dx=79-7\/XA$/);
  await page.locator('details.raw summary').click();
  await expect(page.locator('details.raw')).toContainText('Text form (as used by zxing-cpp and Zint): 79-7/62A');
  // Both reject Part 1 = 0, so its text form is not said to be theirs.
  await page.goto('/?dx=0-0/1');
  await page.locator('details.raw summary').click();
  await expect(page.locator('details.raw')).toContainText('Text form: 0-0/1');
});

test('the perforations are holes in the film where they are drawn, also when the strip is mirrored', async ({ page }) => {
  // Wide enough to show the whole strip, in every engine.
  const width = 1280;
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/?dx=79-15/23');
  // The page behind the film is sampled just above it, where the ruler's ticks would be.
  await page.addStyleTag({ content: '#strip .ruler { visibility: hidden; }' });
  for (const mirrored of [false, true]) {
    if (mirrored) await page.locator('#mirror-toggle').click();
    // The part of the film on screen: on phones it scrolls sideways.
    await page.locator('#strip .film').scrollIntoViewIfNeeded();
    const film = await page.locator('#strip .film').boundingBox();
    const x0 = Math.max(film.x, 0);
    const x1 = Math.min(film.x + film.width, width);
    const clip = { x: x0, y: film.y - 8, width: x1 - x0, height: 24 };
    const shot = decodePng(await page.screenshot({ clip }));
    const k = shot.width / clip.width;
    const color = (x, y) => {
      const i = (Math.round((y - clip.y) * k) * shot.width + Math.round((x - clip.x) * k)) * 4;
      return [...shot.data.subarray(i, i + 3)];
    };
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 12);
    const holes = await page.locator('#strip .perf').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }));
    // Just inside the film's top edge, near both sides of each hole drawn
    // (away from the faded ends), the page behind the film shows.
    const inside = holes.filter((hole) => hole.left > x0 + 40 && hole.right < x1 - 40);
    expect(inside.length).toBeGreaterThan(0);
    for (const hole of inside) {
      for (const x of [hole.left + 4, hole.right - 4]) {
        const label = `${mirrored ? 'mirrored' : 'normal'} strip, x = ${Math.round(x)}`;
        expect(near(color(x, film.y + 3), color(x, film.y - 4)), label).toBe(true);
      }
      // Next to a hole, film.
      expect(near(color(hole.right + 10, film.y + 3), color(hole.right + 10, film.y - 4))).toBe(false);
    }
  }
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
    await expect(hint).toContainText('Only 7 thin bars in the film’s top row?');
    await expect(hint).toContainText('DX 79-7');
    await hint.getByRole('button', { name: 'Switch to 7 thin bars' }).click();
    await expect(page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#result-title')).toHaveText('KODACOLOR VR200 Film');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the older-film example switches the layout', async ({ page }) => {
    await page.goto('/');
    // DX 12-13, Fujicolor Super HGV100 Asia, in the older layout.
    await page.getByRole('button', { name: 'Fujicolor Super HGV100 Asia, older 7-bar code' }).click();
    await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
    await expect(page.locator('#result .status')).toHaveText('Valid DX code (23-cell layout)');
    await expect(page.locator('#result-title')).toHaveText('Fujicolor Super HGV100 Asia');
    // The example names its film, The Big Film Database's row, in the address too.
    await expect(page).toHaveURL(/\?dx=12-13&film=bfd-470$/);
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

test('Back and Forward move around the page, and the address keeps the code on the strip', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await page.locator('.site-nav').getByRole('link', { name: 'Find a film' }).click();
  await page.locator('#direct-dx').fill('109-9');
  await page.locator('#direct-frame').fill('12');
  await page.locator('.finder__direct').getByRole('button', { name: 'Show barcode' }).click();
  await expect(page).toHaveURL(/\?dx=109-9\/12#finder$/);
  // Back returns to the top of the page, not to the earlier code.
  await page.goBack();
  await expect(page).toHaveURL(/\?dx=109-9\/12$/);
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
  await page.goForward();
  await expect(page).toHaveURL(/\?dx=109-9\/12#finder$/);
  await expect(page.locator('#result-title')).toHaveText('HP5 PLUS');
});

test('focus follows the content it was on: Show barcode, Show all, Undo to another layout', async ({ page }) => {
  await page.goto('/');
  await page.locator('#finder-q').fill('hp5 plus');
  const show = page.locator('.finder__item').first().getByRole('button', { name: /^Show barcode/ });
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#result-title')).toBeFocused();
  // "Show all" goes; the first entry it brought takes focus.
  await page.goto('/?dx=3-9/1');
  const all = page.locator('#result').getByRole('button', { name: /^Show all/ });
  await all.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#result .matches > li').nth(6)).toBeFocused();
  // Undo back to the other layout draws a new strip; focus stays on its cell.
  await page.goto('/');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await dataCell(page, 9).click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(31);
  await expect(dataCell(page, 9)).toBeFocused();
});

test('focus in the result goes to the status when the result empties, as the status names the section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  // A button of the result, which goes with the old result; Undo empties the strip.
  await page.getByRole('button', { name: 'Copy link' }).focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#result .status')).toHaveText('Waiting for bars');
  await expect(page.locator('#result-title')).toBeFocused();
});

test('Undo to the 7-bar layout keeps focus on the strip, also from a cell it does not have', async ({ page }) => {
  await page.goto('/?layout=23');
  await page.locator('[data-control="format"]').getByRole('button', { name: '11 thin bars' }).click();
  await dataCell(page, 21).focus(); // the stop pattern in the 7-bar layout
  await page.keyboard.press('Control+z');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
  expect(await page.evaluate(() => document.activeElement.matches('#strip button.cell--edit'))).toBe(true);
});

test('loading the same code from the same place again adds no step to undo', async ({ page }) => {
  await page.goto('/');
  const example = page.getByRole('button', { name: 'Kodak BW400CN, frame 23' });
  await example.click();
  await page.getByRole('button', { name: 'Show examples' }).click();
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  await page.locator('#undo').click();
  await expect(page.locator('#result')).toContainText('Waiting for bars');
});

test('an empty strip in the 7-bar layout stays so on reload and in the link', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(page).toHaveURL(/\?layout=23$/);
  await page.reload();
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
  await expect(page.locator('#result')).toContainText('Waiting for bars');
});

test('Copy link without a clipboard shows the link, selected, to copy by hand', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: 'Copy link' }).click();
  const field = page.getByRole('textbox', { name: 'Link to this code' });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(/\?dx=79-15\/23&lang=en$/);
  expect(await field.evaluate((el) => el.selectionEnd - el.selectionStart)).toBe((await field.inputValue()).length);
});

test('the hint under the strip is only rewritten when it changes', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await page.locator('#hint').evaluate((el) => {
    window.hintChanges = 0;
    new MutationObserver(() => window.hintChanges++).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await page.locator('[data-control="look"]').getByRole('button', { name: 'Slide' }).click();
  expect(await page.evaluate(() => window.hintChanges)).toBe(0);
});

test('cells 14 and 26 are called unassigned, as GB/T 9185-2003 calls them', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  for (const field of ['blank1', 'blank2']) await expect(page.locator(`#strip .bracket[data-field="${field}"]`)).toHaveAttribute('title', 'Unassigned: always empty');
  for (const cell of [14, 26]) await expect(dataCell(page, cell)).toHaveAttribute('aria-label', `Cell ${cell} of 31: unassigned cell`);
  await expect(page.locator('#result .raw-table th', { hasText: /^Unassigned$/ })).toHaveCount(2);
  await expect(page.locator('#how .fields-table td', { hasText: /^Unassigned$/ })).toHaveCount(2);
});

test('empty cells that can be clicked show a faint +, which a bar replaces', async ({ page }) => {
  await page.goto('/');
  const plus = (n) => dataCell(page, n).evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
  expect(await plus(7)).toContain('linear-gradient');
  expect(await plus(1)).toBe('none'); // the start pattern is the same on every film
  expect(await plus(14)).toBe('none'); // an unassigned cell: it should stay empty
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
  // The ruler over the film names the cell under the finger, as long as it rests there. (A real
  // tap on Android also leaves focus on the cell, so there its number stays until focus moves on;
  // the iPhone gives a tapped cell no focus.)
  const here = page.locator('#strip .ruler__cell.is-here');
  await touch('pointerdown');
  await expect(cell).toHaveClass(/\bis-pressing\b/);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(here).toHaveText('8');
  // The finger moves: it is scrolling the strip, so nothing changes.
  await touch('pointermove', 30);
  await expect(cell).not.toHaveClass(/\bis-pressing\b/);
  await expect(here).toHaveCount(0);
  await touch('pointercancel', 30);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  // A tap that lifts in place adds the bar.
  await touch('pointerdown');
  await touch('pointerup');
  await expect(cell).not.toHaveClass(/\bis-pressing\b/);
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(here).toHaveCount(0);
});

test('the ruler follows the latest input: keys take it to the cell with focus, the mouse moving takes it back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  await page.goto('/?dx=79-15/23');
  const here = page.locator('#strip .ruler__cell.is-here');
  await dataCell(page, 7).click();
  await expect(here).toHaveText('7');
  const box = await dataCell(page, 7).boundingBox();
  const moveMouse = (dx) => page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2);
  // The mouse rests on cell 7 while an arrow key moves focus on.
  await page.keyboard.press('ArrowRight');
  await expect(dataCell(page, 8)).toBeFocused();
  await expect(here).toHaveText('8');
  await moveMouse(1);
  await expect(here).toHaveText('7');
  // And while the keys type on.
  await page.keyboard.press('1');
  await page.keyboard.press('0');
  await expect(dataCell(page, 10)).toBeFocused();
  await expect(here).toHaveText('10');
  // The mouse moves again: the ruler is the mouse's.
  await moveMouse(2);
  await expect(here).toHaveText('7');
  // Space and Enter, which switch the cell with focus, take it too.
  await page.keyboard.press(' ');
  await expect(here).toHaveText('10');
  await moveMouse(1);
  await expect(here).toHaveText('7');
  await page.keyboard.press('Enter');
  await expect(here).toHaveText('10');
  // So does Tab, bringing focus back into the strip with the mouse resting on cell 7.
  await page.keyboard.press('Shift+Tab');
  await moveMouse(2);
  await expect(here).toHaveText('7');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement.dataset.cell);
  expect(focused).not.toBe('7');
  await expect(here).toHaveText(focused);
});

test('a modifier key on its own leaves the ruler with the mouse; with another key it takes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  await page.goto('/?dx=79-15/23');
  const here = page.locator('#strip .ruler__cell.is-here');
  await dataCell(page, 9).click();
  await dataCell(page, 14).hover();
  await expect(here).toHaveText('14');
  // Shift, as for scrolling the strip sideways with the wheel; Ctrl, Alt or Cmd, as for switching windows.
  for (const key of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta']) {
    await page.keyboard.press(key);
    await expect(here, key).toHaveText('14');
  }
  await page.keyboard.press('ControlOrMeta+z');
  await expect(here).toHaveText('9');
  // Shift+Tab takes it too, out of the strip with focus: then it names no cell.
  await dataCell(page, 14).hover({ position: { x: 3, y: 3 } });
  await expect(here).toHaveText('14');
  await page.keyboard.press('Shift+Tab');
  await expect(here).toHaveCount(0);
});

test('only the mouse moving takes the ruler from the keys: not a scroll or a new layout under a resting mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  const here = page.locator('#strip .ruler__cell.is-here');
  // The cell under the mouse at (x, y), once the browser has seen it come there, as its hover shows.
  const hovered = async (x, y) => {
    const n = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('#strip .track--data [data-cell]').dataset.cell, [x, y]);
    await expect.poll(() => dataCell(page, n).evaluate((el) => el.matches(':hover'))).toBe(true);
    return n;
  };
  // In a window too narrow for the whole strip, the arrow keys scroll it under the resting mouse.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/?dx=79-15/23');
  await page.locator('#lighttable').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  let box = await dataCell(page, 12).boundingBox();
  let [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  // Where the page last saw the mouse, as the browser gives it (WebKit in whole pixels).
  await page.evaluate(() => document.addEventListener('pointermove', (e) => { window.lastMove = [e.clientX, e.clientY]; }, true));
  await page.mouse.move(x, y);
  await expect(here).toHaveText('12');
  await dataCell(page, 11).focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
  await expect(dataCell(page, 26)).toBeFocused();
  const under = await hovered(x, y);
  expect(under).not.toBe('26');
  await expect(here).toHaveText('26');
  // WebKit on a computer also reports the resting mouse as moving after a
  // scroll, at the same place, which is no move. Chromium sends none, so it is
  // sent directly.
  await page.evaluate(() => {
    const [x, y] = window.lastMove;
    document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: x, clientY: y,
    }));
  });
  await expect(here).toHaveText('26');
  await page.mouse.move(x + 1, y);
  await expect(here).toHaveText(under);

  // A mouse resting off the strip, which a scroll of the page brings under it:
  // above the strip's own ruler too, where only a listener on the page sees it.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?dx=79-15/23');
  await page.locator('#lighttable').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  box = await dataCell(page, 12).boundingBox();
  [x, y] = [box.x + box.width / 2, box.y + box.height / 2 - 300];
  await page.mouse.move(x, y);
  expect(await page.evaluate(([x, y]) => document.getElementById('strip').contains(document.elementFromPoint(x, y)), [x, y])).toBe(false);
  await dataCell(page, 9).focus();
  await page.keyboard.press('ArrowRight');
  await expect(here).toHaveText('10');
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }));
  expect(await hovered(x, y)).toBe('12');
  await expect(here).toHaveText('10');
  await page.mouse.move(x + 1, y);
  await expect(here).toHaveText('12');
  // Any key in the strip takes it, Ctrl+Z too.
  await page.keyboard.press('Control+z');
  await expect(here).toHaveText('10');

  // A new layout drawn by keyboard: the mouse rests just past the last cell of the 23-cell strip, on no cell.
  await page.goto('/?dx=79-15/23');
  await page.locator('#lighttable').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  box = await dataCell(page, 23).boundingBox();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  await expect(here).toHaveText('23');
  await page.locator('#format-short').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#strip .ruler__cell')).toHaveCount(23);
  await expect(here).toHaveCount(0);
});

test('a cell selected with the mouse has no keyboard ring until a key is used, and the ruler stays with the mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  const here = page.locator('#strip .ruler__cell.is-here');
  // The ring, in the accent color.
  const ringed = (n) => dataCell(page, n).evaluate((el) => {
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.color = 'var(--accent-strong)';
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).boxShadow.includes(accent);
  });
  // A window too narrow for the whole strip, on a page where nothing was
  // selected before: browsers ring focus a script gives then.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/?dx=79-15/23');
  await page.locator('#lighttable').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await dataCell(page, 12).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dataCell(page, 12)).toBeFocused();
  expect(await ringed(12)).toBe(false);
  await expect(here).toHaveText('12');
  // A trackpad scrolls the strip sideways under the resting mouse: the ruler
  // names the cell that comes under it, as its hover shows.
  await page.mouse.wheel(150, 0);
  await expect.poll(() => page.evaluate(() => {
    const hovered = [...document.querySelectorAll('#strip .track--data [data-cell]')].find((el) => el.matches(':hover'));
    const marked = document.querySelector('#strip .ruler__cell.is-here');
    return Boolean(hovered && hovered.dataset.cell !== '12' && marked && marked.dataset.cell === hovered.dataset.cell);
  })).toBe(true);
  // A key: the keyboard's focus now, with its ring, and the ruler's.
  await page.keyboard.press(' ');
  await expect.poll(() => ringed(12)).toBe(true);
  await expect(here).toHaveText('12');
  // Selected with the mouse again, then left: focus that Tab brings back is the keyboard's.
  await dataCell(page, 12).click();
  expect(await ringed(12)).toBe(false);
  await dataCell(page, 14).hover();
  await expect(here).toHaveText('14');
  await page.locator('#clear').focus();
  await page.keyboard.press('Tab');
  await expect(dataCell(page, 12)).toBeFocused();
  await expect(here).toHaveText('12');
  expect(await ringed(12)).toBe(true);
});

test('selecting one cell after another with the mouse rings none of them, a gap that becomes a bar too, until a key is used', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  // The ring, in the accent color.
  const ringed = (n) => dataCell(page, n).evaluate((el) => {
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.color = 'var(--accent-strong)';
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).boxShadow.includes(accent);
  });
  const click = async (n) => {
    const box = await dataCell(page, n).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  // A window too narrow for the whole strip, on a page where nothing was
  // selected before: browsers ring focus a script gives then.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/?dx=79-15/23');
  await page.locator('#lighttable').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await click(12);
  await expect(dataCell(page, 12)).toBeFocused();
  // Another cell, a gap in this code, which the click makes a bar.
  await expect(dataCell(page, 9)).toHaveAttribute('aria-pressed', 'false');
  await click(9);
  await expect(dataCell(page, 9)).toHaveAttribute('aria-pressed', 'true');
  await expect(dataCell(page, 9)).toBeFocused();
  expect(await ringed(9)).toBe(false);
  // It looks like any other bar (cell 10 is one), with the mouse gone from it.
  await page.mouse.move(5, 5);
  const shadow = (n) => dataCell(page, n).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadow(9)).toBe(await shadow(10));
  await page.keyboard.press(' ');
  await expect(dataCell(page, 9)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => ringed(9)).toBe(true);
});

test("focus that goes with the window comes back as it was: the mouse's, with no ring", async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no mouse to rest on the strip');
  await page.goto('/?dx=79-15/23');
  const track = page.locator('#strip .track--data');
  await dataCell(page, 12).click();
  await expect(track).toHaveClass(/\bis-clicked\b/);
  // The window loses focus, as when switching windows: the browser blurs the cell, and the document no longer has focus.
  await page.evaluate(() => {
    document.hasFocus = () => false;
    document.activeElement.blur();
    delete document.hasFocus;
  });
  await expect(track).toHaveClass(/\bis-clicked\b/);
  // Focus gone elsewhere on the page ends the mouse's.
  await dataCell(page, 12).focus();
  await page.locator('#clear').focus();
  await expect(track).not.toHaveClass(/\bis-clicked\b/);
});

test('a finger takes the ruler from a resting mouse, as keys do', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse resting on the strip, as on a computer with a touch screen');
  await page.goto('/?dx=79-15/23');
  const here = page.locator('#strip .ruler__cell.is-here');
  await dataCell(page, 7).hover();
  await expect(here).toHaveText('7');
  // Playwright cannot hold a touch down, so the pointer events are sent directly.
  const touch = (type, dx) => dataCell(page, 12).evaluate((el, [type, dx]) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: r.x + r.width / 2 + dx, clientY: r.y + r.height / 2,
    }));
  }, [type, dx]);
  await touch('pointerdown', 0);
  await expect(dataCell(page, 12)).toHaveClass(/\bis-pressing\b/);
  await expect(here).toHaveText('12');
  // A finger that moves a little, less than a scroll, is no mouse moving.
  await touch('pointermove', 3);
  await expect(dataCell(page, 12)).toHaveClass(/\bis-pressing\b/);
  await expect(here).toHaveText('12');
  await touch('pointercancel', 3);
});

test('pointing at a cell changes only colors and visibility: the mouse crossing the strip lays nothing out again', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Chromium counts its layouts; phones have no mouse');
  await page.goto('/?dx=79-15/23');
  // The code list is built once the page is idle: before counting, not while.
  await expect(page.locator('#reference-ui .assign-table')).toHaveCount(1);
  const here = page.locator('#strip .ruler__cell.is-here');
  await page.locator('#strip').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const boxes = [];
  for (let n = 7; n <= 20; n++) boxes.push(await dataCell(page, n).boundingBox());
  const y = boxes[0].y + boxes[0].height / 2;
  await page.mouse.move(boxes[0].x + boxes[0].width / 2, y);
  await expect(here).toHaveText('7');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount').value;
  const before = await layouts();
  for (const box of boxes.slice(1)) await page.mouse.move(box.x + box.width / 2, y);
  await expect(here).toHaveText('20');
  expect(await layouts()).toBe(before);
});

test('the ruler marks the cell pointed at with colors and visibility only', { tag: '@phone' }, async ({ page }) => {
  // The rule itself, in every engine: a transform, say, lays nothing out, so the layout count misses it.
  await page.goto('/?dx=79-15/23');
  // Every computed property of a ruler cell, of its ticks and of its number.
  const styles = (n) => page.evaluate((n) => {
    const of = (el, pseudo) => {
      const s = getComputedStyle(el, pseudo);
      return Object.fromEntries([...s].map((name) => [name, s.getPropertyValue(name)]));
    };
    const cell = document.querySelector(`#strip .ruler__cell[data-cell="${n}"]`);
    return { cell: of(cell), before: of(cell, '::before'), after: of(cell, '::after'), number: of(cell.querySelector('.ruler__num')) };
  }, n);
  const here = page.locator('#strip .ruler__cell.is-here');
  // A cell whose number shows only when pointed at, and one whose number always shows.
  for (const n of [18, 20]) {
    const plain = await styles(n);
    await dataCell(page, n).focus();
    await expect(here).toHaveText(String(n));
    const marked = await styles(n);
    await page.locator('#mirror-toggle').focus();
    await expect(here).toHaveCount(0);
    const changed = Object.keys(plain).flatMap((part) => Object.keys(plain[part])
      .filter((name) => plain[part][name] !== marked[part][name]).map((name) => `${part} ${name}`));
    expect(changed.length, `cell ${n}`).toBeGreaterThan(0);
    expect(changed.filter((p) => !/ (?:[\w-]+-)?color$| visibility$/.test(p)), `cell ${n}`).toEqual([]);
  }
});

test('in Windows contrast themes, the ruler marks the cell pointed at in the color of focus, and its ticks keep their shapes', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'contrast themes are a Windows desktop feature');
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 18).focus();
  const color = (sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).color);
  await page.emulateMedia({ forcedColors: 'active' });
  const highlight = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'Highlight';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await color('#strip .ruler__cell.is-here .ruler__num')).toBe(highlight);
  expect(await color('#strip .ruler__cell[data-cell="20"] .ruler__num')).not.toBe(highlight);
  // The ticks keep their shapes, which are borders partly transparent: the
  // lower half of each, the upper half at 1 and every fifth, both halves and
  // their right borders at the cell pointed at.
  const ticks = await page.evaluate(() => [12, 15, 18].map((n) => {
    const cell = document.querySelector(`#strip .ruler__cell[data-cell="${n}"]`);
    return ['::before', '::after'].map((half) => {
      const style = getComputedStyle(cell, half);
      return [style.borderLeftColor, style.borderRightColor];
    });
  }));
  const none = 'rgba(0, 0, 0, 0)';
  const text = await color('#strip .ruler__cell[data-cell="20"] .ruler__num'); // the theme's
  const [minor, major, here] = ticks;
  expect(minor).toEqual([[text, none], [none, none]]);
  expect(major).toEqual([[text, none], [text, none]]);
  expect(here).toEqual([[highlight, highlight], [highlight, highlight]]);
});

test('in Windows contrast themes too, a cell selected with the mouse has no outline of focus until a key is used', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'contrast themes are a Windows desktop feature');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?dx=79-15/23');
  const outline = () => dataCell(page, 12).evaluate((el) => getComputedStyle(el).outlineStyle);
  await dataCell(page, 12).click();
  await expect(dataCell(page, 12)).toBeFocused();
  expect(await outline()).toBe('none');
  await page.keyboard.press(' ');
  await expect.poll(outline).toBe('solid');
});

test('after a tap, the ruler names no cell once focus is elsewhere', { tag: '@phone' }, async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'a tap needs a touch screen');
  await page.goto('/?dx=79-15/23');
  const here = page.locator('#strip .ruler__cell.is-here');
  await dataCell(page, 8).tap();
  await expect(dataCell(page, 8)).toHaveAttribute('aria-pressed', 'true');
  // The finger has lifted, and focus goes elsewhere, as after a tap on another control.
  await page.locator('#mirror-toggle').focus();
  await expect(here).toHaveCount(0);
});

test('with the text twice as large, the number of the cell pointed at stays clear of the numbers beside it', { tag: '@phone' }, async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  // As with a browser set to a 32 px default font size: the numbers grow, the cells don't.
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  const clashes = [];
  // The cells that can take focus next to a number always shown (10, 15, 20, 25).
  for (const n of [9, 11, 14, 16, 19, 21, 24, 26]) {
    await dataCell(page, n).focus();
    await expect(page.locator('#strip .ruler__cell.is-here')).toHaveText(String(n));
    clashes.push(...await page.evaluate((n) => {
      const box = (c) => {
        const el = document.querySelector(`#strip .ruler__cell[data-cell="${c}"] .ruler__num`);
        return el && getComputedStyle(el).visibility === 'visible' ? el.getBoundingClientRect() : null;
      };
      const here = box(n);
      return [n - 1, n + 1].filter((c) => {
        const b = box(c);
        return b && b.right > here.left && b.left < here.right;
      }).map((c) => `${n} runs into ${c}`);
    }, n));
  }
  expect(clashes).toEqual([]);
});

test('a ruler over the film numbers the cells as the texts do: 1 and every fifth, and the cell pointed at', { tag: '@phone' }, async ({ page, isMobile }) => {
  await page.goto('/?dx=79-15/23');
  const ruler = page.locator('#strip .ruler__cell');
  const shown = page.locator('#strip .ruler__num:visible');
  await expect(ruler).toHaveCount(31);
  await expect(shown).toHaveText(['1', '5', '10', '15', '20', '25', '30']);
  // Each tick stands over its own cell, also on a mirrored strip, where 1 is at the right end.
  // Both read at once, two frames after the strip is drawn: a mirrored one scrolls a frame later.
  const centers = () => page.evaluate(async () => {
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    const of = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    return [of('#strip .ruler__cell'), of('#strip .track--data .cell')];
  });
  for (const mirrored of [false, true]) {
    if (mirrored) await page.locator('#mirror-toggle').click();
    const [ticks, cells] = await centers();
    ticks.forEach((x, i) => expect(Math.abs(x - cells[i]), `cell ${i + 1}${mirrored ? ', mirrored' : ''}`).toBeLessThan(0.6));
    expect(ticks[0] > ticks[30]).toBe(mirrored);
  }
  await page.locator('#mirror-toggle').click();
  // The cell with keyboard focus, or under the mouse, shows its number too; then only it is marked.
  const here = page.locator('#strip .ruler__cell.is-here');
  await expect(here).toHaveCount(0);
  await dataCell(page, 18).focus();
  await expect(here).toHaveText('18');
  await expect(shown).toHaveText(['1', '5', '10', '15', '18', '20', '25', '30']);
  // Its number and tick in the accent color, the others' not.
  const colors = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.color = 'var(--accent-strong)';
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const of = (n) => {
      const cell = document.querySelector(`#strip .ruler__cell[data-cell="${n}"]`);
      return [getComputedStyle(cell.querySelector('.ruler__num')).color, getComputedStyle(cell, '::after').borderLeftColor];
    };
    return { accent, here: of(18), other: of(15) };
  });
  expect(colors.here).toEqual([colors.accent, colors.accent]);
  expect(colors.other).not.toContain(colors.accent);
  // Not read out: the cells' own names give their numbers.
  for (const where of ['#strip', '#layout-figure']) await expect(page.locator(`${where} .ruler`)).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#strip .strip__canvas').ariaSnapshot()).not.toMatch(/^\s*- text:/m);
  await page.keyboard.press('ArrowRight');
  await expect(here).toHaveText('19');
  if (!isMobile) {
    await dataCell(page, 12).hover();
    await expect(here).toHaveText('12');
    await page.mouse.move(1, 1);
    await expect(here).toHaveText('19'); // back to the cell with focus
  }
  // Focus gone from the strip: nothing is pointed at.
  await page.locator('#mirror-toggle').focus();
  await expect(here).toHaveCount(0);
  // The 7-bar layout has 23 cells, and the diagram in "How it works" its ruler without a cell pointed at.
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(ruler).toHaveCount(23);
  await expect(page.locator('#strip .ruler__num:visible')).toHaveText(['1', '5', '10', '15', '20']);
  await expect(page.locator('#layout-figure .ruler__cell')).toHaveCount(31);
  await expect(page.locator('#layout-figure .ruler__cell.is-here')).toHaveCount(0);
});

test('the ruler follows the mouse as it paints a run of bars, and names the cell it was let go on', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse');
  await page.goto('/');
  await dataCell(page, 8).scrollIntoViewIfNeeded();
  const here = page.locator('#strip .ruler__cell.is-here');
  const center = async (n) => {
    const box = await dataCell(page, n).boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  await page.mouse.move(...await center(8));
  await page.mouse.down();
  await expect(here).toHaveText('8');
  for (const n of [9, 10, 11]) await page.mouse.move(...await center(n), { steps: 3 });
  // While the button is held, the strip holds the pointer: the cells it crosses get no hover of their own.
  await expect(here).toHaveText('11');
  await page.mouse.up();
  for (const n of [8, 9, 10, 11]) await expect(dataCell(page, n)).toHaveAttribute('aria-pressed', 'true');
  await expect(here).toHaveText('11');
});
