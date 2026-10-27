const {test,expect}=require('@playwright/test');
test('future-only snapshot opens and closes readable empty history without errors',async({page})=>{
 const {renderPerformances}=await import('../scripts/lib/performances.mjs');
 const html=renderPerformances([{title:'Future work',dateLabel:'May 2027',startDate:'2027-05-01',description:'Details soon.'}],'2026-10-27');
 await page.route('http://127.0.0.1:8010/',async route=>{const response=await route.fetch();const body=(await response.text()).replace(/<section id="performances"[\s\S]*?<\/details>\s*<\/section>/,html);await route.fulfill({response,body});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const details=page.locator('.past-performances'),summary=details.locator('summary');
 for(const reduced of ['no-preference','reduce']){
  await page.emulateMedia({reducedMotion:reduced});await summary.click();
  await expect.poll(()=>details.evaluate(e=>e.getAnimations().length)).toBe(0);
  const empty=details.getByText('No past performances are listed.',{exact:true});await expect(empty).toBeVisible();
  expect(await empty.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('details').getBoundingClientRect();return r.bottom<=p.bottom+1})).toBeTruthy();
  await summary.click();await expect(details).not.toHaveAttribute('open');
 }
 expect(errors).toEqual([]);
});
