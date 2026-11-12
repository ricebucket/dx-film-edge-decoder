const { test, expect } = require('@playwright/test');
const { writeFile, unlink } = require('node:fs/promises');
const { watchConsole, encodePng, sideOverflow } = require('./helpers.cjs');
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

/**
 * Make each photo take window.slow ms more to open, counted in window.opened.
 * A photo opens with createImageBitmap where the browser can, else in an <img>.
 */
async function slowOpening(page, ms) {
  await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible(); // the reader has loaded
  await page.evaluate((slow) => {
    window.opened = 0;
    window.slow = slow;
    const later = (value) => new Promise((done) => setTimeout(() => { window.opened++; done(value); }, window.slow));
    const open = window.createImageBitmap;
    window.createImageBitmap = function (source, ...rest) {
      const made = open.call(this, source, ...rest);
      return source instanceof Blob ? made.then(later) : made;
    };
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).then(() => later());
    };
  }, ms);
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
  await expect(page.locator('#source')).toContainText('From the photo: DX 96-12, frame 14A');
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
});

test('a code read from a photo picks no film, so the result names the film the reader named', async ({ page }) => {
  // A film picked before, with the sample's DX number.
  await page.goto('/?dx=96-12/1&film=bfd-930');
  await expect(page.locator('#result-title')).toHaveText('Kodak Gold 200 GB 200-7');
  await page.getByRole('tab', { name: 'Read a photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A: KODAK GOLD 200 Film');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
  await expect(page).toHaveURL(/\?dx=96-12\/14A$/);
  // Undo brings back the code before, with its pick.
  await page.locator('#undo').click();
  await expect(page.locator('#result-title')).toHaveText('Kodak Gold 200 GB 200-7');
  await expect(page).toHaveURL(/\?dx=96-12\/1&film=bfd-930$/);
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
  await expect(page.locator('.photo__result')).toContainText('The barcode’s top row was not found.');
  await page.getByRole('button', { name: 'Rotate right 90 degrees' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a photo without a barcode gets advice instead of a guess', async ({ page }, testInfo) => {
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23 });
  syn.ink.fill(0);
  const file = testInfo.outputPath('blank.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__result')).toContainText('The barcode’s top row was not found.');
});

test('a non-image file is refused politely', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('notes.txt');
  await writeFile(file, 'not an image');
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__drop')).toBeVisible();
  await expect(page.getByText('That file is not an image.')).toBeVisible();
});

