// Imported first on purpose: it fills process.env from .env before this module reads it.
// (In an ES module every `import` is evaluated before the statements around it, so a
// loader run by the entry script would come too late for the constant below.)
import './load-env.js';
import crypto from 'node:crypto';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const key = Buffer.from(process.env.MEGAPLAY_AES_KEY_HEX || '693f4c4d5441783051362c3a7d35305500000000000000000000000000000000', 'hex');
const iv = Buffer.from(process.env.MEGAPLAY_AES_IV_HEX || '57303b3237546f6155706c5f50252763', 'hex');
const VIDORA_CDN_KEY = 'f3b72e73c80c9a996574379798703796a1936efa3516a7105cb0e43048b46b5a';
const sourceCache = new Map(), CACHE_MS = 10 * 60_000;

async function fetchJson(url) {
  let r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://megaplay.buzz/',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(9_000)
  });
  if (!r.ok) throw Error('MegaPlay source request failed (' + r.status + ').');
  return r.json();
}

function sourceFile(data) {
  if (data?.sources?.file) return data.sources.file;
  if (!data?.enc) return null;
  let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let plain = Buffer.concat([decipher.update(Buffer.from(data.enc, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plain).file;
}

function cleanMegaTrackLabel(raw) {
  let s = String(raw || 'English').trim();
  // Clean MegaPlay's nested "(- (Crunchyroll))" -> "(Crunchyroll)"
  s = s.replace(/\(\s*-\s*\(([^)]+)\)\s*\)/g, '($1)');
  s = s.replace(/\(\s*-\s*([^)]+)\)/g, '($1)');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 60) || 'English';
}

export async function measureMegaHlsDurationSec(masterOrMediaUrl) {
  try {
    const r = await fetch(masterOrMediaUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://megaplay.buzz/' },
      signal: AbortSignal.timeout(2800)
    });
    if (!r.ok) { r.body?.cancel?.().catch(() => {}); return -1; }
    const txt = await r.text();
    if (!txt.trimStart().startsWith('#EXTM3U')) return -1;
    if (txt.includes('#EXTINF:')) {
      return [...txt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
    }
    const rel = txt.split(/\r?\n/).find(l => l.trim() && !l.trim().startsWith('#'));
    if (!rel) return -1;
    const childUrl = new URL(rel.trim(), r.url || masterOrMediaUrl).href;
    const cr = await fetch(childUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://megaplay.buzz/' },
      signal: AbortSignal.timeout(2800)
    });
    if (!cr.ok) { cr.body?.cancel?.().catch(() => {}); return -1; }
    const cTxt = await cr.text();
    if (!cTxt.includes('#EXTINF:')) return -1;
    return [...cTxt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  } catch {
    return -1;
  }
}

