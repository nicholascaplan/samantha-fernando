const {test,expect}=require('@playwright/test');
for(const width of[390,1440])for(const light of[true,false])test(`history action clear and keyboard operable ${width} ${light}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.addInitScript(l=>localStorage.setItem('theme',l?'light':'dark'),light);await page.goto('/');await page.getByRole('button',{name:'Reject',exact:true}).click();
 const details=page.locator('.past-performances'),summary=details.locator('summary');await expect(summary.locator('.history-show')).toBeVisible();await expect(summary.locator('button')).toHaveCount(0);
 await summary.focus();await page.keyboard.press('Enter');await expect(summary.locator('.history-hide')).toBeVisible();await expect.poll(()=>details.evaluate(e=>e.getAnimations().length)).toBe(0);await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open');
 await page.evaluate(()=>document.documentElement.style.fontSize='32px');await expect(summary.locator('.history-show')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await summary.click();await expect(summary.locator('.history-hide')).toBeVisible();
});
