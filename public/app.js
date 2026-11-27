const app=document.querySelector('#app'),search=document.querySelector('#search'),headerEl=document.querySelector('.header');
let items=[],spotlightItems=[],suggestions=[],genreRows={},activeGenres=[],genreQueue=[],continueItems=[],slide=0,detail=null,season=1,episode=1,provider='vidcore',searchTimer,lastProgressSent=0,savedKeys=new Set(),animeEpisodeLists={detail:null,watch:null},tvEpisodeLists={detail:null,watch:null},videoPlayer=null,playGeneration=0,lang='sub';
let pagedState={mode:'',endpointBase:'',page:1,hasMore:false,seen:new Set(),total:0};
let episodeSwitchGeneration=0,routeGeneration=0;
let browseRowsSession=null,genrePagesSession=null;
const tvEpisodeRequest={detail:0,watch:0};

function syncFooter(){let loading=app.firstElementChild?.classList.contains('loading');document.body.classList.toggle('route-ready',app.childElementCount>0&&!loading)}
new MutationObserver(syncFooter).observe(app,{childList:true});syncFooter();

let playerAssetsPromise=null;
function loadPlayerAssets(){
 if(window.videojs&&window.MegaPlayUI)return Promise.resolve();
 if(!playerAssetsPromise)playerAssetsPromise=(async()=>{
  for(let src of ['/vendor/video.min.js','/megaplay-controls.js?v=5.4.19-v43'])await new Promise((resolve,reject)=>{
   let script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;
   script.onerror=()=>{script.remove();reject(Error('The player assets could not be loaded.'))};
   document.head.append(script);
  });
 })().catch(error=>{playerAssetsPromise=null;throw error});
 return playerAssetsPromise;
}

const DEFAULT_DOC_TITLE='KozuTV - Watch Free Anime, Movies & Series Online in HD Sub & Dub';
const OTT_PROVIDERS=['vidcore','embedwave','cinesrc','vidlink','vidsrc'];
const ANIME_LANGS=['sub','dub','hi','ta','te','ml','kn','bn'];
const ANIME_REGIONAL_LANGS=['hi','ta','te','ml','kn','bn'];
const animeCatalogBucket=value=>ANIME_REGIONAL_LANGS.includes(value)?'reg':value;
const animeNeedsEpisodeOne=(item,from,to)=>Boolean(item?.differentDubOrder&&animeCatalogBucket(from)!==animeCatalogBucket(to));
const animeFallbackOrder=first=>[...new Set([first,'dub','sub'].filter(value=>ANIME_LANGS.includes(value)))];
const newAnimePlan=(from,ep)=>({originLang:from,originEpisode:ep,order:animeFallbackOrder(from),tried:[]});
// Normalize only known audio languages; an unknown stream is never renamed as
// the preference. Direct source variants can be chosen before playback starts.
const OTT_AUDIO_NAMES={en:'English',ja:'Japanese',hi:'Hindi',ta:'Tamil',te:'Telugu',ml:'Malayalam',kn:'Kannada',bn:'Bengali',ko:'Korean',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ru:'Russian',zh:'Chinese',ar:'Arabic',tr:'Turkish',th:'Thai',vi:'Vietnamese',id:'Indonesian',mr:'Marathi',pa:'Punjabi',gu:'Gujarati',ur:'Urdu',nl:'Dutch',pl:'Polish',sv:'Swedish',da:'Danish',fi:'Finnish',cs:'Czech',el:'Greek',hu:'Hungarian',ro:'Romanian',uk:'Ukrainian',he:'Hebrew',fa:'Persian',ms:'Malay'};
const OTT_AUDIO_ALIASES={eng:'en',jpn:'ja',hin:'hi',tam:'ta',tel:'te',mal:'ml',kan:'kn',ben:'bn',kor:'ko',spa:'es',fra:'fr',fre:'fr',deu:'de',ger:'de',ita:'it',por:'pt',rus:'ru',zho:'zh',chi:'zh',ara:'ar',tur:'tr',tha:'th',vie:'vi',ind:'id',mar:'mr',pan:'pa',guj:'gu',urd:'ur'};
function ottAudioCode(track){
 const raw=String(track?.language||'').trim().toLowerCase().split(/[-_]/)[0];
 if(OTT_AUDIO_NAMES[raw])return raw;if(OTT_AUDIO_ALIASES[raw])return OTT_AUDIO_ALIASES[raw];
 const label=String(track?.label||'').trim().toLowerCase();
 return Object.keys(OTT_AUDIO_NAMES).find(key=>label===OTT_AUDIO_NAMES[key].toLowerCase()||label.startsWith(OTT_AUDIO_NAMES[key].toLowerCase()+' '))||'';
}
function ottPreferredAudio(){
 let setting=null;try{setting=localStorage.getItem('kozutv-ott-audio')}catch{}
 if(setting!==null)return setting==='auto'?'':ottAudioCode({language:setting});
 try{const legacy=JSON.parse(localStorage.getItem('kozutv-audio-pref')||'null');return legacy?ottAudioCode(legacy):''}catch{return ''}
}
function ottSourceOrder(data){
 const all=Array.isArray(data.audioStreams)?data.audioStreams.filter(a=>a?.src):[];
 const primary=all.find(a=>a.src===data.src)||{src:data.src,type:data.type,language:data.audioLang,label:data.audioLabel,tracks:data.tracks,primary:true};
 const pref=ottPreferredAudio(),out=[],seen=new Set();
 const add=track=>{if(track?.src&&!seen.has(track.src)){seen.add(track.src);out.push(track)}};
 if(!pref)add(primary);
 for(const code of [...new Set([pref,'en','ja'].filter(Boolean))])for(const track of all)if(ottAudioCode(track)===code)add(track);
 add(primary);
 return out;
}
function ottWithSource(data,stream){
 if(!stream||stream.src===data.src)return {...data};
 return {...data,src:stream.src,type:stream.type||data.type,audioLang:stream.language||'und',audioLabel:stream.label||'Original audio',sourceKey:stream.sourceKey||data.sourceKey,server:stream.server||data.server,provider:stream.provider||data.provider,tracks:stream.tracks||[],qualityStreams:[]};
}

const TV_EP_CHUNK=60;
const isFeature=x=>x?.type==='movie'||x?.isMovie||x?.format==='MOVIE';
const short=(s,n)=>{let t=String(s||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n).replace(/\s+\S*$/,'')+'…':t};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=(type,id)=>`/browse/${type}/${id}`;
// Navigating from inside a player callback: same router, no reload.
function navigateTo(path){try{closeMenu();routeGo(path)}catch{location.hash='#'+path}}
const responseJSON=async r=>{
 let text=await r.text(),d;
 // An empty body (or HTML from a captive portal) is not an answer: treat it as
 // a dead connection so the caller falls back to the bundled snapshot.
 try{d=JSON.parse(text)}catch{throw Error(text&&text.trim()?(r.ok?'The service returned an invalid response.':`Request failed (${r.status}).`):'network')}
 // JSON.parse('null') succeeds and yields undefined, as does an empty body that
 // slipped past the catch. Downstream code then read properties off nothing -
 // the app showed "Cannot read properties of undefined (reading 'upcoming')".
 if(d===null||typeof d!=='object')throw Error('network');
 if(!r.ok){let err=Error(d.error||'Request failed');if(d.availableLang)err.availableLang=d.availableLang;throw err}
 return d;};
// Offline fallback: when a GET cannot reach the server (no signal, or the APK
// is running from its bundle with no connection), answer from the snapshot the
// build shipped. A title that is in the snapshot keeps working; anything else
// fails exactly as it would in a browser.
let offlineSnapshot=null;
async function offlineDocument(p){
 const clean=String(p||'').split('?')[0];
 if(!clean.startsWith('/api/'))return null;
 if(offlineSnapshot===null){
  try{
   const res=await fetch('/offline-manifest.json',{cache:'no-cache'});
   offlineSnapshot=res.ok?await res.json():{documents:[]};
  }catch{offlineSnapshot={documents:[]}}
 }
 // Endpoints are called both as /api/browse and /api/browse/ - treat them the same.
 const name=clean.replace(/^\/api\//,'').replace(/\/+$/,'');
 const hit=(offlineSnapshot.documents||[]).find(d=>d&&d.path&&
  d.path.split('?')[0].replace(/^\/api\//,'').replace(/\/+$/,'')===name);
 return hit?{...hit.body}:null;
}
// Everything the bundle knows, as one list. The snapshot is the full catalogue,
// so a row can be assembled on the device when its endpoint cannot be reached.
let bundleItemsCache=null;
async function bundleItems(){
 if(bundleItemsCache)return bundleItemsCache;
 const fromDocs=[];
 try{
  const manifest=await offlineDocument('/api/browse');
  if(manifest)fromDocs.push(...(manifest.items||[]));
  const page2=await offlineDocument('/api/browse?page=2');
  if(page2)fromDocs.push(...(page2.items||[]));
 }catch{}
 bundleItemsCache=fromDocs;
 return bundleItemsCache;
}
async function offlineItemsFor(name){
 const all=await bundleItems();
 if(!all.length)return [];
 const wanted=String(name||'').toLowerCase();
 const dubbed=wanted.includes('dubbed');
 const language=wanted.split(' ')[0];
 const match=all.filter(x=>{
  const genres=(x.genres||[]).map(g=>String(g).toLowerCase());
  if(dubbed){
   const langs=String((x.audio||x.audioLangs||x.languages||[]).toString()).toLowerCase();
   const subs=String((x.sub||x.dub)||'').toLowerCase();
   return langs.includes(language)||(x.title||'').toLowerCase().includes('hindi')||genres.some(g=>g.includes(language));
  }
  return genres.some(g=>g.includes(wanted)||wanted.includes(g));
 });
 // A row with no matches is better than a row of broken posters: if nothing
 // fits, show what the bundle has rather than nothing at all.
 const source=match.length?match:all;
 return source.slice(0,24);
}
const STATE_CACHE_KEY='kozutv-state-cache';
function cachedLibraryState(){
 // Last known watchlist/history, written on every successful load. The shape is
 // guaranteed: an older entry written by a previous version may not have it.
 try{
  const raw=localStorage.getItem(STATE_CACHE_KEY);
  const d=raw?JSON.parse(raw):null;
  return {watchlist:Array.isArray(d?.watchlist)?d.watchlist:[],history:Array.isArray(d?.history)?d.history:[]};
 }catch{return {watchlist:[],history:[]}}
}
// The APK opens ONE document from inside itself, so a relative /api/ call
// would come straight back out of the bundle. Point API traffic at the live
// server instead: the snapshot stays as the offline answer, and anything the
// snapshot lacks (search, a title added later) works whenever there is signal.
const API_ORIGIN='https://kozutv.bond';

// ---- native transport ------------------------------------------------------
// Inside the APK the page lives on https://kozutv.local, so every call to the
// real server is cross-origin. Unless the server sends CORS headers - and a
// deployed one may not - the browser refuses to hand the answer back and
// fetch() rejects with "Failed to fetch". Android's own HTTP stack has no such
// rule, so while the app is running the page borrows it through the bridge and
// nothing depends on the server's CORS configuration.
//
// Only the app's own host is routed this way; every other request (YouTube,
// image CDNs, the player) keeps the browser's fetch untouched.
const nativeHttpBridge=()=>{
 try{
  // The HTTP bridge is kozutvHttp; kozutvAndroid is the presence bridge.
  const b=window.kozutvHttp;
  const usable=b&&(typeof b.requestWithTicket==='function'||typeof b.request==='function');
  return usable&&/^https?:$/.test(location.protocol)&&/\.local$/.test(location.hostname)?b:null;
 }catch{return null}
};
// Image loader. The poster CDNs serve a plain GET fine, but inside the app the
// WebView's own image request is what gets throttled or edge-blocked. The native
// loader does it with a browser User-Agent and its own disk cache, and hands
// back a data: URI the page can render like any <img>.
const nativeImageBridge=()=>{
 try{
  const b=window.kozutvImg;
  return b&&typeof b.load==='function'&&/\.local$/.test(location.hostname||'')?b:null;
 }catch{return null}
};
const imagePending=new Map();let imageSeq=1;
window.kozutvImgResolve=(ticket,payload)=>{
 const e=imagePending.get(ticket);if(!e)return;
 imagePending.delete(ticket);if(e.timer)clearTimeout(e.timer);
 e.resolve(typeof payload==='string'?payload:'');
};
const loadImageNative=url=>new Promise(resolve=>{
 const b=nativeImageBridge();
 if(!b){resolve('');return}
 const ticket=imageSeq++;
 const timer=setTimeout(()=>{imagePending.delete(ticket);resolve('')},12000);
 imagePending.set(ticket,{resolve,timer});
 try{b.load(url,ticket)}catch{clearTimeout(timer);imagePending.delete(ticket);resolve('')}
});
// Every <img> that asks for the native scheme is swapped once the bytes arrive.
// The native side now answers with a kozu-img:// ticket it can stream from, not
// with base64, so the swap is a one-word string and the decode happens off the
// page's thread. Images the phone already has are painted straight away.
function hydrateNativeImages(root=document){
 let nodes=[];
 try{nodes=[...(root||document).querySelectorAll('img[src^="kozutv-img:"]')]}catch{return}
 if(!nodes.length)return;
 // Visible images first: the first rows a viewer sees must not queue behind
 // forty posters from a row further down.
 let boxes=null;
 try{boxes=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]))}catch{}
 if(boxes)nodes.sort((a,b)=>Math.abs(boxes.get(a).top)-Math.abs(boxes.get(b).top));
 const prefetch=[];
 nodes.forEach(img=>{
  if(img.dataset.nativeLoad)return;
  img.dataset.nativeLoad='1';
  const target=img.getAttribute('src').slice('kozutv-img:'.length);
  // Pictures off screen are only warmed, never fetched twice: the observer
  // asks for them when they scroll in, and the disk cache answers then.
  const box=(()=>{try{return img.getBoundingClientRect()}catch{return null}})();
  const onScreen=!box||(box.top<window.innerHeight*1.4&&box.bottom>-window.innerHeight*.4);
  if(!onScreen){
   prefetch.push(target);
   if(imageSeen){try{imageSeen.observe(img)}catch{}}
   return;
  }
  loadImageNative(target).then(data=>{
   // data is "N": point the <img> at the stream. Empty means the phone could
   // not get the image at all, so the CDN is tried directly, then the
   // placeholder - never a blank tile.
   if(data){img.src='kozu-img://'+data;return}
   img.onerror=()=>{if(img.dataset.fallbackApplied)return;img.dataset.fallbackApplied='1';img.src=FALLBACK_POSTER_DATA_URI};
   img.src=target;
  });
 });
 if(prefetch.length){
  // Do not prefetch whole rows into the phone's disk cache.
 }
}
let imageObserver=null,imageSeen=null;
function watchImages(){
 if(!bundledMode()||!nativeImageBridge())return;
 try{
  if(!imageObserver){
   imageObserver=new MutationObserver(()=>hydrateNativeImages(document));
   imageObserver.observe(document.body,{childList:true,subtree:true});
  }
  if(!imageSeen&&'IntersectionObserver' in window){
   // Rows scroll sideways as well as down, so the window's scroll event is not
   // enough to know when a poster becomes visible. One observer handles both,
   // and a picture is asked for exactly when it is about to be looked at.
   imageSeen=new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     const img=entry.target;
     imageSeen.unobserve(img);
     const target=img.getAttribute('src')||'';
     if(!target.startsWith('kozutv-img:'))continue;
     const clean=target.slice('kozutv-img:'.length);
     img.dataset.nativeLoad='1';
     loadImageNative(clean).then(data=>{
      if(data){img.src='kozu-img://'+data;return}
      img.onerror=()=>{if(img.dataset.fallbackApplied)return;img.dataset.fallbackApplied='1';img.src=FALLBACK_POSTER_DATA_URI};
      img.src=clean;
     });
    }
   },{rootMargin:'300px 0px'});
  }
 }catch{}
 hydrateNativeImages(document);
}

const nativeHttp=bridge=>{
 const pending=new Map();let next=1;
 window.kozutvHttpResolve=(ticket,json)=>{
  let entry=pending.get(ticket);
  if(!entry){
   // The page and the native side each number their requests; if those ever
   // drift apart the reply must still land, never hang the read.
   const oldest=pending.keys().next();
   if(oldest&&!oldest.done)entry=pending.get(oldest.value);
  }
  if(!entry)return;
  for(const [k,v] of pending){if(v===entry){pending.delete(k);break}}
  if(entry.timer)clearTimeout(entry.timer);

  // The native side calls this with a JavaScript object literal, not a string.
  // Running JSON.parse on an object throws ("[object Object]"), which made every
  // successful native call look like a dead network. Accept both shapes.
  try{entry.resolve(typeof json==='string'?JSON.parse(json||'{}'):(json||{}))}
  catch{entry.resolve({status:0,ok:false,body:'',error:'bad answer'})}
 };
 return function(url,options={}){
  return new Promise(resolve=>{
   const ticket=next++;
   const target=/^https?:/i.test(url)?url:API_ORIGIN+url;
   const body=typeof options.body==='string'?options.body:'';
   const headers=options.headers&&typeof options.headers==='object'?JSON.stringify(options.headers):'';
   // The method has to survive the trip. It used to default to GET here, which
   // is why /api/watchlist arrived as a GET and was ignored by the server.
   const method=String(options.method||'GET').toUpperCase();
   const timer=setTimeout(()=>{
    if(!pending.has(ticket))return;
    pending.delete(ticket);
    resolve({status:0,ok:false,body:'',error:'timeout'});
   },8000);   // a cold mobile connection can take seconds; the page has its own deadline
   pending.set(ticket,{resolve,timer});
   // Hand the page's ticket to the native side, so the reply carries the same
   // number. Two independent counters used to drift, and a reply that arrived
   // for the wrong ticket was dropped - which read as "the stream could not be
   // loaded" and as random empty pages.
   try{
    if(typeof bridge.requestWithTicket==='function')bridge.requestWithTicket(ticket,method,target,body,headers);
    else bridge.request(method,target,body,headers);
   }
   catch{
    clearTimeout(timer);pending.delete(ticket);
    resolve({status:0,ok:false,body:'',error:'bridge'});
   }
  });
 };
};
// Memoised shim. The options argument used to be dropped here, which quietly
// turned every write into a bodyless GET: the server saw GET /api/watchlist and
// ignored it, so saving a title did nothing and said nothing.
const bridgeFetch=(()=>{let shim=null;return (url,options)=>{if(!shim)shim=nativeHttp(nativeHttpBridge());return shim(url,options)}})();

// One response object for both transports, so callers cannot tell which ran.
// One way out of the page: plain fetch.
//
// In the app the WebView sends that request to the virtual origin, and the app
// itself answers it - proxying /api/* to the live server, or handing back the
// bundled snapshot when the network is down (see AssetServer). That means the
// page needs no JS bridge for reads, no CORS, and no special case: a request
// either answers or falls back, exactly like a browser.
//
// The only thing that still uses the bridge is a write (POST), because the
// WebView cannot proxy a request body through shouldInterceptRequest.
const asResponse=r=>{
 if(!r)return r;
 if(typeof r.text==='function'&&typeof r.json==='function')return r;      // a real Response
 // A native bridge answer: {status, ok, body, contentType}.
 const body=typeof r.body==='string'?r.body:(r.body==null?'':String(r.body));
 return {ok:Boolean(r.ok),status:Number(r.status)||0,
  headers:{get:()=>r.contentType||'application/json'},
  text:async()=>body,
  json:async()=>JSON.parse(body||'{}')};
};
const httpFetch=async(url,options={})=>{
 // In the app: Android performs the request. It has no CORS rule, a browser
 // User-Agent (the edge rejects some Java agents with a 403 challenge), its own
 // cookie jar and a longer timeout than the WebView gives a page request.
 if(bundledMode()&&nativeHttpBridge()){
  try{
   const r=await bridgeFetch(url,options);
   if(Number(r.status)>0)return asResponse(r);
  }catch{}
  // In the app, a missing bridge answer means the network failed. Falling
  // through to a same-origin fetch hands back the bundled HTML page itself -
  // a 200 that is not JSON - which surfaced as "invalid response".
  return {ok:false,status:0,headers:{get:()=>''},text:async()=>'',json:async()=>({})};
 }
 return fetch(url,options);
};
const writeFetch=async(url,options={})=>{
 const isOurServer=(()=>{try{return nativeHttpBridge()&&new URL(url,API_ORIGIN).hostname.endsWith('kozutv.bond')}catch{return false}})();
 if(isOurServer){
  const r=await bridgeFetch(url,options);
  if(Number(r.status)>0)return asResponse(r);
 }
 // Not in the app (or the bridge could not help): a normal same-origin fetch.
 // This is the website's only path, and it must never be skipped.
 if(!bundledMode())return fetch(url,options);
 // In the app a cross-origin fetch is blocked by CORS, so report the failure
 // and let the caller keep the change on the device instead.
 return {ok:false,status:0,error:'write-failed',
  text:async()=>'',json:async()=>({})};
};
const apiUrl=p=>String(p||'');
// ---- instant repeat views ---------------------------------------------------
// Every screen used to wait for its own round trip, even when the same answer
// had arrived seconds earlier (back to Home, a genre seen before, the same title
// twice). Answers are now kept in memory for the session, so a screen that has
// been seen paints on the very next frame and refreshes quietly underneath.
// Signed stream URLs (play/media/stream) are never cached: they expire.
const API_CACHE=new Map();          // path -> {body, time}
const API_INFLIGHT=new Map();       // path -> Promise, so two rows never fetch twice
const API_FRESH_MS=20000;           // a 20 s old answer is served without a fetch
const API_KEEP_MS=10*60_000;        // beyond this, a cached answer is forgotten
const neverCache=/^\/api\/(play|media|stream|img|random)(\?|$)/;
const cacheable=p=>!neverCache.test(String(p||''));
function cacheApi(p,body){
 if(!cacheable(p))return;
 try{API_CACHE.set(p,{body,time:Date.now()})}catch{}
 if(API_CACHE.size>48){
  let oldest=[...API_CACHE.entries()].sort((a,b)=>a[1].time-b[1].time).slice(0,16);
  for(const [key] of oldest)API_CACHE.delete(key);
 }
}
function readApiCache(p,maxAge=API_KEEP_MS){
 if(!cacheable(p))return null;
 const hit=API_CACHE.get(p);
 if(!hit)return null;
 if(Date.now()-hit.time>maxAge){API_CACHE.delete(p);return null}
 return hit.body;
}
window.kozutvApiCache={get:readApiCache,put:cacheApi};

