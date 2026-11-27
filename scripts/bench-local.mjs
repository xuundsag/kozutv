// Timing: how long from a cold open to a painted home page, and from a tap on
// Watch to a playing frame. Uses the live server so the numbers are real.
import { chromium } from 'playwright';
const BASE="http://127.0.0.1:8777";
const out=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-gpu']});
 const ctx=await browser.newContext({viewport:{width:412,height:915},userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));

 // ---- 1. cold home ----
 const t0=Date.now();
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded',timeout:60000});
 const firstCard=await page.waitForSelector('.card',{timeout:60000}).then(()=>Date.now()-t0).catch(()=>-1);
 const cards=await page.evaluate(()=>document.querySelectorAll('.card').length);
 out.push(`cold home: first card ${firstCard} ms, ${cards} cards`);

 // ---- 2. second visit (back to home) ----
 await page.goto(BASE+'/schedule',{waitUntil:'domcontentloaded',timeout:60000});
 const t1=Date.now();
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded',timeout:60000});
 const backCard=await page.waitForSelector('.card',{timeout:30000}).then(()=>Date.now()-t1).catch(()=>-1);
 out.push(`return to home: first card ${backCard} ms`);

 // ---- 3. detail page ----
 const t2=Date.now();
 await page.goto(BASE+'/browse/anime/57334',{waitUntil:'domcontentloaded',timeout:60000});
 const detail=await page.waitForSelector('.detail h1',{timeout:60000}).then(()=>Date.now()-t2).catch(()=>-1);
 const epRow=await page.waitForSelector('.anime-episodes button.episode-row, .episode-row',{timeout:30000}).then(()=>true).catch(()=>false);
 out.push(`detail: heading ${detail} ms, episodes ${epRow?'loaded':'missing'}`);

 // ---- 4. watch: tap to playing ----
 const t3=Date.now();
 await page.goto(BASE+'/watch/anime/57334?episode=1&lang=sub',{waitUntil:'domcontentloaded',timeout:60000});
 const painted=await page.waitForSelector('#player .video-js',{timeout:60000}).then(()=>Date.now()-t3).catch(()=>-1);
 const playing=await page.waitForFunction(()=>{
  try{const p=window.videojs&&videojs.getPlayer('kozutv-video');return p&&p.readyState()>=2}
  catch{return false}
 },null,{timeout:60000}).then(()=>Date.now()-t3).catch(()=>-1);
 const state=await page.evaluate(()=>{try{const p=videojs.getPlayer('kozutv-video');return {ready:p.readyState(),dur:Math.round(p.duration()||0),err:Boolean(p.error())}}catch{return null}});
 out.push(`watch: player painted ${painted} ms, readyState>=2 ${playing} ms, ${JSON.stringify(state)}`);

 // ---- 5. how much of the page paints while the network is slow ----
 await page.goto(BASE+'/browse',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(500);
 const plates=await page.evaluate(()=>[...document.querySelectorAll('#app *')].filter(el=>{
  const bg=getComputedStyle(el).backgroundColor;
  return bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='rgb(0, 0, 0)'&&!/var\(/.test(bg)&&el.offsetWidth>200&&el.offsetHeight>100;
 }).map(el=>el.className+' '+getComputedStyle(el).backgroundColor).slice(0,6));
 out.push('large non-black plates: '+(plates.length?plates.join(' | '):'none'));
 out.push('page errors: '+errors.length+(errors.length?' -> '+errors.slice(0,2).join(' | '):''));
 console.log(out.join('\n'));
 await page.screenshot({path:'/tmp/live-home.png'});
 await browser.close();
})().catch(e=>{console.log('BENCH FAIL '+e);process.exit(1)});