test('an SVG file is not opened, and a photo chosen after it is read', async ({ page }, testInfo) => {
  // A drawing of the code that an <img> would show, and the reader would read.
  const bars = [0, 2, 4, 9, 11, 14, 17].map((x) => `<rect x="${40 + x * 8}" y="60" width="8" height="20"/>`).join('');
  const buffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="150"><rect width="640" height="150" fill="#fff"/>${bars}</svg>`);
  for (const mimeType of ['image/svg+xml', 'image/svg+xml;charset=utf-8']) {
    await page.locator('#photo-file').setInputFiles({ name: 'edge.svg', mimeType, buffer });
    await expect(page.locator('.photo__result'), mimeType).toHaveText('This image could not be opened. Try a JPEG, PNG or WebP file.');
    await expect(page.locator('.photo__drop')).toBeVisible();
    await expect(page.locator('.photo__source')).toBeEmpty();
  }
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a photo of an older 7-bar code switches the strip to that layout', async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 79, part2: 7, format: 'short', module: 8, angle: 1 }, { look: 'negative' });
  await expect(page.locator('.photo__found')).toContainText('DX 79-7');
  await expect(page.locator('.photo__found')).toContainText('KODACOLOR VR200 Film');
  await expect(page.locator('.photo__notes')).toContainText('An older 7-bar code, without a frame number.');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#strip .track--data .cell')).toHaveCount(23);
  await expect(page.locator('#result .status')).toHaveText('Valid DX code (23-cell layout)');
});

test('a photo names its film as the result does', async ({ page }, testInfo) => {
  // Known only from the community list: named as the result names it.
  await upload(page, testInfo, { part1: 2, part2: 0, frame: 1, module: 8 }, { look: 'negative' });
  await expect(page.locator('.photo__found')).toContainText('Sakuracolor SR-100');
  // Several registry films: all of them, as the heading lists them.
  await upload(page, testInfo, { part1: 3, part2: 9, frame: 1, module: 8 }, { look: 'slide' });
  await expect(page.locator('.photo__found')).toContainText('DX 3-9');
  const found = await page.locator('.photo__found').innerText();
  await page.getByRole('button', { name: 'Use this code' }).click();
  const title = await page.locator('#result-title').innerText();
  expect(title).toContain(' / ');
  expect(found).toContain(title);
});

test('the sample is labeled, and further samples can be loaded', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__source')).toContainText('Sample: a computer-drawn color negative.');
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
  // It fails a check, but the strip makes the stop pattern standard: no corrections are promised.
  await expect(page.locator('.photo__notes')).toContainText('does not pass all checks; compare the result with the actual film');
  await expect(page.locator('.photo__notes')).not.toContainText('suggested corrections');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#result .status')).toHaveText('Valid DX code');
  await expect(page.locator('#hint')).toContainText('Valid code');
  await expect(page.locator('#result-title')).toBeFocused();
});

test('a reading that no single bar can correct promises no corrections', async ({ page }, testInfo) => {
  const module = 8;
  const syn = image.synthesize({ part1: 39, part2: 1, frame: 1, module, clockHeight: 3.15, dataHeight: 2.5 });
  // Bars in the unassigned cell 14 and the parity cell 27, both empty in this
  // code: two problems, which no one bar fixes.
  const codeLeft = (syn.width - 31 * module) / 2;
  const dataTop = syn.height * 0.42 + 3.15 * module;
  for (let y = Math.ceil(dataTop); y < Math.floor(dataTop + 2.5 * module); y++) {
    for (let x = 0; x < syn.width; x++) {
      const cell = Math.floor((x - codeLeft) / module) + 1;
      if (cell === 14 || cell === 27) syn.ink[y * syn.width + x] = 1;
    }
  }
  const file = testInfo.outputPath('two-problems.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__found')).toContainText('DX 39-1, frame 1');
  await expect(page.locator('.photo__notes')).toContainText('does not pass all checks; compare the result with the actual film');
  await expect(page.locator('.photo__notes')).not.toContainText('suggested corrections');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#result .status')).toHaveText('2 problems to check');
  await expect(page.locator('#result .fixes')).toHaveCount(0);
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

test('the keyboard moves a box that starts around the barcode that was read (WCAG 2.1.1)', { tag: '@phone' }, async ({ page, isMobile }, testInfo) => {
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

test('the layout chosen limits what the reader looks for: a tilted slide is then not read as another film', async ({ page }, testInfo) => {
  // DX 74-13, frame 41, on a slide upside down and tilted by 7.3°: with the
  // layout found out (Auto), it passes for the 7-bar code of DX 85-4.
  await upload(page, testInfo,
    { part1: 74, part2: 13, frame: 41, half: false, module: 7, angle: -7.30679047992453, upsideDown: true, width: 560, height: 210, clockHeight: 1.96, dataHeight: 3.09 },
    { look: 'slide', noise: 13.980660807341337, blur: 1, seed: 6107 });
  const found = page.locator('.photo__found');
  await expect(found).toContainText('DX 85-4');
  const layout = page.locator('#photo').getByRole('group', { name: 'Layout' });
  await expect(layout.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  await layout.getByRole('button', { name: '11 thin bars' }).click();
  await expect(page.locator('.photo__result')).toContainText('top row was not found');
  // Straightened, it reads as it is.
  await page.locator('#photo-fine').evaluate((input) => {
    input.value = '7.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(found).toContainText('DX 74-13, frame 41');
  await expect(layout.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  // Another photo starts again with Auto, as it does unturned and unflipped.
  const bar = page.locator('#source');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(found).toContainText('DX 96-12, frame 14A');
  await expect(layout.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  // Undo brings back the slide's code: its photo opens with the layout it was read with...
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#undo').click();
  await expect(bar).toContainText('DX 74-13, frame 41');
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await expect(found).toContainText('DX 74-13, frame 41');
  await expect(layout.getByRole('button', { name: '11 thin bars' })).toHaveAttribute('aria-pressed', 'true');
  // ...and once removed, the reader is back to Auto.
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(page.locator('#photo [data-value="auto"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#photo [data-value="long"]')).toHaveAttribute('aria-pressed', 'false');
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
  await slowOpening(page, 0);
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

test('an image far longer than it is wide does not stop the photos after it from opening', async ({ page }, testInfo) => {
  // 30000 × 4 pixels: shrunk to the working size, it would be 0 pixels high.
  const thin = encodePng(new Uint8ClampedArray(30000 * 4 * 4).fill(200), 30000, 4);
  await page.locator('#photo-file').setInputFiles({ name: 'thin.png', mimeType: 'image/png', buffer: thin });
  await expect(page.locator('.photo__source')).toContainText('30000 × 4');
  await expect(page.locator('.photo__result .is-error')).toBeVisible();
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('Enter on the photo reads it, with or without a box', async ({ page }, testInfo) => {
  await upload(page, testInfo, THREE_CODES, { noise: 12, seed: 1 });
  const found = page.locator('.photo__found');
  await expect(found).toContainText('DX 96-12, frame 14A');
  const photo = page.getByRole('application', { name: 'Photo of the film edge' });
  await photo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo__result')).toContainText('Looking for the barcode…');
  await expect(found).toContainText('DX 96-12, frame 14A');
});

test('while another photo opens, the one shown can\'t be turned or read again', async ({ page }, testInfo) => {
  await slowOpening(page, 0);
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await page.evaluate(() => { window.slow = 1500; });
  await upload(page, testInfo, { part1: 96, part2: 12, frame: 14, half: true, module: 6 }, {});
  await expect(page.locator('.photo__result')).toContainText('Opening the photo…');
  for (const name of ['Rotate left 90 degrees', 'Rotate right 90 degrees', 'Flip', 'Read again']) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  await expect(page.getByRole('slider', { name: 'Straighten' })).toBeDisabled();
  await page.waitForFunction(() => window.opened === 2);
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  await expect(page.getByRole('button', { name: 'Flip' })).toBeEnabled();
});

test('while another photo opens, keyboard focus goes to the photo, and a press begun on the old photo makes no box on the new one', async ({ page }, testInfo) => {
  await slowOpening(page, 0);
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Read again' }).focus();
  await page.evaluate(() => { window.slow = 1500; });
  await upload(page, testInfo, THREE_CODES, {});
  await expect(page.locator('.photo__result')).toContainText('Opening the photo…');
  await expect(page.locator('.photo__canvas')).toBeFocused();
  // A press on the photo still shown, and an arrow key, while the new one opens.
  const box = await page.locator('.photo__canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 3 });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.opened === 2);
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  // The press ends on the new photo.
  const after = await page.locator('.photo__canvas').boundingBox();
  await page.mouse.move(after.x + after.width * 0.1, after.y + after.height * 0.9, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeHidden();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  await expect(page.locator('.photo__canvas')).toBeFocused();
});

test('"Open the photo" while the reader shows another photo puts keyboard focus on the photo, not on a button gone or disabled', async ({ page }, testInfo) => {
  await slowOpening(page, 0);
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await expect(page.locator('.photo__found')).toContainText('DX 79-15');
  await page.getByRole('button', { name: 'Use this code' }).click();
  // The reader moves on to a sample, which is not used.
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  // Back to the photo from the bar above the strip, from the keyboard, while it opens slowly.
  await page.evaluate(() => { window.slow = 800; });
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.photo__canvas')).toBeFocused();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15');
  await expect(page.locator('.photo__canvas')).toBeFocused();
});

test('a photo pasted while "Use this code" has focus moves focus to the photo, not to the page', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('button', { name: 'Use this code' }).focus();
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
  const png = encodePng(image.compose(syn, {}), syn.width, syn.height);
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'edge.png', { type: 'image/png' }));
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(page.locator('.photo__canvas')).toBeFocused();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15');
  await expect(page.locator('.photo__canvas')).toBeFocused();
});

test('focus on a reader button that goes away moves to the photo: Clear selection as a pasted photo opens, Open the photo as the reader unfolds', async ({ page }) => {
  const paste = async () => {
    const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
    const png = encodePng(image.compose(syn, {}), syn.width, syn.height);
    await page.evaluate((bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'edge.png', { type: 'image/png' }));
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, [...png]);
  };
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  const photo = page.getByRole('application', { name: 'Photo of the film edge' });
  await photo.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Clear selection' }).focus();
  await paste();
  await expect(page.locator('.photo__found')).toContainText('DX 79-15');
  await expect(photo).toBeFocused();
  // Folded once its code is used; Undo takes the code off the strip and unfolds it.
  const open = page.locator('.photo__folded').getByRole('button', { name: 'Open the photo' });
  await page.getByRole('button', { name: 'Use this code' }).click();
  await open.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(open).toBeHidden();
  await expect(photo).toBeFocused();
  // A photo pasted on the folded reader unfolds it too.
  await page.getByRole('button', { name: 'Use this code' }).click();
  await open.focus();
  await paste();
  await expect(open).toBeHidden();
  await expect(photo).toBeFocused();
});

test('a file dropped beside the photo reader does not replace the page', async ({ page }) => {
  const prevented = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'edge.png', { type: 'image/png' }));
    const events = ['dragover', 'drop'].map((type) => new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
    for (const e of events) document.getElementById('strip').dispatchEvent(e);
    return events.map((e) => e.defaultPrevented);
  });
  expect(prevented).toEqual([true, true]);
});

test('a picture pasted while the Straighten slider has focus is opened', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('slider', { name: 'Straighten' }).focus();
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
  const png = encodePng(image.compose(syn, {}), syn.width, syn.height);
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'edge.png', { type: 'image/png' }));
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a picture pasted with its SVG text listed before it is opened: the first image that is a file', async ({ page }) => {
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
  const png = encodePng(image.compose(syn, {}), syn.width, syn.height);
  // As a drawing program copies a picture: its SVG text, which is no file, then the picture as a PNG file.
  const paste = (withFile) => page.evaluate(([bytes, file]) => {
    const data = new DataTransfer();
    data.items.add('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="150"/>', 'image/svg+xml');
    if (file) data.items.add(new File([new Uint8Array(bytes)], 'edge.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return [...data.items].map((item) => `${item.kind} ${item.type}`);
  }, [[...png], withFile]);
  // The text alone gives no file to open.
  expect(await paste(false)).toEqual(['string image/svg+xml']);
  await expect(page.locator('.photo__result')).toHaveText('That file is not an image.');
  expect(await paste(true)).toEqual(['string image/svg+xml', 'file image/png']);
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
});

test('a whole photo whose code is cut off says what to look for, as it would for a box', async ({ page }, testInfo) => {
  // 79-15 with a speck in clock gap 22, cut off 3 cells after cell 23: it reads neither way.
  const M = 8;
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: M });
  const left = (syn.width - 31 * M) / 2;
  const top = syn.height * 0.42;
  for (let y = Math.ceil(top); y < top + 2.525 * M; y++) {
    for (let x = Math.ceil(left + 21 * M); x < left + 22 * M; x++) syn.ink[y * syn.width + x] = 1;
  }
  const rgba = image.compose(syn, { seed: 6 });
  const x0 = Math.round(left - 3 * M);
  const w = Math.round(29 * M);
  const cut = new Uint8ClampedArray(w * syn.height * 4);
  for (let y = 0; y < syn.height; y++) cut.set(rgba.subarray((y * syn.width + x0) * 4, (y * syn.width + x0 + w) * 4), y * w * 4);
  const file = testInfo.outputPath('cut.png');
  await writeFile(file, encodePng(cut, w, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__result')).toHaveText('This barcode looks cut off or damaged at its end. Make sure the whole barcode is visible, or try a sharper photo.');
});

test('a photo whose file has gone since is not brought back in place of another', async ({ page }, testInfo) => {
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 6 });
  const file = testInfo.outputPath('gone.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__found')).toContainText('DX 79-15');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#undo').click();
  await unlink(file); // moved or deleted meanwhile
  const check = checkConsole; // the browser reports the file it can no longer read
  checkConsole = () => check([/ERR_FILE_NOT_FOUND|^console: Failed to load resource$/]);
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('.photo__result')).toHaveText('This photo can no longer be opened. Choose it again.');
  await expect(page.locator('.photo__source')).toBeEmpty();
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

test('a new search takes the old reading away at once: its step and its outlines on the photo', async ({ page }) => {
  const steps = page.locator('#photo .photo__step');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  // Searches from now on wait until told to go on.
  await page.evaluate(() => {
    const read = window.DX.image.readBarcodeAsync;
    window.DX.image.readBarcodeAsync = (...args) => new Promise((go) => { window.goOn = go; }).then(() => read(...args));
  });
  const outlined = () => page.locator('.photo__canvas').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    // The outlines' blue and yellow (ui-photo.js).
    for (let i = 0; i < data.length; i += 4) {
      for (const [r, g, b] of [[0x4f, 0xb6, 0xc9], [0xff, 0xd1, 0x66]]) if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 30) n++;
    }
    return n;
  });
  expect(await outlined()).toBeGreaterThan(0);
  const layout = page.locator('#photo').getByRole('group', { name: 'Layout' });
  const read = page.getByRole('button', { name: 'Read again' });
  // Each from a reading: the sample still reads after the first two, not after turning it.
  for (const change of [() => layout.getByRole('button', { name: '7 thin bars' }).click(), () => page.getByRole('button', { name: 'Flip' }).click(), () => page.getByRole('button', { name: /^Rotate/ }).first().click()]) {
    await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
    await page.evaluate(() => { window.goOn = null; });
    await change();
    await expect(page.locator('#photo .photo__result')).toContainText('Looking for the barcode');
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');
    expect(await outlined()).toBe(0);
    // Waiting for the search, the button does not stand out (nor grow bolder).
    await expect(read).not.toHaveClass(/\btool--primary\b/);
    // Once the search has started, a moment after the message.
    await page.waitForFunction(() => window.goOn);
    await page.evaluate(() => window.goOn());
    await expect(page.locator('#photo .photo__result')).not.toContainText('Looking for the barcode');
  }
  // Not read after turning it: reading again is the next step.
  await expect(read).toHaveClass(/\btool--primary\b/);
  // Read again from there: the button stays as it is while the search runs, and after it.
  await page.evaluate(() => { window.goOn = null; });
  await read.click();
  await expect(page.locator('#photo .photo__result')).toContainText('Looking for the barcode');
  await expect(read).toHaveClass(/\btool--primary\b/);
  await page.waitForFunction(() => window.goOn);
  await expect(read).toHaveClass(/\btool--primary\b/);
  await page.evaluate(() => window.goOn());
  await expect(page.locator('#photo .photo__result')).not.toContainText('Looking for the barcode');
  await expect(read).toHaveClass(/\btool--primary\b/);
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
  // Arrow keys move between the tabs, as in any tab list.
  await page.getByRole('tab', { name: 'Read a photo' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Copy the bars' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Copy the bars' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#way-copy')).toBeVisible();
  await expect(page.locator('#photo')).toBeHidden();
});

test('after "Use this code" the photo stays above the strip until another code replaces it', async ({ page }) => {
  const bar = page.locator('#source');
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(bar).toContainText('From the photo: DX 96-12, frame 14A');
  await expect(bar.getByRole('img', { name: 'Photo', exact: true })).toBeVisible();
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
  await expect(bar).toContainText('From the photo: DX 79-15, frame 23');
  // The folded reader's button brings back that photo, flipped as it was.
  await page.locator('#photo .photo__folded').getByRole('button', { name: 'Open the photo' }).click();
  await expect(page.locator('.photo__source')).toContainText('Selected photo');
  await expect(found).toContainText('DX 79-15, frame 23');
  await expect(page.getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'true');
  // And after Redo, the one above the strip brings back the sample.
  await page.locator('#redo').click();
  await expect(bar).toContainText('From the photo: DX 96-12, frame 14A');
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
  await expect(bar).toContainText('From the photo: DX 96-12, frame 15');
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
  await slowOpening(page, 500);
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
  await expect(reader).toContainText('The code from the photo is on the strip below.');
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

test("the photo's barcode lines up over the strip's cells, while the strip is not mirrored and the layout stays", async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  const photo = page.locator('#strip .strip__photo canvas');
  // Both measured at once: a phone's strip scrolls to its code a moment after it is drawn.
  const lined = async () => {
    const [p, c] = await page.evaluate(() => ['.strip__photo canvas', '.film__code'].map((part) => document.querySelector(`#strip ${part}`).getBoundingClientRect().toJSON()));
    expect(Math.abs(p.x - c.x)).toBeLessThan(1);
    expect(Math.abs(p.width - c.width)).toBeLessThan(1);
  };
  await lined();
  // Mirrored, which only the Copy tab offers, the strip's cells run the other
  // way from the photo's: its row goes, the code and the bar stay.
  const mirror = page.locator('#toolbar').getByRole('button', { name: 'Mirror' });
  await page.locator('#tab-copy').click();
  await expect(photo).toBeVisible();
  await mirror.click();
  await expect(page.locator('#strip .strip')).toHaveClass(/\bis-mirrored\b/);
  await expect(page.locator('#strip .strip__photo')).toBeHidden();
  await expect(page.locator('#source')).toContainText('From the photo: DX 96-12, frame 14A');
  await expect(page.locator('#strip .film__code')).toBeVisible();
  // Mirror off again: the row is back over its cells.
  await mirror.click();
  await expect(photo).toBeVisible();
  await lined();
  // In the other layout the cells no longer match: the photo goes, the bar stays.
  await page.locator('[data-control="format"]').getByRole('button', { name: '7 thin bars' }).click();
  await expect(photo).toBeHidden();
  await expect(page.locator('#source')).toContainText('edited since');
});

