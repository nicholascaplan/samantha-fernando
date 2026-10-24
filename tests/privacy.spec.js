const { test, expect } = require('@playwright/test');

test('footer Privacy link reaches the Privacy page through enhanced navigation', async ({ page }) => {
  await page.goto('/contact/');
  await page.evaluate(() => { window.__documentMarker = {}; });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\/#cookie-settings$/);
  await expect(page).toHaveTitle('Privacy | Samantha Fernando');
  await expect(page.locator('#tab-privacy')).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Privacy');
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Cookie preferences' })).toBeInViewport();
  expect(await page.locator('#cookie-settings').innerText()).not.toContain('Analytics cookies stay off without JavaScript');
  expect(await page.evaluate(() => Boolean(window.__documentMarker))).toBe(true);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/contact\/$/);
  await expect(page.locator('#tab-contact')).toBeVisible();
});

test('Cookie preferences revisits the choice from the Privacy page in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/privacy/');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.locator('#cookieConsentBanner')).toBeHidden();
    await page.getByRole('button', { name: 'Cookie preferences' }).click();
    const notice = page.getByRole('dialog', { name: 'Analytics and privacy' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('on the Privacy page, linked in the footer');
    await expect(page.locator('#cookieConsentBanner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cookie preferences' })).toBeFocused();
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.locator('#cookieConsentBanner')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('accepted');
    await page.evaluate(() => localStorage.removeItem('analyticsConsent'));
  }
});

test('withdrawing analytics consent removes host and parent-domain GA cookies', async ({ page, context, request, baseURL }) => {
  const origin = 'https://www.samanthafernando.com';
  // Serve the generated site locally under the production hostname; never load live providers.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const response = await request.get(`${baseURL}${url.pathname}`);
    await route.fulfill({ response });
  });
  await page.goto(`${origin}/privacy/`);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const names = ['_ga', '_ga_N74SECKP5X'];
  await context.addCookies([
    ...names.map(name => ({ name, value: 'review-fixture', url: `${origin}/` })),
    ...['.www.samanthafernando.com', '.samanthafernando.com'].flatMap(domain =>
      names.map(name => ({ name, value: 'review-fixture', domain, path: '/' }))),
    { name: 'unrelated', value: 'keep', domain: '.samanthafernando.com', path: '/' },
  ]);
  expect((await context.cookies()).filter(cookie => names.includes(cookie.name))).toHaveLength(6);
  await page.getByRole('button', { name: 'Cookie preferences' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  expect(await page.evaluate(() => window['ga-disable-G-N74SECKP5X'])).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('rejected');
  const cookies = await context.cookies();
  expect(cookies.filter(cookie => names.includes(cookie.name))).toEqual([]);
  expect(cookies.find(cookie => cookie.name === 'unrelated')?.value).toBe('keep');
});

test('Cookie settings panel explains the no-JavaScript behaviour', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${test.info().project.use.baseURL}/privacy/`);
    const fallback = page.locator('#cookie-settings noscript p');
    await expect(fallback).toBeVisible();
    expect(await fallback.textContent()).toContain('Analytics cookies stay off without JavaScript');
    await expect(page.locator('#manageAnalyticsCookies')).toBeHidden();
    await expect(page.locator('footer')).toContainText('Privacy');
  } finally {
    await context.close();
  }
});
