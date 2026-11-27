// Browser regression checks run an isolated server with mocked catalog data.
// The small silent WebM fixture exercises the real Video.js player offline.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'kozutv-viewer-test-'));
const excluded=new Set(['states.json','user.json','cache-token.key','cache-tokens.json']);
fs.cpSync(path.join(root,'public'),path.join(work,'public'),{recursive:true});
fs.cpSync(path.join(root,'data'),path.join(work,'data'),{recursive:true,filter:src=>!excluded.has(path.basename(src))&&!src.endsWith('.tmp')});
const allocator=net.createServer();
await new Promise((resolve,reject)=>{allocator.once('error',reject);allocator.listen(0,'127.0.0.1',resolve)});
const port=allocator.address().port;await new Promise(resolve=>allocator.close(resolve));
const BASE=`http://127.0.0.1:${port}`;
let child=null,browser=null,log='';
try {
 child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:work,env:{...process.env,PORT:String(port),NVIDIA_API_KEY:'',NVIDIA_API_KEY_FILE:path.join(work,'no-ai-key')},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>{log+=d.toString()});child.stderr.on('data',d=>{log+=d.toString()});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Test server did not start: '+log)),20000);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('Test server exited '+code+': '+log))});
  child.stdout.on('data',()=>{if(log.includes('listening on')){clearTimeout(timer);resolve()}});
 });
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const testImage='/images/spotlight/anime-21.jpg';
const item={id:'424242',type:'anime',title:'Test Anime',description:'Test description',poster:testImage,backdrop:testImage,genres:['Action'],episodes:3,sub:true,dub:true,differentDubOrder:true};
const items=Array.from({length:4},(_,i)=>({...item,id:String(424242+i),title:`Test Anime ${i+1}`}));
const mediaPath=path.join(root,'scripts','fixtures','seek-test.webm');
function json(route,body){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})}
async function mockApi(context){
 await context.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/browse')return json(route,{items,spotlight:items.slice(0,3),suggestions:[]});
  if(u.pathname==='/api/genre'||u.pathname==='/api/collection')return json(route,{items,hasMore:false,totalResults:items.length,note:'Live Hindi dub was detected: legacy unwanted notice.'});
  if(u.pathname==='/api/detail')return json(route,{item:{...item,audioNote:'Regional dub was detected: legacy unwanted notice.'},seasons:[{id:item.id,name:'Season 1',episodes:3}],episodes:[]});
  if(u.pathname==='/api/anime-episodes')return json(route,{episodes:[1,2,3].map(number=>({number,title:`Episode ${number}`})),hasNext:false});
  if(u.pathname==='/api/anime-audio')return json(route,{streams:[]});
  if(u.pathname==='/api/play')return json(route,{src:'/__qa_test.webm',type:'video/webm',provider:'megaplay',activeLang:u.searchParams.get('lang')||'sub',allowSub:true,allowDub:true,regionalStreams:[],tracks:[]});
  return route.continue();
 });
 await context.route('**/__qa_test.webm',route=>route.fulfill({status:200,path:mediaPath,contentType:'video/webm',headers:{'Accept-Ranges':'bytes'}}));
}
async function ready(p,path='/settings'){
 await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:15000});
 await p.waitForSelector(path==='/settings'?'.settings-page':'#app > :not(.loading)',{timeout:15000});
}
async function toggle(p,key,value){
 const x=p.locator(`[data-site-pref="${key}"]`);assert.equal(await x.count(),1,key);
 if(await x.isChecked()!==value)await p.locator(`[data-site-pref="${key}"] + span`).click();
 assert.equal(await x.isChecked(),value,key);
}
async function loadVideo(p){
 await p.waitForFunction(()=>{const p=window.videojs?.getPlayer('kozutv-video');return p&&p.duration()>=170&&p.readyState()>=2&&p.megaUI},{timeout:15000});
 await p.waitForTimeout(350);
}
async function seekTo(p,v){
 await p.evaluate(v=>{const pl=window.videojs.getPlayer('kozutv-video');pl.pause();pl.currentTime(v)},v);
 await p.waitForFunction(v=>Math.abs(window.videojs.getPlayer('kozutv-video').currentTime()-v)<1.1,v,{timeout:5000});
}
async function expectTime(p,v){
 // The media element can join a seek late under load; poll generously and report
 // the actual time in the failure so a real regression is still obvious.
 let last=null;
 try{
  await p.waitForFunction(v=>Math.abs(window.videojs.getPlayer('kozutv-video').currentTime()-v)<1.1,v,{timeout:20000});
 }catch(e){
  last=await p.evaluate(()=>window.videojs.getPlayer('kozutv-video').currentTime()).catch(()=>null);
  throw Error(`expected ${v}s, media clock reported ${last}s`);
 }
}
const errors=[];
function watchErrors(p,label){p.on('pageerror',e=>errors.push(label+': '+String(e)))}
// Compact settings and menu on both desktop and narrow mobile.
 for(const width of [1440,390,320]){
  const c=await browser.newContext({viewport:{width,height:900}});await mockApi(c);const p=await c.newPage();watchErrors(p,'layout '+width);await ready(p);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width,'no overflow at '+width);
  assert.equal(await p.locator('.setting-row small,.setting-row p').count(),0,'no descriptions');
  const flags=['kozutv-resume-playback','kozutv-save-history','kozutv-spotlight-autoplay'];for(const f of flags)assert.equal(await p.locator(`[data-site-pref="${f}"]`).isChecked(),true,f);
  assert.equal(await p.locator('[data-site-pref="kozutv-reduce-motion"]').isChecked(),false);
  assert.equal(await p.locator('[data-site-pref="kozutv-seek-step"]').inputValue(),'10');
  const headerPaths=await p.locator('.settings-card-heading').evaluateAll(els=>els.map(el=>({text:el.innerText,svg:el.querySelector('svg').innerHTML,box:el.querySelector('svg').getAttribute('viewBox'),fill:el.querySelector('svg').getAttribute('fill')})));
  const heading=name=>headerPaths.find(x=>x.text===name);
  for(const name of ['Playback','Language & sources','Viewing & browsing']){
   const h=heading(name);assert(h,name+' heading exists');
   // Fluent solid glyph: 24px box, currentColor fill, a filled path, no strokes.
   assert.equal(h.box,'0 0 24 24',name+' uses the 24px Fluent grid');
   assert.equal(h.fill,'currentColor',name+' is a solid (filled) glyph');
   assert(/<path/.test(h.svg)&&!/stroke-width/.test(h.svg),name+' has no legacy stroke icon');
  }
  assert(heading('Playback').svg.includes('M2 8.25'),'playback keeps its Fluent player glyph');
  assert(heading('Language & sources').svg.includes('M12 2a10 10 0 0 1 10 10v7a3 3 0 0 1-3 3h-3'),'language uses the Fluent headphones glyph');
  // The left drawer stays gone. The header bookmark is gone too: Watchlist now
  // lives in the drop-down with everything else, and the space it used to take
  // belongs to the account control.
  assert.equal(await p.locator('.menu-toggle').count(),0,'left drawer is gone');
  assert.equal(await p.locator('.watchlist-link').count(),0,'header watchlist shortcut has been removed');
  assert.equal(await p.locator('#account-slot').count(),1,'the header account control occupies that space');
  await p.locator('.menu-toggle-nav').click();
  const dropRows=await p.locator('#menu-drop-panel a').allInnerTexts();
  assert(dropRows.includes('Watchlist'),'watchlist is in the drop-down');
  assert(!dropRows.includes('Downloads'),'a browser cannot download an episode');
  assert.equal(await p.locator('.menu-explore').count(),0);
  assert.equal(await p.locator('#genre-menu').count(),0);assert.equal(await p.locator('#main-menu').count(),0);
  // The filters page renders through the app shell, so the form appears a beat
 // after navigation; wait for its own form rather than a fixed selector race.
 // domcontentloaded, not load: poster images from the upstream CDN can stall the
 // load event for a long time on a slow link without affecting the form itself.
 await p.goto(BASE+'/filters',{waitUntil:'domcontentloaded',timeout:20000});
 // A client-side navigation keeps the previous page mounted for a moment, so wait
 // for the filters form itself, then for the genre select to be on screen.
 await p.locator('form[data-filters]').waitFor({state:'attached',timeout:20000});
 await p.locator('select[name=genre]').waitFor({state:'visible',timeout:20000});assert((await p.locator('select[name=genre] option').count())>10,'Advanced Filters keeps genres');
  await c.close();
 }
 console.log('PASS layout, defaults, distinct playback/headphone icons, menus at 1440/390/320');

 // No Cache Token anywhere: the card, its API and its script are gone, and the
 // preferences still persist on their own.
 const a=await browser.newContext({viewport:{width:1200,height:800}}),pa=await a.newPage();watchErrors(pa,'no-token');await ready(pa);
 assert.equal(await pa.locator('.cache-token-card').count(),0,'no Cache Token card');
 assert.equal(await pa.locator('#cache-token-input').count(),0,'no token field');
 assert.equal(await pa.locator('[data-token-generate]').count(),0,'no Generate Token button');
 const tokenStatus=await pa.evaluate(()=>fetch('/api/cache-token/status').then(r=>r.status).catch(()=>0));
 assert.equal(tokenStatus,404,'the token API is gone');
 await toggle(pa,'kozutv-resume-playback',false);await pa.locator('[data-site-pref="kozutv-seek-step"]').selectOption('15');
 await pa.reload();await pa.locator('[data-site-pref="kozutv-seek-step"]').waitFor({state:'visible',timeout:20000});
 assert.equal(await pa.locator('[data-site-pref="kozutv-resume-playback"]').isChecked(),false,'preference persists');
 assert.equal(await pa.locator('[data-site-pref="kozutv-seek-step"]').inputValue(),'15','select persists');
 // The AI Transcription switch exists and is the only AI wording on the page.
 const aiRow=pa.locator('.setting-row:has([data-site-pref="kozutv-ai-transcription"])');
 assert.equal(await aiRow.count(),1,'AI Transcription switch is present');
 assert.equal(await pa.locator('[data-site-pref="kozutv-ai-transcription"]').isChecked(),false,'it starts off (v8 requirement)');
 const settingsText=await pa.locator('.settings-page').innerText();
 assert((settingsText.match(/AI/g)||[]).length===1,'AI appears once — the switch, never a disclosure');
 await aiRow.locator('.site-switch').click();
 assert.equal(await pa.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),'true','the switch writes its preference');
 await aiRow.locator('.site-switch').click();
 assert.equal(await pa.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),'false','the switch turns it back off');
 await pa.locator('[data-reset-settings]').click();
 for(const k of ['kozutv-resume-playback','kozutv-save-history','kozutv-spotlight-autoplay','kozutv-reduce-motion','kozutv-seek-step','kozutv-ott-audio','kozutv-ai-transcription'])assert.equal(await pa.evaluate(k=>localStorage.getItem(k),k),null,'reset '+k);
 await a.close();
 console.log('PASS no Cache Token or Discord card, preferences persist, AI switch present with no disclosure');

 // Randomized Browse rows and both menu/dropdown exclusions.
 const cat=await browser.newContext({viewport:{width:1200,height:900}});await mockApi(cat);
 await cat.addInitScript(()=>{const f=window.setInterval;window.setInterval=function(cb,ms,...args){if(ms===6500)window.__testCarousel=cb;return f(cb,ms,...args)}});
 const pc=await cat.newPage();watchErrors(pc,'browse');await ready(pc,'/browse');await pc.waitForSelector('.hero');
 const firstTitle=await pc.locator('.hero:not(.hero-leaving) h1').innerText();await pc.evaluate(()=>window.__testCarousel());assert.notEqual(await pc.locator('.hero:not(.hero-leaving) h1').innerText(),firstTitle,'carousel advances');
 await pc.evaluate(()=>{localStorage.setItem('kozutv-spotlight-autoplay','false');window.dispatchEvent(new CustomEvent('kozutv-preferences-restored'))});
 const pausedTitle=await pc.locator('.hero:not(.hero-leaving) h1').innerText();await pc.evaluate(()=>window.__testCarousel());assert.equal(await pc.locator('.hero:not(.hero-leaving) h1').innerText(),pausedTitle,'carousel paused');
 assert(await pc.evaluate(()=>document.documentElement.classList.contains('spotlight-paused')));await pc.locator('.hero:not(.hero-leaving) .dots [data-slide="0"]').click();assert.equal(await pc.locator('.hero:not(.hero-leaving) h1').innerText(),firstTitle,'manual spotlight selection');
 for(let i=0;i<20;i++){
  const count=await pc.locator('#browse-categories > .category-row').count();if(count>=24)break;
  await pc.locator('#browse-sentinel').scrollIntoViewIfNeeded();await pc.waitForFunction(count=>document.querySelectorAll('#browse-categories > .category-row').length>count,count,{timeout:6000});
 }
 const rows=await pc.locator('#browse-categories > .category-row').evaluateAll(els=>els.slice(0,24).map(e=>({name:e.dataset.name,kind:e.dataset.kind})));
 assert.equal(rows.length,24);assert.equal(new Set(rows.map(x=>x.name)).size,24);
 for(const name of ['Hindi Dubbed','Tamil Dubbed','Telugu Dubbed','New in 2026']){
  assert(rows.some(r=>r.name===name&&r.kind==='collection'),name+' randomized row');
  const direct=pc.locator(`.category-row[data-name="${name}"]`);await direct.scrollIntoViewIfNeeded();await direct.locator('.category-heading').waitFor({timeout:5000});
  const href=await direct.locator('.category-title-link').getAttribute('href');assert.equal(new URL(href,BASE).searchParams.get('collection'),name);
  if(name.endsWith('Dubbed'))assert((await direct.locator('h2 svg').innerHTML()).includes('M12 2a10 10 0 0 1 10 10v7a3 3 0 0 1-3 3h-3'),'dub collections use the Fluent headphones glyph');
 }
 await pc.goto(BASE+'/browse?collection=Hindi%20Dubbed',{waitUntil:'domcontentloaded'});await pc.waitForSelector('h1.section-title');assert.equal(await pc.locator('h1.section-title').innerText(),'Hindi Dubbed');assert.equal(await pc.getByText(/legacy unwanted notice/i).count(),0);
 await pc.goto(BASE+'/browse/anime/424242',{waitUntil:'domcontentloaded'});await pc.waitForSelector('.detail');assert.equal(await pc.locator('.catalog-note').count(),0);assert.equal(await pc.getByText(/legacy unwanted notice/i).count(),0);
 await cat.close();console.log('PASS all 24 shuffled first-cycle rows, collection navigation/icons, no legacy notices, carousel and manual selection');

 // Different deterministic random streams must yield different first rows.
 async function seededRows(seed){
  const context=await browser.newContext({viewport:{width:1200,height:900}});await mockApi(context);
  await context.addInitScript(initial=>{let n=initial;Math.random=()=>((n=(1664525*n+1013904223)>>>0)/4294967296)},seed);
  const page=await context.newPage();await ready(page,'/browse');await page.waitForSelector('.category-row');
  const names=await page.locator('.category-row').evaluateAll(els=>els.slice(0,2).map(el=>el.dataset.name));await context.close();return names;
 }
 assert.notDeepEqual(await seededRows(23),await seededRows(1234),'Browse order changes with random input');
 // Empty categories eventually stop instead of repeatedly appending forever.
 const empty=await browser.newContext({viewport:{width:1200,height:900}});let emptyRequests=0;
 await empty.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/browse')return json(route,{items,spotlight:items.slice(0,3)});
  if(['/api/genre','/api/collection'].includes(u.pathname)){emptyRequests++;return json(route,{items:[]})}
  return route.continue();
 });
 const pe=await empty.newPage();await ready(pe,'/browse');await pe.waitForSelector('#browse-sentinel');
 for(let i=0;i<10;i++){if(await pe.locator('#browse-sentinel').textContent()==='You are all caught up.')break;await pe.locator('#browse-sentinel').scrollIntoViewIfNeeded();await pe.waitForTimeout(250)}
 await pe.waitForFunction(()=>document.querySelector('#browse-sentinel').textContent==='You are all caught up.',{timeout:6000});
 const stoppedAt=emptyRequests;await pe.waitForTimeout(500);assert.equal(emptyRequests,stoppedAt);assert(stoppedAt>=8&&stoppedAt<=24);await empty.close();
 console.log('PASS seeded shuffle and bounded empty-category exhaustion');

 // A real Video.js player with a local 180-second WebM exercises resume, keyboard,
 // pointer double-taps, history posts, episode changes and catalog warning.
 const c=await browser.newContext({viewport:{width:1200,height:900}});await mockApi(c);const p=await c.newPage();watchErrors(p,'player');let posts=0;
 p.on('request',r=>{if(r.url().includes('/api/history')&&r.method()==='POST')posts++});await ready(p);
 await toggle(p,'kozutv-autoplay',false);await toggle(p,'kozutv-save-history',false);await toggle(p,'kozutv-resume-playback',false);await toggle(p,'kozutv-reduce-motion',true);await p.locator('[data-site-pref="kozutv-seek-step"]').selectOption('15');
 await p.evaluate(async item=>fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...item,episode:1,season:1,currentTime:60,duration:180})}),item);posts=0;
 await ready(p,'/watch/anime/424242?episode=1&lang=sub');await loadVideo(p);assert.equal(await p.locator('.catalog-note').count(),0);assert.equal(await p.getByText(/legacy unwanted notice/i).count(),0);
 let time=await p.evaluate(()=>window.videojs.getPlayer('kozutv-video').currentTime());assert(time<2,'resume off should begin at zero, got '+time);
 // The heading is now the episode name below the player, so use the player
 // container itself to hand keyboard focus back.
 await seekTo(p,50);await p.locator('#player').click({position:{x:8,y:8}});await p.keyboard.press('ArrowRight');
 const seekInfo=await p.evaluate(()=>{const e=document.querySelector('.mp-tap-seek[data-side="right"]');return {text:e.textContent.trim(),opacity:getComputedStyle(e).opacity,animations:e.getAnimations().length, el:e.outerHTML,html:document.documentElement.className,animation:getComputedStyle(e).animationName}});assert.equal(seekInfo.text,'15s');assert.equal(seekInfo.opacity,'1');assert.equal(seekInfo.animations,0,'WAAPI seek animation disabled');await expectTime(p,65);
 await p.waitForTimeout(750);await seekTo(p,50);await p.keyboard.press('j');await expectTime(p,35);
 // Validate the other interval and fallback values with the actual player.
 await p.evaluate(()=>localStorage.setItem('kozutv-seek-step','5'));await p.waitForTimeout(750);await seekTo(p,50);await p.keyboard.press('l');await expectTime(p,55);
 await p.evaluate(()=>localStorage.setItem('kozutv-seek-step','bogus'));await p.waitForTimeout(750);await seekTo(p,50);await p.keyboard.press('l');await expectTime(p,60);
 await p.evaluate(()=>localStorage.setItem('kozutv-seek-step','15'));
 await p.waitForTimeout(750);await seekTo(p,50);const rect=await p.locator('#player .video-js').boundingBox();// The player treats two clicks inside 300 ms on the same side as a double tap,
 // so send them as two discrete pointer events and give the seek time to land.
 await p.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.5);
 for(let tap=0;tap<2;tap++){await p.mouse.down();await p.mouse.up();await p.waitForTimeout(70)}
 await expectTime(p,65);
 await p.evaluate(()=>{localStorage.setItem('kozutv-autonext','false');const pl=videojs.getPlayer('kozutv-video');pl.trigger('playing');pl.trigger('timeupdate');pl.trigger('ended')});await p.waitForTimeout(350);assert.equal(posts,0,'history disabled for player events');
 // This also exercises the old-episode snapshot path, which must not post.
 await p.evaluate(()=>videojs.getPlayer('kozutv-video').megaUI.showControls());await p.locator('.mp-next-ep').click({force:true});await p.waitForURL(/episode=2/);await loadVideo(p);await p.waitForTimeout(350);assert.equal(posts,0,'history disabled while switching episodes');
 let st=await p.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(st.history[0].currentTime,60);assert.equal(st.history[0].episode,1);
 let dialogs=0;p.on('dialog',async d=>{dialogs++;await d.dismiss()});await p.evaluate(()=>videojs.getPlayer('kozutv-video').megaUI.openSettings('audio'));await p.locator('[data-audio-choice="dub"]').click();await p.waitForURL(/episode=1&lang=dub/);await loadVideo(p);assert.equal(dialogs,0,'catalog switch is silent');assert.equal(await p.locator('.mp-notice:visible').count(),0);
 // Switch resume/history back on through the viewer settings, retaining the old 60-second position.
 await ready(p);await toggle(p,'kozutv-save-history',true);await toggle(p,'kozutv-resume-playback',true);
 await ready(p,'/watch/anime/424242?episode=1&lang=sub');await loadVideo(p);await p.waitForFunction(()=>videojs.getPlayer('kozutv-video').currentTime()>59,{timeout:5000});
 await p.evaluate(()=>videojs.getPlayer('kozutv-video').trigger('playing'));await p.waitForFunction(()=>true);await p.waitForTimeout(400);assert(posts>0,'history resumes writing when enabled');
 await c.close();console.log('PASS real player resume off/on, 15-second keyboard & double-click seeks, reduced-motion feedback, history gating & silent catalog-order switch');

 // Mobile touch double-tap uses the selected interval, not the desktop default.
 const m=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await mockApi(m);const pm=await m.newPage();watchErrors(pm,'mobile player');await ready(pm);await toggle(pm,'kozutv-autoplay',false);await pm.locator('[data-site-pref="kozutv-seek-step"]').selectOption('30');await ready(pm,'/watch/anime/424242?episode=1&lang=sub');await loadVideo(pm);await seekTo(pm,50);
 const mr=await pm.locator('#player .video-js').boundingBox();// The first tap shows the 30-second feedback; read it while it is on screen,
 // then the second tap (inside the double-tap window) performs the seek.
 await pm.touchscreen.tap(mr.x+mr.width*.8,mr.y+mr.height*.5);
 // One double tap advances by the configured 30 s, not the 15 s desktop default.
 await pm.touchscreen.tap(mr.x+mr.width*.8,mr.y+mr.height*.5);
 await expectTime(pm,80);await m.close();
 console.log('PASS mobile 30-second double-tap');
 assert.deepEqual(errors,[],'no uncaught page errors');console.log('ALL V5.4.12 VIEWER QA PASSED');
}finally{
 if(browser)await browser.close();
 if(child&&child.exitCode===null){const ended=once(child,'exit').catch(()=>{});child.kill('SIGTERM');await Promise.race([ended,new Promise(resolve=>setTimeout(resolve,2000))]);if(child.exitCode===null)child.kill('SIGKILL')}
 fs.rmSync(work,{recursive:true,force:true});
}
