// Builds a resumable AniList relationship snapshot for the playable catalogue.
// Only PREQUEL/SEQUEL graph information is saved, not artwork or catalogue data.
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('data/anime-relations.json');
const catalog=JSON.parse(fs.readFileSync('data/megaplay-catalog.json','utf8'));
const ids=[...new Set(catalog.entries.filter(x=>x.mal&&x.id&&x.poster&&Number(x.episodes)>0&&!/MOVIE|MUSIC/i.test(x.format||'')).map(x=>Number(x.mal)).filter(Number.isSafeInteger))].sort((a,b)=>a-b);
let saved={source:'https://graphql.anilist.co',generated:null,completed:[],records:{}};
try{const old=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(old.completed)&&old.records)saved=old}catch{}
const completed=new Set(saved.completed.map(Number));
const query='query($ids:[Int]){Page(page:1,perPage:50){media(idMal_in:$ids,type:ANIME){id idMal format startDate{year month day} relations{edges{relationType node{idMal type format}}}}}}';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function save(){saved.completed=[...completed].sort((a,b)=>a-b);saved.generated=new Date().toISOString();let t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(saved));fs.renameSync(t,file)}
function missingBridges(){
 const found=new Set();
 for(const record of Object.values(saved.records)) for(const edge of record.relations||[]){
  const id=Number(edge.idMal);if(['TV','TV_SHORT','ONA','OVA','SPECIAL'].includes(edge.format)&&Number.isSafeInteger(id)&&!completed.has(id))found.add(id);
 }
 return [...found].sort((a,b)=>a-b);
}
let pending=ids.filter(id=>!completed.has(id)); if(!pending.length)pending=missingBridges();
console.log(`${completed.size} attempted; ${pending.length} remaining in current wave`);
while(pending.length){
 const batch=pending.slice(0,50); let response,body;
 try{
  response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({query,variables:{ids:batch}}),signal:AbortSignal.timeout(30000)});
  if(response.status===429){let wait=Math.max(5,Math.min(120,Number(response.headers.get('retry-after'))||65));console.log(`rate limited; waiting ${wait}s`);await sleep(wait*1000);continue}
  if(!response.ok)throw Error('HTTP '+response.status);
  body=await response.json();if(body.errors||!Array.isArray(body.data?.Page?.media))throw Error('invalid GraphQL result');
  for(const m of body.data.Page.media){if(m.idMal)saved.records[String(m.idMal)]={idMal:m.idMal,format:m.format,startDate:m.startDate,relations:(m.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node?.type==='ANIME').map(e=>({type:e.relationType,idMal:e.node.idMal,format:e.node.format})).filter(e=>e.idMal)};}
  for(const id of batch)completed.add(id);pending=pending.slice(batch.length);if(!pending.length)pending=missingBridges();save();console.log(`saved ${completed.size} attempted; ${Object.keys(saved.records).length} metadata records; ${pending.length} remaining in wave`);
  await sleep(1500);
 }catch(e){console.error('fetch failed:',e.message,'retrying in 15s');await sleep(15000)}
}
save();console.log('DONE');
