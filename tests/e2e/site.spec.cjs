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

test('with reduced motion nothing transitions, not even for an instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?dx=79-15/23');
  const transition = (sel, pseudo) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el, p).transitionProperty, pseudo);
  // Those of the elements that have a transition of their own, and the others'.
  expect(await transition('.intro__toggle .icon')).toBe('none');
  expect(await transition('#strip .strip__viewport', '::before')).toBe('none');
  expect(await transition('#strip .track--data button')).toBe('none');
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
  await page.locator('.cassette__result .match').first().getByRole('button').click();
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
  // The films of both sources are one list, under the result's own heading.
  await expect(page.locator('#result :is(h3, h4)')).toHaveCount(0);
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
  await page.locator('.finder__item').first().getByRole('button', { name: 'Show barcode' }).click();
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
  // Its own text has every link the footer has, so it needs none.
  await expect(page.locator('.site-footer')).toHaveCount(0);
  // Back on the decoder, the code is still on the strip.
  await page.goBack();
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  // The header works on the sources page too: a theme chosen there stays, and the name leads back.
  await footer.getByRole('link', { name: 'Sources and credits' }).click();
  await expect(page).toHaveURL(/\/sources\.html$/);
  await page.locator('#theme-toggle').click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole('link', { name: 'DX Film Edge Decoder', exact: true }).click();
  await expect(page).toHaveURL(/\/index\.html\?lang=en$/);
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
  await Promise.all([page.waitForEvent('load'), page.getByLabel('Language').selectOption({ label: '简体中文' })]);
  await expect(page).toHaveURL(/\/sources\.zh-CN\.html$/);
  await expect(page.locator('h1')).toHaveText('来源与致谢');
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
  await expect(cell).toHaveAttribute('aria-label', 'Cell 7 of 31: Part 1, weight 64');
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#strip .track--data')).toHaveAttribute('role', 'group');
  // Exactly one cell is in the tab order (roving tabindex).
  await expect(page.locator('#strip .track--data button[tabindex="0"]')).toHaveCount(1);
  for (const id of ['finder-q', 'direct-dx', 'direct-frame', 'cassette-code', 'ref-maker', 'ref-part1', 'ref-status']) {
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

test('the source tags are plain gray text, with no tint, outline or teal, which mark what can be selected', async ({ page }) => {
  // In a result, in Find a film and in the cassette helper.
  await page.goto('/?dx=39-1/1');
  await page.locator('#finder-q').fill('fujicolor 200');
  await page.locator('#cassette-code').fill('106253');
  await page.getByRole('button', { name: 'Look up' }).click();
  for (const where of ['#result', '#finder-ui', '#cassette-ui']) await expect(page.locator(`${where} .source-tag`).first()).toBeVisible();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const looks = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.color = 'var(--ink-3)';
      const gray = getComputedStyle(probe).color;
      probe.remove();
      return [...document.querySelectorAll('.source-tag')].map((el) => {
        const s = getComputedStyle(el);
        const boxed = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none');
        return { tag: el.textContent, plain: s.color === gray && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.backgroundImage === 'none' && !boxed && s.outlineStyle === 'none' && s.boxShadow === 'none' };
      });
    });
    expect(looks.length, colorScheme).toBeGreaterThan(10);
    expect(looks.filter((l) => !l.plain), colorScheme).toEqual([]);
  }
});

test('record IDs never show on the page: not in its text, its names for screen readers or its tooltips', async ({ page }) => {
  // The page refers to rows by them, and its address names a film picked (&film=), but nothing it shows does.
  await page.goto('/?dx=96-12/1&film=bfd-930');
  await expect(page.locator('#result-title')).toHaveText('Kodak Gold 200 GB 200-7');
  await page.locator('#finder-q').fill('kodak gold 200');
  await page.locator('.finder__item').first().getByRole('button', { name: /^Show barcode of / }).click();
  await expect(page.locator('#source')).toContainText('From Find a film:');
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result details .match').first()).toBeAttached();
  const seen = await page.evaluate(() => {
    const id = /\b(?:i3a-a?|bfd-)\d+\b/;
    const out = [];
    let texts = 0;
    // Every text, also of rows folded away or not shown yet ("Show all").
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) continue;
      texts++;
      if (id.test(node.data)) out.push(`text: ${node.data.trim()}`);
    }
    for (const name of ['aria-label', 'aria-description', 'title', 'alt', 'placeholder']) {
      for (const el of document.querySelectorAll(`[${name}]`)) if (id.test(el.getAttribute(name))) out.push(`${name}: ${el.getAttribute(name)}`);
    }
    return { texts, out };
  });
  expect(seen.texts).toBeGreaterThan(1000);
  expect(seen.out).toEqual([]);
});