test('Mirror is for copying by hand: with the photo reader open it is hidden and the strip is not mirrored', async ({ page }) => {
  const mirror = page.locator('#mirror-toggle');
  const strip = page.locator('#strip .strip');
  const photo = page.locator('#strip .strip__photo canvas');
  const copying = page.locator('#tab-copy');
  const reading = page.locator('#tab-photo');
  // The reader's tab is open: its photo is turned with Flip, so there is no Mirror.
  await expect(mirror).toBeHidden();
  // Chosen for copying, it shows in that tab...
  await copying.click();
  await expect(mirror).toBeVisible();
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await expect(strip).toHaveClass(/\bis-mirrored\b/);
  // ...not with the reader...
  await reading.click();
  await expect(mirror).toBeHidden();
  await expect(strip).not.toHaveClass(/\bis-mirrored\b/);
  // ...and again back at copying, while no photo is on the strip; over a reload too.
  await copying.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await expect(strip).toHaveClass(/\bis-mirrored\b/);
  await page.reload();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await expect(strip).toHaveClass(/\bis-mirrored\b/);
  // A photo's code goes on the strip as it was read.
  await reading.click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(photo).toBeVisible();
  await expect(strip).not.toHaveClass(/\bis-mirrored\b/);
  await expect(photo).toHaveCSS('transform', 'none');
  // Back at copying it stays so: with a photo on the strip, Mirror has gone off, for good.
  await copying.click();
  await expect(mirror).toBeVisible();
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  await expect(strip).not.toHaveClass(/\bis-mirrored\b/);
  await expect(photo).toHaveCSS('transform', 'none');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dx-prefs')).mirrored)).toBe(false);
  // Chosen again there, it turns the strip, which then has no photo's row; the reader's tab and back takes it off again.
  await mirror.click();
  await expect(strip).toHaveClass(/\bis-mirrored\b/);
  await expect(photo).toBeHidden();
  await reading.click();
  await expect(strip).not.toHaveClass(/\bis-mirrored\b/);
  await expect(photo).toBeVisible();
  await copying.click();
  await expect(photo).toBeVisible();
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  await expect(strip).not.toHaveClass(/\bis-mirrored\b/);
});

