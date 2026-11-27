import {chromium} from 'playwright';
const base='http://127.0.0.1:3000';
const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const errs=[];

async function desk(w=1400,h=900){
  const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});
  const p=await c.newPage();p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  return {c,p};
}

// 01 Browse (hero + icons + new wordmark)
{
  const {c,p}=await desk();
  await p.goto(base+'/browse',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.hero');await p.waitForTimeout(2600);
  await p.screenshot({path:'/tmp/shots/01-browse.png'});
  await c.close();
}
// 02 Side menu open
{
  const {c,p}=await desk();
  await p.goto(base+'/browse',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.menu-toggle');await p.waitForTimeout(1500);
  await p.locator('.menu-toggle').click();await p.waitForTimeout(700);
  await p.screenshot({path:'/tmp/shots/02-menu.png'});
  await c.close();
}
// 03 Schedule
{
  const {c,p}=await desk(1400,1000);
  await p.goto(base+'/schedule',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.schedule-row',{timeout:60000});await p.waitForTimeout(1800);
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.screenshot({path:'/tmp/shots/03-schedule.png'});
  await c.close();
}
// 04 Upcoming
{
  const {c,p}=await desk(1400,1000);
  await p.goto(base+'/upcoming',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.card',{timeout:60000});await p.waitForTimeout(2200);
  await p.screenshot({path:'/tmp/shots/04-upcoming.png'});
  await c.close();
}
// 05 Settings (no AI row) + 06 token error state
{
  const {c,p}=await desk(1400,1100);
  await p.goto(base+'/settings',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.settings-page');await p.waitForTimeout(1800);
  await p.screenshot({path:'/tmp/shots/05-settings.png'});
  await p.locator('#cache-token-input').fill('ZZZZZZ');
  await p.locator('[data-token-set]').click();
  await p.waitForTimeout(220);
  await p.locator('.cache-token-card').screenshot({path:'/tmp/shots/06-token.png'});
  await c.close();
}
// 07 Player caption menu (live anime)
{
  const {c,p}=await desk(1400,900);
  c.on('pageerror',e=>errs.push('player:'+String(e).slice(0,120)));
  await p.goto(base+'/watch/anime/63382?episode=1&lang=sub',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>{const pl=window.videojs?.getPlayer('kozutv-video');return Boolean(pl&&pl.megaUI)},{timeout:45000});
  await p.waitForTimeout(2500);
  await p.evaluate(()=>{const pl=window.videojs.getPlayer('kozutv-video');pl.megaUI.openSettings('cc');pl.megaUI.showControls()});
  await p.waitForTimeout(900);
  await p.screenshot({path:'/tmp/shots/07-player.png'});
  await c.close();
}
// 08 Mobile spotlight
{
  const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const p=await c.newPage();p.on('pageerror',e=>errs.push('m:'+String(e).slice(0,120)));
  await p.goto(base+'/browse',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.hero');await p.waitForTimeout(2600);
  await p.screenshot({path:'/tmp/shots/08-mobile.png'});
  await c.close();
}
console.log('errors',errs);
await b.close();
