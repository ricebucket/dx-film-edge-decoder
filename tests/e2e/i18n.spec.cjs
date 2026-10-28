const { test, expect } = require('@playwright/test');
const { watchConsole, setCells, sideOverflow } = require('./helpers.cjs');

let checkConsole;
test.beforeEach(({ page }) => {
  checkConsole = watchConsole(page);
});
test.afterEach(() => checkConsole());

const chooseLanguage = async (page, name) => {
  await Promise.all([page.waitForEvent('load'), page.getByLabel(/^(Language|语言)$/).selectOption({ label: name })]);
};

test('the page starts in English, with every language in the menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const menu = page.getByLabel('Language');
  await expect(menu).toHaveValue('en');
  await expect(menu.locator('option')).toHaveText(['English', '简体中文']);
  await expect(menu.locator('option[value="zh-CN"]')).toHaveAttribute('lang', 'zh-CN');
});

test('choosing Chinese shows the page in Chinese, keeps the code, and is remembered and named in the URL', async ({ page }) => {
  await page.goto('/?dx=79-15/23');
  await chooseLanguage(page, '简体中文');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
  await expect(page).toHaveTitle('DX 片边码解码器');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
  await expect(page.getByRole('button', { name: '11 根细条' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '页面各部分' }).getByRole('link', { name: '原理' })).toBeVisible();
  // The code survived the reload, and the generated text is Chinese too.
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.locator('#result .status')).toHaveText('有效的 DX 编码');
  await expect(page.locator('#hint')).toHaveText('有效编码。在你的胶片上，紧挨在这个条码前面的数字应为 23。');
  await expect(page.locator('#strip .track--data button.cell').first()).toHaveAttribute('aria-label', '第 7 位（共 31 位）：Part 1，对应数字 64');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /^切换到/);

  await page.goto('/');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
  await expect(page.getByLabel('语言')).toHaveValue('zh-CN');

  await chooseLanguage(page, 'English');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  await expect(page).toHaveURL(/\?lang=en$/);
});

test('the language can be switched where the browser blocks storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });
  });
  await page.goto('/?dx=79-15/23');
  await chooseLanguage(page, '简体中文');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await chooseLanguage(page, 'English');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=en$/);
});

test('a language in the URL that the page does not have is ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dx-lang', 'zh-CN'));
  await page.goto('/?dx=79-15/23&lang=fr');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
  await expect(page).toHaveURL(/\?dx=79-15\/23$/);
});

test('Copy link copies the code and the language it is shown in', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied.push(text); } } });
  });
  await page.goto('/?dx=96-12/14A');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => window.copied)).toEqual([`${baseURL}/?dx=96-12/14A&lang=en`]);
  await chooseLanguage(page, '简体中文');
  await page.getByRole('button', { name: '复制链接' }).click();
  await expect(page.getByRole('button', { name: '链接已复制' })).toBeVisible();
  expect(await page.evaluate(() => window.copied)).toEqual([`${baseURL}/?dx=96-12/14A&lang=zh-CN`]);
});

test('a link can name the language: it stays in the URL as the code changes, without replacing the saved choice', async ({ page }) => {
  await page.goto('/?dx=79-15/23&lang=zh-cn');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await page.locator('#strip .track--data [data-cell="8"]').click();
  await expect(page).toHaveURL(/\?bits=[01]+&lang=zh-CN$/);
  // Nothing saved yet: without ?lang= the page is in English.
  await page.goto('/');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  // Chinese saved from the menu; a link asking for English still gets English.
  await chooseLanguage(page, '简体中文');
  await page.goto('/?lang=en');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  await expect(page.getByLabel('Language')).toHaveValue('en');
  await page.goto('/');
  await expect(page.locator('#decoder-title')).toHaveText('从片边条码识别胶片');
});

test('in Chinese, searches, the cassette helper and the photo reader speak Chinese', async ({ page }) => {
  await page.goto('/');
  await chooseLanguage(page, '简体中文');
  await page.locator('#finder-q').fill('hp5 plus');
  await expect(page.locator('#finder-help')).toContainText('找到');
  await expect(page.locator('.finder__item').first().locator('.finder__name')).toHaveText('HP5 PLUS');

  await page.locator('#cassette-code').fill('017563');
  await page.getByRole('button', { name: '查询' }).click();
  await expect(page.locator('.cassette__result')).toContainText('24 张');

  await page.getByRole('tab', { name: '读取照片' }).click();
  await page.getByRole('button', { name: '试用示例' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12，第 14A 帧');
  await expect(page.locator('.photo__found')).toContainText('：KODAK GOLD 200 Film');
});

test('every marked part of the page has its text in every language, exactly as the browser reads it', async ({ page }) => {
  await page.goto('/');
  const missing = await page.evaluate(() => {
    const { i18n } = window.DX;
    const out = [];
    for (const lang of i18n.languages.filter((l) => l.code !== 'en')) {
      for (const el of document.querySelectorAll('[data-i18n]')) {
        // aria-pressed follows the page's state; the text is looked up as written.
        const key = i18n.normalize(el.innerHTML.replace(/ aria-pressed="(?:true|false)"/g, ''));
        if (!(key in lang.strings)) out.push(`${lang.code}: ${key}`);
      }
      for (const el of document.querySelectorAll('[data-i18n-attr]')) {
        for (const name of el.getAttribute('data-i18n-attr').split(/\s+/)) {
          const key = i18n.normalize(el.getAttribute(name));
          if (!(key in lang.strings)) out.push(`${lang.code} [${name}]: ${key}`);
        }
      }
    }
    return out;
  });
  expect(missing).toEqual([]);
});

test('every language fits the screen without sideways scrolling, down to 320 px wide', async ({ page }) => {
  await page.goto('/');
  const names = await page.evaluate(() => window.DX.i18n.languages.filter((l) => l.code !== 'en').map((l) => l.name));
  const { width, height } = page.viewportSize();
  for (const name of names) {
    await page.setViewportSize({ width, height });
    await chooseLanguage(page, name);
    await setCells(page, '1010101001111011110101110010101');
    for (const w of [width, 320]) {
      await page.setViewportSize({ width: w, height });
      expect(await sideOverflow(page), `${name} at ${w} px`).toEqual([]);
      // The menus stay on the first row of the header.
      const brand = await page.locator('.brand').boundingBox();
      const menu = await page.locator('.lang-picker').boundingBox();
      expect(Math.abs(menu.y + menu.height / 2 - (brand.y + brand.height / 2))).toBeLessThan(12);
    }
  }
});
