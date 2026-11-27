// The case the phone is actually in: the native bridge is present but every
// call fails (no signal, DNS, TLS, whatever). The app must still be usable.
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
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
await p.route('https://kozutv.bond/**', r=>r.abort('failed'));
// bridges present, but every request errors exactly as a dead network would
await ctx.addInitScript(()=>{
  window.kozutvAndroid={publish:()=>true,clear:()=>{},status:()=>JSON.stringify({state:'offline',reason:'',discord:true,version:'2.0.4',platform:'android',httpError:'UnknownHostException @ kozutv.bond: Unable to resolve host'})};
  window.__t=0;
  window.kozutvHttp={request(m,u,bo,h){const t=++window.__t;
    setTimeout(()=>window.kozutvHttpResolve&&window.kozutvHttpResolve(t,JSON.stringify({status:0,ok:false,body:'',error:'UnknownHostException'})),30);
    return t;}};
});
await p.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4000);
const cards=await p.locator('.card').count();
const rows=await p.locator('.category-unavailable').count();
console.log('cards rendered      :', cards);
console.log('dead category rows  :', rows, rows===0?'(none - good)':'<-- still broken');
await p.evaluate(()=>{location.hash='#/settings'});
await p.waitForTimeout(2500);
console.log('discord card        :', (await p.locator('#discord-body').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,60));
console.log('diagnostics         :', (await p.locator('#diag-line').innerText().catch(()=>'(none)')).replace(/\s+/g,' '));
console.log('errors              :', errs.length, errs.slice(0,2));
await b.close();
