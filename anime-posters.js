// Official Jikan/MAL artwork only: no generated covers, title overlays or search guesses.
export function createAnimePosterLoader(fetchAnime,{interval=550,maxPending=40,now=Date.now}={}){
 const cache=new Map(),pending=new Map();let tail=Promise.resolve(),nextStart=0,unreachableUntil=0;
 return function poster(id){
  id=String(id);if(!/^[1-9]\d{0,9}$/.test(id))return Promise.resolve('');
  const hit=cache.get(id);if(hit&&hit.until>now())return Promise.resolve(hit.url);
  if(now()<unreachableUntil)return Promise.resolve('');
  if(pending.has(id))return pending.get(id);
  if(pending.size>=maxPending)return Promise.resolve('');
  const slot=tail.then(async()=>{const wait=Math.max(0,nextStart-now());if(wait)await new Promise(r=>setTimeout(r,wait));nextStart=now()+interval});
  tail=slot.catch(()=>{});
  const task=slot.then(()=>now()<unreachableUntil?null:fetchAnime(id)).then(result=>{
   const data=result?.data;if(String(data?.mal_id)!==id)return '';
   const url=data?.images?.jpg?.large_image_url||data?.images?.webp?.large_image_url||data?.images?.jpg?.image_url||'';
   try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='cdn.myanimelist.net'?u.href:''}catch{return ''}
  }).catch(error=>{if(/fetch|timeout|connect|abort/i.test(error?.message||'')||error?.status===429)unreachableUntil=now()+60000;return ''}).then(url=>{
   cache.delete(id);cache.set(id,{url,until:now()+(url?86400000:60000)});
   while(cache.size>3000)cache.delete(cache.keys().next().value);
   return url;
  }).finally(()=>pending.delete(id));
  pending.set(id,task);return task;
 };
}