test("a 7-bar photo's row lines up over the strip too, and does not widen the strip", async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 79, part2: 7, format: 'short', module: 8, angle: 1 }, { look: 'negative' });
  await page.getByRole('button', { name: 'Use this code' }).click();
  const photo = page.locator('#strip .strip__photo canvas');
  await expect(photo).toBeVisible();
  // All measured at once: a phone's strip scrolls to its code a moment after it is drawn.
  const { p, c, canvas, film, words } = await page.evaluate(() => {
    const box = (part) => document.querySelector(`#strip ${part}`).getBoundingClientRect().toJSON();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#strip .strip__photo-label'));
    return { p: box('.strip__photo canvas'), c: box('.film__code'), canvas: box('.strip__canvas').width, film: box('.film').width, words: range.getBoundingClientRect().toJSON() };
  });
  expect(Math.abs(p.x - c.x)).toBeLessThan(1);
  expect(Math.abs(p.width - c.width)).toBeLessThan(1);
  expect(Math.abs(canvas - film)).toBeLessThan(1);
  // With no room before a 23-cell code, "Photo detail" stands above the photo, at its left.
  expect(words.bottom).toBeLessThanOrEqual(p.y + 0.5);
  expect(Math.abs(words.left - p.x)).toBeLessThan(1);
});