test('on phones the introduction can be folded away, and stays folded', { tag: '@phone' }, async ({ page, isMobile }) => {
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

test('on phones the steps show their titles until opened', { tag: '@phone' }, async ({ page, isMobile }) => {
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

test('a link to the code list lands at its heading, and a reload comes back to the same place', async ({ page }) => {
  // The list is built after the page is drawn, unless the page opens at a place below.
  await page.goto('/index.html#codes');
  await expect(page.locator('#reference-ui .assign-table')).toHaveCount(1);
  const heading = () => page.locator('#codes-title').evaluate((el) => el.getBoundingClientRect().top);
  expect(await heading()).toBeLessThan(150);
  await page.goto('/');
  await expect(page.locator('#reference-ui .assign-table')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - innerHeight - 300));
  // A moment for the browser to note the place in its history, as it does when scrolling by hand.
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  await page.reload();
  await expect(page.locator('#reference-ui .assign-table')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40);
});

test('the code list\'s long table is a layer of its own, which changes elsewhere on the page leave alone', async ({ page }) => {
  await page.goto('/');
  const box = page.locator('#codes .table-scroll--tall');
  await expect(box.locator('tbody tr').first()).toHaveCount(1);
  // Without it, high-density screens go through all its rows again for each
  // cell the mouse crosses on the strip.
  expect(await box.evaluate((el) => getComputedStyle(el).isolation)).toBe('isolate');
});

test('printed, the strip keeps its film and bars, fits the page, and the colors are the light ones', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?dx=79-15/23');
  // A cell with focus, which the ruler marks on screen.
  await dataCell(page, 18).focus();
  await expect(page.locator('#strip .ruler__cell.is-here')).toHaveText('18');
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const printed = await page.evaluate(() => {
    const film = document.querySelector('#strip .film');
    const style = getComputedStyle(film);
    return {
      exact: (style.printColorAdjust || style.webkitPrintColorAdjust) === 'exact',
      width: film.getBoundingClientRect().width,
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      looks: getComputedStyle(document.querySelector('.looks')).display,
      // Buttons that do nothing on paper ("Show examples", "Show all 33").
      buttons: [...document.querySelectorAll('#result .text-button')].filter((b) => b.getClientRects().length).map((b) => b.textContent),
    };
  });
  expect(printed.exact).toBe(true);
  expect(printed.width).toBeLessThanOrEqual(700); // A4 or Letter, less the margins
  expect(printed.bg).toBe('#edf2f5');
  expect(printed.looks).toBe('none');
  expect(printed.buttons).toEqual([]);
  // The ruler over it keeps its numbers, each over its own cell, and on paper marks no cell.
  await expect(page.locator('#strip .ruler__num:visible')).toHaveText(['1', '5', '10', '15', '20', '25', '30']);
  const centers = (sel) => page.locator(sel).evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  }));
  const ticks = await centers('#strip .ruler__cell');
  const cells = await centers('#strip .track--data .cell');
  expect(ticks).toHaveLength(31);
  ticks.forEach((x, i) => expect(Math.abs(x - cells[i]), `cell ${i + 1}`).toBeLessThan(0.6));
  // Both halves of its tick, and both borders of each, as its neighbor's; its number hidden.
  const tick = (n) => page.locator(`#strip .ruler__cell[data-cell="${n}"]`).evaluate((el) => ['::before', '::after'].map((half) => {
    const style = getComputedStyle(el, half);
    return [style.borderLeftColor, style.borderRightColor];
  }));
  expect(await tick(18)).toEqual(await tick(17));
  expect(await page.locator('#strip .ruler__cell[data-cell="18"] .ruler__num').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
});

