// V5.4.28 UI checks: black loading, right-hand drop-down, no website Discord,
// languages only when available, and app-only Downloads. Runs the real server
// with mocked catalogue answers, in Chromium.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'kozutv-5428-'));
const excluded=new Set(['states.json','user.json','cache-token.key','cache-tokens.json']);
fs.cpSync(path.join(root,'public'),path.join(work,'public'),{recursive:true});
fs.cpSync(path.join(root,'data'),path.join(work,'data'),{recursive:true,filter:src=>!excluded.has(path.basename(src))&&!src.endsWith('.tmp')});
const allocator=net.createServer();
await new Promise((resolve,reject)=>{allocator.once('error',reject);allocator.listen(0,'127.0.0.1',resolve)});
const port=allocator.address().port;await new Promise(resolve=>allocator.close(resolve));
const BASE=`http://127.0.0.1:${port}`;
let child=null,browser=null,log='';
function check(name,ok,extra=''){console.log((ok?'PASS ':'FAIL ')+name+(extra?' — '+extra:''));if(!ok)process.exitCode=1}
function json(route,body){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})}
const still='/images/spotlight/anime-21.jpg';
const item={id:'424242',type:'anime',title:'Test Anime',description:'Test description',poster:still,backdrop:still,genres:['Action'],episodes:3,sub:true,dub:true,anilistId:'1'};
const items=[item,{...item,id:'424243',title:'Second Title'},{...item,id:'424244',title:'Third Title'}];
try {
 child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:work,env:{...process.env,PORT:String(port),NVIDIA_API_KEY:'',NVIDIA_API_KEY_FILE:path.join(work,'no-ai-key')},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>{log+=d.toString()});child.stderr.on('data',d=>{log+=d.toString()});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('server did not start: '+log)),20000);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.stdout.on('data',()=>{if(log.includes('listening on')){clearTimeout(timer);resolve()}});
 });
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1280,height:820}});
 // ---- catalogue, with a slow browse so the loading state is observable ----
 let browseDelay=0;
 await context.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  const p=u.pathname;
  if(p==='/api/browse'||p==='/api/search-all'||p==='/api/genre'||p==='/api/collection'){
   if(browseDelay)await new Promise(r=>setTimeout(r,browseDelay));
   return json(route,{items,spotlight:[item],suggestions:[]});
  }
  if(p==='/api/state')return json(route,{watchlist:[],history:[]});
  if(p==='/api/detail')return json(route,{item,seasons:[{number:1,name:'Season 1',episodes:3}],episodes:[{number:1,title:'One'},{number:2,title:'Two'}]});
  if(p==='/api/anime-episodes')return json(route,{episodes:[{number:1,title:'One'},{number:2,title:'Two'}],seasons:[],total:2});
  if(p==='/api/play')return json(route,{src:'/api/media?u=x',type:'application/x-mpegURL',provider:'MegaPlay',sourceKey:'megaplay',server:'Japanese',activeLang:'sub',allowSub:true,allowDub:true,availableLangs:['sub','dub','hi'],tracks:[],regionalStreams:[],qualityStreams:[],intro:null,outro:null});
  if(p==='/api/anime-audio')return json(route,{streams:[],availableLangs:['sub','dub','hi']});
  if(p==='/api/img')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'});
  return json(route,{});
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded'});

 // 1. the loading plate is black, not grey
 browseDelay=2500;
 await page.goto(BASE+'/browse?genre=Action',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(400);
 const plate=await page.evaluate(()=>{
  const el=document.querySelector('#app .loading');
  if(!el)return {found:false};
  const bg=getComputedStyle(el).backgroundColor;
  const before=getComputedStyle(el,'::before');
  return {found:true,bg,spinner:before.borderTopColor,body:getComputedStyle(document.body).backgroundColor};
 });
 check('loading plate is pure black','t' + '' && plate.found && /rgba\(0, 0, 0, 0\)|rgb\(0, 0, 0\)/.test(plate.bg), `bg=${plate.bg}`);
 check('loading shows only the spinner', plate.spinner==='rgb(255, 115, 28)', `spinner=${plate.spinner}`);
 check('page background is black', plate.body==='rgb(0, 0, 0)', `body=${plate.body}`);
 await page.waitForTimeout(2600);

 // 2. header: no watchlist icon, drop-down on the right
 const header=await page.evaluate(()=>{
  const wl=document.querySelector('.watchlist-link');
  const toggle=document.querySelector('.menu-drop-toggle');
  const search=document.querySelector('.searchbox');
  const brand=document.querySelector('.brand');
  const r=n=>n?n.getBoundingClientRect():null;
  return {watchlist:Boolean(wl),toggle:Boolean(toggle),
   toggleRight:r(toggle)?.right||0,searchRight:r(search)?.right||0,searchLeft:r(search)?.left||0,
   brandLeft:r(brand)?.left||0, innerRight:r(document.querySelector('.header-inner'))?.right||0};
 });
 check('watchlist icon removed from header', header.watchlist===false);
 check('drop-down toggle exists', header.toggle===true);
 check('drop-down sits to the right of the search box', header.toggleRight>header.searchRight-6, `${header.searchRight} -> ${header.toggleRight}`);
 check('brand is still on the left', header.brandLeft<header.searchLeft);

 await page.click('.menu-drop-toggle');
 await page.waitForTimeout(200);
 const menu=await page.evaluate(()=>{
  const panel=document.querySelector('#menu-drop-panel');
  const links=[...panel.querySelectorAll('a')].map(a=>a.textContent.trim());
  const r=panel.getBoundingClientRect();
  return {open:!panel.hidden,links,right:r.right,left:r.left,viewport:innerWidth};
 });
 check('menu opens with Watchlist inside', menu.open&&menu.links.includes('Watchlist'), menu.links.join(', '));
 check('menu does not offer a website Downloads screen', !menu.links.includes('Downloads'), menu.links.join(', '));
 check('menu is anchored to the right edge', Math.abs(menu.right-(menu.viewport-13))<40||menu.right>menu.viewport*0.6, `right=${Math.round(menu.right)} of ${menu.viewport}`);
 await page.screenshot({path:'/tmp/v5428-menu.png'});
 await page.keyboard.press('Escape');

 // 3. the website has no Discord card
 await page.goto(BASE+'/settings',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(900);
 const discord=await page.evaluate(()=>({card:Boolean(document.querySelector('.discord-card')),body:Boolean(document.querySelector('#discord-body'))}));
 check('website Settings has no Discord card', discord.card===false&&discord.body===false);

 // 4. downloads screen tells a browser the truth instead of failing
 await page.goto(BASE+'/downloads',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(700);
 const dl=await page.evaluate(()=>{
  const heading=document.querySelector('#app h1')?.textContent||'';
  const text=document.querySelector('#app .empty p')?.textContent||'';
  return {heading,text};
 });
 check('downloads screen explains it is app-only', dl.heading.includes('Downloads')&&/app/i.test(dl.text), dl.text.slice(0,60));

 // 5. the app build: bridge present -> Downloads menu entry + player button
 await page.addInitScript(()=>{
  window.kozutvDownloads={list:()=>JSON.stringify([]),start:()=>JSON.stringify({ok:true}),remove:()=>JSON.stringify({ok:true}),clear:()=>JSON.stringify({ok:true}),usedBytes:()=>0};
 });
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(600);
 await page.click('.menu-drop-toggle');
 await page.waitForTimeout(180);
 const menu2=await page.evaluate(()=>[...document.querySelectorAll('#menu-drop-panel a')].map(a=>a.textContent.trim()));
 check('app menu adds Downloads first', menu2[0]==='Downloads', menu2.join(', '));
 await page.goto(BASE+'/downloads',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(800);
 const dlApp=await page.evaluate(()=>({summary:Boolean(document.querySelector('.dl-summary')),empty:Boolean(document.querySelector('#app .empty'))}));
 check('app downloads screen renders its list state', dlApp.summary===true);

 // 6. player: the download button appears only with the bridge
 await page.goto(BASE+'/watch/anime/424242?episode=1&lang=sub',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(3500);
 const playerBtn=await page.evaluate(()=>{
  const b=document.querySelector('.mp-download-button');
  return {exists:Boolean(b),visible:b?b.offsetParent!==null:false};
 });
 check('player shows the download button inside the app', playerBtn.exists&&playerBtn.visible);
 // and the audio menu lists exactly the languages the stream declared
 const langRows=await page.evaluate(async()=>{
  const btn=document.querySelector('.mp-settings-button');if(!btn)return [];
  btn.click();await new Promise(r=>setTimeout(r,150));
  const audioTab=document.querySelector('.mp-tab[data-tab="audio"]');audioTab?.click();
  await new Promise(r=>setTimeout(r,150));
  return [...document.querySelectorAll('.mp-audio-list [data-audio-choice]')].map(b=>b.dataset.audioChoice);
 });
 check('audio menu lists exactly the declared languages', JSON.stringify(langRows)===JSON.stringify(['sub','dub','hi']), langRows.join(','));

 check('no page errors', errors.length===0, errors.slice(0,3).join(' | '));
 await page.screenshot({path:'/tmp/v5428-player.png'});
 await context.close();

 // 7. the browser build must not render the download button at all
 const plain=await browser.newContext({viewport:{width:1280,height:820}});
 await plain.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/play')return json(route,{src:'/api/media?u=x',type:'application/x-mpegURL',provider:'MegaPlay',sourceKey:'megaplay',server:'Japanese',activeLang:'sub',availableLangs:['sub'],tracks:[],regionalStreams:[],qualityStreams:[]});
  if(u.pathname==='/api/state')return json(route,{watchlist:[],history:[]});
  if(u.pathname==='/api/detail')return json(route,{item,seasons:[{number:1,name:'Season 1',episodes:3}],episodes:[{number:1,title:'One'}]});
  if(u.pathname==='/api/anime-episodes')return json(route,{episodes:[{number:1,title:'One'}],seasons:[],total:1});
  if(u.pathname==='/api/anime-audio')return json(route,{streams:[],availableLangs:['sub']});
  if(u.pathname==='/api/img')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'});
  return json(route,{items,spotlight:[item],suggestions:[]});
 });
 const web=await plain.newPage();
 await web.goto(BASE+'/watch/anime/424242?episode=1&lang=sub',{waitUntil:'domcontentloaded'});
 await web.waitForTimeout(2500);
 const webState=await web.evaluate(()=>({player:Boolean(document.querySelector('#player .video-js')),btn:Boolean(document.querySelector('.mp-download-button'))}));
 check('browser player loaded without a download button', webState.player&&webState.btn===false);
 await plain.close();
} catch (e) {
 console.log('FAIL harness — '+(e?.stack||e));
 process.exitCode=1;
} finally {
 try{await browser?.close()}catch{}
 try{child?.kill('SIGTERM')}catch{}
}
console.log(process.exitCode?'SOME CHECKS FAILED':'ALL V5.4.28 UI CHECKS PASSED');
