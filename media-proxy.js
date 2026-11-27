// Imported first on purpose: it fills process.env from .env before this module reads it.
// (In an ES module every `import` is evaluated before the statements around it, so a
// loader run by the entry script would come too late for the constant below.)
import './load-env.js';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import net from 'node:net';
import zlib from 'node:zlib';

const secret = crypto.createHash('sha256').update(process.env.MEDIA_PROXY_SECRET || crypto.randomBytes(32)).digest();
const providers = {
  megaplay: { referer: 'https://megaplay.buzz/' },
  embedwave: { referer: '' },
  vidwave: { referer: 'https://embed.vidwave.sbs/' },
  vidcore: { referer: 'https://vidspark.to/' },
  cinesrc: { referer: 'https://cinesrc.st/' },
  vidlink: { referer: '' },
  vidsrc: { referer: 'https://vidsrc.pm/' },
  opensubtitles: { referer: '' }
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const privateHost = host => /^(localhost|0\.0\.0\.0|::1)$/i.test(host) || (net.isIP(host) && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80:)/i.test(host));

function cleanHeaders(headers = {}) {
  const clean = {};
  for (const key of ['Cookie', 'Referer', 'Origin', 'User-Agent', 'x-player-key']) {
    const val = headers[key] ?? headers[key.toLowerCase()];
    if (typeof val === 'string' && val.length < 8192) clean[key] = val;
  }
  return clean;
}

function cleanMediaOpts(opts = {}) {
  if (!opts || typeof opts !== 'object') return {};
  const clean = {};
  const off = Number(opts.offsetSec);
  if (Number.isFinite(off) && Math.abs(off) >= 0.02 && Math.abs(off) <= 180) {
    clean.offsetSec = Number(off.toFixed(3));
  }
  const sc = Number(opts.timeScale);
  if (Number.isFinite(sc) && sc >= 0.85 && sc <= 1.15 && Math.abs(sc - 1) >= 0.0004) {
    clean.timeScale = Number(sc.toFixed(6));
  }
  const al = String(opts.audioLang || '').trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(al)) {
    clean.audioLang = al;
  }
  return clean;
}

function decodeHeaders(value) {
  if (!value) return {};
  try { return cleanHeaders(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { throw Error('Invalid media headers.'); }
}

function decodeMediaOpts(value) {
  if (!value) return {};
  try { return cleanMediaOpts(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
  catch { throw Error('Invalid media options.'); }
}

const signature = (url, provider, headers = {}, opts = {}) => {
  const ch = cleanHeaders(headers);
  const co = cleanMediaOpts(opts);
  const suffix = Object.keys(co).length ? '\n' + JSON.stringify(co) : '';
  return crypto.createHmac('sha256', secret).update(provider + '\n' + url + '\n' + JSON.stringify(ch) + suffix).digest('hex').slice(0, 40);
};

export function mediaUrl(url, provider, headers = {}, opts = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !providers[provider] || privateHost(parsed.hostname)) throw Error('Unsupported media URL.');
  const clean = cleanHeaders(headers);
  const cleanOpts = cleanMediaOpts(opts);
  const params = new URLSearchParams({ provider, url: parsed.href, sig: signature(parsed.href, provider, clean, cleanOpts) });
  if (Object.keys(clean).length) params.set('h', Buffer.from(JSON.stringify(clean)).toString('base64url'));
  if (Object.keys(cleanOpts).length) params.set('o', Buffer.from(JSON.stringify(cleanOpts)).toString('base64url'));
  return '/api/media?' + params;
}

function validSignature(value, url, provider, headers, opts = {}) {
  if (!/^[a-f0-9]{40}$/.test(value || '')) return false;
  const expected = Buffer.from(signature(url, provider, headers, opts));
  const actual = Buffer.from(value);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function safeRemote(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || privateHost(parsed.hostname)) throw Error('Unsafe media URL.');
  return parsed;
}

// Next-segment lookahead prefetch + bounded RAM hot cache to eliminate buffering stalls
const MAX_NEXT_MAP = 2400;
const MAX_HOT_SEGMENTS = 18;
const MAX_PREFETCH_BYTES = 4 * 1024 * 1024;
const HOT_TTL_MS = 45_000;

const nextSegmentMap = new Map();
const hotSegmentCache = new Map();
const prefetchInflight = new Set();

function recordNextSegment(curUrl, nextUrl, provider, headers) {
  nextSegmentMap.set(curUrl, { nextUrl, provider, headers, time: Date.now() });
  if (nextSegmentMap.size > MAX_NEXT_MAP) nextSegmentMap.delete(nextSegmentMap.keys().next().value);
}
function getHotSegment(cacheKey) {
  const hit = hotSegmentCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.time > HOT_TTL_MS) {
    hotSegmentCache.delete(cacheKey);
    return null;
  }
  return hit;
}
function putHotSegment(cacheKey, buf, type) {
  hotSegmentCache.set(cacheKey, { buf, type, time: Date.now() });
  while (hotSegmentCache.size > MAX_HOT_SEGMENTS) {
    hotSegmentCache.delete(hotSegmentCache.keys().next().value);
  }
}

function upstreamHeaders(provider, headers, range) {
  const config = providers[provider] || {};
  const clean = cleanHeaders(headers);
  const out = {
    ...(config.referer ? { Referer: config.referer } : {}),
    ...(config.origin ? { Origin: config.origin } : {}),
    ...clean,
    'User-Agent': clean['User-Agent'] || config.ua || UA,
    ...(range ? { Range: range } : {})
  };
  if (out.Referer === '') delete out.Referer;
  if (out.Origin === '') delete out.Origin;
  return out;
}

function unwrapDisguisedMpegTs(buf) {
  if (!buf || buf.length < 564) return { buf, unwrapped: false };
  if (buf[0] === 0x47 && buf[188] === 0x47 && buf[376] === 0x47) return { buf, unwrapped: false };
  const limit = Math.min(buf.length - 564, 2048);
  for (let i = 1; i <= limit; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) {
      return { buf: buf.subarray(i), unwrapped: true };
    }
  }
  return { buf, unwrapped: false };
}

function triggerPrefetchNext(curHref) {
  const meta = nextSegmentMap.get(curHref);
  if (!meta?.nextUrl) return;
  const { nextUrl, provider, headers } = meta;
  const nextCacheKey = provider + ':' + nextUrl;
  if (getHotSegment(nextCacheKey) || prefetchInflight.has(nextCacheKey)) return;
  let parsed;
  try { parsed = safeRemote(nextUrl); } catch { return; }
  prefetchInflight.add(nextCacheKey);
  fetch(parsed, { headers: upstreamHeaders(provider, headers), redirect: 'follow', signal: AbortSignal.timeout(9000) })
    .then(async r => {
      if (!r.ok) return;
      const cl = Number(r.headers.get('content-length') || 0);
      if (cl > MAX_PREFETCH_BYTES) {
        r.body?.cancel?.().catch(() => {});
        return;
      }
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 0 && ab.byteLength <= MAX_PREFETCH_BYTES) {
        let ct = r.headers.get('content-type') || 'video/mp2t';
        let rawBuf = Buffer.from(ab);
        if (!ct.toLowerCase().includes('mpegurl') && !rawBuf.subarray(0, 7).toString('utf8').startsWith('#EXTM3U')) {
          const tsCheck = unwrapDisguisedMpegTs(rawBuf);
          if (tsCheck.unwrapped) {
            rawBuf = Buffer.from(tsCheck.buf);
            ct = 'video/mp2t';
          }
          putHotSegment(nextCacheKey, rawBuf, ct);
        }
      }
    })
    .catch(() => {})
    .finally(() => prefetchInflight.delete(nextCacheKey));
}