// ---- speculative stream lookup ---------------------------------------------
// The stream URL is the slowest answer on the site (2-4 s at the provider). By
// the time a finger reaches Watch, the exact request has usually already been
// made in the background: the answer is reused for a few seconds, so the player
// starts on the tap instead of after it. A signed URL is short-lived by design,
// which is why this window is measured in seconds, not minutes.
const PLAY_PREFETCH=new Map();
const PLAY_PREFETCH_MS=12000;
function playRequestPath(x,ep,se,lg,prov){
 return `/api/play?type=${x.type}&id=${x.id}&episode=${ep}&season=${se===undefined?1:se}&lang=${lg||'sub'}&provider=${prov||(x.type==='anime'?'megaplay':'vidcore')}&anilistId=${x.anilistId||''}`;
}
let prefetchBusy=0;
function prefetchPlay(path){
 if(!path||PLAY_PREFETCH.has(path)||prefetchBusy>2)return;
 const hit=readApiCache(path,PLAY_PREFETCH_MS);
 if(hit){PLAY_PREFETCH.set(path,{body:hit,time:Date.now()});return}
 prefetchBusy++;
 get(path).then(body=>{
  PLAY_PREFETCH.set(path,{body,time:Date.now()});
  try{setTimeout(()=>PLAY_PREFETCH.delete(path),PLAY_PREFETCH_MS)}catch{}
 }).catch(()=>{}).then(()=>{prefetchBusy=Math.max(0,prefetchBusy-1)});
}
function takePrefetchedPlay(path){
 const hit=PLAY_PREFETCH.get(path);
 if(!hit)return null;
 PLAY_PREFETCH.delete(path);
 if(Date.now()-hit.time>PLAY_PREFETCH_MS)return null;
 return hit.body;
}
// A watch link carries everything the play request needs. Warm it on touch or
// hover, which on a phone fires a good 100-300 ms before the click.
function prefetchFromWatchHref(href){
 try{
  const m=String(href||'').match(/^\/watch\/(anime|movie|tv)\/(\d+)(?:\?([^#]*))?/);
  if(!m)return;
  const q=new URLSearchParams(m[3]||'');
  const ep=Math.max(1,Number(q.get('episode')||q.get('ep')||1));
  const se=q.has('season')?Number(q.get('season')):1;
  const lg=q.get('lang')||(m[1]==='anime'?(detail?.item?.regionalDefault||'sub'):'sub');
  const prov=q.get('provider')||(m[1]==='anime'?'megaplay':(readPreference('kozutv-server-pref','vidcore')||'vidcore'));
  prefetchPlay(playRequestPath({type:m[1],id:m[2],anilistId:detail?.item?.anilistId},ep,se,lg,prov));
 }catch{}
}
// Kept for the write path: a POST cannot be proxied by the WebView, so it goes
// through the native bridge, which needs the absolute address.
const absoluteApi=p=>{const path=String(p||'');
 if(bundledMode()&&path.startsWith('/api/'))return API_ORIGIN+path;
 return path;};
// Never let a stalled offline request hold the screen: after this long the
// bundled snapshot answers instead.
const API_TIMEOUT=9000;
const apiFetch=async p=>{
 const ctrl=typeof AbortController!=='undefined'?new AbortController():null;
 const timer=ctrl?setTimeout(()=>{try{ctrl.abort()}catch{}},API_TIMEOUT):null;
 try{
  return await httpFetch(apiUrl(p),{headers:apiHeaders(),signal:ctrl?ctrl.signal:undefined});
 }finally{if(timer)clearTimeout(timer)}
};
let stateReadInFlight=null;
const get=async p=>{
 if(p === '/api/state'){
  const auth=await loadAccount();
  // Per-account caches never share a key with another account or guest.
  const scope=auth?.user?.id ? 'user-'+auth.user.id : 'guest';
  const key=STATE_CACHE_KEY+':'+scope;
  try { const c=JSON.parse(localStorage.getItem(key)||'null');
   if(c?.state && Date.now()-c.time<60000) return c.state;
  } catch {}
  if(stateReadInFlight?.key===key)return stateReadInFlight.task;
  const task=(async()=>{try {
   const state=await responseJSON(await apiFetch(p));
   if(isOfflinePayload(state)) throw Error('offline');
   try{localStorage.setItem(key,JSON.stringify({time:Date.now(),state}))}catch{}
   return state;
  } catch(e) {
   try {const c=JSON.parse(localStorage.getItem(key)||'null');if(c?.state)return c.state}catch{}
   return {watchlist:[],history:[],settings:{},_unavailable:true};
  } finally {if(stateReadInFlight?.task===task)stateReadInFlight=null}})();
  stateReadInFlight={key,task}; return task;
 }
 // A stream is never served from a snapshot: the URL is signed and expires, and
 // a bundled copy of one is not playable. These must always be live, and a
 // failure here has to surface so the player can try another server.
 // Account-backed answers are per-visitor and change on every vote, so they are
 // never read from (or written to) the shared response cache.
 const mustBeLive=/^\/api\/(play|media|stream|auth|reactions)(\?|\/|$)/.test(p);
 // Same answer, same session: paint immediately instead of paying for a second
 // round trip for something the phone already has.
 if(!mustBeLive){
  const hot=readApiCache(p,API_FRESH_MS);
  if(hot)return hot;
  const running=API_INFLIGHT.get(p);
  if(running)return running;
 }
 const task=(async()=>{
 try{
  if(bundledMode()&&navigator.onLine===false){
   // No signal: the snapshot is the best answer there is, right now.
   const snapshot=await offlineDocument(p);
   if(snapshot)return snapshot;
  }
  // In the app: ask the real server. The bundled copy is what answers when the
  // call fails, not a shortcut that pre-empts it - racing the two meant the file
  // on the device always won, and search, new titles and genres never came from
  // the server at all.
  if(bundledMode())paintConnectingSoon();
  // The personal library is not worth waiting for: the device already has a
  // copy. In the app, give the network a short window and then use what is here.
  if(bundledMode()&&p.startsWith('/api/state')){
   const live=apiFetch(p).then(responseJSON);
   live.catch(()=>{});
   const settled=await Promise.race([
    live.catch(()=>null),
    new Promise(resolve=>{try{setTimeout(()=>resolve(null),700)}catch{resolve(null)}})
   ]);
   if(settled&&!isOfflinePayload(settled)){try{localStorage.setItem(STATE_CACHE_KEY,JSON.stringify(settled))}catch{}return settled}
   return cachedLibraryState();
  }
  const fresh=await responseJSON(await apiFetch(p));
  markLive();
  if(!mustBeLive)cacheApi(p,fresh);
  // Only a real answer may overwrite the saved library. A snapshot or an
  // offline placeholder carrying empty lists would wipe the watchlist.
  if(p.startsWith('/api/state')&&!isOfflinePayload(fresh)){try{localStorage.setItem(STATE_CACHE_KEY,JSON.stringify(fresh))}catch{}}
  return fresh;
 }catch(error){
  const cached=mustBeLive?null:await offlineDocument(p);
  if(cached){
   // Only the catalogue endpoints paint the badge: a background refresh failing
   // must not tell the user their whole page is stale.
   const visible=!/^\/api\/state/.test(p)&&!/^\/api\/(settings|prefs|log)/.test(p);
   if(visible)markStale();
   return cached}
  // Personal library: always answerable from the device.
  if(p.startsWith('/api/state'))return cachedLibraryState();
  // A cached answer beats an error screen: the catalogue shown a minute ago is
  // still the catalogue.
  const warm=readApiCache(p);
  if(warm)return warm;
  throw error;
 }
 })();
 if(cacheable(p)){
  API_INFLIGHT.set(p,task);
  task.then(()=>API_INFLIGHT.delete(p),()=>API_INFLIGHT.delete(p));
 }
 return task;
};

// --- Offline seed -----------------------------------------------------------
// A freshly installed APK has never talked to the server, so the service
// worker has nothing cached. The build ships a snapshot of the catalogue; this
// drops it into the same cache the worker reads, so the app is browsable the
// first time it opens with no connection.
async function apiCacheName(){
 // The worker owns these names and rebuilds them on every VERSION bump. A hard-coded
 // name here was read by nobody: the page wrote `kozutv-v1-api` while the worker read
 // `kozutv-v4-api`, so the bundled snapshot never reached the offline catalogue (and it
 // left an orphan cache behind that activate could not clean). Ask the worker instead.
 try{
  const txt=await (await fetch('/sw.js',{cache:'no-store'})).text();
  const m=txt.match(/const VERSION\s*=\s*'([^']+)'/);
  if(m)return `${m[1]}-api`;
 }catch{}
 try{
  const names=(await caches.keys()).filter(n=>/^kozutv-v\d+-api$/.test(n));
  return names.sort().pop()||'';
 }catch{return ''}
}
async function seedOfflineCache(){
 if(!('caches' in window))return;
 try{
  const res=await fetch('/offline-manifest.json',{cache:'no-cache'});if(!res.ok)return;
  const manifest=await res.json();if(!manifest||!Array.isArray(manifest.documents))return;
  const name=await apiCacheName();
  if(!name)return; // no worker installed yet; it warms its own cache on the first fetch
  const cache=await caches.open(name);
  for(const doc of manifest.documents){
   if(!doc||!doc.path)continue;
   const key=doc.path.replace(/^\/api\//,'');
   await cache.put(new Request('/__api/'+key),new Response(JSON.stringify(doc.body),{headers:{'Content-Type':'application/json'}}));
  }
 }catch{}
}
// No bulk offline cache: the site requires an internet connection.

// True when the page is showing cached data because the network failed.
const isOfflinePayload=d=>Boolean(d&&(d.offline||d.__offline));
const DEVICE_KEY='kozutv-device';
const deviceId=()=>{try{let v=localStorage.getItem(DEVICE_KEY);
 if(!/^[a-f0-9]{32}$/.test(v||'')){v=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(DEVICE_KEY,v)}
 return v}catch{return ''}};
// Extra headers only where the server needs them: the bundled app, whose
// requests leave the page's own origin.
const apiHeaders=extra=>{let h={...extra};
 if(bundledMode()&&deviceId())h['X-KozuTV-Device']=deviceId();
 return h;};
const postRequest=async(p,body)=>{
 try{
  const result=await responseJSON(await writeFetch(absoluteApi(p),{method:'POST',headers:apiHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)}));
  if(['/api/watchlist','/api/history','/api/settings'].includes(p) && result && Array.isArray(result.watchlist)){
   const auth=await loadAccount(); const scope=auth?.user?.id?'user-'+auth.user.id:'guest';
   try{localStorage.setItem(STATE_CACHE_KEY+':'+scope,JSON.stringify({time:Date.now(),state:result}))}catch{}
  }
  return result;
 }catch(error){
  // The server did not take it. Keep the change on the device rather than
  // pretending nothing happened: the watchlist is the user's, not the server's.
  if(bundledMode()&&p&&p.startsWith('/api/watchlist')){
   const local=cachedLibraryState();
   const list=Array.isArray(local.watchlist)?local.watchlist.slice():[];
   const record={...body};
   const at=list.findIndex(x=>String(x.id)===String(record.id)&&x.type===record.type);
   if(record.remove){if(at>=0)list.splice(at,1)}
   else if(at>=0)list[at]={...list[at],...record};
   else list.unshift(record);
   const next={...local,watchlist:list};
   try{localStorage.setItem(STATE_CACHE_KEY,JSON.stringify(next))}catch{}
   return next;
  }
  throw error;
 }
};
// Keep write responses in order so an older response cannot replace a newer
// local cache after two settings or progress changes race each other.
let stateWriteTail=Promise.resolve();
const post=(p,body)=>{const next=stateWriteTail.catch(()=>{}).then(()=>postRequest(p,body));stateWriteTail=next;return next};
function readPreference(key,fallback=''){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
// One-time migration of preferences saved under the legacy moscowtv- prefix.
// Values are only copied when the kozuTV key is unset, then legacy keys are removed.
const LEGACY_PREF_KEYS=['autoplay','autonext','autoskip','resume-playback','seek-step','save-history','spotlight-autoplay','reduce-motion','ai-transcription','anime-lang','ott-audio','server-pref','quality','speed','muted','audio-pref','brightness'];
function migrateLegacyPreferences(){
 if(typeof localStorage==='undefined')return;
 try{
  if(localStorage.getItem('kozutv:migrated-prefs-v1')==='true')return;
  for(const name of LEGACY_PREF_KEYS){
   const old='moscowtv-'+name,next='kozutv-'+name;
   try{const value=localStorage.getItem(old);if(value!==null){if(localStorage.getItem(next)===null)localStorage.setItem(next,value);localStorage.removeItem(old)}}catch{}
  }
  localStorage.setItem('kozutv:migrated-prefs-v1','true');
 }catch{}
}
migrateLegacyPreferences();
function saveHistory(data){
 // Turning history off stops all app-generated progress writes; earlier history
 // and the watchlist are deliberately left intact.
 if(readPreference('kozutv-save-history','true')==='false')return Promise.resolve();
 return post('/api/history',data).catch(()=>{});
}
function applyDisplayPreferences(){
 document.documentElement.classList.toggle('reduce-motion',readPreference('kozutv-reduce-motion','false')==='true');
 document.documentElement.classList.toggle('spotlight-paused',readPreference('kozutv-spotlight-autoplay','true')==='false');
}
// Routing: browsers use real URLs; the bundled app runs on file:// where
// pushState is blocked, so it routes over the hash instead. Everything else in
// the app keeps asking the same two helpers and cannot tell the difference.
// One document, no server: file:// (a plain export) or the APK's virtual
// origin https://kozutv.local, where the page is fetched from inside the app.
const bundledMode=()=>location.protocol==='file:'||/\.local$/.test(location.hostname);
function routePath(){
 if(bundledMode()){
  const raw=location.hash.replace(/^#/,'');
  return (raw||'/').split('?')[0]||'/';
 }
 return location.pathname;
}
function routeQuery(){
 if(bundledMode()){
  const raw=location.hash.replace(/^#/,'');
  const i=raw.indexOf('?');
  return i>=0?raw.slice(i+1):'';
 }
 return location.search;
}
function routeUrl(path,query=''){
 if(bundledMode())return '#'+path+(query?'?'+query:'');
 return path+(query?'?'+query:'');
}

// ---- Presence beacon (client side) --------------------------------------
// Sends a tiny descriptor to /api/presence; the server adds IP + country and
// posts to Discord. Fire-and-forget: never awaited, never throws, never blocks
// the UI, and it respects the privacy toggle if one is ever added.
let presenceLast='',presenceNavTimer=0;
function presence(payload){
 try{
  if(navigator.onLine===false)return;
  const key=JSON.stringify(payload);
  if(key===presenceLast)return;                 // collapse exact repeats
  presenceLast=key;
  const body=JSON.stringify(payload);
  if(navigator.sendBeacon){
   navigator.sendBeacon('/api/presence',new Blob([body],{type:'application/json'}));
  }else{
   fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  }
 }catch{}
}
// Title/season/episode of whatever the player is showing right now.
function presenceNow(activity){
 try{
  const x=detail?.item||{};
  return {activity,title:x.title||document.title||'',kind:x.type||'',
    season:Number(season)||0,episode:Number(episode)||0,
    page:routePath?routePath():location.pathname,
    provider:typeof provider==='string'?provider:'',lang:typeof lang==='string'?lang:''};
 }
 catch{return {activity,page:location.pathname}}
}

function routeGo(path,query='',mode='push'){
 const target=routeUrl(path,query);
 try{
  if(bundledMode())location.hash=target.slice(1);
  else if(mode==='replace')history.replaceState({},'',target);
  else history.pushState({},'',target);
 }catch{location.hash=target.slice(1)}
}
const params=()=>new URLSearchParams(routeQuery());
// All app-owned preference writes go through the token sync queue.
let preferenceChangeEpoch=0;
function savePreference(key,value){
 preferenceChangeEpoch++;
 try{localStorage.setItem(key,String(value));if(/^kozutv-/.test(key))post('/api/settings',{settings:{[key]:String(value)}}).catch(()=>{});return true}catch{return false}
}
function removePreference(key){
 preferenceChangeEpoch++;
 try{localStorage.removeItem(key);if(/^kozutv-/.test(key))post('/api/settings',{settings:{[key]:null}}).catch(()=>{})}catch{}
}
window.kozutvSavePreference=savePreference;
window.kozutvRemovePreference=removePreference;


const PROXIED_IMG_HOST_RE=/^https:\/\/(?:[a-z0-9-]+\.)*(?:tmdb\.org|themoviedb\.org|anipixcdn\.co|anilist\.co|anili\.st|thetvdb\.com|myanimelist\.net|kitsu\.app|kitsu\.io|tvmaze\.com)\//i;
const FALLBACK_STILL_DATA_URI='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0b0e"/><stop offset="100%" stop-color="#000000"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="160" cy="90" r="26" fill="#ff731c" fill-opacity="0.14"/><path d="M153 78l19 12-19 12z" fill="#ff731c" fill-opacity="0.55"/></svg>');
const FALLBACK_POSTER_DATA_URI='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0b0e"/><stop offset="100%" stop-color="#000000"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="200" cy="280" r="40" fill="#ff731c" fill-opacity="0.12"/><path d="M189 261l29 19-29 19z" fill="#ff731c" fill-opacity="0.5"/></svg>');

function safeImage(s){
 let raw=String(s||'').trim();
 if(!raw)return '';
 // Posters come from several CDNs; a couple still hand out http:// URLs, which
 // the sanitizer used to reject outright (and that blanked whole hero banners).
 if(/^http:\/\//i.test(raw))raw='https://'+raw.slice(7);
 // In the app, ask the native image loader (a real HTTP client with the phone's
 // own TLS and a browser User-Agent). A relative /api/img through the WebView
 // goes out with a Dalvik/Java agent, which the CDN edge can reject, and each
 // poster then waited on the page proxy: black tiles, forever.
 if(bundledMode()&&nativeImageBridge())return 'kozutv-img:'+raw;
 if(!bundledMode()&&PROXIED_IMG_HOST_RE.test(raw))return esc('/api/img?u='+encodeURIComponent(raw));
 if(/^(?:https:\/\/|\/images\/|\/api\/img\?|data:image\/svg\+xml)/i.test(raw))return esc(raw);
 return '';
}

// Keep progressive image scans hidden until the full image has loaded.

window.addEventListener('error',e=>{
 const img=e.target;
 if(!img||img.tagName!=='IMG'||img.dataset.fallbackApplied)return;
 const alternate=img.dataset.altSrc;
 if(alternate&&!img.dataset.altTried){img.dataset.altTried='1';img.src=alternate;return}
 img.dataset.fallbackApplied='1';
 const isPoster=Boolean(img.closest('.poster,.detail-layout,.continue-image,.schedule-row,.hero-image-mobile'));
 img.src=isPoster?FALLBACK_POSTER_DATA_URI:FALLBACK_STILL_DATA_URI;
},true);

const catalogGenres=['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','Horror','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'];
const spotlightPortraits={'anime:21':'/images/spotlight/anime-21.jpg','movie:1263337':'/images/spotlight/movie-1263337.jpg','anime:61607':'/images/spotlight/anime-61607.jpg','movie:1423191':'/images/spotlight/movie-1423191.jpg','tv:289517':'/images/spotlight/tv-289517.jpg','movie:1294189':'/images/spotlight/movie-1294189.jpg'};

function effectiveAnimeEpisodeCount(x,curLang=lang){
 if(!x)return 1;
 if(ANIME_REGIONAL_LANGS.includes(curLang)&&Number.isInteger(x.regionalCount)&&x.regionalCount>0)return x.regionalCount;
 if(curLang==='dub'&&Number.isInteger(x.dubCount)&&x.dubCount>0)return x.dubCount;
 if(curLang==='sub'&&Number.isInteger(x.subCount)&&x.subCount>0)return x.subCount;
 if(Number.isInteger(x.regionalCount)&&x.regionalCount>0)return x.regionalCount;
 if(Number.isInteger(x.dubCount)&&x.dubCount>0&&x.sub===false)return x.dubCount;
 return Math.max(1,Number(x.episodes)||1);
}

function renderRegionalSeasonSelect(d,idPrefix,curEp=1,curLang=lang){
 let rs=Array.isArray(d?.regionalSeasons)?d.regionalSeasons:(Array.isArray(d?.item?.regionalSeasons)?d.item.regionalSeasons:[]);
 if(rs.length<2||!ANIME_REGIONAL_LANGS.includes(curLang))return '';
 let activeStart=rs[0].startEp;
 for(let s of rs)if(curEp>=s.startEp&&curEp<=s.endEp){activeStart=s.startEp;break}
 return `<select class="season-select" id="${idPrefix}-regional-season" aria-label="Season">${rs.map(s=>`<option value="${s.startEp}" ${s.startEp===activeStart?'selected':''}>${esc(s.name||s.label)}</option>`).join('')}</select>`;
}

// Manual arc ranges for the original One Piece TV episode numbering.
// Sources: https://www.thetechbasket.com/all-one-piece-arcs-in-order/
// https://www.animefillerguide.com/anime/one-piece/ (Egghead 1089-1155,
// Elbaph 1156+). Specials remain selectable, not silently discarded.
const ONE_PIECE_ARCS=[
 ['Romance Dawn',[[1,3]]],['Orange Town',[[4,8]]],['Syrup Village',[[9,18]]],['Baratie',[[19,30]]],['Arlong Park',[[31,44]]],
 ['Loguetown',[[45,45],[48,53]]],["Buggy’s Crew Adventure Chronicles",[[46,47]]],['Warship Island',[[54,61]]],
 ['Reverse Mountain',[[62,63]]],['Whisky Peak',[[64,67]]],['Diary of Koby-Meppo',[[68,69]]],['Little Garden',[[70,77]]],['Drum Island',[[78,91]]],['Alabasta',[[92,130]]],['Post-Alabasta',[[131,135]]],
 ['Goat Island',[[136,138]]],['Ruluka Island',[[139,143]]],['Jaya',[[144,152]]],['Skypiea',[[153,195]]],['G-8',[[196,206]]],
 ['Long Ring Long Land',[[207,219]]],["Ocean’s Dream",[[220,224]]],["Foxy’s Return",[[225,228]]],['Water 7',[[229,263]]],
 ['Enies Lobby',[[264,290],[293,302],[304,312]]],['Boss Luffy specials',[[291,292],[303,303],[406,407]]],['Post-Enies Lobby',[[313,325]]],
 ['Ice Hunter',[[326,335]]],['Chopper Man special',[[336,336]]],['Thriller Bark',[[337,381]]],['Spa Island',[[382,384]]],['Sabaody Archipelago',[[385,405]]],
 ['Amazon Lily',[[408,417]]],["Straw Hat Separation",[[418,421],[453,456]]],['Impel Down',[[422,425],[430,452]]],['Little East Blue',[[426,429]]],['Marineford',[[457,489]]],['Post-War',[[490,491],[493,516]]],['Toriko crossover',[[492,492]]],
 ['Return to Sabaody',[[517,522]]],['Fish-Man Island',[[523,541],[543,574]]],['Toriko crossover 2',[[542,542]]],["Z’s Ambition",[[575,578]]],['Punk Hazard',[[579,589],[591,625]]],['Toriko and Dragon Ball crossover',[[590,590]]],['Caesar Retrieval',[[626,628]]],['Dressrosa',[[629,746]]],
 ['Silver Mine',[[747,750]]],['Zou',[[751,779]]],['Marine Rookie',[[780,782]]],['Whole Cake Island',[[783,877]]],['Reverie',[[878,889]]],
 ['Wano Country',[[890,894],[897,906],[908,1028],[1031,1085]]],['Cidre Guild',[[895,896]]],['20th anniversary special',[[907,907]]],["Uta’s Past",[[1029,1030]]],['Wano epilogue',[[1086,1088]]],['Egghead',[[1089,1155]]],['Elbaph',[[1156,99999]]]
].map(([name,ranges])=>({name,ranges,startEp:ranges[0][0],endEp:ranges.at(-1)[1]}));
function onePieceArc(d,ep){return String(d?.item?.id)==='21'?ONE_PIECE_ARCS.find(a=>a.ranges.some(([a,b])=>ep>=a&&ep<=b)):null}
function renderOnePieceSelect(d,prefix,ep){
 if(String(d?.item?.id)!=='21')return '';
 const max=effectiveAnimeEpisodeCount(d.item,lang),current=onePieceArc(d,ep);
 const ranges=a=>a.ranges.map(([start,end])=>end===99999?`${start}+`:start===end?`${start}`:`${start}–${end}`).join(', ');
 return `<select class="season-select" id="${prefix}-one-piece-arc" aria-label="One Piece arc">${ONE_PIECE_ARCS.filter(a=>a.startEp<=max).map(a=>`<option value="${a.startEp}" ${current===a?'selected':''}>${esc(a.name)} · ${ranges(a)}</option>`).join('')}</select>`;
}

function pokemonRegion(d,id,ep){
 const groups=Array.isArray(d?.pokemonRegions)?d.pokemonRegions:[];
 const current=groups.find(g=>String(g.id)===String(id)&&ep>=g.startEp&&ep<=g.endEp);
 if(current)return current;
 const first=groups.find(g=>String(g.id)===String(id))||null;
 // Existing Journeys 137–146 links overlap Master 1–10. Keep their own
 // direct episode lists usable, while the normal chronological path skips them.
 return first&&String(id)==='40351'&&ep>=137&&ep<=146?{...first,endEp:146}:first;
}
function renderPokemonSelect(d,idPrefix,curEp){
 const groups=Array.isArray(d?.pokemonRegions)?d.pokemonRegions:[];
 if(!groups.length)return '';
 const current=pokemonRegion(d,d.item?.id,curEp);
 return `<select class="season-select" id="${idPrefix}-pokemon-region" aria-label="Pokémon region and series">${groups.map(g=>`<option value="${esc(g.id)}:${g.startEp}" ${current&&g.id===current.id&&g.startEp===current.startEp?'selected':''}>${esc(g.name)}</option>`).join('')}</select>`;
}
function nextAvailableAnimeNumber(x,n,step){
 const numbers=Array.isArray(x?.availableEpisodeNumbers)?x.availableEpisodeNumbers:null;
 if(!numbers)return n+step;
 return step>0?(numbers.find(v=>v>n)||null):([...numbers].reverse().find(v=>v<n)||null);
}
// What the player is showing right now.
function currentPlayback(){
 const x=detail?.item;if(!x||routePath().indexOf('/watch/')!==0)return null;
 const rawPoster=[x.poster,x.backdrop].map(v=>String(v||'')).find(v=>/^https?:\/\//.test(v))||'';
 return {title:x.title,movie:x.type==='movie',episodeText:episodeBadgeText(x.type,episode,season),linkUrl:routePath()+routeQuery(),poster:rawPoster,startedAt:0};
}
function disposeVideo(){playGeneration++;if(videoPlayer){try{videoPlayer.dispose()}catch{}videoPlayer=null}try{if('mediaSession' in navigator)navigator.mediaSession.metadata=null}catch{}}

function closeSearchBox(){
 document.querySelector('.searchbox')?.classList.remove('open');
 headerEl?.classList.remove('search-open');
}

function nav(path){
 // Every deliberate in-app navigation counts as an action.
 try{ if(presenceNavTimer)clearTimeout(presenceNavTimer);
  presenceNavTimer=setTimeout(()=>{
   const p=routePath();
   const q=params().get('q')||'';
   presence({activity:q?'searching':'browsing',page:p,query:q,
     title:q?'':(p.startsWith('/browse/')?(detail?.item?.title||''):'')});
  },1200); }catch{}
 clearTimeout(searchTimer);
 episodeSwitchGeneration++;
 disposeVideo();
 routeGo(path);
 let nextQ=new URLSearchParams(routeQuery()).get('q')||'';
 search.value=nextQ;
 if(!nextQ)closeSearchBox();
 render();
 window.scrollTo(0,0);
}

function card(x){return `<article class="card" data-open="${url(x.type,x.id)}"><div class="poster"><img data-load-whole decoding="async" loading="lazy" src="${safeImage(x.poster||x.backdrop)||FALLBACK_POSTER_DATA_URI}" data-alt-src="${safeImage(x.backdrop||'')}" alt="${esc(x.title)}">${x.rating?`<span class="rating">${metaIco('star')}${esc(x.rating)}</span>`:''}${x.upcoming?'<span class="badge badge-upcoming">Upcoming</span>':''}</div><h3 title="${esc(x.title)}">${esc(x.title)}</h3><p>${esc(x.year||'New')} &nbsp;·&nbsp; ${x.type==='anime'?(x.isMovie?'Anime Movie':'Anime Series'):x.type==='tv'?'TV Series':'Movie'}</p></article>`}
function grid(data,idAttr=''){return data.length?`<div class="grid"${idAttr?` id="${idAttr}"`:''}>${data.map(card).join('')}</div>`:'<div class="empty">No titles found.</div>'}

function hero(data){
 let x=data[slide%data.length];if(!x)return '';
 let feature=isFeature(x),key=x.type+':'+x.id,saved=savedKeys.has(key);
 let watch=`/watch/${x.type}/${x.id}${feature?'':'?season=1&episode=1'}`;
 const firstImage=(...list)=>{for(const c of list){const v=safeImage(c||'');if(v)return v}return ''};
 let art=firstImage(x.backdrop,x.poster,spotlightPortraits[key]);
 // The phone banner falls back through the same list: ending on placeholder
 // art here is what put a grey smear across the top of the hero.
 // A portrait crop is only worth showing if it exists for THIS title; a missing
 // path used to win the chain and render as broken art over the whole hero.
 const portrait=spotlightPortraits[key]&&x.spotlightPortrait?spotlightPortraits[key]:'';
 // Worst case the phone shows the sharp backdrop rather than placeholder art.
 let mobileArt=firstImage(x.spotlightHighRes,x.spotlightBanner,portrait,x.backdrop,x.poster)||art;
 // Spotlight keeps type, year, quality and rating only - no genre text.
 const genreSummary='';
 return `<section class="hero" data-hero-details="${url(x.type,x.id)}"><img class="hero-image" loading="lazy" src="${art||FALLBACK_STILL_DATA_URI}" data-alt-src="${safeImage(x.poster||'')}" alt="" fetchpriority="high" decoding="async"><img class="hero-image-mobile" loading="lazy" src="${mobileArt||FALLBACK_POSTER_DATA_URI}" data-alt-src="${safeImage(x.spotlightBanner||spotlightPortraits[key]||x.backdrop||'')}" alt="" fetchpriority="high" decoding="async"><div class="container hero-content"><div class="hero-copy"><h1><a href="${url(x.type,x.id)}">${esc(x.title)}</a></h1><div class="meta hero-meta"><span>${metaIco(x.type==='anime'?(feature?'film':'tv'):x.type==='tv'?'tv':'film')}${x.type==='anime'?(feature?'Anime Movie':'Anime'):x.type==='tv'?'Web Series':'Movie'}</span>${genreSummary}${x.year?`<span>${metaIco('calendar')}${esc(x.year)}</span>`:''}<span class="quality">HD</span>${x.rating?`<span>${metaIco('star')}${esc(x.rating)}</span>`:''}</div><p class="description">${esc(short(x.description||'',220))}</p><div class="hero-actions"><button class="btn hero-watch" data-open="${watch}">${ico('play')}<span>Start Watching${feature?'':' E1'}</span></button><button class="hero-save ${saved?'saved':''}" type="button" data-hero-save="${key}" aria-label="${saved?'Remove from':'Add to'} Watchlist" aria-pressed="${saved?'true':'false'}" title="Watchlist">${headIcon('bookmark')}</button></div></div><div class="dots">${data.slice(0,6).map((_,i)=>`<button data-slide="${i}" class="${i===slide?'active':''}" aria-label="Spotlight ${i+1}"></button>`).join('')}</div></div></section>`;
}

async function catalog(isSearch=false){
 const route=++routeGeneration;
 stopBrowseRows();stopGenrePages();
 let p=params(),urlQ=(p.get('q')||'').trim();
 if(urlQ&&!search.value.trim())search.value=urlQ;
 let term=search.value.trim();
 if(term)isSearch=true;
 let genre=isSearch?null:p.get('genre'),collection=isSearch?null:p.get('collection');
 document.title=isSearch?`Search “${term}” — KozuTV`:(genre||collection)?`${genre||collection} — KozuTV`:DEFAULT_DOC_TITLE;
 app.innerHTML='<div class="loading">Loading…</div>';
 // Second visit this session: the catalogue from a minute ago is already in
 // hand, so it paints now and the fresh answer replaces it when it lands.
 // The spinner is only ever shown for a first load, never for a revisit.
 const warmCatalogue=!isSearch&&!genre&&!collection?readApiCache('/api/browse'):null;
 if(warmCatalogue&&(warmCatalogue.items||[]).length){
  try{
   items=warmCatalogue.items;
   spotlightItems=warmCatalogue.spotlight?.length?warmCatalogue.spotlight.slice(0,6):items.filter(x=>x.poster&&x.title&&x.backdrop).slice(0,6);
   suggestions=warmCatalogue.suggestions||[];
   drawCatalog();
  }catch{}
 }
 try{
  let endpoint=isSearch?`/api/search-all?q=${encodeURIComponent(term)}&page=1`:collection?`/api/collection?name=${encodeURIComponent(collection)}&page=1`:genre?`/api/genre?name=${encodeURIComponent(genre)}&page=1`:'/api/browse';
  let [d,state]=await Promise.all([get(endpoint),get('/api/state')]);
  if(route!==routeGeneration)return;
  items=d.items||[];
  spotlightItems=!isSearch&&!genre&&!collection?(d.spotlight?.length?d.spotlight.slice(0,6):items.filter(x=>x.poster&&x.title&&x.backdrop).slice(0,6)):[];
  suggestions=isSearch||genre||collection?[]:d.suggestions||[];
  savedKeys=new Set((state.watchlist||[]).map(x=>x.type+':'+x.id));
  continueItems=isSearch||genre||collection?[]:(state.history||[]).slice(0,8);
  genreRows={};
  genreQueue=[];activeGenres=[];
  slide=0;
  let filtered=isSearch||Boolean(genre)||Boolean(collection);
  if(filtered){
   pagedState={
    mode:isSearch?'search':collection?'collection':'genre',
    endpointBase:isSearch?`/api/search-all?q=${encodeURIComponent(term)}`:collection?`/api/collection?name=${encodeURIComponent(collection)}`:`/api/genre?name=${encodeURIComponent(genre)}`,
    page:1,
    hasMore:Boolean(d.hasMore),
    seen:new Set(items.map(x=>`${x.type}:${x.id}`)),
    total:Number(d.totalResults)||items.length
   };
  }else{
   pagedState={mode:'',endpointBase:'',page:1,hasMore:false,seen:new Set(),total:0};
  }
  drawCatalog(filtered,genre||collection||term,Boolean(genre||collection));
  if(!filtered)startBrowseRows();
  else if(pagedState.mode==='genre')startGenrePages();
 }catch(e){
  if(route!==routeGeneration)return;
  app.innerHTML=`<div class="container content"><div class="empty"><h2>Catalog unavailable</h2><p class="error">${esc(e.message)}</p><button class="btn" data-retry>Try again</button></div></div>`;
 }
}

const collectionIcons={'Hindi Dubbed':'headphones','Tamil Dubbed':'headphones','Telugu Dubbed':'headphones','New in 2026':'calendar'};
const genreIcons={Action:'swords',Adventure:'compass',Animation:'sparkles',Comedy:'laugh',Crime:'shield',Documentary:'film',Drama:'theater',Family:'users',Fantasy:'wand',Horror:'ghost',Mecha:'cpu',Music:'music',Mystery:'search',Psychological:'brain',Romance:'heart','Sci-Fi':'rocket','Slice of Life':'coffee',Sports:'trophy',Supernatural:'sparkles',Thriller:'zap'};
function sectionTitle(title,icon='sparkles',tag='h2'){return `<${tag} class="section-title"><span class="section-icon">${headIco(icon)}</span><span>${esc(title)}</span></${tag}>`}

// Randomized, demand-loaded category rows. Only nearby rows have cards in
// the DOM; measured placeholders preserve scroll position and are reversible.
const shuffleRows=list=>{let a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function stopBrowseRows(){if(!browseRowsSession)return;browseRowsSession.stopped=true;browseRowsSession.observer?.disconnect();browseRowsSession.sentinelObserver?.disconnect();browseRowsSession=null}
function startBrowseRows(){
 stopBrowseRows();
 const area=document.querySelector('#browse-categories'),sentinel=document.querySelector('#browse-sentinel');
 if(!area||!sentinel)return;
 const session={stopped:false,queue:shuffleRows([...catalogGenres,...Object.keys(collectionIcons)]),cycle:1,serial:0,cache:new Map(),busy:false,empty:0};
 browseRowsSession=session;
 const alive=()=>browseRowsSession===session&&!session.stopped&&area.isConnected;
 function endpoint(row){return `/api/${row.kind==='collection'?'collection':'genre'}?home=1&name=${encodeURIComponent(row.name)}&page=${row.page}`}
 function cacheSet(key,value){session.cache.delete(key);session.cache.set(key,value);while(session.cache.size>8)session.cache.delete(session.cache.keys().next().value)}
 function mount(el,rows){
  if(!alive()||!el.isConnected||el.dataset.near!=='1')return;
  el.style.height='';el.classList.remove('is-virtual');
  if(!rows.length){el.remove();return}
  const name=el.dataset.name,icon=genreIcons[name]||collectionIcons[name]||'sparkles';
  const destination=el.dataset.kind==='collection'?`/browse?collection=${encodeURIComponent(name)}`:`/browse?genre=${encodeURIComponent(name)}`;
  el.innerHTML=`<div class="category-heading"><h2 class="section-title"><a href="${destination}" class="category-title-link"><span class="section-icon">${headIco(icon)}</span><span>${esc(name)}</span></a></h2></div>${grid(rows.slice(0,12))}`;
  el.removeAttribute('aria-busy');
 }
 async function populate(el){
  if(!alive()||!el.isConnected||el.dataset.fetching==='1')return;
  const key=el.dataset.key,cached=session.cache.get(key);
  if(cached){cacheSet(key,cached);mount(el,cached);return}
  el.dataset.fetching='1';el.setAttribute('aria-busy','true');
  const row={name:el.dataset.name,kind:el.dataset.kind,page:Number(el.dataset.page)};
  try{
   let d=null;
   try{d=await get(endpoint(row))}catch{ /* fall through to the bundle */ }
   if(!alive()||!el.isConnected)return;
   // The snapshot holds the whole catalogue but no per-genre endpoint. Rather
   // than showing "temporarily unavailable" seven times down the page, build
   // the row from titles the device already has. Only in the app: on the live
   // site an empty category must stay empty so the feed can end properly.
   if(inApp()&&(!d||!(d.items||[]).length))d={items:await offlineItemsFor(row.name)};
   let rows=(d.items||[]).filter(x=>x?.poster&&x?.title);
   cacheSet(key,rows);session.empty=rows.length?0:session.empty+1;
   if(!rows.length){el.remove();if(session.empty>=8){session.exhausted=true;session.sentinelObserver?.disconnect();sentinel.textContent='You are all caught up.'}return}
   mount(el,rows);
  }catch{if(alive()&&el.isConnected){el.innerHTML='<div class="category-unavailable">This category is temporarily unavailable.</div>';el.style.height='';el.removeAttribute('aria-busy')}}
  finally{delete el.dataset.fetching}
 }
 session.observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const el=entry.target;if(!alive()||!el.isConnected)continue;
   el.dataset.near=entry.isIntersecting?'1':'0';
   if(entry.isIntersecting)populate(el);
   else if(el.children.length&&!el.querySelector('.category-unavailable')){
    const height=el.getBoundingClientRect().height;if(height>30){el.style.height=height+'px';el.classList.add('is-virtual');el.replaceChildren()}
   }
  }
 },{rootMargin:'600px 0px'});
 function nextRow(){
  if(!session.queue.length){session.cycle++;session.queue=shuffleRows(catalogGenres)}
  const name=session.queue.shift(),kind=Object.hasOwn(collectionIcons,name)?'collection':'genre';
  return {name,kind,page:kind==='collection'?1:session.cycle};
 }
 function append(){
  if(!alive()||session.busy||session.exhausted)return;session.busy=true;
  for(let i=0;i<2;i++){
   const row=nextRow(),el=document.createElement('section');el.className='genre-section category-row is-virtual';
   el.dataset.name=row.name;el.dataset.kind=row.kind;el.dataset.page=String(row.page);el.dataset.key=String(++session.serial);
   el.style.height=window.innerWidth<650?'780px':'650px';el.innerHTML='<div class="loading category-loading">Loading category…</div>';
   area.append(el);session.observer.observe(el);
  }
  session.busy=false;
  // A short row can leave the sentinel inside its root margin after append.
  // Reobserve it after layout so loading continues rather than stalling at the bottom.
  requestAnimationFrame(()=>{if(alive()&&!session.exhausted){session.sentinelObserver?.unobserve(sentinel);session.sentinelObserver?.observe(sentinel)}});
 }
 session.sentinelObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))append()},{rootMargin:'700px 0px'});
 append();session.sentinelObserver.observe(sentinel);
}

