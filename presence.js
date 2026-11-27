// Optional presence reporting. Keep the webhook private in the environment.
import './load-env.js';
const DISCORD_WEBHOOK = String(process.env.DISCORD_WEBHOOK_URL || '').trim();

// Which emoji heads each line, and the human label for the activity.
const ACTIVITY = {
  watching: { icon: '\u{1F4FA}', label: 'WATCHING' },   // 📺
  browsing: { icon: '\u{1F5C2}\u{FE0F}', label: 'BROWSING' }, // 🗂️
  searching: { icon: '\u{1F50E}', label: 'SEARCHING' },  // 🔍
  saved: { icon: '\u{1F516}', label: 'WATCHLIST ADD' }, // 🔖
  unsaved: { icon: '\u{1F5D1}\u{FE0F}', label: 'WATCHLIST REMOVE' }, // 🗑️
  settings: { icon: '\u2699\uFE0F', label: 'SETTINGS' }  // ⚙️
};

const COUNTRY_NAMES = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan', KR: 'South Korea',
  BR: 'Brazil', MX: 'Mexico', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  RU: 'Russia', CN: 'China', PH: 'Philippines', ID: 'Indonesia', TH: 'Thailand',
  VN: 'Vietnam', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', ZA: 'South Africa', NG: 'Nigeria',
  EG: 'Egypt', TR: 'Turkey', PL: 'Poland', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', FI: 'Finland', IE: 'Ireland', PT: 'Portugal', GR: 'Greece',
  CZ: 'Czechia', RO: 'Romania', UA: 'Ukraine', AR: 'Argentina', CL: 'Chile',
  CO: 'Colombia', PE: 'Peru', MY: 'Malaysia', SG: 'Singapore', NZ: 'New Zealand'
};

// ISO country -> flag emoji (regional indicator pair).
function flag(cc) {
  if (!/^[A-Z]{2}$/.test(cc || '')) return '\u{1F310}'; // 🌐
  return String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

// "S1 E1", "E1" or nothing for films.
function episodeLabel(kind, season, episode) {
  const s = Number(season), e = Number(episode);
  if (kind === 'movie' || kind === 'film') return '';
  if (s > 0 && e > 0) return `S${s} E${e}`;
  if (e > 0) return `E${e}`;
  return '';
}

// Client IP behind a proxy, without trusting arbitrary header chains.
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = fwd || req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '';
  const clean = String(raw).replace(/^::ffff:/, '').trim();
  if (!clean) return 'unknown';
  // Render/cloud proxies report the IPv6 loopback for local calls; say so.
  if (clean === '::1' || clean === '127.0.0.1') return 'local';
  return clean;
}

function countryOf(req) {
  const cc = String(
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase().trim();
  return /^[A-Z]{2}$/.test(cc) && cc !== 'XX' ? cc : '';
}

// Fire and forget. Never throws, never awaited by a request handler.
function post(payload) {
  if (!DISCORD_WEBHOOK) return;
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: controller.signal
  }).catch(() => {}).finally(() => clearTimeout(timer));
}

function report(req, action) {
  try {
    const kind = ACTIVITY[action.activity] ? action.activity : 'browsing';
    const meta = ACTIVITY[kind];
    const cc = countryOf(req);
    const ip = clientIp(req);
    const who = action.user || 'Guest';
    const ccLabel = cc ? `${flag(cc)} \`${cc}\`` : '\u{1F310} `??`';

    // 1) Discord-style identity line, exactly as requested.
    const lines = [
      `\u{1F464} **User** — \`${ip}\` ( ${ccLabel} )`,
      '',
      `\u{1F6F0}\u{FE0F} **Status** — \`${meta.label}\``
    ];

    // 2) Title line for anything that has a title (watching, saved, browsing
    //    into a title, search results for a known show).
    const title = String(action.title || '').trim();
    if (title) {
      const ep = episodeLabel(action.kind, action.season, action.episode);
      lines.push('', `\u{1F4FA} **Title** - ${title}${ep ? ` ( ${ep} )` : ''}`);
    } else if (action.query) {
      lines.push('', `\u{1F50E} **Query** - \`${String(action.query).slice(0, 120)}\``);
    }

    // 3) Where they are in the site, so "fully informed" is actually true.
    const where = [];
    if (action.page) where.push(String(action.page).slice(0, 80));
    if (action.provider) where.push(`server \`${String(action.provider).slice(0, 24)}\``);
    if (action.lang) where.push(`audio \`${String(action.lang).slice(0, 24)}\``);
    if (where.length) lines.push('', `\u{1F9ED} **Where** - ${where.join(' · ')}`);

    post({
      username: 'kozuTV',
      embeds: [{
        description: lines.join('\n'),
        color: kind === 'watching' ? 0xff731c : 0x2b2e37,
        footer: { text: `kozuTV presence · ${who} · ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC` }
      }]
    });
  } catch {
    // Presence reporting must never surface an error to the user.
  }
}

export { report as reportPresence, clientIp, countryOf, episodeLabel };
