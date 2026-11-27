// Simulates the APK exactly: page on https://kozutv.local, browser fetch to the
// server hard-blocked (no CORS), and a mock of the native bridge that performs
// the request instead - the way HttpBridge does on a real phone.
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';

const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const SERVER='http://127.0.0.1:3999';
const bridgeCalls=[];

const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(String(e).slice(0,150)));

// --- the bundle ---
await page.route('https://kozutv.local/**', async r=>{
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

// --- CORS-less server: the browser is NOT allowed to read these ---
await page.route('https://kozutv.bond/**', r=>r.abort('failed'));

// --- the native bridge mock (replaces window.kozutvHttp) ---
await ctx.addInitScript(()=>{
  window.__pending=new Map(); let next=1;
  // both bridges, as MainActivity registers them
  window.kozutvAndroid={publish:()=>true,clear:()=>{},status:()=>JSON.stringify({state:'live',reason:'',discord:true,version:'2.0.3',platform:'android'})};
  window.kozutvHttp={request(method,url,body,headersJson){
    const ticket=next++;
    window.__nativeFetch(ticket,method,url,body,headersJson);
    return ticket;
  }};
  window.kozutvHttpResolve=(ticket,json)=>{
    const cb=window.__pending.get(ticket); if(!cb)return; window.__pending.delete(ticket); cb(JSON.parse(json));
  };
});
await page.exposeFunction('__nativeFetch', async (ticket, method, url, body, headersJson) => {
  bridgeCalls.push(method+' '+new URL(url).pathname);
  const res=await fetch(url,{method,headers:{'content-type':'application/json','x-kozutv-device':'cccccccccccccccccccccccccccccccc'},body:body||undefined});
  const text=await res.text();
  await page.evaluate(([t,payload])=>window.kozutvHttpResolve(t,payload),
    [ticket, JSON.stringify({status:res.status,ok:res.ok,body:text,contentType:res.headers.get('content-type')||''})]);
});

await page.goto('https://kozutv.local/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(3500);
console.log('cards           :', await page.locator('.card').count());
console.log('error panel     :', await page.locator('.empty h2').first().textContent().catch(()=>null));
console.log('bridge calls    :', bridgeCalls.length, '->', [...new Set(bridgeCalls)].slice(0,6).join(', '));

// search must work through the bridge
await page.evaluate(()=>{location.hash='#/search?q=farzi'});
await page.waitForTimeout(3500);
console.log('search results  :', await page.locator('.card').count());

// Discord card must render the switch, not "unavailable"
await page.evaluate(()=>{location.hash='#/settings'});
await page.waitForTimeout(2500);
const discordText=await page.locator('#discord-body').innerText().catch(()=>'(no card)');
console.log('discord card    :', discordText.replace(/\s+/g,' ').slice(0,90));
console.log('errors          :', errors.length, errors.slice(0,2));
await b.close();