// A Spotlight slide transition keeps the outgoing and incoming slides in a
// clipped stage. Pointer swipes deliberately follow kozuTV's requested
// direction: left = previous; right = next.
let heroGesture=null,suppressHeroClickUntil=0,suppressHeroPoint=null;
function reducedMotion(){return readPreference('kozutv-reduce-motion','false')==='true'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function showSlide(next,direction=1){
 const stage=document.querySelector('.hero-stage'),current=stage?.querySelector('.hero:not(.hero-leaving)');
 if(!current||!spotlightItems.length)return;
 const count=spotlightItems.length,index=((next%count)+count)%count;if(index===slide)return;
 stage.querySelectorAll('.hero-leaving').forEach(el=>el.remove());
 slide=index;
 const frag=document.createRange().createContextualFragment(hero(spotlightItems)),incoming=frag.firstElementChild;
 if(reducedMotion()){current.replaceWith(incoming);return}
 // direction +1 = "next": the incoming slide arrives from the RIGHT and the
 // outgoing slide leaves to the LEFT, so content travels the same way the user
 // is moving through the list. direction -1 = "previous" mirrors that.
 current.classList.add('hero-leaving',direction<0?'hero-leave-right':'hero-leave-left');
 current.setAttribute('aria-hidden','true');current.setAttribute('inert','');
 incoming.classList.add(direction<0?'hero-enter-left':'hero-enter-right');
 stage.append(incoming);
 setTimeout(()=>{current.remove();incoming.classList.remove('hero-enter-right','hero-enter-left')},470);
}
document.addEventListener('pointerdown',event=>{
 const hero=event.target.closest?.('.hero:not(.hero-leaving)');
 if(!hero||event.button!==0||event.target.closest('button,input,select')||!spotlightItems.length)return;
 heroGesture={id:event.pointerId,x:event.clientX,y:event.clientY};
});
document.addEventListener('pointercancel',event=>{if(heroGesture?.id===event.pointerId)heroGesture=null});
document.addEventListener('pointerup',event=>{
 if(!heroGesture||heroGesture.id!==event.pointerId)return;
 const dx=event.clientX-heroGesture.x,dy=event.clientY-heroGesture.y;heroGesture=null;
 if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.35)return;
 suppressHeroClickUntil=performance.now()+500;suppressHeroPoint={x:event.clientX,y:event.clientY};
 // FIXED (v6b): a swipe left advances to the NEXT slide and the new slide must
 // travel in from the RIGHT (direction +1 -> hero-enter-right / hero-leave-left),
 // matching the finger. Swiping right goes back and comes in from the left.
 // The old call passed direction = the same sign as dx, which sent the incoming
 // slide in from the side the finger came from - the "inverted" motion.
 showSlide(slide+(dx<0?1:-1),dx<0?1:-1);
});
document.addEventListener('click',event=>{
 if(event.detail&&performance.now()<suppressHeroClickUntil&&suppressHeroPoint&&Math.hypot(event.clientX-suppressHeroPoint.x,event.clientY-suppressHeroPoint.y)<28){
  suppressHeroClickUntil=0;event.preventDefault();event.stopImmediatePropagation();
 }
},true);
document.addEventListener('dragstart',event=>{if(event.target.closest?.('.hero'))event.preventDefault()});
const carousel=setInterval(()=>{
 if(readPreference('kozutv-spotlight-autoplay','true')==='false'||routePath()!=='/browse'||params().has('genre')||params().has('collection')||params().has('q')||search.value.trim()||document.hidden||!spotlightItems.length)return;
 showSlide(slide+1,1);
},6500);

function drawCatalog(filtered=false,term='',isGenre=false){
 let data=items.filter(x=>x.poster&&x.title);
 let continueSection=!filtered&&continueItems.length?`<section class="continue-section home-continue">${sectionTitle('Continue Watching','history')}${continueGrid(continueItems)}</section>`:'';
 let categories=!filtered?'<div id="browse-categories"></div><div id="browse-sentinel" class="browse-sentinel" aria-live="polite"></div>':'';
 let isGenrePage=filtered&&pagedState.mode==='genre';
 let moreResults=filtered&&!isGenrePage&&pagedState.hasMore?`<div class="category-more"><button class="category-more-button" data-more-results aria-label="Show more titles">${ico('plus')}<span>Show more</span></button></div>`:'';
 let headingIcon=filtered?(isGenre?(genreIcons[term]||collectionIcons[term]||'sparkles'):'search'):'flame';
 let headingText=filtered?(isGenre?term:`Results for “${term}”`):'Trending Now';
 let headingTag=filtered?'h1':'h2';
 app.innerHTML=`${!filtered&&spotlightItems.length?`<div class="hero-stage">${hero(spotlightItems)}</div>`:''}<div class="container content">${continueSection}${sectionTitle(headingText,headingIcon,headingTag)}${isGenrePage?'<div id="genre-pages"></div><div id="genre-sentinel" class="genre-sentinel" aria-live="polite"></div>':grid(data,filtered?'paged-grid':'trending-grid')}${!filtered&&suggestions.length?`<section class="suggestions">${sectionTitle('Suggested for you','sparkles')}${grid(suggestions)}</section>`:''}${categories}${moreResults}</div>`;
}

