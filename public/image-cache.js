// Persistent FIFO image cache. Reading an image never changes eviction order.
// Separate from the shell version so an app update does not redownload posters.
const IMAGE_CACHE = 'kozutv-images-v1';
const IMAGE_MAX_BYTES = 64 * 1024 * 1024;
const IMAGE_MAX_ENTRIES = 240;
const IMAGE_MAX_FILE = 8 * 1024 * 1024;
let imageWrites = Promise.resolve();
const imageRequests = new Map();
async function pruneImages(cache, extraBytes = 0, extraEntries = 0) {
 const keys = await cache.keys();
 const sizes = await Promise.all(keys.map(async key => Number((await cache.match(key))?.headers.get('x-kozutv-image-bytes')) || 0));
 let bytes = sizes.reduce((a,b)=>a+b,0), count = keys.length;
 for(let i=0;i<keys.length && (bytes+extraBytes>IMAGE_MAX_BYTES || count+extraEntries>IMAGE_MAX_ENTRIES);i++) {
  await cache.delete(keys[i]);bytes-=sizes[i];count--;
 }
}
async function storeImage(request, response) {
 if(/no-store/i.test(response.headers.get('cache-control')||''))return;
 if(!response.ok || response.type==='opaque' || !/^image\//i.test(response.headers.get('content-type')||''))return;
 if(Number(response.headers.get('content-length'))>IMAGE_MAX_FILE)return;
 const blob=await response.blob();if(!blob.size || blob.size>IMAGE_MAX_FILE)return;
 const cache=await caches.open(IMAGE_CACHE);
 if(await cache.match(request))return;
 const headers=new Headers(response.headers);headers.set('x-kozutv-image-bytes',String(blob.size));
 // A decoded body must not retain the upstream transfer encoding/length.
 headers.delete('content-encoding');headers.delete('content-length');
 const saved=new Response(blob,{status:200,headers});
 await pruneImages(cache,blob.size,1);
 try{await cache.put(request,saved.clone())}catch(error){
  if(error.name!=='QuotaExceededError')throw error;
  // Storage pressure from other origin data: free the oldest half, retry once.
  const keys=await cache.keys();for(const key of keys.slice(0,Math.max(1,Math.ceil(keys.length/2))))await cache.delete(key);
  await cache.put(request,saved);
 }
}
async function cachedImage(request,event) {
 const cache=await caches.open(IMAGE_CACHE).catch(()=>null);
 const hit=await cache?.match(request).catch(()=>null);
 if(hit){const expiry=Number(hit.headers.get('x-kozutv-image-expiry'));if(!expiry||expiry>Date.now())return hit;await cache.delete(request)}
 const key=request.url;
 if(!imageRequests.has(key)){
  const task=fetch(request).then(response=>{
   const copy=response.clone();
   imageWrites=imageWrites.catch(()=>{}).then(()=>storeImage(request,copy)).catch(()=>{});
   event.waitUntil(imageWrites);
   return response;
  }).finally(()=>imageRequests.delete(key));
  imageRequests.set(key,task);
 }
 return (await imageRequests.get(key)).clone();
}