test('on a strip that scrolls sideways, "Photo detail" stands above the photo, at its left, where it shows whole', { tag: '@phone' }, async ({ page, isMobile }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  const strip = page.locator('#strip .strip');
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  const measure = () => page.evaluate(() => {
    const words = document.createRange();
    words.selectNodeContents(document.querySelector('#strip .strip__photo-label'));
    const box = (sel) => document.querySelector(`#strip ${sel}`).getBoundingClientRect().toJSON();
    return { words: words.getBoundingClientRect().toJSON(), photo: box('.strip__photo canvas'), code: box('.film__code'), view: box('.strip__scroller') };
  });
  if (!isMobile) {
    // A strip that shows whole has room before the code: the label beside the photo.
    await expect(strip).not.toHaveClass(/\bis-overflowing\b/);
    const wide = await measure();
    expect(wide.words.right).toBeLessThanOrEqual(wide.photo.left);
    expect(wide.words.top).toBeGreaterThan(wide.photo.top);
    expect(wide.words.bottom).toBeLessThan(wide.photo.bottom);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await expect(strip).toHaveClass(/\bis-overflowing\b/);
  // A phone shows the code's start, and all of the label with it.
  if (isMobile) {
    await expect.poll(async () => {
      const { words, view } = await measure();
      return words.left >= view.left && words.right <= view.right;
    }).toBe(true);
  }
  const at = await measure();
  // Above the photo, at its left edge.
  expect(at.words.bottom).toBeLessThanOrEqual(at.photo.top + 0.5);
  expect(Math.abs(at.words.left - at.photo.left)).toBeLessThan(1);
  // The photo still over its cells.
  expect(Math.abs(at.photo.x - at.code.x)).toBeLessThan(1);
  expect(Math.abs(at.photo.width - at.code.width)).toBeLessThan(1);
  expect(await sideOverflow(page)).toEqual([]);
});

test('a strip that starts and stops scrolling with a photo\'s row on it raises no error', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone\'s strip always scrolls');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  const strip = page.locator('#strip .strip');
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  // "Photo detail" goes above the photo and back beside it, which changes the
  // strip's height: an observer that watched it would loop. Chromium tells
  // only the window of that, WebKit the console too.
  await page.evaluate(() => {
    window.errors = [];
    addEventListener('error', (e) => window.errors.push(e.message));
  });
  for (const width of [900, 1280, 900, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    if (width < 1000) await expect(strip).toHaveClass(/\bis-overflowing\b/);
    else await expect(strip).not.toHaveClass(/\bis-overflowing\b/);
    // The error would come with the frame that changes the class.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test('on a flipped photo, Rotate right and Rotate left still turn it that way on screen', async ({ page }, testInfo) => {
  // A picture with each corner its own color: red, green over blue, yellow.
  const [w, h] = [300, 200];
  const corners = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = y < h / 2 ? (x < w / 2 ? [255, 0, 0] : [0, 255, 0]) : (x < w / 2 ? [0, 0, 255] : [255, 255, 0]);
      corners.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  const file = testInfo.outputPath('corners.png');
  await writeFile(file, encodePng(corners, w, h));
  await page.locator('#photo-file').setInputFiles(file);
  const shown = () => page.locator('.photo__canvas').evaluate((c) => {
    const g = c.getContext('2d');
    const name = { '255,0,0': 'R', '0,255,0': 'G', '0,0,255': 'B', '255,255,0': 'Y' };
    const at = (x, y) => name[[...g.getImageData(x, y, 1, 1).data].slice(0, 3)];
    return `${at(5, 5)}${at(c.width - 6, 5)} ${at(5, c.height - 6)}${at(c.width - 6, c.height - 6)}`;
  });
  await expect.poll(shown).toBe('RG BY');
  const right = page.getByRole('button', { name: 'Rotate right 90 degrees' });
  const left = page.getByRole('button', { name: 'Rotate left 90 degrees' });
  await right.click();
  await expect.poll(shown).toBe('BR YG');
  await left.click();
  await expect.poll(shown).toBe('RG BY');
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect.poll(shown).toBe('GR YB');
  // A quarter turn to the right of what is shown, and back; then one to the left.
  await right.click();
  await expect.poll(shown).toBe('YG BR');
  await left.click();
  await expect.poll(shown).toBe('GR YB');
  await left.click();
  await expect.poll(shown).toBe('RB GY');
});

test("in Windows contrast themes, the label beside the photo takes the theme's color, and the photo is left as it is", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'contrast themes are a Windows desktop feature');
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#strip .strip__photo canvas')).toBeVisible();
  const color = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
  expect(await color('#strip .strip__photo-label')).toBe(await color('#strip .bracket__name'));
});