test('printed, a cell with focus looks like any other, with a bar or without', { tag: '@phone' }, async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  const shadow = (cell) => dataCell(page, cell).evaluate((el) => getComputedStyle(el).boxShadow);
  // In 79-15, frame 23, cells 16 and 18 have bars; 19 and 21 have none.
  for (const [focused, like] of [[18, 16], [19, 21]]) {
    await page.emulateMedia({ media: 'screen' });
    await dataCell(page, focused).focus();
    expect(await shadow(focused), `cell ${focused} on screen`).not.toBe(await shadow(like)); // its ring
    await page.emulateMedia({ media: 'print' });
    expect(await shadow(focused), `cell ${focused} printed`).toBe(await shadow(like));
  }
});

test('printed from a window where the strip scrolls sideways, the film shows whole: the edge fades are the screen\'s', { tag: '@phone' }, async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the fades come and go at once
  if (!isMobile) await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/?dx=79-15/23');
  const strip = page.locator('#strip .strip');
  await expect(strip).toHaveClass(/\bmore-(left|right)\b/);
  // A fade at each end of the strip: whether it shows.
  const shown = () => page.locator('#strip .strip__viewport').evaluate((el) => ['::before', '::after'].map((end) => {
    const style = getComputedStyle(el, end);
    return style.display !== 'none' && Number(style.opacity) > 0;
  }));
  expect(await shown()).toContain(true);
  await page.emulateMedia({ media: 'print' });
  // A print keeps the classes the screen had: nothing measures the strip again for it. Set here, in case this page did.
  await strip.evaluate((el) => el.classList.add('is-overflowing', 'more-left', 'more-right'));
  expect(await shown()).toEqual([false, false]);
});

test('printed, the result lists every film it has, and none of its buttons', async ({ page }) => {
  await page.goto('/?dx=39-1/12');
  const all = page.locator('#result').getByRole('button', { name: /^Show all \d+$/ });
  const n = Number((await all.textContent()).match(/\d+/)[0]);
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => {
    const shown = (selector) => [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length);
    return { films: shown('#result .matches > li').length, buttons: shown('#result button').map((b) => b.textContent) };
  });
  expect(printed.films).toBe(n);
  expect(printed.buttons).toEqual([]);
  // On screen, the first few until "Show all".
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#result .matches > li:visible')).toHaveCount(6);
});

test('a chosen option keeps its label readable under the pointer', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse pointer');
  await page.goto('/');
  const chosen = page.locator('[data-control="format"] [aria-pressed="true"]');
  await chosen.hover();
  const [color, background] = await chosen.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(color).not.toBe(background);
});

test('a chosen option tapped on a phone keeps its label readable', { tag: '@phone' }, async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'a tap');
  await page.goto('/');
  const short = page.locator('[data-control="format"] [data-value="short"]');
  await short.tap();
  await expect(short).toHaveAttribute('aria-pressed', 'true');
  const [color, background] = await short.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(color).not.toBe(background);
});