// Genre pages keep only a small LRU of item records and nearby card DOM. Each
// measured page is replaced with a reversible height-preserving placeholder.
// Refetching an evicted page is cheap because the server caches normalized pages.
function stopGenrePages(){
 const session=genrePagesSession;if(!session)return;
 session.stopped=true;session.observer?.disconnect();session.sentinelObserver?.disconnect();
 for(const controller of session.controllers)controller.abort();
 window.removeEventListener('resize',session.onResize);genrePagesSession=null;
}
function startGenrePages(){
 stopGenrePages();
 const area=document.querySelector('#genre-pages'),sentinel=document.querySelector('#genre-sentinel');
 if(!area||!sentinel)return;
 const session={stopped:false,page:1,hasMore:pagedState.hasMore,busy:false,error:false,empty:0,seen:new Set(),cache:new Map(),records:[],controllers:new Set()};
 genrePagesSession=session;
 const alive=()=>genrePagesSession===session&&!session.stopped&&area.isConnected;
 const itemKey=x=>`${x.type}:${x.id}`;
 const valid=x=>x?.poster&&x?.title&&x?.type&&x?.id;
 function cacheSet(page,rows){session.cache.delete(page);session.cache.set(page,rows);while(session.cache.size>8)session.cache.delete(session.cache.keys().next().value)}
 function columns(){return innerWidth<=380?2:innerWidth<=650?3:innerWidth<=800?4:innerWidth<=1050?5:6}
 function gaps(){return innerWidth<=380?[11,18]:innerWidth<=650?[10,19]:[16,24]}
 function mount(record,rows){
  const el=record.el;if(!alive()||!el.isConnected||el.dataset.near!=='1')return;
  el.style.height='';el.removeAttribute('aria-hidden');el.classList.remove('is-virtual');
  el.innerHTML=rows.length?`<div class="grid">${rows.map(card).join('')}</div>`:'<div class="empty">These titles are temporarily unavailable.</div>';
 }
 async function fetchPage(page){
  const controller=new AbortController();session.controllers.add(controller);
  try{const r=await httpFetch(`${apiUrl(pagedState.endpointBase)}&page=${page}`,{signal:controller.signal});
   if(!r.status)throw Error('network');
   return await responseJSON(r)}
  finally{session.controllers.delete(controller)}
 }
 async function populate(record){
  const el=record.el;if(!alive()||el.dataset.fetching==='1')return;
  const cached=session.cache.get(record.page);
  if(cached){cacheSet(record.page,cached);mount(record,cached);return}
  el.dataset.fetching='1';
  try{
   const d=await fetchPage(record.page);if(!alive())return;
   const wanted=new Set(record.keys),rows=(d.items||[]).filter(x=>valid(x)&&wanted.has(itemKey(x)));
   cacheSet(record.page,rows);mount(record,rows);
  }catch(error){
   if(alive()&&error?.name!=='AbortError'&&el.dataset.near==='1'){
    el.style.height='';el.classList.remove('is-virtual');el.removeAttribute('aria-hidden');
    el.innerHTML='<div class="empty">This page could not be loaded. <button type="button" class="btn secondary" data-genre-page-retry>Try again</button></div>';
   }
  }finally{delete el.dataset.fetching}
 }
 session.observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   const el=entry.target,record=el._genreRecord;if(!alive()||!record||!el.isConnected)continue;
   el.dataset.near=entry.isIntersecting?'1':'0';
   if(entry.isIntersecting)populate(record);
   else if(el.children.length&&!el.querySelector('[data-genre-page-retry]')){
    const height=el.getBoundingClientRect().height;
    if(height>30){record.measure={height,width:area.clientWidth,cols:columns(),gaps:gaps()};el.style.height=height+'px';el.classList.add('is-virtual');el.setAttribute('aria-hidden','true');el.replaceChildren()}
   }
  }
 },{rootMargin:'1400px 0px'});
 function addRecord(page,rows){
  if(!rows.length)return;
  const el=document.createElement('section'),record={page,keys:rows.map(itemKey),el,measure:null};
  el.className='genre-page';el.dataset.page=String(page);el.dataset.near='1';el._genreRecord=record;
  session.records.push(record);area.append(el);cacheSet(page,rows);mount(record,rows);session.observer.observe(el);
 }
 const initial=items.filter(valid).filter(x=>{const k=itemKey(x);if(session.seen.has(k))return false;session.seen.add(k);return true});
 addRecord(1,initial);
 if(!initial.length&&!session.hasMore)area.innerHTML='<div class="empty">No titles found.</div>';
 async function loadMore(){
  if(!alive()||session.busy||!session.hasMore||session.error)return;
  session.busy=true;sentinel.innerHTML='<span class="button-loader" aria-label="Loading"></span>';
  try{
   const next=session.page+1,d=await fetchPage(next);if(!alive())return;
   session.page=next;
   const fresh=(d.items||[]).filter(valid).filter(x=>{const k=itemKey(x);if(session.seen.has(k))return false;session.seen.add(k);return true});
   session.empty=fresh.length?0:session.empty+1;addRecord(next,fresh);
   // Avoid retry loops on finite or broken upstream catalogs, including pages
   // that contain only duplicates or unusable posters.
   session.hasMore=Boolean(d.hasMore)&&next<2000&&session.empty<4;
   sentinel.innerHTML='';
   if(!session.hasMore)session.sentinelObserver?.disconnect();
  }catch(error){
   if(alive()&&error?.name!=='AbortError'){
    session.error=true;session.sentinelObserver?.disconnect();
    sentinel.innerHTML='<button type="button" class="btn secondary" data-genre-retry>Try again</button>';
   }
  }finally{
   session.busy=false;
   requestAnimationFrame(()=>{if(alive()&&session.hasMore&&!session.error){session.sentinelObserver?.unobserve(sentinel);session.sentinelObserver?.observe(sentinel)}});
  }
 }
 session.retry=()=>{if(!alive())return;session.error=false;sentinel.innerHTML='';loadMore()};
 session.retryPage=el=>{const record=el.closest('.genre-page')?._genreRecord;if(record)populate(record)};
 session.sentinelObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadMore()},{rootMargin:'1400px 0px'});
 if(session.hasMore)session.sentinelObserver.observe(sentinel);
 let resizeFrame=0;
 session.onResize=()=>{
  cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{
   if(!alive())return;const width=area.clientWidth,cols=columns(),[colGap,rowGap]=gaps();
   for(const r of session.records){
    const m=r.measure;if(!m||!r.el.classList.contains('is-virtual')||!r.keys.length)continue;
    const oldRows=Math.ceil(r.keys.length/m.cols),newRows=Math.ceil(r.keys.length/cols);
    const oldPoster=(m.width-(m.cols-1)*m.gaps[0])/m.cols*1.5;
    const extra=Math.max(0,(m.height+m.gaps[1])/oldRows-oldPoster-m.gaps[1]);
    const poster=(width-(cols-1)*colGap)/cols*1.5;
    const height=Math.max(1,newRows*(poster+extra+rowGap)-rowGap);
    r.el.style.height=height+'px';r.measure={height,width,cols,gaps:[colGap,rowGap]};
   }
  });
 };
 window.addEventListener('resize',session.onResize,{passive:true});
}

