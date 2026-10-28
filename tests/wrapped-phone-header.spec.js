const {test, expect} = require('@playwright/test');
for (const width of [320, 390]) for (const theme of ['light', 'dark']) for (const enlargeFirst of [true, false]) {
 test(`phone header controls remain pointer-accessible ${width}px ${theme} ${enlargeFirst?'before':'after'} opening @mobile`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/');
  await page.getByRole('button', {name:'Reject', exact:true}).click();
  const toggle = page.locator('#mobileMenuToggle'), menu = page.locator('#mobileMenu');
  if (enlargeFirst) await page.evaluate(() => document.documentElement.style.fontSize = '32px');
  await toggle.click();
  if (!enlargeFirst) await page.evaluate(() => document.documentElement.style.fontSize = '32px');
  await expect.poll(async () => page.evaluate(() => {
   const menu = document.getElementById('mobileMenu').getBoundingClientRect();
   return [...document.querySelectorAll('#mobileMenuToggle,#themeToggleBtn,#ambientSoundBtn')]
    .every(control => control.getBoundingClientRect().bottom <= menu.top);
  })).toBe(true);
  await menu.getByRole('link',{name:/on SoundCloud/}).scrollIntoViewIfNeeded();
  await expect(menu.getByRole('link',{name:/on SoundCloud/})).toBeInViewport({ratio:1});
  await toggle.click();
  await expect(menu).toBeHidden();
  await toggle.click();
  const themeToggle = page.locator('#themeToggleBtn');
  const pressedBefore = await themeToggle.getAttribute('aria-pressed');
  await themeToggle.click();
  await expect(themeToggle).toHaveAttribute('aria-pressed', pressedBefore === 'true' ? 'false' : 'true');
  await expect(menu).toBeVisible();
  await page.touchscreen.tap(5,895);
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
