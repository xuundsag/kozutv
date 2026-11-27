// The same app.js in a normal browser: no bridges exist, so everything must go
// over plain fetch and the Discord card must be the web one.
import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto('http://127.0.0.1:3999/',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForSelector('.card',{timeout:20000}).catch(()=>{});
console.log('web cards      :', await p.locator('.card').count());
console.log('web footer     :', await p.locator('footer').count());
await p.goto('http://127.0.0.1:3999/settings',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2500);
console.log('web discord    :', (await p.locator('#discord-body').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,70));
console.log('web errors     :', errs.length, errs.slice(0,2));
await b.close();