// Icons come from the inlined Fluent System Icon set (public/icons.js): flat,
// rounded, solid 24 px glyphs that inherit currentColor.
const icons=window.FLUENT_ICONS||{};
const headingIcons=window.HEADING_ICONS||{};
const metaIcons=window.META_ICONS||{};
const headerIcons=window.HEADER_ICONS||{};
function ico(n,extra=''){return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${icons[n]||''}</svg>`}
// Meta rows and ratings use the original white stroke glyphs from V5.4.14;
// only the menu, header and section icons stay bold orange.
function headIcon(n){return `<svg class="ui-icon header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${headerIcons[n]||headingIcons[n]||icons[n]||''}</svg>`}
function metaIco(n){return `<svg class="ui-icon meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${metaIcons[n]||headingIcons[n]||icons[n]||''}</svg>`}
function headIco(n){return `<svg class="ui-icon heading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${headingIcons[n]||icons[n]||''}</svg>`}

function animeEpisodeRow(x,id,active){
 let art=x.still||detail?.item.backdrop||detail?.item.poster;
 let src=art?safeImage(art):FALLBACK_STILL_DATA_URI;
 return `<button class="episode-row ${x.number===active?'selected':''}" data-open="/watch/anime/${id}?episode=${x.number}&lang=${lang}"><img data-load-whole decoding="async" loading="lazy" src="${src}" data-alt-src="${safeImage(detail?.item?.backdrop||detail?.item?.poster||'')}" alt=""><span><strong>${x.number}. ${esc(x.title||`Episode ${x.number}`)}</strong>${x.description?`<small>${esc(short(x.description,190))}</small>`:''}</span></button>`;
}
function renderAnimeEpisodes(mode){
 let state=animeEpisodeLists[mode],container=document.querySelector(`#${mode}-anime-episodes`);if(!state||!container)return;
 let pages=[...state.pages.keys()].sort((a,b)=>a-b),episodes=new Map();
 for(let page of pages)for(let x of state.pages.get(page).episodes||[])if((!state.startFrom||x.number>=state.startFrom)&&(!state.endAt||x.number<=state.endAt)&&(!state.ranges||state.ranges.some(([a,b])=>x.number>=a&&x.number<=b)))episodes.set(x.number,x);
 let last=pages.at(-1)||1,lastRows=state.pages.get(last)?.episodes||[],more=state.pages.get(last)?.hasNext&&(!state.endAt||!lastRows.length||Number(lastRows.at(-1)?.number)<state.endAt),button=(page,label)=>`<div class="anime-pagination"><button class="btn secondary" data-anime-page="${page}" data-anime-mode="${mode}">${label}</button></div>`;
 container.innerHTML=state.error?'<div class="empty">Episodes are unavailable right now.</div>':`<div class="episode-detail-list anime-episode-list">${[...episodes.values()].sort((a,b)=>a.number-b.number).map(x=>animeEpisodeRow(x,state.id,state.active)).join('')||'<div class="empty">No episodes listed.</div>'}</div>${more?button(last+1,'Show more'):''}`;
 if(mode==='watch'&&detail?.item)refreshNowPlaying(detail.item);
}
async function loadAnimeEpisodes(id,mode,page=1,active=0,reset=false,startFrom=0,endAt=0){
 let container=document.querySelector(`#${mode}-anime-episodes`);if(!container)return;
 let epLang=ANIME_REGIONAL_LANGS.includes(lang)?lang:(lang==='dub'?'dub':'sub');
 let state=animeEpisodeLists[mode];
 if(reset||!state||state.id!==id||state.epLang!==epLang){state={id,epLang,pages:new Map(),active,error:'',loading:false,startFrom,endAt,ranges:String(id)==='21'&&startFrom?onePieceArc({item:{id}},startFrom)?.ranges:null};animeEpisodeLists[mode]=state;container.innerHTML='<div class="loading">Loading episodes…</div>'}
 if(state.loading)return;state.loading=true;state.error='';let clicked=container.querySelector(`[data-anime-page="${page}"]`);if(clicked){clicked.disabled=true;clicked.innerHTML='<span class="button-loader" aria-label="Loading"></span>';clicked.classList.add('is-loading')}
 try{let d=await get(`/api/anime-episodes?id=${id}&page=${page}&lang=${epLang}`);if(animeEpisodeLists[mode]!==state)return;state.pages.set(page,d);state.active=active||state.active}
 catch(e){state.error=e.message;if(reset)state.pages.clear()}
 finally{state.loading=false;if(animeEpisodeLists[mode]===state)renderAnimeEpisodes(mode)}
}

function tvEpisodeRow(e,id,seasonNum,active){
 let art=e.still||detail?.item?.backdrop||detail?.item?.poster;
 let src=art?safeImage(art):FALLBACK_STILL_DATA_URI;
 return `<button class="episode-row ${e.number===active?'selected':''}" data-open="/watch/tv/${id}?season=${seasonNum}&episode=${e.number}"><img data-load-whole decoding="async" loading="lazy" src="${src}" data-alt-src="${safeImage(detail?.item?.backdrop||detail?.item?.poster||'')}" alt=""><span><strong>${e.number}. ${esc(e.title)}</strong>${e.description?`<small>${esc(short(e.description,160))}</small>`:''}</span></button>`;
}
function renderTvEpisodes(mode){
 let st=tvEpisodeLists[mode];
 let box=document.querySelector(mode==='detail'?'#detail-episodes':'#watch-episodes');
 if(!st||!box)return;
 if(!st.episodes.length){
  box.innerHTML=mode==='detail'?'No episode information available.':'No episodes available.';
  return;
 }
 let slice=st.episodes.slice(st.startIdx,st.endIdx);
 let prevBtn=st.startIdx>0?`<div class="anime-pagination"><button class="btn secondary" type="button" data-tv-more="prev" data-tv-mode="${mode}">Show earlier episodes</button></div>`:'';
 let nextBtn=st.endIdx<st.episodes.length?`<div class="anime-pagination"><button class="btn secondary" type="button" data-tv-more="next" data-tv-mode="${mode}">Show more</button></div>`:'';
 box.innerHTML=prevBtn+slice.map(e=>tvEpisodeRow(e,st.id,st.seasonNum,st.active)).join('')+nextBtn;
 if(mode==='watch'&&detail?.item)refreshNowPlaying(detail.item);
}
async function loadTvEpisodes(mode,id,seasonNum,active=0){
 let box=document.querySelector(mode==='detail'?'#detail-episodes':'#watch-episodes');
 if(!box)return;
 const request=++tvEpisodeRequest[mode];
 box.innerHTML='<div class="loading">Loading episodes…</div>';
 try{
  let d=await get(`/api/season?id=${id}&season=${seasonNum}`);
  if(request!==tvEpisodeRequest[mode]||!box.isConnected)return;
  let eps=Array.isArray(d.episodes)?d.episodes:[];
  let startIdx=0,endIdx=eps.length;
  if(eps.length>TV_EP_CHUNK){
   if(active>0){
    let activePos=eps.findIndex(e=>Number(e.number)===Number(active));
    if(activePos<0)activePos=0;
    startIdx=Math.floor(activePos/TV_EP_CHUNK)*TV_EP_CHUNK;
    endIdx=Math.min(eps.length,startIdx+TV_EP_CHUNK);
   }else{
    startIdx=0;
    endIdx=TV_EP_CHUNK;
   }
  }
  tvEpisodeLists[mode]={id,seasonNum,active,episodes:eps,startIdx,endIdx};
  renderTvEpisodes(mode);
 }catch{
  if(request===tvEpisodeRequest[mode]&&box.isConnected)box.textContent='Episodes unavailable right now.';
 }
}
async function loadDetailEpisodes(id,num){return loadTvEpisodes('detail',id,num,0)}
async function loadWatchEpisodes(id,number,active){return loadTvEpisodes('watch',id,number,active)}

function watchlistButton(){return `<button class="btn secondary" data-save>${ico('plus')}<span class="desktop-action">Add to Watchlist</span><span class="mobile-action">Add</span></button>`}

function episodeTargets(){
 if(!detail||isFeature(detail.item))return {prev:null,next:null};let x=detail.item;
 if(x.type==='anime'){
  let seasons=Array.isArray(detail.seasons)?detail.seasons:[],count=effectiveAnimeEpisodeCount(x,lang),own=n=>({type:'anime',id:x.id,season:1,episode:n});
  const groups=Array.isArray(detail.pokemonRegions)?detail.pokemonRegions:[];
  const gi=groups.findIndex(g=>String(g.id)===String(x.id)&&episode>=g.startEp&&episode<=g.endEp);
  const prior=nextAvailableAnimeNumber(x,episode,-1),following=nextAvailableAnimeNumber(x,episode,1);
  if(String(x.id)==='40351'&&episode>=137&&episode<=146){
   return {prev:own(episode-1),next:episode<146?own(episode+1):{type:'anime',id:'53874',season:1,episode:11}};
  }
  if(gi>=0){const g=groups[gi],before=groups[gi-1],after=groups[gi+1];
   return {prev:prior&&prior>=g.startEp?own(prior):before?{type:'anime',id:before.id,season:1,episode:before.endEp}:null,
    next:following&&following<=Math.min(g.endEp,count)?own(following):after?{type:'anime',id:after.id,season:1,episode:after.startEp}:null};
  }
  let index=seasons.findIndex(s=>String(s.id)===String(x.id));
  return {prev:prior&&prior>=1?own(prior):index>0?{type:'anime',id:seasons[index-1].id,season:1,episode:Math.max(1,Number(seasons[index-1].episodes)||1)}:null,next:following&&following<=count?own(following):index>=0&&seasons[index+1]?{type:'anime',id:seasons[index+1].id,season:1,episode:1}:null};
 }
 let seasons=(detail.seasons||[]).filter(s=>Number(s.episodes)>0).sort((a,b)=>a.number-b.number),index=seasons.findIndex(s=>Number(s.number)===Number(season)),current=seasons[index],count=Math.max(1,Number(current?.episodes)||1),own=n=>({type:'tv',id:x.id,season,episode:n});
 return {prev:episode>1?own(episode-1):index>0?{type:'tv',id:x.id,season:seasons[index-1].number,episode:Number(seasons[index-1].episodes)}:null,next:episode<count?own(episode+1):index>=0&&seasons[index+1]?{type:'tv',id:x.id,season:seasons[index+1].number,episode:1}:null};
}

function timeAgo(timestamp){let seconds=Math.round((Number(timestamp)-Date.now())/1000),abs=Math.abs(seconds),unit=abs>=86400?'day':abs>=3600?'hour':abs>=60?'minute':'second',value=Math.round(seconds/(unit==='day'?86400:unit==='hour'?3600:unit==='minute'?60:1)),r=new Intl.RelativeTimeFormat('en',{numeric:'auto'});return r.format(value,unit)}

function pickInitialAnimeLang(x,urlLang=''){
 let u=String(urlLang||'').toLowerCase();
 if(ANIME_LANGS.includes(u))return u;
 let saved='';
 try{saved=String(localStorage.getItem('kozutv-anime-lang')||'').toLowerCase()}catch{}
 if(ANIME_LANGS.includes(saved))return saved;
 if(x.regionalDefault)return x.regionalDefault;
 return x.sub===false&&x.dub?'dub':'sub';
}

function openAnimeDetailPart(id,first=0){
 const q=new URLSearchParams();q.set('part',String(id));if(first>0)q.set('episode',String(first));
 nav(`${routePath()}?${q}`);
}
async function details(type,id){
 const route=routeGeneration;
 const requestedPart=type==='anime'&&/^\d+$/.test(params().get('part')||'')?params().get('part'):'';
 app.innerHTML='<div class="loading">Loading…</div>';
 try{
  // The page needs two answers. Asking for both at once halves the wall time;
  // the library answer is tiny and a failure there is never fatal.
  const statePromise=get('/api/state').catch(()=>cachedLibraryState());
  let d=null;
  try{
   d=await get(`/api/detail?type=${type}&id=${requestedPart||id}`);
   if(requestedPart && requestedPart!==String(id)){
    const members=[...(d.seasons||[]),...(d.pokemonRegions||[])];
    if(!members.some(s=>String(s.id)===String(id))) d=await get(`/api/detail?type=${type}&id=${id}`);
   }
  }
  catch(error){
   // The live detail call failed. The title is already in the bundled
   // catalogue, so build a usable page from it rather than a dead end.
   const known=(await bundleItems()).find(i=>String(i.id)===String(id)&&i.type===type)
            ||(await bundleItems()).find(i=>String(i.id)===String(id));
   if(!known)throw error;
   d={item:known,seasons:[],episodes:[],bundled:true};
  }
  if(route!==routeGeneration)return;detail=d;let x=d.item,resumeEpisode=0,resumeSeason=1,state=await statePromise;if(route!==routeGeneration)return;savedKeys=new Set((state.watchlist||[]).map(i=>i.type+':'+i.id));
  if(type==='anime'){
   if(!requestedPart&&String(x.id)!==String(id))routeGo(url('anime',x.id),'','replace');
   lang=pickInitialAnimeLang(x,'');
  }
  if(type==='anime'&&!x.upcoming&&!x.unavailable){let requested=Number(params().get('episode'))||0,seen=state.history.find(h=>h.type==='anime'&&h.id===x.id);if(requested>0||seen){resumeEpisode=Math.max(1,requested||Number(seen.episode)||1);let maxEp=effectiveAnimeEpisodeCount(x,lang);if(maxEp)resumeEpisode=Math.min(resumeEpisode,maxEp)}}
  else if(type==='tv'&&!x.upcoming){let seen=state.history.find(h=>h.type==='tv'&&h.id===x.id);if(seen){resumeEpisode=Math.max(1,Number(seen.episode)||1);resumeSeason=Math.max(1,Number(seen.season)||1)}}
  document.title=`${x.title} — KozuTV`;
  let watch=type==='tv'&&resumeEpisode?`/watch/tv/${x.id}?season=${resumeSeason}&episode=${resumeEpisode}`:`/watch/${type}/${x.id}${resumeEpisode?`?episode=${resumeEpisode}`:''}`;
  let watchLabel=resumeEpisode?'Continue':'Watch Now';
  let epDisplayCount=type==='anime'?effectiveAnimeEpisodeCount(x,lang):x.episodes;
  let showEpisodes=!x.upcoming&&!x.unavailable&&!isFeature(x);
  // Nothing to play: say when to come back instead of showing a dead button. An
  // announced series gets the date, a carried-but-empty one gets the plainer line.
  let blocked=x.upcoming||x.unavailable;
  let blockedNote=x.upcoming
   ? `<div class="upcoming-note">${ico('clock')}<span>${esc(x.releaseDate?releaseLabel(x.releaseDate):(x.releaseGuess||'No release date announced yet'))}</span></div>`
   : `<div class="upcoming-note">${ico('clock')}<span>Not on MegaPlay yet - check back after new episodes release</span></div>`;
  let actions=`<div class="actions">${blocked?blockedNote:`<button class="btn" data-open="${watch}">${ico('play')}<span>${watchLabel}</span></button>`}${watchlistButton()}</div>`;
  let regSeasonSelect=type==='anime'&&showEpisodes?(renderOnePieceSelect(d,'detail',resumeEpisode||1)||renderPokemonSelect(d,'detail',resumeEpisode||1)||renderRegionalSeasonSelect(d,'detail',resumeEpisode||1,lang)):'';
  // Meta row: an announced series carries the Upcoming mark and the wait; an
  // uncarried one says so plainly; a playable one counts its episodes.
  let metaTail=x.upcoming
   ? `<span class="upcoming-badge">Upcoming</span><span>${ico('calendar')}${esc(x.releaseDate?releaseLabel(x.releaseDate):(x.releaseGuess||'Release date to be announced'))}</span>${x.releaseDate&&countdownLabel(x.releaseDate)?`<span class="upcoming-count" data-countdown="${esc(x.releaseDate)}">${esc(countdownLabel(x.releaseDate))}</span>`:''}`
   :(x.unavailable?`<span class="upcoming-badge badge-unavailable">Not yet available</span>`
   :(showEpisodes&&epDisplayCount?`<span>${epDisplayCount} episodes</span>`:''));
  app.innerHTML=`<div class="container content detail"><div class="detail-layout"><img class="detail-poster" src="${safeImage(x.poster)}" alt="${esc(x.title)}"><div class="detail-heading"><h1>${esc(x.title)}</h1><div class="meta"><span>${ico('star')}${esc(x.rating||'N/A')}</span><span class="quality">HD</span>${metaTail}</div></div><div class="detail-body"><div class="description detail-description" data-description-toggle role="button" tabindex="0" aria-expanded="false">${esc(x.description||'No description available.')}</div><div class="chips">${(x.genres||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join('')}</div>${actions}</div></div>${type==='anime'&&showEpisodes?`<section class="season-section">${sectionTitle((d.seasons.length>1||regSeasonSelect)?'Seasons & Episodes':'Episodes','episodes')}${regSeasonSelect||((d.seasons.length>1)?`<select class="season-select" id="detail-anime-season" aria-label="Anime season">${d.seasons.map(s=>`<option value="${s.id}" ${String(s.id)===String(x.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`:'')}<div id="detail-anime-episodes" class="anime-episodes"><div class="loading">Loading…</div></div></section>`:''}${type==='tv'&&!x.upcoming?`<section class="season-section">${sectionTitle('Seasons & Episodes','episodes')}<select class="season-select" id="detail-tv-season" aria-label="Season">${d.seasons.map(s=>`<option value="${s.number}">${esc(s.name)}</option>`).join('')}</select><div id="detail-episodes" class="episode-detail-list">Loading…</div></section>`:''}</div>`;
  updateSave(state);
  // The watch button is the next tap nine times out of ten: warm its stream now,
  // in the background, so pressing it opens the player instead of a spinner.
  try{const watchBtn=document.querySelector('.detail [data-open^="/watch/"]');if(watchBtn)prefetchFromWatchHref(watchBtn.dataset.open)}catch{}
  if(type==='tv'&&!x.upcoming&&d.seasons?.length)loadDetailEpisodes(x.id,d.seasons[0].number);
  if(type==='anime'&&showEpisodes){const r=onePieceArc(d,resumeEpisode||1)||pokemonRegion(d,x.id,resumeEpisode||1);loadAnimeEpisodes(x.id,'detail',resumeEpisode?Math.floor((resumeEpisode-1)/20)+1:1,resumeEpisode,true,r?.startEp||resumeEpisode,r?.endEp||0)}
 }catch(e){if(route===routeGeneration)failure(e)}
}

async function updateSave(state=null){
 if(!detail)return;
 // Anything that answers /api/state must be shaped like a library. A short or
 // odd answer used to reach .some() and blank the whole player page.
 let d=state||await get('/api/state');
 if(!d||!Array.isArray(d.watchlist))d={...cachedLibraryState(),watchlist:Array.isArray(d?.watchlist)?d.watchlist:[]};
 const saved=(d.watchlist||[]).some(i=>i&&i.id===detail.item.id&&i.type===detail.item.type),button=document.querySelector('.detail [data-save]');
 if(button)button.innerHTML=saved?`${ico('check')}<span class="desktop-action">In Watchlist</span><span class="mobile-action">Added</span>`:`${ico('plus')}<span class="desktop-action">Add to Watchlist</span><span class="mobile-action">Add</span>`;
}

function watchUrl(){
 let x=detail?.item;
 if(x.type==='anime')return `/watch/anime/${x.id}?episode=${episode}&lang=${lang}`;
 if(x.type==='movie')return `/watch/movie/${x.id}${provider&&provider!=='vidcore'?`?provider=${provider}`:''}`;
 return `/watch/tv/${x.id}?season=${season}&episode=${episode}${provider&&provider!=='vidcore'?`&provider=${provider}`:''}`;
}

// The fullscreen element is #player, not the episode list or Video.js child.
// Keep that element mounted while replacing only its contents and stream.
// ------------------------------------------------------------ now playing
// Sits between the player and the episode list: the current episode's name,
// its description (collapsible, only when there is one) and the reaction bar.
// A movie or an anime film has no episode number, so its title takes the slot
// and the film's own description goes underneath.
function isFilmLike(x){return x?.type==='movie'||Boolean(x?.isMovie)||Boolean(isFeature(x))}
function currentEpisodeRecord(d,x){
 if(!d||!x)return null;
 const p=new URLSearchParams(location.search);
 const wanted=isFilmLike(x)?1:Number(p.get('episode'))||Number(episode)||1;
 const pools=[];
 if(x.type==='tv'){
  const seasonRow=(d.seasons||[]).find(s=>Number(s.number)===Number(season));
  const list=tvEpisodeLists.watch;
  if(list?.episodes)pools.push(list.episodes);
  if(seasonRow?.episodeList)pools.push(seasonRow.episodeList);
 }else{
  // Anime episodes live in a page map, not a flat array.
  const st=animeEpisodeLists.watch;
  if(st?.pages)for(const page of st.pages.values())if(page?.episodes)pools.push(page.episodes);
  if(st?.episodes)pools.push(st.episodes);
 }
 for(const pool of pools){
  const hit=pool.find(e=>Number(e.number)===wanted);
  if(hit)return hit;
 }
 return null;
}
function nowPlayingMarkup(x,rec=null){
 if(!x)return '';
 const film=isFilmLike(x);
 const number=film?1:(Number(episode)||1);
 // The series title is the page heading again (it sits above the player). The
 // block below the player names what is playing: the episode for a series, or
 // the film itself for a movie / anime movie.
 const epTitle=String(rec?.title||'').trim();
 const heading=film
  ? esc(x.title||'')
  : esc(epTitle||`Episode ${number}`);
 const body=String((film?x.description:rec?.description)||(film?'':x.description)||'').trim();
 return `<div class="now-playing" data-np><h2 title="${heading}">${heading}</h2>${body?`<p class="np-desc" data-np-desc>${esc(body)}</p>`:''}</div>${reactionBarMarkup(x,film?1:number)}`;
}
// The vote glyph is the supplied Icons8 thumbs-up, traced to a vector so both
// states share one exact shape: outline while nobody has voted, filled once you
// have. The dislike is the same mark turned through 180 degrees.
// Google Material Icons, Apache 2.0: action/thumb_up, outlined and filled.
const thumbSvg=flip=>`<svg viewBox="0 0 24 24"${flip?' class="r-flip"':''} aria-hidden="true" focusable="false"><path class="reaction-outline" d="M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zM9 9l4.34-4.34L12 10h9v2l-3 7H9V9zM1 9h4v12H1z"/><path class="reaction-filled" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>`;
function reactionBarMarkup(x,epNum){
 if(!x)return '';
 return `<div class="reaction-bar" data-reaction-bar data-type="${esc(x.type)}" data-id="${esc(String(x.id))}" data-season="${Number(season)||1}" data-episode="${Number(epNum)||1}">
  <button class="reaction-btn" type="button" data-react="1" data-kind="like" data-on="0" aria-label="Like this episode" aria-pressed="false">
   ${thumbSvg(false)}
   <span class="reaction-count" data-count-like>0</span>
  </button>
  <button class="reaction-btn" type="button" data-react="-1" data-kind="dislike" data-on="0" aria-label="Dislike this episode" aria-pressed="false">
   ${thumbSvg(true)}
   <span class="reaction-count" data-count-dislike>0</span>
  </button>
  <span class="reaction-status" data-reaction-status role="status" aria-live="polite"></span>
 </div>`;
}
// "Expected April 2026" out of an ISO date. A year on its own is still worth
// saying, and nothing at all is worth a fake date.
function releaseLabel(iso){const parts=String(iso||'').split('-').map(Number),y=parts[0],m=parts[1];if(!y)return '';const M=['January','February','March','April','May','June','July','August','September','October','November','December'];return `Expected ${m&&M[m-1]?M[m-1]+' ':''}${y}`}
// "in 12 days" / "in 3 months" / "soon": the wait, in the unit a reader cares
// about. A date that has already passed has no countdown, and says nothing.
function countdownLabel(iso){
 // Only a complete date can be counted down. "2027" and "2027-10" are a year and
 // a season, and inventing a day out of them would print a confident countdown
 // beside a vague "Expected 2027" - so those cases say nothing here.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return '';
 const t=Date.parse(String(iso)+'T09:00:00Z');if(!Number.isFinite(t))return '';const days=Math.ceil((t-Date.now())/86400000);if(days<=0)return 'Out now';if(days===1)return 'Tomorrow';if(days<14)return `in ${days} days`;if(days<70)return `in ${Math.round(days/7)} weeks`;if(days<550)return `in ${Math.round(days/30.44)} months`;return `in ${Math.round(days/365.25)} years`}
function compactCount(n){
 const v=Math.max(0,Math.round(Number(n)||0));
 if(v<1000)return String(v);
 const trim=x=>x.toFixed(1).replace(/\.0$/,'');
 if(v<1000000){const k=trim(v/1000);return (Number(k)>=1000?trim(v/1000000)+'M':k+'K')}
 return trim(v/1000000)+'M';
}
function paintReactions(bar,data){
 if(!bar||!data)return;
 bar._reactionState={likes:Math.max(0,Number(data.likes)||0),dislikes:Math.max(0,Number(data.dislikes)||0),mine:Number(data.mine)||0,available:data.available};
 const likes=bar.querySelector('[data-count-like]'),dislikes=bar.querySelector('[data-count-dislike]');
 if(likes)likes.textContent=compactCount(data.likes);
 if(dislikes)dislikes.textContent=compactCount(data.dislikes);
 const mine=Number(data.mine)||0;
 for(const btn of bar.querySelectorAll('[data-react]')){
  const on=Number(btn.dataset.react)===mine&&mine!==0;
  btn.dataset.on=on?'1':'0';
  btn.setAttribute('aria-pressed',String(on));
 }
}
async function loadReactions(bar){
 if(!bar)return;
 const t=bar.dataset.type,id=bar.dataset.id,se=bar.dataset.season,ep=bar.dataset.episode;
 try{
  const d=await get(`/api/reactions?type=${t}&id=${id}&season=${se}&episode=${ep}`);
  if(!bar._reactionPending){paintReactions(bar,d);bar._reactionConfirmed=bar._reactionState}
  if(d&&d.available===false)bar.dataset.unavailable='1';
 }catch{}
}
// The heading below the player is one line by design, so a long episode name has
// to give up size before it gives up the line: step the font down until the text
// fits the width it has, and only let the ellipsis appear once nothing smaller
// would still read as a heading. Wide screens therefore show the whole title,
// phones show as much of it as they can.
function fitNowPlayingTitle(){
 const h=document.querySelector('.now-playing h2');
 if(!h)return;
 h.style.fontSize='';
 const base=parseFloat(getComputedStyle(h).fontSize)||26;
 // Shrink no further than three quarters of the styled size: below that it stops
 // reading as a heading, and the ellipsis is the better answer anyway.
 const floor=Math.max(20,base*0.74);
 let size=base;
 for(let i=0;i<8&&h.scrollWidth>h.clientWidth&&size>floor;i++){
  size=Math.max(floor,size-Math.max(1.5,base*0.08));
  h.style.fontSize=`${size.toFixed(1)}px`;
 }
 if(size>=base)h.style.fontSize='';
 // Web font swaps change the metrics, so measure once more when the faces land.
 // `status` is 'loaded' | 'loading' | 'unloaded' - only 'loading' means a swap is
 // coming, and the retry is armed once: `ready` resolves immediately when nothing
 // is pending, and re-running the check from its own callback would then loop.
 if(document.fonts&&document.fonts.status==='loading'&&!h.dataset.refit){
  h.dataset.refit='1';
  document.fonts.ready.then(()=>fitNowPlayingTitle()).catch(()=>{});
 }
}
function refreshNowPlaying(x){
 const host=document.querySelector('#now-playing');
 if(!host||!x)return;
 host.innerHTML=nowPlayingMarkup(x,currentEpisodeRecord(detail,x));
 fitNowPlayingTitle();
 // Tapping anywhere in the description expands or collapses it.
 // The top heading is the show name; the block below the player names the episode.
 const title=document.querySelector('#watch-title');
 if(title){title.textContent=x.title||'';title.hidden=isFeature(x)}
 loadReactions(host.querySelector('[data-reaction-bar]'));
}
function hydrateNowPlaying(x,rec=null){
 const host=document.querySelector('#now-playing');
 if(!host||!x)return;
 if(rec)host.innerHTML=nowPlayingMarkup(x,rec);
 fitNowPlayingTitle();
 loadReactions(host.querySelector('[data-reaction-bar]'));
}

// Load a relevant catalogue category only when the watch-page row approaches view.
function loadMoreLikeThis(item,route){
 const host=document.querySelector('#watch-more-like');if(!host)return;
 const raw=Array.isArray(item.genres)?item.genres:[];
 const genre=raw.map(g=>typeof g==='string'?g:g?.name).find(g=>catalogGenres.some(n=>n.toLowerCase()===String(g||'').toLowerCase()));
 const observer=new IntersectionObserver(async entries=>{
  if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();
  try{const d=await get(genre?`/api/genre?home=1&name=${encodeURIComponent(genre)}&page=1`:'/api/browse');
   if(route!==routeGeneration||!host.isConnected)return;
   const candidates=genre?(d.items||[]):[...(d.suggestions||[]),...(d.items||[])];
   const seen=new Set();const rows=candidates.filter(x=>{const key=x?.type+':'+x?.id;if(!x?.poster||!x?.title||seen.has(key)||(String(x.id)===String(item.id)&&x.type===item.type))return false;seen.add(key);return !genre?x.type===item.type:true}).slice(0,12);
   if(rows.length){host.innerHTML=`${sectionTitle('More like this','similar')}${grid(rows)}`;host.hidden=false}
  }catch{}
 },{rootMargin:'600px 0px'});
 // A hidden element has no intersection box.
 host.hidden=false;observer.observe(host);
}

function watchEpisodesMarkup(d,x){
 if(isFeature(x))return '';
 const reg=x.type==='anime'?(renderOnePieceSelect(d,'watch',episode)||renderPokemonSelect(d,'watch',episode)||renderRegionalSeasonSelect(d,'watch',episode,lang)):'';
 return `${sectionTitle('Episodes','episodes')}${x.type==='tv'?`<select class="season-select" id="season" aria-label="Season">${(d.seasons||[]).map(s=>`<option value="${s.number}" ${Number(s.number)===Number(season)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`:''}${reg||((x.type==='anime'&&(d.seasons||[]).length>1)?`<select class="season-select" id="anime-season" aria-label="Anime season">${d.seasons.map(s=>`<option value="${s.id}" ${String(s.id)===String(x.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`:'')}${x.type==='tv'?`<div id="watch-episodes" class="episode-detail-list"><div class="loading">Loading episodes…</div></div>`:`<div id="watch-anime-episodes" class="anime-episodes"><div class="loading">Loading episodes…</div></div>`}`;
}
function syncWatchEpisodePanel(rebuild=false){
 const x=detail?.item,area=document.querySelector('#watch-episode-area');
 if(!x||!area)return;
 const title=document.querySelector('#watch-title');if(title)title.textContent=x.title;
 document.title=`Watch ${x.title} — KozuTV`;
 if(rebuild){area.innerHTML=watchEpisodesMarkup(detail,x);animeEpisodeLists.watch=null;tvEpisodeLists.watch=null}
 // The block above the list names the episode being played, so it has to follow
 // every switch rather than only the first paint.
 refreshNowPlaying(x);
 if(isFeature(x))return;
 if(x.type==='tv'){
  const sel=area.querySelector('#season');if(sel)sel.value=String(season);
  const st=tvEpisodeLists.watch;
  if(st&&String(st.id)===String(x.id)&&Number(st.seasonNum)===Number(season)){
   st.active=episode;
   const pos=st.episodes.findIndex(e=>Number(e.number)===Number(episode));
   if(pos>=0&&(pos<st.startIdx||pos>=st.endIdx)){st.startIdx=Math.floor(pos/TV_EP_CHUNK)*TV_EP_CHUNK;st.endIdx=Math.min(st.episodes.length,st.startIdx+TV_EP_CHUNK)}
   renderTvEpisodes('watch');
  }else loadWatchEpisodes(x.id,season,episode);
 }else if(x.type==='anime'){
  const regSeasons=Array.isArray(detail.regionalSeasons)?detail.regionalSeasons:[];
  const rs=onePieceArc(detail,episode)||pokemonRegion(detail,x.id,episode)||(ANIME_REGIONAL_LANGS.includes(lang)?regSeasons.find(s=>episode>=s.startEp&&episode<=s.endEp):null);
  const sel=area.querySelector('#watch-regional-season');if(sel&&rs)sel.value=String(rs.startEp);
  const arcSel=area.querySelector('#watch-one-piece-arc');if(arcSel&&rs)arcSel.value=String(rs.startEp);
  const pokeSel=area.querySelector('#watch-pokemon-region');if(pokeSel&&rs)pokeSel.value=`${rs.id}:${rs.startEp}`;
  const st=animeEpisodeLists.watch,page=Math.floor((episode-1)/20)+1,epLang=ANIME_REGIONAL_LANGS.includes(lang)?lang:(lang==='dub'?'dub':'sub');
  if(st&&String(st.id)===String(x.id)&&st.epLang===epLang&&st.pages.has(page)&&(!rs||(st.startFrom===rs.startEp&&st.endAt===(rs.endEp||0)))){
   st.active=episode;renderAnimeEpisodes('watch');
  }else loadAnimeEpisodes(x.id,'watch',page,episode,true,rs?rs.startEp:0,rs?.endEp||0);
 }
}
async function switchWatchEpisode(target,{historyMode='push',nextLang='',nextProvider='',resolvedPayload=null}={}){
 const container=document.querySelector('#player');
 if(!target||!container||!detail?.item)return;
 const token=++episodeSwitchGeneration,oldItem=detail.item;
 // Video.js can be the fullscreen element on legacy browsers. Where the
 // standard API exists, move fullscreen to the stable parent before disposal.
 const full=document.fullscreenElement||document.webkitFullscreenElement;
 if(full&&full!==container&&container.contains(full)&&container.requestFullscreen){
  try{await container.requestFullscreen({navigationUI:'hide'})}catch{}
  if(token!==episodeSwitchGeneration||!container.isConnected)return;
 }
 // Snapshot the old coordinates before changing globals, so history never records
 // the old playback position against the new episode.
 if(videoPlayer&&!videoPlayer.isDisposed?.()){
  try{saveHistory({...oldItem,episode,season,currentTime:videoPlayer.currentTime()||0,duration:videoPlayer.duration()||0})}catch{}
 }
 const changedTitle=String(target.id)!==String(oldItem.id)||target.type!==oldItem.type;
 if(changedTitle){
  disposeVideo();container.innerHTML='<div class="loading">Loading player…</div>';
  try{
   const nextDetail=await get(`/api/detail?type=${target.type}&id=${target.id}`);
   if(token!==episodeSwitchGeneration||!container.isConnected)return;
   if(!nextDetail.item||nextDetail.item.upcoming)throw Error('This title is not available yet.');
   detail=nextDetail;
   presence(presenceNow('watching'));
  }catch(error){if(token===episodeSwitchGeneration&&container.isConnected)showPlayerError(error);return}
 }
 if(token!==episodeSwitchGeneration||!container.isConnected)return;
 season=Math.max(0,Number(target.season)||0);episode=Math.max(1,Number(target.episode)||1);
 if(detail.item.type==='anime'){
  season=1;lang=pickInitialAnimeLang(detail.item,nextLang||lang);
  episode=isFeature(detail.item)?1:Math.min(episode,effectiveAnimeEpisodeCount(detail.item,lang));
 }else{
  if(nextProvider&&OTT_PROVIDERS.includes(nextProvider))provider=nextProvider;
  const current=(detail.seasons||[]).find(s=>Number(s.number)===Number(season));
  if(current?.episodes)episode=Math.min(episode,Number(current.episodes));
 }
 const destination=watchUrl();
 if(historyMode==='push')routeGo(destination);
 else if(historyMode==='replace')routeGo(destination,'','replace');
 syncWatchEpisodePanel(changedTitle);
 await play(detail.item,null,resolvedPayload?{firstPayload:resolvedPayload,skipResume:true}:null);
}
function changeEpisode(step){
 const target=episodeTargets()[step>0?'next':'prev'];
 if(target)switchWatchEpisode(target);
}

async function watch(type,id){
 const route=routeGeneration;
 app.innerHTML='<div class="loading">Preparing your player…</div>';
 let p=params();
 try{
  // Three things are needed before a frame can play: the title, the personal
  // library, and the player's own scripts. They used to run one after another;
  // now they start together, which is most of the "player takes forever".
  loadPlayerAssets().catch(()=>{});
  const statePromise=get('/api/state').catch(()=>cachedLibraryState());
  let d=await get(`/api/detail?type=${type}&id=${id}`);if(route!==routeGeneration)return;detail=d;let x=d.item;if(x.upcoming||x.unavailable)throw Error(x.upcoming?'This title has not been released yet.':'This title is not available to stream yet.');
  season=p.has('season')?Math.max(0,Number(p.get('season'))||0):1;
  episode=Math.max(1,Number(p.get('episode')||p.get('ep'))||1);
  if(type==='anime'){
   lang=pickInitialAnimeLang(x,p.get('lang')||'');
   if(x.isMovie)episode=1;
   else episode=Math.min(episode,effectiveAnimeEpisodeCount(x,lang));
   if(String(x.id)!==String(id))routeGo(watchUrl(),'','replace');
  }else if(type==='tv'){
   let current=d.seasons.find(s=>Number(s.number)===Number(season));
   if(current?.episodes)episode=Math.min(episode,Number(current.episodes));
  }
  let requestedProvider=p.get('provider')||localStorage.getItem('kozutv-server-pref')||'vidcore';
  provider=type==='anime'?'megaplay':(OTT_PROVIDERS.includes(requestedProvider)?requestedProvider:'vidcore');
  document.title=`Watch ${x.title} — KozuTV`;
  app.innerHTML=`<div class="container content watch-content"><div class="watch-stage"><div class="watch-stage-inner"><h1 class="watch-title" id="watch-title"${isFeature(x)?' hidden':''}>${esc(x.title)}</h1><div class="player" id="player"><div class="loading">Loading player…</div></div></div></div><div class="player-wrap"><div id="now-playing">${nowPlayingMarkup(x)}</div><div id="watch-episode-area">${watchEpisodesMarkup(d,x)}</div></div><section id="watch-more-like" class="genre-section" hidden></section></div>`;
 loadReactions(document.querySelector('#now-playing [data-reaction-bar]'));
  loadMoreLikeThis(x,route);
  animeEpisodeLists.watch=null;tvEpisodeLists.watch=null;
  presence(presenceNow('watching'));
  let state=await statePromise;
  if(route!==routeGeneration)return;
  await updateSave(state);
  if(route!==routeGeneration)return;
  if(type==='tv')loadWatchEpisodes(x.id,season,episode);
  else if(type==='anime'&&!x.isMovie){
   let rs=Array.isArray(d.regionalSeasons)?d.regionalSeasons:[];
   let curRegSeason=onePieceArc(d,episode)||pokemonRegion(d,x.id,episode)||(ANIME_REGIONAL_LANGS.includes(lang)?rs.find(s=>episode>=s.startEp&&episode<=s.endEp):null);
   loadAnimeEpisodes(x.id,'watch',Math.floor((episode-1)/20)+1,episode,true,curRegSeason?curRegSeason.startEp:0,curRegSeason?.endEp||0);
  }
  await play(x,state);
 }catch(e){if(route===routeGeneration)failure(e)}
}

function showPlayerError(error){
 let container=document.querySelector('#player');if(!container)return failure(error);
 const raw=String(error?.message||'');
 const message=/selected language|requested audio|language is not|dub is not|sub is not|audio is unavailable|source did not provide/i.test(raw)?'No playable source is available right now.':(raw||'The stream could not be loaded.');
 container.innerHTML=`<div class="empty player-error"><strong>Playback unavailable</strong><span>${esc(message)}</span><button class="btn" data-retry>Try again</button></div>`;
}

function syncAnimeEpisodeRowLang(nextLang){
 document.querySelectorAll('.anime-episode-list [data-open]').forEach(btn=>{
  btn.dataset.open=btn.dataset.open.replace(/([?&]lang=)[^&]+/,`$1${encodeURIComponent(nextLang)}`);
 });
}

// Attempt the chosen anime language first, then English and Japanese. A plan
// records failed languages across both API and actual media errors, preventing
// retries from cycling. In incompatible catalogs each destination starts at 1.
async function play(x,state=null,attempts=null){
 if(videoPlayer){try{videoPlayer.dispose()}catch{};videoPlayer=null;try{if('mediaSession' in navigator)navigator.mediaSession.metadata=null}catch{}}
 playGeneration++;
 const generation=playGeneration;
 const isAnime=x.type==='anime',ctx=attempts||{};
 const plan=isAnime?(ctx.anime||newAnimePlan(lang,episode)):null;
 const candidate=isAnime?plan.order.find(value=>!plan.tried.includes(value)):'';
 if(isAnime&&!candidate){showPlayerError(Error('No playable source is available right now.'));return}
 const playingEpisode=isAnime?(isFeature(x)||animeNeedsEpisodeOne(x,plan.originLang,candidate)?1:plan.originEpisode):episode;
 const playingSeason=isAnime?1:season,requestedProvider=provider;
 if(isAnime)plan.tried.push(candidate);
 const playerContainer=document.querySelector('#player');
 if(playerContainer)playerContainer.innerHTML='<div class="loading">Loading player…</div>';
 try{
  // The stream lookup is the long pole (2-4 s). Start it now, in parallel with
  // the player scripts, instead of after them.
  const streamRequest=(async()=>{
   if(isAnime&&ctx.firstPayload)return ctx.firstPayload;
   if(!isAnime&&ctx.ott?.payload)return ctx.ott.payload;
   const excluded=!isAnime&&ctx.ott?.exclude?.length?`&exclude=${encodeURIComponent(ctx.ott.exclude.join(','))}`:'';
   const path=`/api/play?type=${x.type}&id=${x.id}&episode=${playingEpisode}&season=${playingSeason}&lang=${isAnime?candidate:lang}&provider=${requestedProvider}&anilistId=${x.anilistId||''}${excluded}`;
   // A stream the phone asked for a moment ago is used as-is; the URL is still
   // inside its signing window, so it plays.
   if(!excluded){
    const warm=isAnime?readApiCache(path,PLAY_PREFETCH_MS):takePrefetchedPlay(path);
    if(warm)return warm;
   }
   return get(path);
  })();
  streamRequest.catch(()=>{});
  let [,resolvedState]=await Promise.all([loadPlayerAssets(),state?Promise.resolve(state):get('/api/state')]);
  state=resolvedState;if(generation!==playGeneration)return;
  let d;
  try{
   d=await streamRequest;
   // An answer with no stream is a server that has nothing for this source -
   // not a dead end: the other servers get their turn (live returns 200s
   // without a src for some titles).
   if(!d?.src)throw Error('The stream could not be loaded.');
   if(isAnime&&d.activeLang!==candidate)throw Error('The source did not provide the selected language.');
  }catch(error){
   if(generation!==playGeneration)return;
   if(isAnime&&plan.order.some(value=>!plan.tried.includes(value)))return play(x,state,{anime:plan,skipResume:ctx.skipResume});
   // Non-anime: try the next server before giving up. `attempted` is built from
   // the exclude list, and the player error handler reuses the same rotation.
   if(!isAnime){
    const triedNow=new Set(ctx.ott?.exclude||[]);
    if(requestedProvider)triedNow.add(requestedProvider);
    if(d&&d.sourceKey)triedNow.add(d.sourceKey);
    const next=OTT_PROVIDERS.find(value=>!triedNow.has(value));
    if(next){
     provider=next;
     return play(x,state,{ott:{exclude:[...triedNow]},skipResume:ctx.skipResume});
    }
   }
   throw error;
  }
  if(generation!==playGeneration)return;
  const ottRaw=!isAnime?JSON.parse(JSON.stringify(d)):null;
  const ottSources=!isAnime?ottSourceOrder(ottRaw):[];
  const ottTried=new Set(ctx.ott?.audioTried||[]);
  if(!isAnime)d=ottWithSource(ottRaw,ottSources.find(source=>!ottTried.has(source.src)));
  if(isAnime){
   const changed=lang!==candidate||episode!==playingEpisode;
   lang=candidate;episode=playingEpisode;season=1;
   if(changed){routeGo(watchUrl(),'','replace');syncWatchEpisodePanel(true)}
  }else if(OTT_PROVIDERS.includes(d.sourceKey)){
   // The resolver may have selected a different server; the URL and the menu
   // describe the actual source, without changing the saved preference.
   provider=d.sourceKey;routeGo(watchUrl(),'','replace');
  }
  const clonePayload=payload=>JSON.parse(JSON.stringify(payload));
  let audioRequest=0,audioAbort=null,animePlan=plan;
  const animePlayCache=new Map(),regionalMap=new Map();
  if(isAnime){
   if(lang==='sub'||lang==='dub')animePlayCache.set(lang,clonePayload(d));
   for(const r of d.regionalStreams||[]){if(r?.key&&r?.src)regionalMap.set(r.key,r)}
  }
  let saved=(state.history||[]).find(h=>h.type===x.type&&String(h.id)===String(x.id)&&Number(h.episode)===Number(playingEpisode)&&Number(h.season)===Number(playingSeason));
  let resumeAt=Number(ctx.resumeAt)>0?Number(ctx.resumeAt):(!ctx.skipResume&&!(isAnime&&animeNeedsEpisodeOne(x,plan.originLang,candidate))&&readPreference('kozutv-resume-playback','true')!=='false'&&saved?.currentTime>15&&saved?.duration-saved?.currentTime>20?Math.max(0,Number(saved.currentTime)+.25):0);
  let saveData=Boolean(navigator.connection?.saveData),autoplay=typeof ctx.resumePlaying==='boolean'?ctx.resumePlaying:(!saveData&&readPreference('kozutv-autoplay','true')!=='false');
  let container=document.querySelector('#player');if(!container)return;
  container.dataset.provider=d.provider||'';container.dataset.server=d.server||'';
  container.innerHTML='<video id="kozutv-video" class="video-js vjs-default-skin vjs-big-play-centered" playsinline webkit-playsinline disableremoteplayback></video>';
  let player=videojs('kozutv-video',{controls:false,preload:saveData?'none':'auto',playbackRates:[.5,.75,1,1.25,1.5,2],html5:{vhs:{overrideNative:true,useBandwidthFromLocalStorage:false,useNetworkInformationApi:true,limitRenditionByPlayerDimensions:false,useDevicePixelRatio:false,bandwidth:saveData?500000:4200000,enableLowInitialPlaylist:true,smoothQualityChange:true,goalBufferLength:20,maxGoalBufferLength:30,backBufferLength:15,maxBufferLowWaterLine:16,bufferHighWaterLine:20},nativeAudioTracks:false,nativeTextTracks:false}});
  videoPlayer=player;
  try{player.tech({}).el().setAttribute('disableremoteplayback','')}catch{}
  player.src({src:d.src,type:d.type||'application/x-mpegURL'});
  let save=(current=0,duration=0)=>saveHistory({...x,episode:playingEpisode,season:playingSeason,currentTime:current,duration});
  let targets=episodeTargets();
  syncMediaSession(x,playingEpisode,playingSeason);
  player.on('timeupdate',()=>{if(player.currentTime()>=1)syncMediaSession(x,playingEpisode,playingSeason)});
  let ui=MegaPlayUI.create(player,{
   item:x,data:d,lang,server:d.sourceKey||provider,autoplay,audioPreselected:!isAnime&&ottSources.length>1,
   hasPrevEpisode:Boolean(targets.prev),hasNextEpisode:Boolean(targets.next),
   onPrevEpisode:()=>changeEpisode(-1),onNextEpisode:()=>changeEpisode(1),
   onSourceCommit:payload=>{
    if(isAnime||!OTT_PROVIDERS.includes(payload?.sourceKey))return;
    provider=payload.sourceKey;container.dataset.provider=payload.provider||'';container.dataset.server=payload.server||payload.sourceKey;
    routeGo(watchUrl(),'','replace');
   },
   onAudioChange:async value=>{
    if(!isAnime||!ANIME_LANGS.includes(value)||ui?.isSourceSwitching?.())return;
    const token=++audioRequest;audioAbort?.abort();audioAbort=null;
    // Remember the requested preference, not an automatically chosen fallback.
    savePreference('kozutv-anime-lang',value);
    if(value===lang)return;
    save(player.currentTime(),player.duration());
    const requestedOrder=animeFallbackOrder(value),failed=[];
    for(const nextLang of requestedOrder){
     if(token!==audioRequest||generation!==playGeneration)return;
     const crossing=animeNeedsEpisodeOne(x,lang,nextLang);
     const nextEpisode=crossing?1:playingEpisode;
     if(nextLang===lang&&nextEpisode===playingEpisode&&!player.error())return;
     let nextPayload=null;
     try{
      // A cached alternate belongs to this exact episode/order only.
      if(!crossing){
       if(nextLang==='sub'||nextLang==='dub')nextPayload=animePlayCache.get(nextLang);
       if(!nextPayload)nextPayload=regionalMap.get(nextLang);
      }
      if(!nextPayload){
       audioAbort=new AbortController();
       const request=`/api/play?type=anime&id=${x.id}&episode=${nextEpisode}&season=1&lang=${nextLang}&anilistId=${x.anilistId||''}`;
       nextPayload=await responseJSON(await httpFetch(apiUrl(request),{signal:audioAbort.signal}));
      }
      if(token!==audioRequest||generation!==playGeneration)return;
      if((nextPayload.activeLang||nextPayload.key)!==nextLang||!nextPayload.src)throw Error('Source mismatch');
      if(crossing){
       // This is a different episode list, not an equivalent track. The chosen
       // destination is episode 1, with no confirmation or false mapping.
       await switchWatchEpisode({type:'anime',id:x.id,season:1,episode:1},{historyMode:'replace',nextLang,resolvedPayload:nextPayload});
       return;
      }
      if(nextLang==='sub'||nextLang==='dub')animePlayCache.set(nextLang,clonePayload(nextPayload));
      const changed=await ui.switchAnimeSource(nextPayload,nextLang);
      if(token!==audioRequest||generation!==playGeneration)return;
      if(!changed){failed.push(nextLang);continue}
      const oldBucket=animeCatalogBucket(lang);lang=nextLang;
      animePlan={originLang:value,originEpisode:playingEpisode,order:requestedOrder,tried:[...failed,nextLang]};
      if(nextPayload.provider)container.dataset.provider=nextPayload.provider;
      if(nextPayload.server||nextPayload.label)container.dataset.server=nextPayload.server||nextPayload.label;
      routeGo(watchUrl(),'','replace');syncAnimeEpisodeRowLang(lang);
      if(oldBucket!==animeCatalogBucket(lang)&&!x.isMovie)syncWatchEpisodePanel(true);
      return;
     }catch(error){
      if(token!==audioRequest||generation!==playGeneration||error?.name==='AbortError')return;
      failed.push(nextLang);
     }
    }
    // The previous source remains selected when all alternate tracks fail.
   },
   onServerChange:value=>{save(player.currentTime(),player.duration());provider=value;routeGo(watchUrl(),'','replace');play(x)},
   // Downloads: the player shows the button only when the app bridge is there.
   isDownloaded:()=>Boolean(downloadFor(x,playingSeason,playingEpisode,candidate||lang)),
   onDownload:()=>startDownload(x,playingSeason,playingEpisode,isAnime?(candidate||lang):'sub'),
   onOpenDownloads:()=>{navigateTo('/downloads');return true}
  });
  // Always ask: the endpoint is what discovers regional dubs. Skipping it whenever
  // a "dub" variant already existed is exactly why Naruto listed only Japanese and
  // English - an existing English track used to short-circuit the whole probe.
  if(isAnime){
   get(`/api/anime-audio?id=${x.id}&episode=${playingEpisode}&anilistId=${x.anilistId||''}`).then(res=>{
    if(generation!==playGeneration)return;
    // The language list is truth even when no regional stream is found: it says
    // what the source carries, so the menu can show all of it from the start.
    if(Array.isArray(res?.availableLangs)&&res.availableLangs.length)
     ui?.setAnimeLangs?.(res.availableLangs);
    if(!res?.streams?.length)return;
    for(const r of res.streams){if(r?.key&&r?.src)regionalMap.set(r.key,r)}
    ui?.setAnimeRegionalStreams?.(res.streams);
   }).catch(()=>{});
  }
  // If the source has no track for the language that was asked for, say so once.
  if(d.langFallback){
   const want=String(d.requestedLang||'').toUpperCase();
   const got=d.langFallback==='dub'?'English dub':'Japanese audio';
   setTimeout(()=>toast(`${want} audio is not available for this episode \u2014 playing ${got}.`),700);
  }
  player.one('dispose',()=>audioAbort?.abort());
  if(isAnime)player.one('loadedmetadata',()=>{if(generation===playGeneration)routeGo(watchUrl(),'','replace')});
  const attempted=new Set([...(ctx.ott?.exclude||[]),requestedProvider,d.sourceKey].filter(value=>OTT_PROVIDERS.includes(value)));
  player.one('canplay',()=>{if(resumeAt>0&&player.duration()>resumeAt+10)player.currentTime(resumeAt)});
  let continuePlaying=autoplay;
  player.on('play',()=>{continuePlaying=true});
  player.on('pause',()=>{if(!player.error())continuePlaying=false});
  player.one('playing',()=>save(player.currentTime(),player.duration()));
  player.on('timeupdate',()=>{
   let current=player.currentTime(),duration=player.duration();
   if(readPreference('kozutv-autoskip','false')==='true')for(let range of [d.intro,d.outro]){let start=Number(range?.start),end=Number(range?.end);if(start>=0&&end>start&&current>=start&&current<end){player.currentTime(end);break}}
   if(Number.isFinite(duration)&&duration>0&&Date.now()-lastProgressSent>5000){lastProgressSent=Date.now();save(current,duration)}
  });
  player.on('ended',()=>{save(player.duration(),player.duration());if(readPreference('kozutv-autonext','true')!=='false')changeEpisode(1)});
  player.on('error',()=>{
   if(generation!==playGeneration||ui?.isSourceSwitching?.())return;
   const error=player.error();
   if(isAnime&&animePlan.order.some(value=>!animePlan.tried.includes(value))){play(x,state,{anime:animePlan,skipResume:ctx.skipResume});return}
   if(!isAnime){
    if(OTT_PROVIDERS.includes(d.sourceKey))attempted.add(d.sourceKey);
    const resumeTime=Math.max(0,Number(player.currentTime())||Number(ctx.resumeAt)||0);
    ottTried.add(d.src);
    if(ottSources.some(source=>!ottTried.has(source.src))){
     play(x,state,{ott:{exclude:ctx.ott?.exclude||[],payload:ottRaw,audioTried:[...ottTried]},resumeAt:resumeTime,resumePlaying:continuePlaying});return;
    }
    const next=OTT_PROVIDERS.find(value=>!attempted.has(value));
    if(next){provider=next;play(x,state,{ott:{exclude:[...attempted]},resumeAt:resumeTime,resumePlaying:continuePlaying});return}
   }
   disposeVideo();showPlayerError(Error(error?.message||'The stream could not be loaded.'));
  });
  if(autoplay)player.play().catch(()=>ui?.onAutoplayBlocked?.());
 }catch(error){
  if(generation!==playGeneration)return;
  disposeVideo();showPlayerError(error);
 }
}

// ---- downloads (app only) ---------------------------------------------------
// A browser cannot store an episode, so none of this exists on the website:
// the bridge is only there when the APK is. The page draws the screen, the
// native side owns the bytes.
const downloadBridge=()=>{
 try{const b=window.kozutvDownloads;return b&&typeof b.list==='function'?b:null}catch{return null}
};
const downloadsReady=()=>Boolean(downloadBridge());
let downloadState=[];        // last list() answer
let downloadEventAt=0;
window.kozutvDownloadEvent=payload=>{
 // Progress from the native side: repaint only the card it belongs to.
 let job=null;
 try{job=typeof payload==='string'?JSON.parse(payload):payload}catch{return}
 if(!job||!job.id)return;
 downloadEventAt=Date.now();
 const index=downloadState.findIndex(d=>String(d.id)===String(job.id));
 if(job.state==='failed'){
  if(index>=0)downloadState.splice(index,1);
  paintDownloads();
  toast(job.error||'Download failed');
  return;
 }
 if(index>=0)downloadState[index]={...downloadState[index],...job};
 else if(job.state==='ready'||job.state==='downloading')downloadState.unshift(job);
 paintDownloads();
};
// A small, plain confirmation. It never blocks a tap and it disappears on its
// own; anything longer belongs in the screen itself.
let toastTimer=0;
function toast(message){
 if(!message)return;
 let el=document.getElementById('kozutv-toast');
 if(!el){
  el=document.createElement('div');
  el.id='kozutv-toast';
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  el.style.cssText='position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:120;max-width:min(420px,calc(100vw - 32px));padding:11px 16px;border-radius:12px;background:#000;border:1px solid #2c2f38;color:#f1f2f5;font:600 13px/1.35 system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 12px 32px #000c;opacity:0;transition:opacity .16s ease';
  document.body.appendChild(el);
 }
 el.textContent=message;
 requestAnimationFrame(()=>{el.style.opacity='1'});
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{el.style.opacity='0'},2600);
}
const downloadKey=x=>`${x.type}-${x.id}-${x.season||1}-${x.episode||1}-${x.lang||'sub'}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
function downloadFor(x,season,episode,lg){
 return downloadState.find(d=>String(d.id)===downloadKey({...x,season,episode,lang:lg}));
}
function downloadLabel(x,season,episode){
 return isFeature(x)?esc(x.title):`${esc(x.title)} · S${season||1} E${episode||1}`;
}
async function refreshDownloads(){
 const b=downloadBridge();
 if(!b)return [];
 try{const raw=await b.list();downloadState=raw?JSON.parse(raw):[]}catch{downloadState=[]}
 return downloadState;
}
// Returns true only when the phone accepted the job, so the player's icon can
// tell the truth instead of guessing.
async function startDownload(x,season,episode,lg){
 const b=downloadBridge();
 if(!b)return false;
 const key=downloadKey({...x,season,episode,lang:lg});
 const existing=downloadState.find(d=>String(d.id)===key);
 if(existing){toast(existing.state==='ready'?'Saved already':'Already downloading');return existing.state==='ready'}
 // The stream is already signed for this exact episode; ask for the same one
 // the player would play, so the download is what the viewer sees.
 toast('Preparing download…');
 try{
  const payload=await get(`/api/play?type=${x.type}&id=${x.id}&episode=${episode||1}&season=${season||1}&lang=${x.type==='anime'?(lg||'sub'):'sub'}&provider=${x.type==='anime'?'megaplay':(provider||'vidcore')}&anilistId=${x.anilistId||''}`);
  if(!payload?.src){toast('This episode cannot be downloaded right now.');return false}
  const spec={
   id:key,type:x.type,itemId:String(x.id),title:x.title,
   poster:safeImage(x.poster)||'',year:x.year||'',episode:episode||1,season:season||1,
   lang:x.type==='anime'?(lg||'sub'):'',src:payload.src,typeMime:payload.type||'',
   tracks:(payload.tracks||[]).slice(0,4).map(t=>({label:t.label||t.language||'Subtitles',language:t.language||'',src:t.src})),
   duration:0
  };
  const res=await b.start(JSON.stringify(spec));
  const answer=res?JSON.parse(res):{};
  if(answer.ok===false){toast(answer.error||'Could not start the download');return false}
  downloadState.unshift({...spec,state:'downloading',progress:0,bytes:0,savedAt:Date.now()});
  paintDownloads();
  toast('Download started');
  return true;
 }catch(e){toast('This episode cannot be downloaded right now.');return false}
}
// The stored episode is a real file on the phone. Its playlist is served by the
// app under kozu-dl://, so pointing the player at that URL plays the download
// with the same UI, controls and subtitles as a live stream.
function playLocalDownload(entry){
 try{
  const src=`kozu-dl://${entry.id}/index.m3u8`;
  const item={type:entry.type,id:entry.itemId,title:entry.title,poster:entry.poster,year:entry.year,isMovie:entry.type==='movie'};
  routeGeneration++;
  app.innerHTML=`<div class="container content"><div class="player-wrap"><h1 class="watch-title">${esc(entry.title)}</h1><div class="player" id="player"><div class="loading">Loading player…</div></div></div></div>`;
  document.title=`${entry.title} — KozuTV`;
  loadPlayerAssets().then(()=>{
   const container=document.querySelector('#player');
   if(!container)return;
   container.innerHTML='<video id="kozutv-video" class="video-js vjs-default-skin vjs-big-play-centered" playsinline webkit-playsinline disableremoteplayback></video>';
   disposeVideo();
   const player=videojs('kozutv-video',{controls:false,preload:'auto',playbackRates:[.5,.75,1,1.25,1.5,2],html5:{vhs:{overrideNative:true}}});
   videoPlayer=player;
   player.src({src,type:'application/x-mpegURL'});
   MegaPlayUI.create(player,{
    item,data:{src,tracks:[],availableLangs:[]},lang:entry.lang||'sub',server:'Downloaded',
    autoplay:true,hasPrevEpisode:false,hasNextEpisode:false
   });
   syncMediaSession(item,entry.episode,entry.season);
   player.play().catch(()=>{});
  }).catch(()=>failure(Error('The player could not be loaded.')));
 }catch(e){failure(e)}
}

async function removeDownload(id){
 const b=downloadBridge();
 if(!b)return;
 await b.remove(id);
 downloadState=downloadState.filter(d=>String(d.id)!==String(id));
 paintDownloads();
 toast('Removed');
}
function downloadCard(d){
 const ready=d.state==='ready';
 const pct=Math.round((Number(d.progress)||0)*100);
 const sub=ready
  ? `${d.sizeText||''} · Saved${d.tracks?.length?` · ${d.tracks.length} subtitle track${d.tracks.length>1?'s':''}`:''}`
  : d.state==='failed'?esc(d.error||'Download failed')
  : `Downloading · ${pct}%`;
 return `<article class="dl-card" data-dl-id="${esc(d.id)}">
  <div class="dl-poster"><img loading="lazy" src="${safeImage(d.poster)||FALLBACK_POSTER_DATA_URI}" alt=""></div>
  <div class="dl-copy">
   <h3 title="${esc(d.title||'')}">${esc(d.title||'Title')}</h3>
   <p>${isFeature({type:d.type,movie:d.type==='movie'})?'Movie':`S${esc(String(d.season||1))} E${esc(String(d.episode||1))}`}</p>
   <span class="dl-state ${ready?'ready':''}">${sub}</span>
   ${ready?'':`<div class="dl-bar"><span style="width:${pct}%"></span></div>`}
  </div>
  <div class="dl-actions">
   ${ready?`<button class="btn" type="button" data-dl-play="${esc(d.id)}">${ico('play')}<span>Play</span></button>`:''}
   <button class="btn secondary" type="button" data-dl-remove="${esc(d.id)}" aria-label="Remove">${headIco('trash')}</button>
  </div>
 </article>`;
}
function paintDownloads(){
 const host=document.querySelector('#downloads-list');
 if(!host)return;
 const ready=downloadState.filter(d=>d.state==='ready');
 const active=downloadState.filter(d=>d.state!=='ready');
 const used=downloadState.reduce((n,d)=>n+(Number(d.bytes)||0),0);
 const size=used?(used/1048576).toFixed(1)+' MB':'0 MB';
 host.innerHTML=`
  <div class="dl-summary"><span>${ready.length} saved${active.length?` · ${active.length} in progress`:''}</span><span>${size} used</span></div>
  ${downloadState.length?downloadState.map(downloadCard).join(''):'<div class="empty"><h2>Nothing downloaded yet</h2><p>Open any episode and tap the download button in the player. It plays with no internet afterwards.</p></div>'}
  ${downloadState.length?`<div class="dl-clear"><button class="btn secondary" type="button" data-dl-clear>${headIco('trash')}<span>Remove all downloads</span></button></div>`:''}`;
}
// The Downloads screen has been removed. A saved address still lands somewhere
// useful rather than on a dead route, and the in-app download controls keep
// working because they never lived here.
async function downloadsPage(){
 routeGo('/browse','','replace');
 return browse();
}

// Truth about what is on screen. A catalogue answered from the bundled copy is
// still browsable, but it is not live - and pretending otherwise is how "nothing
// works" happens without an explanation.
let liveSyncState='unknown';   // 'live' | 'stale' | 'unknown'
function markLive(){liveSyncState='live';paintSyncBadge()}
function markStale(){liveSyncState='stale';paintSyncBadge()}
let connectingTimer=0;
function paintConnectingSoon(){
 clearTimeout(connectingTimer);
 // Only speak up if the request is actually slow: a normal load must not flash
 // a "connecting" bar over the page.
 connectingTimer=setTimeout(()=>{if(liveSyncState==='unknown')paintSyncBadge()},1500);
}
function paintSyncBadge(){
 if(!bundledMode())return;
 let el=document.getElementById('sync-badge');
 if(liveSyncState==='live'){el?.remove();return}
 const text=liveSyncState==='stale'
  ? 'Saved catalogue · tap to reload live'
  : 'Connecting to KozuTV…';
 if(!el){
  el=document.createElement('button');
  el.id='sync-badge';el.type='button';
  el.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(64px + env(safe-area-inset-bottom));z-index:60;display:block;width:auto;margin:0 auto;max-width:420px;padding:10px 14px;border:0;border-radius:12px;font:600 13px/1.2 system-ui,-apple-system,sans-serif;background:#1c1d22;color:#f4f5f7;box-shadow:0 6px 24px rgba(0,0,0,.45);text-align:center';
  el.onclick=()=>{try{location.reload()}catch{}};
  document.body.appendChild(el);
 }
 el.textContent=text;
}
function failure(e){
 const raw=String(e&&e.message||'').trim();
 const networkish=/^(network|failed to fetch|load failed|request failed \(0\))$/i.test(raw);
 const message=networkish
  ? (inApp()?'Can’t reach KozuTV right now. Check your connection, then tap Try again.':'Can’t reach KozuTV right now. Check your connection, then tap Try again.')
  : raw;
 app.innerHTML=`<div class="container content"><div class="empty"><h2>${networkish?'No connection':'Something went wrong'}</h2><p class="error">${esc(message)}</p><button class="btn" data-retry>Try again</button></div></div>`;
}
function clock(v){let n=Math.max(0,Math.floor(Number(v)||0));return `${Math.floor(n/3600)?String(Math.floor(n/3600))+':':''}${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
// ---- Media notification (OS media panel / lock screen / now-playing card) ----
// Reads "S1 E1 : Title", or "E1 : Title" when the show has no seasons, and shows
// the show's wide backdrop where one exists so the notification carries artwork.
function mediaNotificationText(x,episode,season){
  const title=String(x?.title||'kozuTV');
  const isMovie=isFeature?.(x)||x?.type==='movie'||x?.format==='Movie'||String(x?.type||'')==='movie';
  if(isMovie)return title;
  const ep=Number(episode)||0;
  if(!ep)return title;
  const s=Number(season)||0;
  return `${s>0?`S${s} `:''}E${ep} : ${title}`;
}
function mediaNotificationArt(x){
  const wide=[x?.backdrop,x?.banner,x?.cover].map(v=>String(v||'').trim()).find(v=>/^https?:\/\//.test(v))||'';
  const poster=[x?.poster,x?.image].map(v=>String(v||'').trim()).find(v=>/^https?:\/\//.test(v))||'';
  return safeImage(wide||poster)||'';
}
function syncMediaSession(x,episode,season){
  if(!('mediaSession' in navigator)||typeof window.MediaMetadata!=='function')return;
  try{
    const text=mediaNotificationText(x,episode,season);
    const art=mediaNotificationArt(x);
    navigator.mediaSession.metadata=new MediaMetadata({
      title:text,
      artist:'kozuTV',
      album:String(x?.title||'kozuTV'),
      artwork:art?[{src:art,sizes:'512x512',type:'image/jpeg'}]:[]
    });
    // A notification with no artwork is the thing the user reported; when the
    // show has no wide image, fall back to the square poster through the proxy.
    if(!art&&x?.poster){
      const fallback=safeImage(x.poster);
      if(fallback)navigator.mediaSession.metadata.artwork=[{src:fallback,sizes:'512x512',type:'image/jpeg'}];
    }
  }catch{}
}
function continueGrid(data){return `<div class="continue-grid">${data.map(x=>`<article class="continue-card" data-open="/watch/${x.type}/${x.id}?episode=${x.episode}&season=${x.season}"><div class="continue-image">${x.poster?`<img data-load-whole decoding="async" loading="lazy" src="${safeImage(x.poster)}" alt="${esc(x.title)}">`:''}</div><div class="continue-foot"><div class="continue-progress" style="width:${x.duration?Math.min(100,100*x.currentTime/x.duration):0}%"></div><span>${isFeature(x)?'MOVIE':x.type==='tv'?`S${x.season} E${x.episode}`:`EP ${x.episode}`}</span><span>${x.duration?clock(x.currentTime):'00:00'}</span></div><h3>${esc(x.title)}</h3></article>`).join('')}</div>`}

async function watchlist(){
 const route=routeGeneration;
 app.innerHTML='<div class="loading">Loading…</div>';
 try{
  let d=await get('/api/state'),convert=x=>({...x,year:'Saved',rating:null});if(route!==routeGeneration)return;savedKeys=new Set((d.watchlist||[]).map(x=>x.type+':'+x.id));document.title='Watchlist — kozuTV';
  app.innerHTML=`<div class="container content watchlist-page">${sectionTitle('Watchlist','bookmark','h1')}${d.watchlist.length?grid(d.watchlist.map(convert)):grid([])}</div>`;
 }catch(e){if(route===routeGeneration)failure(e)}
}

async function schedulePage(){const route=routeGeneration;app.innerHTML='<div class="loading">Loading…</div>';document.title='Schedule — KozuTV';try{let d=await get('/api/schedule'),groups=new Map();if(route!==routeGeneration)return;for(let entry of d.entries.sort((a,b)=>a.airingAt-b.airingAt)){let date=new Date(entry.airingAt*1000);
  // Local midnight, so "Today" means today where the viewer is, not on the server.
  const today=new Date();today.setHours(0,0,0,0);
  const day=new Date(date);day.setHours(0,0,0,0);
  const dayDiff=Math.round((day-today)/86400000);
  let key=dayDiff===0?'Today':dayDiff===1?'Tomorrow':dayDiff===-1?'Yesterday':date.toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'});if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry)}
 // Every row is anime + TV; the type stays as a small tag and the right-hand
 // column is the original "in 3 hours" countdown rather than a bare badge.
 const row=({item,episode,season,kind,airingAt})=>`<article class="schedule-row" data-open="${url(item.type,item.id)}"><img src="${safeImage(item.poster)}" alt=""><div><strong>${esc(item.title)}<span class="schedule-type">${kind==='tv'?'TV':'ANIME'}</span></strong><span>${kind==='tv'?(season?`S${season} E${episode}`:`E${episode}`):`Episode ${episode}`} · ${new Date(airingAt*1000).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'})}</span></div><b data-airing="${airingAt}">${timeAgo(airingAt*1000)}</b></article>`;
 app.innerHTML=`<div class="container content">${sectionTitle('Schedule','clock','h1')}${groups.size?[...groups].map(([day,entries])=>`<section class="schedule-day"><h2>${day}</h2>${entries.map(row).join('')}</section>`).join(''):'<div class="empty">No scheduled episodes.</div>'}</div>`}catch(e){if(route===routeGeneration)failure(e)}}
 // Countdowns go stale while the page is open; refresh the text every minute
 // without re-rendering rows (keeps scroll position and avoids refetching).


// Keep schedule countdowns honest without a refetch: rewrite each label every
// 30 s from the timestamp it already carries.
setInterval(()=>{
 if(routePath()!=='/schedule')return;
 document.querySelectorAll('.schedule-row b[data-airing]').forEach(el=>{
  const next=timeAgo(Number(el.dataset.airing)*1000);
  if(next!==el.textContent)el.textContent=next;
 });
},30000);

async function upcomingPage(){const route=routeGeneration;app.innerHTML='<div class="loading">Loading upcoming anime…</div>';document.title='Upcoming anime — KozuTV';try{let d=await get('/api/upcoming');if(route!==routeGeneration)return;let list=(d.items||[]).map(x=>({...x,year:x.releaseDate?String(x.releaseDate).slice(0,4):x.year||'TBA',rating:x.rating??null}));app.innerHTML=`<div class="container content">${sectionTitle('Upcoming anime','calendar','h1')}${list.length?grid(list):'<div class="empty">No upcoming anime right now.</div>'}</div>`}catch(e){if(route===routeGeneration)failure(e)}}

const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
async function filtersPage(){
 const route=routeGeneration;
 app.innerHTML='<div class="loading">Loading advanced filters…</div>';document.title='Advanced Filters — kozuTV';
 let p=params(),values={type:p.get('type')||'all',genre:p.get('genre')||'',year:p.get('year')||'',sort:p.get('sort')||'popularity',status:p.get('status')||''};
 let baseQuery=new URLSearchParams();
 for(let [k,v] of Object.entries(values))if(v)baseQuery.set(k,v);
 let endpointBase='/api/filter'+(baseQuery.toString()?'?'+baseQuery.toString():'');
 try{
  let d=await get(endpointBase+(endpointBase.includes('?')?'&':'?')+'page=1');
  if(route!==routeGeneration)return;
  let list=d.items||[];
  pagedState={
   mode:'filters',
   endpointBase,
   page:1,
   hasMore:Boolean(d.hasMore),
   seen:new Set(list.map(x=>`${x.type}:${x.id}`)),
   total:Number(d.totalResults)||list.length
  };
  let countText=pagedState.total>list.length?`${pagedState.total.toLocaleString('en-US')}+ titles`:`${list.length} titles`;
  let moreResults=pagedState.hasMore?`<div class="category-more"><button class="category-more-button" data-more-results aria-label="Show more titles">${ico('plus')}<span>Show more</span></button></div>`:'';
  app.innerHTML=`<div class="container content">${sectionTitle('Advanced Filters','sliders','h1')}<form class="filters-form" data-filters><label>Type<select name="type">${option('all','Everything',values.type)}${option('anime','Anime',values.type)}${option('movie','Movies',values.type)}${option('tv','Web series',values.type)}</select></label><label>Genre<select name="genre">${option('','All genres',values.genre)}${catalogGenres.map(g=>option(g,g,values.genre)).join('')}</select></label><label>Year<input name="year" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" value="${esc(values.year)}" placeholder="Any year"></label><label>Sort<select name="sort">${option('popularity','Popularity',values.sort)}${option('rating','Rating',values.sort)}${option('newest','Newest',values.sort)}</select></label><label>Anime status<select name="status">${option('','Any status',values.status)}${option('releasing','Ongoing',values.status)}${option('finished','Finished',values.status)}</select></label><button class="btn" type="submit">Apply filters</button></form><div class="filter-results-heading">${sectionTitle('Results','sliders')}<span id="filter-count-label">${esc(countText)}</span></div>${grid(list,'paged-grid')}${moreResults}</div>`;
 }catch(e){if(route===routeGeneration)failure(e)}
}

let tokenSubmitPending=false;
const SITE_PREF_DEFAULTS={'kozutv-autoplay':'true','kozutv-autonext':'true','kozutv-autoskip':'false','kozutv-resume-playback':'true','kozutv-seek-step':'10','kozutv-save-history':'true','kozutv-spotlight-autoplay':'true','kozutv-reduce-motion':'false','kozutv-ai-transcription':'false','kozutv-anime-lang':'auto','kozutv-ott-audio':'auto','kozutv-server-pref':'vidcore','kozutv-quality':'auto','kozutv-speed':'1'};
const SITE_PREF_KEYS=Object.keys(SITE_PREF_DEFAULTS);
const RESET_PREF_KEYS=[...SITE_PREF_KEYS,'kozutv-muted','kozutv-audio-pref',...['anime-sub','anime-dub','ott'].flatMap(mode=>[`kozutv-sub-pref-${mode}`,`kozutv-caption-style-${mode}`])];
function settingsPage(){
 document.title='Settings — kozuTV';
 const read=(key,def)=>{try{return localStorage.getItem(key)??def}catch{return def}};
 const toggle=(key,title,def)=>`<label class="setting-row"><strong>${title}</strong><span class="site-switch"><input type="checkbox" data-site-pref="${key}" ${read(key,def)==='true'?'checked':''}><span></span></span></label>`;
 const select=(key,title,def,choices)=>`<label class="setting-row"><strong>${title}</strong><select data-site-pref="${key}" aria-label="${title}">${choices.map(([v,l])=>option(v,l,read(key,def))).join('')}</select></label>`;
 app.innerHTML=`<div class="container content settings-page">${sectionTitle('Settings','settings','h1')}
  <section class="settings-card"><div class="settings-card-heading">${ico('playback')}<h2>Playback</h2></div>
   ${toggle('kozutv-autoplay','Autoplay','true')}
   ${toggle('kozutv-autonext','Auto next','true')}
   ${toggle('kozutv-autoskip','Auto-skip','false')}
   ${toggle('kozutv-resume-playback','Resume playback','true')}
   ${select('kozutv-seek-step','Seek interval','10',[['5','5 seconds'],['10','10 seconds'],['15','15 seconds'],['30','30 seconds']])}
   ${select('kozutv-speed','Playback speed','1',[['0.25','0.25×'],['0.5','0.5×'],['0.75','0.75×'],['1','Normal'],['1.25','1.25×'],['1.5','1.5×'],['1.75','1.75×'],['2','2×']])}
   ${select('kozutv-quality','Preferred quality','auto',[['auto','Auto'],['2160','4K'],['1440','2K'],['1080','Full HD'],['720','HD'],['576','576p'],['480','SD'],['360','360p'],['240','240p']])}
  </section>
  <section class="settings-card"><div class="settings-card-heading">${ico('headphones')}<h2>Language & sources</h2></div>
   ${select('kozutv-anime-lang','Preferred anime audio','auto',[['auto','Series default'],['sub','Japanese'],['dub','English'],['hi','Hindi'],['ta','Tamil'],['te','Telugu'],['ml','Malayalam'],['kn','Kannada'],['bn','Bengali'],['zh','Chinese (Mandarin)'],['yue','Chinese (Cantonese)']])}
   ${select('kozutv-ott-audio','Preferred Movies/Series Audio','auto',[['auto','Original / default'],['en','English'],['ja','Japanese'],['hi','Hindi'],['ta','Tamil'],['te','Telugu'],['ml','Malayalam'],['kn','Kannada'],['bn','Bengali'],['ko','Korean'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['pt','Portuguese'],['ru','Russian'],['zh','Chinese (Mandarin)'],['yue','Chinese (Cantonese)'],['ar','Arabic'],['tr','Turkish'],['th','Thai'],['vi','Vietnamese'],['id','Indonesian'],['mr','Marathi'],['pa','Punjabi'],['gu','Gujarati'],['ur','Urdu'],['nl','Dutch'],['pl','Polish'],['sv','Swedish'],['da','Danish'],['fi','Finnish'],['cs','Czech'],['el','Greek'],['hu','Hungarian'],['ro','Romanian'],['uk','Ukrainian'],['he','Hebrew'],['fa','Persian'],['ms','Malay']])}
   ${select('kozutv-server-pref','Movie & series server','vidcore',[['vidcore','VidCore'],['embedwave','EmbedWave'],['cinesrc','CineSrc'],['vidlink','VidLink'],['vidsrc','VidSrc']])}
  </section>
  <section class="settings-card"><div class="settings-card-heading">${ico('sliders')}<h2>Viewing & browsing</h2></div>
   ${toggle('kozutv-save-history','Save watch history','true')}
   ${toggle('kozutv-spotlight-autoplay','Spotlight autoplay','true')}
   ${toggle('kozutv-reduce-motion','Reduce motion','false')}
   ${toggle('kozutv-ai-transcription','AI Transcription','false')}
  </section>
  <div class="settings-actions"><button class="btn secondary" type="button" data-reset-settings>Reset preferences</button><span id="settings-status" role="status" aria-live="polite"></span></div>
  ${inApp()?'<div class="diag-line" id="diag-line" role="status"></div>':''}</div>`;
 renderDiagnostics();
}
function refreshSettingsPreferences(){
 if(routePath()!=='/settings')return;
 document.querySelectorAll('[data-site-pref]').forEach(el=>{
  const key=el.dataset.sitePref;let value=SITE_PREF_DEFAULTS[key];try{value=localStorage.getItem(key)??value}catch{}
  if(el.type==='checkbox')el.checked=value==='true';else el.value=value;
 });
}
window.addEventListener('kozutv-preferences-restored',()=>{refreshSettingsPreferences();applyDisplayPreferences()});
applyDisplayPreferences();


// A one-line health check, shown only inside the app shell.
function renderDiagnostics(){
 const box=document.querySelector('#diag-line');if(!box)return;
 if(!inApp()){box.textContent='';return}
 box.textContent='In the KozuTV app.';
}
async function randomPage(){const route=routeGeneration;app.innerHTML='<div class="loading">Choosing a random title…</div>';try{let d=await get('/api/random');if(route!==routeGeneration)return;routeGo(url(d.item.type,d.item.id,'','replace'));render()}catch(e){if(route===routeGeneration)failure(e)}}
// True inside the Android shell (it injects window.kozutvHttp); every other
// browser is the plain website.
function inApp(){
 try{return Boolean(window.kozutvAndroid||(window.kozutvHttp&&typeof window.kozutvHttp.request==='function'))}catch{return false}
}
// A compact episode badge ("S11E319"), never the words "Episode 319".
function episodeBadgeText(type,episode,season){
 if(type==='movie')return 'Movie';
 const ep=Number(episode)||0;if(!ep)return '';
 if(type==='tv'){const n=Number(season)||0;return n?`S${n}E${ep}`:`E${ep}`}
 return `S1E${ep}`;
}
// Show the requested state immediately; writes remain ordered and failures are visible.
const pendingWatchlistChanges=new Map();
function paintWatchlistButtons(item){
 const key=item.type+':'+item.id,on=savedKeys.has(key);
 document.querySelectorAll('[data-hero-save]').forEach(b=>{if(b.dataset.heroSave===key){b.classList.toggle('saved',on);b.setAttribute('aria-label',(on?'Remove from':'Add to')+' Watchlist');b.setAttribute('aria-pressed',String(on))}});
 if(detail?.item?.type===item.type&&String(detail.item.id)===String(item.id)){
  const button=document.querySelector('.detail [data-save]');if(button)button.innerHTML=on?`${ico('check')}<span class="desktop-action">In Watchlist</span><span class="mobile-action">Added</span>`:`${ico('plus')}<span class="desktop-action">Add to Watchlist</span><span class="mobile-action">Add</span>`;
 }
}
function changeWatchlistInstantly(item){
 const key=item.type+':'+item.id,was=savedKeys.has(key),on=!was,version=(pendingWatchlistChanges.get(key)||0)+1;pendingWatchlistChanges.set(key,version);
 if(on)savedKeys.add(key);else savedKeys.delete(key);paintWatchlistButtons(item);
 post('/api/watchlist',{...item,remove:!on}).then(()=>{presence({activity:on?'saved':'unsaved',title:item.title||'',kind:item.type,page:routePath()})}).catch(error=>{
  if(pendingWatchlistChanges.get(key)===version){if(was)savedKeys.add(key);else savedKeys.delete(key);paintWatchlistButtons(item);alert('Could not save your watchlist change. Please try again.')}
  console.error(error);
 });
}
function reportPage(){
 document.title='Report — KozuTV';
 app.innerHTML=`<div class="container content report-page"><h1>Report</h1><form id="report-form"><label for="report-experienced">Which show you experienced this issue <span aria-hidden="true">*</span></label><input id="report-experienced" name="experienced" type="text" maxlength="300" required><label for="report-episode">Episode and Season of the show</label><input id="report-episode" name="episodeSeason" type="text" maxlength="300"><label for="report-description">Describe the issue</label><textarea id="report-description" name="description" rows="7" maxlength="5000"></textarea><button class="btn" type="submit">Submit</button><p id="report-status" role="status" aria-live="polite"></p></form></div>`;
 const form=document.querySelector('#report-form');form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button'),status=form.querySelector('#report-status');button.disabled=true;status.textContent='';try{const data=new FormData(form);await postRequest('/api/reports',{experienced:data.get('experienced'),episodeSeason:data.get('episodeSeason'),description:data.get('description')});form.reset();status.textContent='Submitted successfully';}catch{status.textContent='Could not submit. Please try again.'}finally{button.disabled=false}});
}
function render(){
 routeGeneration++;clearTimeout(searchTimer);
 try{routeApplied=routePath()+'?'+routeQuery()}catch{}
 // Anything on screen that pointed at the native image scheme gets its bytes
 // now (no-op on the website).
 try{watchImages()}catch{}
 stopBrowseRows();stopGenrePages();
 episodeSwitchGeneration++;
 disposeVideo();closeMenu();let p=routePath();
 // A bookmarked /login opens the card over Browse rather than a blank route.
 if(p==='/login'){routeGo('/browse','','replace');p='/browse';setTimeout(()=>openLogin('/browse'),60)}
 if(['/account','/create-account','/profile','/community','/rooms'].includes(p)||p.startsWith('/rooms/')||(p.startsWith('/downloads/')&&p!=='/downloads')){routeGo('/browse','','replace');p='/browse'}
 if(p==='/report')return reportPage();
 if(p==='/settings')return settingsPage();
 if(p==='/schedule')return schedulePage();
 if(p==='/filters')return filtersPage();
 if(p==='/random')return randomPage();
 if(p==='/upcoming')return upcomingPage();
 search.placeholder='Search anime, movies & series...';
 if(p==='/watchlist')return watchlist();
 if(p==='/downloads')return downloadsPage();
 let mw=p.match(/^\/(?:browse\/)?watch\/(anime|movie|tv)\/(\d+)/);
 if(mw)return watch(mw[1],mw[2]);
 let md=p.match(/^\/browse\/(anime|movie|tv)\/(\d+)/);
 if(md)return details(md[1],md[2]);
 return catalog(Boolean(params().get('q')));
}

// Warm the stream the moment a watch link is touched or hovered, so the tap
// that follows finds the answer already waiting. Passive listeners: nothing
// here can block the gesture.
document.addEventListener('pointerdown',e=>{
 const a=e.target.closest?.('[data-open^="/watch/"],[data-hero-details],[data-open]');
 const href=a?.dataset?.open||'';
 if(href.startsWith('/watch/'))prefetchFromWatchHref(href);
},true);
document.addEventListener('pointerover',e=>{
 const a=e.target.closest?.('[data-open^="/watch/"]');
 if(a)prefetchFromWatchHref(a.dataset.open);
},{passive:true});
document.addEventListener('click',async e=>{
 try{
  // ---- downloads screen ----
  let dlRemove=e.target.closest('[data-dl-remove]');
  if(dlRemove){e.preventDefault();await removeDownload(dlRemove.dataset.dlRemove);return}
  let dlClear=e.target.closest('[data-dl-clear]');
  if(dlClear){e.preventDefault();const b=downloadBridge();if(b){await b.clear();downloadState=[];paintDownloads();toast('Downloads removed')}return}
  let dlPlay=e.target.closest('[data-dl-play]');
  if(dlPlay){
   e.preventDefault();
   const entry=downloadState.find(d=>String(d.id)===String(dlPlay.dataset.dlPlay));
   if(!entry)return;
   // Play straight from the stored file: the local playlist is the source, so
   // this works in a tunnel as well as on wifi.
   playLocalDownload(entry);
   return;
  }
  let tvMore=e.target.closest('[data-tv-more]');
  if(tvMore){
   let mode=tvMore.dataset.tvMode,dir=tvMore.dataset.tvMore,st=tvEpisodeLists[mode];
   if(st){
    if(dir==='prev')st.startIdx=Math.max(0,st.startIdx-TV_EP_CHUNK);
    else st.endIdx=Math.min(st.episodes.length,st.endIdx+TV_EP_CHUNK);
    renderTvEpisodes(mode);
   }
   return;
  }
  let description=e.target.closest('[data-description-toggle]');if(description){if(String(window.getSelection?.()||'').length)return;let expanded=description.classList.toggle('expanded');description.setAttribute('aria-expanded',String(expanded));return}
  let heroSave=e.target.closest('[data-hero-save]');if(heroSave){e.preventDefault();e.stopPropagation();let [type,id]=heroSave.dataset.heroSave.split(':'),x=[...spotlightItems,...items,...suggestions,...Object.values(genreRows).flat()].find(i=>i.type===type&&String(i.id)===id);if(x)changeWatchlistInstantly(x);return}

  let genreRetry=e.target.closest('[data-genre-retry]');if(genreRetry){genrePagesSession?.retry();return}
  let genrePageRetry=e.target.closest('[data-genre-page-retry]');if(genrePageRetry){genrePagesSession?.retryPage(genrePageRetry);return}
  let moreResultsBtn=e.target.closest('[data-more-results]');if(moreResultsBtn){
   if(moreResultsBtn.disabled||!pagedState.hasMore)return;
   moreResultsBtn.disabled=true;
   moreResultsBtn.innerHTML='<span class="button-loader" aria-label="Loading"></span>';
   moreResultsBtn.classList.add('is-loading');
   let anchor=moreResultsBtn.closest('.category-more');
   try{
    let nextPage=pagedState.page+1;
    let sep=pagedState.endpointBase.includes('?')?'&':'?';
    let d=await get(`${pagedState.endpointBase}${sep}page=${nextPage}`);
    pagedState.page=nextPage;
    pagedState.hasMore=Boolean(d.hasMore);
    let fresh=[];
    for(let it of d.items||[]){
     if(!it?.poster||!it?.title)continue;
     let k=`${it.type}:${it.id}`;
     if(!pagedState.seen.has(k)){pagedState.seen.add(k);fresh.push(it);items.push(it)}
    }
    let gridEl=document.querySelector('#paged-grid');
    if(fresh.length&&gridEl)gridEl.insertAdjacentHTML('beforeend',fresh.map(card).join(''));
    if(!anchor?.isConnected)return;
    moreResultsBtn.classList.remove('is-loading');
    if(pagedState.hasMore&&(d.items||[]).length){
     moreResultsBtn.disabled=false;
     moreResultsBtn.innerHTML=`${ico('plus')}<span>Show more</span>`;
    }else{
     anchor.remove();
    }
   }catch{
    if(anchor?.isConnected){
     moreResultsBtn.classList.remove('is-loading');
     moreResultsBtn.disabled=false;
     moreResultsBtn.innerHTML=`${ico('plus')}<span>Show more</span>`;
    }
   }
   return;
  }
  let reset=e.target.closest('[data-reset-settings]');if(reset){for(const key of RESET_PREF_KEYS)removePreference(key);applyDisplayPreferences();settingsPage();const status=document.querySelector('#settings-status');if(status)status.textContent='Preferences reset.';return}
  let genre=e.target.closest('[data-genre-filter]');if(genre){nav('/browse?genre='+encodeURIComponent(genre.dataset.genreFilter));return}
  let more=e.target.closest('[data-anime-page]');if(more&&detail){let mode=more.dataset.animeMode;await loadAnimeEpisodes(detail.item.id,mode,Number(more.dataset.animePage),mode==='watch'?episode:0,false);return}
  let dot=e.target.closest('[data-slide]');if(dot){const next=+dot.dataset.slide;showSlide(next,next<slide?-1:1);return}
  let open=e.target.closest('[data-open]');if(open){
   if(open.disabled)return;
   const u=new URL(open.dataset.open,location.origin),m=u.pathname.match(/^\/watch\/(anime|tv)\/(\d+)$/);
   if(m&&document.querySelector('#player')&&detail?.item?.type===m[1]&&String(detail.item.id)===m[2]){
    switchWatchEpisode({type:m[1],id:m[2],season:Number(u.searchParams.get('season')||1),episode:Number(u.searchParams.get('episode')||1)},{nextLang:u.searchParams.get('lang')||''});
   }else nav(open.dataset.open);
   return;
  }
  let link=e.target.closest('a[href^="/"]');if(link){e.preventDefault();nav(link.getAttribute('href'));return}
  let heroDetails=e.target.closest('[data-hero-details]');if(heroDetails){nav(heroDetails.dataset.heroDetails);return}
  if(e.target.closest('[data-retry]')){
   if(document.querySelector('#player')&&detail?.item){play(detail.item);return}
   // Re-rendering alone re-reads a failed answer from memory. Drop the cached
   // snapshot and start a fresh generation so the call is genuinely retried.
   offlineSnapshot=null;bundleItemsCache=null;
   try{routeGeneration++}catch{}
   render();
   return
  }
  if(e.target.closest('[data-save]')&&detail){changeWatchlistInstantly(detail.item);return}
 }catch(error){console.error(error)}
});


document.addEventListener('change',e=>{
 const pref=e.target.closest('[data-site-pref]');
 if(pref&&SITE_PREF_KEYS.includes(pref.dataset.sitePref)){savePreference(pref.dataset.sitePref,pref.type==='checkbox'?String(pref.checked):pref.value);applyDisplayPreferences();return}
 if(e.target.id==='season'&&detail)switchWatchEpisode({type:'tv',id:detail.item.id,season:+e.target.value,episode:1});
 if(e.target.id==='detail-tv-season'&&detail)loadDetailEpisodes(detail.item.id,e.target.value);
 if(e.target.id==='detail-one-piece-arc'&&detail){const r=onePieceArc(detail,+e.target.value);if(r)loadAnimeEpisodes(detail.item.id,'detail',Math.floor((r.startEp-1)/20)+1,0,true,r.startEp,r.endEp)}
 if(e.target.id==='watch-one-piece-arc'&&detail)switchWatchEpisode({type:'anime',id:detail.item.id,season:1,episode:+e.target.value});
 if(e.target.id==='detail-regional-season'&&detail){let startEp=Math.max(1,+e.target.value||1);loadAnimeEpisodes(detail.item.id,'detail',Math.floor((startEp-1)/20)+1,0,true,startEp)}
 if(e.target.id==='watch-regional-season'&&detail)switchWatchEpisode({type:'anime',id:detail.item.id,season:1,episode:Math.max(1,+e.target.value||1)});
 if(['detail-pokemon-region','watch-pokemon-region'].includes(e.target.id)&&detail){
  const [id,start]=e.target.value.split(':'),first=Number(start)||1;
  if(e.target.id==='watch-pokemon-region')switchWatchEpisode({type:'anime',id,season:1,episode:first});
  else if(String(id)!==String(detail.item.id))openAnimeDetailPart(id,first);
  else {const q=new URLSearchParams(routeQuery());q.set('episode',String(first));routeGo(routePath()+'?'+q,'','replace');const r=pokemonRegion(detail,id,first);loadAnimeEpisodes(id,'detail',Math.floor((first-1)/20)+1,0,true,r?.startEp||first,r?.endEp||0);let b=document.querySelector('.detail .actions [data-open]');if(b)b.dataset.open=`/watch/anime/${id}?episode=${first}`}
 }
 if(['detail-anime-season','anime-season'].includes(e.target.id)&&detail){let id=e.target.value;if(String(id)===String(detail.item.id))return;if(e.target.id==='anime-season')switchWatchEpisode({type:'anime',id,season:1,episode:1});else openAnimeDetailPart(id)}
});

// One drop-down, on the right of the header, holding everything the old left
// drawer held plus the Watchlist. The APK adds Downloads to the same list; the
// website never shows it because a browser cannot store a download. iOS does
// not expose the app bridge either, so nothing leaks to the web build.
function inAppShell(){
 try{return typeof window.kozutvDownloads==='object'&&window.kozutvDownloads!==null
   &&typeof window.kozutvDownloads.list==='function'}catch{return false}
}
function menuEntries(){
 const rows=[
  // The header bookmark is gone; Watchlist lives here with everything else.
  // The Downloads screen is gone too - the app's own download buttons still work.
  ['/browse','home','Home'],
  ['/watchlist','bookmark','Watchlist'],
  ['/schedule','clock','Schedule'],
  ['/random','shuffle','Random title'],
  ['/filters','sliders','Advanced filters'],
  ['/upcoming','calendar','Upcoming anime'],
  ['/settings','settings','Settings'],
  ['/report','warning','Report']
 ];
 // Downloads is a real screen only where the app bridge exists.
 return rows.map(r=>({href:r[0],icon:r[1]||'download',label:r[2],sep:r[0]==='/browse'}));
}
// One menu button, one panel: the hamburger on the left. There is no second
// drop-down anywhere in the header.
// ------------------------------------------------------------------ account
// The header shows one of two things: an orange Sign in pill, or the Discord
// avatar with a menu whose only item is Log out. The session itself is an
// httpOnly cookie, so this only ever learns "who am I".
const accountSlot=document.querySelector('#account-slot');
const signinBtn=document.querySelector('#signin-btn');
const avatarBtn=document.querySelector('#avatar-btn');
const avatarImg=document.querySelector('#avatar-img');
const avatarInitials=document.querySelector('#avatar-initials');
const accountMenu=document.querySelector('#account-menu');
const logoutBtn=document.querySelector('#logout-btn');
let currentAccount=null;

function closeAccountMenu(){
 if(accountMenu)accountMenu.hidden=true;
 avatarBtn?.setAttribute('aria-expanded','false');
}
function paintAccount(user){
 currentAccount=user||null;
 const signedIn=Boolean(user&&user.name);
 if(signinBtn)signinBtn.hidden=signedIn;
 if(avatarBtn)avatarBtn.hidden=!signedIn;
 if(!signedIn){closeAccountMenu();return}
 const label=String(user.name||user.username||'');
 const initials=label.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('')||'?';
 if(avatarInitials)avatarInitials.textContent=initials;
 if(avatarImg){
  if(user.avatar){avatarImg.src=user.avatar;avatarImg.alt='';avatarImg.removeAttribute('data-empty')}
  else{avatarImg.removeAttribute('src');avatarImg.setAttribute('data-empty','1');avatarImg.alt=''}
 }
 if(avatarBtn)avatarBtn.setAttribute('aria-label',`Account menu for ${label}`);
}
// Fire and forget: the header paints from whatever this returns, and a failure
// leaves the Sign in pill in place rather than an empty gap.
let accountPromise=null;
// `configured` and `database` come back with every "who am I" answer, and they
// are the two things that can make a sign-in impossible on this server. Holding
// on to them means the login card can say so instead of sending the visitor to
// Discord for a redirect that is guaranteed to fail.
let accountConfig=null;
function loadAccount(force=false){
 if(accountPromise&&!force)return accountPromise;
 accountPromise=get('/api/auth/me').then(d=>{accountConfig=d||null;paintAccount(d?.user||null);return d}).catch(()=>{paintAccount(null);return null});
 return accountPromise;
}
function accountUser(){return currentAccount}
signinBtn?.addEventListener('click',()=>{closeMenu();openLogin(location.pathname+location.search)});
// A blocked or dead avatar URL used to leave an empty circle with the initials
// hidden behind it - which reads exactly as "signed in as nobody". When the
// picture cannot load, fall back to the initials.
avatarImg?.addEventListener('error',()=>{avatarImg.setAttribute('data-empty','1')});
avatarBtn?.addEventListener('click',e=>{
 e.stopPropagation();
 const open=accountMenu?.hidden!==false;
 if(accountMenu)accountMenu.hidden=!open;
 avatarBtn.setAttribute('aria-expanded',String(open));
});
accountMenu?.addEventListener('click',e=>{if(e.target.closest('[data-account-link]'))closeAccountMenu()});
document.addEventListener('click',e=>{
 if(!e.target.closest('#account-slot'))closeAccountMenu();
});
logoutBtn?.addEventListener('click',async()=>{
 logoutBtn.disabled=true;
 try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store'})}catch{}
 paintAccount(null);
 accountPromise=Promise.resolve({user:null});
 await restoreScopedPreferences({user:null});
 closeAccountMenu();
 logoutBtn.disabled=false;
 if(routePath().startsWith('/login'))nav('/browse');
 else nav(location.pathname+location.search,'','replace');
});
async function restoreScopedPreferences(d){
 if(!d)return; // A network error must not look like a sign-out.
 const epoch=preferenceChangeEpoch;
 const scope=d.user?.id?'user-'+d.user.id:'guest';
 const state=d.user?await get('/api/state'):null;
 if(epoch!==preferenceChangeEpoch)return;
 try {
  const scopeKey='kozutv:preference-scope',oldScope=localStorage.getItem(scopeKey)||'guest';
  const keys=[...new Set([...RESET_PREF_KEYS,'kozutv-brightness','kozutv-volume'])];
  const snapshot=()=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null));
  if(oldScope!==scope){
   localStorage.setItem('kozutv:preferences:'+oldScope,JSON.stringify(snapshot()));
   for(const key of keys)localStorage.removeItem(key);
   const saved=JSON.parse(localStorage.getItem('kozutv:preferences:'+scope)||'{}');
   for(const [key,value] of Object.entries(saved))if(keys.includes(key)&&typeof value==='string')localStorage.setItem(key,value);
  }
  // Account state is authoritative on a connected device. Clear absent keys so
  // a previous account or an old reset cannot leave its settings behind.
  if(d.user && state && !state._unavailable){
   for(const key of keys)localStorage.removeItem(key);
   for(const [key,value] of Object.entries(state.settings||{}))if(keys.includes(key)&&typeof value==='string')localStorage.setItem(key,value);
  }
  localStorage.setItem(scopeKey,scope);
 }catch{}
 applyDisplayPreferences();
 if(routePath()==='/settings')settingsPage();
}
loadAccount().then(restoreScopedPreferences).catch(()=>{});

// Discord hands the browser back to this page with a marker saying how the
// sign-in went. "success" means the answer to "who am I" changed a second ago,
// so it is re-read past the cache; every other outcome gets said out loud,
// because a redirect that lands you back where you started with no avatar is
// indistinguishable from a dead button.
const SIGNIN_MESSAGE={
 cancelled:'Sign-in was cancelled on Discord.',
 expired:'That sign-in link had expired. Open the menu and try again.',
 database:'This server has no account database configured, so it cannot keep you signed in.',
 exchange:"Discord rejected the sign-in code. Its app settings must list this site's exact address as the redirect URI.",
 profile:'Discord would not return your profile. Try again in a moment.'
};
(function readSigninMarker(){
 const marker=new URLSearchParams(location.search).get('signin');
 if(!marker)return;
 // The marker is a one-time message: leave it in the address bar and every reload
 // (or every bookmark of that URL) tells the story again.
 try{history.replaceState(history.state,'',location.pathname+(location.hash||''))}catch{}
 if(marker==='success'){
  loadAccount(true).then(d=>{
   if(d?.user?.name)toast(`Signed in as ${d.user.name}`);
   else toast('Discord signed you in, but the session cookie never came back. Allow cookies for this site, and check it is being served over https.');
  });
  return;
 }
 toast(SIGNIN_MESSAGE[marker]||'Sign-in did not finish. Try again.');
})();

// --------------------------------------------------------------- login page
const DISCORD_MARK='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04c-1.71.3-3.35.81-4.89 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.29 1.22-1.98a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.87.9.08.08 0 0 0-.04.11c.36.69.77 1.35 1.22 1.98a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z"/></svg>';

// ------------------------------------------------------------------- login
// Not a page: a card over whatever the visitor was looking at, with the page
// blurred behind it. One heading, one button, nothing else to read.
const loginOverlay=document.querySelector('#login-overlay');
const loginDiscord=document.querySelector('#login-discord');
let loginReturnTo='/browse';

const loginNote=document.querySelector('#login-note');
function openLogin(returnTo){
 if(!loginOverlay)return;
 loginReturnTo=/^\/(?!\/)/.test(String(returnTo||''))?returnTo:(location.pathname+location.search);
 // A half-configured server used to look like a broken button: Discord said yes,
 // and nothing happened. Say which half is missing, and do not offer the trip.
 const blocked=!accountConfig||accountConfig.database===false||accountConfig.configured===false;
 if(loginNote){
  loginNote.hidden=!accountConfig||!blocked;
  loginNote.textContent=accountConfig&&blocked?(accountConfig.configured===false?'Sign in is not set up on this server yet (no Discord app id is configured).':'Sign in could not reach account storage. Please check the server configuration and connection.'):"";
 }
 if(loginDiscord)loginDiscord.disabled=blocked;
 loginOverlay.hidden=false;
 document.body.classList.add('login-open');
 loginDiscord?.focus({preventScroll:true});
 loadAccount().then(()=>{
  // The answer may still have been in flight when the card opened.
  const still=!accountConfig||accountConfig.database===false||accountConfig.configured===false;
  if(loginNote&&still){loginNote.hidden=false;loginNote.textContent=accountConfig&&accountConfig.configured===false?'Sign in is not set up on this server yet (no Discord app id is configured).':'Sign in could not reach account storage. Please check the server configuration and connection.';}
  if(loginDiscord)loginDiscord.disabled=still;
 });
}
function closeLogin(){
 if(!loginOverlay)return;
 loginOverlay.hidden=true;
 document.body.classList.remove('login-open');
}
loginOverlay?.addEventListener('click',e=>{
 // Clicking the blur - not the card - dismisses it.
 if(e.target===loginOverlay)closeLogin();
});
loginDiscord?.addEventListener('click',()=>{
 location.href=`/api/auth/discord/start?return=${encodeURIComponent(loginReturnTo)}`;
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&loginOverlay&&!loginOverlay.hidden)closeLogin();
});

const menuDropPanel=document.querySelector('#menu-drop-panel');
const navMenuToggle=document.querySelector('.menu-toggle-nav');
const menuToggles=[navMenuToggle].filter(Boolean);
// Kept for the keyboard handlers below; there is no left drawer any more.
const menuToggle=navMenuToggle||menuDropToggle,mainMenu=menuDropPanel;
function closeMenu(){
 for(const t of menuToggles){t.setAttribute('aria-expanded','false');t.setAttribute('aria-label',t===navMenuToggle?'Open menu':'Menu')}
 if(menuDropPanel)menuDropPanel.hidden=true;
 // Keeps the button styled as the panel's tab on engines without :has().
 headerEl?.classList.remove('menu-open');
}
// Sit the panel under the row that opened it: its left edge lands exactly on the
// menu button, and it already overlaps the header border by a pixel in CSS. The
// hard-coded `left` in the stylesheet is only a first paint; this is what keeps
// the drop-down glued to the wordmark when the header padding changes per width.
function alignMenuPanel(){
 if(!menuDropPanel||menuDropPanel.hidden)return;
 const host=menuDropPanel.offsetParent;
 if(!host||!navMenuToggle)return;
 const delta=Math.round(navMenuToggle.getBoundingClientRect().left-host.getBoundingClientRect().left);
 menuDropPanel.style.left=`${Math.max(0,delta)}px`;
}
function toggleMenu(from){
 const open=menuDropPanel?.hidden!==false;
 if(open)paintMenu();
 if(menuDropPanel)menuDropPanel.hidden=!open;
 if(open)alignMenuPanel();
 for(const t of menuToggles){t.setAttribute('aria-expanded',String(open));t.setAttribute('aria-label',open?'Close menu':(t===navMenuToggle?'Open menu':'Menu'))}
 headerEl?.classList.toggle('menu-open',open);
}
function paintMenu(){
 if(!menuDropPanel)return;
 const here=routePath();
 menuDropPanel.innerHTML=menuEntries().map((row,i)=>
  `${row.sep&&i?'<div class="menu-drop-sep"></div>':''}<a href="${row.href}" class="${here===row.href?'active':''}" data-menu-link="${row.href}">${ico(row.icon)}<span>${esc(row.label)}</span></a>`
 ).join('');
}
for(const t of menuToggles){
 t.addEventListener('click',e=>{
  e.stopPropagation();
  toggleMenu(t);
 });
}
let titleFitTimer=0;
// Rotating a phone or dragging a window edge re-measures the open panel and the
// episode heading, both of which size themselves to the space they have.
addEventListener('resize',()=>{
 alignMenuPanel();
 clearTimeout(titleFitTimer);
 titleFitTimer=setTimeout(fitNowPlayingTitle,140);
},{passive:true});
menuDropPanel?.addEventListener('click',e=>{
 const link=e.target.closest('[data-menu-link]');
 if(!link)return;
 // Let the normal router take over, but close instantly so the panel never
 // lingers over the page it just opened.
 closeMenu();
});
// Reaction clicks. Signed-out visitors are sent to the one-tap sign-in rather
// than told "no": the vote is the reason to make an account, so it should be
// the thing that offers one.
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-react]');if(!btn)return;
 const bar=btn.closest('[data-reaction-bar]');if(!bar)return;e.preventDefault();
 if(!accountUser()){openLogin(location.pathname+location.search);return}
 const old=bar._reactionState||{likes:0,dislikes:0,mine:0};
 const pressed=Number(btn.dataset.react),next=old.mine===pressed?0:pressed;
 const optimistic={...old,mine:next,likes:Math.max(0,old.likes-(old.mine===1?1:0)+(next===1?1:0)),dislikes:Math.max(0,old.dislikes-(old.mine===-1?1:0)+(next===-1?1:0))};
 const status=bar.querySelector('[data-reaction-status]');if(status)status.textContent='';
 paintReactions(bar,optimistic); // Paint before the network request starts.
 bar._reactionPending=(bar._reactionPending||0)+1;
 const task=(bar._reactionQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
  const res=await fetch('/api/reactions',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:bar.dataset.type,id:bar.dataset.id,season:Number(bar.dataset.season)||1,episode:Number(bar.dataset.episode)||1,reaction:next,set:true})});
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data||data.error){const error=new Error('vote failed');error.status=res.status;throw error}
  bar._reactionConfirmed=data;return data;
 });
 bar._reactionQueue=task;
 task.then(data=>{
  bar._reactionPending--;
  if(!bar._reactionPending&&bar.isConnected){paintReactions(bar,data);if(status)status.textContent=''}
 },error=>{
  bar._reactionPending--;
  if(!bar._reactionPending&&bar.isConnected){
   if(bar._reactionConfirmed)paintReactions(bar,bar._reactionConfirmed);
   else paintReactions(bar,old);
   if(status)status.textContent='Could not save. Please try again.';
   if(error.status===401)openLogin(location.pathname+location.search);
  }
 });
});

