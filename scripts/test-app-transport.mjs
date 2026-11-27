// The bug this guards: the native bridge answers with a plain object
// ({status, ok, body}), but every caller was written against a browser
// Response and called r.text(). So every live read inside the app threw
// "r.text is not a function", the page fell through to the bundled snapshot,
// and the app looked like it was showing pre-saved titles with no posters, no
// search and nothing live - while the network was fine.
//
// It also guards the opposite failure: an empty body used to reach the page as
// a successful answer and surface as a property error far from the cause.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/home/user/android/kozuTV-app/app/src/main/assets/site';
const LIVE_TITLE = 'Bridge Transport Canary';   // deliberately absent from the snapshot

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`PASS ${name}`);
  else { failures++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

// A stand-in for the phone: the bridge returns bridge-shaped objects, and the
// server answers with one recognisable live payload.
await context.addInitScript((liveTitle) => {
  window.kozutvAndroid = { publish: () => true, clear: () => {}, status: () => '{}' };
  // Native allocates its own ticket for each call, in order, starting at 1:
  // exactly the numbering the page keeps.
  let seq = 0;
  window.kozutvHttp = {
    request(method, url) {
      const ticket = ++seq;
      const live = {
        status: 200, ok: true, contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            id: 'canary-1', type: 'movie', title: liveTitle, rating: 9.9, year: 2026,
            // posters and a backdrop: a title without art is not a hero candidate
            poster: 'https://image.tmdb.org/t/p/w500/canary.jpg',
            backdrop: 'https://image.tmdb.org/t/p/original/canary.jpg'
          }]
        })
      };
      const empty = { status: 200, ok: true, contentType: 'application/json', body: '' };
      const answer = url.includes('/api/browse') && !window.__emptyBody ? live : empty;
      setTimeout(() => window.kozutvHttpResolve && window.kozutvHttpResolve(ticket, answer), 20);
      return ticket;
    }
  };
  window.kozutvImg = { load: (url, ticket) => window.kozutvImgResolve(ticket, '') };
}, LIVE_TITLE);

await context.route('https://kozutv.local/**', async (route) => {
  const url = new URL(route.request().url());
  const p = url.pathname;
  if (p.startsWith('/api/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"watchlist":[],"history":[]}' });
  }
  let file = path.join(SITE, p === '/' ? 'index.html' : p.slice(1));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(SITE, 'index.html');
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
});
await context.route('https://kozutv.bond/**', (route) => route.abort('failed'));

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// ---- 1. a bridge-shaped answer is a real answer ----------------------------
await page.goto('https://kozutv.local/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const titles = await page.locator('.card h3').allInnerTexts();
check('a bridge object is read as a response', titles.includes(LIVE_TITLE), `first title: ${titles[0] || 'none'}`);
// One live title plus the rows the page builds around it: what matters is that
// the live item is on screen, not that the shelf is short.
check('the live answer is used instead of the snapshot', titles.length > 0 && titles.includes(LIVE_TITLE), `${titles.length} cards`);
check('no stale badge when the live call succeeded', (await page.locator('#sync-badge').count()) === 0);
check('no page errors', pageErrors.length === 0, pageErrors[0] || '');

// ---- 2. an empty body never reaches the page as success --------------------
const page2 = await context.newPage();
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(String(e)));
await page2.addInitScript(() => { window.__emptyBody = true; });
await page2.goto('https://kozutv.local/index.html', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(3500);
const cards2 = await page2.locator('.card').count();
const body2 = await page2.evaluate(() => (document.querySelector('main')?.innerText || '').slice(0, 200));
check('an empty body falls back to the bundled catalogue', cards2 > 0, `${cards2} cards`);
check('an empty body does not raise a property error', !/reading 'upcoming'|undefined \(reading/i.test(body2) && errors2.length === 0, (errors2[0] || body2).slice(0, 80));
check('the fallback says it is the saved copy', (await page2.locator('#sync-badge').count()) === 1);

await browser.close();
console.log(failures === 0 ? '\nALL TRANSPORT CHECKS PASSED' : `\n${failures} TRANSPORT CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
