// Mobile look-check: header layout, drop-down, loading plate, downloads screen.
import { chromium } from 'playwright';
const BASE=process.env.BASE||'http://127.0.0.1:8777';
const shots=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
  userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
 const page=await ctx.newPage();
 const errs=[];page.on('pageerror',e=>errs.push(String(e)));
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('.card',{timeout:60000});
 await page.waitForTimeout(1200);
 shots.push(['home',await page.screenshot({path:'/tmp/m-home.png'})]);
 // header geometry on a phone
 const geo=await page.evaluate(()=>{
  const r=s=>{const n=document.querySelector(s);const b=n?.getBoundingClientRect();return b?{l:Math.round(b.left),r:Math.round(b.right),t:Math.round(b.top),w:Math.round(b.width)}:null};
  return {brand:r('.brand'),search:r('.searchbox'),drop:r('.menu-drop-toggle'),vw:innerWidth,hamburger:Boolean(document.querySelector('.menu-toggle'))};
 });
 console.log('HEADER',JSON.stringify(geo));
 await page.click('.menu-drop-toggle');
 await page.waitForTimeout(250);
 const menu=await page.evaluate(()=>{
  const p=document.querySelector('#menu-drop-panel');const b=p.getBoundingClientRect();
  return {left:Math.round(b.left),right:Math.round(b.right),top:Math.round(b.top),vw:innerWidth,items:[...p.querySelectorAll('a')].map(a=>a.textContent.trim())};
 });
 console.log('MENU',JSON.stringify(menu));
 await page.screenshot({path:'/tmp/m-menu.png'});
 await page.keyboard.press('Escape');
 // the app build: a fresh context, with the bridge present before the page runs
 const appCtx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
  userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
 await appCtx.addInitScript(()=>{
  window.kozutvDownloads={list:()=>JSON.stringify([
   {id:'anime-57334-1-1-sub',type:'anime',title:'Dandadan',poster:'/images/spotlight/anime-21.jpg',episode:1,season:1,state:'ready',progress:1,bytes:73400320,sizeText:'70 MB',savedAt:Date.now(),tracks:[{label:'English'}],lang:'sub'},
   {id:'anime-57334-1-2-sub',type:'anime',title:'Dandadan',poster:'/images/spotlight/anime-21.jpg',episode:2,season:1,state:'downloading',progress:0.42,bytes:20971520,sizeText:'20 MB',savedAt:Date.now()-1000,lang:'sub'}
  ]),start:()=>JSON.stringify({ok:true}),remove:()=>JSON.stringify({ok:true}),clear:()=>JSON.stringify({ok:true}),usedBytes:()=>94371840};
 });
 await appCtx.addInitScript(()=>{
 window.kozutvDownloads={list:()=>JSON.stringify([
  {id:'anime-57334-1-1-sub',type:'anime',title:'Dandadan',poster:'/images/spotlight/anime-21.jpg',episode:1,season:1,state:'ready',progress:1,bytes:73400320,sizeText:'70 MB',savedAt:Date.now()-2000,tracks:[{label:'English'}],lang:'sub'},
  {id:'anime-57334-1-2-sub',type:'anime',title:'Dandadan',poster:'/images/spotlight/anime-21.jpg',episode:2,season:1,state:'downloading',progress:0.42,bytes:20971520,sizeText:'20 MB',savedAt:Date.now()-1000,lang:'sub'}
 ]),start:()=>JSON.stringify({ok:true}),remove:()=>JSON.stringify({ok:true}),clear:()=>JSON.stringify({ok:true}),usedBytes:()=>94371840};
});
const page2=await appCtx.newPage();
 const errs2=[];page2.on('pageerror',e=>errs2.push(String(e)));
 await page2.goto(BASE+'/downloads',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(1500);
 const cards=await page2.locator('.dl-card').count();
 console.log('DOWNLOAD CARDS',cards);
 await page2.screenshot({path:'/tmp/m-downloads.png',fullPage:false});
 await page2.click('.menu-drop-toggle');await page2.waitForTimeout(200);
 console.log('APP MENU',JSON.stringify(await page2.evaluate(()=>[...document.querySelectorAll('#menu-drop-panel a')].map(a=>a.textContent.trim()))));
 await page2.screenshot({path:'/tmp/m-menu-app.png'});
 await page2.keyboard.press('Escape');
 // watch screen with the player button
 await page2.goto(BASE+'/watch/anime/57334?episode=1&lang=sub',{waitUntil:'domcontentloaded',timeout:60000});
 await page2.waitForTimeout(5000);
 const btn=await page2.evaluate(()=>{const b=document.querySelector('.mp-download-button');return b?{vis:b.offsetParent!==null,saved:b.classList.contains('is-saved')}:null});
 console.log('PLAYER BUTTON',JSON.stringify(btn));
 await page2.screenshot({path:'/tmp/m-watch.png'});
 console.log('APP ERRORS',errs2.length,errs2.slice(0,2).join(' | '));
 // a slow answer must show only the spinner on black
 await page.route('**/api/genre**',async r=>{await new Promise(x=>setTimeout(x,3500));return r.continue()});
 await page2.goto(BASE+'/browse?genre=Action',{waitUntil:'domcontentloaded',timeout:60000});
 await page2.waitForTimeout(450);
 const plate=await page2.evaluate(()=>{
  const el=document.querySelector('#app .loading');
  if(!el)return null;
  const b=el.getBoundingClientRect();
  return {bg:getComputedStyle(el).backgroundColor,h:Math.round(b.height),spinner:getComputedStyle(el,'::before').borderTopColor};
 });
 console.log('LOADING PLATE',JSON.stringify(plate));
 await page2.screenshot({path:'/tmp/m-loading.png'});
 await appCtx.close();await ctx.close();
 console.log('PAGE ERRORS',errs.length,errs.slice(0,2).join(' | '));
 await browser.close();
})().catch(e=>{console.log('FAIL '+e);process.exit(1)});