const HEIGHT_TO_DIMS = {
  2160: '3840x2160',
  1440: '2560x1440',
  1080: '1920x1080',
  720: '1280x720',
  576: '1024x576',
  540: '960x540',
  480: '854x480',
  360: '640x360',
  240: '426x240'
};

function inferResolutionForVariant(infLine, uriLine = '') {
  const combined = `${infLine} ${uriLine}`;
  if (/\b(?:4k|uhd|2160p?)\b/i.test(combined)) return HEIGHT_TO_DIMS[2160];
  if (/\b(?:2k|qhd|1440p?)\b/i.test(combined)) return HEIGHT_TO_DIMS[1440];
  const nameMatch = infLine.match(/(?:NAME|LABEL)=["']?[^"']*?\b(2160|1440|1080|720|576|540|480|360|240)p?\b/i);
  if (nameMatch && HEIGHT_TO_DIMS[nameMatch[1]]) return HEIGHT_TO_DIMS[nameMatch[1]];
  const uriMatch = uriLine.match(/(?:^|\/|[_-])(2160|1440|1080|720|576|540|480|360|240)p?(?:\/|\.m3u8|[_-]|$)/i);
  if (uriMatch && HEIGHT_TO_DIMS[uriMatch[1]]) return HEIGHT_TO_DIMS[uriMatch[1]];
  return null;
}

const AUDIO_PIN_PATTERNS = {
  hi: /LANGUAGE="(?:hi|hin|hindi)(?:[-_"][^"]*)?"|NAME="[^"]*(?:hindi|हिन्दी|\bhin\b)/i,
  en: /LANGUAGE="(?:en|eng|english)(?:[-_"][^"]*)?"|NAME="[^"]*(?:english|\beng\b)/i,
  ta: /LANGUAGE="(?:ta|tam|tamil)(?:[-_"][^"]*)?"|NAME="[^"]*(?:tamil|தமிழ்|\btam\b)/i,
  te: /LANGUAGE="(?:te|tel|telugu)(?:[-_"][^"]*)?"|NAME="[^"]*(?:telugu|తెలుగు|\btel\b)/i,
  ml: /LANGUAGE="(?:ml|mal|malayalam)(?:[-_"][^"]*)?"|NAME="[^"]*(?:malayalam|\bmal\b)/i,
  kn: /LANGUAGE="(?:kn|kan|kannada)(?:[-_"][^"]*)?"|NAME="[^"]*(?:kannada|\bkan\b)/i,
  bn: /LANGUAGE="(?:bn|ben|bengali)(?:[-_"][^"]*)?"|NAME="[^"]*(?:bengali|bangla|\bben\b)/i,
  es: /LANGUAGE="(?:es|spa|spanish)(?:[-_"][^"]*)?"|NAME="[^"]*(?:spanish|espa[nñ]ol|latino)/i,
  fr: /LANGUAGE="(?:fr|fra|fre|french)(?:[-_"][^"]*)?"|NAME="[^"]*(?:french|fran[cç]ais)/i,
  de: /LANGUAGE="(?:de|deu|ger|german)(?:[-_"][^"]*)?"|NAME="[^"]*(?:german|deutsch)/i,
  pt: /LANGUAGE="(?:pt|por|portuguese)(?:[-_"][^"]*)?"|NAME="[^"]*(?:portuguese|dublado)/i,
  ja: /LANGUAGE="(?:ja|jpn|japanese)(?:[-_"][^"]*)?"|NAME="[^"]*(?:japanese|\bjpn\b)/i,
  ko: /LANGUAGE="(?:ko|kor|korean)(?:[-_"][^"]*)?"|NAME="[^"]*(?:korean|\bkor\b)/i
};

