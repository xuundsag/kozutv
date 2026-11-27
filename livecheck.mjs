// The app WITH signal: kozutv.local serves the bundle, kozutv.bond/api proxies
// to a real server. Catalogue must still render, and search must work - that
// is what a static-only bundle could never do.
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
const liveCalls=[];
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
await p.route('https://kozutv.bond/**', async r=>{
  const url=new URL(r.request().url());
  liveCalls.push(url.pathname+url.search);
  const target='http://127.0.0.1:3999'+url.pathname+url.search;
  const hdr={...(r.request().headers()),'x-kozutv-device':'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'};
  delete hdr.host; delete hdr.origin;
  try{
    const res=await fetch(target,{method:r.request().method(),headers:hdr,body:r.request().postDataBuffer()||undefined});
    const buf=Buffer.from(await res.arrayBuffer());
    return r.fulfill({status:res.status,headers:{'content-type':res.headers.get('content-type')||'application/json','access-control-allow-origin':'https://kozutv.local'},body:buf});
  }catch(e){return r.abort('failed')}
});
await p.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
console.log('cards          :', await p.locator('.card').count());
console.log('error panel    :', await p.locator('.empty h2').first().textContent().catch(()=>null));
// search only exists online
await p.evaluate(()=>{location.hash='#/search?q=farzi'});
await p.waitForTimeout(3000);
console.log('search results :', await p.locator('.card').count(), '| h1:', await p.locator('h1').first().textContent().catch(()=>null));
console.log('live calls made:', liveCalls.length, liveCalls.slice(0,4).join(' | '));
console.log('errors         :', errs.length, errs.slice(0,2));
await b.close();
