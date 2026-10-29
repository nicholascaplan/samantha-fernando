const { test, expect } = require('@playwright/test');
const { waitForScrollSettle } = require('./scroll-settle');

// Playwright's waitForFunction stops polling on any truthy return - and a
// Promise object is truthy - without re-checking its resolved value. The
// helper must therefore keep polling while the anchor is missing instead of
// resolving early, or a click queued behind it can race the anchor scroll.
//
// Every critical elapsed assertion below runs on the browser clock alone:
// event stamps (insertion / setup done / movement stop) and the helper's
// own settle stamp (window.__scrollSettleTestResolvedAt, written at the
// actual resolution point) are all performance.now() readings. No Node
// timestamps and no IPC round trips sit inside any measured value, so an
// early return cannot be masked by reporting latency. The stamp is reset
// before each attempt and asserted present afterwards, so a stale or
// missing stamp fails loudly instead of passing on an old value.
test('keeps polling until the anchor exists, then waits for the quiet window', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__scrollSettleTestResolvedAt = null;
    window.__insertedAt = null;
    setTimeout(() => {
      const anchor = document.createElement('div');
      anchor.id = 'late-anchor';
      document.body.appendChild(anchor);
      window.__insertedAt = performance.now();
    }, 800);
  });
  const started = Date.now();
  // The element never moves, so once it exists only the 100ms quiet window
  // remains. The old shape resolved after a single poll (~20ms); polling
  // until insertion plus the quiet window takes at least ~800ms.
  await waitForScrollSettle(page, '#late-anchor', 100);
  // Coarse wall-clock guard kept from the original RED test: the old
  // single-poll shape still fails here.
  expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  // Precise browser-clock assertion: the quiet window must have elapsed
  // after the actual insertion. A return as soon as the anchor appears
  // measures ~0-20ms and fails; 80 leaves one rAF frame of slack.
  const t = await page.evaluate(() => ({
    insertedAt: window.__insertedAt ?? null,
    settledAt: window.__scrollSettleTestResolvedAt ?? null,
  }));
  expect(t.insertedAt, 'insertion timestamp was not recorded').not.toBeNull();
  expect(t.settledAt, 'helper resolved without a browser-side settle stamp').not.toBeNull();
  expect(t.settledAt - t.insertedAt).toBeGreaterThanOrEqual(80);
});

test('waits out the quiet window for a present, stationary anchor', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__scrollSettleTestResolvedAt = null;
    const anchor = document.createElement('div');
    anchor.id = 'still-anchor';
    document.body.appendChild(anchor);
    window.__setupDone = performance.now();
  });
  // Measured entirely on the browser clock from the setup stamp, so runner
  // and evaluate latency cannot mask an early return.
  await waitForScrollSettle(page, '#still-anchor', 200);
  const t = await page.evaluate(() => ({
    setupDone: window.__setupDone ?? null,
    settledAt: window.__scrollSettleTestResolvedAt ?? null,
  }));
  expect(t.setupDone, 'setup timestamp was not recorded').not.toBeNull();
  expect(t.settledAt, 'helper resolved without a browser-side settle stamp').not.toBeNull();
  expect(t.settledAt - t.setupDone).toBeGreaterThanOrEqual(150);
});

test('restarts the quiet window when the anchor moves during the wait', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__scrollSettleTestResolvedAt = null;
    window.__stoppedAt = null;
    window.__lastMovedAt = null;
    const anchor = document.createElement('div');
    anchor.id = 'moving-anchor';
    document.body.appendChild(anchor);
    const start = performance.now();
    let frame = 0;
    const step = () => {
      if (performance.now() - start >= 600) {
        window.__stoppedAt = performance.now();
        return;
      }
      frame += 1;
      // Alternating 1px translate changes getBoundingClientRect().top every
      // frame - exactly the signal the helper watches.
      anchor.style.transform = `translateY(${frame % 2}px)`;
      window.__lastMovedAt = performance.now();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await waitForScrollSettle(page, '#moving-anchor', 200);
  const t = await page.evaluate(() => ({
    lastMovedAt: window.__lastMovedAt ?? null,
    stoppedAt: window.__stoppedAt ?? null,
    settledAt: window.__scrollSettleTestResolvedAt ?? null,
  }));
  expect(t.lastMovedAt, 'anchor movement was not recorded').not.toBeNull();
  expect(t.stoppedAt, 'anchor movement did not stop').not.toBeNull();
  expect(t.settledAt, 'helper resolved without a browser-side settle stamp').not.toBeNull();
  // The quiet window must run after the last movement, not from the first
  // sample. Asserted against the last ACTUAL transform change, not the
  // stop-stamp tick: the helper observes a change at its next sample, so
  // its lastMove >= lastMovedAt and it settles at >= lastMove + 200ms,
  // giving settledAt - lastMovedAt >= 200ms with no frame-rate assumption
  // (an arbitrarily slow frame cannot make the correct helper fail this).
  // A helper that never restarts its window resolves ~200ms into the
  // 600ms movement and fails by a wide margin; 150 leaves margin for
  // clock quantization only.
  expect(t.settledAt - t.lastMovedAt).toBeGreaterThanOrEqual(150);
});
