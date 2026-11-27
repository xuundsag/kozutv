import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAnimeFamilies} from '../anime-families.js';
const item=(id,title,year,format='TV')=>({id:String(id),type:'anime',title,year,format,isMovie:format==='MOVIE',poster:'poster'});
const items=[item(1,'Original',2000),item(2,'Different sequel title',2005),item(3,'Third',2010),item(4,'Film',2006,'MOVIE'),item(5,'Unrelated',2003),{...item(6,'TV series',2002),type:'tv'}];
const records={1:{relations:[{type:'SEQUEL',idMal:2,format:'TV'},{type:'SEQUEL',idMal:4,format:'MOVIE'}]},2:{relations:[{type:'SEQUEL',idMal:3,format:'TV'},{type:'SIDE_STORY',idMal:5,format:'TV'}]}};
let groups=buildAnimeFamilies(items,records);assert.deepEqual(groups.map(g=>g.map(x=>x.id)),[['1','2','3']]);
groups=buildAnimeFamilies(items,records,[['1','5']]);assert.deepEqual(groups[0].map(x=>x.id),['1','5','2','3']);
const bridgeRecords={1:{format:'TV',relations:[{type:'SEQUEL',idMal:99,format:'TV'}]},99:{format:'TV',relations:[{type:'SEQUEL',idMal:2,format:'TV'}]}};
assert.deepEqual(buildAnimeFamilies(items,bridgeRecords).map(g=>g.map(x=>x.id)),[['1','2']]);
const snapshot=JSON.parse(fs.readFileSync(new URL('../data/anime-relations.json',import.meta.url)));
assert.ok(snapshot.completed.length>=5500);assert.ok(Object.keys(snapshot.records).length>=5400);
assert.ok(snapshot.records['20'].relations.some(x=>String(x.idMal)==='1735' && x.type==='SEQUEL'));
console.log('PASS relation graph transitivity, chronology, movie and side-story exclusion, curated groups, Naruto snapshot and catalogue coverage');
const raw=JSON.parse(fs.readFileSync(new URL('../data/megaplay-catalog.json',import.meta.url))).entries;
const catalogue=raw.filter(x=>x.mal&&x.id&&x.poster&&Number(x.episodes)>0).map(x=>({id:String(x.mal),type:'anime',title:x.title,year:x.year,format:String(x.format||'').toUpperCase(),isMovie:/MOVIE/i.test(x.format||'')}));
const relationGroups=buildAnimeFamilies(catalogue,snapshot.records);
const membership=new Map();for(const [i,g] of relationGroups.entries())for(const x of g){assert.ok(!membership.has(x.id),`ID ${x.id} appears twice`);assert.ok(!x.isMovie);membership.set(x.id,i)}
const eligible=new Set(catalogue.filter(x=>['TV','TV_SHORT','ONA','OVA','SPECIAL'].includes(x.format)).map(x=>x.id));let checked=0;
for(const [id,record] of Object.entries(snapshot.records))if(eligible.has(id))for(const edge of record.relations||[]){let other=String(edge.idMal);if(eligible.has(other)&&['PREQUEL','SEQUEL'].includes(edge.type)){assert.equal(membership.get(id),membership.get(other),`Unmerged linked seasons ${id}/${other}`);checked++}}
let missing=[...eligible].filter(id=>!snapshot.records[id]);assert.ok(eligible.size>6500);assert.ok(checked>1000);assert.ok(missing.length<150);console.log(`PASS catalogue-wide audit: ${eligible.size} eligible records, ${relationGroups.length} linked families, ${checked} direct links checked, ${missing.length} unavailable metadata records`);
