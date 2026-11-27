// V5.4.19-v19: what the header does when Discord hands the browser back.
//
// The sign-in round trip itself cannot be completed here (the token exchange is
// Discord's half), so this drives the two states the redirect can produce and
// checks what the visitor actually sees: the avatar, or an explanation.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const TOKEN = process.env.KOZUTV_TEST_TOKEN || '';
const out = [];
const check = (n, pass, d = '') => out.push(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`);

const browser = await chromium.launch();

async function visit({ signedIn, marker = 'success' }) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const cookies = [{ name: 'kozutv_session', value: TOKEN, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }];
  await ctx.addCookies(signedIn ? cookies : [{ name: 'kozutv_visitor', value: 'a'.repeat(32), domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/browse?signin=${marker}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  const state = await p.evaluate(() => {
    const signin = document.querySelector('#signin-btn'), avatar = document.querySelector('#avatar-btn');
    const toast = document.getElementById('kozutv-toast');
    const img = document.querySelector('#avatar-img');
    return {
      signinVisible: !!signin && signin.getBoundingClientRect().width > 0,
      avatarVisible: !!avatar && avatar.getBoundingClientRect().width > 0,
      avatarRadius: avatar ? getComputedStyle(avatar).borderRadius : '',
      initialsShown: (() => { const i = document.querySelector('#avatar-initials'); return !!i && getComputedStyle(i).display !== 'none'; })(),
      toast: toast ? toast.textContent.trim() : '',
      search: location.search,
      swControlled: Boolean(navigator.serviceWorker?.controller)
    };
  });
  await p.screenshot({ path: `/tmp/v19-signin-${signedIn ? 'ok' : 'warn'}.png`, clip: { x: 0, y: 0, width: 1000, height: 70 } });
  await ctx.close();
  return state;
}

const ok = await visit({ signedIn: true });
check('signed in: the avatar replaces Sign in after the redirect', ok.avatarVisible && !ok.signinVisible, JSON.stringify(ok));
check('signed in: success is confirmed to the visitor', /Signed in as/i.test(ok.toast), ok.toast);
check('signed in: the marker is erased from the address bar', ok.search === '', `search="${ok.search}"`);

const warn = await visit({ signedIn: false });
check('no cookie: the visitor is told what went wrong', /session cookie|cookies/i.test(warn.toast) && warn.signinVisible && !warn.avatarVisible, JSON.stringify(warn));

for (const marker of ['expired', 'cancelled', 'exchange', 'database', 'profile']) {
  const r = await visit({ signedIn: false, marker });
  const named = {
    expired: /expired/i, cancelled: /cancelled/i, exchange: /redirect uri/i,
    database: /database/i, profile: /profile/i
  }[marker];
  check(`failure "${marker}" is explained`, named.test(r.toast) && r.signinVisible, r.toast);
}

// the avatar image itself: a blocked picture must fall back to initials
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.addCookies([{ name: 'kozutv_session', value: TOKEN, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const p = await ctx.newPage();
await p.route('**/cdn.discordapp.com/**', r => r.abort());
await p.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
const fallback = await p.evaluate(() => {
  const img = document.querySelector('#avatar-img'), ini = document.querySelector('#avatar-initials');
  return { emptyMark: img?.getAttribute('data-empty') || '', initials: getComputedStyle(ini).display };
});
check('avatar picture blocked → initials shown, no blank circle', fallback.initials !== 'none', JSON.stringify(fallback));
await ctx.close();

await browser.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
