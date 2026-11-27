// kozuTV essential shell only. Images and catalogue API results are deliberately
// not stored in CacheStorage: large posters rapidly filled mobile storage.
const VERSION = 'kozutv-v43';
const SHELL = `${VERSION}-shell`;
const ESSENTIAL = [
  '/', '/index.html', '/app.js', '/style.css', '/icons.js',
  '/megaplay-controls.js', '/megaplay-controls.css', '/site.webmanifest',
  '/vendor/video-js.min.css', '/vendor/video.min.js',
  '/fonts/archivo-latin.woff2', '/fonts/manrope-latin.woff2', '/images/favicon-192.png'
];
const essentialPaths = new Set(ESSENTIAL);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 await Promise.all(ESSENTIAL.map(url=>cache.add(url).catch(()=>{})));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Delete ONLY old kozuTV caches, not unrelated applications on this origin.
 const names=await caches.keys();
 await Promise.all(names.filter(name=>/^kozutv-v\d+-/.test(name)&&name!==SHELL).map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/api/')){
  // API and image requests always go to the network, never to persistent cache.
  event.respondWith(url.pathname==='/api/img'?fetch(req,{cache:'no-store'}):fetch(req));return;
 }
 if(req.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok){const c=await caches.open(SHELL);await c.put('/index.html',response.clone())}return response}catch(error){const c=await caches.open(SHELL);const saved=await c.match('/index.html');if(saved)return saved;throw error}})());return;
 }
 if(!essentialPaths.has(url.pathname))return;
 event.respondWith((async()=>{
  const c=await caches.open(SHELL);
  // A versioned asset must be fetched once; old query variants are removed.
  const hit=await c.match(req);if(hit)return hit;
  try{const response=await fetch(req);if(response.ok){for(const old of await c.keys())if(new URL(old.url).pathname===url.pathname)await c.delete(old);await c.put(req,response.clone())}return response}
  catch(error){const saved=await c.match(req,{ignoreSearch:true});if(saved)return saved;throw error}
 })());
});
