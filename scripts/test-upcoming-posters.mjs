import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAnimePosterLoader} from '../anime-posters.js';
import {mergeUpcoming} from '../upcoming.js';
let calls=0;
const official='https://cdn.myanimelist.net/images/anime/1/123.jpg';
const load=createAnimePosterLoader(async id=>{calls++;return {data:{mal_id:Number(id),images:{jpg:{large_image_url:official}}}}},{interval:0});
assert.deepEqual(await Promise.all([load('20'),load('20')]),[official,official]);assert.equal(calls,1,'coalesced');
assert.equal(await load('20'),official);assert.equal(calls,1,'cached');
assert.equal(await load('wrong'),'');assert.equal(calls,1,'invalid IDs never fetched');
for(const result of [{data:{mal_id:99,images:{jpg:{large_image_url:official}}}},{data:{mal_id:20,images:{jpg:{large_image_url:'https://evil.example/image.jpg'}}}}]){
 const bad=createAnimePosterLoader(async()=>result,{interval:0});assert.equal(await bad('20'),'','wrong title/host rejected');
}
let failures=0;const offline=createAnimePosterLoader(async()=>{failures++;throw Error('fetch failed')},{interval:0});await offline('20');await offline('21');assert.equal(failures,1,'outage circuit avoids flooding Jikan');
const anime=[{id:'20',type:'anime',poster:official,title:'Anime'}];
const movie={id:1,title:'Movie',release_date:'2027-01-01',poster_path:'/m.jpg'};
const tv={id:2,name:'Series',first_air_date:'2027-02-01',poster_path:'/t.jpg'};
const items=mergeUpcoming(anime,[movie,{...movie,id:3,release_date:'2020-01-01'},{...movie,id:4,adult:true}],[tv],'2026-11-27');
assert.deepEqual(items.map(x=>x.type),['anime','movie','tv']);assert(items.every(x=>x.upcoming&&!x.playable));assert.equal(items[1].releaseDate,'2027-01-01');assert.equal(items[2].title,'Series');
console.log('PASS mixed Upcoming contract, released/adult filtering, official Jikan ID/host validation, dedupe, cache and outage backoff');

const entries=JSON.parse(fs.readFileSync(new URL('../data/megaplay-catalog.json',import.meta.url))).entries;
const identified=entries.filter(x=>x.mal&&x.poster);assert(identified.length>6000);assert(identified.every(x=>/^[1-9]\d{0,9}$/.test(String(x.mal))));
console.log(`PASS ${identified.length} catalogue anime cards have numeric MAL IDs for exact Jikan lookups (not a live visual audit)`);
