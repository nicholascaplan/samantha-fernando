const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
for(const light of [true,false])test(`performances have unique landmarks and ordered headings in ${light?'light':'dark'}`,async({page})=>{
 await page.goto('/');await page.evaluate(light=>document.body.classList.toggle('light-mode',light),light);
 await page.locator('.past-performances summary').click();await expect(page.locator('#performances').getByRole('heading',{name:'Wintering',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Upcoming performances',exact:true})).toHaveCount(1);
 expect(await page.locator('#performances h2,#performances h3,#performances h4').evaluateAll(es=>es.map(e=>e.tagName))).not.toContain('H4');
 const results=await new AxeBuilder({page}).include('#performances').withRules(['landmark-unique','heading-order']).analyze();expect(results.violations).toEqual([]);
});
