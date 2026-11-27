import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
await p.route('http://offline.local/**', async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/')) return route.abort('failed');
  let file=u.pathname==='/'?'/index.html':u.pathname;
  let full=path.join(SITE,file);
  if(!fs.existsSync(full)||!fs.statSync(full).isFile()) full=path.join(SITE,'index.html');
  const ext=path.extname(full);
  const t={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return route.fulfill({status:200,contentType:t[ext]||'application/octet-stream',body:fs.readFileSync(full)});
});
const errors=[]; p.on('pageerror',e=>errors.push(String(e).slice(0,120)));
await p.goto('http://offline.local/index.html',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForTimeout(2200);
console.log('OFFLINE cards:', await p.locator('.card').count(), '| hero:', await p.locator('.hero h1').first().textContent().catch(()=>null), '| errors:', errors.length);
// second navigation must still work (this is what the consumed-stream bug broke)
await p.evaluate(()=>{location.hash='/browse/tv/289517'});
await p.waitForTimeout(1800);
console.log('AFTER ROUTE cards:', await p.locator('.card').count(), '| errors:', errors.length);
await b.close();
