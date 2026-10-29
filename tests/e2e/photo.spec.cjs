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

// The codes of frames 14, 14A and 15 side by side; the whole photo reads as 14A.
const THREE_CODES = { part1: 96, part2: 12, frame: 14, half: true, module: 6, width: 960, height: 110, angle: -0.6 };
// Frame 15's code in that photo, with a margin, in the photo's pixels.
const FRAME_15 = { left: 648, top: 34, right: 870, bottom: 90 };

/** Where a pixel of the (unturned) photo is on the screen, with the photo scrolled into view. */
async function onScreen(page, x, y) {
  const photo = page.locator('.photo__canvas');
  await photo.scrollIntoViewIfNeeded();
  return photo.evaluate((canvas, [px, py, w, h]) => {
    const box = canvas.getBoundingClientRect();
    return { x: box.left + (px / w) * box.width, y: box.top + (py / h) * box.height };
  }, [x, y, THREE_CODES.width, THREE_CODES.height]);
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

test('an uploaded photo of a mirrored slide is read the right way around', async ({ page }, testInfo) => {
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
  await expect(page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
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
  // Track heights as measured on a real Kodak negative (research/05).
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module, clockHeight: 3.15, dataHeight: 2.5 });
  // Erase the data-track bar of cell 31 (the last cell of the stop pattern).
  const codeLeft = (syn.width - 31 * module) / 2;
  const dataTop = syn.height * 0.42 + 3.15 * module;
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

test('two clicks at opposite corners make a box, without dragging (WCAG 2.5.7)', async ({ page }, testInfo) => {
  await upload(page, testInfo, THREE_CODES, { noise: 12, seed: 1 });
  const found = page.locator('.photo__found');
  const clearSelection = page.getByRole('button', { name: 'Clear selection' });
  await expect(found).toContainText('DX 96-12, frame 14A');
  const a = await onScreen(page, FRAME_15.left, FRAME_15.top);
  const b = await onScreen(page, FRAME_15.right, FRAME_15.bottom);
  await page.mouse.click(a.x, a.y);
  await expect(clearSelection).toBeHidden(); // one corner is not a box yet
  await page.mouse.click(b.x, b.y);
  await expect(found).toContainText('DX 96-12, frame 15');
  // A single click starts another box instead of clearing this one; Clear selection clears it.
  await page.mouse.click(a.x, a.y);
  await expect(clearSelection).toBeVisible();
  await expect(found).toContainText('DX 96-12, frame 15');
  await clearSelection.click();
  await expect(found).toContainText('DX 96-12, frame 14A');
});

test('the keyboard moves a box that starts around the barcode that was read (WCAG 2.1.1)', async ({ page, isMobile }, testInfo) => {
  await upload(page, testInfo, THREE_CODES, { noise: 12, seed: 1 });
  const found = page.locator('.photo__found');
  const photo = page.getByRole('application', { name: 'Photo of the film edge' });
  const keys = page.locator('#photo-keys');
  await expect(found).toContainText('DX 96-12, frame 14A');
  await expect(keys).toBeHidden();
  if (!isMobile) {
    // The photo comes next after the buttons above it.
    await page.getByRole('button', { name: 'Read again' }).focus();
    await page.keyboard.press('Tab');
  } else {
    await photo.focus();
  }
  await expect(photo).toBeFocused();
  await page.keyboard.press('ArrowRight'); // a box around 14A
  await expect(keys).toBeVisible();
  await expect(photo).toHaveAccessibleDescription(/Arrow keys move the box/);
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight'); // one code along
  await page.keyboard.press('Enter');
  await expect(found).toContainText('DX 96-12, frame 15');
  // Shift and an arrow key change the box's size: narrowed by half, the code no longer fits.
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo__result .is-error')).toBeVisible();
  // Escape clears the box, and the whole photo is read again.
  await page.keyboard.press('Escape');
  await expect(found).toContainText('DX 96-12, frame 14A');
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeHidden();
  await photo.blur();
  await expect(keys).toBeHidden();
});

test('a finger that drifts a little while tapping marks a corner, not a box', async ({ page }, testInfo) => {
  await upload(page, testInfo, THREE_CODES, { noise: 12, seed: 1 });
  await expect(page.locator('.photo__found')).toContainText('frame 14A');
  const a = await onScreen(page, FRAME_15.left, FRAME_15.top);
  await page.locator('.photo__canvas').evaluate((canvas, { x, y }) => {
    const at = (type, dx) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'touch', button: 0, clientX: x + dx, clientY: y + dx }));
    at('pointerdown', 0);
    at('pointermove', 8);
    at('pointerup', 8);
  }, a);
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeHidden();
  await expect(page.locator('.photo__found')).toContainText('frame 14A');
});

