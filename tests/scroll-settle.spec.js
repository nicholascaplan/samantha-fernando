const { test, expect } = require('@playwright/test');
const { waitForScrollSettle } = require('./scroll-settle');

// Playwright's waitForFunction stops polling on any truthy return - and a
// Promise object is truthy - without re-checking its resolved value. The
// helper must therefore keep polling while the anchor is missing instead of
// resolving early, or a click queued behind it can race the anchor scroll.
test('keeps polling until the anchor exists, then waits for the quiet window', async ({ page }) => {
  await page.goto('/');
  const started = Date.now();
  await page.evaluate(() => setTimeout(() => {
    const anchor = document.createElement('div');
    anchor.id = 'late-anchor';
    document.body.appendChild(anchor);
  }, 800));
  // The element never moves, so once it exists only the 100ms quiet window
  // remains. The old shape resolved after a single poll (~20ms); polling
  // until insertion plus the quiet window takes at least ~800ms.
  await waitForScrollSettle(page, '#late-anchor', 100);
  expect(Date.now() - started).toBeGreaterThanOrEqual(700);
});

test('returns promptly once a present, stationary anchor has been quiet', async ({ page }) => {
  await page.goto('/');
  const started = Date.now();
  await page.evaluate(() => {
    const anchor = document.createElement('div');
    anchor.id = 'still-anchor';
    document.body.appendChild(anchor);
  });
  await waitForScrollSettle(page, '#still-anchor', 200);
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(150);
  expect(elapsed).toBeLessThan(3000);
});
