const { test, expect } = require('@playwright/test');

// The shared header swaps between the desktop bar and the compact menu at the
// 1024px CSS-width boundary. Which mode renders follows the measured CSS width,
// so a vertical scrollbar can carry a 1024px layout viewport across the boundary.
// These checks pin the boundary behaviour without masking it: the rendered mode
// must match the measured CSS width, a single key press must reach the destination,
// and navigation must still complete after a resize across the boundary. The swap
// hides the focused link and browsers drop focus to the document body; that focus
// loss is tracked as unresolved work in docs/next-steps.md, not accepted here.

function measuredMode(page) {
  return page.evaluate(() => (document.documentElement.clientWidth >= 1024 ? 'desktop' : 'compact'));
}

async function expectMode(page, mode) {
  const desktopLink = page.locator('#nav-watch');
  const toggle = page.locator('#mobileMenuToggle');
  if (mode === 'desktop') {
    await expect(desktopLink).toBeVisible();
    await expect(toggle).toBeHidden();
  } else {
    await expect(toggle).toBeVisible();
    await expect(desktopLink).toBeHidden();
  }
}

async function openCompactMenu(page) {
  const toggle = page.locator('#mobileMenuToggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function keyboardNavigateToWatch(page, mode) {
  if (mode === 'compact') {
    await openCompactMenu(page);
  }
  const link = page.locator(mode === 'compact' ? '[data-mobile-nav="watch"]' : '#nav-watch');
  await expect(link).toBeVisible();
  // One activation must reach the destination; no retrying a failed press.
  await link.press('Enter');
  await expect(page).toHaveURL(/\/watch\/$/);
  await expect(page.locator('#mobileMenu')).toBeHidden();
}

for (const width of [1023, 1025]) {
  test(`keyboard navigation works ${width === 1023 ? 'just below' : 'just above'} the desktop breakpoint (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    const mode = await measuredMode(page);
    await expectMode(page, mode);
    await keyboardNavigateToWatch(page, mode);
  });
}

test('resizing across the breakpoint swaps the navigation mode and keyboard navigation still completes', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();

  const startMode = await measuredMode(page);
  await expectMode(page, startMode);

  // Cross the boundary in the direction the measured start allows, landing where
  // the mode is deterministic even with a scrollbar: 900px is always compact,
  // 1280px is always desktop.
  const targetWidth = startMode === 'desktop' ? 900 : 1280;

  // Focus Watch in the starting mode so the swap's effect on focus is observable.
  const startLink = page.locator(startMode === 'compact' ? '[data-mobile-nav="watch"]' : '#nav-watch');
  if (startMode === 'compact') {
    await openCompactMenu(page);
  }
  await startLink.focus();
  await expect(startLink).toBeFocused();

  await page.setViewportSize({ width: targetWidth, height: 1000 });
  const endMode = await measuredMode(page);
  expect(endMode).not.toBe(startMode);
  await expectMode(page, endMode);

  // The swap hides the previously focused link. Record where focus actually went
  // as evidence for the tracked issue; the loss itself is not the expected outcome.
  await expect(startLink).toBeHidden();
  const focusAfterSwap = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'none';
  });
  test.info().annotations.push({ type: 'evidence', description: `focus after the mode swap moved to ${focusAfterSwap}` });

  // The keyboard user can still complete navigation in the new mode.
  await keyboardNavigateToWatch(page, endMode);
});