test('straightening shows a preview while the slider moves, and reads once it stops', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const found = page.locator('.photo__found');
  await expect(found).toContainText('DX 96-12, frame 14A');
  const slide = (value, change) => page.locator('#photo-fine').evaluate((input, [v, c]) => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (c) input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [value, change]);
  await slide('5', false);
  await expect(page.locator('.photo__canvas')).toHaveCSS('transform', /^matrix/);
  await expect(found).toContainText('DX 96-12, frame 14A'); // not read again yet
  await expect(page.locator('#photo-fine')).toHaveAttribute('aria-valuetext', '5 degrees');
  // Back where it started: nothing to do.
  await slide('0', false);
  await expect(page.locator('.photo__canvas')).toHaveCSS('transform', 'none');
  await expect(found).toContainText('DX 96-12, frame 14A');
  // Let go somewhere else: the photo is turned and read again.
  await slide('-1', true);
  await expect(page.locator('.photo__canvas')).toHaveCSS('transform', 'none');
  await expect(page.locator('.photo__result')).not.toContainText('Looking for the barcode');
  await expect(found).toContainText('DX 96-12, frame 14A');
});

test('focus stays on the reader\'s buttons as they change', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toBeVisible();
  const again = page.getByRole('button', { name: 'Read again' });
  await again.focus();
  await page.keyboard.press('Enter');
  await expect(again).toBeFocused();
  await expect(page.locator('.photo__found')).toBeVisible();
  const another = page.getByRole('button', { name: 'Show another sample' });
  await another.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
  await expect(page.getByRole('button', { name: 'Show another sample' })).toBeFocused();
  // Clear selection goes with the box: focus moves on to the photo.
  const photo = page.getByRole('application', { name: 'Photo of the film edge' });
  await photo.focus();
  await page.keyboard.press('ArrowRight');
  const clear = page.getByRole('button', { name: 'Clear selection' });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(clear).toBeHidden();
  await expect(photo).toBeFocused();
});

test('a paste meant for a text field stays there, even with a picture in it', async ({ page }) => {
  const prevented = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
    const data = new DataTransfer();
    data.items.add('hp5', 'text/plain');
    data.items.add(new File([blob], 'picture.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    document.getElementById('finder-q').dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.locator('.photo__source')).toBeEmpty();
});

test('a photo file without a type is opened anyway', async ({ page }) => {
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
  const buffer = encodePng(image.compose(syn, {}), syn.width, syn.height);
  await page.locator('#photo-file').setInputFiles({ name: 'IMG_0001', mimeType: '', buffer });
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a faint code is read with a note, and a 7-bar code reads right up to the edge of the photo', async ({ page }, testInfo) => {
  const faint = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 8 });
  for (let i = 0; i < faint.ink.length; i++) faint.ink[i] *= 0.1;
  const file = testInfo.outputPath('faint.png');
  await writeFile(file, encodePng(image.compose(faint, { noise: 6, seed: 2 }), faint.width, faint.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await expect(page.locator('.photo__notes')).toContainText('faint or damaged');
  // Only 2 cells of film after a 23-cell code: still read, as older film is, with no note.
  const short = image.synthesize({ part1: 79, part2: 7, format: 'short', module: 8 });
  const rgba = image.compose(short, {});
  const left = Math.round((short.width - 23 * 8) / 2 - 3 * 8);
  const w = 28 * 8;
  const cut = new Uint8ClampedArray(w * short.height * 4);
  for (let y = 0; y < short.height; y++) cut.set(rgba.subarray((y * short.width + left) * 4, (y * short.width + left + w) * 4), y * w * 4);
  const edge = testInfo.outputPath('edge-cut.png');
  await writeFile(edge, encodePng(cut, w, short.height));
  await page.locator('#photo-file').setInputFiles(edge);
  await expect(page.locator('.photo__found')).toContainText('DX 79-7');
  await expect(page.locator('.photo__notes')).not.toContainText('11 thin bars');
});

test('a photo removed while it is being opened again stays removed', async ({ page }, testInfo) => {
  // Images open at once, until window.slow says how long to take.
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    window.opened = 0;
    window.slow = 0;
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).then(() => new Promise((done) => setTimeout(() => { window.opened++; done(); }, window.slow)));
    };
  });
  const bar = page.locator('#source');
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await page.waitForFunction(() => window.opened === 1);
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('button', { name: 'Use this code' }).click();
  // Undo brings back the first photo's code; opening it starts loading that photo again...
  await page.locator('#undo').click();
  await expect(bar).toContainText('DX 79-15, frame 23');
  await page.evaluate(() => { window.slow = 2000; });
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  // ...and Remove comes before it has opened.
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await page.waitForFunction(() => window.opened === 2);
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
  await expect(page.locator('#photo .photo__step').first()).toHaveAttribute('aria-current', 'step');
});

