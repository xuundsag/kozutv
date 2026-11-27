import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:3011';
async function api(path){const r=await fetch(base+path,{signal:AbortSignal.timeout(35000)});assert.equal(r.status,200,path);return r.json()}
const detail=async id=>api('/api/detail?type=anime&id='+id);
for(const [query,root,forbidden] of [['Naruto Shippuden','20','1735'],['Attack on Titan final season','16498','40028'],['Beyblade Metal Fury','288','43421'],['Pokemon XY','527','19291']]){
 const d=await api('/api/search-all?type=anime&q='+encodeURIComponent(query));const ids=(d.items||[]).map(x=>String(x.id));assert.ok(ids.includes(root),`${query} lacks root`);assert.ok(!ids.includes(forbidden),`${query} duplicated season`);
}
for(const [root,child] of [['20','1735'],['16498','40028'],['16498','48583'],['288','43421'],['527','19291']]){const d=await detail(root);assert.ok(d.seasons?.some(x=>String(x.id)===child),`${root} selector lacks ${child}`)}
console.log('PASS real search deduplication and franchise selectors: Naruto, Attack on Titan, Beyblade and Pokémon');
