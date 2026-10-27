const { test, expect } = require('@playwright/test');
test('homepage performances are accessible, linked and responsive @mobile', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#performances')).toBeVisible();
  await expect(page.locator('#upcoming-performances')).toHaveText('Upcoming performances');
  await expect(page.locator('#performances .performance-list').first().locator('li')).toHaveCount(3);
  await expect(page.getByRole('link', {name:'Event details'})).toHaveCount(2);
  await page.getByText('Past performances', {exact:true}).click();
  await expect(page.getByRole('heading',{name:'Balconies',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Kinesphere',exact:true})).toBeVisible();
  await expect(page.getByRole('link', {name:'Event details'})).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('homepage performance section survives navigation and has no horizontal loss in either theme', async ({page}) => {
  await page.goto('/');
  await page.getByRole('link', {name:'Explore works',exact:true}).click();
  await page.locator('#nav-home').click();
  await expect(page.locator('#performances')).toBeVisible();
  for(const width of [320,768,1280]) {
    await page.setViewportSize({width,height:900});
    for(const light of [true,false]) {
      await page.evaluate(light=>document.body.classList.toggle('light-mode',light), light);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await expect(page.getByRole('heading',{name:'New work for Fretwork and Ruby Hughes'})).toBeVisible();
      await page.addStyleTag({content:'#performances {font-size:200%;} #performances h2, #performances h3, #performances h4, #performances p, #performances a, #performances summary {font-size:inherit;}'});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
});
