const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const pinId = process.env.PINTEREST_TEST_PIN || '849843392234259030';
  const output = path.resolve('tests/collector/pinterest_public_evidence',pinId); fs.mkdirSync(output,{recursive:true});
  const result = {startedAt:new Date().toISOString(),url:'https://www.pinterest.com/pin/'+pinId+'/',mode:'headless Chrome, fresh nonpersistent browser context, one navigation, no user profile',navigationError:null};
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    const page = await context.newPage();
    const failures=[];
    page.on('requestfailed', request => { if(request.isNavigationRequest()) failures.push({url:request.url(),error:request.failure()?.errorText}); });
    try {
      const response = await page.goto(result.url,{waitUntil:'domcontentloaded',timeout:25000});
      result.httpStatus=response?.status() ?? null;
      await page.waitForTimeout(2000);
    } catch (error) {result.navigationError=error.message;}
    result.navigationFailures=failures;
    result.finalUrl=page.url();
    result.dom=await page.evaluate(() => ({title:document.title,textExcerpt:document.body?.innerText.slice(0,1800),metadata:[...document.querySelectorAll('link[rel="canonical"],meta[property="og:url"],meta[property="og:image"]')].map(n=>({key:n.rel||n.getAttribute('property'),value:n.href||n.content})),imageCount:document.images.length,marked:[...document.querySelectorAll('[data-test-id="pin-closeup-image"],[data-test-id="closeup-image"],[data-test-id="pin-closeup-image-container"]')].flatMap(n=>n.tagName==='IMG'?[n]:[...n.querySelectorAll('img')]).map(n=>({src:n.src,srcset:n.srcset,currentSrc:n.currentSrc,width:n.naturalWidth,height:n.naturalHeight,closestPin:n.closest('a[href]')?.href||null})),jsonScriptCount:document.querySelectorAll('script[type="application/json"]').length}));
    result.matchingState=await page.evaluate(target => {
      const stack=[...document.querySelectorAll('script[type="application/json"]')].flatMap(n=>{try{return [JSON.parse(n.textContent)];}catch{return [];}}),found=[];
      let visits=0;
      while(stack.length&&visits++<12000){const value=stack.pop();if(!value||typeof value!=='object')continue;
        if(String(value.id||'')===target&&value.images){found.push({id:value.id,images:value.images,mediaFields:Object.fromEntries(['videos','video_list','story_pin_data','is_video','is_animated'].filter(key=>key in value).map(key=>[key,value[key]]))});}
        for(const child of Object.values(value))if(child&&typeof child==='object')stack.push(child);
      }
      return {visits,found};
    },pinId);
    await page.addScriptTag({path:path.resolve('source/extension/pinterest-identity.js')});
    await page.addScriptTag({path:path.resolve('source/extension/platforms.js')});
    result.extraction = await page.evaluate(() => {try {return {ok:true,payload:InspirationPlatforms.extract()};}catch(e){return {ok:false,error:e.message};}});
    if(result.extraction.ok && result.extraction.payload.images.length) {
      result.routeReplay = await page.evaluate(() => {
        const original=location.href;
        history.replaceState(history.state,'',location.pathname.replace(/\/$/,'')+'/visual-search/');
        try {return {method:'same loaded real DOM with local history route change, no second navigation',payload:InspirationPlatforms.extract()};}
        catch(e){return {error:e.message};}
        finally {history.replaceState(history.state,'',original);}
      });
    }
  } finally {await browser.close();result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));}
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
