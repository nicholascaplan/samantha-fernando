const {test,expect}=require('@playwright/test');
test('history motion initialises once after enhanced navigation and catalogue entry',async({page})=>{
 for(const entry of ['/','/works/']){
  await page.goto(entry);if(entry==='/')await page.getByRole('link',{name:'Explore works',exact:true}).click();
  for(let n=0;n<2;n++){
   await page.locator('#nav-home').click();const details=page.locator('.past-performances'),summary=details.locator('summary');
   expect(await summary.evaluate(e=>{e.click();return e.parentElement.getAnimations().length})).toBe(1);
   await expect.poll(()=>details.evaluate(e=>e.getAnimations().length)).toBe(0);await expect(details).toHaveAttribute('open','');
   expect(await summary.evaluate(e=>{e.click();return e.parentElement.getAnimations().length})).toBe(1);
   await expect(details).not.toHaveAttribute('open');await page.getByRole('link',{name:'Explore works',exact:true}).click();
  }
 }
});
