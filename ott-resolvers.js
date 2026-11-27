// OTT Stream, Multi-Audio & Subtitle Resolvers — 5 High-Bitrate Providers:
// 2. embedwave -> EmbedWave (regional movie and TV audio, subject to upstream availability)
// 1. vidcore   -> VidCore   (DEFAULT: vidcore.io 4K/1080p/720p H.264 + VidSpark 1080p/720p + Hexa 1080p/720p)
// 3. cinesrc   -> CineSrc   (cinesrc.st Nebula/Light/Wave 1080p/720p fMP4 H.264 + Hexa fallback)
// 4. vidlink   -> VidLink   (vidlink.pro 1080p/720p HLS/MP4 + Hexa H.264 fallback)
// 5. vidsrc    -> VidSrc    (vidup.to 4K/1080p/720p H.264 + Hexa 1080p/720p H.264 + Vidora HD)

import crypto from 'node:crypto';
import { AUDIO_LANGUAGE_NAMES, REGIONAL_AUDIO_LANGUAGES } from './audio-languages.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export const OTT_SERVERS = [
  ['vidcore', 'VidCore'],
  ['embedwave', 'EmbedWave'],
  ['cinesrc', 'CineSrc'],
  ['vidlink', 'VidLink'],
  ['vidsrc', 'VidSrc']
];
export const OTT_SERVER_KEYS = new Set(OTT_SERVERS.map(([k]) => k));
export const DEFAULT_OTT_SERVER = 'vidcore';

// Known dead subtitle CDN hosts and non-direct file locker domains
const DEAD_SUBTITLE_HOSTS = /(?:^|\.)box\.netrocdn\.site$/i;
const LOCKER_STREAM_HOSTS = /(?:^|\.)(?:hubcloud\.|hubdrive\.|pixeldrain\.|gdflix\.|filepress\.|drive\.google\.com)/i;
function isDeadSubtitleUrl(rawUrl) {
  try { return DEAD_SUBTITLE_HOSTS.test(new URL(rawUrl).hostname); }
  catch { return true; }
}
function isLockerUrl(rawUrl) {
  try {
    if (/itsnitrox\.tech\/litro\//i.test(String(rawUrl || ''))) return true;
    return LOCKER_STREAM_HOSTS.test(new URL(rawUrl).hostname);
  } catch { return true; }
}

let vidsparkPrimaryKey = '3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13';
let vidoraCdnKey = 'f3b72e73c80c9a996574379798703796a1936efa3516a7105cb0e43048b46b5a';
const keyRefreshAt = { primary: 0, cdn: 0 };

async function refreshVidoraKey(kind) {
  const now = Date.now();
  if (now - keyRefreshAt[kind] < 60_000) return kind === 'primary' ? vidsparkPrimaryKey : vidoraCdnKey;
  keyRefreshAt[kind] = now;
  const host = kind === 'primary' ? 'https://vidspark.to' : 'https://cdn.vidspark.to';
  try {
    const html = await fetch(`${host}/movie/533535`, {
      headers: { 'User-Agent': UA, Referer: `${host}/` },
      signal: AbortSignal.timeout(4500)
    }).then(r => r.text());
    const scripts = [...html.matchAll(/src=["']([^"']+\.js[^"']*)["']/g)].map(m => m[1]);
    for (const sc of scripts) {
      if (!/main|index/i.test(sc)) continue;
      const js = await fetch(new URL(sc, host).href, {
        headers: { 'User-Agent': UA, Referer: `${host}/` },
        signal: AbortSignal.timeout(5000)
      }).then(r => r.text());
      const m = js.match(/["'`]([a-f0-9]{64})["'`]/);
      if (m?.[1]) {
        if (kind === 'primary') vidsparkPrimaryKey = m[1];
        else vidoraCdnKey = m[1];
        break;
      }
    }
  } catch {}
  return kind === 'primary' ? vidsparkPrimaryKey : vidoraCdnKey;
}

const langDisplay = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }); }
  catch { return null; }
})();

const LANG_FALLBACK = {
  ...AUDIO_LANGUAGE_NAMES,
  en: 'English', eng: 'English', hi: 'Hindi', hin: 'Hindi', ko: 'Korean', kor: 'Korean',
  ja: 'Japanese', jpn: 'Japanese', es: 'Spanish', spa: 'Spanish', fr: 'French', fra: 'French', fre: 'French',
  de: 'German', deu: 'German', ger: 'German', it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese',
  pb: 'Portuguese (BR)', pob: 'Portuguese (BR)', ru: 'Russian', rus: 'Russian', ar: 'Arabic', ara: 'Arabic',
  zh: 'Chinese', zho: 'Chinese', chi: 'Chinese', cmn: 'Chinese', yue: 'Cantonese',
  tr: 'Turkish', tur: 'Turkish', th: 'Thai', tha: 'Thai',
  vi: 'Vietnamese', vie: 'Vietnamese', id: 'Indonesian', ind: 'Indonesian', ms: 'Malay', may: 'Malay',
  ta: 'Tamil', tam: 'Tamil', te: 'Telugu', tel: 'Telugu', ml: 'Malayalam', mal: 'Malayalam',
  kn: 'Kannada', kan: 'Kannada', bn: 'Bengali', ben: 'Bengali', mr: 'Marathi', mar: 'Marathi',
  pa: 'Punjabi', pan: 'Punjabi', ur: 'Urdu', urd: 'Urdu', nl: 'Dutch', nld: 'Dutch', dut: 'Dutch',
  pl: 'Polish', pol: 'Polish', sv: 'Swedish', swe: 'Swedish', no: 'Norwegian', nor: 'Norwegian',
  da: 'Danish', dan: 'Danish', fi: 'Finnish', fin: 'Finnish', cs: 'Czech', ces: 'Czech', cze: 'Czech',
  el: 'Greek', ell: 'Greek', gre: 'Greek', hu: 'Hungarian', hun: 'Hungarian', ro: 'Romanian', ron: 'Romanian', rum: 'Romanian',
  uk: 'Ukrainian', ukr: 'Ukrainian', he: 'Hebrew', heb: 'Hebrew', fa: 'Persian', per: 'Persian', fas: 'Persian'
};

function readableLanguage(code, rawLabel = '') {
  const cleanLabel = String(rawLabel || '').trim();
  if (cleanLabel && cleanLabel.length > 3 && !/^[a-z]{2,3}$/i.test(cleanLabel)) return cleanLabel;
  const norm = String(code || cleanLabel || '').trim().toLowerCase();
  if (!norm) return 'Unknown';
  if (LANG_FALLBACK[norm]) return LANG_FALLBACK[norm];
  const base = norm.split(/[-_]/)[0];
  if (LANG_FALLBACK[base]) return LANG_FALLBACK[base];
  try {
    const resolved = langDisplay?.of(base);
    if (resolved && resolved.toLowerCase() !== base) return resolved;
  } catch {}
  return cleanLabel || norm.toUpperCase();
}

function mediaPathFor({ type, id, season, episode }) {
  return type === 'tv' ? `tv/${id}/${season}/${episode}` : `movie/${id}`;
}

const SUB_LANG_HINTS = [
  [/\benglish\b|\beng\b|(?:^|[/_.-])en(?:[/_.-]|$)/i, 'en'],
  [/\bhindi\b|\bhin\b|हिन्दी/i, 'hi'],
  [/\bspanish\b|\bespa[nñ]ol\b|\bspa\b|\blatino\b/i, 'es'],
  [/\bfrench\b|\bfran[cç]ais\b|\bfra\b|\bfre\b/i, 'fr'],
  [/\bgerman\b|\bdeutsch\b|\bger\b|\bdeu\b/i, 'de'],
  [/\bportuguese\b|\bportugu[eê]s\b|\bpor\b|\bpob\b/i, 'pt'],
  [/\bitalian\b|\bitaliano\b|\bita\b/i, 'it'],
  [/\brussian\b|\brus\b/i, 'ru'],
  [/\barabic\b|\bara\b/i, 'ar'],
  [/\bjapanese\b|\bjpn\b/i, 'ja'],
  [/\bkorean\b|\bkor\b/i, 'ko'],
  [/\bchinese\b|\bchi\b|\bzho\b/i, 'zh'],
  [/\bturkish\b|\btur\b/i, 'tr'],
  [/\bindonesian\b|\bind\b/i, 'id'],
  [/\bvietnamese\b|\bvie\b/i, 'vi'],
  [/\bthai\b|\btha\b/i, 'th'],
  [/\bdutch\b|\bnld\b|\bdut\b/i, 'nl'],
  [/\bpolish\b|\bpol\b/i, 'pl'],
  [/\btamil\b|\btam\b/i, 'ta'],
  [/\btelugu\b|\btel\b/i, 'te'],
  [/\bmalayalam\b|\bmal\b/i, 'ml'],
  [/\bbengali\b|\bben\b/i, 'bn']
];

function inferTrackLanguage(rawCode = '', rawLabel = '', rawUrl = '') {
  const norm = String(rawCode || '').trim().toLowerCase();
  if (norm && norm !== 'und' && norm !== 'unknown') {
    const base = norm.split(/[-_]/)[0];
    if (LANG_FALLBACK[norm]) return norm.slice(0, 2);
    if (LANG_FALLBACK[base]) return base.slice(0, 2);
    if (/^[a-z]{2}$/.test(base)) return base;
  }
  let urlTail = '';
  try { urlTail = new URL(rawUrl).pathname.split('/').slice(-2).join('/'); } catch { urlTail = String(rawUrl || ''); }
  const combined = `${rawLabel || ''} ${urlTail}`;
  for (const [rx, code] of SUB_LANG_HINTS) {
    if (rx.test(combined)) return code;
  }
  return norm || 'und';
}

async function inspectHlsTiming(masterOrMediaUrl, headers = {}, preloadedText = '') {
  try {
    let txt = preloadedText;
    let baseHref = masterOrMediaUrl;
    if (!txt) {
      const r = await fetch(masterOrMediaUrl, {
        headers: { 'User-Agent': UA, ...headers },
        signal: AbortSignal.timeout(3400)
      });
      if (!r.ok) { r.body?.cancel?.().catch(() => {}); return { durationSec: -1, fps: 0 }; }
      baseHref = r.url || masterOrMediaUrl;
      txt = await r.text();
    }
    if (!txt.trimStart().startsWith('#EXTM3U')) return { durationSec: -1, fps: 0 };
    const fpsMatch = txt.match(/FRAME-RATE=([\d.]+)/i);
    const fps = fpsMatch ? Number(fpsMatch[1]) || 0 : 0;
    if (txt.includes('#EXTINF:')) {
      const durationSec = Math.round([...txt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0));
      return { durationSec, fps };
    }
    const lines = txt.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
        const rel = lines.slice(i + 1).find(l => l.trim() && !l.trim().startsWith('#'));
        if (!rel) break;
        const childUrl = new URL(rel.trim(), baseHref).href;
        const cr = await fetch(childUrl, {
          headers: { 'User-Agent': UA, ...headers },
          signal: AbortSignal.timeout(3400)
        });
        if (!cr.ok) { cr.body?.cancel?.().catch(() => {}); return { durationSec: -1, fps }; }
        const cTxt = await cr.text();
        if (!cTxt.includes('#EXTINF:')) return { durationSec: -1, fps };
        const durationSec = Math.round([...cTxt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0));
        return { durationSec, fps };
      }
    }
    return { durationSec: -1, fps };
  } catch {
    return { durationSec: -1, fps: 0 };
  }
}


// Pokémon's sampled Nitro HLS sometimes lists an expired mirror alongside
// the working Hindi feed. A valid playlist/duration is not enough: test the
// first media segment before selecting that candidate. This is intentionally
// limited to the known Nitro/proxy hosts, with redirects checked at each hop.
async function pokemonFirstSegmentReachable(source) {
  const allowed = new Set(['wts.itsnitrox.tech', 'proxy.nxstreamhub.workers.dev']);
  const headers = { 'User-Agent': UA, ...(source.headers || {}) };
  async function checkedFetch(raw) {
    let next = new URL(raw);
    for (let i = 0; i < 4; i++) {
      if (next.protocol !== 'https:' || !allowed.has(next.hostname.toLowerCase())) return null;
      const r = await fetch(next, { headers, redirect: 'manual', signal: AbortSignal.timeout(4500) });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        r.body?.cancel?.().catch(() => {});
        if (!loc) return null;
        next = new URL(loc, next);
        continue;
      }
      return { response: r, base: next.href };
    }
    return null;
  }
  try {
    let target = source.url;
    for (let depth = 0; depth < 3; depth++) {
      const result = await checkedFetch(target);
      if (!result || !result.response.ok) {
        result?.response.body?.cancel?.().catch(() => {});
        return false;
      }
      const text = await result.response.text();
      if (!text.trimStart().startsWith('#EXTM3U')) return false;
      const lines = text.split(/\r?\n/);
      let uri = '';
      const streamAt = lines.findIndex(l => l.trim().startsWith('#EXT-X-STREAM-INF:'));
      if (streamAt >= 0) uri = lines.slice(streamAt + 1).find(l => l.trim() && !l.trim().startsWith('#')) || '';
      else if (text.includes('#EXTINF:')) uri = lines.find(l => l.trim() && !l.trim().startsWith('#')) || '';
      if (!uri) return false;
      target = new URL(uri.trim(), result.base).href;
      if (streamAt >= 0) continue;
      const segment = await checkedFetch(target);
      const contentType = segment?.response.headers.get('content-type') || '';
      const ok = Boolean(segment?.response.ok) && !/text\/html|application\/(?:json|xml)|text\/plain/i.test(contentType);
      segment?.response.body?.cancel?.().catch(() => {});
      return ok;
    }
  } catch {}
  return false;
}

function parseMvhdFromBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 36) return -1;
  const needle = Buffer.from('mvhd');
  let idx = 0;
  while ((idx = buf.indexOf(needle, idx)) !== -1) {
    if (idx >= 4) {
      const boxSize = buf.readUInt32BE(idx - 4);
      const version = buf[idx + 4];
      if (boxSize >= 32 && boxSize <= 1024 && (version === 0 || version === 1)) {
        if (version === 0 && idx + 24 <= buf.length) {
          const ts = buf.readUInt32BE(idx + 16);
          const dur = buf.readUInt32BE(idx + 20);
          if (ts > 0 && dur > 0) return Math.round(dur / ts);
        } else if (version === 1 && idx + 36 <= buf.length) {
          const ts = buf.readUInt32BE(idx + 24);
          const dur = Number(buf.readBigUInt64BE(idx + 28));
          if (ts > 0 && dur > 0) return Math.round(dur / ts);
        }
      }
    }
    idx += 4;
  }
  return -1;
}

// Some CDNs ignore Range: never buffer a complete movie just to inspect its header.
async function readLimitedBody(response, limit = 131072) {
  const reader = response.body?.getReader?.();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = Buffer.from(value).subarray(0, limit - total);
      chunks.push(part); total += part.length;
    }
  } finally { try { await reader.cancel(); } catch {} }
  return Buffer.concat(chunks, total);
}