export async function resolveMegaPlay(embedUrl) {
  let cached = sourceCache.get(embedUrl);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.value;
  let page = await fetch(embedUrl, {
    headers: { 'User-Agent': UA, Referer: 'https://megaplay.buzz/' },
    signal: AbortSignal.timeout(8_500)
  });
  if (!page.ok) throw Error('MegaPlay embed request failed (' + page.status + ').');
  let html = await page.text();
  let fileId = html.match(/data-id=["']?(\d+)/)?.[1] || html.match(/File\s+(\d+)\s+-/)?.[1];
  if (!fileId) throw Error('MegaPlay did not provide a source ID for this episode.');
  let data = await fetchJson('https://megaplay.buzz/stream/getSourcesNew?id=' + fileId)
    .catch(() => fetchJson('https://megaplay.buzz/stream/getSources?id=' + fileId));
  let file = sourceFile(data);
  if (!file || !/^https:\/\//.test(file)) throw Error('MegaPlay did not return a playable media file.');
  let languageNames = {
    english: 'en', portuguese: 'pt', spanish: 'es', french: 'fr', german: 'de',
    italian: 'it', japanese: 'ja', arabic: 'ar', hindi: 'hi', russian: 'ru',
    korean: 'ko', chinese: 'zh', indonesian: 'id', thai: 'th', vietnamese: 'vi', turkish: 'tr'
  };
  let tracks = (data.tracks || [])
    .filter(x => x?.kind === 'captions' && /^https:\/\//.test(x.file || ''))
    .map(x => {
      let label = cleanMegaTrackLabel(x.label);
      let lower = label.toLowerCase();
      let inferred = Object.entries(languageNames).find(([name]) => lower.startsWith(name))?.[1];
      return { src: x.file, label, language: inferred || String(x.srclang || 'und'), default: false };
    });
  let value = { url: file, tracks, intro: data.intro || null, outro: data.outro || null };
  sourceCache.set(embedUrl, { value, time: Date.now() });
  if (sourceCache.size > 300) {
    for (let [k, v] of sourceCache) {
      if (Date.now() - v.time >= CACHE_MS || sourceCache.size > 300) sourceCache.delete(k);
    }
  }
  return value;
}

export async function resolveMegaPlayDirect({ malId, aniId, episode, lang, fallbackEmbed }) {
  let candidates = [];
  if (fallbackEmbed && /^https:\/\/megaplay\.buzz\//i.test(fallbackEmbed)) candidates.push(fallbackEmbed);
  if (malId) {
    const malUrl = `https://megaplay.buzz/stream/mal/${encodeURIComponent(malId)}/${encodeURIComponent(episode)}/${encodeURIComponent(lang)}`;
    if (!candidates.includes(malUrl)) candidates.push(malUrl);
  }
  if (aniId) {
    const aniUrl = `https://megaplay.buzz/stream/ani/${encodeURIComponent(aniId)}/${encodeURIComponent(episode)}/${encodeURIComponent(lang)}`;
    if (!candidates.includes(aniUrl)) candidates.push(aniUrl);
  }
  let lastErr = null;
  for (let url of candidates) {
    try { return await resolveMegaPlay(url); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || Error('Stream unavailable on MegaPlay.');
}

function classifyVariantTier(width, height) {
  const w = Number(width) || 0, h = Number(height) || 0;
  if (w >= 3400 || h >= 2000) return 2160;
  if (w >= 2300 || h >= 1350) return 1440;
  if (w >= 1400 || h >= 1000) return 1080;
  if (w >= 1200 || h >= 680) return 720;
  if (w >= 800 || h >= 440) return 480;
  if (w >= 480 || h >= 320) return 360;
  return 0;
}

function parseHlsVariants(masterText, baseUrl) {
  const lines = String(masterText || '').split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (!cand) continue;
      if (!cand.startsWith('#')) uri = cand;
      break;
    }
    if (!uri) continue;
    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const nameMatch = line.match(/NAME=["']?(\d{3,4})p?["']?/i);
    const w = resMatch ? Number(resMatch[1]) : 0;
    const h = resMatch ? Number(resMatch[2]) : (nameMatch ? Number(nameMatch[1]) : 0);
    const tier = classifyVariantTier(w, h);
    if (!tier) continue;
    try {
      variants.push({ tier, height: h || tier, url: new URL(uri, baseUrl).href });
    } catch {}
  }
  return variants;
}

// Quality-tier enrichment is a bonus: VHS already switches natively whenever the
// MegaPlay master exposes two or more renditions, which is the normal case. The
// only time it earns its keep is a single-rendition master, and even then the
// episode plays fine without it. So it gets a small cache and a hard budget -
// it must never be the reason the first frame is late.
const QUALITY_CACHE_TTL_MS = 10 * 60 * 1000;
const qualityCache = new Map();

async function enrichAnimeQualityStreamsUncached({ primaryUrl, lang, tmdbMapping }) {
  try {
    const mRes = await fetch(primaryUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://megaplay.buzz/' },
      signal: AbortSignal.timeout(2400)
    });
    if (!mRes.ok) return [];
    const mText = await mRes.text();
    const megaVariants = parseHlsVariants(mText, mRes.url || primaryUrl);
    // If MegaPlay's master.m3u8 already exposes 2+ distinct tiers, VHS handles switching natively!
    const distinctMegaTiers = new Set(megaVariants.map(v => v.tier));
    if (distinctMegaTiers.size >= 2) return [];

    if (!tmdbMapping?.tmdbId) return [];
    const path = tmdbMapping.type === 'movie'
      ? `movie/${tmdbMapping.tmdbId}`
      : `tv/${tmdbMapping.tmdbId}/${tmdbMapping.season || 1}/${tmdbMapping.episode || 1}`;
    const sourceKey = lang === 'dub' ? 'fq1k' : 'w7dn';

    const apiRes = await fetch(`https://cdn.vidspark.to/api/vidora/v1/${path}?source=${sourceKey}`, {
      headers: {
        'User-Agent': UA,
        'x-player-key': VIDORA_CDN_KEY,
        Referer: `https://cdn.vidspark.to/${path}`
      },
      signal: AbortSignal.timeout(2600)
    });
    if (!apiRes.ok) return [];
    const apiData = await apiRes.json();
    const secMasterUrl = apiData?.sources?.[0]?.url;
    if (!secMasterUrl || !/^https:\/\//i.test(secMasterUrl)) return [];

    const secRes = await fetch(secMasterUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://cdn.vidspark.to/' },
      signal: AbortSignal.timeout(2400)
    });
    if (!secRes.ok) return [];
    const secVariants = parseHlsVariants(await secRes.text(), secRes.url || secMasterUrl);
    const primaryTier = megaVariants[0]?.tier || 1080;
    const extraVariants = secVariants.filter(v => v.tier !== primaryTier);
    if (!extraVariants.length) return [];

    const combined = [
      {
        tier: primaryTier,
        height: primaryTier,
        url: primaryUrl,
        kind: 'hls',
        codec: 'h264',
        proxyProvider: 'megaplay',
        headers: {}
      },
      ...extraVariants.map(v => ({
        tier: v.tier,
        height: v.tier,
        url: v.url,
        kind: 'hls',
        codec: 'h264',
        proxyProvider: 'vidcore',
        headers: { Referer: 'https://cdn.vidspark.to/' }
      }))
    ];
    const deduped = new Map();
    for (const item of combined) {
      if (!deduped.has(item.tier)) deduped.set(item.tier, item);
    }
    return [...deduped.values()].sort((a, b) => b.tier - a.tier);
  } catch {
    return [];
  }
}

/**
 * Bounded, cached quality enrichment.
 *
 * The UI works without extra tiers, so this never blocks: a cache hit returns
 * instantly, and a miss is given 900 ms to answer. Whatever the probe finds
 * after that budget is written to the cache and picked up on the next request
 * for the same episode instead of holding the player.
 */
export async function enrichAnimeQualityStreams({ primaryUrl, lang, tmdbMapping }) {
  const key = `${lang}|${primaryUrl}|${tmdbMapping?.type || ''}|${tmdbMapping?.tmdbId || ''}|${tmdbMapping?.season || ''}|${tmdbMapping?.episode || ''}`;
  const hit = qualityCache.get(key);
  if (hit && Date.now() - hit.at < QUALITY_CACHE_TTL_MS) return hit.value;

  const work = enrichAnimeQualityStreamsUncached({ primaryUrl, lang, tmdbMapping })
    .then(value => {
      qualityCache.set(key, { value, at: Date.now() });
      if (qualityCache.size > 400) {
        for (const k of [...qualityCache.keys()].slice(0, 100)) qualityCache.delete(k);
      }
      return value;
    })
    .catch(() => []);

  const budget = new Promise(r => setTimeout(() => r(null), 900));
  const settled = await Promise.race([work, budget]);
  if (settled) return settled;
  work.catch(() => {});
  return [];
}
