// V5.4.19-v19 QA, part 2 — the block under the player: the reaction glyph and the
// one-line episode heading.
//
// Why this measures on the browse page: as soon as /api/play answers, the player
// attaches a live stream, and this sandbox's renderer cannot survive that (2 GB of
// RAM, no GPU, small /dev/shm — the page dies about 0.7 s later). The two functions
// under test, `nowPlayingMarkup` and `fitNowPlayingTitle`, are top-level in app.js,
// and the stylesheet is the one the watch page loads, so the real builder, the real
// fitter and the real CSS all run here with nothing to crash on.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
// As long as a real one, and longer than anything an episode list should carry.
const REAL = 'Running an Errand / Mama’s Mornings are Busy / Doodling';
const EXTREME = 'Running an Errand / Mama’s Mornings are Busy / Doodling / A Nightmare for Dad / The Big Errand Adventure';
const SHORT = 'Pee Strike!';
const ORANGE = 'rgb(255, 115, 28)', WHITE = 'rgb(255, 255, 255)';

const out = [];
const check = (name, pass, detail = '') => out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
// Poster art is refused: this is a measuring run, and a gallery of images at this
// size is exactly what pushes the renderer over the edge.
await ctx.route('**/api/img**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
const p = await ctx.newPage();
await p.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);

const built = await p.evaluate(({ real, extreme, short }) => {
  // An isolated host inside the app, so every stylesheet rule still matches.
  const host = document.createElement('div');
  host.className = 'container content';
  host.setAttribute('style', 'position:fixed;left:-99999px;top:0;width:1080px');
  document.body.appendChild(host);
  const show = episode => {
    host.innerHTML = nowPlayingMarkup(
      { type: 'anime', id: '966', title: 'Shin Chan', description: 'x' },
      { number: 1, title: episode, description: 'Follow the outrageous everyday misadventures of five-year-old Shinnosuke Nohara and his family.' }
    );
  };
  const h2 = () => host.querySelector('.now-playing h2');
  const styledSize = () => { const e = h2(); e.style.fontSize = ''; return parseFloat(getComputedStyle(e).fontSize); };
  const read = base => {
    const e = h2(), cs = getComputedStyle(e);
    return {
      px: parseFloat(cs.fontSize), base,
      floor: Math.max(20, base * 0.74),
      weight: Number(cs.fontWeight), family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      wrap: cs.whiteSpace, overflow: cs.textOverflow, lines: e.getClientRects().length,
      fits: e.scrollWidth <= e.clientWidth + 1,
      attr: e.getAttribute('title') === e.textContent,
      color: cs.color, stroke: cs.webkitTextStrokeWidth
    };
  };
  const measure = (episode, width) => {
    show(episode);
    if (width) host.style.width = `${width}px`;
    const base = styledSize();
    fitNowPlayingTitle();
    return read(base);
  };

  const buttons = () => [...host.querySelectorAll('.reaction-btn')].map(btn => {
    const svg = btn.querySelector('svg'), path = btn.querySelector('svg path');
    const cs = getComputedStyle(path), box = svg.getBoundingClientRect();
    return {
      kind: btn.dataset.kind, count: btn.querySelector('.reaction-count')?.textContent,
      label: btn.getAttribute('aria-label'), pressed: btn.getAttribute('aria-pressed'),
      segs: (path.getAttribute('d').match(/L/g) || []).length,
      bytes: path.getAttribute('d').length, evenodd: path.getAttribute('fill-rule'),
      fill: cs.fill, stroke: cs.stroke, strokeWidth: cs.strokeWidth,
      glyph: `${Math.round(box.width)}x${Math.round(box.height)}`,
      flipped: svg.classList.contains('r-flip')
    };
  });

  show(short);
  const idleButtons = buttons();
  const shortTitle = measure(short);
  const realWide = measure(real);
  const extremeWide = measure(extreme);
  const extremeNarrow = measure(extreme, 360);
  const mediumNarrow = measure(real, 360);
  host.style.width = '1080px';
  show(real);
  styledSize();
  // The voted state, armed here; both directions run on a 140 ms transition, so
  // it is read from a second call after the colour has settled.
  const like = host.querySelector('.reaction-btn[data-kind="like"]');
  like.setAttribute('data-on', '1');
  like.setAttribute('aria-pressed', 'true');
  window.__qaHost = host;
  return {
    idleButtons, shortTitle, realWide, extremeWide, extremeNarrow, mediumNarrow,
    globals: [typeof nowPlayingMarkup, typeof fitNowPlayingTitle]
  };
}, { real: REAL, extreme: EXTREME, short: SHORT });

await p.waitForTimeout(350);
const voted = await p.evaluate(async () => {
  const host = window.__qaHost;
  const like = host.querySelector('.reaction-btn[data-kind="like"]');
  const path = like.querySelector('svg path');
  const read = () => {
    const cs = getComputedStyle(path);
    return { fill: cs.fill, color: getComputedStyle(like).color, strokeWidth: cs.strokeWidth, bg: getComputedStyle(like).backgroundColor };
  };
  const on = read();
  like.removeAttribute('data-on');
  like.setAttribute('aria-pressed', 'false');
  await new Promise(r => setTimeout(r, 320));
  const off = read();
  host.remove();
  return { on, off };
});

