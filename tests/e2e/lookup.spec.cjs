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
  // Printed numbers end at 60A: 61 to 63 are printed XX, X and 00.
  for (const frame of ['62', '64']) {
    await page.locator('#finder-frame').fill(frame);
    await show.click();
    await expect(page.locator('#finder-frame-help')).toContainText('Write the frame as printed, e.g. 23, 23A, X, 00.');
  }
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
  await expect(neopan.getByRole('button', { name: 'No full code' })).toHaveAttribute('title', 'Part 1 would be 0, which no maker held in 2008');
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
  await expect(out).toContainText('24 exposures');
  // The last digit names its column; it needs no note when the 1994 standard read it the same way.
  const last = out.locator('.readout').nth(2);
  await expect(last.locator('dt')).toHaveText('Last digit 3');
  await expect(last.locator('.readout__note')).toHaveCount(0);
  // The line under the box keeps saying where the digits are printed.
  await expect(page.locator('#cassette-help')).toHaveText('Printed between the barcode and the film slot.');
  await expect(out.locator('.match__name').first()).toHaveText('FP4 PLUS');
  await out.getByRole('button', { name: 'Show the edge barcode' }).click();
  await expect(page.locator('#result-title')).toHaveText('FP4 PLUS');
  // A digit the 1994 standard read differently says so.
  await page.locator('#cassette-code').fill('017560');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(last.locator('dt')).toHaveText('Last digit 0');
  await expect(last.locator('.readout__note')).toHaveText('The 1994 standard used it for 72 exposures.');
});

test('the cassette drawing shows a real cassette: its contact areas, then its barcode and the six digits, then the lip the film comes out of', async ({ page }) => {
  const figure = page.locator('#cassette .cassette-figure');
  await expect(figure).toBeVisible();
  // The cassette of the Wikimedia Commons photo DX-Codierung_asb_PICT3739.JPG, the number also given as the example.
  await expect(figure.locator('.cassette-figure__digits')).toHaveText('105514');
  await expect(page.locator('#cassette-code')).toHaveAttribute('placeholder', '105514');
  const drawn = await page.evaluate(() => {
    const all = (cls) => [...document.querySelectorAll(`#cassette .cassette-figure__${cls}`)];
    // On screen, as the digits are laid on the cassette's side by a transform.
    const box = (els) => {
      const b = els.map((el) => el.getBoundingClientRect());
      const left = Math.min(...b.map((r) => r.x));
      const right = Math.max(...b.map((r) => r.x + r.width));
      return { left, right, top: Math.min(...b.map((r) => r.y)), bottom: Math.max(...b.map((r) => r.y + r.height)), middle: (left + right) / 2 };
    };
    // A bar's width along the cassette: its first point and the last, both on its top edge.
    const width = (bar) => {
      const pts = bar.getAttribute('d').slice(1, -1).split('L').map((p) => p.split(' ').map(Number));
      return pts[pts.length - 1][0] - pts[0][0];
    };
    const widths = all('bar').map(width);
    const narrow = Math.min(...widths);
    const svg = document.querySelector('#cassette .cassette-figure');
    const film = all('film')[0];
    return {
      mm: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
      units: widths.map((w) => Math.round(w / narrow)),
      expected: window.DX.codec.cassetteBars('105514').filter((_, i) => i % 2 === 0),
      contacts: all('metal').length,
      areas: box(all('metal')),
      bars: box(all('bar')),
      digits: box(all('digits')),
      velvet: box(all('velvet')),
      film: { rule: film.getAttribute('fill-rule'), rings: film.getAttribute('d').split('M').length - 1 },
    };
  });
  // The bars are those of 105514 in Interleaved 2 of 5 (GB/T 9185-2003 §9).
  expect(drawn.units).toEqual(drawn.expected);
  // Bare metal where the photo shows it: areas 1, 3, 5, 7 and 10 (ISO 100, 36 exposures, ±1/2 stop).
  expect(drawn.contacts).toBe(5);
  // From the top: the contact areas, the bars, the digits, the lip (Figures 3 and 5, §9.1).
  expect(drawn.areas.bottom).toBeLessThan(drawn.bars.top);
  expect(drawn.bars.bottom).toBeLessThan(drawn.digits.top);
  expect(drawn.digits.bottom).toBeLessThan(drawn.velvet.top);
  // The digits centered under the bars, within a millimeter and a half on the drawing's scale.
  expect(Math.abs(drawn.digits.middle - drawn.bars.middle)).toBeLessThan(1.5 * drawn.mm);
  // The film's perforations are holes, cut out of it: two on each side at least.
  expect(drawn.film.rule).toBe('evenodd');
  expect(drawn.film.rings).toBeGreaterThanOrEqual(5);
});