test('reading a photo again and again draws no browser warning', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Read again' }).click();
    await expect(page.locator('.photo__found')).toBeVisible();
  }
  expect(warnings.filter((w) => /willReadFrequently|getImageData/.test(w))).toEqual([]);
});

test('Remove the photo leaves another photo the reader has moved on to', async ({ page }) => {
  const bar = page.locator('#source');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Show another sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
});

test('flip mirrors the straightened photo', async ({ page }, testInfo) => {
  // Tilted well beyond the reader's own ±3° search (taller tracks still read
  // at about 7°), so it must be straightened.
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 8, angle: 10 }, {});
  await expect(page.locator('.photo__result .is-error')).toBeVisible();
  await expect(page.locator('.photo__found')).toHaveCount(0);
  // The synthetic edge slopes down to the right (clockwise on screen), so
  // straightening turns the view 10° the other way.
  await page.locator('#photo-fine').evaluate((input) => {
    input.value = '-10';
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
  // The reader has folded up into its three steps, all checked off.
  await expect(page.locator('#photo .photo__step.is-done')).toHaveCount(3);
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
  // Editing the strip keeps the photo, marked as edited since.
  await page.locator('#strip .track--data [data-cell="9"]').click();
  await expect(bar).toContainText('edited since');
  // The photo opens again where it was left.
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('#photo .photo__canvas')).toBeVisible();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  // Clear, or another code, takes the bar away, and the reader shows its steps again.
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(bar).not.toContainText('edited since');
  await page.locator('#clear').click();
  await expect(bar).toBeHidden();
  await expect(page.locator('#photo')).not.toHaveClass(/\bis-folded\b/);
  await expect(page.locator('#photo .photo__canvas')).toBeVisible();
  // × forgets the photo: the reader starts again at step 1.
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('#photo .photo__step').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
});

test('"Open the photo" shows the photo the code came from, also when Undo brings back an earlier one', async ({ page }, testInfo) => {
  const bar = page.locator('#source');
  const found = page.locator('.photo__found');
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(found).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(found).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(found).toContainText('DX 96-12, frame 14A');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#undo').click();
  await expect(bar).toContainText('From your photo: DX 79-15, frame 23');
  // The folded reader's button brings back that photo, flipped as it was.
  await page.locator('#photo .photo__folded').getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('.photo__source')).toContainText('Your photo');
  await expect(found).toContainText('DX 79-15, frame 23');
  await expect(page.getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'true');
  // And after Redo, the one above the strip brings back the sample.
  await page.locator('#redo').click();
  await expect(bar).toContainText('From your photo: DX 96-12, frame 14A');
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('.photo__source')).toContainText('Sample');
  await expect(found).toContainText('DX 96-12, frame 14A');
});

