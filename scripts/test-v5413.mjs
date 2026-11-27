// V5.4.13 offline regression tests; all AI replies are deterministic mocks.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {parseMediaPlaylist,_test,AiError} from '../ai-transcription.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sig='a'.repeat(40),signed=n=>`/api/media?url=${encodeURIComponent(n)}&sig=${sig}`,base='http://127.0.0.1:3000',url=base+signed('playlist');
const playlist=`#EXTM3U\n#EXTINF:4.5,\n${signed('a')}\n#EXTINF:5.5,\n${signed('b')}\n#EXT-X-ENDLIST\n`;
assert.equal(parseMediaPlaylist(playlist,url).duration,10);
for(const bad of [playlist.replace('#EXT-X-ENDLIST',''),playlist.replace('#EXTINF:4.5,','#EXT-X-KEY:METHOD=AES-128,URI="x"\n#EXTINF:4.5,'),playlist.replace('#EXTINF:4.5,','#EXT-X-BYTERANGE:200@0\n#EXTINF:4.5,'),playlist.replace(signed('a'),'http://169.254.169.254/latest')])assert.throws(()=>parseMediaPlaylist(bad,url),AiError);
const master=`#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",LANGUAGE="en",URI="${signed('english')}"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Hindi",LANGUAGE="hi",URI="${signed('hindi')}"\n#EXT-X-STREAM-INF:BANDWIDTH=200,AUDIO="a"\n${signed('video')}\n`;
assert(_test.selectMaster(master,url,'hi','English',true,base).url.includes('hindi'),'a stale label cannot override the selected language');
assert(_test.selectMaster(master,url,'hi','Hindi',true,base).externalAudio,'selected external audio rendition is identified');
assert.throws(()=>_test.selectMaster(master,url,'bn','',true,base),AiError);
const ambiguous=master.replace('#EXT-X-STREAM-INF',`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Hindi commentary",LANGUAGE="hi",URI="${signed('commentary')}"\n#EXT-X-STREAM-INF`);
assert.throws(()=>_test.selectMaster(ambiguous,url,'hi','',true,base),AiError,'never guess between multiple renditions in the same language');
assert(_test.selectMaster(ambiguous,url,'hi','Hindi commentary',true,base).url.includes('commentary'),'the selected label disambiguates a rendition');
const muxed=master.replace(/,URI="[^"]+"/g,'');
assert.throws(()=>_test.selectMaster(muxed,url,'hi','Hindi',true,base),AiError,'cannot identify the selected stream when audio is embedded');
const realFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>new Response(playlist,{status:200});
 await assert.rejects(_test.extractWindow(url,'hi','Hindi',true,0,new AbortController().signal,base),e=>e instanceof AiError&&e.code==='audio_rendition_not_identified','bare multi-track media must fall back rather than transcribe the first track');
}finally{globalThis.fetch=realFetch;}
assert.throws(()=>_test.mediaOnly('http://169.254.169.254/latest',base),AiError);
assert.match(_test.roman('नमस्ते दुनिया आज कैसे हो','hi'),/namaste.*aaj.*kaise ho/);
assert.equal(_test.roman('देखो अब मेरा होमवर्क तुम करोगे समझे','hi'),'dekho ab mera homework tum karoge samajhe');
assert.equal(_test.roman('स्कूल की घंटी','hi'),'school ki ghanti');
assert.match(_test.roman('তেঁতুলিয়ার ভজনপুর গ্রামের','bn'),/^[A-Za-z\s]+$/);
assert.match(_test.roman('আমার স্কুল','bn'),/school$/);
assert.throws(()=>_test.assertCompatibleScript('しっかり宿題をするんだと自分で','en'),e=>e instanceof AiError&&e.code==='audio_language_mismatch','do not return Japanese text as English captions');
assert.doesNotThrow(()=>_test.assertCompatibleScript('Hello world, नमस्ते','en'),'mixed English and foreign words are not rejected');
assert.doesNotThrow(()=>_test.assertCompatibleScript('नमस्ते दुनिया','hi'),'Hindi-script output is valid for Hindi');
const ts=Buffer.alloc(188*4,0xff);for(let i=0;i<4;i++){ts[i*188]=0x47;ts[i*188+1]=0;ts[i*188+2]=i===1?17:10+i};assert.equal(_test.sanitizeTransportStream(ts).length,188*3);
console.log('PASS bounded HLS parsing, unsafe/encrypted/ranged rejection, audio identity, transliteration and TS metadata workaround');

