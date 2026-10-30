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
  await expect(page).toHaveTitle('DX 潜影条码解码器');
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  await expect(page.getByRole('button', { name: '11 根细条' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '页面各部分' }).getByRole('link', { name: '原理' })).toBeVisible();
  // The code survived the reload, and the generated text is Chinese too.
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page.locator('#result .status')).toHaveText('有效的 DX 编码');
  await expect(page.locator('#hint')).toHaveText('有效编码。画幅号 23。');
  await expect(page.locator('#strip .track--data button.cell').first()).toHaveAttribute('aria-label', '第 7 位（共 31 位）：第 1 部分，对应数字 64');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /^切换到/);

  await page.goto('/');
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
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
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  await expect(page.locator('#result-title')).toHaveText('KODAK Professional BW400CN Film');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=zh-CN$/);
  await chooseLanguage(page, 'English');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  await expect(page).toHaveURL(/\?dx=79-15\/23&lang=en$/);
});

test('where the browser blocks storage, the language goes along to the sources page and back', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });
  });
  await page.goto('/?lang=zh-CN');
  await page.locator('.site-footer').getByRole('link', { name: '来源与致谢' }).click();
  await expect(page).toHaveURL(/\/sources\.zh-CN\.html$/);
  await expect(page).toHaveTitle('来源与致谢 – DX 潜影条码解码器');
  await expect(page.locator('h1')).toHaveText('来源与致谢');
  await page.getByRole('navigation', { name: '页面各部分' }).getByRole('link', { name: '原理' }).click();
  await expect(page).toHaveURL(/\/index\.html\?lang=zh-CN#how$/);
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  // English chosen on the sources page: the decoder is in English again.
  await page.locator('.site-footer').getByRole('link', { name: '来源与致谢' }).click();
  await chooseLanguage(page, 'English');
  await expect(page).toHaveURL(/\/sources\.html$/);
  await page.getByRole('link', { name: 'DX Film Edge Decoder', exact: true }).click();
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
});