document.addEventListener('click',e=>{const desc=e.target.closest('[data-np-desc]');if(desc&&!String(window.getSelection?.()||''))desc.classList.toggle('open')});
document.addEventListener('click',e=>{if(!e.target.closest('#menu-drop-panel')&&!e.target.closest('.menu-toggle-nav'))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();if(!search.value.trim())closeSearchBox()}});
document.addEventListener('submit',e=>{
 let filters=e.target.closest('[data-filters]');if(!filters)return;
 e.preventDefault();let data=new FormData(filters),q=new URLSearchParams();
 for(let [key,value] of data)if(String(value).trim())q.set(key,String(value).trim());
 nav('/filters'+(q.toString()?'?'+q:''));
});

const searchbox=document.querySelector('.searchbox');
searchbox.addEventListener('click',()=>{closeMenu();searchbox.classList.add('open');headerEl?.classList.add('search-open');search.focus()});
search.addEventListener('focus',()=>{headerEl?.classList.add('search-open')});
search.addEventListener('blur',()=>{if(!search.value.trim())closeSearchBox()});
search.addEventListener('input',()=>{
 clearTimeout(searchTimer);routeGeneration++;episodeSwitchGeneration++;
 stopBrowseRows();disposeVideo();
 let term=search.value.trim();
 routeGo(term?`/browse?q=${encodeURIComponent(term)}`:'/browse','','replace');
 searchTimer=setTimeout(()=>term?catalog(true):catalog(false),320);
});
document.addEventListener('keydown',e=>{
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-hero-details]')){e.preventDefault();nav(e.target.dataset.heroDetails);return}
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-description-toggle]')){e.preventDefault();e.target.click();return}
 if(e.key==='/'&&document.activeElement!==search&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();searchbox.classList.add('open');headerEl?.classList.add('search-open');search.focus()}
});

