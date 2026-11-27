// Reproduces the APK's runtime: the page is served from https://kozutv.local,
// every request on that origin is answered from assets/site (exactly like
// AssetServer), and the live server is unreachable. fetch() must therefore
// still work - that is what file:// forbade.
import {chromium} from 'playwright';
import fs from 'fs'; import path from 'path';

const SITE = '/home/user/android/kozuTV-app/app/src/main/assets/site';
const API_HITS = [];
const NET_BLOCKED = [];

const browser = await chromium.launch({args:['--no-sandbox']});
const ctx = await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0,160)));

// AssetServer equivalent
await page.route('https://kozutv.local/**', async route => {
  const u = new URL(route.request().url());
  const p = u.pathname;
  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/\/+$/,'');
    API_HITS.push(name);
    if (name === 'state') return route.abort('failed');      // as AssetServer does
    const f = path.join(SITE,'api', name.replace(/[^a-zA-Z0-9_-]/g,'_') + '.json');
    if (!fs.existsSync(f)) return route.fulfill({status:200,contentType:'application/json',
      body:'{"offline":true,"items":[],"entries":[],"spotlight":[],"suggestions":[]}'});
    return route.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(f)});
  }
  let f = path.join(SITE, p === '/' ? 'index.html' : p.slice(1));
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(SITE,'index.html');
  const map = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  return route.fulfill({status:200,contentType:map[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
});

// The live server is dead (phone with no signal)
await page.route('https://kozutv.bond/**', async route => { NET_BLOCKED.push(route.request().url()); return route.abort('failed'); });

await page.goto('https://kozutv.local/index.html', {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForTimeout(2500);

const cards = await page.locator('.card').count();
const hero  = await page.locator('.hero h1').first().textContent().catch(()=>null);
const catErr= await page.locator('.empty h2').first().textContent().catch(()=>null);
const footer= await page.locator('footer').count();
const offlineChip = await page.locator('body').getAttribute('class');

console.log('cards            :', cards);
console.log('hero             :', hero);
console.log('error panel      :', catErr);
console.log('footer elements  :', footer);
console.log('api served from bundle:', [...new Set(API_HITS)].join(', ') || '(none)');
console.log('page errors      :', errors.length, errors.slice(0,2));

// hash routing must still swap pages without a reload
await page.evaluate(()=>{location.hash='/watchlist'});
await page.waitForTimeout(1200);
console.log('after route      : hash =', await page.evaluate(()=>location.hash),
            '| cards =', await page.locator('.card').count(),
            '| errors =', errors.length);

// and back to browse
await page.evaluate(()=>{location.hash='/'});
await page.waitForTimeout(2000);
console.log('back home        : cards =', await page.locator('.card').count());

await browser.close();
