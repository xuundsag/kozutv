// The app's native proxy: kozutv.local/api/* is answered by AssetServer.proxy
// from the live server. Browser fetch to the real host is blocked entirely,
// which is what a CORS-less deployment looks like.
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
const proxied=[];
await p.route('https://kozutv.local/**', async r=>{
  const u=new URL(r.request().url()), pt=u.pathname;
  console.log('REQ',pt); if(pt.startsWith('/api/')){
    proxied.push(pt);
    let res;
    try{ res=await fetch('http://127.0.0.1:3999'+pt+(u.search||''),{headers:{'accept-encoding':'identity'}}); }catch(e){ console.log('PROXY FAIL',pt,e.message); return r.abort('failed'); }
    if(!res.ok){ console.log('PROXY',pt,res.status); return r.abort('failed'); }
    const body=Buffer.from(await res.arrayBuffer());
    return r.fulfill({status:200,contentType:'application/json',body});
  }
  let f=path.join(SITE,pt==='/'?'index.html':pt.slice(1));
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())f=path.join(SITE,'index.html');
  const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return r.fulfill({status:200,contentType:m[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});
await ctx.addInitScript(()=>{
  window.kozutvAndroid={publish:()=>true,clear:()=>{},status:()=>JSON.stringify({version:'2.0.6',discord:true,platform:'android'})};
  window.kozutvHttp={request(){return 1;}};   // bridge still dead, proves it is unused
});
const t0=Date.now();
await p.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.card',{timeout:20000}).catch(()=>{});
console.log('cards       :', await p.locator('.card').count());
console.log('first card  :', (Date.now()-t0)+'ms');
console.log('error panel :', await p.locator('.empty h2').first().textContent().catch(()=>null));
await p.evaluate(()=>{location.hash='#/search?q=farzi'});
await p.waitForTimeout(3000);
console.log('search      :', await p.locator('.card').count(), 'results');
console.log('proxied     :', proxied.length, [...new Set(proxied)].slice(0,4).join(', '));
console.log('errors      :', errs.length, errs.slice(0,2));
await b.close();