// Flat menu: every row is a direct destination with its own solid icon.
const menuIcons={'/browse':'home','/schedule':'clock','/upcoming':'calendar','/random':'shuffle','/filters':'sliders','/settings':'settings','/watchlist':'bookmark','/downloads':'download'};
document.querySelectorAll('#main-menu a[href]').forEach(a=>{let icon=menuIcons[a.getAttribute('href')];if(icon)a.innerHTML=`${ico(icon)}<span>${esc(a.textContent)}</span>`});
document.querySelectorAll('[data-genre-filter]').forEach(b=>{b.innerHTML=`${ico(genreIcons[b.dataset.genreFilter]||'sparkles')}<span>${esc(b.textContent)}</span>`});
document.querySelectorAll('[data-menu-heading]').forEach(el=>{el.innerHTML=`${ico(el.dataset.menuHeading)}<span>${esc(el.textContent)}</span>${ico('chevron','menu-chevron')}`});
// One router entry point, used by both history modes.
let routeHandler=null;
function handleRouteChange(){if(routeHandler)routeHandler()}
window.addEventListener('popstate',handleRouteChange);
window.addEventListener('hashchange',()=>{if(bundledMode())handleRouteChange(true)});
let routeApplied='';
routeHandler=(fromHash=false)=>{
 // A route we already applied is not applied again: in the app, every route
 // change also writes location.hash, so handling the following hashchange would
 // render twice - and the second render destroyed a player that was loading.
 const here=routePath()+'?'+routeQuery();
 if(fromHash&&here===routeApplied)return;
 routeApplied=here;
 search.value=params().get('q')||'';
 const m=routePath().match(/^\/(?:browse\/)?watch\/(anime|tv)\/(\d+)$/),p=params();
 if(m&&document.querySelector('#player')&&detail?.item?.type===m[1]){
  switchWatchEpisode({type:m[1],id:m[2],season:Number(p.get('season')||1),episode:Number(p.get('episode')||p.get('ep')||1)},{historyMode:'none',nextLang:p.get('lang')||'',nextProvider:p.get('provider')||'vidcore'});
 }else render();
};
if(routePath()==='/')routeGo('/browse','','replace');
// Preferences are applied before the first paint so a reduced-motion or
// language choice never flashes the default screen first.
applyDisplayPreferences();
// The stored list is read once when the app starts, so the player's download
// icon already knows whether an episode is on the phone before it is opened.
setTimeout(()=>{try{downloadsReady()&&refreshDownloads()}catch{}},1500);
render();
try{applyDisplayPreferences();if(routePath()==='/settings')render()}catch{}
