// Walkthrough recorder for kozuTV v19.
//
// Drives a real Chromium through every screen in both directions (signed out and
// signed in), in a phone viewport, capturing frames as it goes. The frames are
// stitched into an MP4 afterwards. The point is that each clip is the actual app
// with real data - no mock-ups.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const TOKEN = process.env.KOZU_TOKEN || '';
const OUT = process.env.OUT || '/tmp/walk';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const FPS = 8;
let frameNo = 0;
const shots = [];

async function capture(page, label) {
  const file = path.join(OUT, `f${String(frameNo++).padStart(5, '0')}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  shots.push({ file, label });
}

// Hold a frame group so a still screen still reads as "being on this page".
async function hold(page, label, seconds = 1.4) {
  const n = Math.max(1, Math.round(seconds * FPS));
  for (let i = 0; i < n; i++) await capture(page, label);
}

async function gotoAndSettle(page, url, ms = 3000) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(ms);
}

async function run() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // ---------------------------------------------------------------- signed out
  const ctxOut = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 1 });
  const out = await ctxOut.newPage();

  const stepsOut = [
    ['/browse', 'Home / Browse', 4500],
    ['/browse/movie/912649', 'Title details - movie', 3500],
    ['/browse/anime/20', 'Title details - anime', 3500],
    ['/schedule', 'Schedule', 2500],
    ['/upcoming', 'Upcoming anime', 2500],
    ['/filters', 'Advanced filters', 2500],
    ['/watchlist', 'Watchlist (signed out)', 2000],
    ['/downloads', 'Old Download link redirects to Browse', 2500],
    ['/search?q=naruto', 'Search results', 3000],
  ];

  for (const [url, label, ms] of stepsOut) {
    await gotoAndSettle(out, url, ms);
    await hold(out, label, 1.2);
  }

  // The sign-in card: it opens over the page the visitor was already on.
  await gotoAndSettle(out, '/browse', 3500);
  await out.locator('#signin-btn').click().catch(() => {});
  await out.waitForTimeout(900);
  await hold(out, 'Sign in - card over a blurred page', 2.0);
  await out.keyboard.press('Escape').catch(() => {});
  await out.waitForTimeout(500);
  await hold(out, 'Back to Browse, card dismissed', 1.0);

  // The header drop-down, and the login screen's Discord button.
  await gotoAndSettle(out, '/browse', 3500);
  await out.locator('.menu-toggle-nav').click().catch(() => {});
  await out.waitForTimeout(700);
  await hold(out, 'Header drop-down with Watchlist', 1.6);
  await out.keyboard.press('Escape').catch(() => {});

  // A bookmarked /login lands here: the card over Browse, never a blank route.
  await gotoAndSettle(out, '/login', 2500);
  await out.waitForTimeout(900);
  await hold(out, 'Old /login bookmark opens the card', 1.8);
  await out.keyboard.press('Escape').catch(() => {});

  // The player, signed out: now-playing block + reactions prompt a sign-in.
  await gotoAndSettle(out, '/watch/anime/20?season=1&episode=2', 9000);
  // At scroll 0 the show title sits directly above the player, so hold here
  // before scrolling: this is the shot that proves the heading is back.
  await out.evaluate(() => window.scrollTo(0, 0));
  await out.waitForTimeout(1200);
  // The title is the first thing under the header. Hold it long enough to read.
  await hold(out, 'SHOW TITLE ABOVE PLAYER', 3.2);
  await out.evaluate(() => window.scrollTo(0, 0));
  await out.waitForTimeout(400);
  await hold(out, 'SHOW TITLE ABOVE PLAYER', 1.6);
  await out.evaluate(() => window.scrollTo(0, 230));
  await out.waitForTimeout(900);
  // Scrolled down: the title is off-screen, so label what is actually visible.
  await hold(out, 'Episode name, description and reactions', 2.0);
  await out.locator('[data-np-desc]').click().catch(() => {});
  await out.waitForTimeout(600);
  await hold(out, 'Description expands on a tap', 1.6);
  await out.locator('[data-np-desc]').click().catch(() => {});

  await gotoAndSettle(out, '/watch/movie/912649', 8000);
  await hold(out, 'Player - movie (no top title, by design)', 2.2);
  await out.evaluate(() => window.scrollTo(0, 200));
  await out.waitForTimeout(800);
  await hold(out, 'Movie: film name below the player', 1.6);
  await ctxOut.close();

  // ----------------------------------------------------------------- signed in
  if (TOKEN) {
    const ctxIn = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 1 });
    await ctxIn.addCookies([{
      name: 'kozutv_session', value: TOKEN, domain: '127.0.0.1', path: '/',
      httpOnly: true, sameSite: 'Lax'
    }]);
    const inn = await ctxIn.newPage();

    await gotoAndSettle(inn, '/browse', 4000);
    await hold(inn, 'Signed in - avatar in the header', 1.6);
    await inn.locator('#avatar-btn').click().catch(() => {});
    await inn.waitForTimeout(600);
    await hold(inn, 'Account menu - Sign out only', 1.6);
    await inn.keyboard.press('Escape').catch(() => {});

    await gotoAndSettle(inn, '/watch/anime/20?season=1&episode=2', 9000);
    await inn.evaluate(() => window.scrollTo(0, 240));
    await inn.waitForTimeout(700);
    await hold(inn, 'Signed in - reactions ready to fill', 1.4);
    await inn.locator('[data-react="1"]').click().catch(() => {});
    await inn.waitForTimeout(1500);
    await hold(inn, 'Like filled orange (simple thumb)', 2.0);
    await inn.locator('[data-react="-1"]').click().catch(() => {});
    await inn.waitForTimeout(1500);
    await hold(inn, 'Dislike filled orange', 1.6);
    await inn.locator('[data-react="1"]').click().catch(() => {});
    await inn.waitForTimeout(1200);

    await gotoAndSettle(inn, '/settings', 2500);
    await hold(inn, 'Settings - AI Transcription off', 2.2);
    await ctxIn.close();
  }

  // ------------------------------------------------------- phone: search bar
  // The overlap that was reported: the field opened over the Sign in pill.
  const ctxS = await browser.newContext({ viewport: { width: 400, height: 260 }, deviceScaleFactor: 2, hasTouch: true });
  const sh = await ctxS.newPage();
  await gotoAndSettle(sh, '/browse', 3500);
  await hold(sh, 'Phone header - search glyph beside Sign in', 1.6);
  // No silent .catch() here: a swallowed tap is exactly how this segment once
  // recorded a closed header under an 'open search' label. Fail loudly instead.
  await sh.locator('.searchbox').tap();
  await sh.waitForTimeout(150);
  if (!(await sh.evaluate(() => document.querySelector('.searchbox').classList.contains('open'))))
    throw new Error('search did not open on tap');
  await sh.waitForTimeout(900);
  await hold(sh, 'Search open: Sign in steps aside, field owns the bar', 2.4);
  await sh.keyboard.type('one piece');
  await sh.waitForTimeout(2600);
  await hold(sh, 'Typing searches from the open field', 1.8);
  await ctxS.close();

  // ------------------------------------------------------------------ desktop
  // v18's capture was phone-only, which is how the desktop header regressed
  // unnoticed. This segment shows the icon, the field it opens, and the flush
  // drop-down; titles here are wide enough to be seen whole on one line.
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  const de = await ctxD.newPage();
  await gotoAndSettle(de, '/browse', 4200);
  await hold(de, 'Desktop header - search is an icon left of Sign in', 1.8);
  await de.locator('.searchbox').click();
  await de.waitForTimeout(150);
  if (!(await de.evaluate(() => document.querySelector('.searchbox').classList.contains('open'))))
    throw new Error('desktop search did not open on click');
  await de.waitForTimeout(900);
  await hold(de, 'Desktop search field opens in place', 1.8);
  await de.keyboard.press('Escape');
  await de.waitForTimeout(500);
  await de.locator('.menu-toggle-nav').click();
  await de.waitForTimeout(800);
  await hold(de, 'Drop-down flush under the logo - no seam', 1.8);
  await de.keyboard.press('Escape');

  await gotoAndSettle(de, '/upcoming', 3500);
  await hold(de, 'Upcoming anime - every card marked', 1.8);
  await de.locator('.card').first().click();
  await de.waitForTimeout(4200);
  await hold(de, 'Upcoming details page: title, synopsis, no play button', 2.6);

  await gotoAndSettle(de, '/browse/anime/21', 4200);
  await hold(de, 'One Piece - banner back to the curated art', 2.4);
  await ctxD.close();

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(shots, null, 2));
  console.log(`captured ${frameNo} frames`);
  const counts = {};
  for (const s of shots) counts[s.label] = (counts[s.label] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(3)}  ${k}`);
}

run().catch(e => { console.error(e); process.exit(1); });
