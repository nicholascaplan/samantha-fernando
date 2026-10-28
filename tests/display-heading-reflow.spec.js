const {test,expect}=require('@playwright/test');
for(const width of [320,390,768,1440]) for(const theme of ['light','dark']) for(const [route,label] of [['/','Featured Operas & Major Projects'],['/works/','Works & Media'],['/listen/','Listen'],['/watch/','Watch'],['/writing/','Writing'],['/contact/','Contact & Score Hire'],['/privacy/','Privacy']]) {
 test(`display heading ${route} words intact ${width}px ${theme}${width<768?' @mobile':''}`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
  await page.goto(route);
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('body')).toHaveClass(theme==='light'?/light-mode/:/^(?!.*light-mode)/);
  await expect(page.locator('#themeToggleBtn')).toHaveAttribute('aria-pressed',String(theme==='dark'));
  const heading=page.locator('main :is(h1,h2).font-display');
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(label);
  for(const scale of [1,2]) {
   await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale);
   const actual=await heading.evaluate(e=>{
    const words=[],walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
     const node=walker.currentNode;
     for(const word of node.textContent.matchAll(/\S+/g)) {
      const range=new Range();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
      const lines=new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top)));
      if(lines.size>1)words.push(word[0]);
     }
    }
    const s=getComputedStyle(e);
    return {words,font:parseFloat(s.fontSize),family:s.fontFamily,transform:s.textTransform};
   });
   expect(actual.words).toEqual([]);
   expect(actual.font).toBe((width<768?22:30)*scale);
   expect(actual.family).toContain('Cinzel');
   expect(actual.transform).toBe('uppercase');
   expect(await heading.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 });
}
