import {chromium, devices} from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors']});
for (const mode of ['mobile','desktop']) {
 const ctx=await b.newContext(mode==='mobile'?{...devices['Pixel 7'],ignoreHTTPSErrors:true}:{viewport:{width:1280,height:800},ignoreHTTPSErrors:true});
 const p=await ctx.newPage();
 p.on('response',async r=>{let u=r.url();if(r.request().isNavigationRequest()||/ajax\/anime\/hindi\/sources|\.m3u8|\.mpd/.test(u)){console.log(mode,'response',r.status(),new URL(u).origin+new URL(u).pathname);if(u.includes('/ajax/anime/hindi/sources')){try{const t=await r.text();console.log(mode,'source-response summary',t.slice(0,500).replace(/"(ciphertext|tag|token|iv|salt)"\s*:\s*"[^"]+"/g,'"$1":"[redacted]"'))}catch{}}}});
 p.on('requestfailed',r=>console.log(mode,'failed',r.failure()?.errorText,new URL(r.url()).origin+new URL(r.url()).pathname));p.on('pageerror',e=>console.log(mode,'pageerror',e.message));
 try{await p.goto('https://embed.vidwave.sbs/anime/hindi/151807/1',{waitUntil:'domcontentloaded',timeout:35000});await p.waitForTimeout(9000); console.log(mode,'url',p.url(),'video count',await p.locator('video').count()); await p.screenshot({path:`/home/user/screenshots/v36/vidwave-${mode}-before-tap.png`});
 if(await p.locator('video').count()){console.log(mode,'before',await p.locator('video').first().evaluate(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,ready:v.readyState,network:v.networkState,src:!!v.currentSrc,error:v.error?.code})));await p.mouse.click(mode==='mobile'?196:640,mode==='mobile'?422:400);console.log(mode,'tapped');await p.waitForTimeout(15000);console.log(mode,'after',await p.locator('video').first().evaluate(v=>({time:v.currentTime,duration:v.duration,paused:v.paused,ready:v.readyState,network:v.networkState,src:!!v.currentSrc,error:v.error?.code})));await p.screenshot({path:`/home/user/screenshots/v36/vidwave-${mode}-after-tap.png`})}
 }catch(e){console.log(mode,'exception',e.message.slice(0,300))}await ctx.close();
} await b.close();