async function inspectMp4DurationSec(mp4Url, headers = {}, preloadedHeadBuf = null, contentRangeHeader = '') {
  try {
    let headBuf = preloadedHeadBuf;
    let cr = contentRangeHeader;
    if (!headBuf) {
      const r = await fetch(mp4Url, {
        headers: { 'User-Agent': UA, ...headers, Range: 'bytes=0-131071' },
        redirect: 'follow',
        signal: AbortSignal.timeout(3000)
      });
      if (!r.ok && r.status !== 206) { r.body?.cancel?.().catch(() => {}); return -1; }
      cr = String(r.headers.get('content-range') || '');
      headBuf = await readLimitedBody(r);
    }
    const d1 = parseMvhdFromBuffer(headBuf);
    if (d1 > 0) return d1;
    const totalMatch = cr.match(/\/(\d+)\s*$/);
    const totalSize = totalMatch ? Number(totalMatch[1]) : 0;
    if (totalSize > 131072) {
      const start = Math.max(0, totalSize - 131072);
      const r2 = await fetch(mp4Url, {
        headers: { 'User-Agent': UA, ...headers, Range: `bytes=${start}-${totalSize - 1}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(3000)
      });
      if (r2.status === 206 && String(r2.headers.get('content-range') || '').startsWith(`bytes ${start}-`)) {
        const tailBuf = await readLimitedBody(r2);
        const d2 = parseMvhdFromBuffer(tailBuf);
        if (d2 > 0) return d2;
      } else {
        r2.body?.cancel?.().catch(() => {});
      }
    }
    return -1;
  } catch {
    return -1;
  }
}

async function inspectStreamTiming(streamUrl, headers = {}, kindHint = 'hls', preloadedText = '') {
  if (!streamUrl || !/^https:\/\//i.test(streamUrl)) return { durationSec: -1, fps: 0 };
  const isMp4 = kindHint === 'mp4' || (/\.mp4(?:\?|$)/i.test(streamUrl) && !/\.m3u8|proxy/i.test(streamUrl));
  if (isMp4) {
    const durationSec = await inspectMp4DurationSec(streamUrl, headers);
    return { durationSec, fps: 0 };
  }
  return inspectHlsTiming(streamUrl, headers, preloadedText);
}

async function measureHlsDurationSec(masterOrMediaUrl, headers = {}) {
  const { durationSec } = await inspectHlsTiming(masterOrMediaUrl, headers);
  return durationSec;
}

function sameImdbId(metaImdb, candImdb) {
  const a = String(metaImdb || '').trim().toLowerCase();
  const b = String(candImdb || '').trim().toLowerCase();
  if (!/^tt\d{5,10}$/.test(a) || !/^tt\d{5,10}$/.test(b)) return true;
  return a === b;
}

function verifyEpisodeRuntimeByDur(dur, expectedMinutes) {
  const mins = Number(expectedMinutes) || 0;
  if (dur > 0 && dur < 180 && (mins === 0 || mins > 8)) return false;
  if (mins < 12 || !(dur > 0)) return true;
  const expectedNtsc = mins * 60;
  const expectedPal = expectedNtsc * 0.95904;
  const tol = Math.max(150, expectedNtsc * 0.065);
  if (Math.abs(dur - expectedNtsc) <= tol || Math.abs(dur - expectedPal) <= tol) return true;
  // Allow official international streaming recuts (e.g. Money Heist 70m Spanish broadcast -> 47m Netflix global cut)
  if (mins >= 65 && mins <= 82 && dur >= 2500 && dur <= 3300) return true;
  // Some series are listed at their original broadcast length for every episode
  // (Money Heist S1 lists 90/64/68 minutes) while every international release runs
  // the shorter cut. Accept a full-length episode that is shorter than the listed
  // runtime, but never a short teaser/clip.
  if (mins >= 60 && dur >= 2400 && dur <= mins * 60) return true;
  return false;
}

function verifyMovieRuntimeByDur(dur, expectedMinutes, isExactIdProvider = false) {
  const mins = Number(expectedMinutes) || 0;
  if (!(dur > 0)) return true;
  if (dur < 180 && (mins === 0 || mins > 8)) return false;
  if (mins < 4) return true;
  const expectedNtsc = mins * 60;
  const expectedPal = expectedNtsc * 0.95904;
  if (mins <= 28) {
    const shortTol = Math.max(95, expectedNtsc * 0.22);
    return Math.abs(dur - expectedNtsc) <= shortTol || Math.abs(dur - expectedPal) <= shortTol;
  }
  const tol = Math.max(210, expectedNtsc * 0.105);
  if (Math.abs(dur - expectedNtsc) <= tol || Math.abs(dur - expectedPal) <= tol) return true;
  // Allow official Extended / Director's Cuts on exact-TMDB-ID primary providers for epic films (>= 115m)
  if (isExactIdProvider && mins >= 115 && dur >= expectedPal - tol && dur <= expectedNtsc * 1.24) return true;
  return false;
}

function verifyStreamRuntimeByDur(input, dur, meta = {}, isExactIdProvider = false) {
  if (input?.type === 'tv') return verifyEpisodeRuntimeByDur(dur, meta?.episodeRuntimeMinutes);
  return verifyMovieRuntimeByDur(dur, meta?.movieRuntimeMinutes, isExactIdProvider);
}

async function verifyEpisodeRuntime(streamUrl, headers, expectedMinutes, preloadedMasterText = '') {
  const mins = Number(expectedMinutes) || 0;
  if (mins < 12) return true;
  const { durationSec } = await inspectHlsTiming(streamUrl, headers, preloadedMasterText);
  return verifyEpisodeRuntimeByDur(durationSec, mins);
}

async function verifyStreamRuntime(input, streamUrl, headers, meta = {}, isExactIdProvider = false, kindHint = 'hls', preloadedText = '') {
  const { durationSec } = await inspectStreamTiming(streamUrl, headers, kindHint, preloadedText);
  return verifyStreamRuntimeByDur(input, durationSec, meta, isExactIdProvider);
}

function verifyDubDurationMatch(dubDurSec, primaryDurSec, input, meta = {}, scraper = '') {
  if (scraper === 'awsind' && dubDurSec > 0) {
    const expectedMinutes = Number(input?.type === 'tv' ? meta?.episodeRuntimeMinutes : meta?.movieRuntimeMinutes) || 0;
    const reference = primaryDurSec > 300 ? primaryDurSec : 60 * expectedMinutes;
    const extra = dubDurSec - reference;
    // Reject the roughly two-minute advertising insertion observed on this source,
    // but permit ordinary PAL/NTSC runtime changes.
    if (reference > 300 && extra >= 75 && extra <= 190 &&
        Math.abs(dubDurSec - reference * (25 / 23.976023976)) > 40 &&
        Math.abs(dubDurSec - reference * (23.976023976 / 25)) > 40) return false;
  }
  if (input?.type === 'movie') {
    if (!verifyMovieRuntimeByDur(dubDurSec, meta?.movieRuntimeMinutes, false)) return false;
    if (primaryDurSec > 300) {
      if (!(dubDurSec > 0)) return false;
      const ntscAlt = primaryDurSec * (25 / 23.976023976);
      const palAlt = primaryDurSec * (23.976023976 / 25);
      const tol = Math.max(105, primaryDurSec * 0.052);
      return Math.abs(dubDurSec - primaryDurSec) <= tol || Math.abs(dubDurSec - ntscAlt) <= tol || Math.abs(dubDurSec - palAlt) <= tol;
    }
    return dubDurSec > 240;
  }
  // TV episode dub check
  if (!(dubDurSec > 0)) return false;
  if (dubDurSec < 240) return false;
  if (primaryDurSec > 300) {
    const ntscAlt = primaryDurSec * (25 / 23.976023976);
    const palAlt = primaryDurSec * (23.976023976 / 25);
    const tol = Math.max(110, primaryDurSec * 0.055);
    if (Math.abs(dubDurSec - primaryDurSec) <= tol || Math.abs(dubDurSec - ntscAlt) <= tol || Math.abs(dubDurSec - palAlt) <= tol) {
      return true;
    }
    // Official international streaming recut (e.g. Money Heist 70m broadcast primary vs 47m Netflix Hindi/English global cut)
    if ((scraper === 'awsind' || scraper === 'nitro') && primaryDurSec >= 3900 && dubDurSec >= 2450 && dubDurSec <= 3350) {
      return true;
    }
    const expSec = (Number(meta?.episodeRuntimeMinutes) || 0) * 60;
    if (expSec >= 900 && Math.abs(dubDurSec - expSec) <= Math.max(120, expSec * 0.06)) {
      return true;
    }
    // Different release cut, but still a full-length episode of this show
    // (e.g. Money Heist: 81-minute primary vs 49-minute international cut).
    // Every alternate stream carries its own audio, so the cut may differ.
    return dubDurSec >= 900 && verifyEpisodeRuntimeByDur(dubDurSec, meta?.episodeRuntimeMinutes);
  }
  return verifyEpisodeRuntimeByDur(dubDurSec, meta?.episodeRuntimeMinutes);
}

async function fetchJsonSafe(url, { method = 'GET', headers = {}, body = undefined, timeout = 7500 } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...headers },
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout)
  });
  if (!res.ok) {
    const err = Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

function parseSubCueSec(ts) {
  const m = String(ts || '').trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) + Number(m[4].padEnd(3, '0')) / 1000;
}

const TIMING_WATERMARK_RX = /osdb\.link|opensubtitles\.(?:org|com)|ai\.opensubtitles|getray\.app|subtitles?\s+by\s+opensubtitles|addic7ed\.com|subscene\.com|yts\.(?:mx|lt|ag)|yify|podnapisi\.net|subdl\.com/i;

async function inspectSubtitleVttTiming(subUrl, headers = {}) {
  try {
    const r = await fetch(subUrl, {
      headers: { 'User-Agent': UA, ...headers },
      signal: AbortSignal.timeout(2300)
    });
    if (!r.ok) { r.body?.cancel?.().catch(() => {}); return null; }
    const txt = await r.text();
    const blocks = txt.replace(/\r\n?/g, '\n').split(/\n\n+/);
    let cueCount = 0, firstSec = 0, lastSec = 0;
    for (const blk of blocks) {
      const m = blk.match(/((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/);
      if (!m) continue;
      if (TIMING_WATERMARK_RX.test(blk)) continue;
      const s = parseSubCueSec(m[1]);
      const e = parseSubCueSec(m[2]);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
      if (cueCount === 0) firstSec = s;
      lastSec = e;
      cueCount++;
    }
    if (!cueCount) return { cueCount: 0, firstSec: 0, lastSec: 0 };
    return { cueCount, firstSec, lastSec };
  } catch {
    return null;
  }
}

function sortAndDedupeTracks(tracks) {
  const seenUrl = new Set();
  const seenLabel = new Map();
  const out = [];
  for (const t of tracks) {
    if (!t?.src || !/^https:\/\//i.test(t.src)) continue;
    if (seenUrl.has(t.src)) continue;
    seenUrl.add(t.src);
    const langCode = inferTrackLanguage(t.language, t.label, t.src);
    const baseLabel = readableLanguage(langCode, t.label);
    const count = (seenLabel.get(baseLabel.toLowerCase()) || 0) + 1;
    seenLabel.set(baseLabel.toLowerCase(), count);
    const item = {
      src: t.src,
      kind: 'subtitles',
      language: String(langCode || 'und').toLowerCase().slice(0, 12),
      label: count > 1 ? `${baseLabel} (${count})` : baseLabel,
      proxyProvider: t.proxyProvider,
      headers: t.headers || {}
    };
    if (Number.isFinite(Number(t.timeScale)) && Math.abs(Number(t.timeScale) - 1) >= 0.0004) {
      item.timeScale = Number(t.timeScale);
    }
    if (Number.isFinite(Number(t.offsetSec)) && Math.abs(Number(t.offsetSec)) >= 0.02) {
      item.offsetSec = Number(t.offsetSec);
    }
    out.push(item);
  }
  out.sort((a, b) => {
    const aEn = /^en\b|^english/i.test(a.language) || /^english/i.test(a.label);
    const bEn = /^en\b|^english/i.test(b.language) || /^english/i.test(b.label);
    if (aEn !== bEn) return aEn ? -1 : 1;
    const aHi = /^hi\b|^hindi/i.test(a.language) || /^hindi/i.test(a.label);
    const bHi = /^hi\b|^hindi/i.test(b.language) || /^hindi/i.test(b.label);
    if (aHi !== bHi) return aHi ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return out;
}

const subtitleCache = new Map();

async function fetchVidsparkSubtitlesBundle(input) {
  const path = mediaPathFor(input);
  const cacheKey = 'vs-sub:' + path;
  const hit = subtitleCache.get(cacheKey);
  if (hit && Date.now() - hit.time < 20 * 60_000) return hit;

  let data = null;
  try {
    data = await fetchJsonSafe(`https://vidspark.to/api/vidora/v1/subtitles/${path}`, {
      headers: { 'x-player-key': vidsparkPrimaryKey, Referer: `https://vidspark.to/${path}` },
      timeout: 4500
    });
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      const fresh = await refreshVidoraKey('primary');
      data = await fetchJsonSafe(`https://vidspark.to/api/vidora/v1/subtitles/${path}`, {
        headers: { 'x-player-key': fresh, Referer: `https://vidspark.to/${path}` },
        timeout: 4500
      }).catch(() => null);
    }
  }

  const rawTracks = Array.isArray(data?.tracks) ? data.tracks : [];
  const mapped = [];
  for (const tr of rawTracks) {
    if (!tr?.src || tr.kind === 'thumbnails') continue;
    let absUrl;
    try {
      absUrl = /^https?:\/\//i.test(tr.src)
        ? tr.src
        : new URL(String(tr.src).replace(/^\/+/, ''), 'https://vidspark.to/api/vidora/').href;
    } catch { continue; }
    if (isDeadSubtitleUrl(absUrl)) continue;
    mapped.push({
      src: absUrl,
      language: tr.language || tr.srclang || 'und',
      label: tr.languageName || tr.label || '',
      proxyProvider: 'vidcore',
      headers: { Referer: 'https://vidspark.to/' }
    });
  }
  let tracks = sortAndDedupeTracks(mapped);
  let timing = null;
  if (tracks.length) {
    timing = await inspectSubtitleVttTiming(tracks[0].src, tracks[0].headers || {});
    if (!timing || timing.cueCount < 3) {
      tracks = [];
      timing = null;
    }
  }
  const bundle = { tracks, timing, time: Date.now() };
  if (tracks.length) {
    subtitleCache.set(cacheKey, bundle);
    if (subtitleCache.size > 300) subtitleCache.delete(subtitleCache.keys().next().value);
  }
  return bundle;
}

export async function fetchVidsparkSubtitles(input) {
  const b = await fetchVidsparkSubtitlesBundle(input);
  return b.tracks;
}

async function extractHlsInlineSubtitles(masterUrl, headers = {}, proxyProvider = 'vidcore') {
  if (!masterUrl || !/\.m3u8|playlist|master/i.test(masterUrl)) return [];
  try {
    const r = await fetch(masterUrl, {
      headers: { 'User-Agent': UA, ...headers },
      signal: AbortSignal.timeout(2600)
    });
    if (!r.ok) { r.body?.cancel?.().catch(() => {}); return []; }
    const txt = await r.text();
    if (!txt.includes('#EXT-X-MEDIA') || !/TYPE=SUBTITLES/i.test(txt)) return [];
    const out = [];
    for (const line of txt.split(/\r?\n/)) {
      if (!line.startsWith('#EXT-X-MEDIA') || !/TYPE=SUBTITLES/i.test(line)) continue;
      const uriMatch = line.match(/URI="([^"]+)"/i);
      if (!uriMatch?.[1]) continue;
      const abs = new URL(uriMatch[1], masterUrl).href;
      if (!/\.(?:vtt|srt)(?:\?|$)/i.test(abs)) continue;
      const name = line.match(/NAME="([^"]+)"/i)?.[1] || '';
      const lang = line.match(/LANGUAGE="([^"]+)"/i)?.[1] || 'und';
      out.push({
        src: abs,
        language: inferTrackLanguage(lang, name, abs),
        label: readableLanguage(lang, name),
        proxyProvider,
        headers
      });
    }
    if (!out.length) return [];
    const hlsSubTiming = await inspectSubtitleVttTiming(out[0].src, headers);
    if (!hlsSubTiming || hlsSubTiming.cueCount < 3) return [];
    return out;
  } catch {
    return [];
  }
}

const PAL_TO_NTSC = 25 / 23.976023976; // 1.042709376...
const NTSC_TO_PAL = 23.976023976 / 25; // 0.959040959...

function alignTracksToStreamTiming(tracks, timing, streamDurationSec, effectiveStreamFps, wasProbed = true) {
  if (!tracks?.length) return { usable: [], exactFit: false };
  if (wasProbed && (!timing || timing.cueCount < 3)) {
    // Dead 404 or empty subtitle URL — drop so healthy verified tracks take first slot!
    return { usable: [], exactFit: false };
  }
  if (!(streamDurationSec > 500) || !timing || !(timing.lastSec > 60)) {
    return { usable: tracks, exactFit: true };
  }
  if (timing.cueCount > 0 && timing.cueCount < 30 && streamDurationSec > 1200) {
    // Forced-only / partial track
    return { usable: [], exactFit: false };
  }
  const last = timing.lastSec;
  const ratio = last / streamDurationSec;

  // Case 1: Stream is 25fps PAL (e.g. lightspeed.st) and subtitle is 23.976fps NTSC (lastSec exceeds streamDuration or runs ~4.27% longer)
  if (effectiveStreamFps >= 24.75) {
    const scaledLast = last * NTSC_TO_PAL;
    if (last > streamDurationSec + 12 && scaledLast <= streamDurationSec + 20 && scaledLast >= streamDurationSec * 0.78) {
      return {
        usable: tracks.map(t => ({ ...t, timeScale: NTSC_TO_PAL })),
        exactFit: true
      };
    }
    if (Math.abs(scaledLast - streamDurationSec * 0.94) < Math.abs(last - streamDurationSec * 0.94) && last > streamDurationSec * 0.985) {
      return {
        usable: tracks.map(t => ({ ...t, timeScale: NTSC_TO_PAL })),
        exactFit: true
      };
    }
  }

  // Case 2: Stream is 23.976/24fps NTSC and subtitle is 25fps PAL (ends ~4.1% early, e.g. 55m10s on a 60m41s episode)
  if (effectiveStreamFps < 24.6) {
    const gap = streamDurationSec - last;
    const scaledLast = last * PAL_TO_NTSC;
    if (gap > Math.max(195, streamDurationSec * 0.062) && scaledLast >= streamDurationSec * 0.85 && scaledLast <= streamDurationSec + 15) {
      return {
        usable: tracks.map(t => ({ ...t, timeScale: PAL_TO_NTSC })),
        exactFit: false
      };
    }
  }

  // Reject wrong-cut subtitles (e.g. 28m TV edit on 47m episode, or theatrical vs extended director's cut)
  if (ratio < 0.75 || last > streamDurationSec + 35) {
    return { usable: [], exactFit: false };
  }
  return { usable: tracks, exactFit: ratio >= 0.83 && last <= streamDurationSec + 10 };
}

async function resolveSyncedSubtitles(
  input,
  meta = {},
  inlineTracks = [],
  streamUrl = '',
  streamHeaders = {},
  proxyProvider = 'vidcore',
  knownDurationSec = -1,
  knownFps = 0
) {
  const validInline = sortAndDedupeTracks((inlineTracks || []).filter(t => t?.src && !isDeadSubtitleUrl(t.src)));

  // Measure stream duration & FPS + fetch all subtitle sources concurrently
  const timingPromise = knownDurationSec > 0
    ? Promise.resolve({ durationSec: knownDurationSec, fps: knownFps })
    : (/\.m3u8|playlist|master/i.test(streamUrl) ? inspectHlsTiming(streamUrl, streamHeaders) : Promise.resolve({ durationSec: -1, fps: 0 }));

  const inlineTimingPromise = validInline.length
    ? inspectSubtitleVttTiming(validInline[0].src, validInline[0].headers || {})
    : Promise.resolve(null);

  const [streamTiming, inlineTiming, hlsSubs, vsBundle] = await Promise.all([
    timingPromise,
    inlineTimingPromise,
    extractHlsInlineSubtitles(streamUrl, streamHeaders, proxyProvider),
    fetchVidsparkSubtitlesBundle(input).catch(() => ({ tracks: [], timing: null }))
  ]);

  const streamDurationSec = streamTiming.durationSec;
  const expectedMins = Number(input.type === 'tv' ? meta?.episodeRuntimeMinutes : meta?.movieRuntimeMinutes) || 0;
  let effectiveStreamFps = streamTiming.fps || 0;
  if (!(effectiveStreamFps > 0)) {
    if (expectedMins >= 20 && streamDurationSec > 600) {
      const ntscSec = expectedMins * 60;
      const palSec = ntscSec * NTSC_TO_PAL;
      effectiveStreamFps = (Math.abs(streamDurationSec - palSec) + 32 < Math.abs(streamDurationSec - ntscSec)) ? 25 : 23.976;
    } else {
      effectiveStreamFps = 23.976;
    }
  }

  const osSubs = meta?.imdbId
    ? await fetchOpenSubtitles(input, meta.imdbId, { streamDurationSec, streamFps: effectiveStreamFps }).catch(() => [])
    : [];

  const inlineAligned = alignTracksToStreamTiming(validInline, inlineTiming, streamDurationSec, effectiveStreamFps, true);
  const vsAligned = alignTracksToStreamTiming(vsBundle.tracks, vsBundle.timing, streamDurationSec, effectiveStreamFps, true);

  // Rank exact-fit tracks ahead of FPS-scaled fallbacks so native frame-rate WEB-DL captions always win!
  const exactBucket = [
    ...hlsSubs,
    ...(inlineAligned.exactFit ? inlineAligned.usable : []),
    ...(vsAligned.exactFit ? vsAligned.usable : []),
    ...osSubs
  ];
  const scaledBucket = [
    ...(!inlineAligned.exactFit ? inlineAligned.usable : []),
    ...(!vsAligned.exactFit ? vsAligned.usable : [])
  ];

  return sortAndDedupeTracks([...exactBucket, ...scaledBucket]);
}

// Strict clean language parser: converts VidHindi, VidTamil, [Hindi] - FHD 1080P, 720p | Tamil, हिन्दी, [OST], etc.
// into pure language names ONLY ("Hindi", "Tamil", "Telugu", "English", etc.) — NEVER server/tag labels!
const CLEAN_AUDIO_LANG_PATTERNS = [
  [/\b(?:vid)?hindi\b|\bhin\b|हिन्दी/i, 'hi', 'Hindi'],
  [/\b(?:vid)?tamil\b|\btam\b|தமிழ்/i, 'ta', 'Tamil'],
  [/\b(?:vid)?telugu\b|\btel\b|తెలుగు/i, 'te', 'Telugu'],
  [/\b(?:vid)?malayalam\b|\bmal\b|മലയാളം/i, 'ml', 'Malayalam'],
  [/\b(?:vid)?kannada\b|\bkan\b|ಕನ್ನಡ/i, 'kn', 'Kannada'],
  [/\b(?:vid)?bengali\b|\bbangla\b|\bben\b|বাংলা/i, 'bn', 'Bengali'],
  [/\b(?:vid)?marathi\b|\bmar\b/i, 'mr', 'Marathi'],
  [/\b(?:vid)?punjabi\b|\bpan\b/i, 'pa', 'Punjabi'],
  [/\b(?:vid)?urdu\b|\burd\b/i, 'ur', 'Urdu'],
  [/\b(?:vid)?gujarati\b|\bguj\b/i, 'gu', 'Gujarati'],
  [/\b(?:vid)?english\b|\beng\b/i, 'en', 'English'],
  [/\b(?:vid)?spanish\b|\blatino\b|\bcastellano\b|\bespa[nñ]ol\b/i, 'es', 'Spanish'],
  [/\b(?:vid)?french\b|\bfran[cç]ais\b|\bvff\b|\bvfq\b/i, 'fr', 'French'],
  [/\b(?:vid)?german\b|\bdeutsch\b/i, 'de', 'German'],
  [/\b(?:vid)?portuguese\b|\bdublado\b|\bportugu[eê]s\b/i, 'pt', 'Portuguese'],
  [/\b(?:vid)?italian\b|\bitaliano\b/i, 'it', 'Italian'],
  [/\b(?:vid)?russian\b/i, 'ru', 'Russian'],
  [/\b(?:vid)?arabic\b/i, 'ar', 'Arabic'],
  [/\b(?:vid)?japanese\b|\bjpn\b/i, 'ja', 'Japanese'],
  [/\b(?:vid)?korean\b|\bkor\b/i, 'ko', 'Korean'],
  // Chinese is tagged as Mandarin, Cantonese, 中文/普通话/粤语, or a bare zh code.
  [/\bmandarin\b|中文|普通话|國語|国语/i, 'zh', 'Chinese'],
  [/\bcantonese\b|粤语|粵語/i, 'yue', 'Cantonese'],
  [/\b(?:vid)?turkish\b/i, 'tr', 'Turkish'],
  [/\b(?:vid)?thai\b/i, 'th', 'Thai'],
  [/\b(?:vid)?indonesian\b/i, 'id', 'Indonesian'],
  [/\b(?:vid)?vietnamese\b/i, 'vi', 'Vietnamese']
];