function pinMasterAudioLanguage(text, audioLang) {
  if (!audioLang || !/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO/i.test(text)) return text;
  const rx = AUDIO_PIN_PATTERNS[audioLang] || new RegExp(`LANGUAGE="${audioLang}(?:[-_"][^"]*)?"`, 'i');
  const rawLines = text.split(/\r?\n/);
  const matchingIndices = [];
  const matchingGroups = new Set();

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i].trim();
    if (!l.startsWith('#EXT-X-MEDIA:') || !/TYPE=AUDIO/i.test(l)) continue;
    if (rx.test(l)) {
      matchingIndices.push(i);
      const grp = l.match(/GROUP-ID="([^"]+)"/i)?.[1];
      if (grp) matchingGroups.add(grp);
    }
  }
  if (!matchingIndices.length) return text;

  const promotedGroups = new Set();
  const out = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i].trim();
    if (l.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(l)) {
      const grp = l.match(/GROUP-ID="([^"]+)"/i)?.[1] || '';
      if (matchingGroups.has(grp)) {
        if (!rx.test(l)) continue;
        let updated = l
          .replace(/,?\bDEFAULT=(?:YES|NO)/gi, '')
          .replace(/,?\bAUTOSELECT=(?:YES|NO)/gi, '');
        if (!promotedGroups.has(grp)) {
          promotedGroups.add(grp);
          updated = updated.replace(/^#EXT-X-MEDIA:/i, '#EXT-X-MEDIA:DEFAULT=YES,AUTOSELECT=YES,');
        } else {
          updated = updated.replace(/^#EXT-X-MEDIA:/i, '#EXT-X-MEDIA:DEFAULT=NO,AUTOSELECT=NO,');
        }
        out.push(updated);
        continue;
      }
    }
    out.push(rawLines[i]);
  }
  return out.join('\n');
}

function normalizeMasterResolutions(text) {
  if (!/#EXT-X-STREAM-INF/i.test(text)) return text;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('#EXT-X-STREAM-INF:') || /\bRESOLUTION=\d+x\d+/i.test(trimmed)) continue;
    let nextUri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (!cand) continue;
      if (!cand.startsWith('#')) nextUri = cand;
      break;
    }
    const inferred = inferResolutionForVariant(trimmed, nextUri);
    if (inferred) {
      lines[i] = trimmed.replace(/^#EXT-X-STREAM-INF:/i, `#EXT-X-STREAM-INF:RESOLUTION=${inferred},`);
    }
  }

  // Reorder #EXT-X-STREAM-INF + URI pairs so Auto starts immediately in crisp 1080p Full HD while keeping 4K/720p/480p selectable
  const headerLines = [];
  const variantPairs = [];
  const footerLines = [];
  let idx = 0;
  while (idx < lines.length) {
    const l = lines[idx].trim();
    if (l.startsWith('#EXT-X-STREAM-INF:')) break;
    headerLines.push(lines[idx]);
    idx++;
  }
  let canSort = true;
  while (idx < lines.length) {
    const l = lines[idx].trim();
    if (!l) { idx++; continue; }
    if (l.startsWith('#EXT-X-STREAM-INF:')) {
      const inf = lines[idx];
      idx++;
      while (idx < lines.length && !lines[idx].trim()) idx++;
      if (idx < lines.length && !lines[idx].trim().startsWith('#')) {
        const uri = lines[idx];
        const resMatch = inf.match(/\bRESOLUTION=(\d+)x(\d+)/i);
        const bwMatch = inf.match(/\bBANDWIDTH=(\d+)/i);
        const w = resMatch ? Number(resMatch[1]) : 0;
        const h = resMatch ? Number(resMatch[2]) : 0;
        const area = w * h;
        const bw = bwMatch ? Number(bwMatch[1]) : 0;
        const is4kOr2k = w >= 3200 || h >= 1250;
        const startupRank = !is4kOr2k && (h === 1080 || (w >= 1800 && w <= 2650)) ? 2 : (!is4kOr2k ? 1 : 0);
        variantPairs.push({ inf, uri, area, bw, startupRank });
        idx++;
        continue;
      }
      canSort = false;
      break;
    }
    footerLines.push(lines[idx]);
    idx++;
  }

  if (canSort && variantPairs.length > 1) {
    const has1080Or720 = variantPairs.some(v => v.startupRank >= 1 && v.area >= 600_000);
    variantPairs.sort((a, b) => {
      if (has1080Or720 && a.startupRank !== b.startupRank) return b.startupRank - a.startupRank;
      return (b.area - a.area) || (b.bw - a.bw);
    });
    return [
      ...headerLines,
      ...variantPairs.flatMap(v => [v.inf, v.uri]),
      ...footerLines
    ].join('\n');
  }
  return lines.join('\n');
}