test('the cassette drawing sits to the right of the heading, the lead and the form, or between the lead and the form on phones; the results come below', async ({ page, isMobile }) => {
  await page.locator('#cassette-code').fill('105514');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result dt').first()).toBeVisible();
  const [title, lead, form, figure, result] = await Promise.all(
    ['#cassette-title', '#cassette .section-lead', '.cassette__form', '.cassette__figure', '.cassette__result'].map((sel) => page.locator(sel).boundingBox()));
  if (isMobile) {
    // On its own row, so that it keeps its size.
    expect(figure.y).toBeGreaterThanOrEqual(lead.y + lead.height);
    expect(form.y).toBeGreaterThanOrEqual(figure.y + figure.height);
  } else {
    expect(figure.x).toBeGreaterThanOrEqual(Math.max(title.x + title.width, lead.x + lead.width, form.x + form.width));
    expect(Math.abs(figure.y - title.y)).toBeLessThan(2);
  }
  expect(result.y).toBeGreaterThanOrEqual(Math.max(figure.y + figure.height, form.y + form.height));
});

test('community matches link once to their DX number on The Big Film Database', async ({ page }) => {
  const SEARCH = 'https://thebigfilmdatabase.merinorus.com/search?dx_number=';
  const links = (scope) => scope.getByRole('link', { name: /on The Big Film Database/ });
  // One link for all the films listed with the decoded number...
  await page.goto('/?dx=96-12/14A');
  const result = links(page.locator('#result'));
  await expect(result).toHaveText('Look up DX 96-12 on The Big Film Database (opens in a new tab)');
  await expect(result).toHaveAttribute('target', '_blank');
  await expect(result).toHaveAttribute('href', `${SEARCH}96-12`);
  // What the site has is in the text under the link.
  await expect(page.locator('#result p:has(> a[target="_blank"]) + .fineprint')).toHaveText(/^The site has pictures of the films\. Community-maintained/);
  // ...and for those of a cassette number.
  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(links(page.locator('.cassette__result'))).toHaveAttribute('href', `${SEARCH}109-12`);
  await expect(page.locator('.cassette__result p:has(> a[target="_blank"]) + .fineprint')).toHaveText('The site has pictures of the films.');
  // Search results lead to the decoder and its link; they have none of their own.
  await page.locator('#finder-q').fill('kentmere');
  await expect(page.locator('.finder__item').first()).toBeVisible();
  await expect(page.locator('#finder-ui').getByRole('link')).toHaveCount(0);
  // No community matches, no link.
  await page.goto('/?dx=88-1/1');
  await expect(page.locator('#result-title')).toHaveText('SHENGUANG / SHANGHAI / SEAGULL / RAINBOW');
  await expect(links(page.locator('#result'))).toHaveCount(0);
});

test('community entries are merged only when they differ in nothing but the cassette number', async ({ page }) => {
  // DX 95-5: two Kodak HD2 rows, one of them sold by Kodak Australasia.
  await page.goto('/?dx=95-5/1');
  const all = page.locator('#result').getByRole('button', { name: /^Show all/ });
  if (await all.count()) await all.click();
  const hd2 = page.locator('#result .match--community').filter({ hasText: 'Kodak High Definition 200 Film HD2' });
  await expect(hd2).toHaveCount(2);
  await expect(hd2.filter({ hasText: 'sold by Kodak Australasia Pty Ltd' })).toContainText('Cassette number 315254');
});

test('the film look and Mirror leave the result as it is, with a list opened in it', async ({ page }) => {
  await page.goto('/?dx=39-1/1');
  const matches = page.locator('#result .match--community');
  const all = page.locator('#result').getByRole('button', { name: /^Show all \d+$/ });
  const n = Number((await all.textContent()).match(/\d+/)[0]);
  await all.click();
  await expect(matches).toHaveCount(n);
  await page.locator('#toolbar').getByRole('button', { name: 'Mirror' }).click();
  await page.locator('[data-control="look"]').getByRole('button', { name: 'Slide' }).click();
  await expect(page.locator('#strip .strip')).toHaveAttribute('data-look', 'slide');
  await expect(matches).toHaveCount(n);
});

test('an entry shows how sure the database is, also when it has no notes', async ({ page }) => {
  // As two entries rated 0 (a guess) are: Polaroid disposable camera film, DM Paradies 200.
  const shown = (entry) => page.evaluate((e) => {
    const li = window.DX.ui.communityItem(Object.assign({ manufacturer: '', country: '', from: '', to: '', distributor: '', availability: '', cassettes: [] }, e));
    const certainty = li.querySelector('.certainty');
    return certainty && { text: li.textContent, title: certainty.title };
  }, entry);
  const bare = await shown({ name: 'A film', original: '', reliability: 0 });
  expect(bare.text).toContain('Certainty 0/4');
  expect(bare.title).toMatch(/0 = guess/);
  expect((await shown({ name: 'A film', original: 'Same as B', reliability: 3 })).text).toContain('Notes: Same as B (certainty 3/4)');
  expect(await shown({ name: 'A film', original: '', reliability: null })).toBeNull();
});

