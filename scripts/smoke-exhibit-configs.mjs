import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl=process.env.EXHIBIT_BASE_URL || 'http://127.0.0.1:5173/';
const inventory=JSON.parse(await fs.readFile(`${root}/scripts/exhibit-migrations.json`,'utf8'));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route('**/api/**',route=>route.request().method()==='GET' ? route.continue() : route.abort());
const results=[];
for (const job of inventory) {
  for (const version of ['2','3']) {
    const page=await context.newPage();
    const errors=[]; const failedResources=[]; let manifestResponses=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{
      if (response.url().endsWith(`/configs/${version==='2'?job.v2:job.v3}`) && response.ok()) manifestResponses++;
      if (response.status()>=400 && !response.url().includes('/api/')) failedResources.push({status:response.status(),url:response.url()});
    });
    const start=Date.now(); let ready=false; let failure;
    try {
      await page.goto(`${baseUrl}?configVersion=${version}#${job.slug}`,{waitUntil:'domcontentloaded'});
      await page.getByRole('dialog',{name:'How to move instructions'}).waitFor({timeout:45000});
      ready=true;
      await page.getByRole('button',{name:'Close help modal',exact:true}).click();
    } catch(error) { failure=error.message.slice(0,200); }
    const elapsed=Date.now()-start;
    const snapshot=await page.locator('body').ariaSnapshot();
    results.push({slug:job.slug,version,ready,elapsedMs:elapsed,manifestResponses,errors,failedResources,failure,dialogs:snapshot.split('\n').filter(line=>line.includes('dialog'))});
    console.log(`${job.slug} v${version}: ready=${ready}, ${elapsed}ms, config responses=${manifestResponses}, JS errors=${errors.length}`);
    await fs.writeFile(`${root}/docs/migrations/v3-browser-audit.json`,JSON.stringify({environment:'Chromium headless / desktop 1280x900 / software rendering; local Vite dev server',results},null,2)+'\n');
    await page.close();
  }
}
await browser.close();