function rewritePlaylist(rawText, base, provider, headers, audioLang = '') {
  let text = normalizeMasterResolutions(rawText);
  const isMaster = /#EXT-X-STREAM-INF/i.test(text);
  if (isMaster && audioLang) {
    text = pinMasterAudioLanguage(text, audioLang);
  }
  const segUrls = [];
  const out = text.split(/(\r?\n)/).map(part => {
    if (/^\r?\n$/.test(part)) return part;
    const value = part.trim();
    if (!value) return part;
    if (value.startsWith('#')) {
      return part.replace(/URI=(["'])(.*?)\1/g, (match, quote, uri) => {
        try { return `URI=${quote}${mediaUrl(new URL(uri, base).href, provider, headers)}${quote}`; }
        catch { return match; }
      });
    }
    try {
      const abs = new URL(value, base).href;
      if (!isMaster) segUrls.push(abs);
      return mediaUrl(abs, provider, headers);
    } catch {
      return part;
    }
  }).join('');

  if (!isMaster && segUrls.length > 1) {
    for (let i = 0; i < segUrls.length - 1; i++) {
      recordNextSegment(segUrls[i], segUrls[i + 1], provider, headers);
    }
  }
  return out;
}

const CUE_LINE_RX = /^((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})(.*)$/;
const SUB_WATERMARK_RX = /osdb\.link|opensubtitles\.(?:org|com)|ai\.opensubtitles|getray\.app|subtitles?\s+by\s+opensubtitles|addic7ed\.com|subscene\.com|yts\.(?:mx|lt|ag)|yify|podnapisi\.net|subdl\.com|synced\s+and\s+corrected\s+by/i;

function parseRawSubSeconds(ts) {
  const m = String(ts || '').trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  const hh = Number(m[1] || 0);
  const mm = Number(m[2] || 0);
  const ss = Number(m[3] || 0);
  const ms = Number(m[4].padEnd(3, '0'));
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function formatVttSeconds(sec) {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalMs = Math.round(clamped * 1000);
  const hh = String(Math.floor(totalMs / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((totalMs % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((totalMs % 60_000) / 1000)).padStart(2, '0');
  const ms = String(totalMs % 1000).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function convertSubtitleBufferToVtt(buffer, encodingHint = 'utf-8', opts = {}) {
  let raw = buffer;
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    try { raw = zlib.gunzipSync(raw); } catch {}
  }
  if (raw.length > 8 * 1024 * 1024) throw Error('Subtitle file too large');
  const encoding = String(encodingHint || 'utf-8').replace(/^cp(\d+)$/i, 'windows-$1');
  let text;
  try { text = new TextDecoder(encoding).decode(raw); }
  catch { text = new TextDecoder().decode(raw); }
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();

  // Video.js VHS normalizes video.currentTime to 0.000s, so standalone WebVTT X-TIMESTAMP-MAP headers
  // (e.g. MPEGTS:900000 = +10s packager base PTS) must NOT artificially shift cues.
  const scale = Number.isFinite(Number(opts.timeScale)) && Number(opts.timeScale) > 0 ? Number(opts.timeScale) : 1;
  const offsetSec = Number.isFinite(Number(opts.offsetSec)) ? Number(opts.offsetSec) : 0;

  // Line-by-line cue scanner: works for both standard blank-line VTT/SRT and single-newline VTT/SRT
  const lines = cleaned.split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || /^WEBVTT\b|^X-TIMESTAMP-MAP/i.test(trimmed)) {
      i++;
      continue;
    }
    if (/^(?:NOTE|STYLE|REGION)\b/i.test(trimmed)) {
      i++;
      while (i < lines.length && lines[i].trim()) i++;
      continue;
    }
    const m = trimmed.match(CUE_LINE_RX);
    if (!m) {
      i++;
      continue;
    }
    const rawStart = parseRawSubSeconds(m[1]);
    const rawEnd = parseRawSubSeconds(m[2]);
    i++;
    const bodyLines = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur) { i++; break; }
      if (CUE_LINE_RX.test(cur)) break;
      if (/^\d+$/.test(cur) && i + 1 < lines.length && CUE_LINE_RX.test(lines[i + 1].trim())) {
        i++;
        break;
      }
      bodyLines.push(cur);
      i++;
    }
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) continue;
    const adjStart = Math.max(0, rawStart * scale + offsetSec);
    const adjEnd = Math.max(adjStart + 0.08, rawEnd * scale + offsetSec);
    if (adjEnd <= 0.05) continue;
    const body = bodyLines.join('\n').replace(/\{\\[^}]+\}/g, '').trim();
    if (!body || SUB_WATERMARK_RX.test(body)) continue;
    cues.push(`${formatVttSeconds(adjStart)} --> ${formatVttSeconds(adjEnd)}\n${body}`);
  }

  if (cues.length) return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
  return 'WEBVTT\n\n' + cleaned.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') + '\n';
}

