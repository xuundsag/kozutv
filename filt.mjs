import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
// same mock as the failing test
const item={id:'424242',type:'anime',title:'Test Anime',poster:'/images/spotlight/anime-21.jpg',genres:['Action'],episodes:3};
const items=[item];
await ctx.route('**/api/**',async r=>{const u=new URL(r.request().url());
 if(u.pathname==='/api/browse')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items,spotlight:items})});
 if(u.pathname==='/api/state')return r.fulfill({status:200,contentType:'application/json',body:'{"watchlist":[],"history":[]}'});
 return r.continue();});
const p=await ctx.newPage();
await p.goto('http://127.0.0.1:3999/filters',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(3000);
console.log('form:',await p.locator('form[data-filters]').count());
console.log('main:',(await p.evaluate(()=>document.querySelector('main')?.innerText?.slice(0,100)||'(none)')).replace(/\s+/g,' '));
await b.close();
