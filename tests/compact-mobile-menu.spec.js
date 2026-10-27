const {test,expect}=require('@playwright/test');
for(const light of [true,false])test(`compact menu retains tap targets and dismisses without clickthrough ${light?'light':'dark'} @mobile`,async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Reject',exact:true}).click();await page.evaluate(l=>document.body.classList.toggle('light-mode',l),light);
 const toggle=page.locator('#mobileMenuToggle'),menu=page.locator('#mobileMenu');await toggle.click();
 const sizes=await menu.locator('a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));for(const h of sizes)expect(h).toBeGreaterThanOrEqual(44);
 expect((await menu.boundingBox()).height).toBeLessThan(500);
 await page.evaluate(()=>{window.outsideActivated=false;const a=document.createElement('a');a.id='outside-probe';a.href='/contact/';a.style.cssText='position:fixed;bottom:0;left:0;width:100%;height:90px;z-index:30';a.textContent='Outside action';a.addEventListener('click',()=>window.outsideActivated=true);document.body.append(a)});
 await page.touchscreen.tap(100,await page.evaluate(()=>innerHeight-40));await expect(menu).toBeHidden();expect(await page.evaluate(()=>window.outsideActivated)).toBe(false);await expect(page).toHaveURL(/\/$/);await expect(toggle).toBeFocused();
 await toggle.click();await page.locator('#themeToggleBtn').click();await expect(menu).toBeVisible();await page.locator('[data-mobile-nav="works"]').click();await expect(page).toHaveURL(/\/works\/$/);await expect(menu).toBeHidden();await expect(page.locator('#mobileMenuBackdrop')).toBeHidden();
 await page.evaluate(()=>document.documentElement.style.fontSize='32px');await toggle.click();await menu.getByRole('link',{name:/on SoundCloud/}).scrollIntoViewIfNeeded();await expect(menu.getByRole('link',{name:/on SoundCloud/})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