test('"Open the photo" brings back the reading on the strip, also from the same photo boxed or flipped differently', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no smooth scrolling under the clicks
  const bar = page.locator('#source');
  const found = page.locator('.photo__found');
  const use = page.getByRole('button', { name: 'Use this code' });
  const flip = page.getByRole('button', { name: 'Flip' });
  const box = async (left, right) => {
    const a = await onScreen(page, left, FRAME_15.top);
    const b = await onScreen(page, right, FRAME_15.bottom);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
  };
  await upload(page, testInfo, THREE_CODES, { noise: 12, seed: 1 });
  await expect(found).toContainText('frame 14A');
  // Frame 15, then the same photo boxed around frame 14.
  await box(FRAME_15.left, FRAME_15.right);
  await expect(found).toContainText('DX 96-12, frame 15');
  await use.click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await box(FRAME_15.left - 558, FRAME_15.right - 558); // two codes back
  await expect(found).toContainText('DX 96-12, frame 14:');
  await use.click();
  await page.locator('#undo').click();
  await expect(bar).toContainText('From your photo: DX 96-12, frame 15');
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(found).toContainText('DX 96-12, frame 15');
  // Flipped and used again, then undone: the photo opens unflipped, as it was read.
  await flip.click();
  await expect(page.locator('.photo__notes')).toContainText('mirrored or upside down');
  await use.click();
  await page.locator('#undo').click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await expect(found).toContainText('DX 96-12, frame 15');
});

test('a removed photo stays away, also where it was used more than once', async ({ page }) => {
  const bar = page.locator('#source');
  const use = page.getByRole('button', { name: 'Use this code' });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await use.click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await use.click();
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(bar).toBeHidden();
  // Undo brings back the code from the first use, but not the photo.
  await page.locator('#undo').click();
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
  await expect(bar).toBeHidden();
  await expect(page.locator('#strip .strip__photo canvas')).toHaveCount(0);
  await expect(page.locator('#photo .photo__step').first()).toHaveAttribute('aria-current', 'step');
});

test('a photo still opening gives way to a newer choice, and to Remove', async ({ page }, testInfo) => {
  // Each image takes another window.slow ms to open, as a large photo on a slow phone might.
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    window.opened = 0;
    window.slow = 500;
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).then(() => new Promise((done) => setTimeout(() => { window.opened++; done(); }, window.slow)));
    };
  });
  const found = page.locator('.photo__found');
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__result')).toContainText('Opening the photo…');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(found).toContainText('DX 96-12, frame 14A');
  await page.waitForFunction(() => window.opened === 1);
  await expect(page.locator('.photo__source')).toContainText('Sample');
  await expect(found).toContainText('DX 96-12, frame 14A');
  // Remove forgets a photo still opening too (opening slowly enough to be sure).
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).click();
  await page.evaluate(() => { window.slow = 2000; });
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await page.locator('#source').getByRole('button', { name: 'Remove the photo' }).click();
  await page.waitForFunction(() => window.opened === 2);
  await expect(page.locator('#photo .photo__canvas')).toBeHidden();
  await expect(page.locator('#photo .photo__step').first()).toHaveAttribute('aria-current', 'step');
});

test('the folded reader shows its steps again once another code, or none, is on the strip', async ({ page }) => {
  const reader = page.locator('#photo');
  const use = page.getByRole('button', { name: 'Use this code' });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await use.click();
  await expect(reader).toHaveClass(/\bis-folded\b/);
  await expect(reader).toContainText('The code from your photo is on the strip below.');
  // Undo takes the photo's code off the strip...
  await page.locator('#undo').click();
  await expect(reader).not.toHaveClass(/\bis-folded\b/);
  await expect(use).toBeVisible();
  // ...and so does another code.
  await use.click();
  await expect(reader).toHaveClass(/\bis-folded\b/);
  await page.getByRole('button', { name: 'Show examples' }).click();
  await page.getByRole('button', { name: 'Kodak BW400CN, frame 23' }).click();
  await expect(reader).not.toHaveClass(/\bis-folded\b/);
  // Editing the photo's code keeps the reader folded: the code is still the photo's, edited.
  await use.click();
  await page.locator('#strip .track--data [data-cell="9"]').click();
  await expect(reader).toHaveClass(/\bis-folded\b/);
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
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await expect(photo).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  // In the other layout the cells no longer match: the photo goes, the bar stays.
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(photo).toBeHidden();
  await expect(page.locator('#source')).toContainText('edited since');
});