test('community numbers below 16 name films by cassette only, never by the bars of DX 0-n', async ({ page }) => {
  await page.goto('/?dx=0-5/1');
  await expect(page.locator('#result-title')).toHaveText('Unregistered DX number');
  await expect(page.locator('#result .match--community')).toHaveCount(0);
  await page.locator('#cassette-code').fill('000054');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('Orwo ORWOPAN 25');
  // As in Find a film, there is no edge code to show or look up.
  await expect(page.locator('.cassette__result').getByRole('button', { name: 'Show the edge barcode' })).toHaveCount(0);
  await expect(page.locator('.cassette__result').getByRole('link', { name: /^Look up DX/ })).toHaveCount(0);
});

test('a cassette number can be typed with spaces between its digits', async ({ page }) => {
  await page.locator('#cassette-code').fill('0 1 2 7 9 4');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('79-15');
});

test('Find a film says when no film has a DX number, and lists each film once', async ({ page }) => {
  const status = page.locator('#finder-help');
  await page.locator('#finder-q').fill('20-0');
  await expect(status).toHaveText('No film in the lists has DX 20-0.');
  await expect(page.locator('.finder__item')).toHaveCount(0);
  // Copies that differ only by cassette number look the same in the list: once.
  await page.locator('#finder-q').fill('DX 79-15');
  await expect(page.locator('.finder__item')).toHaveCount(2);
  await expect(status).toHaveText('2 films found.');
  // One letter is not enough to search.
  await page.locator('#finder-q').fill('a');
  await expect(status).toHaveText('Type at least two letters, or a DX number such as 79-15.');
});

test('Find a film lists every cassette number of films without a DX number, and names typed as one word', async ({ page }) => {
  // Kodak's five "augmented" cassette numbers for Jean Coutu are all shown.
  await page.locator('#finder-q').fill('jean coutu');
  await expect(page.locator('#finder-help')).toHaveText('5 films found.');
  await page.locator('#finder-q').fill('tmax400');
  await expect(page.locator('.finder__item').first()).toContainText('KODAK T-MAX 400 Professional Film');
});

test('the code list takes a bare film speed as part of a name, not as a DX number', async ({ page }) => {
  await page.locator('#ref-q').fill('200');
  const rows = page.locator('.products-table tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.locator('td:nth-child(2)').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('200')]));
  expect((await rows.locator('td:first-child').allTextContents()).includes('12-8')).toBe(false);
});

test('the code list reads DX numbers as Find a film does', async ({ page }) => {
  const rows = page.locator('.products-table tbody tr');
  for (const q of ['７９－１５', '79–15', '79 15', '1279', 'DX 79-15']) {
    await page.locator('#ref-q').fill(q);
    await expect(rows.first().locator('td').first(), q).toHaveText('79-15');
  }
  // Shanghai's four brands, listed without a Part 2.
  await page.locator('#ref-q').fill('88-?');
  await expect(rows).toHaveCount(4);
});

test('the cassette helper shows whose Part 1 an augmented number adds to, without claiming the cassette for that maker', async ({ page }) => {
  // 854011: 5401 = 16 × 337 + 9, and 337 = 81 + 256; The Big Film Database
  // lists Rollei Retro 400S, made by Agfa-Gevaert, under this number.
  await page.locator('#cassette-code').fill('854011');
  await page.getByRole('button', { name: 'Look up' }).click();
  const result = page.locator('.cassette__result');
  await expect(result).toContainText('Part 1 337 is 81 + 256. Part 1 = 81 is assigned to Eastman Kodak');
  await expect(result).not.toContainText('belongs to');
  // Above 8191 there is no DX number: others share only the digits.
  await page.locator('#cassette-code').fill('091003');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(result).toContainText('above 8191');
  await expect(result).not.toContainText('same DX number');
});

test('cassette input is validated', async ({ page }) => {
  await page.locator('#cassette-code').fill('12');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('#cassette-help')).toContainText('exactly six digits');
  await page.locator('#cassette-code').fill('832973');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('KODAK Gold 100 Film for Jean Coutu Pharmacies in Canada');
  // An augmented number (Annex A.4) names its maker, not a DX number.
  await expect(page.locator('.cassette__result')).toContainText('3297 = 16 × 206 + 1: an augmented number');
  await expect(page.locator('.cassette__result .readout__value').nth(1)).toHaveText('—');
  await expect(page.locator('.cassette__result')).toContainText('Part 1 206 is 78 + 128. Part 1 = 78 is assigned to Eastman Kodak');
  await expect(page.getByRole('button', { name: 'Show the edge barcode' })).toHaveCount(0);
  await page.locator('#cassette-code').fill('753914');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('Part 1 336 is 80 + 256');
  await expect(page.locator('.cassette__result')).toContainText('CineStill');
  await expect(page.getByRole('button', { name: 'Show the edge barcode' })).toHaveCount(0);
  await page.locator('#cassette-code').fill('012790');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('.cassette__result')).toContainText('1–8 exposures');
  await expect(page.locator('.cassette__result')).toContainText('The 1994 standard used it for 72 exposures.');
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