test('a photo stays in the page: no request carries it, and nothing of it is stored', async ({ page }, testInfo) => {
  await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible(); // the reader has loaded
  // With the reader loaded, the page asks for nothing more: any request
  // counts, the site's own files too, whose address or headers could carry
  // the photo. (Not what stays in the page: WebKit lists an <img>'s blob:.)
  const sent = [];
  page.on('websocket', (socket) => sent.push(`WebSocket ${socket.url()}`));
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return;
    sent.push(`${req.method()} ${req.url()}`);
  });
  const syn = image.synthesize({ part1: 79, part2: 15, frame: 23, module: 8 });
  const file = testInfo.outputPath('private-photo-name.png');
  await writeFile(file, encodePng(image.compose(syn, {}), syn.width, syn.height));
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.locator('.photo__found')).toBeVisible();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(page.locator('#source')).toBeHidden();
  expect(sent).toEqual([]);
  const kept = await page.evaluate(async () => ({
    stored: JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  expect(kept.stored).not.toContain('private-photo-name');
  // Preferences are a few words; a picture would be far longer.
  expect(kept.stored.length).toBeLessThan(2000);
  expect([kept.databases, kept.caches]).toEqual([0, 0]);
});

test('the reader loads only when wanted: its two scripts come with its tab', async ({ page }) => {
  // A page of its own, with the mouse nowhere near the tab.
  const fresh = await page.context().newPage();
  const requests = [];
  fresh.on('request', (req) => requests.push(new URL(req.url()).pathname));
  const reader = () => requests.filter((p) => /\/js\/(dx-image|ui-photo)\.js$/.test(p));
  await fresh.goto('/');
  await expect(fresh.locator('#result-title')).toBeVisible();
  expect(reader()).toEqual([]);
  await fresh.getByRole('tab', { name: 'Read a photo' }).click();
  await fresh.getByRole('button', { name: 'Try a sample' }).click();
  await expect(fresh.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  expect(reader()).toEqual(['/js/dx-image.js', '/js/ui-photo.js']);
  await fresh.close();
});

test('a second finger on the photo is a pinch: no box, and the reading stays', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  // Playwright cannot pinch, so the pointer events of one are sent directly.
  await page.locator('.photo__canvas').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const send = (id, type, fx, fy) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true,
      clientX: box.left + fx * box.width, clientY: box.top + fy * box.height,
    }));
    send(1, 'pointerdown', 0.4, 0.5);
    send(2, 'pointerdown', 0.6, 0.5);
    send(1, 'pointermove', 0.2, 0.3);
    send(2, 'pointermove', 0.8, 0.7);
    send(1, 'pointerup', 0.2, 0.3);
    send(2, 'pointerup', 0.8, 0.7);
  });
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeHidden();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
});

