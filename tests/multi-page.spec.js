const {test, expect} = require('@playwright/test');

const pages = [
  ['/', 'Samantha Fernando - Composer', 'home'],
  ['/biography/', 'Biography | Samantha Fernando', 'bio'],
  ['/works/', 'Works & Media | Samantha Fernando', 'works'],
  ['/listen/', 'Listen | Samantha Fernando', 'listen'],
  ['/watch/', 'Watch | Samantha Fernando', 'watch'],
  ['/writing/', 'Writing | Samantha Fernando', 'writing'],
  ['/contact/', 'Contact & Score Hire | Samantha Fernando', 'contact'],
  ['/privacy/', 'Privacy | Samantha Fernando', 'privacy'],
];

for (const [path, title, section] of pages) {
  const tab = ['listen', 'watch'].includes(section) ? 'works' : section;
  test(`direct load and reload: ${path}`, async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.samanthafernando.com${path}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://www.samanthafernando.com${path}`);
    await expect(page.locator(`main #tab-${tab}`)).toBeVisible();
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main > section')).toHaveCount(1);
    await page.reload();
    await expect(page.locator(`main #tab-${tab}`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`primary content and links without JavaScript: ${path}`, async ({browser}) => {
    const context = await browser.newContext({javaScriptEnabled: false});
    const page = await context.newPage();
    try {
      await page.goto(`${test.info().project.use.baseURL}${path}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('#nav-bio')).toHaveAttribute('href', '/biography/');
      if (section === 'bio') await expect(page.locator('#nav-bio')).toHaveAttribute('aria-current', 'page');
      else await expect(page.locator('#nav-bio')).not.toHaveAttribute('aria-current', 'page');
      if (['works', 'listen', 'watch'].includes(section)) {
        const snapshot = JSON.parse(await page.locator('#catalogueData').textContent());
        const cardCount = section === 'works' ? snapshot.works.length : snapshot.media.filter(item => item.type === section).length;
        await expect(page.locator('#worksContainer h3')).toHaveCount(cardCount);
        await expect(page.locator(`#nav-${section}`)).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#nav-listen')).toHaveAttribute('href', '/listen/');
        await expect(page.locator('#nav-watch')).toHaveAttribute('href', '/watch/');
      }
      if (section === 'writing') await expect(page.locator('main')).toContainText('Why do I write?');
      await page.locator('#nav-bio').click();
      await expect(page).toHaveURL(/\/biography\/$/);
      await expect(page.locator('#tab-bio')).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('enhanced navigation keeps the document and updates metadata, focus and history', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => { window.__documentMarker = {}; });
  await page.evaluate(() => {
    window.__inactiveVideoNavigations = 0;
    new MutationObserver(mutations => {
      window.__inactiveVideoNavigations += mutations.filter(mutation => mutation.attributeName === 'src').length;
    }).observe(document.getElementById('videoFrame'), {attributes: true});
  });
  await page.locator('#nav-bio').click();
  await expect(page).toHaveTitle('Biography | Samantha Fernando');
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page.locator('#nav-bio')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /About British composer/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.samanthafernando.com/biography/');
  await page.locator('#nav-writing').click();
  await expect(page.locator('#tab-writing')).toContainText('Why do I write?');
  await expect(page).toHaveURL(/\/writing\/$/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  expect(await page.evaluate(() => window.__inactiveVideoNavigations)).toBe(0);
  // Enhanced history navigation has no document load event to wait for in WebKit.
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/biography\/$/);
  await expect(page.locator('#tab-bio')).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.__documentMarker))).toBe(true);
});

test('modified link activation opens a real page in a new tab', async ({page, context}) => {
  await page.goto('/');
  // target=_blank exercises the same non-intercepted native-link path on every OS.
  await page.locator('#nav-bio').evaluate(link => { link.target = '_blank'; });
  const opened = context.waitForEvent('page');
  await page.locator('#nav-bio').click();
  const destination = await opened;
  await expect(destination).toHaveURL(/\/biography\/$/);
  await expect(destination.locator('#tab-bio')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('mobile navigation remains usable without JavaScript', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  try {
    await page.goto(`${test.info().project.use.baseURL}/`);
    await expect(page.locator('#mobileMenu')).toBeVisible();
    await page.locator('[data-mobile-nav="bio"]').click();
    await expect(page.locator('#tab-bio')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('failed enhancement falls back to a normal document navigation', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => { window.__documentMarker = true; });
  await page.route('**/biography/', route => route.request().isNavigationRequest() ? route.continue() : route.abort());
  await page.locator('#nav-bio').click();
  await expect(page.locator('#tab-bio')).toBeVisible();
  expect(await page.evaluate(() => window.__documentMarker)).toBeUndefined();
});

test('browser Back restores the previous page scroll position', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', {name: 'Reject', exact: true}).click();
  await page.evaluate(() => window.scrollTo({top: 400, behavior: 'instant'}));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  // Avoid Playwright scrolling the fixed header link into view before activation.
  await page.locator('#nav-bio').evaluate(link => link.click());
  await expect(page.locator('#tab-bio')).toBeVisible();
  // Navigation must not leave a smooth scroll running when Back restores its entry.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#tab-home')).toBeVisible();
  // Font/image layout settling can move the restored document by a few pixels.
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - 400))).toBeLessThanOrEqual(4);
});

test('unknown nested paths return 404, and the sitemap lists the real pages', async ({request}) => {
  expect((await request.get('/not-a-real-page/')).status()).toBe(404);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const [path] of pages) expect(sitemap).toContain(`<loc>https://www.samanthafernando.com${path}</loc>`);
  expect(sitemap).not.toContain('#listen');
});

test('consented analytics sends one page view per navigation and stops after rejection', async ({page}) => {
  await page.route('https://www.googletagmanager.com/**', route => route.fulfill({contentType: 'application/javascript', body: ''}));
  await page.goto('/');
  await page.getByRole('button', {name: 'Accept', exact: true}).click();
  const views = () => page.evaluate(() => (window.dataLayer || []).filter(entry => entry[0] === 'event' && entry[1] === 'page_view').map(entry => entry[2]));
  await expect.poll(views).toHaveLength(1);
  await page.locator('#nav-bio').click();
  await expect.poll(views).toHaveLength(2);
  expect((await views())[1].page_title).toBe('Biography | Samantha Fernando');
  await page.getByRole('link', {name: 'Privacy', exact: true}).click();
  await expect(page).toHaveURL(/\/privacy\/#cookie-settings$/);
  await expect.poll(views).toHaveLength(3);
  await page.getByRole('button', {name: 'Cookie preferences'}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Reject', exact: true}).click();
  const viewsBeforeWorks = (await views()).length;
  await page.locator('#nav-works').click();
  await expect(page.locator('#tab-works')).toBeVisible();
  expect(await views()).toHaveLength(viewsBeforeWorks);
});
