// QA: a deployed build must reach visitors who already have the app cached.
//
// The service worker used to answer every static request from the shell cache matched
// with `ignoreSearch: true`, and the "refresh quietly" step wrote only the queried key
// while the install step had seeded `/style.css` - so the entry that kept winning never
// changed. A cache-busting `?v=` in index.html could not help either, because the
// *document itself* was served from that same cache, pinning every reload to the links
// of the previous build. This test reproduces a real deploy on a live worker: the
// stylesheet changes AND index.html's `?v=` moves, and a single reload must show it.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const CSS = path.join(process.cwd(), 'public', 'style.css');
const HTML = path.join(process.cwd(), 'public', 'index.html');
const MARK = '\n/* sw-deploy-probe */ .header{outline:3px solid rgb(251,7,7)}\n';
const cssOriginal = fs.readFileSync(CSS, 'utf8');
const htmlOriginal = fs.readFileSync(HTML, 'utf8');
// The asset key is read out of index.html instead of being written here. Hardcoding it
// turned this suite into a check of whichever release was current when the file was
// written: the moment a release bumped ?v=, the harness failed for the wrong reason and
// the real assertion - "one reload shows the new bytes" - never ran.
const V = (fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8').match(/\?v=([0-9][^"'&\s]*)/) || [])[1] || '';
if (!V) { console.log('FAIL  harness — no ?v= asset key found in public/index.html'); process.exit(1); }
const V2 = '5.4.19-probe';
// The shell cache is named after the worker's own VERSION, so this test does not have
// to be edited every release - it reads what the build actually declares.
const SWV = (fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1] || '';
if (!SWV) { console.log('FAIL  harness — could not read VERSION from public/sw.js'); process.exit(1); }
if (!htmlOriginal.includes(V)) { console.log(`FAIL  harness — index.html does not carry ?v=${V}`); process.exit(1); }

const out = [];
const check = (name, pass, detail = '') => { out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); return pass; };
const probe = async p => p.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.header'));
  return { style: s.outlineStyle, color: s.outlineColor };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
let restore = () => {};
try {
  restore = () => { fs.writeFileSync(CSS, cssOriginal); fs.writeFileSync(HTML, htmlOriginal); };

  await p.goto(BASE + '/browse', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.reload({ waitUntil: 'load' });            // now SW-controlled, shell cached
  await p.waitForTimeout(2000);

  const sw = await p.evaluate(async ([SHELL, OLD]) => {
    const reg = await navigator.serviceWorker.getRegistration();
    const c = await caches.open(SHELL);
    const css = await c.match('/style.css');
    return {
      shellName: SHELL, oldName: OLD,
      active: reg?.active?.scriptURL || null,
      keys: (await caches.keys()).sort(),
      cssBytes: css ? (await css.text()).length : 0
    };
  }, [`${SWV}-shell`, SWV]);
  check('service worker is registered and active', !!sw.active, String(sw.active));
  check('the shell cache is the one this build declares', sw.keys.includes(sw.shellName), sw.keys.join(','));
  check('no cache from an older VERSION is left behind', !sw.keys.some(k => k.startsWith('kozutv-') && !k.startsWith(sw.oldName)), sw.keys.join(','));
  check('the stylesheet is cached by the worker', sw.cssBytes > 1000, `${sw.cssBytes} bytes`);

  // The offline catalogue the build ships must land in the cache the worker actually
  // reads - see apiCacheName() in app.js.
  const seeded = await p.evaluate(async name => {
    const c = await caches.open(name);
    const keys = await c.keys();
    return { total: keys.length, apiish: keys.filter(k => k.url.includes('__api')).length };
  }, sw.shellName.replace('-shell', '-api'));
  check('the bundled offline catalogue is seeded into the worker cache', seeded.total > 0, JSON.stringify(seeded));

  const before = await probe(p);
  check('baseline: the probe rule is not applied', before.style !== 'solid', JSON.stringify(before));

  // The deploy: new stylesheet bytes and a new `?v=` in the document.
  fs.writeFileSync(CSS, cssOriginal + MARK);
  fs.writeFileSync(HTML, htmlOriginal.split(V).join(V2));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);

  const after = await probe(p);
  check('one reload after a deploy shows the new CSS', after.style === 'solid' && after.color === 'rgb(251, 7, 7)', JSON.stringify(after));

  // Offline must still open the app, from cache, with the same new build.
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(1500);
  const off = await p.evaluate(() => ({
    title: document.querySelector('.header') ? 'shell' : 'blank',
    cards: document.querySelectorAll('.card').length,
    probe: getComputedStyle(document.querySelector('.header')).outlineStyle
  })).catch(e => ({ title: 'dead', cards: -1, probe: String(e).slice(0, 40) }));
  await ctx.setOffline(false);
  check('offline reload still paints the app', off.title === 'shell', JSON.stringify(off));
  check('offline keeps the deployed build', off.probe === 'solid', off.probe);
} catch (e) {
  check('harness', false, String(e).split('\n')[0].slice(0, 160));
} finally {
  restore();
  await ctx.close();
  await browser.close();
  const clean = fs.readFileSync(CSS, 'utf8') === cssOriginal && fs.readFileSync(HTML, 'utf8') === htmlOriginal;
  out.push(`${clean ? 'PASS' : 'FAIL'}  public/style.css and index.html restored byte-for-byte`);
}
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
