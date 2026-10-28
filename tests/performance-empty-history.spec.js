const {test,expect}=require('@playwright/test');
test('future-only snapshot has a readable empty past state and no redundant disclosure',async({page})=>{
 const {renderPerformances}=await import('../scripts/lib/performances.mjs');
 const html=renderPerformances([{title:'Future work',dateLabel:'May 2027',startDate:'2027-05-01',description:'Details soon.'}],'2026-10-27');
 await page.route('http://127.0.0.1:8010/',async route=>{const response=await route.fetch();const body=(await response.text()).replace(/<section id="performances"[\s\S]*?<\/details>\s*<\/section>\s*<\/section>/,()=>html);await route.fulfill({response,body});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByText('No past performances are listed.',{exact:true})).toBeVisible();
 await expect(page.locator('.past-performances')).toHaveCount(0);expect(errors).toEqual([]);
});
