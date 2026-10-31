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

test('a bar in an unused cell is explained', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await dataCell(page, 14).click();
  await expect(page.locator('#result')).toContainText('Cell 14 should never have a bar');
  await expect(page.locator('#hint')).toHaveText('Cell 14 should always be empty.');
  await expect(page.locator('#result')).toContainText('shifted by one cell');
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
  await expect(bar).toContainText('From your photo: DX 96-12, frame 14A');
  await page.locator('#undo').click();
  await expect(title).toHaveText('KODAK Professional BW400CN Film');
  await expect(bar).toContainText('Example: Kodak BW400CN, frame 23');
  await expect(bar).not.toContainText('edited since');
  await expect(page.locator('#strip .strip__photo canvas')).toHaveCount(0);
  await page.locator('#redo').click();
  await expect(bar).toContainText('From your photo: DX 96-12, frame 14A');
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  // Clear, undone, brings the photo back with its code...
  await page.locator('#clear').click();
  await expect(bar).toBeHidden();
  await page.locator('#undo').click();
  await expect(bar).toContainText('From your photo: DX 96-12, frame 14A');
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
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?dx=79-15/23');
  for (const mirrored of [false, true]) {
    if (mirrored) await page.locator('#mirror-toggle').click();
    // The part of the film on screen: on phones it scrolls sideways.
    await page.locator('#strip .film').scrollIntoViewIfNeeded();
    const film = await page.locator('#strip .film').boundingBox();
    const x0 = Math.max(film.x, 0);
    const x1 = Math.min(film.x + film.width, page.viewportSize().width);
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
    await expect(hint).toContainText('Only 7 thin bars in your top row?');
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
    await expect(page).toHaveURL(/\?dx=12-13$/);
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
  await expect(page.locator('#result .match--community').nth(6)).toBeFocused();
  // Undo back to the other layout draws a new strip; focus stays on its cell.
  await page.goto('/');
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await dataCell(page, 9).click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(31);
  await expect(dataCell(page, 9)).toBeFocused();
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
