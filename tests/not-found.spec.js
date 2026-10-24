const {test, expect} = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('unknown paths return the branded 404 for GET and HEAD without a redirect', async ({request}) => {
  for (const path of ['/missing-page/', '/nested/missing/page.html']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(new URL(response.url()).pathname).toBe(path);
    expect(await response.text()).toContain('An unexpected pause.');
    const head = await request.head(path);
    expect(head.status()).toBe(404);
    expect(head.headers()['content-type']).toContain('text/html');
    expect(await head.text()).toBe('');
  }
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('404.html');
});

test('404 recovery preserves the real shell, updates metadata and restores normal layout', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  expect((await page.goto('/nested/missing/page/')).status()).toBe(404);
  await expect(page.getByRole('heading', {name:'An unexpected pause.'})).toBeVisible();
  await expect(page).toHaveTitle('Page not found | Samantha Fernando');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
  await page.getByRole('button', {name:'Reject', exact:true}).click();
  await page.evaluate(() => { window.__errorShell = true; });
  await page.getByRole('button', {name:'Switch to dark mode', exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/light-mode/);
  await page.reload();
  await expect(page.getByRole('button', {name:'Switch to light mode', exact:true})).toBeVisible();
  await page.evaluate(() => { window.__errorShell = true; });
  await page.getByRole('link', {name:'Explore recordings'}).click();
  await expect(page).toHaveURL(/\/listen\/$/);
  await expect(page.locator('#works-view-listen')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.samanthafernando.com/listen/');
  expect(await page.evaluate(() => window.__errorShell)).toBe(true);
  expect(await page.locator('main').evaluate(main => getComputedStyle(main).flexGrow)).toBe('1');
  await page.goBack();
  await expect(page.getByRole('heading', {name:'An unexpected pause.'})).toBeVisible();
  await page.getByRole('link', {name:'Back to home'}).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#tab-home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('404 recovery and mobile navigation work without JavaScript', async ({browser, baseURL}) => {
  const context = await browser.newContext({javaScriptEnabled:false, viewport:{width:390, height:844}});
  try {
    const page = await context.newPage();
    expect((await page.goto(`${baseURL}/deep/missing/`)).status()).toBe(404);
    await expect(page.getByRole('heading', {name:'An unexpected pause.'})).toBeVisible();
    await expect(page.locator('#mobileMenu')).toBeVisible();
    await page.getByRole('link', {name:'Explore recordings'}).click();
    await expect(page).toHaveURL(/\/listen\/$/);
    await expect(page.locator('#tab-works')).toBeVisible();
    await page.goto(`${baseURL}/another-missing/`);
    await page.getByRole('link', {name:'Back to home'}).click();
    await expect(page.locator('#tab-home')).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const mobile of [false, true]) {
  test(`404 compact recovery and accessibility in both themes${mobile ? ' @mobile' : ''}`, async ({page}) => {
    await page.setViewportSize({width:mobile ? 320 : 1280, height:mobile ? 568 : 800});
    await page.goto('/missing/');
    await page.getByRole('button', {name:'Reject', exact:true}).click();
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', {name:'Switch to dark mode', exact:true}).click();
      await expect.poll(() => page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor)).toBe(theme === 'light' ? 'rgb(244, 240, 232)' : 'rgb(13, 13, 13)');
      for (const link of await page.locator('.not-found-actions a').all()) {
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(mobile ? 568 : 800);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const main = await page.locator('main').boundingBox();
      const footer = await page.locator('footer').boundingBox();
      expect(footer.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(Math.abs(footer.y + footer.height - documentHeight)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const results = await new AxeBuilder({page}).analyze();
      expect(results.violations).toEqual([]);
    }
    if (mobile) {
      await page.getByRole('button', {name:'Open navigation menu', exact:true}).click();
      await page.locator('[data-mobile-nav="bio"]').click();
      await expect(page.locator('#tab-bio')).toBeVisible();
    }
  });
}