// One canonical code per Chinese variant: zh-Hans/zh-CN/chi/zho/cmn are all the
// same Mandarin dub, and yue stays separate because it is a different audio.
const normalizeAudioLangCode = (code) => {
  const base = String(code || '').toLowerCase().trim().split(/[-_]/)[0];
  if (['zh', 'chi', 'zho', 'cmn', 'cn', 'chs', 'cht'].includes(base)) return 'zh';
  if (base === 'yue') return 'yue';
  return base;
};

const SUBTITLE_ONLY_RX = /\b(?:sub(?:s|titles?|titled)?|subt[ií]tulos?|untertitel|sous-titres?|legendas?)\b/i;

const isMarkedUnofficial = text => /\b(?:fan[ -]?(?:dub|voice)|unofficial|ai[ -]?dub|machine[ -]?dub)\b/i.test(String(text||''));

export function cleanLanguageOnlyLabel(rawText = '', rawLangCode = '', origLang = '') {
  const combined = `${rawText || ''} ${rawLangCode || ''}`.trim();
  if (isMarkedUnofficial(combined)) return null;
  // Exclude subtitle-only tags ("Spanish Sub", "Arabic Sub", "English Subtitled") from being treated as dubbed audio!
  // A provider label such as "Chinese Subtitles" must never be promoted to audio
  // just because its code says zh; subtitle wording always wins.
  if (SUBTITLE_ONLY_RX.test(rawText) && !/\bdub(?:bed)?\b|\bdual\b/i.test(rawText)) {
    return null;
  }
  for (const [rx, code, label] of CLEAN_AUDIO_LANG_PATTERNS) {
    if (rx.test(combined)) {
      if (code === 'zh' || code === 'yue') {
        const parsed = normalizeAudioLangCode(code);
        return { code: parsed, label: parsed === 'yue' ? 'Cantonese' : 'Chinese' };
      }
      return { code, label };
    }
  }
  if (/\[ost\]|\boriginal\b/i.test(combined)) {
    const base = String(origLang || '').toLowerCase().split(/[-_]/)[0];
    if (base && !['und','unk'].includes(base)) return { code: base, label: readableLanguage(base) };
    return null;
  }
  const cleanCode = String(rawLangCode || '').toLowerCase().split(/[-_]/)[0].replace(/[^a-z]/g, '').slice(0, 3);
  const iso3to2 = { eng:'en',hin:'hi',jpn:'ja',kor:'ko',spa:'es',fra:'fr',fre:'fr',deu:'de',ger:'de',ita:'it',por:'pt',rus:'ru',zho:'zh',chi:'zh',ara:'ar',tam:'ta',tel:'te',mal:'ml',kan:'kn',ben:'bn',mar:'mr',pan:'pa',urd:'ur' };
  if (cleanCode && LANG_FALLBACK[cleanCode]) {
    const normalized = normalizeAudioLangCode(iso3to2[cleanCode] || cleanCode);
    if (normalized === 'zh') return { code: 'zh', label: 'Chinese' };
    if (normalized === 'yue') return { code: 'yue', label: 'Cantonese' };
    return { code: normalized, label: LANG_FALLBACK[cleanCode] };
  }
  if (/^[a-z]{2,3}$/.test(cleanCode) && !['und','unk'].includes(cleanCode)) {
    try { const label = langDisplay?.of(cleanCode); if (label && label.toLowerCase() !== cleanCode) return { code: cleanCode, label }; } catch {}
  }
  return null;
}

const NXSHA_PASS = '38c8cd65d781936f4b9fe1fd985234fd7335699855051abf76ea3493bcfc0120';

function nxEvpBytesToKey(password, salt) {
  let derived = Buffer.alloc(0), prev = Buffer.alloc(0);
  const passBuf = Buffer.from(password, 'utf8');
  while (derived.length < 48) {
    prev = crypto.createHash('md5').update(Buffer.concat([prev, passBuf, salt])).digest();
    derived = Buffer.concat([derived, prev]);
  }
  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
}

function nxEncrypt(obj) {
  const payload = JSON.stringify({
    ...obj,
    _req_ts: Date.now(),
    _req_salt: Math.random().toString(36).slice(2, 12)
  });
  const salt = crypto.randomBytes(8);
  const { key, iv } = nxEvpBytesToKey(NXSHA_PASS, salt);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([Buffer.from('Salted__'), salt, cipher.update(payload, 'utf8'), cipher.final()]);
  return enc.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nxDecrypt(hashStr) {
  if (typeof hashStr !== 'string' || hashStr.length < 24) return null;
  let b64 = hashStr.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 17 || buf.subarray(0, 8).toString('latin1') !== 'Salted__') return null;
  const { key, iv } = nxEvpBytesToKey(NXSHA_PASS, buf.subarray(8, 16));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

let regionalBlockedAt=0;
export const regionalAudioStatus=()=>Date.now()-regionalBlockedAt<60000?'blocked':'ready';

async function fetchEmbedWaveSourcesForScraper(scraper, input, meta = {}) {
  const payload = {
    provider: scraper,
    tmdbId: String(input.id),
    imdb_id: meta?.imdbId || '',
    type: input.type === 'tv' ? 'tv' : 'movie',
    ...(input.type === 'tv' ? { season: String(input.season), episode: String(input.episode) } : {}),
    ex_lang: true
  };
  const embedRef = input.type === 'tv'
    ? `https://web.nxsha.app/embed/tv/${input.id}/${input.season}/${input.episode}`
    : `https://web.nxsha.app/embed/movie/${input.id}`;
  const q = encodeURIComponent(nxEncrypt(payload));
  const raw = await fetchJsonSafe(`https://web.nxsha.app/api/sources?q=${q}`, {
    headers: { Referer: embedRef, Origin: 'https://web.nxsha.app' },
    timeout: 7000
  }).catch(error => {if(error?.status===403||error?.status===429)regionalBlockedAt=Date.now();return null});
  const dec = raw?._hash ? nxDecrypt(raw._hash) : null;
  return Array.isArray(dec?.sources) ? dec.sources : [];
}

function parseEmbeddedHlsAudioLanguages(masterText = '', origLang = '') {
  if (!masterText.includes('#EXT-X-MEDIA') || !/TYPE=AUDIO/i.test(masterText)) return [];
  const found = new Map();
  for (const line of masterText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXT-X-MEDIA:') || !/TYPE=AUDIO/i.test(trimmed)) continue;
    const name = trimmed.match(/NAME="([^"]+)"/i)?.[1] || '';
    const lang = trimmed.match(/LANGUAGE="([^"]+)"/i)?.[1] || '';
    const parsed = cleanLanguageOnlyLabel(name, lang, origLang);
    if (parsed && !found.has(parsed.label)) {
      found.set(parsed.label, parsed);
    }
  }
  return [...found.values()];
}

const multiAudioCache = new Map();
const INDIAN_LANG_CODES = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'ur', 'gu']);

function embedCandidateScore(s, rawDesc, input, isMp4, isHevc) {
  const providerScore = input.type === 'movie'
    ? ({ mahalala: 520, nitro: 410, castle: 255, 'rive-citadel': 250, purstream: 210, watchout: 180, bdxs: 150, awsind: -120 })
    : ({ castle: 560, 'rive-citadel': 525, mahalala: 390, purstream: 260, watchout: 220, bdxs: 180, nitro: 120, awsind: -120 });
  const quality = /2160|4k/i.test(rawDesc) ? 410 : /1080|fhd/i.test(rawDesc) ? 260 : /720|\bhd\b/i.test(rawDesc) ? 160 : /480/i.test(rawDesc) ? 60 : 145;
  return (providerScore[s._scraper] ?? 100) + quality + (isHevc ? -1400 : 150) + (isMp4 ? 0 : 20);
}

// nitro's CDN answers 403 "Access Denied: Blocked by upstream provider nitrox"
// for a few seconds when several episodes are probed at once. That is a throttle,
// not a missing dub, so the probe backs off instead of reporting "no language".
const NITRO_BLOCK_RE = /blocked by upstream provider|access denied/i;

// A single probe must never become the slowest thing on the page. nitro's CDN
// throttles hard once several episodes are opened at once, and retrying a
// throttled URL for ten seconds buys nothing that a sibling candidate does not
// already answer instantly - so the retry budget is bounded per probe.
const NITRO_RETRY_BUDGET_MS = 4200;
let nitroBlockedAt = 0;   // when the last nick was seen, so siblings skip the queue

async function probeEmbedWaveStream(url, scraper, input, meta, rawDesc = '', attempt = 0, startedAt = 0) {
  if (!url || !/^https:\/\//i.test(url) || isLockerUrl(url)) return null;
  const probeStart = startedAt || Date.now();
  const nxHeaders = { Referer: 'https://web.nxsha.app/', Origin: 'https://web.nxsha.app' };
  const headerVariants = scraper === 'purstream' || scraper === 'mahalala'
    ? [{}, nxHeaders]
    : [nxHeaders, {}];
  const isHevcHint = /\/resource\/h265\/|\bh\.?265\b|\bhevc\b/i.test(`${url} ${rawDesc}`);

  for (const hdrs of headerVariants) {
    try {
      const isDirectMp4 = /\.mp4(?:\?|$)/i.test(url) || /macdn\.hakunaymatata\.com\/(?:resource|cms|bt|animekai|tran-audio)\//i.test(url);
      const reqHeaders = {
        'User-Agent': UA,
        ...hdrs,
        ...(isDirectMp4 ? { Range: 'bytes=0-131071' } : {})
      };
      const r = await fetch(url, {
        headers: reqHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(2800)
      });
      if (!r.ok && r.status !== 206) {
        const peek = r.status === 403 ? String(await r.text().catch(() => '')).slice(0, 300) : '';
        r.body?.cancel?.().catch(() => {});
        if (NITRO_BLOCK_RE.test(peek)) {
          nitroBlockedAt = Date.now();
          // Retry only while this probe is still inside its own budget. When a
          // sibling already proved the same CDN is throttling, do not queue up
          // behind it: report "unknown" immediately and let another candidate win.
          const spent = Date.now() - probeStart;
          if (attempt < 2 && spent < NITRO_RETRY_BUDGET_MS) {
            await new Promise(res => setTimeout(res, 250 + attempt * 350));
            return probeEmbedWaveStream(url, scraper, input, meta, rawDesc, attempt + 1, probeStart);
          }
        }
        continue;
      }
      const ctype = String(r.headers.get('content-type') || '').toLowerCase();
      if (isDirectMp4 || ctype.startsWith('video/')) {
        const cr = String(r.headers.get('content-range') || '');
        const headBuf = await readLimitedBody(r);
        const durationSec = await inspectMp4DurationSec(url, hdrs, headBuf, cr);
        if (!verifyStreamRuntimeByDur(input, durationSec, meta, false)) {
          continue;
        }
        const boxHevc = headBuf.includes(Buffer.from('hvc1')) || headBuf.includes(Buffer.from('hev1'));
        const boxAvc1 = headBuf.includes(Buffer.from('avc1')) || headBuf.includes(Buffer.from('avc3'));
        const detectedMp4Codec = boxHevc ? 'hevc' : boxAvc1 ? 'h264' : (isHevcHint ? 'hevc' : 'h264');
        return {
          url,
          kind: 'mp4',
          codec: detectedMp4Codec,
          headers: hdrs,
          maxH: 0,
          durationSec,
          fps: 0,
          scraper,
          embeddedAudio: []
        };
      }
      const txt = await r.text();
      if (!txt.trimStart().startsWith('#EXTM3U')) {
        continue;
      }
      const timing = await inspectHlsTiming(url, hdrs, txt);
      const durationSec = timing.durationSec;
      if (!verifyStreamRuntimeByDur(input, durationSec, meta, false) || (scraper === 'awsind' && !verifyDubDurationMatch(durationSec, 0, input, meta, scraper))) {
        continue;
      }
      const resMatches = [...txt.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)];
      const maxH = resMatches.reduce((mx, m) => Math.max(mx, Number(m[2]) || 0, Number(m[1]) >= 1800 ? 1080 : Number(m[1]) >= 1200 ? 720 : 0), 0) || 0;
      const embeddedAudio = parseEmbeddedHlsAudioLanguages(txt, meta?.originalLanguage || '');
      const hlsHasHevc = /\bCODECS="[^"]*\b(?:hvc1|hev1|dvh1|dvhe)\b/i.test(txt);
      const hlsHasAvc = /\bCODECS="[^"]*\bavc1\b/i.test(txt);
      const detectedHlsCodec = (hlsHasHevc && !hlsHasAvc) ? 'hevc' : hlsHasAvc ? 'h264' : (isHevcHint ? 'hevc' : 'h264');
      return {
        url,
        kind: 'hls',
        codec: detectedHlsCodec,
        headers: hdrs,
        maxH,
        durationSec,
        fps: timing.fps || 0,
        scraper,
        embeddedAudio
      };
    } catch {}
  }
  return null;
}

