const{test,expect}=require('@playwright/test');
for(const scale of[1,2])test(`short tablet menu last follow link fully reachable at ${scale*100}% text`,async({page})=>{
 await page.setViewportSize({width:768,height:600});await page.addInitScript(scale=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=`${16*scale}px`)},scale);await page.goto('/');await page.getByRole('button',{name:'Reject',exact:true}).click();await page.locator('#mobileMenuToggle').click();const link=page.locator('#mobileMenu').getByRole('link',{name:/on SoundCloud/});await link.scrollIntoViewIfNeeded();await expect(link).toBeInViewport({ratio:1});
 await page.setViewportSize({width:820,height:600});await link.scrollIntoViewIfNeeded();await expect(link).toBeInViewport({ratio:1});
});
