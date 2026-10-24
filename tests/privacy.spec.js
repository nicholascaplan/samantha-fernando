const { test, expect } = require('@playwright/test');

test('footer Privacy link reaches the Privacy page through enhanced navigation', async ({ page }) => {
  await page.goto('/contact/');
  await page.evaluate(() => { window.__documentMarker = {}; });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page).toHaveTitle('Privacy | Samantha Fernando');
  await expect(page.locator('#tab-privacy')).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Privacy');
  await expect(page.locator('main h1')).toBeFocused();
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

test('Cookie settings panel explains the no-JavaScript behaviour', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${test.info().project.use.baseURL}/privacy/`);
    await expect(page.locator('#cookie-settings')).toContainText('Analytics cookies stay off without JavaScript');
    await expect(page.locator('#manageAnalyticsCookies')).toBeHidden();
    await expect(page.locator('footer')).toContainText('Privacy');
  } finally {
    await context.close();
  }
});
