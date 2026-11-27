// Exactly what 2.0.6 does on a phone:
//   - page served from https://kozutv.local (the APK)
//   - /api/* READ  -> same-origin request, answered by the app's native proxy
//   - /api/* WRITE -> native bridge (cannot be proxied)
//   - any cross-origin fetch is blocked, as a CORS-less server would block it
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
p.on('console',m=>{const t=m.text();if(/blocked by CORS|Failed to fetch/.test(t))errs.push('CORS: '+t.slice(0,80))});
const proxied=[], bridged=[];
await p.route('https://kozutv.local/**', async r=>{
  const u=new URL(r.request().url()), pt=u.pathname;
  if(pt.startsWith('/api/')){
    proxied.push(pt);
    try{
      const res=await fetch('http://127.0.0.1:3999'+pt+(u.search||''),{headers:{'accept-encoding':'identity'},method:r.request().method()});
      if(!res.ok) return r.abort('failed');
      return r.fulfill({status:200,contentType:'application/json',body:Buffer.from(await res.arrayBuffer())});
    }catch{ return r.abort('failed') }
  }
  let f=path.join(SITE,pt==='/'?'index.html':pt.slice(1));
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())f=path.join(SITE,'index.html');
  const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return r.fulfill({status:200,contentType:m[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});
await p.route('https://kozutv.bond/**', r=>r.abort('failed'));   // cross-origin is dead
await ctx.addInitScript(()=>{
  window.kozutvAndroid={publish:()=>true,clear:()=>{},status:()=>JSON.stringify({version:'2.0.6',discord:true,platform:'android'})};
  window.__t=0; window.__pending=new Map();
  window.kozutvHttp={request(m,u,bo,h){
    const t=++window.__t; window.__nativeFetch(t,m,u,bo,h); return t;
  }};
});
await p.exposeFunction('__nativeFetch', async (t,m,u,bo,h)=>{
  bridged.push(m+' '+new URL(u).pathname);
  try{
    const res=await fetch('http://127.0.0.1:3999'+new URL(u).pathname+(new URL(u).search||'')+u.search,
      {method:m,headers:{'content-type':'application/json'},body:bo||undefined});
    const text=await res.text();
    // Mirror HttpBridge: evaluateJavascript with a JSON OBJECT literal
    await p.evaluate(([tk,obj])=>window.kozutvHttpResolve&&window.kozutvHttpResolve(tk,obj),
      [t,{status:res.status,ok:res.ok,body:text,contentType:'application/json'}]);
  }catch{
    await p.evaluate(([tk])=>window.kozutvHttpResolve&&window.kozutvHttpResolve(tk,{status:0,ok:false,body:''}),[t]);
  }
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
await p.evaluate(()=>{location.hash='#/watchlist'});
await p.waitForTimeout(2000);
console.log('watchlist   :', (await p.locator('h1').first().textContent().catch(()=>'?')), '| rows', await p.locator('.card').count());
console.log('proxied     :', proxied.length, [...new Set(proxied)].slice(0,5).join(', '));
console.log('bridged     :', bridged.length, [...new Set(bridged)].slice(0,3).join(', '));
console.log('errors      :', errs.length, errs.slice(0,2));
await b.close();
