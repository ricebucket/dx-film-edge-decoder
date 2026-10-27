const { test, expect } = require('@playwright/test');
const { writeFile } = require('node:fs/promises');
const { watchConsole, encodePng } = require('./helpers.cjs');
const image = require('../../site/js/dx-image.js');

let checkConsole;
test.beforeEach(async ({ page }) => {
  checkConsole = watchConsole(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Read a photo' }).click();
  await expect(page.locator('#photo')).toBeVisible();
});
test.afterEach(() => checkConsole());

async function upload(page, testInfo, synthOptions, composeOptions) {
  const syn = image.synthesize(synthOptions);
  const png = encodePng(image.compose(syn, composeOptions), syn.width, syn.height);
  const file = testInfo.outputPath('edge.png');
  await writeFile(file, png);
  await page.locator('#photo-file').setInputFiles(file);
}

test('the sample photo is read and can be used', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const found = page.locator('.photo__found');
  await expect(found).toContainText('DX 96-12, frame 14A');
  await expect(found).toContainText('KODAK GOLD 200 Film');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#photo')).toHaveClass(/\bis-folded\b/);
  await expect(page.locator('#source')).toContainText('From your photo: DX 96-12, frame 14A');
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
});

test('an uploaded photo of a mirrored slide is read the right way round', async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 34, part2: 13, frame: 7, half: true, mirrored: true, module: 7 }, { look: 'slide' });
  await expect(page.locator('.photo__found')).toContainText('DX 34-13, frame 7A');
  await expect(page.locator('.photo__found')).toContainText('FUJICHROME PROVIA 100F PROFESSIONAL');
  await expect(page.locator('.photo__notes')).toContainText('mirrored or upside down');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'slide');
});

test('turning the photo by 90° still finds the code', async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6, angle: 90, width: 120, height: 400 }, {});
  await expect(page.locator('.photo__result')).toContainText('No clock track found');
  await page.getByRole('button', { name: 'Rotate right 90 degrees' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a photo without a barcode gets advice instead of a guess', async ({ page }, testInfo) => {
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23 });
  syn.ink.fill(0);
  const file = testInfo.outputPath('blank.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__result')).toContainText('No clock track found');
});

test('a non-image file is refused politely', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('notes.txt');
  await writeFile(file, 'not an image');
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__drop')).toBeVisible();
  await expect(page.getByText('That file is not an image.')).toBeVisible();
});

test('a photo of an older 7-bar code switches the strip to that layout', async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 79, part2: 7, format: 'short', module: 8, angle: 1 }, { look: 'negative' });
  await expect(page.locator('.photo__found')).toContainText('DX 79-7');
  await expect(page.locator('.photo__found')).toContainText('KODACOLOR VR200 Film');
  await expect(page.locator('.photo__notes')).toContainText('original 23-cell layout');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
  await expect(page.locator('#result .status')).toHaveText('Valid DX code (23-cell layout)');
});

test('the sample is labeled, and further samples can be loaded', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__source')).toContainText('Sample: a computer-drawn film edge');
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('button', { name: 'Show another sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
  await page.getByRole('button', { name: 'Show another sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 109-9');
});

test('a scratched stop bar does not stick to the strip', async ({ page }, testInfo) => {
  const module = 8;
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module });
  // Erase the data-track bar of cell 31 (the last cell of the stop pattern).
  const codeLeft = (syn.width - 31 * module) / 2;
  const dataTop = syn.height * 0.42 + 2.2 * module;
  for (let y = Math.ceil(dataTop); y < syn.height; y++) {
    for (let x = 0; x < syn.width; x++) {
      if (Math.floor((x - codeLeft) / module) === 30) syn.ink[y * syn.width + x] = 0;
    }
  }
  const file = testInfo.outputPath('scratched.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#result .status')).toHaveText('Valid DX code');
  await expect(page.locator('#hint')).toContainText('Valid code');
  await expect(page.locator('#result-title')).toBeFocused();
});