async function fetchEmbedWaveBundle(input, meta = {}) {
  const pathKey = mediaPathFor(input);
  const hit = multiAudioCache.get(pathKey);
  if (hit && Date.now() - hit.time < 10 * 60_000) return hit.value;

  const origLang = String(meta?.originalLanguage || meta?.spokenLanguages?.[0]?.code || '').toLowerCase();
  const origBase = origLang.slice(0, 2);
  // Query Indian & multi-language scrapers concurrently: castle + awsind + nitro + mahalala cover 80–100% of shows & movies with clean Hindi audio!
  const scrapers = ['castle', 'awsind', 'nitro', 'mahalala', 'watchout', 'purstream', 'bdxs', 'rive-citadel'];
  const rawLists = await Promise.all(
    scrapers.map(sc => fetchEmbedWaveSourcesForScraper(sc, input, meta).then(list => list.map(item => ({ ...item, _scraper: sc }))).catch(()=>[]))
  );
  let allRaw = rawLists
    .flat()
    .filter(s => s?.url && !s.isEmbed && s.type !== 'embed' && /^https:\/\//i.test(s.url) && !isLockerUrl(s.url));

  // Guard against castle fuzzy-matching an Indian movie/series title when a non-Indian title has no actual Indian dub
  // (e.g. "Model Citizen" -> Indian movie "Citizen"): if castle ONLY returned Indian dubs with zero [English]/[OST]/original
  // track AND zero corroborating Indian dubs from any other scraper, discard castle's fuzzy hit.
  if (!INDIAN_LANG_CODES.has(origBase)) {
    const castleItems = allRaw.filter(s => s._scraper === 'castle');
    if (castleItems.length) {
      const castleHasNonIndian = castleItems.some(s => {
        const desc = [s.label, s.title, s.name, s.quality].filter(Boolean).join(' ');
        if (/\[ost\]|\boriginal\b/i.test(desc)) return true;
        const p = cleanLanguageOnlyLabel(desc, s.lang || s.language || '', origLang);
        return Boolean(p && !INDIAN_LANG_CODES.has(p.code));
      });
      const otherHasIndian = allRaw.some(s => {
        if (s._scraper === 'castle') return false;
        const desc = [s.label, s.title, s.name, s.quality].filter(Boolean).join(' ');
        if (/\b(?:hindi|tamil|telugu|malayalam|kannada|bengali)\b|हिन्दी/i.test(desc)) return true;
        const p = cleanLanguageOnlyLabel(desc, s.lang || s.language || '', origLang);
        return Boolean(p && INDIAN_LANG_CODES.has(p.code));
      });
      if (!castleHasNonIndian && !otherHasIndian) {
        allRaw = allRaw.filter(s => s._scraper !== 'castle');
      }
    }
  }

  const langCandidates = new Map();
  const primaryCandidates = [];
  const multiMasterCandidates = [];

  for (const s of allRaw) {
    const rawDesc = [s.label, s.title, s.name, s.quality, s.server, s.provider].filter(Boolean).join(' ');
    if (isMarkedUnofficial(rawDesc)) continue;
    if (/\bsub(?:s|titled)?\b/i.test(rawDesc) && !/\bdub(?:bed)?\b|\bdual\b/i.test(rawDesc)) continue;
    const isHevc = /\/resource\/h265\/|\bh\.?265\b|\bhevc\b/i.test(`${s.url} ${rawDesc}`);
    const isMp4 = /\.mp4(?:\?|$)/i.test(s.url) || /macdn\.hakunaymatata\.com\/(?:resource|cms|bt|animekai|tran-audio)\//i.test(s.url);
    if (input.type === 'tv' && String(input.id) === '46260' && s._scraper === 'nitro') continue; // wrong Naruto episode confirmed
    const tierHint = embedCandidateScore(s, rawDesc, input, isMp4, isHevc);
    const parsedLang = cleanLanguageOnlyLabel(rawDesc, s.lang || s.language || '', origLang);
    const entry = { ...s, rawDesc, tierHint, parsedLang, isHevc };

    if (!isMp4 && (s._scraper === 'nitro' || (!parsedLang && (s._scraper === 'awsind' || /multi/i.test(rawDesc))))) {
      multiMasterCandidates.push(entry);
    }
    if (!parsedLang || parsedLang.code === origBase || parsedLang.code === 'en' || /multi/i.test(rawDesc)) {
      if (!isHevc) primaryCandidates.push(entry);
    }
    if (parsedLang) {
      const bucket = langCandidates.get(parsedLang.label) || [];
      bucket.push(entry);
      langCandidates.set(parsedLang.label, bucket);
    }
  }

  for (const bucket of langCandidates.values()) {
    bucket.sort((a, b) => b.tierHint - a.tierHint);
  }
  primaryCandidates.sort((a, b) => b.tierHint - a.tierHint);
  multiMasterCandidates.sort((a, b) => b.tierHint - a.tierHint);

  // Build prioritized probe target list — Hindi & embedded multi-audio HLS masters are ALWAYS probed first!
  const probeTargets = new Map();
  const addTarget = c => {
    if (c?.url && !probeTargets.has(c.url) && probeTargets.size < 18) probeTargets.set(c.url, c);
  };

  for (const c of (langCandidates.get('Hindi') || []).slice(0, 4)) addTarget(c);
  for (const c of (langCandidates.get('Tamil') || []).slice(0, 2)) addTarget(c);
  for (const c of (langCandidates.get('Telugu') || []).slice(0, 2)) addTarget(c);
  for (const c of multiMasterCandidates.slice(0, 3)) addTarget(c);
  for (const c of primaryCandidates.slice(0, 3)) addTarget(c);

  const priorityDubOrder = [
    'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali',
    'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Korean', 'Italian', 'Russian', 'Arabic'
  ];
  for (const langName of priorityDubOrder) {
    for (const c of (langCandidates.get(langName) || []).slice(0, 2)) addTarget(c);
  }
  for (const bucket of langCandidates.values()) {
    if (bucket[0]) addTarget(bucket[0]);
  }

  const probedMap = new Map();
  await Promise.all([...probeTargets.values()].map(async c => {
    const res = await probeEmbedWaveStream(c.url, c._scraper, input, meta, c.rawDesc);
    if (res) probedMap.set(c.url, res);
  }));

  // Expand embedded multi-audio HLS masters (e.g. nitro #EXT-X-MEDIA:TYPE=AUDIO with Hindi/हिन्दी, English, Tamil, Telugu)
  for (const c of [...multiMasterCandidates, ...primaryCandidates]) {
    const live = probedMap.get(c.url);
    if (!live?.embeddedAudio?.length) continue;
    for (const emb of live.embeddedAudio) {
      const bucket = langCandidates.get(emb.label) || [];
      bucket.unshift({
        ...c,
        parsedLang: emb,
        audioLang: emb.code,
        tierHint: c.tierHint + 50
      });
      bucket.sort((a, b) => b.tierHint - a.tierHint);
      langCandidates.set(emb.label, bucket);
    }
  }

  // Rank playable candidates by advertised resolution first, not by scraper
  // preference. A parsed HLS master overrides a potentially inaccurate label;
  // a label is only a hint for single-rendition playlists or MP4 files.
  const qualityHint = c => {
    const live=probedMap.get(c.url); if (!live) return -1;
    if (live.maxH > 0) return live.maxH;
    const text=String(c.rawDesc||'');
    return /2160|\b4k\b/i.test(text)?2160:/1080|\bfhd\b/i.test(text)?1080:/720|\bhd\b/i.test(text)?720:/480/i.test(text)?480:0;
  };
  const qualityFirst=(a,b)=>(qualityHint(b)-qualityHint(a)) || (b.tierHint-a.tierHint);
  primaryCandidates.sort(qualityFirst);
  for (const bucket of langCandidates.values()) bucket.sort(qualityFirst);

  let primary = null;
  for (const c of primaryCandidates) {
    const live = probedMap.get(c.url);
    if (live && live.codec !== 'hevc') {
      primary = { ...live, parsedLang: c.parsedLang };
      break;
    }
  }

  const audioStreams = [];
  const seenLabels = new Set();
  const orderedLabels = [
    readableLanguage(origLang || 'en'),
    'English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali',
    'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Russian', 'Arabic', 'Japanese', 'Korean'
  ];

  const allLabels = [
    ...orderedLabels.filter(l => langCandidates.has(l)),
    ...[...langCandidates.keys()].filter(l => !orderedLabels.includes(l))
  ];

  for (const label of allLabels) {
    if (seenLabels.has(label)) continue;
    const bucket = langCandidates.get(label) || [];
    const matchesPrimary = c => {
      if (!probedMap.has(c.url)) return false;
      const candLive = probedMap.get(c.url);
      if (primary && candLive.url !== primary.url) {
        return verifyDubDurationMatch(candLive.durationSec, primary.durationSec, input, meta, candLive.scraper || c._scraper || '');
      }
      return true;
    };
    // Prefer universal H.264 winner over HEVC winner whenever available
    const winner = bucket.find(c => matchesPrimary(c) && probedMap.get(c.url).codec !== 'hevc')
      || bucket.find(c => matchesPrimary(c));
    if (!winner) continue;
    const live = probedMap.get(winner.url);
    seenLabels.add(label);
    const pinLang = winner.audioLang || (live.embeddedAudio?.some(e => e.code === winner.parsedLang.code) ? winner.parsedLang.code : '');
    audioStreams.push({
      language: winner.parsedLang.code,
      label, // Pure language name ONLY ("English", "Hindi", "Tamil", "Telugu", etc.)
      url: live.url,
      kind: live.kind || 'hls',
      codec: live.codec || 'h264',
      durationSec: live.durationSec || -1,
      fps: live.fps || 0,
      _scraper: live.scraper || winner._scraper || '',
      ...(pinLang ? { audioLang: pinLang } : {}),
      proxyProvider: 'embedwave',
      headers: live.headers
    });
    if (!primary && live.codec !== 'hevc') {
      primary = { ...live, parsedLang: winner.parsedLang };
    }
  }

  // Ensure primary stream is also represented cleanly as original language if multi-audio exists
  if (primary && audioStreams.length > 0 && !audioStreams.some(a => a.url === primary.url && !a.audioLang)) {
    const origLabel = primary.parsedLang?.label || (origLang ? readableLanguage(origLang) : 'Original audio');
    if (!seenLabels.has(origLabel)) {
      audioStreams.unshift({
        language: primary.parsedLang?.code || origLang || 'und',
        label: origLabel,
        url: primary.url,
        kind: primary.kind || 'hls',
        codec: primary.codec || 'h264',
        durationSec: primary.durationSec || -1,
        fps: primary.fps || 0,
        _scraper: primary.scraper || '',
        proxyProvider: 'embedwave',
        headers: primary.headers
      });
    }
  }

  const value = { primary, audioStreams };
  if (primary || audioStreams.length) {
    multiAudioCache.set(pathKey, { value, time: Date.now() });
    if (multiAudioCache.size > 200) multiAudioCache.delete(multiAudioCache.keys().next().value);
  }
  return value;
}

function parseOsLastTsSeconds(tsStr) {
  const m = String(tsStr || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function fetchOpenSubtitles(input, imdbId, { streamDurationSec = -1, streamFps = 23.976 } = {}) {
  const cleanImdb = String(imdbId || '').replace(/^tt/i, '').replace(/\D/g, '');
  if (!cleanImdb) return [];
  const durBucket = streamDurationSec > 500 ? Math.round(streamDurationSec / 15) : 0;
  const fpsBucket = streamFps >= 24.75 ? 'pal' : 'ntsc';
  const cacheKey = `os:${cleanImdb}:${input.type === 'tv' ? `${input.season}:${input.episode}` : 'movie'}:${durBucket}:${fpsBucket}`;
  const hit = subtitleCache.get(cacheKey);
  if (hit && Date.now() - hit.time < 30 * 60_000) return hit.tracks;

  const endpoint = input.type === 'tv'
    ? `https://rest.opensubtitles.org/search/episode-${input.episode}/imdbid-${cleanImdb}/season-${input.season}`
    : `https://rest.opensubtitles.org/search/imdbid-${cleanImdb}`;

  const rows = await fetchJsonSafe(endpoint, {
    headers: { 'X-User-Agent': 'TemporaryUserAgent' },
    timeout: 4800
  }).catch(() => null);

  if (!Array.isArray(rows) || !rows.length) return [];
  const bestByLang = new Map();

  for (const row of rows) {
    const dl = row?.SubDownloadLink;
    const fmt = String(row?.SubFormat || '').toLowerCase();
    if (!dl || !/^https:\/\//i.test(dl) || (fmt && !['srt', 'vtt', 'subrip'].includes(fmt))) continue;
    if (String(row?.SubBad || '0') !== '0') continue;

    const isForeignOnly = String(row?.SubForeignPartsOnly || '0') === '1';
    const langKey = String(row.ISO639 || row.SubLanguageID || row.LanguageName || 'und').toLowerCase();
    // Never select forced/foreign-parts-only tracks for English or Hindi full captions
    if (isForeignOnly && /^en|^hi/i.test(langKey)) continue;

    const subDur = parseOsLastTsSeconds(row.SubLastTS);
    const rowFps = Number(row.MovieFPS) || 0;
    const relText = `${row.MovieReleaseName || ''} ${row.SubFileName || ''}`;
    const downloads = Number(row.SubDownloadsCnt) || 0;

    let score = Math.min(140, Math.log10(downloads + 1) * 32);
    if (isForeignOnly) score -= 500;
    if (/\b(?:web[-_. ]?dl|webrip|web|nf|amzn|dsnp|atvp|hmax|bluray|bdrip)\b/i.test(relText)) score += 120;
    if (/\b(?:hdcam|camrip|tsrip|telesync|dvdscr)\b/i.test(relText)) score -= 220;
    if (String(row?.SubHearingImpaired || '0') === '0') score += 18;

    let timeScale = 1;
    if (streamDurationSec > 500 && subDur > 120) {
      const directRatio = subDur / streamDurationSec;
      const palToNtscDur = subDur * PAL_TO_NTSC;
      const ntscToPalDur = subDur * NTSC_TO_PAL;
      const isStreamPal = streamFps >= 24.75;

      if (directRatio >= 0.84 && subDur <= streamDurationSec + 8) {
        // Direct duration match
        score += 460 - Math.abs(0.945 - directRatio) * 260;
        if (rowFps > 20) {
          if ((isStreamPal && rowFps >= 24.75) || (!isStreamPal && rowFps <= 24.5)) score += 180;
          else score -= 110;
        }
      } else if (!isStreamPal && (rowFps >= 24.75 || directRatio < 0.84) && palToNtscDur >= streamDurationSec * 0.85 && palToNtscDur <= streamDurationSec + 10) {
        // 25fps PAL subtitle scaled cleanly onto 23.976fps stream
        timeScale = PAL_TO_NTSC;
        score += 240;
      } else if (isStreamPal && (rowFps > 0 && rowFps <= 24.5 || subDur > streamDurationSec + 10) && ntscToPalDur >= streamDurationSec * 0.84 && ntscToPalDur <= streamDurationSec + 10) {
        // 23.976fps NTSC subtitle scaled cleanly onto 25fps PAL stream
        timeScale = NTSC_TO_PAL;
        score += 260;
      } else if (directRatio < 0.74 || subDur > streamDurationSec + 32) {
        // Wrong cut / partial subtitle — skip!
        continue;
      } else {
        score += 90;
      }
    } else if (rowFps > 20) {
      if ((streamFps >= 24.75 && rowFps >= 24.75) || (streamFps < 24.75 && rowFps <= 24.5)) score += 90;
    }

    const prev = bestByLang.get(langKey);
    if (!prev || score > prev.score) {
      bestByLang.set(langKey, {
        score,
        downloads,
        src: dl,
        language: row.ISO639 || langKey,
        label: row.LanguageName || readableLanguage(langKey),
        proxyProvider: 'opensubtitles',
        headers: {},
        ...(Math.abs(timeScale - 1) >= 0.0004 ? { timeScale } : {})
      });
    }
  }

  const sorted = [...bestByLang.values()]
    .sort((a, b) => {
      const aEn = /^en/i.test(a.language) || /^english/i.test(a.label);
      const bEn = /^en/i.test(b.language) || /^english/i.test(b.label);
      if (aEn !== bEn) return aEn ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 28);

  // OpenSubtitles download links are short-lived: the ones in a cached search
  // response often 404 by the time a viewer opens them, which surfaced as 502s on
  // tracks the menu had offered. Probe the English and a sample of the rest before
  // publishing, and drop whatever does not come back as real WebVTT.
  const verified = await verifySubtitleTracks(sorted);

  const tracks = sortAndDedupeTracks(verified);
  if (tracks.length) {
    subtitleCache.set(cacheKey, { tracks, time: Date.now() });
    if (subtitleCache.size > 300) subtitleCache.delete(subtitleCache.keys().next().value);
  }
  return tracks;
}

// A subtitle entry is only worth showing if fetching it returns actual cues.
// OpenSubtitles hands out short-lived download tokens that are routinely dead by
// the time a viewer picks a track, which is why they were failing in the player.
// Caption CDNs are also allowed to hiccup, so a track is only dropped when its
// host has definitively refused everything asked of it; a single flaky probe
// never removes an otherwise good list.
async function verifySubtitleTracks(list = []) {
  if (!list.length) return list;

  const hostOf = (t) => { try { return new URL(t.src).hostname; } catch { return ''; } };
  const verdict = new Map(); // host -> { answered, alive }

  await Promise.all(list.map(async (t) => {
    if (!t?.src) return;
    const host = hostOf(t);
    try {
      const r = await fetch(t.src, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*', Range: 'bytes=0-2048' },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000)
      });
      const v = verdict.get(host) || { answered: 0, alive: 0 };
      v.answered++;
      let good = false;
      if (r.ok || r.status === 206) {
        const head = (await r.text()).replace(/^\uFEFF/, '');
        good = !/^\s*<(?:!doctype|html)/i.test(head)
          && (/^WEBVTT/m.test(head) || /-->\s*\d+:\d+:\d+[.,]\d+/.test(head));
      }
      if (good) v.alive++;
      verdict.set(host, v);
    } catch {
      // Network-level failure: no verdict from this probe.
    }
  }));

  // Keep every track whose host behaved, and every track whose host we could not
  // reach at all. Drop tracks only from hosts that answered and never once served
  // caption text — that is the expired-token signature.
  const deadHosts = new Set();
  for (const [host, v] of verdict) {
    if (v.answered > 0 && v.alive === 0) deadHosts.add(host);
  }
  if (!deadHosts.size) return list;
  return list.filter((t) => !deadHosts.has(hostOf(t)));
}

function mapSourceTracks(rawTracks = [], proxyProvider, referer) {
  const out = [];
  for (const t of rawTracks) {
    const rawUrl = t?.file || t?.src || t?.url;
    if (!rawUrl || t?.kind === 'thumbnails' || /thumbnails/i.test(t?.label || '')) continue;
    try {
      const abs = new URL(rawUrl, referer).href;
      if (!/^https:\/\//i.test(abs) || isDeadSubtitleUrl(abs)) continue;
      const lbl = t.languageName || t.label || '';
      out.push({
        src: abs,
        language: inferTrackLanguage(t.language || t.srclang || t.lang || '', lbl, abs),
        label: lbl,
        proxyProvider,
        headers: referer ? { Referer: referer } : {}
      });
    } catch {}
  }
  return out;
}

function mapSourceQualities(rawQualities = [], proxyProvider, headers = {}) {
  if (!Array.isArray(rawQualities) || !rawQualities.length) return [];
  const out = [];
  for (const q of rawQualities) {
    const u = q?.url || q?.file;
    const h = Number(q?.height || String(q?.quality || q?.label || '').replace(/\D/g, '')) || 0;
    if (!u || !/^https:\/\//i.test(u) || !h) continue;
    out.push({
      tier: h >= 2000 ? 2160 : h >= 1350 ? 1440 : h >= 1000 ? 1080 : h >= 680 ? 720 : h >= 440 ? 480 : 360,
      height: h,
      url: u,
      kind: /\.mp4(?:\?|$)/i.test(u) ? 'mp4' : 'hls',
      codec: 'h264',
      proxyProvider,
      headers
    });
  }
  out.sort((a, b) => b.tier - a.tier);
  return out;
}

// ============================================================================
// SHARED HIGH-BITRATE MULTI-QUALITY ENGINES (VIDCORE.IO, VIDUP.TO, HEXA, VIDORA)
// ============================================================================
async function resolveEncDecSite(input, siteHost, encEndpoint, decEndpoint, proxyProvider, meta = {}) {
  const pagePath = input.type === 'tv'
    ? `tv/${input.id}/${input.season}/${input.episode}/`
    : `movie/${input.id}/`;
  const referer = `${siteHost}/`;
  const origin = siteHost;

  const html = await fetch(`${siteHost}/${pagePath}`, {
    headers: { 'User-Agent': UA, Referer: referer },
    redirect: 'follow',
    signal: AbortSignal.timeout(5500)
  }).then(r => {
    if (!r.ok) throw Error(`${siteHost} HTTP ${r.status}`);
    return r.text();
  });

  const enMatch = html.match(/\\"(?:en|token)\\":\\"(.*?)\\"/);
  const enToken = enMatch?.[1];
  if (!enToken) throw Error(`${siteHost} token missing`);

  const stage1Data = await fetchJsonSafe(
    `https://enc-dec.app/api/${encEndpoint}?text=${encodeURIComponent(enToken)}&stage=1`,
    { timeout: 4500 }
  );
  const p1 = stage1Data?.result;
  if (!p1?.stage1) throw Error(`${siteHost} stage1 failed`);

  const xhrHeaders = {
    'User-Agent': UA,
    Referer: referer,
    Origin: origin,
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (p1.token) xhrHeaders['X-CSRF-Token'] = p1.token;

  const t1 = await fetch(p1.stage1, {
    method: 'POST',
    headers: xhrHeaders,
    signal: AbortSignal.timeout(4800)
  }).then(r => {
    if (!r.ok) throw Error(`${siteHost} stage1 post HTTP ${r.status}`);
    return r.text();
  });

  const stage2Data = await fetchJsonSafe(
    `https://enc-dec.app/api/${encEndpoint}?text=${encodeURIComponent(t1)}&stage=2`,
    { timeout: 4500 }
  );
  const p2 = stage2Data?.result;
  if (!p2?.servers || !p2?.stream) throw Error(`${siteHost} stage2 failed`);

  if (p2.token) xhrHeaders['X-CSRF-Token'] = p2.token;
  else delete xhrHeaders['X-CSRF-Token'];

  const srvEncrypted = await fetch(p2.servers, {
    method: 'POST',
    headers: xhrHeaders,
    signal: AbortSignal.timeout(4800)
  }).then(r => {
    if (!r.ok) throw Error(`${siteHost} servers HTTP ${r.status}`);
    return r.text();
  });

  const srvDec = await fetchJsonSafe(`https://enc-dec.app/api/${decEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: srvEncrypted }),
    timeout: 4500
  });
  const serverList = Array.isArray(srvDec?.result) ? srvDec.result.filter(s => s?.data) : [];
  if (!serverList.length) throw Error(`${siteHost} returned no servers`);

  for (const srv of serverList.slice(0, 3)) {
    try {
      const streamEnc = await fetch(`${p2.stream}/${srv.data}`, {
        method: 'POST',
        headers: xhrHeaders,
        signal: AbortSignal.timeout(4800)
      }).then(r => (r.ok ? r.text() : ''));
      if (!streamEnc) continue;

      const streamDec = await fetchJsonSafe(`https://enc-dec.app/api/${decEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: streamEnc }),
        timeout: 4500
      });
      const resObj = streamDec?.result;
      const streamUrl = resObj?.url || resObj?.file || resObj?.playlist;
      if (typeof streamUrl === 'string' && /^https:\/\//i.test(streamUrl)) {
        const streamHeaders = resObj?.noReferrer ? {} : { Referer: referer, Origin: origin };
        // Manifest & episode runtime verification so wrong TV episodes or broadcast cuts are rejected immediately
        const check = await fetch(streamUrl, {
          headers: { 'User-Agent': UA, ...streamHeaders },
          signal: AbortSignal.timeout(3800)
        });
        if (!check.ok) {
          check.body?.cancel?.().catch(() => {});
          continue;
        }
        const headText = await check.text();
        if (!headText.trimStart().startsWith('#EXTM3U')) continue;
        const timing = await inspectHlsTiming(streamUrl, streamHeaders, headText);
        if (!verifyStreamRuntimeByDur(input, timing.durationSec, meta, true)) {
          continue;
        }
        const resMatches = [...headText.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)];
        const maxH = resMatches.reduce((mx, m) => Math.max(mx, Number(m[2]) || 0, Number(m[1]) >= 3200 ? 2160 : Number(m[1]) >= 1800 ? 1080 : Number(m[1]) >= 1200 ? 720 : 0), 0);
        const score = maxH >= 2000 ? 145 : maxH >= 1000 ? 135 : maxH >= 700 ? 105 : 85;
        return {
          url: streamUrl,
          kind: 'hls',
          codec: 'h264',
          score,
          durationSec: timing.durationSec,
          fps: timing.fps,
          headers: streamHeaders,
          tracks: mapSourceTracks(resObj?.tracks || [], proxyProvider, referer),
          qualityStreams: []
        };
      }
    } catch {}
  }
  throw Error(`${siteHost} had no live stream`);
}

let hexaCapState = { token: '', usesLeft: 0, expiresAt: 0, inflight: null };

async function getHexaCapToken() {
  if (hexaCapState.token && hexaCapState.usesLeft > 0 && Date.now() < hexaCapState.expiresAt) {
    hexaCapState.usesLeft--;
    return hexaCapState.token;
  }
  if (hexaCapState.inflight) return hexaCapState.inflight;
  hexaCapState.inflight = (async () => {
    try {
      const chHeaders = { Origin: 'https://hexa.su', Referer: 'https://hexa.su/', 'User-Agent': UA };
      const challenge = await fetchJsonSafe('https://cap.hexa.su/15d2cf0395/challenge', {
        method: 'POST',
        headers: chHeaders,
        timeout: 4500
      });
      const solved = await fetchJsonSafe('https://enc-dec.app/api/enc-hexa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_data: challenge }),
        timeout: 4800
      });
      if (!solved?.result) throw Error('Hexa PoW solve failed');
      const redeemed = await fetchJsonSafe('https://cap.hexa.su/15d2cf0395/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...chHeaders },
        body: JSON.stringify(solved.result),
        timeout: 4500
      });
      if (!redeemed?.token) throw Error('Hexa token redeem failed');
      hexaCapState = {
        token: redeemed.token,
        usesLeft: 16,
        expiresAt: Date.now() + 8 * 60_000,
        inflight: null
      };
      return redeemed.token;
    } finally {
      hexaCapState.inflight = null;
    }
  })();
  return hexaCapState.inflight;
}

async function resolveHexaStream(input, proxyProvider, meta = {}) {
  const capToken = await getHexaCapToken();
  const key = crypto.randomBytes(32).toString('hex');
  const apiUrl = input.type === 'tv'
    ? `https://theemoviedb.hexa.su/api/tmdb/tv/${input.id}/season/${input.season}/episode/${input.episode}/images`
    : `https://theemoviedb.hexa.su/api/tmdb/movie/${input.id}/images`;

  const encrypted = await fetch(apiUrl, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://hexa.su/',
      Accept: 'text/plain',
      'X-Fingerprint-Lite': 'e9136c41504646444',
      'X-Cap-Token': capToken,
      'X-Api-Key': key
    },
    signal: AbortSignal.timeout(5000)
  }).then(r => {
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) hexaCapState.usesLeft = 0;
      throw Error(`Hexa HTTP ${r.status}`);
    }
    return r.text();
  });

  const dec = await fetchJsonSafe('https://enc-dec.app/api/dec-hexa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encrypted, key }),
    timeout: 4500
  });
  const sources = Array.isArray(dec?.result?.sources) ? dec.result.sources.filter(s => s?.url && /^https:\/\//i.test(s.url)) : [];
  if (!sources.length) throw Error('Hexa returned no sources');

  const preferredOrder = ['alpha', 'charlie', 'bravo', 'delta', 'foxtrot'];
  sources.sort((a, b) => {
    const ia = preferredOrder.indexOf(String(a.server || '').toLowerCase());
    const ib = preferredOrder.indexOf(String(b.server || '').toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const streamHeaders = { Referer: 'https://hexa.su/', Origin: 'https://hexa.su' };
  const verified = await Promise.all(sources.slice(0, 3).map(async s => {
    try {
      const r = await fetch(s.url, {
        headers: { 'User-Agent': UA, ...streamHeaders },
        signal: AbortSignal.timeout(3800)
      });
      if (!r.ok) return null;
      const txt = await r.text();
      if (!txt.trimStart().startsWith('#EXTM3U')) return null;
      const timing = await inspectHlsTiming(s.url, streamHeaders, txt);
      if (!verifyStreamRuntimeByDur(input, timing.durationSec, meta, true)) return null;
      const resMatches = [...txt.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)];
      const maxH = resMatches.reduce((mx, m) => Math.max(mx, Number(m[2]) || 0, Number(m[1]) >= 1800 ? 1080 : Number(m[1]) >= 1200 ? 720 : 0), 0);
      const score = maxH >= 1000 ? 122 : maxH >= 700 ? 96 : resMatches.length ? 65 : 50;
      return { url: s.url, score, durationSec: timing.durationSec, fps: timing.fps };
    } catch { return null; }
  }));

  const best = verified.filter(Boolean).sort((a, b) => b.score - a.score)[0];
  if (!best) throw Error('Hexa playlists unreachable');

  return {
    url: best.url,
    kind: 'hls',
    codec: 'h264',
    score: best.score,
    durationSec: best.durationSec,
    fps: best.fps,
    headers: streamHeaders,
    tracks: [],
    qualityStreams: []
  };
}

function scoreVidoraCandidate(cand) {
  if (!cand?.url) return 0;
  const u = cand.url.toLowerCase();
  if (Array.isArray(cand.qualities) && cand.qualities.length >= 2) return 112;
  // Multi-bitrate VidSpark primary (.urlset/master.m3u8 on paretocdn / workerscloud) is genuine 1080p + 720p H.264!
  if (cand.sourceKey === 'vidspark' || u.includes('.urlset/master.m3u8') || u.includes('paretocdn.') || u.includes('workerscloud')) return 110;
  if (u.includes('hd4u.') || cand.sourceKey === 'w7dn' || cand.sourceKey === 'fq1k') return 100;
  if (u.includes('majorplay.') || cand.sourceKey === 'nzv4') return 85;
  if (u.includes('followguchimany.workers.dev')) return 30;
  if (/\/(?:480|360|240)\//.test(u)) return 20;
  if (u.includes('hscow.') || cand.sourceKey === 'vjej') return 60;
  return 55;
}

async function fetchVidsparkPrimary(input, meta = {}) {
  const path = mediaPathFor(input);
  let d = null;
  try {
    d = await fetchJsonSafe(`https://vidspark.to/api/vidora/v1/${path}`, {
      headers: { 'x-player-key': vidsparkPrimaryKey, Referer: `https://vidspark.to/${path}` },
      timeout: 4500
    });
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      const fresh = await refreshVidoraKey('primary');
      d = await fetchJsonSafe(`https://vidspark.to/api/vidora/v1/${path}`, {
        headers: { 'x-player-key': fresh, Referer: `https://vidspark.to/${path}` },
        timeout: 4500
      });
    } else {
      throw err;
    }
  }
  if (!sameImdbId(meta?.imdbId, d?.imdb_id)) throw Error('VidSpark IMDb mismatch');
  const validSources = (d?.sources || []).filter(s => s?.url && /^https:\/\//i.test(s.url));
  if (!validSources.length) throw Error('VidSpark primary unavailable');
  const streamHeaders = { Referer: 'https://vidspark.to/', Origin: 'https://vidspark.to' };
  const kind = /\.mp4(?:\?|$)/i.test(validSources[0].url) && !/\.m3u8|proxy/i.test(validSources[0].url) ? 'mp4' : 'hls';
  const timing = await inspectStreamTiming(validSources[0].url, streamHeaders, kind);
  if (!verifyStreamRuntimeByDur(input, timing.durationSec, meta, true)) {
    throw Error('VidSpark runtime mismatch');
  }
  const primary = {
    sourceKey: 'vidspark',
    imdbId: d?.imdb_id || '',
    url: validSources[0].url,
    kind,
    durationSec: timing.durationSec,
    fps: timing.fps,
    headers: streamHeaders,
    tracks: Array.isArray(validSources[0].tracks) ? validSources[0].tracks : [],
    qualities: Array.isArray(validSources[0].qualities) ? validSources[0].qualities : [],
    sources: validSources
  };
  primary.score = scoreVidoraCandidate(primary);
  return primary;
}

async function queryVidoraSource(host, path, sourceKey, refererBase, timeout = 4400, input = null, meta = {}) {
  const endpoint = `${host}/api/vidora/v1/${path}?source=${encodeURIComponent(sourceKey)}`;
  let data = null;
  try {
    data = await fetchJsonSafe(endpoint, {
      headers: { 'x-player-key': vidoraCdnKey, Referer: `${refererBase}/${path}` },
      timeout
    });
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      const fresh = await refreshVidoraKey('cdn');
      data = await fetchJsonSafe(endpoint, {
        headers: { 'x-player-key': fresh, Referer: `${refererBase}/${path}` },
        timeout
      });
    } else {
      throw err;
    }
  }
  if (!sameImdbId(meta?.imdbId, data?.imdb_id)) throw Error(`${sourceKey} IMDb mismatch`);
  const srcObj = data?.sources?.find(s => s?.url && /^https:\/\//i.test(s.url));
  if (!srcObj) throw Error(`${sourceKey} unavailable`);
  const streamHeaders = { Referer: `${refererBase}/`, Origin: refererBase };
  const kind = /\.mp4(?:\?|$)/i.test(srcObj.url) && !/\.m3u8|proxy/i.test(srcObj.url) ? 'mp4' : 'hls';
  const timing = input ? await inspectStreamTiming(srcObj.url, streamHeaders, kind) : { durationSec: -1, fps: 0 };
  if (input && !verifyStreamRuntimeByDur(input, timing.durationSec, meta, true)) {
    throw Error(`${sourceKey} runtime mismatch`);
  }
  const cand = {
    sourceKey,
    imdbId: data.imdb_id || '',
    url: srcObj.url,
    kind,
    durationSec: timing.durationSec,
    fps: timing.fps,
    headers: streamHeaders,
    tracks: Array.isArray(srcObj.tracks) ? srcObj.tracks : [],
    qualities: Array.isArray(srcObj.qualities) ? srcObj.qualities : []
  };
  cand.score = scoreVidoraCandidate(cand);
  return cand;
}

async function mergeCleanMultiAudio(
  primaryUrl,
  primaryProxy,
  primaryHeaders,
  rawAudioList,
  input,
  meta,
  primaryKind = 'hls',
  knownPrimaryDurationSec = -1
) {
  const origLang = String(meta?.originalLanguage || meta?.spokenLanguages?.[0]?.code || '').toLowerCase();
  const byLabel = new Map();

  const [primaryTiming, ewBundle] = await Promise.all([
    knownPrimaryDurationSec > 0 ? Promise.resolve({durationSec:knownPrimaryDurationSec,fps:0}) : inspectStreamTiming(primaryUrl,primaryHeaders,primaryKind),
    fetchEmbedWaveBundle(input,meta).catch(()=>null)
  ]);
  const primaryDurSec = primaryTiming.durationSec;
  if (primaryUrl) {
    const origLabel = origLang ? readableLanguage(origLang) : 'Original audio';
    byLabel.set(origLabel, { language: origLang || 'und', label: origLabel, url: primaryUrl,
      kind: primaryKind || 'hls', codec: 'h264', durationSec: primaryDurSec,
      fps: primaryTiming.fps || 0, proxyProvider: primaryProxy, headers: primaryHeaders || {} });
  }

  for (const [idx, s] of (rawAudioList || []).entries()) {
    const u = s?.url;
    if (!u || !/^https:\/\//i.test(u) || isMarkedUnofficial([s.label,s.name,s.language,s.lang].filter(Boolean).join(' '))) continue;
    const cleaned = cleanLanguageOnlyLabel(s.label || s.name || '', s.language || s.lang || '', origLang);
    const label = cleaned?.label || (idx === 0 ? (origLang ? readableLanguage(origLang) : 'Original audio') : null);
    if (!label || byLabel.has(label)) continue;
    const sKind = s.kind || (/\.mp4(?:\?|$)/i.test(u) && !/\.m3u8|proxy/i.test(u) ? 'mp4' : 'hls');
    let sDur = Number(s.durationSec) > 0 ? Number(s.durationSec) : (u === primaryUrl ? primaryDurSec : -1);
    if (u !== primaryUrl && primaryDurSec > 300) {
      if (!(sDur > 0)) sDur = (await inspectStreamTiming(u, s.headers || primaryHeaders || {}, sKind)).durationSec;
      if (!verifyDubDurationMatch(sDur, primaryDurSec, input, meta, s._scraper || '')) continue;
    }
    byLabel.set(label, {
      language: cleaned?.code || s.language || s.lang || origLang || 'und',
      label,
      url: u,
      kind: sKind,
      codec: s.codec || 'h264',
      durationSec: sDur,
      ...(s.audioLang ? { audioLang: s.audioLang } : {}),
      proxyProvider: s.proxyProvider || primaryProxy,
      headers: s.headers || primaryHeaders || {}
    });
  }

  for (const a of ewBundle?.audioStreams || []) {
    if (a.url !== primaryUrl && !verifyDubDurationMatch(a.durationSec,primaryDurSec,input,meta,a._scraper || '')) continue;
    const existing=byLabel.get(a.label);
    if (existing && (existing.url===primaryUrl || !INDIAN_LANG_CODES.has(a.language) || a._scraper==='awsind')) continue;
    byLabel.set(a.label,a);
  }

  return byLabel.size > 1 ? [...byLabel.values()] : [];
}

// ============================================================================
// 1. VidCore (DEFAULT) — 4K / 1080p / 720p / 480p H.264 Multi-Quality
// ============================================================================
async function resolveVidcore(input, meta = {}) {
  const origLang = String(meta?.originalLanguage || '').toLowerCase();

  // Start both providers concurrently. Once a verified source arrives, allow
  // a short quality-comparison window instead of blocking playback on a slow
  // secondary provider; if the first failed, still wait for the other one.
  const vcTask = resolveEncDecSite(input, 'https://vidcore.io', 'enc-vidcore', 'dec-vidcore', 'vidcore', meta)
    .catch(() => null).then(value => ({ key: 'vc', value }));
  const vsTask = fetchVidsparkPrimary(input, meta)
    .catch(() => null).then(value => ({ key: 'vs', value }));
  const first = await Promise.race([vcTask, vsTask]);
  const otherTask = first.key === 'vc' ? vsTask : vcTask;
  const second = first.value
    ? await Promise.race([otherTask, new Promise(r => setTimeout(() => r(null), 700))])
    : await otherTask;
  const entries = [first, second].filter(Boolean);
  const vcDirect = entries.find(e => e.key === 'vc')?.value || null;
  const vsPrimary = entries.find(e => e.key === 'vs')?.value || null;

  let chosen = [vcDirect, vsPrimary].filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
  if (!chosen) {
    const path = mediaPathFor(input);
    const fallbacks = await Promise.all([
      queryVidoraSource('https://cdn.vidspark.to', path, 'w7dn', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null),
      queryVidoraSource('https://cdn.vidspark.to', path, 'fq1k', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null),
      queryVidoraSource('https://cdn.vidspark.to', path, 'vjej', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null)
    ]);
    chosen = fallbacks.filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
  }
  if (!chosen) {
    const hx = await resolveHexaStream(input, 'vidcore', meta).catch(() => null);
    if (hx) chosen = hx;
  }

  if (!chosen) throw Error('VidCore has no playable stream for this title right now.');

  const rawAudio = [];
  if (vsPrimary?.sources?.length > 1) {
    for (const [idx, s] of vsPrimary.sources.entries()) {
      rawAudio.push({
        language: s.lang || s.language || (idx === 0 ? (origLang || 'und') : ''),
        label: s.label || s.name || '',
        url: s.url,
        proxyProvider: 'vidcore',
        headers: { Referer: 'https://vidspark.to/', Origin: 'https://vidspark.to' }
      });
    }
  }

  const inlineTracks = Array.isArray(chosen.tracks) && chosen.tracks[0]?.proxyProvider
    ? chosen.tracks
    : mapSourceTracks(chosen.tracks || [], 'vidcore', chosen.headers?.Referer || 'https://vidcore.io/');
  const imdbId = vsPrimary?.imdbId || chosen?.imdbId || meta?.imdbId || '';
  const [tracks, audioStreams] = await Promise.all([
    resolveSyncedSubtitles(input, { ...meta, imdbId }, inlineTracks, chosen.url, chosen.headers || {}, 'vidcore', chosen.durationSec || -1, chosen.fps || 0),
    mergeCleanMultiAudio(chosen.url, 'vidcore', chosen.headers || {}, rawAudio, input, { ...meta, imdbId }, chosen.kind || 'hls', chosen.durationSec || -1)
  ]);

  return {
    url: chosen.url,
    kind: chosen.kind || 'hls',
    codec: chosen.codec || 'h264',
    durationSec: chosen.durationSec || -1, fps: chosen.fps || 0,
    audioLang: chosen.parsedLang?.code || '', audioLabel: chosen.parsedLang?.label || '',
    headers: chosen.headers || {},
    tracks,
    audioStreams,
    qualityStreams: mapSourceQualities(chosen.qualities || [], 'vidcore', chosen.headers || {}),
    provider: 'VidCore',
    sourceKey: 'vidcore',
    proxyProvider: 'vidcore',
    server: 'VidCore'
  };
}

async function resolveEmbedWave(input, meta = {}) {
  const bundle = await fetchEmbedWaveBundle(input, meta);
  let chosen = bundle?.primary || null;
  let proxyProv = 'embedwave';

  if (!chosen) {
    const csBackup = input.type === 'tv' ? await resolveCinesrcDirect(input, meta).catch(() => null) : null;
    const hxBackup = !csBackup ? await resolveHexaStream(input, 'embedwave', meta).catch(() => null) : null;
    const alt = csBackup || hxBackup;
    if (alt) {
      proxyProv = csBackup ? 'cinesrc' : 'embedwave';
      chosen = { url: alt.url, kind: alt.kind || 'hls', headers: alt.headers || {}, tracks: alt.tracks || [], durationSec: alt.durationSec || -1, fps: alt.fps || 0 };
    }
  }

  if (!chosen) throw Error('EmbedWave has no playable stream for this title right now.');

  const verifiedAudio = (bundle?.audioStreams || []).filter(a =>
    a.url === chosen.url || verifyDubDurationMatch(a.durationSec, chosen.durationSec || -1, input, meta, a._scraper || '')
  );

  const tracks = await resolveSyncedSubtitles(
    input,
    meta,
    chosen.tracks || [],
    chosen.url,
    chosen.headers || {},
    proxyProv,
    chosen.durationSec || -1,
    chosen.fps || 0
  );

  return {
    url: chosen.url,
    kind: chosen.kind || 'hls',
    codec: chosen.codec || 'h264',
    durationSec: chosen.durationSec || -1, fps: chosen.fps || 0,
    audioLang: chosen.parsedLang?.code || '', audioLabel: chosen.parsedLang?.label || '',
    headers: chosen.headers || {},
    tracks,
    audioStreams: verifiedAudio.length > 1 ? verifiedAudio : [],
    qualityStreams: [],
    provider: 'EmbedWave',
    sourceKey: 'embedwave',
    proxyProvider: proxyProv,
    server: 'EmbedWave'
  };
}

const vidlinkEncCache = new Map();
let sharedPlaywrightBrowser = null;

async function getVidlinkEncryptedId(tmdbId) {
  const key = String(tmdbId);
  const hit = vidlinkEncCache.get(key);
  if (hit && Date.now() - hit.time < 6 * 3600_000) return hit.token;
  const d = await fetchJsonSafe(`https://enc-dec.app/api/enc-vidlink?text=${encodeURIComponent(key)}`, { timeout: 5000 });
  const token = typeof d?.result === 'string' && d.result.length > 8 ? d.result : null;
  if (token) {
    vidlinkEncCache.set(key, { token, time: Date.now() });
    if (vidlinkEncCache.size > 500) vidlinkEncCache.delete(vidlinkEncCache.keys().next().value);
  }
  return token;
}

async function fetchVidlinkViaPlaywright({ type, id, season, episode }) {
  const { chromium } = await import('playwright');
  if (!sharedPlaywrightBrowser || !sharedPlaywrightBrowser.isConnected()) {
    sharedPlaywrightBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  const pageUrl = type === 'tv' ? `https://vidlink.pro/tv/${id}/${season}/${episode}` : `https://vidlink.pro/movie/${id}`;
  const context = await sharedPlaywrightBrowser.newContext({
    userAgent: UA,
    extraHTTPHeaders: { 'X-Playback-Environment': 'hls' }
  });
  const page = await context.newPage();
  try {
    await page.route('**/*', route => {
      const u = route.request().url();
      const rt = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(rt) || /yandex|clarity|google|analytics|doubleclick|mercury|venus|rapidad|intellipopup/i.test(u)) {
        return route.abort();
      }
      return route.continue();
    });
    const apiPromise = page.waitForResponse(r => r.url().includes('/api/b/') && r.status() === 200, { timeout: 14_000 });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 14_000 });
    const res = await apiPromise;
    return await res.json();
  } finally {
    await context.close().catch(() => {});
  }
}

function tierNumberFromKey(rawKey, valueObj = {}) {
  const k = String(rawKey || '').toLowerCase();
  if (k.includes('4k') || k.includes('2160') || k.includes('uhd')) return 2160;
  if (k.includes('2k') || k.includes('1440') || k.includes('qhd')) return 1440;
  const digits = Number(k.replace(/\D/g, '')) || Number(valueObj?.height) || 0;
  if (digits >= 2000) return 2160;
  if (digits >= 1350) return 1440;
  if (digits >= 1000) return 1080;
  if (digits >= 680) return 720;
  if (digits >= 440) return 480;
  if (digits >= 320) return 360;
  return digits > 0 ? 240 : 0;
}

function parseVidlinkStreamPayload(payload) {
  const stream = payload?.stream;
  if (!stream) return null;

  const captions = (Array.isArray(stream.captions) ? stream.captions : [])
    .filter(c => c?.url && /^https:\/\//i.test(c.url))
    .map(c => ({
      src: c.url,
      language: c.language || c.srclang || 'und',
      label: c.language || c.label || '',
      proxyProvider: 'vidlink',
      headers: {}
    }));

  const audioStreams = [];
  const rawDubs = payload?.dubs || stream?.dubs || stream?.audioTracks || payload?.audioTracks;
  if (Array.isArray(rawDubs)) {
    for (const dub of rawDubs) {
      const dubUrl = dub?.playlist || dub?.url || dub?.file;
      if (!dubUrl || !/^https:\/\//i.test(dubUrl)) continue;
      audioStreams.push({
        language: dub.language || dub.lang || 'und',
        label: readableLanguage(dub.language || dub.lang, dub.label || dub.name),
        url: dubUrl,
        proxyProvider: 'vidlink',
        headers: dub.headers || stream.playlistHeaders || {}
      });
    }
  }

  if (typeof stream.playlist === 'string' && /^https:\/\//i.test(stream.playlist) && (stream.type === 'hls' || /\.m3u8/i.test(stream.playlist))) {
    const playlistHeaders = stream.playlistHeaders && typeof stream.playlistHeaders === 'object'
      ? stream.playlistHeaders
      : { Referer: 'https://vidlink.pro/', Origin: 'https://vidlink.pro' };
    return {
      url: stream.playlist,
      kind: 'hls',
      codec: 'h264',
      headers: playlistHeaders,
      captions,
      audioStreams,
      qualityStreams: []
    };
  }

  if (typeof stream.playlist === 'string' && /^https:\/\//i.test(stream.playlist) && (stream.type === 'dash' || /\.mpd(?:\?|$)/i.test(stream.playlist))) {
    const u = new URL(stream.playlist);
    const cookie = stream.playlistHeaders?.Cookie || stream.playlistHeaders?.cookie || '';
    let dashTarget = stream.playlist;
    if (/\.hakunaymatata\.com$/i.test(u.hostname)) {
      const sub = u.hostname.split('.')[0];
      const sc = cookie ? Buffer.from(cookie, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_') : '';
      dashTarget = `https://surge.flooderrr.store/${sub}${u.pathname}?host=${encodeURIComponent(u.origin)}${sc ? `&sc=${sc}` : ''}`;
    }
    const isHevc = /hevc|h265|x265|hev1|hvc1/i.test(String(stream.playbackMetadata?.codecName || stream.playlist));
    return {
      url: dashTarget,
      kind: 'dash',
      codec: isHevc ? 'hevc' : 'h264',
      headers: { Referer: 'https://vidlink.pro/', Origin: 'https://vidlink.pro' },
      captions,
      audioStreams,
      qualityStreams: []
    };
  }

  const qualitiesObj = stream.qualities && typeof stream.qualities === 'object' ? stream.qualities : {};
  const qualityStreams = [];
  for (const [key, val] of Object.entries(qualitiesObj)) {
    const qUrl = typeof val === 'string' ? val : val?.url;
    if (!qUrl || !/^https:\/\//i.test(qUrl) || /\.hakunaymatata\.com$/i.test(new URL(qUrl).hostname)) continue;
    const tier = tierNumberFromKey(key, val);
    if (!tier) continue;
    const isHevc = /hevc|h265|x265|hev1|hvc1/i.test(String(val?.codecName || val?.codec || qUrl));
    qualityStreams.push({
      tier,
      height: tier,
      url: qUrl,
      kind: 'mp4',
      codec: isHevc ? 'hevc' : 'h264',
      proxyProvider: 'vidlink',
      headers: { Referer: 'https://vidlink.pro/' }
    });
  }
  if (!qualityStreams.length) return null;

  qualityStreams.sort((a, b) => (b.tier - a.tier) || ((a.codec === 'h264' ? 0 : 1) - (b.codec === 'h264' ? 0 : 1)));
  const bestH264 = qualityStreams.find(q => q.codec === 'h264');
  const defaultPick = bestH264 || qualityStreams[0];

  return {
    url: defaultPick.url,
    kind: 'mp4',
    codec: defaultPick.codec,
    headers: { Referer: 'https://vidlink.pro/' },
    captions,
    audioStreams,
    qualityStreams
  };
}

async function resolveVidlink(input, meta = {}) {
  let parsed = null;
  const enc = await getVidlinkEncryptedId(input.id).catch(() => null);
  const pageRef = input.type === 'tv'
    ? `https://vidlink.pro/tv/${input.id}/${input.season}/${input.episode}`
    : `https://vidlink.pro/movie/${input.id}`;

  if (enc) {
    const baseApi = input.type === 'tv'
      ? `https://vidlink.pro/api/b/tv/${enc}/${input.season}/${input.episode}`
      : `https://vidlink.pro/api/b/movie/${enc}`;
    const [webkitData, hlsData] = await Promise.all([
      fetchJsonSafe(`${baseApi}?multiLang=0`, {
        headers: { Referer: pageRef, Origin: 'https://vidlink.pro', 'X-Playback-Environment': 'webkit' },
        timeout: 7000
      }).catch(() => null),
      fetchJsonSafe(`${baseApi}?multiLang=1`, {
        headers: { Referer: pageRef, Origin: 'https://vidlink.pro', 'X-Playback-Environment': 'hls' },
        timeout: 7000
      }).catch(() => null)
    ]);

    const pWebkit = parseVidlinkStreamPayload(webkitData);
    const pHls = parseVidlinkStreamPayload(hlsData);

    if (pHls?.kind === 'hls') {
      parsed = { ...pHls, captions: [...pHls.captions, ...(pWebkit?.captions || [])] };
    } else if (pWebkit) {
      parsed = { ...pWebkit, captions: [...pWebkit.captions, ...(pHls?.captions || [])] };
    } else {
      parsed = pHls;
    }
  } else {
    const pwData = await fetchVidlinkViaPlaywright(input).catch(() => null);
    parsed = parseVidlinkStreamPayload(pwData);
  }

  // Verify VidLink stream runtime against TMDB metadata so wrong movies/episodes never slip through
  let parsedTiming = { durationSec: -1, fps: 0 };
  if (parsed && parsed.kind !== 'dash') {
    parsedTiming = await inspectStreamTiming(parsed.url, parsed.headers || {}, parsed.kind);
    if (!verifyStreamRuntimeByDur(input, parsedTiming.durationSec, meta, true)) {
      parsed = null;
      parsedTiming = { durationSec: -1, fps: 0 };
    }
  }

  // Ensure universal H.264 1080p compatibility when VidLink payload is HEVC-only or unavailable
  let proxyProv = 'vidlink';
  if (!parsed || parsed.codec === 'hevc') {
    if (input.type === 'tv') {
      const csTv = await resolveCinesrcDirect(input, meta).catch(() => null);
      const vsTv = !csTv ? await fetchVidsparkPrimary(input, meta).catch(() => null) : null;
      const accurateTv = csTv || vsTv;
      if (accurateTv) {
        proxyProv = csTv ? 'cinesrc' : 'vidcore';
        parsedTiming = { durationSec: accurateTv.durationSec || -1, fps: accurateTv.fps || 0 };
        parsed = {
          url: accurateTv.url,
          kind: accurateTv.kind || 'hls',
          codec: 'h264',
          headers: accurateTv.headers || {},
          captions: [...(parsed?.captions || []), ...(accurateTv.tracks || [])],
          audioStreams: parsed?.audioStreams || [],
          qualityStreams: mapSourceQualities(accurateTv.qualities || [], proxyProv, accurateTv.headers || {})
        };
      }
    }
    if (!parsed || parsed.codec === 'hevc') {
      const hexaH264 = await resolveHexaStream(input, 'vidlink', meta).catch(() => null);
      if (hexaH264) {
        parsedTiming = { durationSec: hexaH264.durationSec || -1, fps: hexaH264.fps || 0 };
        parsed = {
          url: hexaH264.url,
          kind: 'hls',
          codec: 'h264',
          headers: hexaH264.headers,
          captions: parsed?.captions || [],
          audioStreams: parsed?.audioStreams || [],
          qualityStreams: []
        };
      }
    }
  }

  if (!parsed) throw Error('VidLink has no playable stream for this title right now.');

  const [tracks, audioStreams] = await Promise.all([
    resolveSyncedSubtitles(input, meta, parsed.captions || [], parsed.url, parsed.headers || {}, proxyProv, parsedTiming.durationSec, parsedTiming.fps),
    mergeCleanMultiAudio(parsed.url, proxyProv, parsed.headers || {}, parsed.audioStreams || [], input, meta, parsed.kind || 'hls', parsedTiming.durationSec)
  ]);

  return {
    url: parsed.url,
    kind: parsed.kind,
    codec: parsed.codec || 'h264',
    durationSec: parsedTiming.durationSec || -1, fps: parsedTiming.fps || 0,
    headers: parsed.headers,
    tracks,
    audioStreams,
    qualityStreams: parsed.qualityStreams || [],
    provider: 'VidLink',
    sourceKey: 'vidlink',
    proxyProvider: proxyProv,
    server: 'VidLink'
  };
}

// ============================================================================
// 3. VidSrc — 1080p / 720p Multi-Quality H.264 (VidUp 4K/1080p + Vidora + Hexa)
// ============================================================================
async function resolveVidsrc(input, meta = {}) {
  let chosen = null;
  if (input.type === 'tv') {
    const [vu, cs, vs] = await Promise.all([
      resolveEncDecSite(input, 'https://vidup.to', 'enc-vidup', 'dec-vidup', 'vidsrc', meta).catch(() => null),
      resolveCinesrcDirect(input, meta).then(r => r ? { ...r, score: 1090 } : null).catch(() => null),
      fetchVidsparkPrimary(input, meta).then(r => r ? { ...r, score: 900 } : null).catch(() => null)
    ]);
    chosen = [vu, cs, vs].filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    if (!chosen) {
      const path = mediaPathFor(input);
      chosen = await queryVidoraSource('https://cdn.vidspark.to', path, 'w7dn', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null);
    }
    if (!chosen) {
      const hx = await resolveHexaStream(input, 'vidsrc', meta).catch(() => null);
      if (hx) chosen = hx;
    }
  } else {
    const [hexaRes, vu] = await Promise.all([
      resolveHexaStream(input, 'vidsrc', meta).catch(() => null),
      resolveEncDecSite(input, 'https://vidup.to', 'enc-vidup', 'dec-vidup', 'vidsrc', meta).catch(() => null)
    ]);
    chosen = [vu, hexaRes].filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    if (!chosen) {
      const path = mediaPathFor(input);
      const fallbacks = await Promise.all([
        fetchVidsparkPrimary(input, meta).catch(() => null),
        queryVidoraSource('https://cdn.vidspark.to', path, 'w7dn', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null),
        queryVidoraSource('https://cdn.vidspark.to', path, 'fq1k', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null),
        queryVidoraSource('https://cdn.vidspark.to', path, 'vjej', 'https://cdn.vidspark.to', 4000, input, meta).catch(() => null)
      ]);
      chosen = fallbacks.filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    }
  }

  if (!chosen) throw Error('VidSrc has no playable stream for this title right now.');

  const inlineTracks = Array.isArray(chosen.tracks) && chosen.tracks[0]?.proxyProvider
    ? chosen.tracks
    : mapSourceTracks(chosen.tracks || [], 'vidsrc', chosen.headers?.Referer || 'https://vidup.to/');
  const [tracks, audioStreams] = await Promise.all([
    resolveSyncedSubtitles(input, meta, inlineTracks, chosen.url, chosen.headers || {}, 'vidsrc', chosen.durationSec || -1, chosen.fps || 0),
    mergeCleanMultiAudio(chosen.url, 'vidsrc', chosen.headers || {}, [], input, meta, chosen.kind || 'hls', chosen.durationSec || -1)
  ]);

  return {
    url: chosen.url,
    kind: chosen.kind || 'hls',
    codec: chosen.codec || 'h264',
    durationSec: chosen.durationSec || -1, fps: chosen.fps || 0,
    audioLang: chosen.parsedLang?.code || '', audioLabel: chosen.parsedLang?.label || '',
    headers: chosen.headers || {},
    tracks,
    audioStreams,
    qualityStreams: mapSourceQualities(chosen.qualities || [], 'vidsrc', chosen.headers || {}),
    provider: 'VidSrc',
    sourceKey: 'vidsrc',
    proxyProvider: 'vidsrc',
    server: 'VidSrc'
  };
}

// ============================================================================
// 4. CineSrc — cinesrc.st (Nebula / Light / Wave 1080p + 720p fMP4 H.264)
// ============================================================================
const CINESRC_K = new Uint32Array([
  0x46C6C721, 0x4230C311, 0x18223A1D, 0x56389BA7,
  0xD4A87103, 0x07CB9E2F, 0x73085F9D, 0xD2396A1F,
  0x23AE5ADD, 0x4646C48F, 0x0F4E0903, 0x808F5F31,
  0x953D4E07, 0x7E238FFF, 0x634595DF, 0xCB5E4301
]);
const CINESRC_PERMS = [
  [3, 5, 1, 0, 2, 4], [2, 0, 4, 5, 3, 1], [1, 4, 5, 3, 0, 2], [2, 0, 1, 5, 4, 3],
  [4, 2, 1, 0, 3, 5], [5, 0, 2, 1, 3, 4], [4, 5, 1, 0, 3, 2], [4, 0, 3, 5, 1, 2]
];
const CINESRC_SCHEDS = [
  [0, 7, 6, 3, 2, 1, 5, 4, 0, 2, 4, 6, 5, 1, 7, 3],
  [5, 2, 1, 3, 0, 4, 6, 7, 4, 1, 0, 7, 3, 6, 5, 2],
  [4, 0, 2, 1, 5, 7, 6, 3, 2, 6, 0, 7, 4, 3, 5, 1],
  [5, 4, 7, 0, 2, 3, 1, 6, 5, 1, 4, 0, 7, 2, 3, 6],
  [4, 7, 0, 2, 1, 6, 5, 3, 6, 1, 3, 2, 0, 7, 4, 5],
  [0, 7, 2, 6, 3, 4, 5, 1, 6, 5, 0, 2, 7, 1, 4, 3],
  [0, 4, 5, 3, 1, 7, 2, 6, 3, 7, 5, 6, 1, 0, 2, 4],
  [7, 6, 0, 4, 2, 5, 1, 3, 7, 5, 3, 4, 2, 6, 0, 1]
];
const csU32 = x => x >>> 0;
const csRotl = (x, n) => { x >>>= 0; n &= 31; return n === 0 ? x : ((x << n) | (x >>> (32 - n))) >>> 0; };
const csImul = (a, b) => Math.imul(a, b) >>> 0;

let cinesrcBuildId = '20261014-a';
let cinesrcBuildRefreshAt = 0;

async function refreshCinesrcBuildId() {
  if (Date.now() - cinesrcBuildRefreshAt < 60_000) return cinesrcBuildId;
  cinesrcBuildRefreshAt = Date.now();
  try {
    const html = await fetch('https://cinesrc.st/embed/movie/533535', {
      headers: { 'User-Agent': UA, Referer: 'https://cinesrc.st/' },
      signal: AbortSignal.timeout(4500)
    }).then(r => r.text());
    const chunks = [...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map(m => m[0]);
    for (const ch of chunks) {
      const js = await fetch('https://cinesrc.st' + ch, {
        headers: { 'User-Agent': UA, Referer: 'https://cinesrc.st/' },
        signal: AbortSignal.timeout(4500)
      }).then(r => r.text());
      const m = js.match(/202\d{5}-[a-z0-9]+/);
      if (m?.[0]) {
        cinesrcBuildId = m[0];
        break;
      }
    }
  } catch {}
  return cinesrcBuildId;
}

function solveCinesrcStage1(data, seedHex) {
  const c = Buffer.from(data.w, 'base64url');
  if (c.length !== 32) throw Error('Invalid CineSrc stage1 challenge');
  const w = new Uint32Array(4);
  for (let i = 0; i < 4; i++) w[i] = c.readUInt32LE(i * 4);
  const mode = c[21], diffBits = c[22], vr = c[23], rnd = c[24], mB = c[25], sI = c[26], pI = c[27];
  const size = 1 << mB, mask = size - 1;
  const s = new Uint32Array(size);
  let x = csU32(w[vr & 3] ^ CINESRC_K[sI] ^ csImul(CINESRC_K[8 + sI], vr + 1));
  let y = csU32(w[(vr + 1) & 3] ^ CINESRC_K[15 - sI]);
  for (let i = 0; i < size; i++) {
    x = csU32(w[(i + sI) & 3] + x + csImul(CINESRC_K[(i + vr) & 15], i + 1));
    x = csU32(x ^ (x << 13));
    x = csU32(x ^ (x >>> 17));
    x = csU32(x ^ (x << 5));
    y = csRotl((csImul(CINESRC_K[(i + 9) & 15], i + 3) ^ y ^ x) >>> 0, i + vr + sI);
    s[i] = csU32(csImul(CINESRC_K[(i + 5) & 15], i ^ vr) ^ csRotl(w[(i + vr) & 3], i + sI) ^ x ^ y);
  }
  const msg = Buffer.alloc(88);
  c.copy(msg, 24, 0, 16);
  const cfg = mB ^ 0x6B29;
  Buffer.from([4, mode, vr, sI, pI, rnd, cfg & 0xFF, (cfg >> 8) & 0xFF]).copy(msg, 48);
  Buffer.from(seedHex, 'hex').copy(msg, 56);

  const sch = CINESRC_SCHEDS[sI], perm = CINESRC_PERMS[pI];
  const fullBytes = diffBits >> 3, remBits = diffBits & 7;
  for (let n = 0; n < 25_000_000; n++) {
    const lo = n >>> 0, hi = Math.floor(n / 0x100000000) >>> 0;
    let a = csU32(w[0] ^ CINESRC_K[vr] ^ lo);
    let b = csU32(csRotl(lo, vr + 7) ^ w[2]);
    let cc = csU32(w[1] ^ CINESRC_K[8 + sI] ^ hi);
    let d = csU32(csRotl(lo ^ hi, sI + 11) ^ w[3]);
    let e = csU32(CINESRC_K[sI + vr] ^ lo ^ hi);
    let f = csU32(CINESRC_K[15 - vr] ^ w[sI & 3]);
    for (let r = 0; r < rnd; r++) {
      const i1 = csU32(csRotl(b, r + 1) ^ csImul(CINESRC_K[r & 15], f) ^ e ^ a) & mask;
      const v1 = s[i1];
      const i2 = csU32(csRotl(e, vr + r + 3) ^ csImul(CINESRC_K[(r + 7) & 15], d) ^ cc ^ v1) & mask;
      const op = sch[r];
      if (op === 0) { a = csRotl(csU32(a + d + v1), 5); cc = csU32(csImul(cc ^ f ^ a, 1187432225) + b); }
      else if (op === 1) { b = csRotl((cc ^ e ^ b ^ v1) >>> 0, 11); d = csU32(csImul(b ^ a, 1110491921) + d); }
      else if (op === 2) { cc = csRotl(csU32(cc + b + v1), 17); a = csU32(csImul(d ^ f ^ cc, 404896285) ^ a); }
      else if (op === 3) { d = csRotl((a ^ d ^ v1) >>> 0, 23); b = csU32(csImul(cc ^ e ^ d, 1446550439) + b); }
      else if (op === 4) { a = csU32(csImul(a ^ e ^ v1, -727158525) + csRotl(b, 7)); d = csU32(csRotl(csU32(cc + f + a), 13) ^ d); }
      else if (op === 5) { cc = csU32(csImul(csU32(cc + f + v1), 130784815) ^ csRotl(d, 9)); b = csU32(csRotl((a ^ e ^ cc) >>> 0, 19) + b); }
      else if (op === 6) { b = csU32(csImul(b ^ f ^ v1, 1929928605) + csRotl(a, 3)); cc = csU32(csRotl(csU32(d + e + b), 15) ^ cc); }
      else { d = csU32(csImul(csU32(d + e + v1), -767989217) ^ csRotl(cc, 21)); a = csU32(csRotl((b ^ f ^ d) >>> 0, 27) + a); }
      const v2 = s[i2];
      if (((f ^ r ^ v1) & 1) === 0) {
        f = csRotl(csU32(v2 + f + a), r + 5);
        e = csU32(csImul(CINESRC_K[8 + op], v2 ^ e ^ f) + d);
      } else {
        e = csRotl((v2 ^ e ^ b) >>> 0, r + 9);
        f = csU32(csImul(CINESRC_K[(op + 11) & 15], csU32(v2 + f + e)) ^ cc);
      }
    }
    const vals = [a, cc, b, d, f, e];
    for (let j = 0; j < 6; j++) msg.writeUInt32LE(vals[perm[j]], j * 4);
    msg.writeUInt32LE(lo, 40);
    msg.writeUInt32LE(hi, 44);
    const h = crypto.createHash('sha256').update(msg).digest();
    let ok = true;
    for (let bIdx = 0; bIdx < fullBytes; bIdx++) if (h[bIdx] !== 0) { ok = false; break; }
    if (ok && (remBits === 0 || (h[fullBytes] >>> (8 - remBits)) === 0)) {
      return `m4.${n.toString(16)}`;
    }
  }
  throw Error('CineSrc stage1 PoW exhausted');
}

function solveCinesrcStage2(data) {
  const rev = s => [...String(s || '')].reverse().join('');
  const target = rev(data.pack[0]);
  const salt = rev(data.pack[3]);
  const r = rev(data.pack[4]);
  const body = Buffer.from(r.split('.')[1], 'base64url').toString('utf8');
  const payload = Buffer.from(body.split('.')[1], 'base64url').toString('utf8');
  const difficulty = Number(JSON.parse(payload).d) || 16;
  const width = Math.floor((difficulty + 3) / 4);
  const limit = 1 << Math.min(24, difficulty);
  for (let counter = 0; counter < limit; counter++) {
    const key = counter.toString(16).padStart(width, '0');
    if (crypto.createHash('sha256').update(salt + key).digest('hex') === target) return key;
  }
  throw Error('CineSrc stage2 PoW exhausted');
}

async function resolveCinesrcDirect(input, meta = {}) {
  const isTv = input.type === 'tv';
  const tmdbId = String(input.id);
  const s = isTv ? String(input.season) : '';
  const e = isTv ? String(input.episode) : '';
  const embedUrl = isTv
    ? `https://cinesrc.st/embed/tv/${tmdbId}?s=${s}&e=${e}`
    : `https://cinesrc.st/embed/movie/${tmdbId}`;

  const baseHeaders = {
    Origin: 'https://cinesrc.st',
    Referer: 'https://cinesrc.st/',
    'Content-Type': 'text/plain;charset=UTF-8',
    'User-Agent': UA
  };

  const encoded = Buffer.from(JSON.stringify([input.type, tmdbId, s, e])).toString('base64url');
  let boot = await fetchJsonSafe('https://cinesrc.st/api/c/bootstrap', {
    method: 'POST',
    headers: { ...baseHeaders, 'x-cs-q': encoded },
    timeout: 4800
  }).catch(() => null);

  if (!boot?.r || !boot?.p) {
    await refreshCinesrcBuildId();
    boot = await fetchJsonSafe('https://cinesrc.st/api/c/bootstrap', {
      method: 'POST',
      headers: { ...baseHeaders, 'x-cs-q': encoded },
      timeout: 4800
    });
  }
  if (!boot?.r || !boot?.p) throw Error('CineSrc bootstrap failed');

  const csHeaders = {
    ...baseHeaders,
    'x-cs-b': cinesrcBuildId,
    'x-cs-q': encoded,
    'x-cs-r': boot.r,
    'x-cs-p': boot.p
  };

  const [ch1, ch2] = await Promise.all([
    fetchJsonSafe('https://cinesrc.st/api/c/issue', { headers: csHeaders, timeout: 4500 }),
    fetchJsonSafe('https://cinesrc.st/api/c/stage2/issue', { headers: csHeaders, timeout: 4500 })
  ]);
  if (!ch1?.w || !Array.isArray(ch2?.pack)) throw Error('CineSrc challenge issue failed');

  const seedResp = await fetchJsonSafe('https://enc-dec.app/api/enc-cinesrc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { url: embedUrl, user_agent: UA, challenge_data: ch1 }, type: 'seed' }),
    timeout: 4800
  });
  if (!seedResp?.result?.seed || !seedResp?.result?.state) throw Error('CineSrc seed failed');

  const sol1 = solveCinesrcStage1(ch1, seedResp.result.seed);
  const sol2 = solveCinesrcStage2(ch2);

  const encResp = await fetchJsonSafe('https://enc-dec.app/api/enc-cinesrc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        url: embedUrl,
        user_agent: UA,
        challenge_data: {
          stage1: { challenge: ch1, solution: sol1 },
          stage2: { challenge: ch2, solution: sol2 }
        },
        state: seedResp.result.state
      },
      type: 'encrypt'
    }),
    timeout: 4800
  });
  const encRes = encResp?.result;
  if (!encRes?.token || !encRes?.headers?.getProviderList || !encRes?.headers?.getStream) {
    throw Error('CineSrc encrypt failed');
  }

  const token = `${encRes.token}::c3::${boot.r}`;
  const state2 = encRes.state;
  const provTxt = await fetch(embedUrl, {
    method: 'POST',
    headers: { ...baseHeaders, 'Next-Action': encRes.headers.getProviderList },
    body: '[]',
    signal: AbortSignal.timeout(4800)
  }).then(r => {
    if (!r.ok) throw Error(`CineSrc providers HTTP ${r.status}`);
    return r.text();
  });

  const provLine = provTxt.split('\n').find(l => l.startsWith('1:'))?.slice(2);
  const providerList = provLine ? JSON.parse(provLine) : [];
  if (!Array.isArray(providerList) || !providerList.length) throw Error('CineSrc returned no providers');

  // For TV series, prioritize 'light' (lightspeed.st — exact Blu-ray episode numbering) ahead of 'nebula' & 'wave' (Hexa)
  const orderedProviders = isTv
    ? [
        ...providerList.filter(p => p.id === 'light'),
        ...providerList.filter(p => !['light', 'nebula', 'wave'].includes(p.id)),
        ...providerList.filter(p => p.id === 'nebula')
      ]
    : providerList;

  const streamHeaders = { Referer: 'https://cinesrc.st/', Origin: 'https://cinesrc.st' };
  for (const prov of orderedProviders.slice(0, 4)) {
    if (!prov?.id) continue;
    try {
      const payload = [
        tmdbId,
        isTv ? 'show' : 'movie',
        isTv ? s : '$undefined',
        isTv ? e : '$undefined',
        token,
        prov.id
      ];
      const sRes = await fetch(embedUrl, {
        method: 'POST',
        headers: { ...baseHeaders, 'Next-Action': encRes.headers.getStream },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
      if (!sRes.ok) continue;
      const encrypted = await sRes.text();
      const dec = await fetchJsonSafe('https://enc-dec.app/api/dec-cinesrc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: encrypted, state: state2 }),
        timeout: 4500
      });
      const urlList = Array.isArray(dec?.result?.url) ? dec.result.url : [];
      const firstObj = urlList.find(u => u?.url) || (typeof dec?.result?.url === 'string' ? { url: dec.result.url } : null);
      if (!firstObj?.url) continue;
      const fullUrl = new URL(firstObj.url, 'https://cinesrc.st').href;

      const check = await fetch(fullUrl, {
        headers: { 'User-Agent': UA, ...streamHeaders },
        signal: AbortSignal.timeout(4000)
      });
      if (!check.ok) {
        check.body?.cancel?.().catch(() => {});
        continue;
      }
      const head = await check.text();
      if (!head.trimStart().startsWith('#EXTM3U')) continue;
      const timing = await inspectHlsTiming(fullUrl, streamHeaders, head);
      if (!verifyStreamRuntimeByDur(input, timing.durationSec, meta, true)) {
        continue;
      }

      const inlineCaps = mapSourceTracks(dec?.result?.captions || dec?.result?.subtitles || [], 'cinesrc', 'https://cinesrc.st/');
      return {
        url: fullUrl,
        kind: 'hls',
        codec: 'h264',
        durationSec: timing.durationSec,
        fps: timing.fps,
        headers: streamHeaders,
        tracks: inlineCaps,
        qualityStreams: []
      };
    } catch {}
  }
  throw Error('CineSrc providers had no live stream');
}

async function resolveCinesrc(input, meta = {}) {
  let chosen = await resolveCinesrcDirect(input, meta).catch(() => null);
  if (!chosen && input.type === 'tv') {
    chosen = await fetchVidsparkPrimary(input, meta).catch(() => null);
  }
  if (!chosen) {
    const hx = await resolveHexaStream(input, 'cinesrc', meta).catch(() => null);
    if (hx) chosen = hx;
  }
  if (!chosen) throw Error('CineSrc has no playable stream for this title right now.');

  const [tracks, audioStreams] = await Promise.all([
    resolveSyncedSubtitles(input, meta, chosen.tracks || [], chosen.url, chosen.headers || {}, 'cinesrc', chosen.durationSec || -1, chosen.fps || 0),
    mergeCleanMultiAudio(chosen.url, 'cinesrc', chosen.headers || {}, [], input, meta, chosen.kind || 'hls', chosen.durationSec || -1)
  ]);

  return {
    url: chosen.url,
    kind: chosen.kind || 'hls',
    codec: chosen.codec || 'h264',
    durationSec: chosen.durationSec || -1, fps: chosen.fps || 0,
    audioLang: chosen.parsedLang?.code || '', audioLabel: chosen.parsedLang?.label || '',
    headers: chosen.headers || {},
    tracks,
    audioStreams,
    qualityStreams: [],
    provider: 'CineSrc',
    sourceKey: 'cinesrc',
    proxyProvider: 'cinesrc',
    server: 'CineSrc'
  };
}

// ============================================================================
// UNIFIED OTT ROUTER + 5-SERVER FAILOVER
// ============================================================================
const RESOLVER_BY_KEY = {
  vidcore: resolveVidcore,
  embedwave: resolveEmbedWave,
  cinesrc: resolveCinesrc,
  vidlink: resolveVidlink,
  vidsrc: resolveVidsrc
};

const resolvedCache = new Map();

// Use the actual HLS default when the manifest identifies it, then provider
// metadata, and only then the title's original/spoken language from TMDB.
async function inferPrimaryAudio(value, meta = {}) {
  let hlsDefault = null, embeddedAudio = [];
  if (value.kind !== 'mp4' && value.kind !== 'dash' && value.url) {
    try {
      const r = await fetch(value.url, { headers: { 'User-Agent': UA, ...(value.headers || {}) }, signal: AbortSignal.timeout(2200) });
      if (r.ok) {
        const text = (await readLimitedBody(r, 524288)).toString('utf8');
        if (text.trimStart().startsWith('#EXTM3U')) {
          const lines = text.split(/\r?\n/).filter(line => /^#EXT-X-MEDIA:/i.test(line) && /TYPE=AUDIO/i.test(line));
          const parseLine = line => {
            const label = line.match(/NAME="([^"]+)"/i)?.[1] || '';
            const code = (line.match(/LANGUAGE="([^"]+)"/i)?.[1] || '').split(/[-_]/)[0];
            return cleanLanguageOnlyLabel(label, code, meta.originalLanguage || '');
          };
          const chosen = lines.find(line => /DEFAULT=YES/i.test(line)) || (lines.length === 1 ? lines[0] : '');
          if (chosen) hlsDefault = parseLine(chosen);
          const found = new Map();
          for (const line of lines) {
            const parsed = parseLine(line);
            if (parsed && /URI="[^"]+"/i.test(line) && !found.has(parsed.code)) found.set(parsed.code, parsed);
          }
          embeddedAudio = [...found.values()];
        }
      } else r.body?.cancel?.().catch(() => {});
    } catch {}
  }
  const explicit = cleanLanguageOnlyLabel(value.audioLabel || '', value.audioLang || '', meta.originalLanguage || '');
  const same = (value.audioStreams || []).find(a => a.url === value.url && !a.audioLang);
  const bySource = same ? cleanLanguageOnlyLabel(same.label, same.language, meta.originalLanguage || '') : null;
  const metaCode = String(meta.originalLanguage || meta.spokenLanguages?.[0]?.code || meta.spokenLanguages?.[0] || '').toLowerCase().split(/[-_]/)[0];
  const fromMeta = /^[a-z]{2,3}$/.test(metaCode) && !['und','unk'].includes(metaCode)
    ? { code: metaCode, label: readableLanguage(metaCode) } : null;
  const primary = hlsDefault || explicit || bySource || fromMeta || { code: 'und', label: 'Original audio' };
  return { ...primary, embeddedAudio };
}

// Project captions between the common 25fps and 23.976fps releases only when
// measured runtimes support that exact relationship. Arbitrary cuts are not guessed.
export function subtitleTracksForVariant(tracks, primaryDurationSec, variantDurationSec) {
  const ratio = variantDurationSec > 0 && primaryDurationSec > 0 ? variantDurationSec / primaryDurationSec : 1;
  const factor = ratio >= 0.953 && ratio <= 0.966 ? NTSC_TO_PAL : ratio >= 1.035 && ratio <= 1.050 ? PAL_TO_NTSC : 1;
  return (tracks || []).map(t => {
    const out = { ...t };
    if (factor !== 1) {
      out.timeScale = Number(((Number(t.timeScale) || 1) * factor).toFixed(6));
      if (t.offsetSec) out.offsetSec = Number((Number(t.offsetSec) * factor).toFixed(3));
    }
    return out;
  });
}

export async function resolveRegionalSubtitles(input, stream, meta = {}) {
  if (!stream?.url) return [];
  return resolveSyncedSubtitles(input, meta, [], stream.url, stream.headers || {},
    stream.proxyProvider || 'vidcore', Number(stream.durationSec) || -1, Number(stream.fps) || 0);
}

export async function resolveOttWithFallback(input, requestedProvider = DEFAULT_OTT_SERVER, getTmdbMeta = null, {exclude=[]} = {}) {
  const fallbackPool = ['vidcore', 'cinesrc', 'vidlink', 'vidsrc', 'embedwave'];
  const startKey = OTT_SERVER_KEYS.has(requestedProvider) ? requestedProvider : DEFAULT_OTT_SERVER;
  const excluded = new Set(exclude.filter(key => OTT_SERVER_KEYS.has(key)));
  const order = [startKey, ...fallbackPool.filter(k => k !== startKey)].filter(key => !excluded.has(key));

  const meta = getTmdbMeta ? await getTmdbMeta(input).catch(() => ({})) : {};
  let lastError = null;

  for (const key of order) {
    const cacheKey = `${key}:${input.type}:${input.id}:${input.type === 'tv' ? `${input.season}:${input.episode}` : 'm'}`;
    const hit = resolvedCache.get(cacheKey);
    if (hit) {
      if (hit.value && Date.now() - hit.time < 180_000) return hit.value;
      if (hit.error && Date.now() - hit.time < 25_000) {
        lastError = Error(hit.error);
        continue;
      }
    }

    try {
      const value = await RESOLVER_BY_KEY[key](input, meta);
      const primaryAudio = await inferPrimaryAudio(value, meta);
      value.audioLang = primaryAudio.code;
      value.audioLabel = primaryAudio.label;
      if (!Array.isArray(value.audioStreams)) value.audioStreams=[];
      if (!value.audioStreams.some(a=>a.url===value.url && !a.audioLang)) {
        value.audioStreams.unshift({language:primaryAudio.code,label:primaryAudio.label,url:value.url,
          kind:value.kind||'hls',codec:value.codec||'h264',durationSec:value.durationSec,
          proxyProvider:value.proxyProvider||value.sourceKey||'vidcore',headers:value.headers||{}});
      }
      if (value.audioStreams.length) {
        for (const a of value.audioStreams) {
          if (a.url === value.url && !a.audioLang) { a.language = primaryAudio.code; a.label = primaryAudio.label; }
        }
        // When external dubs are also offered, retain distinct native HLS audio
        // tracks instead of hiding them behind the alternate-stream menu.
        for (const track of primaryAudio.embeddedAudio || []) {
          if (track.code === primaryAudio.code || value.audioStreams.some(a => a.language === track.code || a.label === track.label)) continue;
          value.audioStreams.push({ language: track.code, label: track.label, url: value.url, audioLang: track.code,
            kind: value.kind || 'hls', codec: value.codec || 'h264', durationSec: value.durationSec,
            proxyProvider: value.proxyProvider || value.sourceKey || 'vidcore', headers: value.headers || {} });
        }
        const seen = new Set();
        value.audioStreams = value.audioStreams.filter(a => {
          const key = String(a.language || a.label || '').toLowerCase();
          if (!key || seen.has(key)) return false; seen.add(key); return true;
        });
        for (const a of value.audioStreams) a.tracks = subtitleTracksForVariant(value.tracks, value.durationSec, a.durationSec);
      }
      resolvedCache.set(cacheKey, { value, time: Date.now() });
      if (resolvedCache.size > 400) resolvedCache.delete(resolvedCache.keys().next().value);
      return value;
    } catch (err) {
      lastError = err;
      resolvedCache.set(cacheKey, { error: err?.message || 'Unavailable', time: Date.now() });
      if (resolvedCache.size > 400) resolvedCache.delete(resolvedCache.keys().next().value);
    }
  }
  throw lastError || Error('No playable stream found across VidCore, CineSrc, VidLink, VidSrc, or EmbedWave.');
}

const animeRegionalCache = new Map();
const animeRegionalInflight = new Map();

// Order matters: the first four are the languages Indian anime releases almost
// always carry, so they are probed first and the rest follow. Marathi, Punjabi,
// Urdu and Gujarati were being *recognised* by cleanLanguageOnlyLabel but never
// requested, which is why a track could sit in the master and never appear in
// the menu.
const REGIONAL_ANIME_WANTED = REGIONAL_AUDIO_LANGUAGES;
const REGIONAL_ANIME_LABEL_SET = REGIONAL_ANIME_WANTED.map(([, label]) => label);
const REGIONAL_ANIME_LABELS = new Set(REGIONAL_ANIME_LABEL_SET);
// Recognise both Chinese variants without merging their audio identities.
const CHINESE_LANG_LABELS = new Set(['Chinese', 'Mandarin', 'Cantonese', 'Chinese (Mandarin)', 'Chinese (Cantonese)']);

export const _testLangs={cleanLanguageOnlyLabel,normalizeAudioLangCode,REGIONAL_ANIME_WANTED,REGIONAL_ANIME_LABELS,CHINESE_LANG_LABELS};
export const _dbgClean=cleanLanguageOnlyLabel;
export const _dbgParse=parseEmbeddedHlsAudioLanguages;
export function regionalVariantsFromResolved(value,input,meta={},expectedDurationSec=0){
 const seen=new Set(),out=[];
 for(const track of value?.audioStreams||[]){
  const parsed=cleanLanguageOnlyLabel(track.label,track.language||track.audioLang,meta.originalLanguage||'ja');
  if(!parsed||!REGIONAL_ANIME_WANTED.some(([code])=>code===parsed.code)||seen.has(parsed.code)||!track.url)continue;
  const sameMaster=track.url===value.url;
  if(expectedDurationSec>300){
   const duration=Number(track.durationSec||value.durationSec),tolerance=Math.max(110,expectedDurationSec*.055);
   if(!(duration>0)||![1,25/23.976023976,23.976023976/25].some(ratio=>Math.abs(duration-expectedDurationSec*ratio)<=tolerance))continue;
  }
  if(!sameMaster&&!verifyDubDurationMatch(track.durationSec,value.durationSec,input,meta,track._scraper||''))continue;
  seen.add(parsed.code);out.push({...track,key:parsed.code,language:parsed.code,label:parsed.label,
   proxyProvider:track.proxyProvider||value.proxyProvider||value.sourceKey||'vidcore'});
 }
 return out;
}
async function regionalFromExistingServers(input,meta,expectedDurationSec){
 const resolved=await resolveOttWithFallback(input,'vidcore',async()=>meta).catch(()=>null);
 return regionalVariantsFromResolved(resolved,input,meta,expectedDurationSec);
}
export async function resolveAnimeRegionalAudio(input, meta = {}, expectedDurationSec = 0) {
  const pathKey = `anime-reg:${mediaPathFor(input)}`;
  const hit = animeRegionalCache.get(pathKey);
  if (hit && Date.now() - hit.time < (hit.value?.length ? 15 * 60_000 : 45_000)) return hit.value;
  if (animeRegionalInflight.has(pathKey)) return animeRegionalInflight.get(pathKey);

  const task = (async () => {
    const origLang = String(meta?.originalLanguage || 'ja').toLowerCase();
    const origBase = origLang.slice(0, 2);
    const scrapers = ['castle', 'awsind', 'nitro', 'mahalala', 'watchout', 'purstream', 'bdxs', 'rive-citadel'];
    const rawLists = await Promise.all(
      scrapers.map(sc => fetchEmbedWaveSourcesForScraper(sc, input, meta).then(list => list.map(item => ({ ...item, _scraper: sc }))).catch(() => []))
    );
    const allRaw = rawLists
      .flat()
      .filter(s => s?.url && !s.isEmbed && s.type !== 'embed' && /^https:\/\//i.test(s.url) && !isLockerUrl(s.url));

    if (!allRaw.length) {
      return regionalFromExistingServers(input,meta,expectedDurationSec);
    }

    const langCandidates = new Map();
    const primaryCandidates = [];
    const multiMasterCandidates = [];

    for (const s of allRaw) {
      const rawDesc = [s.label, s.title, s.name, s.quality, s.server, s.provider].filter(Boolean).join(' ');
    if (isMarkedUnofficial(rawDesc)) continue;
    if (/\bsub(?:s|titled)?\b/i.test(rawDesc) && !/\bdub(?:bed)?\b|\bdual\b/i.test(rawDesc)) continue;
      const isHevc = /\/resource\/h265\/|\bh\.?265\b|\bhevc\b/i.test(`${s.url} ${rawDesc}`);
      const isMp4 = /\.mp4(?:\?|$)/i.test(s.url) || /macdn\.hakunaymatata\.com\/(?:resource|cms|bt|animekai|tran-audio)\//i.test(s.url);
      // Naruto: Nitro's master is the only source carrying the Hindi/Tamil/Telugu/
      // Malayalam/Bengali dubs, so it is kept but still duration-verified below.
      // (The earlier blanket skip hid every regional dub for this series.)
      const tierHint = embedCandidateScore(s, rawDesc, input, isMp4, isHevc);
      const parsedLang = cleanLanguageOnlyLabel(rawDesc, s.lang || s.language || '', origLang);
      const entry = { ...s, rawDesc, tierHint, parsedLang, isHevc };

      // Nitro serves one master with every dub inside it; its label says "Multi
      // Audio" and often parses to no language at all, so it always qualifies.
      const multiHint = /multi/i.test(rawDesc) || (s._scraper === 'nitro' && !parsedLang);
      if (!isMp4 && multiHint) {
        if (!multiMasterCandidates.some(m => m.url === entry.url)) multiMasterCandidates.push(entry);
      }
      if (!parsedLang || parsedLang.code === origBase || parsedLang.code === 'en' || /multi/i.test(rawDesc)) {
        if (!isHevc && s._scraper !== 'nitro' && !primaryCandidates.some(p => p.url === entry.url)) primaryCandidates.push(entry);
      }
      const bucketLabel = parsedLang?.code==='yue'?'Cantonese':parsedLang && CHINESE_LANG_LABELS.has(parsedLang.label) ? 'Chinese' : parsedLang?.label;
      if (bucketLabel && REGIONAL_ANIME_LABELS.has(bucketLabel)) {
        const bucket = langCandidates.get(bucketLabel) || [];
        if (!bucket.some(b => b.url === entry.url)) bucket.push(entry);
        langCandidates.set(bucketLabel, bucket);
      }
    }

    // Multi-audio masters often carry every regional dub inside one stream and
    // do not name any language in their label ("1080P | Multi Audio"). They are
    // only discoverable by probing, so ask the top candidates what audio groups
    // they actually publish before deciding a language is unavailable.

    for (const bucket of langCandidates.values()) bucket.sort((a, b) => b.tierHint - a.tierHint);
    primaryCandidates.sort((a, b) => b.tierHint - a.tierHint);
    multiMasterCandidates.sort((a, b) => b.tierHint - a.tierHint);

    const probeTargets = new Map();
    const addTarget = c => {
      if (c?.url && !probeTargets.has(c.url) && probeTargets.size < 16) probeTargets.set(c.url, c);
    };
    // Multi-audio masters carry the regional dubs even when the label names no
    // language, so they are always probed first. When no bucket names a language
    // at all, the best generic masters are probed too instead of giving up.
    for (const c of multiMasterCandidates.slice(0, 4)) addTarget(c);
    for (const langName of ['Hindi','Tamil','Telugu','Malayalam','Kannada','Bengali']) {
      for (const c of (langCandidates.get(langName) || []).slice(0, 3)) addTarget(c);
    }
    if (!langCandidates.size && !multiMasterCandidates.length) {
      for (const c of primaryCandidates.slice(0, 4)) addTarget(c);
    }
    for (const [, langName] of REGIONAL_ANIME_WANTED.slice(3)) {
      for (const c of (langCandidates.get(langName) || []).slice(0, 2)) addTarget(c);
    }
    if (!(expectedDurationSec > 300) && primaryCandidates[0]) addTarget(primaryCandidates[0]);

    // Only give up when there is nothing at all worth probing; a lone unhinted
    // multi-audio master is still a candidate for every regional language.
    if (!probeTargets.size && !primaryCandidates.length) return [];
    if (!probeTargets.size) {
      for (const c of primaryCandidates.slice(0, 3)) addTarget(c);
    }

    const flexibleMeta = { ...meta, episodeRuntimeMinutes: 0 };
    const probedMap = new Map();
    // Probes race. The wait is bounded by the first few answers rather than by
    // the slowest candidate, because a multi-audio master that replies in 300ms
    // already tells us every language the episode carries.
    const probeAll = [...probeTargets.values()].map(async c => {
      const res = await probeEmbedWaveStream(c.url, c._scraper, input, input.type === 'tv' ? flexibleMeta : meta, c.rawDesc).catch(() => null);
      if (res) probedMap.set(c.url, res);
      return res;
    });
    // Each network operation already has its own timeout. Wait for all probes:
    // work left running after an HTTP response can be frozen by serverless hosts.
    await Promise.allSettled(probeAll);

    for (const c of [...multiMasterCandidates, ...primaryCandidates]) {
      const live = probedMap.get(c.url);
      if (!live?.embeddedAudio?.length) continue;
      for (const emb of live.embeddedAudio) {
        const embLabel = emb.code==='yue'?'Cantonese':CHINESE_LANG_LABELS.has(emb.label) ? 'Chinese' : emb.label;
        if (!REGIONAL_ANIME_LABELS.has(embLabel)) continue;
        const bucket = langCandidates.get(embLabel) || [];
        if (!bucket.some(b => b.url === c.url && (b.audioLang || '') === emb.code)) {
          bucket.push({
            ...c,
            parsedLang: emb,
            audioLang: emb.code,
            tierHint: c.tierHint + (c._scraper === 'nitro' ? 0 : 30)
          });
        }
        bucket.sort((a, b) => b.tierHint - a.tierHint);
        langCandidates.set(embLabel, bucket);
      }
    }

    let refDuration = expectedDurationSec > 300 ? expectedDurationSec : 0;
    if (!refDuration && primaryCandidates[0] && probedMap.has(primaryCandidates[0].url)) {
      const pLive = probedMap.get(primaryCandidates[0].url);
      if (pLive?.durationSec > 300) refDuration = pLive.durationSec;
    }

    const results = [];
    for (const [code, label] of REGIONAL_ANIME_WANTED) {
      const bucket = langCandidates.get(label) || [];
      const matchesDuration = c => {
        if (!probedMap.has(c.url)) return false;
        const candLive = probedMap.get(c.url);
        if (refDuration > 300 && candLive.durationSec > 0) {
          return verifyDubDurationMatch(candLive.durationSec, refDuration, input, meta, candLive.scraper || c._scraper || '');
        }
        // -1 means the master carried no duration tag at all (nitro's multi-audio
        // masters never do). That is "unknown", not "too short".
        const unknown = candLive.durationSec < 0 && (refDuration > 300 || (candLive.embeddedAudio || []).length > 1);
        if (candLive.durationSec === 0 || candLive.durationSec >= 180 || unknown) return true;
        // A source whose own label names this language ("1080P | Hindi") is a
        // single-audio dub master: there is no playlist tag to read, but it is
        // exactly the track we are looking for. Dropping it because a variant
        // playlist has no timing data is what hid whole Hindi seasons.
        const labelled = c.parsedLang && c.parsedLang.label === label;
        return Boolean(labelled) && candLive.durationSec < 0;
      };
      const winner = bucket.find(c => matchesDuration(c) && probedMap.get(c.url).codec !== 'hevc')
        || bucket.find(c => matchesDuration(c));
      if (!winner) continue;
      const live = probedMap.get(winner.url);
      const pinLang = winner.audioLang
        || (live.embeddedAudio?.some(e => e.code === code) ? code
          : (code === 'yue' && live.embeddedAudio?.some(e => e.code === 'yue')) ? 'yue'
          : '');
      // A "Chinese" master may expose Mandarin under a full BCP-47 tag such as
      // zh-Hans; pin the exact published code so HLS picks the right track.
      const chineseCode = pinLang ? '' : (live.embeddedAudio || []).find(e => e.code && e.code.split('-')[0] === code)?.code || '';
      results.push({
        key: code,
        language: code,
        label,
        url: live.url,
        kind: live.kind || 'hls',
        codec: live.codec || 'h264',
        durationSec: live.durationSec || -1,
        fps: live.fps || 0,
        ...((pinLang || chineseCode) ? { audioLang: pinLang || chineseCode } : {}),
        proxyProvider: 'embedwave',
        headers: live.headers || {}
      });
    }

    if(!results.length)results.push(...await regionalFromExistingServers(input,meta,expectedDurationSec));

    // Never cache an empty answer: a flaked probe would otherwise stick and
    // the player would keep showing "no languages" for a feed that has them.
    if (results.length) animeRegionalCache.set(pathKey, { value: results, time: Date.now() });
    if (animeRegionalCache.size > 300) animeRegionalCache.delete(animeRegionalCache.keys().next().value);
    return results;
  })();

  animeRegionalInflight.set(pathKey, task);
  try {
    return await task;
  } finally {
    animeRegionalInflight.delete(pathKey);
  }
}

export async function resolveSpecialRegionalAnime(input) {
  const pathKey = `anime-special-reg:${mediaPathFor(input)}`;
  const hit = animeRegionalCache.get(pathKey);
  if (hit && Date.now() - hit.time < (hit.value?.length ? 15 * 60_000 : 45_000)) return hit.value;
  if (animeRegionalInflight.has(pathKey)) return animeRegionalInflight.get(pathKey);

  const task = (async () => {
    const meta = { originalLanguage: 'ja', episodeRuntimeMinutes: 0 };
    const scrapers = ['nitro', 'mahalala', 'rive-citadel', 'awsind', 'castle'];
    const rawLists = await Promise.all(
      scrapers.map(sc => fetchEmbedWaveSourcesForScraper(sc, input, meta).then(list => list.map(item => ({ ...item, _scraper: sc }))).catch(() => []))
    );
    const allRaw = rawLists
      .flat()
      .filter(s => s?.url && !s.isEmbed && s.type !== 'embed' && /^https:\/\//i.test(s.url) && !isLockerUrl(s.url));

    if (!allRaw.length) return []; // retry next time instead of caching the miss

    const langCandidates = new Map();
    const unlabeledNitro = [];

    for (const s of allRaw) {
      const rawDesc = [s.label, s.title, s.name, s.quality, s.server, s.provider].filter(Boolean).join(' ');
    if (isMarkedUnofficial(rawDesc)) continue;
    if (/\bsub(?:s|titled)?\b/i.test(rawDesc) && !/\bdub(?:bed)?\b|\bdual\b/i.test(rawDesc)) continue;
      const isHevc = /\/resource\/h265\/|\bh\.?265\b|\bhevc\b/i.test(`${s.url} ${rawDesc}`);
      const isMp4 = /\.mp4(?:\?|$)/i.test(s.url) || /macdn\.hakunaymatata\.com\/(?:resource|cms|bt|animekai|tran-audio)\//i.test(s.url);
      const resHint = /1080|fhd/i.test(rawDesc) ? 260 : /720|\bhd\b/i.test(rawDesc) ? 160 : /480/i.test(rawDesc) ? 60 : 145;
      const tierHint = resHint + (isHevc ? -1400 : 150) + (s._scraper === 'nitro' ? 510 : s._scraper === 'mahalala' ? 360 : s._scraper === 'castle' || s._scraper === 'rive-citadel' ? 300 : -120);
      const parsedLang = cleanLanguageOnlyLabel(rawDesc, s.lang || s.language || '', 'ja');
      const entry = { ...s, rawDesc, tierHint, parsedLang, isHevc };

      if (parsedLang && REGIONAL_ANIME_LABELS.has(parsedLang.label)) {
        const bucket = langCandidates.get(parsedLang.label) || [];
        if (!bucket.some(b => b.url === entry.url)) bucket.push(entry);
        langCandidates.set(parsedLang.label, bucket);
      } else if (parsedLang && parsedLang.label === 'Japanese') {
        const bucket = langCandidates.get('Japanese') || [];
        if (!bucket.some(b => b.url === entry.url)) bucket.push(entry);
        langCandidates.set('Japanese', bucket);
      } else if (parsedLang && parsedLang.label === 'English') {
        const bucket = langCandidates.get('English') || [];
        if (!bucket.some(b => b.url === entry.url)) bucket.push(entry);
        langCandidates.set('English', bucket);
      } else if (s._scraper === 'nitro' && !parsedLang) {
        if (!unlabeledNitro.some(u => u.url === entry.url)) unlabeledNitro.push(entry);
      }
    }

    for (const bucket of langCandidates.values()) bucket.sort((a, b) => b.tierHint - a.tierHint);
    unlabeledNitro.sort((a, b) => b.tierHint - a.tierHint);

    const pokemonE1 = input.type === 'tv' && String(input.id) === '60572' && String(input.season) === '1' && String(input.episode) === '1';
    const probeTargets = new Map();
    const addTarget = c => {
      if (c?.url && !probeTargets.has(c.url) && probeTargets.size < 12) probeTargets.set(c.url, c);
    };
    for (const [, langName] of [...REGIONAL_ANIME_WANTED, ['sub', 'Japanese'], ['dub', 'English']]) {
      for (const c of (langCandidates.get(langName) || []).slice(0, 2)) addTarget(c);
    }
    for (const c of unlabeledNitro.slice(0, pokemonE1 ? 4 : 2)) addTarget(c);

    const probedMap = new Map();
    // CDN handshakes flake, so give every target up to three tries spaced out;
    // without this a single 5xx hides a language the feed really carries.
    const probeOnce = async c => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await probeEmbedWaveStream(c.url, c._scraper, input, meta, c.rawDesc).catch(() => null);
        // A variant playlist with no EXTINF yet is still a valid single-audio
        // source; only a known-too-short duration disqualifies it.
        if (res && (res.durationSec === 0 || res.durationSec < 0 || res.durationSec >= 150)) return res;
        if (attempt < 2) await new Promise(r => setTimeout(r, 450 * (attempt + 1)));
      }
      return null;
    };
    await Promise.all([...probeTargets.values()].map(async c => {
      const res = await probeOnce(c);
      if (res) probedMap.set(c.url, res);
    }));

    // Read only explicitly identified embedded tracks, except for sampled Nitro
    // Shin-chan/Doraemon feeds and the specific Pokémon S1E1 Hindi source.
    // These exceptions must not be generalized to other shows or Pokémon episodes.
    const knownHindiFeed = input.type === 'tv' && (['30623','57911'].includes(String(input.id)) || pokemonE1);
    for (const c of probeTargets.values()) {
      const live = probedMap.get(c.url);
      if (!live) continue;
      if (live.embeddedAudio?.length) {
        for (const emb of live.embeddedAudio) {
          if (!REGIONAL_ANIME_LABELS.has(emb.label) && !['English','Japanese'].includes(emb.label)) continue;
          const bucket = langCandidates.get(emb.label) || [];
          if (!bucket.some(b => b.url === c.url && b.audioLang === emb.code)) bucket.push({ ...c, parsedLang: emb, audioLang: emb.code, tierHint: c.tierHint + 50 });
          bucket.sort((a,b) => b.tierHint - a.tierHint);
          langCandidates.set(emb.label, bucket);
        }
      } else if (knownHindiFeed && c._scraper === 'nitro' && !c.parsedLang) {
        const hiBucket = langCandidates.get('Hindi') || [];
        if (pokemonE1 ? !hiBucket.some(x => x.url === c.url) : !hiBucket.some(x => probedMap.has(x.url) && probedMap.get(x.url).codec !== 'hevc')) {
          hiBucket.push(c);
          langCandidates.set('Hindi', hiBucket);
        }
      }
    }
    const reference = knownHindiFeed ? unlabeledNitro.map(c => probedMap.get(c.url)).find(x => x?.durationSec > 0)?.durationSec : 0;
    const pokemonReachable = new Map();
    if (pokemonE1) {
      const candidates = unlabeledNitro.filter(c => {
        const live = probedMap.get(c.url), dur = Number(live?.durationSec) || 0;
        return live?.kind === 'hls' && Math.abs(dur - 1216) <= 30;
      });
      await Promise.all(candidates.map(async c => pokemonReachable.set(c.url, await pokemonFirstSegmentReachable(probedMap.get(c.url)))));
    }

    const wantedSpecial = [
      ...REGIONAL_ANIME_WANTED,
      ['sub', 'Japanese'],
      ['dub', 'English']
    ];
    const results = [];
    for (const [code, label] of wantedSpecial) {
      const bucket = langCandidates.get(label) || [];
      const matchesEpisode = c => {
        const live = probedMap.get(c.url);
        if (!live) return false;
        const dur = Number(live.durationSec) || 0;
        // Shinchan's Japanese shorts run ~7-9 min while the Hindi masters are
        // full-length compilations; only apply that filter when a duration is
        // actually known (a 200 with no timing is not evidence of a short).
        if (String(input.id) === '30623' && dur > 0 && dur < 900) return false;
        if (String(input.id) === '132791' && dur > 0 && (dur < 400 || dur > 900)) return false;
        // The only unlabelled Pokémon feed sampled in Hindi was S1E1, 1216s.
        if (pokemonE1 && c._scraper === 'nitro' && !c.parsedLang && (!dur || Math.abs(dur-1216) > 30 || (live.kind === 'hls' && pokemonReachable.get(c.url) !== true))) return false;
        // Do not mix a Japanese individual short with an Indian compilation.
        if (reference > 0 && dur > 0 && Math.abs(dur-reference) > Math.max(100,reference*0.16)) return false;
        return true;
      };
      const winner = bucket.find(c => matchesEpisode(c) && probedMap.get(c.url).codec !== 'hevc')
        || bucket.find(matchesEpisode);
      if (!winner) continue;
      const live = probedMap.get(winner.url);
      const audioCode = code === 'sub' ? 'ja' : code === 'dub' ? 'en' : code;
      const pinLang = winner.audioLang || (live.embeddedAudio?.some(e => e.code === audioCode) ? audioCode : '');
      results.push({
        key: code,
        language: code === 'sub' ? 'ja' : code === 'dub' ? 'en' : code,
        label,
        url: live.url,
        kind: live.kind || 'hls',
        codec: live.codec || 'h264',
        durationSec: live.durationSec || -1,
        fps: live.fps || 0,
        ...(pinLang ? { audioLang: pinLang } : {}),
        proxyProvider: 'embedwave',
        headers: live.headers || {}
      });
    }

    // Never cache an empty answer: a flaked probe would otherwise stick and
    // the player would keep showing "no languages" for a feed that has them.
    if (results.length) animeRegionalCache.set(pathKey, { value: results, time: Date.now() });
    if (animeRegionalCache.size > 300) animeRegionalCache.delete(animeRegionalCache.keys().next().value);
    return results;
  })();

  animeRegionalInflight.set(pathKey, task);
  try {
    return await task;
  } finally {
    animeRegionalInflight.delete(pathKey);
  }
}
