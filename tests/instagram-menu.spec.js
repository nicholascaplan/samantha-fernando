const{test,expect}=require('@playwright/test');
test('mobile menu includes labelled Instagram with safe destination and focus @mobile',async({page})=>{
 await page.goto('/');
 const reject=page.getByRole('button',{name:'Reject',exact:true});if(await reject.isVisible())await reject.click();
 for(const light of [true,false]){
  await page.evaluate(light=>document.body.classList.toggle('light-mode',light),light);
  await page.locator('#mobileMenuToggle').click();
  const link=page.locator('#mobileMenu').getByRole('link',{name:'Samantha Fernando on Instagram (opens in a new tab)',exact:true});
  await expect(link).toBeVisible();await expect(link).toHaveAttribute('href','https://www.instagram.com/_samfernando_/');
  await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await link.focus();await expect(link).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.locator('#mobileMenuToggle').click();await expect(link).toBeHidden();
 }
});