test('a canceled drag leaves the reader usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toBeVisible();
  await page.locator('.photo__canvas').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const at = (type, dx) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 7, button: 0, clientX: box.left + 20 + dx, clientY: box.top + 20 + dx,
    }));
    at('pointerdown', 0);
    at('pointermove', 2);
    at('pointercancel', 2);
  });
  await page.getByRole('button', { name: 'Read again' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await expect(page.getByRole('button', { name: 'Read again' })).toBeEnabled();
});

test('flip mirrors the straightened photo', async ({ page }, testInfo) => {
  // Tilted beyond the reader's own ±3° tolerance, so it must be straightened.
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 8, angle: 7 }, {});
  await expect(page.locator('.photo__result .is-error')).toBeVisible();
  await expect(page.locator('.photo__found')).toHaveCount(0);
  // The synthetic edge slopes down to the right (clockwise on screen), so
  // straightening turns the view 7° the other way.
  await page.locator('#photo-fine').evaluate((input) => {
    input.value = '-7';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await expect(page.locator('.photo__notes')).toContainText('mirrored or upside down');
});

test('the photo keeps its proportions on screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const ratios = await page.locator('.photo__canvas').evaluate((c) => {
    const box = c.getBoundingClientRect();
    return [box.width / box.height, c.width / c.height];
  });
  expect(Math.abs(ratios[0] / ratios[1] - 1)).toBeLessThan(0.01);
});


test('the two ways in are tabs, and the reader marks the step to do next', async ({ page }) => {
  const steps = page.locator('#photo .photo__step');
  await expect(page.getByRole('tab', { name: 'Read a photo' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#way-copy')).toBeHidden();
  await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Read again' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(0)).toHaveClass(/\bis-done\b/);
  await expect(steps.nth(1)).toHaveClass(/\bis-done\b/);
  // The empty result below says what to do in this way in.
  await expect(page.locator('#result-title')).toHaveText('Read a photo of your barcode');
  // Arrow keys move between the tabs, as in any tab list.
  await page.getByRole('tab', { name: 'Read a photo' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Copy the bars' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Copy the bars' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#way-copy')).toBeVisible();
  await expect(page.locator('#photo')).toBeHidden();
  await expect(page.locator('#result-title')).toHaveText('Copy the lower row of your barcode');
});

test('after "Use this code" the photo stays above the strip until another code replaces it', async ({ page }) => {
  const bar = page.locator('#source');
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(bar).toContainText('From your photo: DX 96-12, frame 14A');
  await expect(bar.getByRole('img', { name: 'Your photo', exact: true })).toBeVisible();
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  // The reader has folded up into its three ticked steps.
  await expect(page.locator('#photo .photo__step.is-done')).toHaveCount(3);
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
  // Editing the strip keeps the photo, marked as edited since.
  await page.locator('#strip .track--data [data-cell="9"]').click();
  await expect(bar).toContainText('edited since');
  // The photo opens again where it was left.
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('#photo .photo__canvas')).toBeVisible();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  // Clear, or another code, takes the bar away.
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(bar).not.toContainText('edited since');
  await page.locator('#clear').click();
  await expect(bar).toBeHidden();
  // × forgets the photo: the reader starts again at step 1.
  await page.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('#photo .photo__step').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
});

test("the photo's barcode lines up over the strip's cells, also mirrored, while the layout stays", async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  const photo = page.locator('#strip .strip__photo canvas');
  const code = page.locator('#strip .film__code');
  const [p, c] = [await photo.boundingBox(), await code.boundingBox()];
  expect(Math.abs(p.x - c.x)).toBeLessThan(1);
  expect(Math.abs(p.width - c.width)).toBeLessThan(1);
  // Mirrored, the photo turns with the strip, so each cell stays over its own.
  await page.getByRole('button', { name: 'Mirror' }).click();
  await expect(photo).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  // In the other layout the cells no longer match: the photo goes, the bar stays.
  await page.getByRole('button', { name: '7 thin bars' }).click();
  await expect(photo).toBeHidden();
  await expect(page.locator('#source')).toContainText('edited since');
});
