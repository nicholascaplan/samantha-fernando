const { test, expect } = require('@playwright/test');
test('homepage performances are accessible, linked and responsive @mobile', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#performances')).toBeVisible();
  await expect(page.locator('#performances-title')).toHaveText('Upcoming performances');
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

test('past performance disclosure shares theme focus and supports keyboard toggling', async ({page}) => {
  await page.goto('/');
  // Dismiss consent before checking the page's keyboard controls.
  const reject = page.getByRole('button', {name:'Reject',exact:true});
  if (await reject.isVisible()) await reject.click();
  const summary = page.locator('.past-performances summary');
  for (const light of [true,false]) {
    await page.evaluate(light=>document.body.classList.toggle('light-mode',light),light);
    await summary.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(summary).toBeFocused();
    expect(await summary.evaluate(el=>el.matches(':focus-visible'))).toBeTruthy();
    const focus = await summary.evaluate(el=>({width:getComputedStyle(el).outlineWidth,color:getComputedStyle(el).outlineColor,token:getComputedStyle(el).getPropertyValue('--color-focus').trim()}));
    expect(focus.width).toBe('3px');
    const tokenColor = await summary.evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--color-focus)';el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;});
    expect(focus.color).toBe(tokenColor);
    await expect(page.locator('.past-performances')).not.toHaveAttribute('open');
    await page.keyboard.press('Enter');
    await expect(page.locator('.past-performances')).toHaveAttribute('open','');
    await page.keyboard.press('Space');
    await expect(page.locator('.past-performances')).not.toHaveAttribute('open');
    if (test.info().project.name === 'chromium') {
      await summary.evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.screenshot({path:`/tmp/sam-focus-${light?'light':'dark'}.png`});
    }
  }
});

test('performance cards align and Wintering keeps every date and venue', async ({page}) => {
  await page.goto('/');
  const cards = page.locator('#performances .performance-list').first().locator(':scope > li');
  const boxes = await cards.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,height:r.height};}));
  expect(new Set(boxes.map(box=>Math.round(box.top))).size).toBe(1);
  expect(new Set(boxes.map(box=>Math.round(box.height))).size).toBe(1);
  await page.locator('.past-performances summary').click();
  await expect(page.locator('.performance-tour h4')).toHaveText('Wintering');
  await expect(page.locator('.performance-tour-stops > li')).toHaveCount(6);
  for (const venue of ['Bristol Beacon','Sir Jack Lyons','Tung Auditorium','Howard Assembly Room','Stoller Hall','Wigmore Hall']) await expect(page.locator('.performance-tour')).toContainText(venue);
  await expect(page.locator('.performance-tour')).toContainText('22 November 2025 · World Premiere');
});
