import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';
const SITE='/home/user/android/kozuTV-app/app/src/main/assets/site';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
let serveApi=true;
await p.route('http://offline.local/**', async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/')) {
    if(!serveApi) return route.abort('failed');           // nothing answers /api/*
    const n=u.pathname.replace(/^\/api\//,'').replace(/\/$/,'').replace(/\//g,'_');
    const f=path.join(SITE,'api',n+'.json');
    if(!fs.existsSync(f)) return route.abort('failed');
    return route.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(f)});
  }
  let f=path.join(SITE,u.pathname==='/'?'/index.html':u.pathname);
  if(!fs.existsSync(f)||!fs.statSync(f).isFile()) f=path.join(SITE,'index.html');
  const t={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return route.fulfill({status:200,contentType:t[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});
const errors=[]; p.on('pageerror',e=>errors.push(String(e).slice(0,100)));
// Online-ish first load, seed a watchlist entry the way the app does
await p.goto('http://offline.local/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);
await p.evaluate(()=>localStorage.setItem('kozutv-state-cache',JSON.stringify({watchlist:[{id:'farzi',title:'Farzi'}],history:[{id:'farzi',title:'Farzi',progress:0.4}]})));
// Now go fully offline and reload: the saved library must survive
serveApi=false;
await p.reload({waitUntil:'domcontentloaded'});
await p.waitForTimeout(2200);
const after=await p.evaluate(()=>JSON.parse(localStorage.getItem('kozutv-state-cache')||'{}'));
console.log('cards:', await p.locator('.card').count());
console.log('watchlist preserved:', JSON.stringify(after.watchlist));
console.log('history preserved:', after.history?.length);
console.log('page errors:', errors.length, errors.slice(0,2));
await b.close();