const [like, dislike] = built.idleButtons;
check('the shipped builder and fitter are what ran', built.globals.join(',') === 'function,function', JSON.stringify(built.globals));

check('reactions: one supplied glyph, shared by both buttons', like.segs > 60 && like.segs === dislike.segs && like.bytes > 800, `${like.segs} line segments, ${like.bytes} bytes of path`);
check('reactions: idle glyph is a white outline', like.fill === 'none' && like.stroke === WHITE && parseFloat(like.strokeWidth) >= 2.5, JSON.stringify({ fill: like.fill, stroke: like.stroke, w: like.strokeWidth }));
check('reactions: voted glyph is solid orange on a soft orange bed', voted.on.fill === ORANGE && voted.on.color === ORANGE && parseFloat(voted.on.strokeWidth) === 0 && voted.on.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(voted.on));
check('reactions: un-voting returns the white outline', voted.off.fill === 'none' && parseFloat(voted.off.strokeWidth) >= 2.5, JSON.stringify(voted.off));
check('reactions: dislike is the same mark turned round', dislike.flipped === true && like.flipped === false, JSON.stringify({ like: like.flipped, dislike: dislike.flipped }));
check('reactions: the dot punched out of the cuff stays a hole', like.evenodd === 'evenodd', `fill-rule=${like.evenodd}`);
check('reactions: 27px glyph, counts and labels intact', like.glyph === '27x27' && like.count === '0' && /Like this episode/.test(like.label) && /Dislike this episode/.test(dislike.label), JSON.stringify({ glyph: like.glyph, a: like.label, b: dislike.label }));

const t = built.shortTitle;
check('title: heading face, heavy and larger than before', /Atyp|Archivo/.test(t.family) && t.weight >= 800 && t.px >= 26, JSON.stringify({ family: t.family, weight: t.weight, px: t.px }));
check('title: never wraps, at any length or width', [t, built.realWide, built.extremeWide, built.extremeNarrow, built.mediumNarrow].every(x => x.wrap === 'nowrap' && x.lines === 1), JSON.stringify({ wide: built.realWide.lines, narrow: built.mediumNarrow.lines }));
check('title: ellipsis is the overflow mechanism', t.overflow === 'ellipsis', t.overflow);
// The 58-character name above a 1080px player fits whole after easing off the
// styled size by one step - that is what "adjust to the screen" means here: keep
// the line, lose a couple of pixels, and only then reach for the ellipsis.
check('title: desktop shows a realistic name whole, barely smaller', built.realWide.fits && built.realWide.px > built.realWide.base * 0.85, JSON.stringify({ px: built.realWide.px, base: built.realWide.base, fits: built.realWide.fits }));
check('title: an extreme name is cut on desktop, not shrunk away', built.extremeWide.px >= built.extremeWide.floor - 0.1 && !built.extremeWide.fits, JSON.stringify({ px: built.extremeWide.px, floor: +built.extremeWide.floor.toFixed(1), base: built.extremeWide.base }));
check('title: a phone shrinks a long name before it cuts', built.mediumNarrow.px < built.mediumNarrow.base && built.mediumNarrow.px >= built.mediumNarrow.floor - 0.1, JSON.stringify({ px: built.mediumNarrow.px, base: built.mediumNarrow.base, floor: +built.mediumNarrow.floor.toFixed(1) }));
check('title: a short name is untouched', t.px === t.base && t.fits, JSON.stringify({ px: t.px, base: t.base }));
check('title: the full text is kept as a title attribute', t.attr === true && built.extremeWide.attr === true, JSON.stringify([t.attr, built.extremeWide.attr]));
check('title: styled for a heading, not plain body text', /rgb\(242, 245, 249\)/.test(t.color) && parseFloat(t.stroke) > 0, JSON.stringify({ color: t.color, stroke: t.stroke }));

// Evidence images: the block the visitor sees, before and after a vote.
await p.evaluate(() => {
  const host = document.createElement('div');
  host.className = 'container content';
  host.id = 'qa-shot';
  host.innerHTML = nowPlayingMarkup(
    { type: 'anime', id: '966', title: 'Shin Chan', description: 'x' },
    { number: 1, title: 'Running an Errand / Mama’s Mornings are Busy / Doodling', description: 'Follow the outrageous everyday misadventures of five-year-old Shinnosuke "Shin-chan" Nohara, his parents Hiroshi and Misae, baby sister Himawari, dog Shiro, and classmates at Futaba Kindergarten.' }
  );
  fitNowPlayingTitle();
  document.body.appendChild(host);
});
await p.waitForTimeout(350);
const el = await p.$('#qa-shot');
if (el) await el.screenshot({ path: '/tmp/v19-render-idle.png' }).catch(() => {});
await p.evaluate(() => {
  const btn = document.querySelector('#qa-shot .reaction-btn[data-kind="like"]');
  btn.setAttribute('data-on', '1');
  btn.querySelector('.reaction-count').textContent = '4.2K';
  document.querySelector('#qa-shot .reaction-btn[data-kind="dislike"] .reaction-count').textContent = '128';
});
await p.waitForTimeout(350);
if (el) await el.screenshot({ path: '/tmp/v19-render-voted.png' }).catch(() => {});

await browser.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
