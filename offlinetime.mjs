import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
await p.route('https://kozutv.local/**', async r=>{
  const u=new URL(r.request().url()), pt=u.pathname;
  if(pt.startsWith('/api/')){const n=pt.slice(5).replace(/\/+$/,'');
    if(n==='state')return r.abort('failed');
    const f=path.join(SITE,'api',n.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json');
    return fs.existsSync(f)?r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(f)})
      :r.fulfill({status:200,contentType:'application/json',body:'{"offline":true,"items":[],"entries":[]}'});}
  let f=path.join(SITE,pt==='/'?'index.html':pt.slice(1));
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())f=path.join(SITE,'index.html');
  const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return r.fulfill({status:200,contentType:m[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});
await ctx.setOffline(true);           // airplane mode for real
const t0=Date.now();
await p.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.card',{timeout:15000}).catch(()=>{});
console.log('first card after :', (Date.now()-t0)+'ms');
console.log('cards            :', await p.locator('.card').count());
console.log('error panel      :', await p.locator('.empty h2').first().textContent().catch(()=>null));
await b.close();