function pipeUpstream(upstream, res, cacheHeader = null) {
  const wasEncoded = Boolean(upstream.headers.get('content-encoding') && !/^identity$/i.test(upstream.headers.get('content-encoding')));
  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': cacheHeader || upstream.headers.get('cache-control') || 'private, max-age=600',
    'Access-Control-Allow-Origin': '*'
  };
  for (const key of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    if (key === 'content-length' && wasEncoded) continue;
    const value = upstream.headers.get(key);
    if (value) headers[key.replace(/(^|-)(\w)/g, (_, a, b) => a + b.toUpperCase())] = value;
  }
  res.writeHead(upstream.status, headers);
  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body);
  res.once('close', () => { if (!res.writableEnded) stream.destroy(); });
  stream.on('error', () => { if (!res.destroyed) res.destroy(); }).pipe(res);
}

const playlistCache = new Map();
const initSegmentCache = new Map();
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

async function fetchWithRetry(parsed, reqHeaders, clientState, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (clientState.closed) throw Error('Client closed connection.');
    const controller = new AbortController();
    const onClose = () => controller.abort();
    clientState.onAbort = onClose;
    const timer = setTimeout(() => controller.abort(), 16_000);
    try {
      const upstream = await fetch(parsed, { headers: reqHeaders, signal: controller.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (RETRYABLE_STATUS.has(upstream.status) && attempt + 1 < maxAttempts && !clientState.closed) {
        const waitMs = upstream.status === 429 ? 900 * (attempt + 1) : 260 * (attempt + 1);
        upstream.body?.cancel().catch(() => {});
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return upstream;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (clientState.closed || attempt + 1 >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 140 * (attempt + 1)));
    }
  }
  throw lastError || Error('Upstream fetch failed.');
}

async function fetchMedia(req, res, target, provider, headers, opts = {}) {
  let upstream;
  const clientState = { closed: false, onAbort: null };
  res.once('close', () => {
    if (!res.writableEnded) {
      clientState.closed = true;
      clientState.onAbort?.();
    }
  });
  try {
    const parsed = safeRemote(target);
    const playlistKey = provider + ':' + (opts.audioLang || '') + ':' + parsed.href;
    const segKey = provider + ':' + parsed.href;
    const hit = playlistCache.get(playlistKey);
    if (hit && Date.now() - hit.time < 90_000) {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'private, max-age=30', 'Access-Control-Allow-Origin': '*' });
      return res.end(hit.body);
    }

    if (!req.headers.range) {
      const hotSeg = getHotSegment(segKey);
      if (hotSeg) {
        triggerPrefetchNext(parsed.href);
        res.writeHead(200, {
          'Content-Type': hotSeg.type || 'video/mp2t',
          'Content-Length': String(hotSeg.buf.byteLength),
          'Cache-Control': 'private, max-age=600',
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Cache': 'HIT'
        });
        return res.end(hotSeg.buf);
      }
    }

    const isInitMap = !req.headers.range && /\/init[^/]*\.mp4(?:\?|$)/i.test(parsed.pathname + parsed.search);
    if (isInitMap) {
      const initHit = initSegmentCache.get(segKey);
      if (initHit && Date.now() - initHit.time < 30 * 60_000) {
        res.writeHead(200, {
          'Content-Type': initHit.type || 'video/mp4',
          'Content-Length': String(initHit.buf.byteLength),
          'Cache-Control': 'private, max-age=1800',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(initHit.buf);
      }
    }

    upstream = await fetchWithRetry(parsed, upstreamHeaders(provider, headers, req.headers.range), clientState, 3);
    const final = safeRemote(upstream.url || parsed);
    const type = String(upstream.headers.get('content-type') || '').toLowerCase();
    const playlist = /\.m3u8(?:\?|$)/i.test(final.pathname + final.search) || /\.m3u8(?:\?|$)/i.test(parsed.pathname + parsed.search) || type.includes('mpegurl');
    if (playlist && upstream.ok) {
      const text = await upstream.text();
      if (!text.trimStart().startsWith('#EXTM3U')) throw Error('The provider returned an invalid playlist.');
      const body = rewritePlaylist(text, final.href, provider, headers, opts.audioLang || '');
      if (/#EXT-X-(?:STREAM-INF|ENDLIST)/.test(text)) {
        playlistCache.set(playlistKey, { body, time: Date.now() });
        if (playlistCache.size > 200) playlistCache.delete(playlistCache.keys().next().value);
      }
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'private, max-age=15', 'Access-Control-Allow-Origin': '*' });
      return res.end(body);
    }

    const isSubtitle = provider === 'opensubtitles'
      || /[?&]format=(?:srt|vtt)(?:&|$)/i.test(final.search)
      || /\.(?:srt|vtt)(?:$|\?)/i.test(final.href)
      || /\.(?:srt|vtt)(?:$|\?)/i.test(parsed.href)
      || /\/download\/src-api\//i.test(final.pathname)
      || final.hostname.endsWith('opensubtitles.org')
      || type.includes('text/vtt')
      || type.includes('application/x-subrip');

    if (isSubtitle && upstream.ok) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const encoding = final.searchParams.get('encoding') || parsed.searchParams.get('encoding') || 'utf-8';
      const vtt = convertSubtitleBufferToVtt(buffer, encoding, opts);
      res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*' });
      return res.end(vtt);
    }

    if (!upstream.ok) {
      upstream.body?.cancel().catch(() => {});
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Upstream media unavailable (' + upstream.status + ').');
    }

    // Disguised playlist & PNG/JPEG-wrapped MPEG-TS safeguard: inspect first bytes on non-range requests
    const maybeDisguisedPlaylist = !req.headers.range && !isInitMap
      && ((!type.startsWith('video/') && !type.startsWith('audio/')) || /\.(?:png|jpe?g|gif|webp|bmp)/i.test(final.pathname + final.search))
      && !/\.(?:m4s|mp4|aac|mp3|vtt|srt|woff2?)$/i.test(final.pathname);

    if (maybeDisguisedPlaylist && upstream.body) {
      const reader = upstream.body.getReader();
      let headParts = [];
      let headLen = 0;
      let streamDone = false;
      while (headLen < 1024) {
        const step = await reader.read();
        if (step.value?.byteLength) {
          const b = Buffer.from(step.value);
          headParts.push(b);
          headLen += b.length;
        }
        if (step.done) {
          streamDone = true;
          break;
        }
      }
      let firstBuf = headParts.length === 1 ? headParts[0] : Buffer.concat(headParts);
      if (firstBuf.subarray(0, 32).toString('utf8').trimStart().startsWith('#EXTM3U')) {
        const chunks = [firstBuf];
        if (!streamDone) {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            if (next.value) chunks.push(Buffer.from(next.value));
          }
        }
        const text = Buffer.concat(chunks).toString('utf8');
        const body = rewritePlaylist(text, final.href, provider, headers, opts.audioLang || '');
        if (/#EXT-X-(?:STREAM-INF|ENDLIST)/.test(text)) {
          playlistCache.set(playlistKey, { body, time: Date.now() });
          if (playlistCache.size > 200) playlistCache.delete(playlistCache.keys().next().value);
        }
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'private, max-age=15', 'Access-Control-Allow-Origin': '*' });
        return res.end(body);
      }

      const headAscii = firstBuf.subarray(0, 96).toString('utf8').replace(/^\uFEFF/, '').trimStart();
      if (/^WEBVTT\b/i.test(headAscii) || /^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(headAscii)) {
        const chunks = [firstBuf];
        if (!streamDone) {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            if (next.value) chunks.push(Buffer.from(next.value));
          }
        }
        const vtt = convertSubtitleBufferToVtt(Buffer.concat(chunks), 'utf-8', opts);
        res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*' });
        return res.end(vtt);
      }

      const tsCheck = unwrapDisguisedMpegTs(firstBuf);
      if (tsCheck.unwrapped) {
        firstBuf = tsCheck.buf;
      }

      triggerPrefetchNext(parsed.href);
      const wasEncoded = Boolean(upstream.headers.get('content-encoding') && !/^identity$/i.test(upstream.headers.get('content-encoding')));
      const outHeaders = {
        'Content-Type': tsCheck.unwrapped ? 'video/mp2t' : (upstream.headers.get('content-type') || 'application/octet-stream'),
        'Cache-Control': 'private, max-age=600',
        'Access-Control-Allow-Origin': '*'
      };
      for (const key of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        if (key === 'content-length' && (wasEncoded || tsCheck.unwrapped)) continue;
        const value = upstream.headers.get(key);
        if (value) outHeaders[key.replace(/(^|-)(\w)/g, (_, a, b) => a + b.toUpperCase())] = value;
      }
      res.writeHead(upstream.status, outHeaders);
      if (firstBuf.length) res.write(firstBuf);
      if (streamDone) return res.end();
      (async () => {
        try {
          while (!clientState.closed) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && !res.writableEnded) {
              if (!res.write(Buffer.from(value))) {
                await new Promise(resolve => res.once('drain', resolve));
              }
            }
          }
          if (!res.writableEnded) res.end();
        } catch {
          if (!res.destroyed) res.destroy();
        }
      })();
      return;
    }

    if (isInitMap) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength > 0 && buf.byteLength <= 262_144) {
        initSegmentCache.set(segKey, { buf, type: upstream.headers.get('content-type') || 'video/mp4', time: Date.now() });
        if (initSegmentCache.size > 80) initSegmentCache.delete(initSegmentCache.keys().next().value);
      }
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'private, max-age=1800',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buf);
    }

    if (!req.headers.range) triggerPrefetchNext(parsed.href);
    return pipeUpstream(upstream, res, req.headers.range ? 'no-store' : 'private, max-age=600');
  } catch (error) {
    upstream?.body?.cancel().catch(() => {});
    if (clientState.closed || res.headersSent) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Media request failed: ' + error.message);
  }
}

