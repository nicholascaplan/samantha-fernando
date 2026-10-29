const { test, expect } = require('@playwright/test');
const { waitForScrollSettle } = require('./scroll-settle');

// Playwright's waitForFunction stops polling on any truthy return - and a
// Promise object is truthy - without re-checking its resolved value. The
// helper must therefore keep polling while the anchor is missing instead of
// resolving early, or a click queued behind it can race the anchor scroll.
//
// Timing assertions below use browser-side event timestamps
// (performance.timeOrigin + performance.now()) against the Node time at
// which the helper's promise resolved. The Node resolve stamp can only lag
// the real in-page settle (event-loop hop), so it inflates measured elapsed
// time slightly and cannot hide a slow settle; thresholds keep >=50ms of
// cushion for the correct helper and >=50ms of margin below the threshold
// for an early-returning variant. No upper bounds: a loaded runner stretches
// wall-clock time, and the test timeout already guards a hang.
test('keeps polling until the anchor exists, then waits for the quiet window', async ({ page }) => {
  await page.goto('/');
  const started = Date.now();
  await page.evaluate(() => setTimeout(() => {
    const anchor = document.createElement('div');
    anchor.id = 'late-anchor';
    document.body.appendChild(anchor);
    window.__insertedAt = performance.now();
  }, 800));
  // The element never moves, so once it exists only the 100ms quiet window
  // remains. The old shape resolved after a single poll (~20ms); polling
  // until insertion plus the quiet window takes at least ~800ms.
  await waitForScrollSettle(page, '#late-anchor', 100);
  const resolvedAt = Date.now();
  expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  // The wall-clock check above cannot distinguish "waited out the quiet
  // window" from "returned as soon as the anchor appeared" (both ~800ms),
  // so also assert the quiet window elapsed after the actual insertion.
  const t = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    insertedAt: window.__insertedAt ?? null,
  }));
  expect(t.insertedAt, 'insertion timestamp was not recorded').not.toBeNull();
  expect(resolvedAt - (t.origin + t.insertedAt)).toBeGreaterThanOrEqual(80);
});

test('waits out the quiet window for a present, stationary anchor', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const anchor = document.createElement('div');
    anchor.id = 'still-anchor';
    document.body.appendChild(anchor);
    window.__setupDone = performance.now();
  });
  // The timer starts at the browser-side setup stamp, not before the
  // evaluate round trip, so runner latency cannot mask an early return.
  await waitForScrollSettle(page, '#still-anchor', 200);
  const resolvedAt = Date.now();
  const t = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    setupDone: window.__setupDone ?? null,
  }));
  expect(t.setupDone, 'setup timestamp was not recorded').not.toBeNull();
  expect(resolvedAt - (t.origin + t.setupDone)).toBeGreaterThanOrEqual(150);
});

test('restarts the quiet window when the anchor moves during the wait', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const anchor = document.createElement('div');
    anchor.id = 'moving-anchor';
    document.body.appendChild(anchor);
    const start = performance.now();
    let frame = 0;
    window.__stoppedAt = null;
    const step = () => {
      if (performance.now() - start >= 600) {
        window.__stoppedAt = performance.now();
        return;
      }
      frame += 1;
      // Alternating 1px translate changes getBoundingClientRect().top every
      // frame - exactly the signal the helper watches.
      anchor.style.transform = `translateY(${frame % 2}px)`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await waitForScrollSettle(page, '#moving-anchor', 200);
  const resolvedAt = Date.now();
  const t = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    stoppedAt: window.__stoppedAt ?? null,
  }));
  expect(t.stoppedAt, 'anchor movement did not stop').not.toBeNull();
  // The quiet window must run after the last movement, not from the first
  // sample. A helper that never restarts its window resolves ~200ms into
  // the 600ms movement and fails this by a wide margin; 150 leaves ~50ms
  // of slack for the frame gap between the last movement and the sample.
  expect(resolvedAt - (t.origin + t.stoppedAt)).toBeGreaterThanOrEqual(150);
});
