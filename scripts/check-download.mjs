// Does the app build play, and does the player's download button really hand a
// real stream to the native download manager?
import { chromium } from 'playwright';
const BASE=process.env.BASE||'http://127.0.0.1:8777';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{
  window.__dl=[];
  window.kozutvDownloads={
   list:()=>JSON.stringify([]),
   start:spec=>{window.__dl.push(JSON.parse(spec));return JSON.stringify({ok:true})},
   remove:()=>JSON.stringify({ok:true}),clear:()=>JSON.stringify({ok:true}),usedBytes:()=>0};
 });
 const page=await ctx.newPage();
 const errs=[];page.on('pageerror',e=>errs.push(String(e)));
 const t0=Date.now();
 await page.goto(BASE+'/watch/anime/57334?episode=1&lang=sub',{waitUntil:'domcontentloaded',timeout:60000});
 const ready=await page.waitForFunction(()=>{
  try{const p=window.videojs&&videojs.getPlayer('kozutv-video');return p&&p.readyState()>=2}
  catch{return false}
 },null,{timeout:60000}).then(()=>Date.now()-t0).catch(()=>-1);
 const info=await page.evaluate(()=>{
  try{const p=videojs.getPlayer('kozutv-video');
   const el=document.querySelector('#player');
   const b=document.querySelector('.mp-download-button');
   return {ready:p.readyState(),dur:Math.round(p.duration()||0),err:p.error()?.message||'',
    playerBox:el?{w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}:null,
    btn:Boolean(b),btnVisible:b?b.offsetParent!==null:false,src:String(p.currentSrc()||'').slice(0,60)};
  }catch(e){return {error:String(e)}}
 });
 console.log('READY_MS',ready,'INFO',JSON.stringify(info));
 // click the download button: the player must hand a real stream to the bridge
 const clicked=await page.evaluate(()=>{
  const b=document.querySelector('.mp-download-button');
  if(!b)return false;b.click();return true;
 });
 await page.waitForTimeout(9000);
 const spec=await page.evaluate(()=>window.__dl[0]||null);
 console.log('CLICKED',clicked,'SPEC',spec?JSON.stringify({id:spec.id,title:spec.title,ep:spec.episode,lang:spec.lang,src:spec.src.slice(0,48),tracks:spec.tracks.length}):'none');
 // and the downloads screen should now list it as in progress
 await page.goto(BASE+'/downloads',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1500);
 const cards=await page.evaluate(()=>document.querySelectorAll('.dl-card').length);
 console.log('CARDS_AFTER_START',cards);
 console.log('ERRORS',errs.length,errs.slice(0,2).join(' | '));
 await browser.close();
})().catch(e=>{console.log('FAIL '+e);process.exit(1)});