test('the sources page is written in each language: the decoder leads to the one shown, and the menu opens the other without loading the language files', async ({ page }) => {
  await page.goto('/');
  await chooseLanguage(page, '简体中文');
  await page.locator('.site-footer').getByRole('link', { name: 'The Big Film Database' }).click();
  await expect(page).toHaveURL(/\/sources\.zh-CN\.html#community-credit$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#community-credit')).toContainText('采用 CC BY-SA 4.0 许可');
  await expect(page.getByLabel('语言')).toHaveValue('zh-CN');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /^切换到/);

  const requests = [];
  page.on('request', (req) => requests.push(new URL(req.url()).pathname));
  await chooseLanguage(page, 'English');
  await expect(page).toHaveURL(/\/sources\.html#community-credit$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Sources and credits');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', /^Switch to/);
  // A Chinese choice saved earlier does not hide or change the English page.
  await page.evaluate(() => localStorage.setItem('dx-lang', 'zh-CN'));
  await page.goto('/sources.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
  await expect(page.getByLabel('Language')).toHaveValue('en');
  await chooseLanguage(page, '简体中文');
  await expect(page).toHaveURL(/\/sources\.zh-CN\.html$/);
  await expect(page.locator('h1')).toHaveText('来源与致谢');
  expect(requests.filter((p) => p.includes('/js/i18n'))).toEqual([]);

  // The choice made there is the decoder's too.
  await chooseLanguage(page, 'English');
  await page.goto('/');
  await expect(page.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
});

test('the page loads only the language it is shown in', async ({ page }) => {
  const requests = [];
  page.on('request', (req) => requests.push(new URL(req.url()).pathname));
  const languageFiles = () => requests.filter((p) => p.startsWith('/js/i18n/'));
  // A language the page doesn't have: nothing to load, nothing hidden.
  await page.goto('/?lang=fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
  await expect(page.getByLabel('Language').locator('option')).toHaveText(['English', '简体中文']);
  expect(languageFiles()).toEqual([]);
  await chooseLanguage(page, '简体中文');
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  expect(languageFiles()).toEqual(['/js/i18n/zh-CN.js']);
});

test('a page in Chinese shows as soon as its text has loaded, before the rest of its scripts', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/js/app.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?lang=zh-CN', { waitUntil: 'commit' });
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  await expect(page.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  release();
  await expect(page.getByLabel('语言')).toHaveValue('zh-CN');
  await expect(page.locator('#hint')).toHaveText(/^从第 7 位开始/);
});

test('every text is looked up as it is drawn, never as a script loads, so a page is in its language throughout, however late the file comes', async ({ page }) => {
  // Notes every text looked up before the language file has come, or by a
  // script as it loads (also the photo reader's, which loads later on).
  await page.addInitScript(() => {
    const early = (window.earlyTexts = []);
    let registered = false;
    let i18n;
    Object.defineProperty((window.DX = window.DX || {}), 'i18n', {
      configurable: true,
      get: () => i18n,
      set(value) {
        i18n = value;
        const note = (what) => {
          const loading = document.currentScript;
          if (loading) early.push(`${what} as ${loading.src.replace(/^.*\/js\//, 'js/')} loads`);
          else if (!registered) early.push(`${what} before the language file`);
        };
        for (const name of ['t', 'plural', 'or', 'punctuation']) {
          const f = value[name];
          value[name] = function (...args) {
            note(`${name}(${JSON.stringify(args[0]) || ''})`);
            return f.apply(this, args);
          };
        }
        const { get } = Object.getOwnPropertyDescriptor(value, 'current');
        Object.defineProperty(value, 'current', { get: () => (note('current'), get.call(value)) });
        const { register } = value;
        value.register = function (...args) {
          registered = true;
          return register.apply(this, args);
        };
      },
    });
  });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/js/i18n/zh-CN.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/?lang=zh-CN', { waitUntil: 'domcontentloaded' });
  // After every other script.
  await page.waitForTimeout(500);
  release();
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  await expect(page.locator('#strip .track--data button.cell').first()).toHaveAttribute('aria-label', '第 7 位（共 31 位）：第 1 部分，对应数字 64');
  await page.getByRole('button', { name: 'Kodak BW400CN，画幅 23' }).click();
  await expect(page.locator('#source')).toContainText('示例');
  await page.getByRole('tab', { name: '读取照片' }).click();
  await page.getByRole('button', { name: '试用示例' }).click();
  await expect(page.locator('.photo__source')).toContainText('示例：电脑绘制的彩色负片。');
  expect(await page.evaluate(() => window.earlyTexts)).toEqual([]);
});

test('the language file may also come before the language layer', async ({ page }) => {
  await page.route('**/js/i18n.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto('/?lang=zh-CN');
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
  await expect(page.locator('#hint')).toHaveText(/^从第 7 位开始/);
});

test('a language file that has not come after 3 s: the page says so in that language and keeps waiting, or shows in English if asked, and works', async ({ page }) => {
  const other = await page.context().newPage();
  await other.route('**/js/i18n/zh-CN.js', () => {}); // never answered
  const start = Date.now();
  await other.goto('/?lang=zh-CN', { waitUntil: 'domcontentloaded' });
  const note = other.locator('.language-wait');
  await expect(note).toHaveText(/^正在加载中文界面/, { timeout: 6000 });
  expect(Date.now() - start).toBeGreaterThanOrEqual(3000);
  await other.waitForTimeout(1000);
  await expect(other.locator('html')).toHaveAttribute('data-i18n-pending', '');
  await expect(other.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await other.getByRole('button', { name: '改用英文显示' }).click();
  await expect(note).toHaveCount(0);
  await expect(other.locator('html')).toHaveAttribute('lang', 'en');
  await expect(other.locator('#decoder-title')).toHaveText('Identify a film from the barcode on its edge');
  await expect(other.getByLabel('Language')).toHaveValue('en');
  await expect(other.locator('#strip .track--data button.cell').first()).toBeVisible();
  await other.close();
});

test('the note goes as the page shows: in Chinese if the file comes, in English for good if that was asked for first', async ({ page }) => {
  for (const askEnglish of [false, true]) {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route('**/js/i18n/zh-CN.js', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/?lang=zh-CN', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.language-wait')).toBeVisible({ timeout: 6000 });
    if (askEnglish) await page.getByRole('button', { name: '改用英文显示' }).click();
    const loaded = page.waitForResponse('**/js/i18n/zh-CN.js');
    release();
    await loaded;
    await expect.poll(() => page.evaluate(() => window.DX.i18n && window.DX.i18n.languages.map((l) => l.code))).toContain('zh-CN');
    await expect(page.locator('.language-wait')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', askEnglish ? 'en' : 'zh-CN');
    await expect(page.locator('#decoder-title')).toHaveText(askEnglish ? 'Identify a film from the barcode on its edge' : '从片边的潜影条码识别胶片');
    await expect(page.locator('#hint')).toHaveText(askEnglish ? /^Start at cell 7/ : /^从第 7 位开始/);
    await page.unrouteAll();
  }
});

test('a page whose language layer cannot load offers itself in English after 3 s, marked so', async ({ page }) => {
  // A page of its own: the scripts' errors are expected here.
  const other = await page.context().newPage();
  await other.route('**/js/i18n.js', (route) => route.abort());
  await other.goto('/?lang=zh-CN');
  await other.getByRole('button', { name: '改用英文显示' }).click({ timeout: 6000 });
  await expect(other.locator('html')).not.toHaveAttribute('data-i18n-pending', /.*/);
  await expect(other.locator('html')).toHaveAttribute('lang', 'en');
  await other.close();
});

test('in Chinese, the cassette numbers of a film are listed the Chinese way', async ({ page }) => {
  await page.goto('/?dx=12-3/1&lang=zh-CN');
  const numbers = page.locator('#result .match__cassette', { hasText: '001950' });
  await expect(numbers).toHaveText('暗盒条码 001950、701950');
});

test('a language in the URL that the page does not have is ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dx-lang', 'zh-CN'));
  await page.goto('/?dx=79-15/23&lang=fr');
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
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
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
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
  await expect(page.locator('#decoder-title')).toHaveText('从片边的潜影条码识别胶片');
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
  // Lists of numbers are separated the Chinese way.
  await expect(page.locator('#codes .num-list')).toContainText('、');
  await expect(page.locator('#codes .num-list')).not.toContainText(', ');

  await page.getByRole('tab', { name: '读取照片' }).click();
  await page.getByRole('button', { name: '试用示例' }).click();
  await expect(page.locator('.photo__found')).toContainText('DX 96-12，画幅 14A');
  await expect(page.locator('.photo__found')).toContainText('：KODAK GOLD 200 Film');
});

test('every marked part of the page has its text in every language, exactly as the browser reads it', async ({ page }) => {
  await page.goto('/');
  // The page loads only the language it is shown in: the others' files are added here.
  for (const code of await page.evaluate(() => window.DX.i18n.available().map((l) => l.code).filter((c) => c !== 'en'))) {
    await page.addScriptTag({ url: `js/i18n/${code}.js` });
  }
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
  const names = await page.evaluate(() => window.DX.i18n.available().filter((l) => l.code !== 'en').map((l) => l.name));
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

test('Chinese pieces of text are joined without spaces', async ({ page }) => {
  await page.goto('/?dx=28-5/1&lang=zh-CN');
  // (Playwright trims expected text, so the raw text is compared.)
  const notes = page.locator('#result .match__original').filter({ hasText: '可信度' }).first();
  await expect(notes).toBeVisible();
  expect(await notes.textContent()).not.toContain(' （');
  await page.goto('/?dx=21-0/1&lang=zh-CN');
  await expect(page.locator('#result .result__lead').first()).toContainText('。历史：');
});