test('arrow keys in the language menu only move through it; Enter changes the language', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard on the menu itself');
  await page.goto('/');
  const menu = page.getByLabel('Language');
  await menu.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('choosing a language comes back to the same place on the page', async ({ page }) => {
  await page.goto('/');
  // 300 px into "How it works".
  await page.evaluate(() => window.scrollTo(0, document.getElementById('how').getBoundingClientRect().top + window.scrollY + 300));
  const before = await page.locator('#how').evaluate((el) => el.getBoundingClientRect().top);
  expect(before).toBeLessThan(-250);
  await Promise.all([page.waitForEvent('load'), page.getByLabel('Language').selectOption({ label: '简体中文' })]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect.poll(() => page.locator('#how').evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(before, -1);
});

test('choosing a language comes back to the same place, also after following a link to a section', async ({ page }) => {
  // The header's "Code list" link puts #codes in the address; then 300 px into "How it works".
  await page.goto('/#codes');
  await page.evaluate(() => window.scrollTo(0, document.getElementById('how').getBoundingClientRect().top + window.scrollY + 300));
  const before = await page.locator('#how').evaluate((el) => el.getBoundingClientRect().top);
  await Promise.all([page.waitForEvent('load'), page.getByLabel('Language').selectOption({ label: '简体中文' })]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.waitForTimeout(500); // past the browser's own jump to an anchor
  await expect.poll(() => page.locator('#how').evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(before, -1);
  // And back to English.
  await Promise.all([page.waitForEvent('load'), page.getByLabel('语言').selectOption({ label: 'English' })]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.waitForTimeout(500);
  await expect.poll(() => page.locator('#how').evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(before, -1);
});

test('a page brought back by Back takes the theme chosen since on another page, and keeps its language', async ({ page }) => {
  await page.goto('/?dx=79-15/23&lang=zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  // Left for the sources page, where dark and English are chosen; then back from the browser's cache.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.evaluate(() => {
    localStorage.setItem('dx-theme', 'dark');
    localStorage.setItem('dx-lang', 'en');
  });
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(500); // a language change would reload the page by now
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

// Playwright's browsers keep no pages for Back, as Chromium never does for a
// file: Back loads the page again, which the tests below check.
test('a page loaded again by Back shows the language its address names, even if another was chosen since', async ({ page }) => {
  await page.goto('/?dx=79-15/23&lang=zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.goto('/sources.zh-CN.html');
  await Promise.all([page.waitForURL(/\/sources\.html$/), page.getByLabel('语言').selectOption('en')]);
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.getByLabel('语言')).toHaveValue('zh-CN');
});

test('a page loaded again by Back whose address names no language shows the one saved, and its menu says so', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('dx-lang', 'zh-CN'));
  await page.goto('/?dx=79-15/23');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.goto('/sources.zh-CN.html');
  await Promise.all([page.waitForURL(/\/sources\.html$/), page.getByLabel('语言').selectOption('en')]);
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // Not the choice the browser kept from before.
  await expect(page.getByLabel('Language')).toHaveValue('en');
});

test('Back from a language chosen on the page itself shows the earlier page in the language its address names', async ({ page }) => {
  await page.goto('/?lang=zh-CN');
  await page.locator('.site-nav a[href="#finder"]').click();
  await Promise.all([page.waitForURL(/\?lang=en$/), page.getByLabel('语言').selectOption('en')]);
  await Promise.all([page.waitForURL(/\?lang=zh-CN$/), page.goBack()]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('picking the language shown again, after stepping through the menu with the keys, keeps no place for later', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard on the menu itself');
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.getElementById('how').getBoundingClientRect().top + window.scrollY));
  const menu = page.getByLabel('Language');
  await menu.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await menu.selectOption('en');
  await page.waitForTimeout(300); // a language change would reload the page by now
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => sessionStorage.getItem('dx-place'))).toBeNull();
});

test('the strip fits a 1024 or 1110 px window; in a narrower one, a line under it says it scrolls', async ({ page, isMobile }) => {
  test.skip(isMobile, 'window widths are set on the desktop');
  await page.setViewportSize({ width: 1110, height: 800 });
  await page.goto('/?dx=79-15/23');
  const line = page.locator('#strip .strip__swipe');
  await expect(line).toBeHidden();
  // An iPad mini turned sideways: smaller cells, still the whole code.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(line).toBeHidden();
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(line).toBeVisible();
  await expect(line).toHaveText('Scroll sideways to see the whole strip.');
});

test('the header keeps its section links on one row at any width, and a 320 px screen needs no sideways scrolling in the frames table', async ({ page, isMobile }) => {
  test.skip(isMobile, 'window widths are set on the desktop');
  await page.goto('/');
  for (const width of [920, 952, 961, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    const rows = await page.locator('.site-nav a').evaluateAll((links) => new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size);
    expect(rows, `${width} px`).toBe(1);
  }
  // The frames table holds nothing to focus, so keyboards couldn't scroll it.
  await page.setViewportSize({ width: 320, height: 700 });
  const over = await page.locator('.frames-table').evaluate((table) => table.parentElement.scrollWidth - table.parentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test('with the scrollbars desktops show, the header keeps its section links on one row, and the strip fits from 1024 px', async ({ browserName, isMobile, baseURL }) => {
  test.skip(isMobile || browserName !== 'chromium', 'scrollbars are shown in Chromium on the desktop');
  // Playwright hides them, which leaves a page about 17 px wider than on Windows.
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 965, height: 800 } });
    await page.goto(`${baseURL}/?dx=79-15/23`);
    await page.locator('#result-title').waitFor();
    expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
    for (const width of [965, 1024, 1125]) {
      await page.setViewportSize({ width, height: 800 });
      const rows = await page.locator('.site-nav a').evaluateAll((links) => new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size);
      expect(rows, `${width} px`).toBe(1);
      if (width >= 1024) await expect(page.locator('#strip .strip__swipe'), `${width} px`).toBeHidden();
    }
  } finally {
    await browser.close();
  }
});

test('on phones the language menu shows only its globe, also in Windows contrast themes', { tag: '@phone' }, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'contrast themes are emulated in Chromium');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  // Those themes give the text a color of their own: it must have no room in the box.
  const room = await page.locator('#lang-select').evaluate((el) => {
    const s = getComputedStyle(el);
    return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  });
  expect(room).toBeLessThanOrEqual(0);
});

test('in a short window, such as a phone turned sideways, the header scrolls away so the strip shown fits', async ({ page }) => {
  await page.setViewportSize({ width: 734, height: 343 });
  await page.goto('/');
  await expect(page.locator('.site-header')).toHaveCSS('position', 'static');
  await page.locator('#finder-q').fill('hp5');
  await page.locator('.finder__item').getByRole('button', { name: /^Show barcode/ }).first().click();
  await expect.poll(async () => {
    const box = await page.locator('#strip .track--data').boundingBox();
    return box.y >= 0 && box.y + box.height <= 343;
  }).toBe(true);
});

test('on phones the page does not shift as it is built', { tag: '@phone' }, async ({ page, browserName, isMobile }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'layout shifts are measured in Chromium');
  await page.goto('/');
  await page.waitForTimeout(800);
  const shift = await page.evaluate(() => new Promise((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(total), 100);
  }));
  expect(shift).toBeLessThan(0.05);
});

test('a published copy asks for the files it loads later by the build its page names its scripts with', async ({ page }) => {
  // The pages as scripts/stamp-build.mjs writes them; the server ignores the query.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const html = (await response.text())
      .replace(/(\ssrc="js\/[^"?#]+\.js)"/g, '$1?v=0123456789ab"')
      .replace(/(\shref="css\/[^"?#]+\.css)"/g, '$1?v=0123456789ab"');
    await route.fulfill({ response, body: html });
  });
  const asked = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/js/')) asked.push(url.pathname + url.search);
  });
  await page.goto('/?lang=zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', '');
  await page.locator('#tab-photo').click();
  await expect.poll(() => asked).toEqual(expect.arrayContaining(['/js/i18n/zh-CN.js?v=0123456789ab', '/js/dx-image.js?v=0123456789ab', '/js/ui-photo.js?v=0123456789ab']));
  expect(asked.filter((url) => !url.endsWith('?v=0123456789ab'))).toEqual([]);
});

test('a photo reader of another deploy than the page, as a host that keeps only its latest files sends, asks for a reload', async ({ page }) => {
  // One of the reader's scripts carries another build than the page's own (none here).
  let other = 'ui-photo.js';
  await page.route('**/js/*.js*', async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith(`/js/${other}`)) return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace("const BUILD = '';", "const BUILD = '0123456789ab';");
    await route.fulfill({ response, body });
  });
  // An alert, which screen readers read out as it comes: focus stays on the tab.
  const message = page.locator('#photo .form-message.is-error[role="alert"]');
  await page.goto('/');
  await page.locator('#tab-photo').click();
  await expect(message).toHaveText('This page is out of date. Reload it.');
  await expect(page.locator('#photo .photo__drop')).toHaveCount(0);
  other = 'dx-image.js';
  await page.goto('/?lang=zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.locator('#tab-photo').click();
  await expect(message).toHaveText('此页面已过时。请刷新。');
});

test('a photo reader that could not be loaded says so, and choosing "Read a photo" again loads it', async ({ page }) => {
  let fail = true;
  let release = null;
  await page.route('**/js/dx-image.js*', async (route) => {
    if (fail) return route.abort();
    // Held, to see what shows while it loads again.
    await new Promise((resolve) => { release = resolve; });
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#tab-photo').click();
  const message = page.locator('#photo .form-message.is-error[role="alert"]');
  await expect(message).toHaveText('The photo reader could not be loaded. Choose “Read a photo” to try again.');
  fail = false;
  await page.locator('#tab-copy').click();
  await page.locator('#tab-photo').click();
  // Loading again, it shows its loading line, not the old message.
  await expect.poll(() => release !== null).toBe(true);
  await expect(page.locator('#photo')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#photo')).toBeEmpty();
  release();
  await expect(page.locator('#photo .photo__drop')).toBeVisible();
  await expect(message).toHaveCount(0);
});
