const { test, expect } = require('@playwright/test');

const destinations = ['home', 'works', 'listen', 'watch', 'bio', 'writing', 'contact'];

for (const theme of ['light', 'dark']) {
  test(`catalogue action widths stay consistent with long copy in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/works/');
    await page.evaluate(() => document.fonts.ready);

    for (const view of ['all', 'listen']) {
      await page.locator(`#works-view-${view}`).click();
      await expect(page).toHaveURL(view === 'all' ? /\/works\/$/ : /\/listen\/$/);
      await expect(page.locator('#worksContainer .work-media-action').first()).toBeVisible();
      for (const width of [768, 820, 1024, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        const actions = await page.locator('#worksContainer .work-media-action:visible').evaluateAll(buttons => {
          const expectedWidth = 10.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
          return buttons.map(button => ({
            label: button.textContent.trim(),
            width: button.getBoundingClientRect().width,
            expectedWidth,
          }));
        });
        const totalActions = await page.locator('#worksContainer .work-media-action').count();
        expect(actions.length, `${view} at ${width}px: :visible filter must not drop actions (${actions.length} of ${totalActions})`).toBe(totalActions);
        expect(actions.length).toBeGreaterThan(0);
        for (const action of actions) {
          expect(action.width, `${view} at ${width}px: ${JSON.stringify(action)}`).toBeCloseTo(action.expectedWidth, 0);
        }
        await expectWithinViewport(page);
      }
    }
  });
}

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
        .map(element => ({id: element.id, tag: element.tagName, text: element.textContent.trim().slice(0, 80), class: element.className})),
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
          await expect(page).toHaveURL(new RegExp(`${({home: '/', works: '/works/', listen: '/listen/', watch: '/watch/', bio: '/biography/', writing: '/writing/', contact: '/contact/'})[destination]}$`));
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

for (const width of [390, 768, 1024]) {
  for (const theme of ['light', 'dark']) {
    for (const textScale of [1, 2]) {
      test(`privacy page and footer fit at ${width}px in ${theme} mode with ${textScale * 100}% text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(({ theme, textScale }) => {
          localStorage.setItem('theme', theme);
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.fontSize = `${16 * textScale}px`;
          });
        }, { theme, textScale });
        await page.goto('/privacy/');
        await page.evaluate(() => document.fonts.ready);
        await page.getByRole('button', { name: 'Reject', exact: true }).click();
        await expectWithinViewport(page);
        // The revisit control stays reachable and the footer rows wrap inside the page.
        await page.getByRole('button', { name: 'Cookie preferences' }).click();
        await expect(page.getByRole('dialog', { name: 'Analytics and privacy' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expectWithinViewport(page);
      });
    }
  }
}
