const { test, expect } = require('@playwright/test');

const destinations = ['home', 'works', 'listen', 'watch', 'bio', 'writing', 'contact'];

async function expectWithinViewport(page) {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      width,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingElements: [...document.querySelectorAll('body *')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width && rect.height && (rect.left < -1 || rect.right > width + 1);
        })
        .map(element => element.id || element.tagName),
    };
  });
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  expect(layout.overflowingElements).toEqual([]);
}

for (const width of [390, 768, 820, 1024, 1280]) {
  for (const theme of ['light', 'dark']) {
    for (const textScale of [1, 2]) {
      test(`all pages fit at ${width}px in ${theme} mode with ${textScale * 100}% text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(({ theme, textScale }) => {
          localStorage.setItem('theme', theme);
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.fontSize = `${16 * textScale}px`;
          });
        }, { theme, textScale });
        await page.goto('/');
        await page.evaluate(() => document.fonts.ready);
        await expectWithinViewport(page);
        await page.getByRole('button', { name: 'Reject', exact: true }).click();

        for (const destination of destinations) {
          const menuToggle = page.locator('#mobileMenuToggle');
          // At the exact breakpoint, WebKit can change menus as scrollbars settle.
          // Re-select the rendered navigation rather than retaining a now-hidden link.
          await expect(async () => {
            const compact = await menuToggle.isVisible();
            if (compact) {
              if (await menuToggle.getAttribute('aria-expanded') === 'false') {
                await menuToggle.click();
              }
              await expect(menuToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 500 });
              await expectWithinViewport(page);
            }
            const link = page.locator(compact
              ? `[data-mobile-nav="${destination}"]`
              : `#nav-${destination}`);
            await expect(link).toBeVisible({ timeout: 500 });
            await expect(link).toBeInViewport({ ratio: 1, timeout: 500 });
            await link.focus();
            await expect(link).toBeFocused({ timeout: 500 });
          }).toPass({ timeout: 5000 });
          await page.keyboard.press('Enter');
          await expect(page).toHaveURL(destination === 'home' ? /\/$/ : new RegExp(`#${destination}$`));
          await expect(page.locator(`#tab-${['listen', 'watch'].includes(destination) ? 'works' : destination}`)).toBeVisible();
          await expect(page.locator('#mobileMenu')).toBeHidden();
          await expectWithinViewport(page);
          await expect(page.locator('#themeToggleBtn')).toBeInViewport({ ratio: 1 });
          await expect(page.locator('#ambientSoundBtn')).toBeInViewport({ ratio: 1 });
        }
      });
    }
  }
}
