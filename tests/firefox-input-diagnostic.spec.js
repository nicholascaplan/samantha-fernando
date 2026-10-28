const { test, expect, firefox, devices } = require('@playwright/test');
// Temporary evidence collection only. Not a replacement for the normal matrix.
for (const isolate of [false, true]) {
 for (const quietNotification of [false, true]) {
  for (const scale of [1, 2]) {
   test(`diagnostic providers=${isolate ? 'isolated' : 'live'} speech-notice=${quietNotification ? 'quiet' : 'default'} text=${scale * 100}%`, async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'firefox', 'Firefox-only diagnostic');
    const browser = await firefox.launch({ firefoxUserPrefs: quietNotification ? { 'media.webspeech.synth.dont_notify_on_error': true } : {} });
    const context = await browser.newContext({ ...devices['Desktop Firefox'], viewport: { width: 768, height: 600 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const messages = [];
    page.on('console', message => messages.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', error => messages.push({ type: 'pageerror', text: error.message }));
    if (isolate) await context.route(/https?:\/\/([^/]*\.)?(soundcloud\.com|sndcdn\.com|youtube\.com|spotify\.com)\//, route => route.abort());
    await page.addInitScript(scale => {
     window.__diagnosticClicks = [];
     document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = `${16 * scale}px`);
     document.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target) return;
      setTimeout(() => window.__diagnosticClicks.push({ id: target.id, time: performance.now(), consent: localStorage.getItem('analyticsConsent'), banner: document.querySelector('#cookieConsentBanner')?.className, expanded: document.querySelector('#mobileMenuToggle')?.getAttribute('aria-expanded') }), 0);
     }, true);
    }, scale);
    try {
     // Original menu assertions and30s test timeout, with no retries or forced input.
     await page.goto('/');
     await page.getByRole('button', { name: 'Reject', exact: true }).click();
     await page.locator('#mobileMenuToggle').click();
     const link = page.locator('#mobileMenu').getByRole('link', { name: /on SoundCloud/ });
     await link.scrollIntoViewIfNeeded();
     await expect(link).toBeInViewport({ ratio: 1 });
     await page.setViewportSize({ width: 820, height: 600 });
     await link.scrollIntoViewIfNeeded();
     await expect(link).toBeInViewport({ ratio: 1 });
    } finally {
     const state = await page.evaluate(() => ({ clicks: window.__diagnosticClicks, consent: localStorage.getItem('analyticsConsent'), banner: document.querySelector('#cookieConsentBanner')?.className, expanded: document.querySelector('#mobileMenuToggle')?.getAttribute('aria-expanded') })).catch(error => ({ unavailable: error.message }));
     console.log(JSON.stringify({ isolate, quietNotification, scale, state, messages }));
     await testInfo.attach('diagnostic-state', { body: JSON.stringify({ isolate, quietNotification, scale, state, messages }, null, 2), contentType: 'application/json' });
     await context.tracing.stop({ path: testInfo.outputPath('diagnostic-trace.zip') }).catch(() => {});
     await testInfo.attach('diagnostic-trace', { path: testInfo.outputPath('diagnostic-trace.zip'), contentType: 'application/zip' }).catch(() => {});
     await browser.close();
    }
   });
  }
 }
}