test('after the keys on the photo, one click on the button below it is enough', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the keys need a keyboard');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  await page.locator('.photo__canvas').focus();
  await page.keyboard.press('ArrowRight'); // a box around the code that was read
  await page.keyboard.press('Enter');
  await expect(page.locator('#photo-keys')).toBeVisible();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  // Pressed, and released a moment later, as by hand: nothing moves in between.
  const use = page.getByRole('button', { name: 'Use this code' });
  await use.scrollIntoViewIfNeeded();
  const box = await use.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
  await expect(page.locator('#photo-keys')).toBeHidden();
});

test('a file that is not an image, chosen while a photo is read, keeps its message', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('notes.txt');
  await writeFile(file, 'not an image');
  await expect(page.getByRole('button', { name: 'Try a sample' })).toBeVisible();
  // A reading that takes its time, and says when it has started and ended.
  await page.evaluate(() => {
    const read = window.DX.image.readBarcodeAsync;
    window.DX.image.readBarcodeAsync = async (...args) => {
      window.reading = 'started';
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        return await read(...args);
      } finally {
        window.reading = 'ended';
      }
    };
  });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Looking for the barcode…')).toBeVisible();
  await page.waitForFunction(() => window.reading === 'started');
  await page.locator('#photo-file').setInputFiles(file);
  await expect(page.getByText('That file is not an image.')).toBeVisible();
  // However long that reading took, once it is over the message is still there.
  await page.waitForFunction(() => window.reading === 'ended');
  await expect(page.getByText('That file is not an image.')).toBeVisible();
  await expect(page.locator('.photo__found')).toHaveCount(0);
});