export function handleMedia(req, res, url) {
  const target = url.searchParams.get('url') || '';
  const provider = url.searchParams.get('provider') || '';
  const sig = url.searchParams.get('sig') || '';
  let headers = {}, opts = {};
  try {
    const parsed = safeRemote(target);
    headers = decodeHeaders(url.searchParams.get('h'));
    opts = decodeMediaOpts(url.searchParams.get('o'));
    if (!providers[provider] || !validSignature(sig, parsed.href, provider, headers, opts)) throw Error('Invalid media signature.');
  } catch (error) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(error.message);
  }
  return fetchMedia(req, res, target, provider, headers, opts);
}

// Short-lived sessions repackaging static fMP4 DASH manifests as HLS for Video.js VHS.
const dashSessions = new Map();
const dashManifests = new Map();
export function dashUrl(url, provider, headers = {}) {
  const parsed = safeRemote(url);
  if (!providers[provider]) throw Error('Unsupported DASH provider.');
  const id = crypto.randomBytes(18).toString('base64url');
  dashSessions.set(id, { url: parsed.href, provider, headers: cleanHeaders(headers), expires: Date.now() + 50 * 60_000 });
  if (dashSessions.size > 100) for (const [key, session] of dashSessions) if (session.expires < Date.now() || dashSessions.size > 100) { dashSessions.delete(key); dashManifests.delete(key); }
  return `/api/dash/${provider}/${id}/master.m3u8`;
}
function xmlAttrs(source = '') {
  const attrs = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return attrs;
}
function isoDuration(value = '') {
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return 0;
  return (Number(match[1] || 0) * 86400) + (Number(match[2] || 0) * 3600) + (Number(match[3] || 0) * 60) + Number(match[4] || 0);
}
function parseSegmentTimeline(timelineXml, timescale) {
  if (!timelineXml || !timescale) return null;
  const durations = [];
  for (const sMatch of timelineXml.matchAll(/<S\b([^/>]*)\/?>/gi)) {
    const sAttrs = xmlAttrs(sMatch[1]);
    const d = Number(sAttrs.d || 0);
    if (!(d > 0)) continue;
    const repeat = Math.max(0, Number(sAttrs.r || 0));
    const sec = d / timescale;
    for (let k = 0; k <= repeat && durations.length <= 20000; k++) durations.push(sec);
  }
  return durations.length ? durations : null;
}