const work=fs.mkdtempSync(path.join(os.tmpdir(),'kozu-5413-test-'));
fs.cpSync(path.join(root,'data'),path.join(work,'data'),{recursive:true,filter:s=>!['states.json','user.json','cache-token.key','cache-tokens.json'].includes(path.basename(s))&&!s.endsWith('.tmp')});fs.symlinkSync(path.join(root,'public'),path.join(work,'public'),'dir');
const allocator=net.createServer();await new Promise(r=>allocator.listen(0,'127.0.0.1',r));const port=allocator.address().port;await new Promise(r=>allocator.close(r));const origin=`http://127.0.0.1:${port}`;
let child,browser,logs='',errors=[];
const item={id:'55555',type:'movie',title:'Test Movie',description:'Test',poster:'/images/spotlight/anime-21.jpg',backdrop:'/images/spotlight/anime-21.jpg',genres:['Comedy'],isMovie:true,originalLanguage:'en'};
const tracks=[['en','English'],['hi','Hindi'],['bn','Bengali'],['es','Spanish']].map(([language,label])=>({language,label,src:`/__${language}.vtt`}));
const streams=[['en','English'],['hi','Hindi'],['bn','Bengali'],['es','Spanish']].map(([language,label])=>({language,label,src:`/__${language}.webm`,type:'video/webm',tracks}));
const media=path.join(root,'scripts/fixtures/seek-test.webm');
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
try{
 child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:work,env:{...process.env,PORT:String(port),NVIDIA_API_KEY:'',NVIDIA_API_KEY_FILE:path.join(work,'nonexistent-secret')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup '+logs)),20000);child.once('exit',c=>{clearTimeout(timer);reject(Error('server exit '+c+' '+logs))});child.stdout.on('data',()=>{if(logs.includes('listening on')){clearTimeout(timer);resolve()}})});
 let r=await fetch(origin+'/api/ai-transcription',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,403,'Origin required');
 r=await fetch(origin+'/api/ai-transcription',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:'{}'});assert.equal(r.status,403,'foreign Origin rejected');
 r=await fetch(origin+'/api/ai-transcription',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({src:'http://169.254.169.254/latest',time:0,language:'en'})});assert.equal(r.status,400,'SSRF URL rejected');
 r=await fetch(origin+'/api/ai-transcription',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({src:signed('x'),time:0,language:'en'})});assert.equal(r.status,503,'missing key reported without disclosure');
 console.log('PASS same-origin endpoint and unconfigured-key/SSRF rejection');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const c=await browser.newContext({viewport:{width:1200,height:850}});let calls=[];let sourceDelay=0,failAi=false;
 await c.addInitScript(()=>{localStorage.setItem('kozutv-autoplay','false');localStorage.setItem('kozutv-spotlight-autoplay','false')});
 await c.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/detail')return json(route,{item,seasons:[],episodes:[]});
  if(u.pathname==='/api/play')return json(route,{src:streams[0].src,type:'video/webm',provider:'test',sourceKey:'vidcore',server:'Test',audioLang:'en',audioLabel:'English',tracks,audioStreams:streams,qualityStreams:[]});
  if(u.pathname==='/api/ai-transcription'){
   const req=route.request().postDataJSON();calls.push(req);if(sourceDelay)await new Promise(r=>setTimeout(r,sourceDelay));
   if(failAi)return json(route,{error:failAi===true?'audio_rendition_not_identified':failAi},422).catch(()=>{});
   const words={en:['hello there','hello there'],hi:['नमस्ते दुनिया','namaste duniya'],bn:['নমস্কার','nomoskar'],es:['hola mundo','hola mundo']};const [text,roman]=words[req.language]||['wrong','wrong'];
   return json(route,{start:req.time,end:req.time+12,cues:[{start:req.time+5,end:req.time+7,text,roman}],approximate:req.language==='bn'}).catch(()=>{});
  }
  return route.continue();
 });
 await c.route('**/__*.webm',route=>route.fulfill({status:200,path:media,contentType:'video/webm',headers:{'Accept-Ranges':'bytes'}}));
 await c.route('**/__*.vtt',route=>route.fulfill({status:200,contentType:'text/vtt',body:'WEBVTT\n\n00:00:05.000 --> 00:00:07.000\nExisting caption\n'}));
 const p=await c.newPage();p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(origin+'/settings');await p.waitForSelector('.settings-page');
 // V5.4.19: the AI Transcription switch is back in Settings, and it is the ONLY
 // place the words "AI" appear — no note, no disclosure, no caption warning.
 assert.equal(await p.locator('.setting-note').count(),0,'Settings carries no AI disclosure note');
 assert.equal(await p.locator('[data-ai-notice-ack]').count(),0,'no dismissal control remains');
 assert.equal(await p.locator('[data-site-pref="kozutv-ai-transcription"]').count(),1,'the AI Transcription switch exists');
 assert.equal(await p.getByText(/captions are generated|AI captions|AI transcript(?!ion)/i).count(),0,'no AI caption wording anywhere');
 assert.equal(await p.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),null,'defaults are not force-written');
 assert.equal(await p.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),null,'AI captions default to OFF without writing a value');
 // The switch in Settings owns the preference; there is no token to sync through.
 assert.equal(await p.locator('[data-site-pref="kozutv-ai-transcription"]').isChecked(),false,'v8: transcription starts off');
 await p.locator('.setting-row:has([data-site-pref="kozutv-ai-transcription"]) .site-switch').click();
 assert.equal(await p.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),'true','the switch turns transcription on');
 await p.reload();await p.waitForSelector('.settings-page');
 assert.equal(await p.locator('[data-site-pref="kozutv-ai-transcription"]').isChecked(),true,'preference persists after reload');
 assert.equal((await p.locator('.settings-page').innerText()).match(/AI/g).length,1,'only the switch says AI — never a disclosure');
 await p.locator('[data-reset-settings]').click();
 assert.equal(await p.evaluate(()=>localStorage.getItem('kozutv-ai-transcription')),null,'reset clears the preference');
 // Reset intentionally turns AI off; opt in for the transcription assertions.
 await p.locator('.setting-row:has([data-site-pref="kozutv-ai-transcription"]) .site-switch').click();
 await p.goto(origin+'/watch/movie/55555');await p.waitForFunction(()=>{const v=window.videojs?.getPlayer('kozutv-video');return v?.megaUI&&v.duration()>=170&&v.readyState()>=2},{timeout:18000});
 const menu=async name=>p.evaluate(x=>window.videojs.getPlayer('kozutv-video').megaUI.openSettings(x),name);
 const labels=()=>p.locator('.mp-track-list button').allTextContents();
 await menu('quality');assert.equal(await p.locator('.mp-server-section').isVisible(),true,'movies retain server selection');assert(await p.locator('[data-server-choice]').count()>1);
 await menu('cc');assert.deepEqual(await labels(),['Off','English']);assert.equal(await p.locator('.mp-ai-disclosure').count(),0,'no disclosure text under the caption choices');await p.locator('[data-track="0"]').click();
 await p.waitForFunction(()=>window.__noop||document.querySelector('.mp-cc-button.on'));
 await p.waitForTimeout(350);assert(calls.some(x=>x.language==='en'&&x.time===0));assert(calls.some(x=>x.language==='en'&&x.time===12),'next window preloaded');
 // Measure presentation against the player's clock, with deterministic mock cues.
 const sync=await p.evaluate(async()=>{const pl=videojs.getPlayer('kozutv-video');pl.currentTime(4.35);await pl.play();return await new Promise((resolve,reject)=>{let first=null,start=performance.now(),t=setInterval(()=>{let now=pl.currentTime(),visible=Boolean(document.querySelector('.mp-captions')?.textContent.trim());if(visible&&first===null)first=now;if(first!==null&&!visible){clearInterval(t);pl.pause();resolve({first,last:now});}if(performance.now()-start>7000){clearInterval(t);pl.pause();reject(Error('caption timing timeout '+JSON.stringify({now,visible,first})));}},8)})});
 assert(sync.first>=4.78&&sync.first<5.02,'AI caption starts slightly early against media clock '+JSON.stringify(sync));assert(sync.last>=6.98&&sync.last<7.25,'caption end follows media clock '+JSON.stringify(sync));
 console.log('PASS default/persistence/reset, next-window preload and mock caption rendering at player time',JSON.stringify(sync));
 // Switching direct audio updates choices and cancels prior-source results.
 for(const [index,language,expected] of [[1,'hi',['Off','Hindi','Hinglish']],[2,'bn',['Off','Bengali','Benglish']],[3,'es',['Off','Spanish']],[0,'en',['Off','English']]]){
  await menu('audio');await p.locator(`[data-audio-stream="${index}"]`).click();
  await p.waitForFunction(lang=>{const q=document.querySelector('.mp-audio-list .selected');return q?.textContent?.toLowerCase().includes(({hi:'hindi',bn:'bengali',es:'spanish',en:'english'})[lang])},language,{timeout:12000});
  await menu('cc');await p.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.mp-track-list button')].map(x=>x.textContent.trim()))===JSON.stringify(expected),expected,{timeout:10000});assert.deepEqual(await labels(),expected);

  await p.waitForFunction(lang=>window.__unused||document.querySelector('.mp-cc-button.on'),language);
  if(index===1){await p.locator('[data-track="1"]').click();await p.evaluate(()=>{let v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(6)});await p.waitForFunction(()=>document.querySelector('.mp-captions')?.textContent.includes('namaste'),{timeout:10000});}
  if(index===2){await p.locator('[data-track="1"]').click();await p.evaluate(()=>{let v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(6)});await p.waitForFunction(()=>document.querySelector('.mp-captions')?.textContent.includes('nomoskar'),{timeout:10000});}
 }
 assert(calls.some(x=>x.language==='hi'&&x.src==='/__hi.webm'));assert(calls.some(x=>x.language==='bn'&&x.src==='/__bn.webm'));assert(calls.some(x=>x.language==='es'&&x.src==='/__es.webm'));
 console.log('PASS audio-specific AI choices, Hindi/Bengali transliteration, Spanish without Spanlish, and source switches');
 // A deliberately slow old-source response must never paint over the new audio.
 sourceDelay=900;await p.evaluate(()=>{const v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(36)});await p.waitForTimeout(120);assert(calls.some(x=>x.language==='en'&&x.time===36),'seek requested a fresh window');
 await menu('audio');await p.locator('[data-audio-stream="1"]').click();await p.waitForFunction(()=>document.querySelector('.mp-audio-list .selected')?.textContent.includes('Hindi'),{timeout:12000});await p.evaluate(()=>{const v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(41)});await p.waitForFunction(()=>document.querySelector('.mp-captions')?.textContent.includes('नमस्ते'),{timeout:10000});assert(!(await p.locator('.mp-captions').innerText()).includes('hello there'),'old-source result did not paint');sourceDelay=0;
 console.log('PASS seeking and stale-source cancellation');
 await menu('audio');await p.locator('[data-audio-stream="3"]').click();await p.waitForFunction(()=>document.querySelector('.mp-audio-list .selected')?.textContent.includes('Spanish'),{timeout:12000});
 // 5.4.14: a failed AI window retries silently and then falls back to a matching
 // existing caption WITHOUT any notice text.
 failAi=true;await p.evaluate(()=>{const v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(96)});
 await p.waitForTimeout(4000);
 assert.equal(await p.getByText(/AI captions unavailable|using existing captions/i).count(),0,'no AI-unavailable wording is shown');
 failAi=false;
 await menu('cc');assert.deepEqual(await labels(),['Off','Spanish']);assert.equal(await p.locator('.mp-ai-disclosure').count(),0);
 // A possible source-label mismatch must not automatically pick an equally
 // mismatched existing subtitle; captions are turned off with a warning.
 failAi='audio_language_mismatch';
 await p.evaluate(()=>{localStorage.setItem('kozutv-ai-transcription','false');window.dispatchEvent(new CustomEvent('kozutv-preferences-restored'));localStorage.setItem('kozutv-ai-transcription','true');window.dispatchEvent(new CustomEvent('kozutv-preferences-restored'))});
 await p.waitForTimeout(2500);
 assert.equal(await p.getByText(/may not match its language label/i).count(),0,'no language-mismatch notice is shown');
 assert.equal(await p.locator('.mp-cc-button.on').count(),0,'mismatched audio must not auto-enable an existing caption');failAi=false;
 await p.waitForTimeout(300);const before=calls.length;await p.evaluate(()=>{localStorage.setItem('kozutv-ai-transcription','false');window.dispatchEvent(new CustomEvent('kozutv-preferences-restored'))});await menu('cc');await p.waitForFunction(()=>JSON.stringify([...document.querySelectorAll('.mp-track-list button')].map(x=>x.textContent.trim()))===JSON.stringify(['Off','Spanish']));await p.waitForTimeout(1300);assert.equal(calls.length,before,'AI off produces no new model calls');
 await p.locator('[data-track="0"]').click();await p.evaluate(()=>{let v=videojs.getPlayer('kozutv-video');v.pause();v.currentTime(6)});await p.waitForFunction(()=>document.querySelector('.mp-captions')?.textContent.includes('Existing caption'),{timeout:10000});
 console.log('PASS AI failure fallback and AI-off matching-language-only existing captions');
 // Anime sources can themselves contain multiple native HLS audio tracks.
 // The selected track, not the original source label, controls the captions.
 const ac=await browser.newContext({viewport:{width:1200,height:850}});let animeCalls=[];
 await ac.addInitScript(()=>{localStorage.setItem('kozutv-autoplay','false');localStorage.setItem('kozutv-save-history','false');localStorage.setItem('kozutv-ai-transcription','true')});
 await ac.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/detail')return json(route,{item:{...item,id:'55556',type:'anime',title:'Anime track fixture',sub:true,dub:true,originalLanguage:'ja'},seasons:[],episodes:[]});
  if(u.pathname==='/api/play')return json(route,{src:streams[0].src,type:'video/webm',provider:'test',activeLang:'dub',audioLang:'en',audioLabel:'English',allowSub:true,allowDub:true,tracks:[],regionalStreams:[]});
  if(u.pathname==='/api/ai-transcription'){const req=route.request().postDataJSON();animeCalls.push(req);return json(route,{start:req.time,end:req.time+12,cues:[],approximate:false}).catch(()=>{});}
  return route.continue();
 });
 await ac.route('**/__*.webm',route=>route.fulfill({status:200,path:media,contentType:'video/webm',headers:{'Accept-Ranges':'bytes'}}));
 const ap=await ac.newPage();ap.on('pageerror',e=>errors.push(String(e)));
 await ap.goto(origin+'/watch/anime/55556?episode=1&lang=dub');await ap.waitForFunction(()=>{const v=window.videojs?.getPlayer('kozutv-video');return v?.megaUI&&v.readyState()>=2},{timeout:18000});
 await ap.evaluate(()=>{
  const list=videojs.getPlayer('kozutv-video').audioTracks(),Track=videojs.AudioTrack;
  Array.from(list).forEach(t=>list.removeTrack(t));
  list.addTrack(new Track({id:'test-en',kind:'main',language:'en',label:'English',enabled:true}));
  list.addTrack(new Track({id:'test-hi',kind:'main',language:'hi',label:'Hindi',enabled:false}));
 });
 await ap.evaluate(()=>videojs.getPlayer('kozutv-video').megaUI.openSettings('audio'));
 await ap.waitForSelector('[data-audio-track="1"]');assert.equal(await ap.locator('.mp-audio-group').count(),2,'separate anime sources and actual tracks');
 await ap.locator('[data-audio-track="1"]').click();await ap.evaluate(()=>videojs.getPlayer('kozutv-video').megaUI.openSettings('cc'));
 await ap.waitForFunction(()=>JSON.stringify([...document.querySelectorAll('.mp-track-list button')].map(x=>x.textContent.trim()))===JSON.stringify(['Off','Hindi','Hinglish']),{timeout:10000});
 await ap.locator('[data-track="0"]').click();await ap.waitForFunction(()=>document.querySelector('.mp-cc-button.on'));
 await ap.waitForTimeout(250);assert(animeCalls.some(x=>x.language==='hi'&&x.multipleAudio===true&&x.audioLabel==='Hindi'),'anime captions follow the selected native track');
 assert.equal(await ap.evaluate(()=>localStorage.getItem('kozutv-ott-audio')),null,'anime native track choice must not alter movie audio preference');
 // Japanese audio: MegaPlay's English subtitle stays the automatic choice and
 // no AI request is made by itself, while an explicit AI Japanese option exists.
 assert.equal(await ap.evaluate(()=>document.querySelector('.mp-captions')?.textContent.includes('Existing caption')),false,'Japanese audio has not opened an AI caption automatically');
 assert.equal(animeCalls.filter(x=>x.language==='ja').length,0,'no Japanese AI request without a deliberate selection');
 await ap.evaluate(()=>{const list=videojs.getPlayer('kozutv-video').audioTracks();list.addTrack(new videojs.AudioTrack({id:'test-unknown',kind:'main',language:'und',label:'Audio 3',enabled:false}));videojs.getPlayer('kozutv-video').megaUI.openSettings('audio')});
 await ap.locator('[data-audio-track="2"]').click();await ap.evaluate(()=>videojs.getPlayer('kozutv-video').megaUI.openSettings('cc'));
 await ap.waitForFunction(()=>JSON.stringify([...document.querySelectorAll('.mp-track-list button')].map(x=>x.textContent.trim()))===JSON.stringify(['Off']),{timeout:10000});
 console.log('PASS anime native-track identity, track menu, unknown-track safety and separate preferences');
 await ac.close();assert.deepEqual(errors,[],'no player errors');await c.close();
}finally{if(browser)await browser.close();if(child){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r)).catch(()=>{});}fs.rmSync(work,{recursive:true,force:true});}
console.log('ALL V5.4.13 OFFLINE TESTS PASSED');