test('a reading with dark bars after one of a slide puts the strip back to a negative', async ({ page }, testInfo) => {
  await upload(page, testInfo, { part1: 34, part2: 13, frame: 7, half: true, module: 7 }, { look: 'slide' });
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'slide');
  await page.locator('#source').getByRole('button', { name: 'Open the photo' }).click();
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 7 }, { look: 'negative' });
  await expect(page.locator('.photo__found')).toContainText('DX 79-15, frame 23');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'negative');
});

test('Remove the photo also undoes its turn and flip', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toBeVisible();
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#source').getByRole('button', { name: 'Remove the photo' }).click();
  await expect(page.getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#photo-fine')).toHaveValue('0');
});

test('after the keys on the photo, a tap on the button below it is enough too', { tag: '@phone' }, async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'a tap needs a touch screen');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  await page.locator('.photo__canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#photo-keys')).toBeVisible();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12, frame 14A');
  await page.getByRole('button', { name: 'Use this code' }).tap();
  await expect(page.locator('#result-title')).toHaveText('KODAK GOLD 200 Film');
});

test('a file dropped on the folded reader opens it, to say what became of the file', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.locator('#photo')).toHaveClass(/\bis-folded\b/);
  await page.locator('#photo').evaluate((section) => {
    const data = new DataTransfer();
    data.items.add(new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
    section.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#photo')).not.toHaveClass(/\bis-folded\b/);
  await expect(page.getByText('That file is not an image.')).toBeVisible();
});

test('Remove the photo while it opens again leaves the sample the reader has moved on to', async ({ page }, testInfo) => {
  await slowOpening(page, 0);
  const bar = page.locator('#source');
  await upload(page, testInfo, { part1: 79, part2: 15, frame: 23, module: 6 }, {});
  await page.waitForFunction(() => window.opened === 1);
  await page.getByRole('button', { name: 'Use this code' }).click();
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Use this code' }).click();
  await page.locator('#undo').click();
  await expect(bar).toContainText('DX 79-15, frame 23');
  // The first photo opens again, slowly; the reader moves on to another sample before it has.
  await page.evaluate(() => { window.slow = 2000; });
  await bar.getByRole('button', { name: 'Open the photo' }).click();
  await page.getByRole('button', { name: 'Show another sample' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
  await bar.getByRole('button', { name: 'Remove the photo' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 32-6');
});

test('while the reader loads the first time, its panel says it is busy', async ({ page }) => {
  const fresh = await page.context().newPage();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await fresh.route('**/js/ui-photo.js', async (route) => {
    await held;
    await route.continue();
  });
  await fresh.goto('/');
  await fresh.getByRole('tab', { name: 'Read a photo' }).click();
  await expect(fresh.locator('#photo')).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(fresh.getByRole('button', { name: 'Try a sample' })).toBeVisible();
  await expect(fresh.locator('#photo')).not.toHaveAttribute('aria-busy', /.*/);
  await fresh.close();
});

test('with reduced motion, the line that runs while the reader loads goes slowly', async ({ page }) => {
  const fresh = await page.context().newPage();
  await fresh.emulateMedia({ reducedMotion: 'reduce' });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await fresh.route('**/js/ui-photo.js', async (route) => {
    await held;
    await route.continue();
  });
  await fresh.goto('/');
  await fresh.getByRole('tab', { name: 'Read a photo' }).click();
  await expect(fresh.locator('#photo')).toHaveAttribute('aria-busy', 'true');
  // It repeats: at the 1 ms that other animations get there, its shade would jump about.
  expect(await fresh.locator('#photo').evaluate((el) => getComputedStyle(el, '::before').animationDuration)).toBe('3s');
  release();
  await expect(fresh.getByRole('button', { name: 'Try a sample' })).toBeVisible();
  await fresh.close();
});
