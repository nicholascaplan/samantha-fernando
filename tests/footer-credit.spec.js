const {test,expect}=require('@playwright/test');
test('footer credits Nick at the verified Websites by Nick destination',async({page})=>{
  await page.goto('/');
  const credit=page.locator('footer').getByRole('link',{name:'Nick',exact:false});
  await expect(credit).toHaveAttribute('href','https://websitesbynick.co.uk/');
  await expect(credit).toHaveAttribute('target','_blank');
  await expect(credit).toHaveAttribute('rel','noopener');
  await expect(page.locator('footer')).toContainText('Made with');
});
