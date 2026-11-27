import {chromium,devices} from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--ignore-certificate-errors']});
let desktop='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';let mobile=devices['Pixel 7'].userAgent;
for (let [label,opts] of [['desktop-ua',{userAgent:desktop}],['mobile-ua-desktop',{userAgent:mobile}],['mobile-device-desktop-ua',{...devices['Pixel 7'],userAgent:desktop}],['mobile-device',devices['Pixel 7']]]){
 let c=await b.newContext({...opts,ignoreHTTPSErrors:true});let p=await c.newPage();let client=await c.newCDPSession(p);await client.send('Network.enable');client.on('Network.requestWillBeSent',e=>{if(e.type==='Document')console.log(label,'document',e.request.url,'initiator',JSON.stringify(e.initiator).slice(0,900))});p.on('response',r=>{if(r.request().isNavigationRequest()||r.url().includes('/ajax/anime/hindi/sources'))console.log(label,'status',r.status(),r.url().split('?')[0])});
 try {await p.goto('https://embed.vidwave.sbs/anime/hindi/151807/1',{waitUntil:'domcontentloaded',timeout:30000});await p.waitForTimeout(7500);console.log(label,'final',p.url(),'video',await p.locator('video').count());} catch(e){console.log(label,e.message.slice(0,150))}await c.close();
}await b.close();
