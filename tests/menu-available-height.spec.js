// TEMPORARY DIAGNOSTIC INSTRUMENTATION - this branch exists only to capture
// Firefox CI evidence for the intermittent Reject-click/menu failure.
// Assertions and test steps are unchanged from main; only logging was added.
const { test, expect } = require('@playwright/test');
for (const scale of [1, 2]) test(`short tablet menu last follow link fully reachable at ${scale * 100}% text`, async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 600 });
  await page.addInitScript(scale => {
    window.__diag = { events: [], fontsAtDCL: null, fontsReadyAt: null, navStart: Math.round(performance.now()) };
    const cap = e => window.__diag.events.push({
      type: e.type, target: e.target.id || e.target.tagName,
      x: e.clientX, y: e.clientY, t: Math.round(performance.now()),
    });
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
      document.addEventListener(t, cap, true);
    }
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = `${16 * scale}px`;
      window.__diag.fontsAtDCL = document.fonts.status;
      document.fonts.ready.then(() => { window.__diag.fontsReadyAt = Math.round(performance.now()); });
    });
  }, scale);
  await page.goto('/');
  const boxBefore = await page.locator('#rejectAnalyticsCookies').boundingBox();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  const boxAfter = await page.locator('#rejectAnalyticsCookies').boundingBox();
  console.log('DIAG scale=' + scale + ' boxBefore=' + JSON.stringify(boxBefore) + ' boxAfter=' + JSON.stringify(boxAfter));
  for (let i = 0; i < 8; i++) {
    const state = await page.evaluate(() => ({
      consent: localStorage.getItem('analyticsConsent'),
      bannerHidden: document.getElementById('cookieConsentBanner').classList.contains('hidden'),
      fonts: document.fonts.status,
      fontsAtDCL: window.__diag.fontsAtDCL,
      fontsReadyAt: window.__diag.fontsReadyAt,
      url: location.href,
      events: window.__diag.events,
    }));
    console.log('DIAG scale=' + scale + ' poll' + (i + 1) + ' consent=' + state.consent + ' hidden=' + state.bannerHidden + ' fonts=' + state.fonts + ' fontsAtDCL=' + state.fontsAtDCL + ' fontsReadyAt=' + state.fontsReadyAt + ' url=' + state.url + ' events=' + JSON.stringify(state.events));
    if (state.bannerHidden) break;
    await page.waitForTimeout(400);
  }
  await page.locator('#mobileMenuToggle').click();const link = page.locator('#mobileMenu').getByRole('link', { name: /on SoundCloud/ });await link.scrollIntoViewIfNeeded();await expect(link).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 820, height: 600 });await link.scrollIntoViewIfNeeded();await expect(link).toBeInViewport({ ratio: 1 });
});