function parseDashManifest(text) {
  const mpd = xmlAttrs(text.match(/<MPD\b([^>]*)>/i)?.[1]);
  const duration = isoDuration(mpd.mediaPresentationDuration);
  const videos = [], audios = [];
  for (const set of text.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)) {
    const setAttrs = xmlAttrs(set[1]), body = set[2];
    const setTemplateTag = body.match(/<SegmentTemplate\b([^>]*)(?:\/>|>([\s\S]*?)<\/SegmentTemplate>)/i);
    const setTemplate = setTemplateTag?.[1] || '';
    const setTimelineXml = setTemplateTag?.[2] || '';
    const setBase = body.match(/<BaseURL>([\s\S]*?)<\/BaseURL>/i)?.[1]?.trim() || '';
    for (const representation of body.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)) {
      const attrs = xmlAttrs(representation[1]), repBody = representation[2];
      const repTemplateTag = repBody.match(/<SegmentTemplate\b([^>]*)(?:\/>|>([\s\S]*?)<\/SegmentTemplate>)/i);
      const template = xmlAttrs(repTemplateTag?.[1] || setTemplate);
      const timelineXml = repTemplateTag?.[2] || setTimelineXml;
      const timescale = Number(template.timescale || 1);
      const timelineDurations = parseSegmentTimeline(timelineXml, timescale);
      const segmentDuration = Number(template.duration) / timescale;
      if (!template.media || !template.initialization) continue;
      if (!timelineDurations && (!Number.isFinite(segmentDuration) || segmentDuration <= 0 || !duration)) continue;
      const base = repBody.match(/<BaseURL>([\s\S]*?)<\/BaseURL>/i)?.[1]?.trim() || setBase;
      const kind = (setAttrs.contentType || attrs.mimeType || '').startsWith('audio') ? 'audio' : 'video';
      const item = {
        id: String(attrs.id || (kind === 'video' ? videos.length : audios.length)),
        kind,
        width: Number(attrs.width || setAttrs.maxWidth || 0),
        height: Number(attrs.height || setAttrs.maxHeight || 0),
        bandwidth: Number(attrs.bandwidth || 0),
        codecs: attrs.codecs || setAttrs.codecs || '',
        language: setAttrs.lang || 'und',
        segmentDuration: Number.isFinite(segmentDuration) && segmentDuration > 0 ? segmentDuration : (timelineDurations ? Math.max(...timelineDurations) : 4),
        timelineDurations,
        startNumber: Number(template.startNumber || 1),
        media: base + template.media,
        initialization: base + template.initialization
      };
      (kind === 'audio' ? audios : videos).push(item);
    }
  }
  if (!videos.length) throw Error('This DASH manifest cannot be repackaged as HLS.');
  return { duration, videos, audios };
}
function segmentName(template, representation, number) {
  return template.replace(/\$RepresentationID\$/g, representation.id).replace(/\$Number(?:%0(\d+)d)?\$/g, (match, width) => String(number).padStart(Number(width || 1), '0'));
}
function resolveDashSegUri(rawSeg, session) {
  if (!session) return rawSeg;
  const base = new URL(session.url);
  const target = new URL(rawSeg, base);
  if (!target.search && base.search) target.search = base.search;
  return mediaUrl(target.href, session.provider, session.headers);
}
function dashMediaPlaylist(manifest, representation, session = null) {
  const timeline = representation.timelineDurations;
  const count = timeline ? timeline.length : Math.ceil(manifest.duration / representation.segmentDuration);
  if (count > 20000) throw Error('DASH playlist is too large.');
  const initRaw = segmentName(representation.initialization, representation, representation.startNumber);
  const initUri = resolveDashSegUri(initRaw, session);
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', `#EXT-X-TARGETDURATION:${Math.ceil(representation.segmentDuration)}`, '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-INDEPENDENT-SEGMENTS', `#EXT-X-MAP:URI="${initUri}"`];
  for (let index = 0; index < count; index++) {
    const segDur = timeline ? timeline[index] : Math.min(representation.segmentDuration, manifest.duration - index * representation.segmentDuration);
    const segRaw = segmentName(representation.media, representation, representation.startNumber + index);
    lines.push(`#EXTINF:${Math.max(0.01, segDur).toFixed(6)},`, resolveDashSegUri(segRaw, session));
  }
  lines.push('#EXT-X-ENDLIST', '');
  return lines.join('\n');
}
function dashMasterPlaylist(manifest) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];
  const audioBandwidth = manifest.audios[0]?.bandwidth || 0;
  for (const [index, audio] of manifest.audios.entries()) lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="mp-audio",NAME="Audio ${index + 1}",LANGUAGE="${audio.language}",DEFAULT=${index ? 'NO' : 'YES'},AUTOSELECT=YES,URI="audio-${audio.id}.m3u8"`);
  for (const video of [...manifest.videos].sort((a, b) => b.height - a.height)) {
    const codecs = [video.codecs, manifest.audios[0]?.codecs].filter(Boolean).join(',');
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${video.bandwidth + audioBandwidth}${video.width && video.height ? `,RESOLUTION=${video.width}x${video.height}` : ''}${codecs ? `,CODECS="${codecs}"` : ''}${manifest.audios.length ? ',AUDIO="mp-audio"' : ''}`, `video-${video.id}.m3u8`);
  }
  return lines.join('\n') + '\n';
}
async function dashManifest(id, session) {
  const cached = dashManifests.get(id);
  if (cached && Date.now() - cached.time < 5 * 60_000) return cached.value;
  const response = await fetch(session.url, { headers: upstreamHeaders(session.provider, session.headers), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw Error('DASH manifest unavailable (' + response.status + ').');
  const text = await response.text();
  const final = safeRemote(response.url || session.url);
  session.url = final.href;
  const value = parseDashManifest(text);
  dashManifests.set(id, { value, time: Date.now() });
  return value;
}
export async function handleDash(req, res, url) {
  try {
    const match = url.pathname.match(/^\/api\/dash\/([a-z0-9_]+)\/([A-Za-z0-9_-]+)\/(.+)$/);
    if (!match) throw Error('Invalid DASH proxy path.');
    const [, provider, id, relative] = match;
    const session = dashSessions.get(id);
    if (!session || session.expires < Date.now() || session.provider !== provider) throw Error('DASH session expired.');
    if (relative === 'master.m3u8' || /^(?:video|audio)-[^/]+\.m3u8$/.test(relative)) {
      const manifest = await dashManifest(id, session);
      let body;
      if (relative === 'master.m3u8') body = dashMasterPlaylist(manifest);
      else {
        const [kind, representationId] = relative.replace(/\.m3u8$/, '').split('-');
        const representation = (kind === 'video' ? manifest.videos : manifest.audios).find(item => item.id === representationId);
        if (!representation) throw Error('Unknown DASH rendition.');
        body = dashMediaPlaylist(manifest, representation, session);
      }
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(body);
    }
    const base = new URL(session.url);
    const target = new URL(relative, base);
    if (!target.search && base.search) target.search = base.search;
    const directory = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
    if (target.origin !== base.origin || !target.pathname.startsWith(directory)) throw Error('Unsafe DASH segment path.');
    return await fetchMedia(req, res, target.href, provider, session.headers);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('DASH proxy failed: ' + error.message);
  }
}
