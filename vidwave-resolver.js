// Vidwave Hindi anime source resolver. The provider can change this protocol.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
const ROOT='https://embed.vidwave.sbs';
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const INFO=Buffer.from('Stream:sources:v1');
function attr(html,name){const m=html.match(new RegExp('\\b'+name+'=["\']([^"\']+)["\']','i'));return m?.[1]||''}
export async function resolveVidwaveHindi({aniId,episode}){
 const id=Number(aniId),ep=Number(episode);
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(ep)||ep<1)throw Error('Vidwave needs a valid AniList ID and episode.');
 const url=`${ROOT}/anime/hindi/${id}/${ep}?server=main`;
 const headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'};
 const page=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
 if(!page.ok)throw Error(`Vidwave player unavailable (${page.status}).`);
 const html=await page.text();
 const csrf=html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i)?.[1]||'';
 const token=attr(html,'data-token'),encrypted=attr(html,'data-encrypted'),serverKey=attr(html,'data-source-crypto-key');
 if(!csrf||!token||!encrypted||!serverKey)throw Error('Vidwave player did not provide source credentials.');
 const cookie=page.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const ecdh=crypto.createECDH('prime256v1');const publicKey=ecdh.generateKeys();
 const body=new URLSearchParams({token,encrypted,clientPublicKey:publicKey.toString('base64url'),cryptoVersion:'1',_csrfToken:csrf});
 const response=await fetch(`${ROOT}/ajax/anime/hindi/sources`,{method:'POST',headers:{'User-Agent':UA,'Accept':'application/json, text/javascript, */*; q=0.01','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','X-CSRF-Token':csrf,'Referer':url,'Origin':ROOT,...(cookie?{Cookie:cookie}:{})},body,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Vidwave source request failed (${response.status}).`);
 const result=await response.json();const env=result?.result;
 if(env?.v!==1||env?.alg!=='P256-HKDF-SHA256-A256GCM')throw Error('Vidwave returned an unsupported source response.');
 const shared=ecdh.computeSecret(Buffer.from(serverKey,'base64url'));
 const key=crypto.hkdfSync('sha256',shared,Buffer.from(env.salt,'base64url'),INFO,32);
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(env.iv,'base64url'));
 cipher.setAAD(INFO);cipher.setAuthTag(Buffer.from(env.tag,'base64url'));
 let data=JSON.parse(Buffer.concat([cipher.update(Buffer.from(env.ciphertext,'base64url')),cipher.final()]).toString());
 const candidates=Array.isArray(data.streams)?data.streams.filter(s=>s?.file):[];
 if(data.source)candidates.unshift({file:data.source,label:'Auto',type:data.type});
 const streams=candidates.filter(s=>{try{return new URL(s.file).protocol==='https:'}catch{return false}}).map(s=>({url:s.file,label:String(s.label||'Auto'),type:String(s.type||'')}));
 if(!streams.length)throw Error('Vidwave returned no playable stream.');
 return {streams,tracks:Array.isArray(data.tracks)?data.tracks:[],intro:data.intro||null,outro:data.outro||null};
}

// Test that the returned media is reachable from this server, not merely that
// Vidwave produced a URL. Keep this brief and do not cache failed answers.
const verifiedCache=new Map(), pending=new Map();
function publicAddress(ip){
 if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)))}
 if(net.isIPv6(ip)){const s=ip.toLowerCase();return !(/^(::|::1|fc|fd|fe8|fe9|fea|feb|ff)/.test(s)||s.includes('::ffff:'))}
 return false;
}
async function safeProbeFetch(raw,headers){
 let url=new URL(raw);
 for(let n=0;n<4;n++){
  if(url.protocol!=='https:'||!url.hostname.includes('.')||net.isIP(url.hostname))throw Error('Unsafe media host.');
  const resolved=await dns.lookup(url.hostname,{all:true});
  if(!resolved.length||resolved.some(x=>!publicAddress(x.address)))throw Error('Unsafe media address.');
  const r=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(![301,302,303,307,308].includes(r.status))return r;
  const location=r.headers.get('location');await r.body?.cancel();if(!location)throw Error('Invalid redirect.');url=new URL(location,url);
 }
 throw Error('Too many media redirects.');
}
export async function resolvePlayableVidwaveHindi(input){
 const k=`${Number(input.aniId)}:${Number(input.episode)}`,now=Date.now();
 const cached=verifiedCache.get(k);if(cached&&cached.until>now)return cached.value;
 if(pending.has(k))return pending.get(k);
 const task=(async()=>{
  const value=await resolveVidwaveHindi(input);
  const good=[];
  for(const stream of value.streams){
   try{
    const url=new URL(stream.url);
    // These are provider-returned hosts, never a URL supplied by the caller.
    if(url.protocol!=='https:'||!url.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname))continue;
    const isHls=/hls|m3u8/i.test(stream.type)||/\.m3u8(?:$|\?)/i.test(stream.url);
    const r=await safeProbeFetch(url,{ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Referer':'https://embed.vidwave.sbs/',...(isHls?{}:{Range:'bytes=0-1023'})});
    if(!r.ok){await r.body?.cancel();continue}
    if(isHls){const reader=r.body?.getReader();const chunk=reader?await reader.read():null;await reader?.cancel();if(!Buffer.from(chunk?.value||[]).toString('utf8').trimStart().startsWith('#EXTM3U'))continue}
    else {const type=r.headers.get('content-type')||'';await r.body?.cancel();if(!/video|octet-stream/i.test(type))continue}
    good.push(stream);
   }catch{}
  }
  if(!good.length)throw Error('Vidwave has no reachable Hindi stream for this episode.');
  value.streams=good;verifiedCache.set(k,{value,until:Date.now()+30000});
  if(verifiedCache.size>100)verifiedCache.delete(verifiedCache.keys().next().value);
  return value;
 })();pending.set(k,task);try{return await task}finally{pending.delete(k)}
}
