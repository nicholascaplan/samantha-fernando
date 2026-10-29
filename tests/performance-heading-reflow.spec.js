const {test,expect}=require('@playwright/test');
for(const width of [320,390,1440]) for(const theme of ['light','dark']) {
 test(`performance words reflow intact ${width}px ${theme}${width<768?' @mobile':''}`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
  await page.goto('/');
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  const heading=page.locator('#past-performances-title');
  const normal=await heading.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  for(const scale of [1,2]) {
   await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale);
   expect(await heading.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(normal*scale);
   await expect(page.locator('.recent-past-performances > li')).toHaveCount(2);
   const details=page.locator('.past-performances');
   await details.locator('summary').click();
   await expect(details.getByRole('heading',{name:'Wintering',exact:true})).toBeVisible();
   const splitWords=await page.locator('.performances-groups h2,.performance-entry h3').evaluateAll(es=>es.flatMap(e=>{
    const split=[],walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
     const node=walker.currentNode;
     for(const word of node.textContent.matchAll(/\S+/g)) {
      const range=new Range();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
      const lines=new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top)));
      if(lines.size>1)split.push({heading:e.textContent,word:word[0]});
     }
    }
    return split;
   }));
   expect(splitWords).toEqual([]);
   expect(await page.locator('.performance-entry').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth))).toBe(true);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect.poll(()=>details.evaluate(e=>e.getAnimations().length)).toBe(0);
   await details.locator('summary').click();
   await expect(details).not.toHaveAttribute('open');
   await expect.poll(()=>details.evaluate(e=>e.getAnimations().length)).toBe(0);
  }
 });
}
