import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
const netCalls=[];
await p.route('https://kozutv.local/**', async r=>{
  const u=new URL(r.request().url()), pt=u.pathname;
  if(pt.startsWith('/api/')){const n=pt.slice(5).replace(/\/+$/,'');
    const f=path.join(SITE,'api',n.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json');
    return fs.existsSync(f)?r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(f)})
      :r.fulfill({status:200,contentType:'application/json',body:'{"offline":true,"items":[],"entries":[]}'});}
  let f=path.join(SITE,pt==='/'?'index.html':pt.slice(1));
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())f=path.join(SITE,'index.html');
  const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return r.fulfill({status:200,contentType:m[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});
// the WebView path: real requests, proxied to the local server
await p.route('https://kozutv.bond/**', async r=>{
  const url=new URL(r.request().url()); netCalls.push(url.pathname);
  try{
    const res=await fetch('http://127.0.0.1:3999'+url.pathname+url.search,{method:r.request().method()});
    return r.fulfill({status:res.status,contentType:'application/json',body:Buffer.from(await res.arrayBuffer())});
  }catch{ return r.abort('failed') }
});
// bridge present but never answers
await ctx.addInitScript(()=>{
  window.kozutvAndroid={publish:()=>true,clear:()=>{},status:()=>JSON.stringify({version:'2.0.6',discord:true,platform:'android'})};
  window.kozutvHttp={request(){return 1;}};
});
const t0=Date.now();
await p.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.card',{timeout:20000}).catch(()=>{});
console.log('cards        :', await p.locator('.card').count());
console.log('first card   :', (Date.now()-t0)+'ms');
console.log('error panel  :', await p.locator('.empty h2').first().textContent().catch(()=>null));
console.log('net calls    :', netCalls.length, [...new Set(netCalls)].slice(0,4).join(', '));
console.log('errors       :', errs.length, errs.slice(0,2));
await b.close();
