import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const counts=new Map();let browser;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://test');
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api/img'){
  const id=url.searchParams.get('i');counts.set(id,(counts.get(id)||0)+1);
  res.setHeader('Content-Type',id==='html'?'text/html':'image/png');
  if(id!=='nocache')res.setHeader('Cache-Control','public, max-age=0');
  if(id==='bad')res.statusCode=502;
  return res.end(Buffer.alloc(id==='large'?80:20,65));
 }
 if(url.pathname==='/__test')return res.end('<!doctype html><title>Image cache QA</title>');
 if(url.pathname==='/sw.js'||url.pathname==='/image-cache.js'){
  let text=await fs.readFile(new URL('../public'+url.pathname,import.meta.url),'utf8');
  if(url.pathname==='/image-cache.js')text=text.replace('64 * 1024 * 1024','100').replace('IMAGE_MAX_ENTRIES = 240','IMAGE_MAX_ENTRIES = 3');
  res.setHeader('Content-Type','application/javascript');return res.end(text);
 }
 res.end('shell fixture');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/__test`);
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready});
 await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const get=async id=>{await page.evaluate(async id=>(await fetch('/api/img?i='+id)).arrayBuffer(),id)};
 const wait=async ids=>page.waitForFunction(async ids=>{const c=await caches.open('kozutv-images-v1');const got=(await c.keys()).map(k=>new URL(k.url).searchParams.get('i'));return JSON.stringify(got)===JSON.stringify(ids)},ids);
 for(const id of ['a','b','c'])await get(id);await wait(['a','b','c']);
 await get('a');assert.equal(counts.get('a'),1,'cache hit avoids server');
 await page.reload();await get('a');assert.equal(counts.get('a'),1,'cache survives reload');
 await get('d');await wait(['b','c','d']);assert.equal(counts.get('a'),1,'FIFO reads do not change insertion order');
 await get('a');await wait(['c','d','a']);assert.equal(counts.get('a'),2,'evicted image refetched');
 await get('large');await wait(['a','large']);
 const sizes=await page.evaluate(async()=>{const c=await caches.open('kozutv-images-v1');return Promise.all((await c.keys()).map(async k=>Number((await c.match(k)).headers.get('x-kozutv-image-bytes'))))});
 assert(sizes.reduce((a,b)=>a+b,0)<=100,'byte limit respected');
 for(const id of ['bad','html','nocache']){await get(id);await get(id);assert.equal(counts.get(id),2,'failed/non-image/private response not cached: '+id)}
 await context.setOffline(true);await get('a');assert.equal(counts.get('a'),2,'cached image available offline');
 console.log('PASS real service worker: reload/offline persistence, FIFO count/byte eviction, refetch, failures and no-store exclusion');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
