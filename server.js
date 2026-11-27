// Must stay the first import: it puts .env into process.env before db.js,
// discord-auth.js and the rest read it. See load-env.js for why an inline loader here
// was too late for every entry point except `node --env-file=… server.js`.
import { describeKey, envFileReport, maskedKeys } from './load-env.js';
import fs from 'node:fs';
import { runtimeDataDir } from './runtime-data.js';
import { dismissHistory } from './history-state.js';
import { ANIME_AUDIO_KEYS, REGIONAL_AUDIO_LANGUAGES } from './audio-languages.js';
import path from 'node:path';
import freekeys from 'freekeys';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { requestTranscription, rivaAvailability, AiError } from './ai-transcription.js';
import { reportPresence } from './presence.js';
import {
  databaseEnabled, upsertDiscordUser, createSession, userForSession, deleteSession,
  publicUser, setReaction, reactionSummary, reactionMapForSeason, pruneSessions, accountState, submitReport
} from './db.js';
import { discordConfigured, authorizeUrl, exchangeCode, fetchProfile, readState as readOAuthState, redirectUriFor } from './discord-auth.js';
import { createGenrePageCache } from './genre-page-cache.js';
import { buildAnimeFamilies } from './anime-families.js';
import { resolveMegaPlayDirect, enrichAnimeQualityStreams, measureMegaHlsDurationSec } from './megaplay-resolver.js';
import { mediaUrl, dashUrl, handleMedia, handleDash } from './media-proxy.js';
import {
  OTT_SERVERS, OTT_SERVER_KEYS, DEFAULT_OTT_SERVER,
  resolveOttWithFallback, resolveAnimeRegionalAudio, resolveSpecialRegionalAnime,
  fetchVidsparkSubtitles, resolveRegionalSubtitles, subtitleTracksForVariant, regionalAudioStatus
} from './ott-resolvers.js';

const root = path.resolve('public');
const db = path.join(runtimeDataDir, 'user.json');
const statesDb = path.join(runtimeDataDir, 'states.json');
const initial = { watchlist: [], history: [] };
if (!fs.existsSync(db)) fs.writeFileSync(db, JSON.stringify(initial));
if (!fs.existsSync(statesDb)) fs.writeFileSync(statesDb, JSON.stringify({ visitors: {}, meta: {} }));
// Cache tokens live in data/ on this machine only. The old MongoDB mirror made
// startup wait on an unreachable host (the app looked "laggy" while it did), so
// it is gone: no MONGODB_URI is read and no remote client is ever created.

const json = (res, data, status = 200, req = null) => {
  let body = JSON.stringify(data), accept = String(req?.headers?.['accept-encoding'] || '');
  if (body.length > 1024 && accept.includes('gzip')) {
    let gz = zlib.gzipSync(body, { level: 4 });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'no-store' });
    return res.end(gz);
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};

// Shared upstream JSON responses are TTL/LRU bounded too: genre scrolling must
// not leave an unbounded second cache behind the bounded page cache.
const cache = new Map(), remoteInflight = new Map();
const REMOTE_CACHE_MAX = 800;

// A cold start used to re-fetch the whole catalog before the first page could
// paint. The upstream JSON bodies are already TTL-bounded and small, so the
// unexpired ones are mirrored to disk and replayed on boot: a restart now costs
// a file read instead of three seconds of upstream round-trips.
const REMOTE_CACHE_STORE = path.join(runtimeDataDir, 'remote-cache.json');
const REMOTE_CACHE_PERSIST_MAX_AGE = 6 * 60 * 60 * 1000;
let remoteCacheDirty = false;
function loadRemoteCacheFromDisk() {
  try {
    const raw = fs.readFileSync(REMOTE_CACHE_STORE, 'utf8');
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return;
    const now = Date.now();
    for (const [url, entry] of Object.entries(saved)) {
      if (!entry || typeof entry.time !== 'number' || !('data' in entry)) continue;
      const ttl = Number(entry.ttl) || 0;
      if (now - entry.time >= ttl) continue;
      cache.set(url, entry);
    }
  } catch {}
}
function saveRemoteCacheToDisk() {
  if (!remoteCacheDirty) return;
  remoteCacheDirty = false;
  try {
    const now = Date.now(), out = {};
    for (const [url, entry] of cache) {
      if (!entry || typeof entry.time !== 'number' || !('data' in entry)) continue;
      const ttl = Number(entry.ttl) || 0;
      if (now - entry.time >= ttl || now - entry.time > REMOTE_CACHE_PERSIST_MAX_AGE) continue;
      out[url] = entry;
    }
    fs.mkdirSync(path.dirname(REMOTE_CACHE_STORE), { recursive: true });
    const tmp = REMOTE_CACHE_STORE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, REMOTE_CACHE_STORE);
  } catch {}
}
loadRemoteCacheFromDisk();
const remoteCacheSaveTimer = setInterval(saveRemoteCacheToDisk, 20000);
remoteCacheSaveTimer.unref?.();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { saveRemoteCacheToDisk(); process.exit(0); });
}
async function remote(url, options = {}) {
  const ttl=options.ttl ?? 300000, hit=cache.get(url);
  if (hit && Date.now()-hit.time < (hit.ttl ?? ttl)) {
    cache.delete(url);cache.set(url,hit);return hit.data;
  }
  if (hit) cache.delete(url);
  if (remoteInflight.has(url)) return remoteInflight.get(url);
  const task=(async()=>{
    const response=await fetch(url,{
      headers:{'User-Agent':'kozuTV/5.0 (catalog app)',...(options.headers||{})},
      signal:AbortSignal.timeout(options.timeout||12000)
    });
    const text=await response.text();
    if (!response.ok) throw Error('Catalog unavailable ('+response.status+')');
    let data;try{data=JSON.parse(text)}catch{throw Error('A catalog service returned an invalid response.')}
    cache.delete(url);cache.set(url,{data,time:Date.now(),ttl});remoteCacheDirty=true;
    while(cache.size>REMOTE_CACHE_MAX)cache.delete(cache.keys().next().value);
    return data;
  })();
  remoteInflight.set(url,task);
  try{return await task}finally{if(remoteInflight.get(url)===task)remoteInflight.delete(url)}
}

const genreNames = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10768: 'War' };
const catalogGenres = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const movieGenreIds = { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53, War: 10752, Western: 37 };
const movieKeywordIds = { Mecha: 10040, Psychological: 272553, 'Slice of Life': 258533, Sports: 6075, Supernatural: 6152 };
const tvGenreIds = { Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 10765, Mystery: 9648, 'Sci-Fi': 10765, War: 10768, Western: 37 };
const tvKeywordIds = { History: 282633, Horror: 315058, Mecha: 10040, Music: 283297, Psychological: 272553, Romance: 9840, 'Slice of Life': 258533, Sports: 6075, Supernatural: 6152, Thriller: 316362 };
const catalogLanguages = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'bn', name: 'Bengali' },
  { code: 'zh', name: 'Chinese' },
  { code: 'de', name: 'German' },
  { code: 'tr', name: 'Turkish' },
  { code: 'th', name: 'Thai' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' }
];
const validLangCodes = new Set(catalogLanguages.map(l => l.code));

const today = () => new Date().toISOString().slice(0, 10);
const releasedDate = value => Boolean(value) && /^\d{4}-\d{2}-\d{2}$/.test(String(value).slice(0, 10)) && String(value).slice(0, 10) <= today();

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|quot|apos|lt|gt|hellip|mdash|ndash);/g, (_, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…', mdash: '—', ndash: '–' })[name]);
}
function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’‘`]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseAiredStartDate(aired, year) {
  const s = String(aired || '').split(/\s+to\s+/i)[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const m1 = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m1) {
    const mo = MONTHS[m1[1].slice(0, 3).toLowerCase()];
    if (mo) return `${m1[3]}-${String(mo).padStart(2, '0')}-${String(m1[2]).padStart(2, '0')}`;
  }
  const m2 = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m2) {
    const mo = MONTHS[m2[1].slice(0, 3).toLowerCase()];
    if (mo) return `${m2[2]}-${String(mo).padStart(2, '0')}-01`;
  }
  if (/^\d{4}$/.test(s) && Number(s) > new Date().getFullYear()) return `${s}-01-01`;
  if (year && Number(year) > new Date().getFullYear()) return `${year}-01-01`;
  return '';
}

const megaCatalogPath = path.resolve('data/megaplay-catalog.json');
const animeOverridesPath = path.resolve('data/anime-episode-overrides.json');
let megaEntries = [], megaAliases = [], animeEpisodeOverrides = {}, permanTitles = {}, shinRegionalTitles = {}, doraRegionalTitles = {};
try { permanTitles = JSON.parse(fs.readFileSync(path.resolve('data/perman-titles.json'), 'utf8')); } catch {}
try { shinRegionalTitles = JSON.parse(fs.readFileSync(path.resolve('data/shinchan-regional-titles.json'), 'utf8')); } catch {}
try { doraRegionalTitles = JSON.parse(fs.readFileSync(path.resolve('data/doraemon-s1-regional.json'), 'utf8')); } catch {}
try {
  let d = JSON.parse(fs.readFileSync(megaCatalogPath));
  megaEntries = Array.isArray(d.entries) ? d.entries : [];
  megaAliases = Array.isArray(d.aliases) ? d.aliases : [];
} catch {}
try {
  animeEpisodeOverrides = JSON.parse(fs.readFileSync(animeOverridesPath, 'utf8')) || {};
} catch {}

// Block legacy duplicate MAL entries that MegaPlay mis-maps (e.g. 501 Doraemon 1973 -> 8687 Doraemon 2005)
const MEGA_BLOCKED_MAL_IDS = new Set(['501', '2471']);
// Cartoons whose regional run does not cover every episode: when an episode has
// no Hindi master we still serve the Japanese/English cut.
const CONTINUE_IN_JP_SHOWS = new Set(['966', '8687', '527']);
const MEGA_REDIRECT_MAL_MAP = new Map([['501', '8687'], ['2471', '8687']]);


// Pokémon provider episode numbers and broadcast regions are not the same as MAL's
// Japanese-series partitions.  Keep provider coordinates intact; do not infer
// regional season numbers from MAL metadata. Decolore overlaps Adventures in
// Unova, and Journeys 137-146 repeats the first ten Master episodes.
const POKEMON_REGIONS = [
  { id:'527', startEp:1, endEp:82, name:'Kanto · Indigo League', region:'Kanto' },
  { id:'527', startEp:83, endEp:118, name:'Orange Islands · Adventures', region:'Orange Islands' },
  { id:'527', startEp:119, endEp:276, name:'Johto · The Johto Journeys', region:'Johto' },
  { id:'1564', startEp:1, endEp:192, name:'Hoenn · Advanced & Battle Frontier', region:'Hoenn' },
  { id:'1565', startEp:1, endEp:191, name:'Sinnoh · Diamond & Pearl', region:'Sinnoh' },
  { id:'9107', startEp:1, endEp:48, name:'Unova · Season 14: Black & White', region:'Unova' },
  { id:'14093', startEp:1, endEp:49, name:'Unova · Season 15: Rival Destinies', region:'Unova' },
  { id:'17115', startEp:1, endEp:45, name:'Unova · Season 16: Adventures in Unova', region:'Unova' },
  { id:'19291', startEp:1, endEp:93, name:'Kalos · XY', region:'Kalos' },
  { id:'31592', startEp:1, endEp:48, name:'Kalos · XYZ', region:'Kalos' },
  { id:'34034', startEp:1, endEp:145, name:'Alola · Sun & Moon', region:'Alola' },
  { id:'40351', startEp:1, endEp:136, name:'Galar & all regions · Journeys', region:'Journeys' },
  { id:'53874', startEp:1, endEp:11, name:'All regions · To Be a Pokémon Master', region:'Journeys' },
  { id:'53876', startEp:1, endEp:156, name:'Paldea & all regions · Horizons', region:'Horizons' }
];
const POKEMON_IDS = new Set([...POKEMON_REGIONS.map(x => x.id), '17873']);
function pokemonEpisodeMetaId(id, n) {
  if (id === '14093') return n <= 36 ? ['9107', n + 48] : ['14093', n - 36];
  if (id === '17115') return n <= 11 ? ['14093', n + 13] : n <= 25 ? ['17115', n - 11] : ['17873', n - 25];
  if (id === '40351' && n >= 137 && n <= 147) return ['53874', n - 136];
  return [id, n];
}

// Every dub language the anime route may expose. Kept in sync with
// REGIONAL_ANIME_WANTED in ott-resolvers.js: a code that is missing here is
// filtered out of the answer even when the source actually carries it.
const ANIME_REGIONAL_LANG_SET = new Set(REGIONAL_AUDIO_LANGUAGES.map(([code])=>code));
const ANIME_VALID_LANG_SET = new Set(ANIME_AUDIO_KEYS);
// The language menu is built from the answer the stream gave, so an option is
// listed only when it can actually play. Order is deliberate: original audio,
// English, then the regional dubs in the order Indian viewers expect.
const ANIME_LANG_ORDER = ANIME_AUDIO_KEYS;
function animeAvailableLangs({ sub = true, dub = true, regional = [] } = {}) {
  const set = new Set();
  if (sub) set.add('sub');
  if (dub) set.add('dub');
  for (const r of regional || []) {
    const key = String(r?.key || '');
    if (ANIME_VALID_LANG_SET.has(key)) set.add(key);
  }
  return ANIME_LANG_ORDER.filter((key) => set.has(key));
}
const SHINCHAN_REGIONAL_EPS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,20,22,23,24,27,28,29,30,31,32,34,35,37,39,44,46,47,50,51,52,53,54,55,56,57,63,64,65,68,69,71,78,79,80,81,85,86,88,96,98,100,101,103,105,106,107,108,109,111,112,115,116,117,122,124,126,127,130,132,142,143,145,146,147,148,150,153,154,155,170,176,183,195,196,198,199,201,203,205,208,209,210,211,215,217,218,219,220,221,222,223,224,225,226,229,237,240,241,242,243,245,248,251,253,256,262,263,264,265,266,267,271,272,274,283,284,287,289,290,291,293,297,298,300,302,303,304,305,306,312,315,316,318,319,323,328,331,332,334,336,347,348,349,350,351,353,354,355,356,357,358,360,361,362,365,366,367,371,372,375,380,381,382];
const SHINCHAN_REGIONAL_TOTAL = SHINCHAN_REGIONAL_EPS.length;
// The provider numbers are not consistently the original Japanese/Indian
// broadcast numbers (some videos are even repeated). Only label sampled matches.
const SHINCHAN_VERIFIED_TITLES = {1:1,2:2,3:3,4:4,8:9,9:11,10:12,12:12,14:18,15:15,17:23,18:19};
let shinRegionalStills = new Set();
try { shinRegionalStills = new Set(fs.readdirSync(path.join(root,'images','episode-stills')).filter(n => /^shinchan-\d{3}\.jpg$/.test(n))); } catch {}
// Shinchan's Hindi run is not the same run as the Japanese one: SHINCHAN_REGIONAL_EPS
// lists the Japanese episode numbers that actually have a Hindi master. Mapping a
// Japanese episode number straight through it used to shift every episode after the
// first gap onto the wrong source, and clamping meant every episode past the end of
// the list silently replayed the last Hindi episode. Returning null instead lets the
// caller fall back to the Japanese/English cut for episodes with no Hindi master.
function mapShinchanRegionalEp(epNum) {
  const n = Math.floor(Number(epNum)) || 1;
  const idx = n - 1;
  if (idx < 0 || idx >= SHINCHAN_REGIONAL_TOTAL) return null;
  return SHINCHAN_REGIONAL_EPS[idx];
}
const DORAEMON_REGIONAL_RAW = [
  { season: 1, count: 52 },
  { season: 2, count: 51 },
  { season: 3, count: 52 },
  { season: 4, count: 52 },
  { season: 5, count: 52 },
  { season: 6, count: 52 },
  { season: 7, count: 52 },
  { season: 8, count: 51 },
  { season: 14, count: 52 },
  { season: 15, count: 52 },
  { season: 16, count: 50 },
  { season: 17, count: 47 },
  { season: 18, count: 51 },
  { season: 19, count: 51 },
  { season: 20, count: 45 }
];
let _doraCursor = 1;
const DORAEMON_REGIONAL_LIST = DORAEMON_REGIONAL_RAW.map(row => {
  const startEp = _doraCursor;
  const endEp = _doraCursor + row.count - 1;
  _doraCursor = endEp + 1;
  return {
    season: row.season,
    count: row.count,
    startEp,
    endEp,
    name: `Season ${row.season} (Ep ${startEp}–${endEp})`
  };
});
const DORAEMON_REGIONAL_TOTAL = _doraCursor - 1;

function mapDoraemonRegionalEp(globalEp) {
  const n = Math.max(1, Math.min(DORAEMON_REGIONAL_TOTAL, Number(globalEp) || 1));
  const found = DORAEMON_REGIONAL_LIST.find(r => n >= r.startEp && n <= r.endEp) || DORAEMON_REGIONAL_LIST[0];
  return {
    season: found.season,
    episode: n - found.startEp + 1,
    startEp: found.startEp,
    endEp: found.endEp
  };
}

// Pre-seed Shin-chan and Doraemon catalogs; source availability varies by episode.
const CURATED_MEGA_SEEDS = [
  {
    id: 'mp-53876', mal: '53876', ani: '158871', title: 'Pokémon Horizons: The Series',
    english: 'Pokémon Horizons: The Series', alternative: 'Pocket Monsters (2023)',
    titles: 'Pokémon Horizons; Pokemon Horizons; Pocket Monsters 2023', native: 'ポケットモンスター',
    poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158871-GBM9AMDfDRSu.jpg',
    backdrop: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/158871-PtipBrtn93hB.jpg',
    description: 'Liko and Roy set out on a new adventure across the Pokémon world with the Rising Volt Tacklers.',
    year: 2023, status: 'Currently Airing', score: '7.30', popularity: 25000,
    genres: ['Action', 'Adventure', 'Fantasy'], format: 'TV', aired: '2023-04-14', episodes: 156,
    sub: true, dub: true, updated: '2023-01-01 00:00:00'
  },
  {
    id: 'mp-966',
    mal: '966',
    ani: '966',
    title: 'Shin Chan',
    english: 'Shin Chan',
    alternative: 'Crayon Shin-chan',
    titles: 'Shin Chan; Shinchan; Crayon Shin-chan; Shin-chan',
    native: 'クレヨンしんちゃん',
    poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/b966-QUCdKAk4ls9J.jpg',
    backdrop: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/966-J5CwLLTBs4OO.jpg',
    description: 'Follow the outrageous everyday misadventures of five-year-old Shinnosuke "Shin-chan" Nohara, his parents Hiroshi and Misae, baby sister Himawari, dog Shiro, and classmates at Futaba Kindergarten.',
    year: 1992,
    status: 'Currently Airing',
    score: '7.78',
    popularity: 25000,
    genres: ['Comedy', 'Slice of Life'],
    format: 'TV',
    aired: '1992-04-13',
    episodes: SHINCHAN_REGIONAL_TOTAL,
    sub: false,
    dub: true,
    subCount: 0,
    dubCount: 78,
    regionalCount: SHINCHAN_REGIONAL_TOTAL,
    updated: '2024-01-01 00:00:00'
  },
  {
    id: 'mp-8687',
    mal: '8687',
    ani: '8687',
    title: 'Doraemon (2005)',
    english: 'Doraemon (2005)',
    alternative: 'Doraemon: Gadget Cat from the Future',
    titles: 'Doraemon; Doraemon (2005); Doraemon: Gadget Cat from the Future',
    native: 'ドラえもん (2005)',
    poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/b8687-bBnJMGnih4PT.jpg',
    backdrop: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/8687-aa3QbJjGfy3B.jpg',
    description: 'Sent back in time from the 22nd century, robotic cat Doraemon uses futuristic gadgets from his fourth-dimensional pocket to help clumsy schoolboy Nobita Nobi navigate everyday mishaps and extraordinary adventures.',
    year: 2005,
    status: 'Currently Airing',
    score: '7.72',
    popularity: 22000,
    genres: ['Adventure', 'Comedy', 'Family', 'Sci-Fi'],
    format: 'TV',
    aired: '2005-04-15',
    episodes: DORAEMON_REGIONAL_TOTAL,
    sub: true,
    dub: true,
    subCount: 156,
    dubCount: 52,
    regionalCount: DORAEMON_REGIONAL_TOTAL,
    updated: '2024-01-01 00:00:00'
  }
];
for (const seed of CURATED_MEGA_SEEDS) {
  if (!megaEntries.some(e => String(e.mal) === seed.mal)) megaEntries.push(seed);
}

// Build alias set across ALL anime entries (including unreleased) so unreleased/unavailable anime on TMDB never leaks into Movies/TV
const megaAliasSet = new Set(megaAliases.map(normalizeTitle).filter(Boolean));
for (let entry of megaEntries) {
  for (let raw of [entry.title, entry.english, entry.alternative, ...String(entry.titles || '').split(/[;,]/)]) {
    let norm = normalizeTitle(raw);
    if (norm && norm.length >= 3) megaAliasSet.add(norm);
  }
}

function animeAliasMatch(title) {
  let key = normalizeTitle(title);
  if (!key) return false;
  if (megaAliasSet.has(key)) return true;
  for (let alias of megaAliasSet) {
    if (alias.length > 4 && (key === alias || key.startsWith(alias + ' ') || key.endsWith(' ' + alias))) return true;
  }
  return false;
}

function validAnikotoEntry(entry) {
  let year = Number(entry?.year) || 0;
  if (!entry?.mal || !entry?.id || !entry?.poster) return false;
  if (!(Number(entry.episodes) > 0)) return false;
  if (year > new Date().getFullYear()) return false;
  if (/not yet|upcoming|unreleased/i.test(entry.status || '')) return false;
  let start = parseAiredStartDate(entry.aired, entry.year);
  if (start && start > today()) return false;
  return true;
}

// Strict MegaPlay playable maps ONLY contain released, streamable MegaPlay entries!
const megaByMal = new Map(), megaByAni = new Map();
const playableMegaEntries = megaEntries.filter(validAnikotoEntry);
for (let entry of playableMegaEntries) {
  if (entry.mal && !megaByMal.has(String(entry.mal))) megaByMal.set(String(entry.mal), entry);
  if (entry.ani && !megaByAni.has(String(entry.ani))) megaByAni.set(String(entry.ani), entry);
}
function megaForMedia(media) { return megaByAni.get(String(media?.id || '')) || megaByMal.get(String(media?.idMal || '')) || null; }
function megaForIds(mal, ani) { return megaByMal.get(String(mal || '')) || megaByAni.get(String(ani || '')) || null; }

const japaneseAnimation = x => {
  let animated = Boolean(x.genre_ids?.includes(16) || x.genres?.some(g => g.id === 16 || g.name === 'Animation'));
  if (!animated) return false;
  let origLang = String(x.original_language || '').toLowerCase();
  let countries = Array.isArray(x.origin_country) ? x.origin_country : [];
  return origLang === 'ja' || countries.includes('JP');
};

function makeFallbackPosterDataUri(title, year, type) {
  const safeTitle = String(title || 'Untitled').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).slice(0, 42);
  const badge = type === 'tv' ? 'SERIES' : 'MOVIE';
  const yr = String(year || '').replace(/[^0-9]/g, '').slice(0, 4);
  const sub = yr ? `${badge} • ${yr}` : badge;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e222d"/><stop offset="100%" stop-color="#12141b"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="320" cy="90" r="140" fill="#ff731c" fill-opacity="0.08"/><rect x="32" y="42" width="44" height="4" rx="2" fill="#ff731c"/><text x="32" y="500" fill="#ff731c" font-family="sans-serif" font-size="15" font-weight="700" letter-spacing="2">${sub}</text><text x="32" y="538" fill="#f3f4f8" font-family="sans-serif" font-size="24" font-weight="800">${safeTitle}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const UNRELEASED_OTT_STATUSES = new Set(['rumored', 'planned', 'in production', 'post production', 'pilot', 'canceled']);
function releasedOtt(x, minVotes = 0, requirePoster = true) {
  if (!x || x.adult) return false;
  if (requirePoster && !x.poster_path && !x.backdrop_path) return false;
  if (!(x.title || x.name)) return false;
  if (!releasedDate(x.release_date || x.first_air_date)) return false;
  if (x.status && UNRELEASED_OTT_STATUSES.has(String(x.status).toLowerCase())) {
    if (!(String(x.status).toLowerCase() === 'canceled' && Number(x.number_of_episodes) > 0)) return false;
  }
  if ((x.media_type === 'tv' || (!x.media_type && x.first_air_date)) && x.number_of_episodes !== undefined && Number(x.number_of_episodes) <= 0) {
    return false;
  }
  let votes = Number(x.vote_count) || 0, pop = Number(x.popularity) || 0;
  if (minVotes > 0 && votes < minVotes && pop < 5) return false;
  if (japaneseAnimation(x)) return false;
  return true;
}

const ott = x => {
  const mediaType = x.media_type === 'tv' || (!x.media_type && x.first_air_date) ? 'tv' : 'movie';
  const title = x.title || x.name || '';
  const year = (x.release_date || x.first_air_date || '').slice(0, 4);
  const poster = x.poster_path
    ? 'https://image.tmdb.org/t/p/w780' + x.poster_path
    : (x.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + x.backdrop_path : makeFallbackPosterDataUri(title, year, mediaType));
  return {
    id: String(x.id),
    type: mediaType,
    title,
    originalTitle: x.original_title || x.original_name || '',
    poster,
    backdrop: x.backdrop_path ? 'https://image.tmdb.org/t/p/original' + x.backdrop_path : null,
    description: x.overview || '',
    rating: x.vote_average ? Number(x.vote_average.toFixed(1)) : null,
    popularity: Number(x.popularity) || 0,
    voteCount: Number(x.vote_count) || 0,
    year,
    releaseDate: x.release_date || x.first_air_date || null,
    originalLanguage: String(x.original_language || '').toLowerCase(),
    japaneseAnimation: japaneseAnimation(x),
    genres: x.genres?.map(g => g.name) || x.genre_ids?.map(id => genreNames[id]).filter(Boolean) || [],
    seasons: x.number_of_seasons
  };
};


// ---- Poster quality upgrade (v9) ----------------------------------------
// AniPix only ever publishes one size: cdn.anipixcdn.co/thumbnail/*.jpg at about
// 283x400. A phone card renders at ~338 physical pixels, so every AniPix poster
// was being stretched and looked soft next to the TMDB/AniList ones. AniList
// serves the SAME titles at 460x690, which needs no upscaling at all, so posters
// are upgraded to the AniList cover whenever we know the AniList id.
// Results (including failures) are memoised so a catalogue page costs at most one
// extra request per unknown title, and never repeats.
const POSTER_STORE = path.join(runtimeDataDir, 'poster-cache.json');
let posterUpgradeCache = new Map();        // key -> cover url | ''
const posterUpgradeInflight = new Map();   // (unused by the queue path, kept for compat)

// Cover art is stable for weeks, so it is written to disk: a server restart no
// longer throws the whole catalogue back to blurry art and re-burns the AniList
// quota. This is also why the browser used to look "reset" after a restart.
try {
  const raw = JSON.parse(fs.readFileSync(POSTER_STORE, 'utf8'));
  if (raw && typeof raw === 'object') posterUpgradeCache = new Map(Object.entries(raw));
} catch {}
let posterSaveTimer = null;
function persistPosterCache() {
  if (posterSaveTimer) return;
  posterSaveTimer = setTimeout(() => {
    posterSaveTimer = null;
    const obj = {};
    // Only successful covers are persisted; misses are cheap to retry.
    for (const [k, v] of posterUpgradeCache) if (v) obj[k] = v;
    fs.promises.mkdir(path.dirname(POSTER_STORE), { recursive: true })
      .then(() => fs.promises.writeFile(POSTER_STORE, JSON.stringify(obj)))
      .catch(() => {});
  }, 1500);
  posterSaveTimer.unref?.();
}

// AniList rate-limits aggressively (429 + retry-after: 6). Every cover request
// funnels through this gate so a busy catalogue load trickles instead of bursting.
let aniGateChain = Promise.resolve();
const ANI_COVER_GAP_MS = 380;
function aniGate(fn) {
  const run = aniGateChain.then(async () => {
    const out = await fn();
    await new Promise(r => setTimeout(r, ANI_COVER_GAP_MS));
    return out;
  });
  aniGateChain = run.catch(() => {});
  return run;
}

function isLowResPoster(url) {
  const u = String(url || '');
  if (/(?:^|[.\/])anipixcdn\.co\//i.test(u)) return true;   // 283x400 hard ceiling
  // AniList occasionally serves the 230x325 file as extraLarge; no upgrade exists.
  return false;
}

const POSTER_CACHE_HIT = 1000 * 60 * 60 * 24;   // a good cover never needs re-checking
// One batched GraphQL round-trip for every card on the page. Firing ~20 separate
// AniList calls on a cold catalogue load tripped their rate limit, and a 429 was
// being remembered as "no cover exists" - which is why a handful of titles kept
// their blurry AniPix art while the rest sharpened up.
function buildPosterQuery(targets) {
  const alias = [], vars = {}, wanted = [];
  targets.forEach((t, i) => {
    const k = `c${i}`;
    if (t.id) {
      alias.push(`${k}:Media(id:$${k}id,type:ANIME){coverImage{extraLarge}}`);
      vars[`${k}id`] = Number(t.id);
      wanted.push(i);
    } else if (t.title) {
      if (!t.year) return;   // AniList requires seasonYear alongside search
      const search = `${k}s`, year = `${k}y`;
      alias.push(`${k}:Media(search:$${search},type:ANIME,seasonYear:$${year}){coverImage{extraLarge}}`);
      vars[search] = t.title;
      vars[year] = t.year;
      wanted.push(i);
    }
  });
  return { query: `query(${Object.keys(vars).map(v => `$${v}:${v.endsWith('id') ? 'Int' : v.endsWith('y') ? 'Int' : 'String'}`).join(',')}){${alias.join(' ')}}`, vars, wanted };
}

async function anilistPostersBatch(targets) {
  const out = new Map();          // index in `targets` -> cover url
  if (!targets.length) return out;

  // AniList fails the whole query if any one alias points at a missing id, so a
  // failed chunk is bisected until the offending entry is isolated and dropped.
  const run = async (list) => {
    if (!list.length) return;
    const { query, vars, wanted } = buildPosterQuery(list);
    if (!wanted.length) return;
    let data = null;
    try { data = await aniGate(() => anilist(query, vars, 12000)); } catch { data = null; }
    if (data) {
      const small = [];
      list.forEach((t, i) => {
        const url = data[`c${i}`]?.coverImage?.extraLarge || '';
        if (url && !/\/cover\/(small|medium)\//i.test(url)) {
          out.set(t.idx, url);
          posterUpgradeCache.set(t.key, url);
          persistPosterCache();
        } else small.push({ t, ok: url });
      });
      for (const { t, ok } of small) {
        const alt = t.title ? await tmdbPosterFor(t.title, t.year, !!t.isMovie).catch(() => '') : '';
        if (alt) { out.set(t.idx, alt); posterUpgradeCache.set(t.key, alt); persistPosterCache(); }
        else if (ok) { out.set(t.idx, ok); posterUpgradeCache.set(t.key, ok); }
        else rememberMiss(t.key);
      }
      return;
    }
    if (list.length === 1) {
      const only = list[0];
      // The catalogue sometimes carries an AniList id that no longer resolves.
      // One targeted title+year search recovers the real cover instead of
      // leaving that card blurry for the rest of the session.
      if (only.id && only.title && only.year) {
        await run([{ ...only, id: null, key: `t:${only.key}` }]);
        return;
      }
      rememberMiss(only.key);
      return;
    }
    const mid = Math.ceil(list.length / 2);
    await run(list.slice(0, mid));
    await run(list.slice(mid));
  };

  await run(targets.slice(0, 40));
  return out;
}

// Some AniList entries genuinely have no large cover (their extraLarge points at
// the 230px file). TMDB almost always has a 780px poster for the same show, so it
// is used as the second tier before a card is allowed to stay soft.
const tmdbPosterCache = new Map();
async function tmdbPosterFor(title, year, isMovie) {
  const key = `${isMovie ? 'm' : 't'}:${String(title || '').toLowerCase()}|${year || ''}`;
  if (tmdbPosterCache.has(key)) return tmdbPosterCache.get(key);
  let url = '';
  try {
    const path = isMovie ? 'search/movie' : 'search/tv';
    const d = await tmdb(path, { query: title, ...(year ? { year: String(year) } : {}), include_adult: 'false' });
    const results = (d?.data?.results || []).filter(x => x.poster_path);
    const exact = results.find(x => Number(String(x.first_air_date || x.release_date || '').slice(0, 4)) === Number(year)) || results[0];
    if (exact?.poster_path) url = 'https://image.tmdb.org/t/p/w780' + exact.poster_path;
  } catch { url = ''; }
  tmdbPosterCache.set(key, url);
  if (!url) setTimeout(() => tmdbPosterCache.delete(key), 10 * 60_000).unref?.();
  return url;
}

function rememberMiss(key) {
  posterUpgradeCache.set(key, '');
  // A miss is retried later rather than pinned forever, but never per card.
  setTimeout(() => { if (posterUpgradeCache.get(key) === '') posterUpgradeCache.delete(key); }, 10 * 60_000).unref?.();
}

let posterPending = [];
let posterFlushTimer = null;
let posterFlushWaiters = [];
let posterChain = Promise.resolve();

// Every catalogue surface on a page asks for upgrades in the same tick, so they
// are collected here and answered with a handful of sequential AniList calls
// instead of one call per card (which tripped the rate limiter).
function schedulePosterFlush() {
  if (posterFlushTimer) return;
  posterFlushTimer = setTimeout(() => {
    posterFlushTimer = null;
    const batch = posterPending;
    const waiters = posterFlushWaiters;
    posterPending = [];
    posterFlushWaiters = [];
    posterChain = (async () => {
      for (let i = 0; i < batch.length; i += 20) {
        const chunk = batch.slice(i, i + 20).map((t, j) => ({ ...t, idx: j }));
        const covers = await anilistPostersBatch(chunk).catch(() => new Map());
        for (const [j, url] of covers) if (url && chunk[j]) chunk[j].item.poster = url;
      }
    })().catch(() => {}).finally(() => { for (const w of waiters) w(); });
  }, 0);
  posterFlushTimer.unref?.();
}

async function upgradeLowResPosters(list) {
  const pending = [];
  for (const x of list || []) {
    if (!x || !isLowResPoster(x.poster)) continue;
    const id = x.anilistId || x.malId;
    const title = String(x.title || '').trim();
    if (!id && !title) continue;
    const key = id ? `i:${id}` : `t:${title.toLowerCase()}|${x.year || ''}`;
    if (posterUpgradeCache.has(key)) {
      const cached = posterUpgradeCache.get(key);
      if (cached) x.poster = cached;
      continue;
    }
    pending.push({ key, id, title: title.replace(/[\\"]/g, '').slice(0, 80), year: Number(x.year) || null, item: x });
  }
  if (!pending.length) return list;

  const seen = new Set();
  let added = 0;
  for (const t of pending) {
    const k = `${t.key}|${t.id || t.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    posterPending.push(t);
    added++;
  }
  if (!added) return list;

  const done = new Promise((res) => posterFlushWaiters.push(res));
  schedulePosterFlush();
  await done;
  return list;
}

const aniCache = new Map();
async function anilist(query, variables = {}, timeout = 10000) {
  let key = JSON.stringify([query, variables]), cached = aniCache.get(key);
  if (cached && Date.now() - cached.time < 300000) return cached.data;
  let r = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeout)
  });
  if (!r.ok) throw Error('Anime catalog unavailable');
  let text = await r.text(), d;
  try { d = JSON.parse(text); } catch { throw Error('Anime catalog returned an invalid response.'); }
  if (d.errors) throw Error(d.errors[0].message);
  aniCache.set(key, { data: d.data, time: Date.now() });
  return d.data;
}

const fields = 'id idMal countryOfOrigin title{english romaji native} synonyms popularity coverImage{extraLarge large} bannerImage description(asHtml:false) averageScore format season seasonYear startDate{year month day} episodes nextAiringEpisode{episode airingAt} genres status isAdult';
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
// When is this out? A dated airing wins, then the next scheduled episode, then the
// broadcast season AniList records - which is a quarter, not a day, so it is
// worded as one instead of dressing a guess up as a date.
function animeReleaseHints(media) {
  const startDate = media?.startDate || {};
  const releaseDate = startDate.year
    ? [startDate.year, startDate.month, startDate.day].filter(Boolean).join('-')
    : '';
  let nextDate = '';
  const airingAt = Number(media?.nextAiringEpisode?.airingAt);
  if (Number.isFinite(airingAt) && airingAt > 0) nextDate = new Date(airingAt * 1000).toISOString().slice(0, 10);
  const seasons = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  const year = media?.seasonYear || (releaseDate ? Number(releaseDate.slice(0, 4)) : null);
  const guess = media?.season && year ? `${seasons[String(media.season).toUpperCase()] || media.season} ${year}` : (year ? String(year) : '');
  return { releaseDate: releaseDate || nextDate, releaseGuess: releaseDate ? '' : guess };
}

function animeEpisodeCount(media) {
  if (media.format === 'MOVIE' || media.status === 'NOT_YET_RELEASED') return null;
  let total = positiveInt(media.episodes);
  if (media.status === 'RELEASING') {
    let released = positiveInt((media.nextAiringEpisode?.episode || 1) - 1);
    if (released) return total ? Math.min(total, released) : released;
  }
  return total;
}

const spotlightCatalogPath = path.resolve('data/spotlight.json');
let spotlightCatalog = [];
try {
  let d = JSON.parse(fs.readFileSync(spotlightCatalogPath, 'utf8'));
  if (Array.isArray(d)) {
    spotlightCatalog = d.filter(x => x?.id && x?.type && x?.title && x?.backdrop && x?.spotlightBanner && (x.type !== 'anime' || megaByMal.has(String(x.id))));
  }
} catch {}

function cryptoShuffle(list) {
  let a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    let j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildRandomizedSpotlight() {
  if (!spotlightCatalog.length) return [];
  let isRomance = x => (x.genres || []).some(g => /romance/i.test(g));
  let romance = cryptoShuffle(spotlightCatalog.filter(isRomance));
  let others = cryptoShuffle(spotlightCatalog.filter(x => !isRomance(x)));
  let romCount = Math.min(romance.length, crypto.randomInt(2, 4));
  let lead = cryptoShuffle([...romance.slice(0, romCount), ...others.slice(0, Math.max(0, 6 - romCount))]);
  let tail = cryptoShuffle([...romance.slice(romCount), ...others.slice(Math.max(0, 6 - romCount))]);
  return [...lead, ...tail];
}

function releasedAnime(media) {
  if (!['FINISHED', 'RELEASING'].includes(media?.status)) return false;
  let d = media.startDate;
  if (!d?.year) return false;
  let date = `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}`;
  if (date > today()) return false;
  if (media.status === 'RELEASING' && media.nextAiringEpisode?.episode === 1) return false;
  return true;
}

async function anikotoSeries(providerId) {
  if (!providerId || !/^\d+$/.test(String(providerId))) return null;
  let d = await remote(`https://anikotoapi.site/series/${encodeURIComponent(providerId)}`, { ttl: 21600000, timeout: 9000, headers: { Accept: 'application/json' } });
  if (!d.ok || !d.data?.anime || !Array.isArray(d.data.episodes)) throw Error('MegaPlay returned an invalid series response.');
  return d.data;
}

// Titles come from AniList, which labels most anime by their Japanese name in
// romaji and keeps the released English one in `english` or in `synonyms`. The
// site is English-first, so a romaji title is a bug, not a style: every title
// that reaches the UI goes through here. A candidate is usable when it is written
// in Latin letters and reads as English - a romanised Japanese title is Latin
// too, so the giveaway is Japanese particles and honourifics, which no English
// title carries. Short nicknames ("Roshidere 2") lose to the full title.
const JP_ROMAJI_TOKENS = /\b(ni|no|wa|ga|wo|e|o|kara|made|yori|dake|sugata|zankyou|hen|bouken|ki|mono|hime|ou|kishi|majutsu|tabi|nakama|kanojo|kare|sensei|senpai|koukou|chuu|gakuin|denki|densetsu|shin|tan|chan|kun|sama|desu|da|yo|ne)\b/i;
const ENGLISH_MARKERS = /\b(the|of|and|in|on|at|to|for|with|my|your|his|her|their|is|are|be|book|arc|season|movie|story|chronicle|adventure|journey|king|knight|magic|school|academy|girl|boy|hero|swordsman|witch|dungeon|shield|blade|episode)\b/i;
// A few franchises are published under an English name that AniList keeps only
// on the season record's siblings, never on the entry itself, so no amount of
// pattern matching will find it. Pinning them here means the site never shows a
// romaji title for a show people know by its English one.
const ANIME_ENGLISH_TITLES = new Map([
  ['Tensei Shitara Slime Datta Ken', 'That Time I Got Reincarnated as a Slime'],
  ['Sekai Saikou no Ansatsusha, Isekai Kizoku ni Tensei suru', "The World's Finest Assassin Gets Reincarnated in Another World as an Aristocrat"],
  ['Jeonjijeok Dokja Sijeom', "Omniscient Reader's Viewpoint"],
  ['Marriage Toxin', 'Marriage Toxin'],
  ['MARRIAGETOXIN', 'Marriage Toxin'],
  ['Shingeki no Kyojin', 'Attack on Titan'],
  ['Kimi no Iru Machi', 'A Town Where You Live'],
  ['Lycoris Recoil (Shinsaku Animation)', 'Lycoris Recoil'],
  ['Tensei Shitara Ken Deshita', 'Reincarnated as a Sword'],
  ['Tensei shitara Ken Deshita', 'Reincarnated as a Sword'],
  ['Kenja no Mago', 'Wise Man\'s Grandchild'],
  ['Tensei Oujo to Tensai Reijou no Mahou Kakumei', 'The Alchemist Code'],
  ['Maou Gakuin no Futekigousha', 'The Misfit of Demon King Academy'],
  ['Kumo Desu ga, Nani ka?', "So I'm a Spider, So What?"],
  ['Tate no Yuusha no Nariagari', 'The Rising of the Shield Hero'],
  ['No Game No Life', 'No Game No Life'],
  ['Boukyaku Tansutei', 'Vermeil in Gold'],
  ['Seirei Gensouki', 'Spirit Chronicles'],
  ['Isekai wa Smartphone to Tomo ni', 'In Another World With My Smartphone'],
  ['Kaifuku Jutsu no Yarinaoshi', 'Redo of Healer'],
  ['Shijou Saikyou no Daimaou', 'The Demon King Who Lost His Job'],
  ['Mairimashita! Iruma-kun', 'Welcome to Demon School! Iruma-kun'],
  ['Kitsune no Susume', 'For fox the sake'],
  ['Shuumatsu no Valkyrie', 'Record of Ragnarok'],
  ['Edomae Elf', 'Edomae Elf'],
  ['Nigatsu ni wa Snowflake', 'Snowflake in February']
]);
function applyEnglishTitleOverride(title) {
  const raw = String(title || '');
  for (const [romaji, english] of ANIME_ENGLISH_TITLES) {
    if (romaji === english) continue;
    const at = raw.toLowerCase().indexOf(romaji.toLowerCase());
    if (at < 0) continue;
    const tail = raw.slice(at + romaji.length).trim();
    return `${english}${tail ? ' ' + tail : ''}`.trim();
  }
  return raw.trim();
}
function isLatinTitle(t) { return Boolean(t) && !/[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(t); }
function looksEnglish(t) {
  if (!isLatinTitle(t)) return false;
  if (JP_ROMAJI_TOKENS.test(t)) return false;
  return ENGLISH_MARKERS.test(t) || /\s[a-z]{3,}\s/.test(t) || t.split(/\s+/).length >= 3;
}
// Pick the most English-looking title out of an AniList media record, falling
// back to romaji only when nothing better exists (some shows genuinely have no
// licensed English name, and an invented one is worse).
function englishAnimeTitle(media, provider) {
  const clean = t => decodeEntities(String(t || '').split(';')[0]).replace(/^\[RAW\]\s*/i, '').replace(/\s*\(TV\)\s*$/i, '').trim();
  const cands = [
    clean(media?.title?.english),
    ...(Array.isArray(media?.synonyms) ? media.synonyms.map(clean) : []),
    clean(provider?.english),
    clean(provider?.titles ? String(provider.titles).split(';')[0] : '')
  ].filter(Boolean);
  // AniList's own `english` field is often a romaji transliteration, so being the
  // official English field is worth less than actually reading like English.
  const romaji = clean(media?.title?.romaji) || clean(provider?.title) || '';
  const score = t =>
    (t === clean(media?.title?.english) ? 3 : 0) +
    (looksEnglish(t) ? 5 : 0) +
    Math.min(2, t.split(/\s+/).length / 3);
  // The romaji name is the baseline, not a candidate: a nickname in the
  // synonym list ("BTR2") must not beat the title the show is actually
  // published under, so an alternative has to out-score it to be used.
  let best = isLatinTitle(romaji) ? romaji : '';
  let bestScore = romaji ? score(romaji) - 0.5 : 0;
  for (const t of new Set(cands)) {
    if (!t || !isLatinTitle(t)) continue;
    const s = score(t);
    if (s > bestScore) { best = t; bestScore = s; }
  }
  return applyEnglishTitleOverride(best);
}

function cleanAnimeDisplayTitle(entry) {
  return applyEnglishTitleOverride(cleanAnimeDisplayTitleRaw(entry));
}
function cleanAnimeDisplayTitleRaw(entry) {
  let primary = decodeEntities(entry.title || '').replace(/^\[RAW\]\s*/i, '').replace(/\s*\(TV\)\s*$/i, '').trim();
  let cjkIdx = primary.search(/[\u3040-\u30ff\u3400-\u9fff]/);
  if (cjkIdx > 6) primary = primary.slice(0, cjkIdx).trim();
  let engFirst = decodeEntities(String(entry.english || '').split(';')[0]).replace(/\s*\(TV\)\s*$/i, '').trim();
  // The provider names a fair number of shows by their romaji title. When the
  // record carries an English name that reads as English, that is the one to
  // show - the same rule the AniList mapping uses, so a row and its detail page
  // can never disagree about what a title is called.
  if (engFirst.length > 3 && looksEnglish(engFirst) && !looksEnglish(primary) && isLatinTitle(primary)) {
    return engFirst;
  }
  if (primary && !/[\u3040-\u30ff\u3400-\u9fff]/.test(primary)) {
    if (
      engFirst.length > 4 &&
      !/^(Sorcery Fight|Blade of Demon Destruction|Na Honjaman|Naruto Hurricane|AoT$)/i.test(engFirst) &&
      /\b(Link Click|Bungo Stray Dogs|Kaguya-sama|My Dress-Up Darling|Frieren|Chainsaw Man|Spy x Family|My Hero Academia|Demon Slayer|Attack on Titan|Fullmetal Alchemist|Hunter x Hunter|Mob Psycho|Steins;Gate|Re:Zero|Konosuba|Mushoku Tensei|That Time I Got Reincarnated|Apothecary Diaries|Blue Box|Dandadan|Oshi no Ko|Haikyu|Vinland Saga| Rascal Does Not Dream|Fruits Basket|Violet Evergarden|Code Geass|Your Lie in April|Assassination Classroom|promised Neverland|Tokyo Ghoul|Black Clover|Fire Force|Dr\. Stone|Overlord|Classroom of the Elite|Horimiya|Toradora)\b/i.test(engFirst)
    ) {
      return engFirst;
    }
    return primary;
  }
  return engFirst.length > 2 ? engFirst : primary;
}

function anikotoItem(entry) {
  let format = String(entry.format || '').toUpperCase(), isMovie = format.includes('MOVIE');
  let score = Number.parseFloat(entry.score);
  let displayTitle = cleanAnimeDisplayTitle(entry);
  let status = /currently/i.test(entry.status) ? 'RELEASING' : 'FINISHED';
  let cleanDesc = decodeEntities(entry.description || '').replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '').trim();
  return {
    id: String(entry.mal),
    anilistId: entry.ani ? String(entry.ani) : null,
    type: 'anime',
    title: displayTitle,
    poster: entry.poster || null,
    backdrop: entry.backdrop || null,
    description: cleanDesc,
    rating: Number.isFinite(score) && score > 0 ? score : null,
    popularity: Number(entry.popularity) || 0,
    year: entry.year || null,
    episodes: isMovie ? null : entry.episodes,
    episodeCountKind: 'available',
    genres: entry.genres || [],
    status,
    format,
    isMovie,
    playable: true,
    providerId: entry.id,
    sub: entry.sub !== false,
    dub: Boolean(entry.dub),
    subCount: Number.isInteger(entry.subCount) ? entry.subCount : null,
    dubCount: Number.isInteger(entry.dubCount) ? entry.dubCount : null,
    differentDubOrder: Boolean(animeEpisodeOverrides[String(entry.mal)]?.differentDubOrder),
    updated: entry.updated || ''
  };
}

const anikotoItems = playableMegaEntries.map(anikotoItem);

const ani = x => {
  let isMovie = x.format === 'MOVIE', provider = megaForMedia(x);
  let episodes = animeEpisodeCount(x) || (isMovie ? null : positiveInt(provider?.episodes));
  return {
    id: String(x.idMal),
    anilistId: String(x.id),
    type: 'anime',
    originalLanguage: ({JP:'ja',CN:'zh',TW:'zh',KR:'ko'})[String(x.countryOfOrigin||'').toUpperCase()]||'',
    title: englishAnimeTitle(x, provider) || x.title?.english || x.title?.romaji || provider?.english || provider?.title || '',
    poster: x.coverImage?.extraLarge || x.coverImage?.large || provider?.poster,
    backdrop: x.bannerImage || provider?.backdrop || x.coverImage?.extraLarge,
    description: (x.description || '').replace(/<[^>]*>/g, '') || provider?.description || '',
    rating: x.averageScore ? Number((x.averageScore / 10).toFixed(1)) : (provider?.score ? Number.parseFloat(provider.score) : null),
    popularity: Number(x.popularity) || 0,
    year: x.seasonYear || x.startDate?.year || provider?.year,
    episodes,
    episodeCountKind: x.status === 'RELEASING' ? 'released' : 'total',
    genres: x.genres?.length ? x.genres : (provider?.genres || []),
    status: x.status,
    format: x.format || provider?.format || null,
    isMovie,
    playable: Boolean(provider),
    providerId: provider?.id || null,
    dub: Boolean(provider?.dub)
  };
};

// ============================================================================
// V5.2.0 High-Precision Popularity-Driven Search Index & Ranking Engine
// ============================================================================
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'no', 'ni', 'wa', 'ga', 'wo']);

// Curated real-world abbreviations & franchise aliases (prevents noisy random 3-letter acronyms like "end" -> "Egao no Daika")
const CURATED_OTT_ALIASES = new Map([
  ['tv:1399', ['got', 'song of ice and fire']],
  ['tv:94997', ['hotd']],
  ['tv:1396', ['brba']],
  ['tv:60059', ['bcs']],
  ['tv:2316', ['the office us']],
  ['movie:299534', ['endgame', 'end game', 'avengers 4', 'mcu']],
  ['movie:299536', ['infinity war', 'avengers 3', 'mcu']],
  ['movie:24428', ['avengers 1', 'mcu']],
  ['movie:99861', ['age of ultron', 'avengers 2', 'mcu']],
  ['movie:155', ['batman', 'batman dark knight', 'tdk']],
  ['movie:49026', ['batman', 'batman dark knight rises', 'tdkr']],
  ['movie:120', ['lotr', 'fellowship of the ring']],
  ['movie:121', ['lotr', 'two towers']],
  ['movie:122', ['lotr', 'return of the king', 'rotk']],
  ['movie:634649', ['nwh', 'spiderman no way home', 'spiderman 3']],
  ['movie:569094', ['atsv', 'spiderverse', 'spider verse']],
  ['movie:324857', ['itsv', 'spiderverse', 'spider verse']],
  ['movie:671', ['hp', 'philosophers stone', 'sorcerers stone']]
]);

const CURATED_ANIME_ACRONYMS = new Map([
  ['16498', ['aot']],
  ['40748', ['jjk']],
  ['31964', ['mha', 'bnha']],
  ['5114', ['fmab', 'fma brotherhood']],
  ['11061', ['hxh']],
  ['11757', ['sao']],
  ['30276', ['opm']],
  ['44511', ['csm']],
  ['1535', ['dn']],
  ['21', ['op']],
  ['38000', ['kny', 'ds']],
  ['52991', ['frieren', 'beyond journeys end']],
  ['52299', ['sl', 'ore dake level up na ken']],
  ['32281', ['kimi no na wa']]
]);

function extractSubtitleParts(rawTitle) {
  const s = String(rawTitle || '').trim();
  if (!s) return [];
  const parts = [];
  for (const piece of s.split(/\s*[:–—]\s*|\s+-\s+/)) {
    const n = normalizeTitle(piece);
    if (n && n.length >= 3) parts.push(n);
  }
  return parts;
}

// Unified 0..1000 Backend Popularity Meter across Movies, Web Series & Anime
function computePopularityMeter(item) {
  if (!item) return 20;
  if (item.type === 'anime') {
    const aniPop = Math.max(0, Number(item.popularity) || 250);
    const curve = 1000 * (1 - Math.exp(-aniPop / 210000)) * 0.72;
    const logPart = Math.min(280, Math.log10(1 + aniPop / 25) * 62);
    return Math.max(10, Math.min(1000, curve + logPart));
  }
  const votes = Math.max(0, Number(item.voteCount) || 0);
  const pop = Math.max(0, Number(item.popularity) || 0);
  const effectiveVotes = item.type === 'tv' ? votes * 1.75 : votes;
  const voteMeter = 1000 * (1 - Math.exp(-effectiveVotes / 8500)) * 0.72 + Math.min(280, Math.log10(1 + effectiveVotes) * 62);
  const trendMeter = votes >= 80 ? Math.min(860, Math.log10(1 + pop) * 305) : Math.min(220, Math.log10(1 + pop) * 95);
  return Math.max(8, Math.min(1000, Math.max(voteMeter, voteMeter * 0.65 + trendMeter * 0.45)));
}

function buildIndexedAnimeRecord(entry, item) {
  const primaryNorm = normalizeTitle(item.title);
  const rawNames = [
    item.title,
    entry.title,
    entry.english,
    entry.alternative,
    entry.native,
    ...String(entry.titles || '').split(/[;,]/),
  ];
  const candSet = new Set();
  const subtitleSet = new Set();
  for (const r of rawNames) {
    const n = normalizeTitle(r);
    if (n) candSet.add(n);
    for (const sub of extractSubtitleParts(r)) {
      if (sub !== n) subtitleSet.add(sub);
    }
  }
  for (const ac of CURATED_ANIME_ACRONYMS.get(String(entry.mal)) || []) {
    candSet.add(ac);
  }
  // Only add >=4-char acronyms for genuinely popular anime (prevents obscure 3-letter collisions like "end" or "bat")
  if ((Number(entry.popularity) || 0) >= 120000) {
    for (const n of [...candSet]) {
      const words = n.split(' ').filter(w => w.length > 0 && !/^\d+$/.test(w));
      if (words.length >= 4 && words.length <= 7) {
        const ac = words.map(w => w[0]).join('');
        if (ac.length >= 4) subtitleSet.add(ac);
      }
    }
  }
  const candidates = [...candSet];
  const subtitles = [...subtitleSet];
  const compacts = candidates.map(c => c.replace(/\s+/g, '')).filter(Boolean);
  const subCompacts = subtitles.map(c => c.replace(/\s+/g, '')).filter(Boolean);
  const wordSet = new Set();
  for (const c of [...candidates, ...subtitles]) {
    for (const w of c.split(' ')) if (w) wordSet.add(w);
  }
  const popMeter = computePopularityMeter(item);
  return {
    entry,
    item,
    primaryNorm,
    primaryCompact: primaryNorm.replace(/\s+/g, ''),
    candidates,
    compacts,
    subtitles,
    subCompacts,
    words: [...wordSet],
    popMeter
  };
}

const indexedAnime = playableMegaEntries.map((entry, rankIdx) => buildIndexedAnimeRecord(entry, anikotoItems[rankIdx]));

// Load Top ~2,630 Popular TMDB Movies & Web Series Index for instant 0ms blockbuster recall (e.g. "end" -> "Avengers: Endgame")
const popularOttCatalogPath = path.resolve('data/ott-popular-catalog.json');
const indexedPopularOtt = [];
try {
  const rawPop = JSON.parse(fs.readFileSync(popularOttCatalogPath, 'utf8'));
  for (const row of rawPop?.entries || []) {
    if (!row?.id || !row?.title) continue;
    const item = {
      id: String(row.id),
      type: row.type === 'tv' ? 'tv' : 'movie',
      title: row.title,
      originalTitle: row.originalTitle || '',
      poster: row.poster || null,
      backdrop: row.backdrop || null,
      description: row.description || '',
      rating: row.rating ?? null,
      popularity: Number(row.popularity) || 0,
      voteCount: Number(row.voteCount) || 0,
      year: row.year || '',
      releaseDate: row.releaseDate || null,
      japaneseAnimation: false,
      genres: (row.genreIds || []).map(id => genreNames[id]).filter(Boolean)
    };
    const primaryNorm = normalizeTitle(item.title);
    const oNorm = normalizeTitle(item.originalTitle);
    const candSet = new Set([primaryNorm, oNorm].filter(Boolean));
    const subSet = new Set();
    for (const rawName of [item.title, item.originalTitle]) {
      for (const sub of extractSubtitleParts(rawName)) {
        if (!candSet.has(sub)) subSet.add(sub);
      }
    }
    for (const alias of CURATED_OTT_ALIASES.get(`${item.type}:${item.id}`) || []) {
      const n = normalizeTitle(alias);
      if (n) subSet.add(n);
    }
    const candidates = [...candSet];
    const subtitles = [...subSet];
    const compacts = candidates.map(c => c.replace(/\s+/g, '')).filter(Boolean);
    const subCompacts = subtitles.map(c => c.replace(/\s+/g, '')).filter(Boolean);
    const wordSet = new Set();
    for (const c of [...candidates, ...subtitles]) {
      for (const w of c.split(' ')) if (w) wordSet.add(w);
    }
    indexedPopularOtt.push({
      key: `${item.type}:${item.id}`,
      item,
      primaryNorm,
      primaryCompact: primaryNorm.replace(/\s+/g, ''),
      candidates,
      compacts,
      subtitles,
      subCompacts,
      words: [...wordSet],
      popMeter: computePopularityMeter(item)
    });
  }
} catch {}

const megaMissCache = new Map();
async function probeMegaPlayEmbedUrl(url) {
  try {
    let r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://megaplay.buzz/'
      },
      signal: AbortSignal.timeout(4200)
    });
    if (!r.ok) return false;
    let html = await r.text();
    return Boolean(html.match(/data-id=["']?(\d+)/)?.[1] || html.match(/File\s+(\d+)\s+-/)?.[1]);
  } catch {
    return false;
  }
}

async function ensureDynamicMegaEntry(malId, mediaOpt = null) {
  const malStr = String(malId || '');
  if (!/^\d+$/.test(malStr) || MEGA_BLOCKED_MAL_IDS.has(malStr)) return null;
  if (megaByMal.has(malStr)) return megaByMal.get(malStr);
  const missTs = megaMissCache.get(malStr);
  if (missTs && Date.now() - missTs < 900_000) return null;

  const media = mediaOpt || await animeRecord(malStr, true).catch(() => null);
  // A metadata timeout/rate limit is transient, not proof the title is missing.
  if (!media) return null;
  if (media.isAdult || !releasedAnime(media)) {
    megaMissCache.set(malStr, Date.now());
    return null;
  }
  const aniStr = String(media.id || '');
  const [subMal, dubMal] = await Promise.all([
    probeMegaPlayEmbedUrl(`https://megaplay.buzz/stream/mal/${malStr}/1/sub`),
    probeMegaPlayEmbedUrl(`https://megaplay.buzz/stream/mal/${malStr}/1/dub`)
  ]);
  let subOk = subMal, dubOk = dubMal;
  if (!subOk && !dubOk && aniStr && aniStr === malStr) {
    const [subAni, dubAni] = await Promise.all([
      probeMegaPlayEmbedUrl(`https://megaplay.buzz/stream/ani/${aniStr}/1/sub`),
      probeMegaPlayEmbedUrl(`https://megaplay.buzz/stream/ani/${aniStr}/1/dub`)
    ]);
    subOk = subAni;
    dubOk = dubAni;
  }
  if (!subOk && !dubOk) {
    megaMissCache.set(malStr, Date.now());
    return null;
  }

  const isMovie = media.format === 'MOVIE';
  const fmtMap = { MOVIE: 'Movie', TV: 'TV', TV_SHORT: 'TV_SHORT', ONA: 'ONA', OVA: 'OVA', SPECIAL: 'Special' };
  const eng = String(media.title?.english || '').trim();
  const rom = String(media.title?.romaji || '').trim();
  const nat = String(media.title?.native || '').trim();
  const syns = Array.isArray(media.synonyms) ? media.synonyms.filter(Boolean) : [];
  const allTitles = [...new Set([eng, rom, nat, ...syns].filter(Boolean))].join('; ');
  const sd = media.startDate || {};
  const entry = {
    id: `mp-${malStr}`,
    mal: malStr,
    ani: aniStr,
    title: eng || rom || nat,
    english: eng || rom,
    alternative: rom || eng,
    titles: allTitles,
    native: nat,
    poster: media.coverImage?.extraLarge || media.coverImage?.large || '',
    backdrop: media.bannerImage || media.coverImage?.extraLarge || '',
    description: String(media.description || '').replace(/<[^>]*>/g, '').trim(),
    year: sd.year || media.seasonYear || null,
    status: media.status === 'RELEASING' ? 'Currently Airing' : 'Finished Airing',
    score: media.averageScore ? (media.averageScore / 10).toFixed(2) : '',
    popularity: Number(media.popularity) || 0,
    genres: Array.isArray(media.genres) ? media.genres : [],
    format: fmtMap[media.format] || 'TV',
    aired: sd.year ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : '',
    episodes: isMovie ? 1 : (animeEpisodeCount(media) || 1),
    sub: Boolean(subOk),
    dub: Boolean(dubOk),
    updated: `${sd.year || media.seasonYear || 2024}-01-01 00:00:00`
  };
  if (!megaByMal.has(malStr)) {
    megaByMal.set(malStr, entry);
    if (aniStr && !megaByAni.has(aniStr)) megaByAni.set(aniStr, entry);
    const item = anikotoItem(entry);
    anikotoItems.push(item);
    indexedAnime.push(buildIndexedAnimeRecord(entry, item));
    if (media.relations?.edges) animeRelationRecords[malStr] = {idMal:Number(malStr),format:media.format,startDate:media.startDate,relations:media.relations.edges.filter(e=>['PREQUEL','SEQUEL'].includes(e.relationType)&&e.node?.type==='ANIME'&&e.node.idMal).map(e=>({type:e.relationType,idMal:e.node.idMal,format:e.node.format}))};
    refreshRelationFamilies();
    for (const raw of [entry.title, entry.english, entry.alternative, ...syns]) {
      const n = normalizeTitle(raw);
      if (n && n.length >= 3) megaAliasSet.add(n);
    }
  }
  return megaByMal.get(malStr);
}

function editDistanceAtMost(a, b, maxDist) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  let prev = new Uint16Array(lb + 1);
  let curr = new Uint16Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

function scoreCandidateMatch(qNorm, qCompact, qWords, primaryNorm, primaryCompact, candidates, compacts, allWords, subtitles = [], subCompacts = []) {
  if (!qNorm) return 0;
  let best = 0;

  // 1. Primary & full-alias matching
  if (primaryNorm === qNorm || (qCompact.length >= 2 && primaryCompact === qCompact)) {
    best = Math.max(best, 1620);
  }
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i], cc = compacts[i];
    const noArt = c.replace(/^(?:the|a|an)\s+/, '');
    if (c === qNorm || (qCompact.length >= 3 && cc === qCompact)) {
      best = Math.max(best, 1580);
    } else if (noArt && noArt !== c && noArt === qNorm) {
      best = Math.max(best, c === primaryNorm ? 1560 : 1510);
    } else if (c.startsWith(qNorm + ' ') || c.startsWith(qNorm)) {
      const penalty = Math.min(180, Math.max(0, c.length - qNorm.length) * 2.5);
      best = Math.max(best, (c === primaryNorm ? 1360 : 1240) - penalty);
    } else if (noArt && (noArt.startsWith(qNorm + ' ') || noArt.startsWith(qNorm))) {
      const penalty = Math.min(180, Math.max(0, noArt.length - qNorm.length) * 2.5);
      best = Math.max(best, (c === primaryNorm ? 1330 : 1210) - penalty);
    } else if (qCompact.length >= 3 && cc.startsWith(qCompact)) {
      const penalty = Math.min(180, Math.max(0, cc.length - qCompact.length) * 2.5);
      best = Math.max(best, 1220 - penalty);
    } else if ((' ' + c + ' ').includes(' ' + qNorm + ' ')) {
      best = Math.max(best, c === primaryNorm ? 1140 : 1040);
    } else if (qCompact.length >= 4 && cc.includes(qCompact)) {
      best = Math.max(best, 940);
    }
  }

  // 2. Subtitle / post-colon & curated franchise alias matching (e.g. "Avengers: Endgame" -> "endgame" matches "end" & "end game"!)
  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i], sc = subCompacts[i] || sub.replace(/\s+/g, '');
    const noArt = sub.replace(/^(?:the|a|an)\s+/, '');
    if (sub === qNorm || (qCompact.length >= 2 && sc === qCompact) || (noArt && noArt === qNorm)) {
      best = Math.max(best, 1520);
    } else if (sub.startsWith(qNorm + ' ') || sub.startsWith(qNorm) || (noArt && noArt.startsWith(qNorm))) {
      const penalty = Math.min(150, Math.max(0, sub.length - qNorm.length) * 2.5);
      best = Math.max(best, 1260 - penalty);
    } else if (qCompact.length >= 3 && sc.startsWith(qCompact)) {
      const penalty = Math.min(150, Math.max(0, sc.length - qCompact.length) * 2.5);
      best = Math.max(best, 1200 - penalty);
    } else if ((' ' + sub + ' ').includes(' ' + qNorm + ' ')) {
      best = Math.max(best, 1080);
    }
  }

  if (best >= 1200) return best;

  // 3. Multi-word / prefix token match within a single candidate or subtitle
  if (qWords.length >= 1) {
    for (const c of [...candidates, ...subtitles]) {
      const cWords = c.split(' ');
      if (qWords.every(qw => cWords.some(cw => cw.startsWith(qw)))) {
        const lenDiff = Math.min(160, Math.max(0, cWords.length - qWords.length) * 18);
        best = Math.max(best, (c === primaryNorm ? 1120 : 1020) - lenDiff);
      }
    }
  }
  if (best >= 980) return best;

  // 4. Cross-alias prefix + fuzzy typo tolerance (handles "frieran", "interstelar", "jujtsu", "spider verse", etc.)
  const sigWords = qWords.filter(w => !STOP_WORDS.has(w));
  const checkWords = sigWords.length ? sigWords : qWords;
  let exactOrPrefixHits = 0;
  let fuzzyHits = 0;
  for (const qw of checkWords) {
    if (allWords.some(cw => cw === qw || (qw.length >= 3 && cw.startsWith(qw)))) {
      exactOrPrefixHits++;
      continue;
    }
    if (qw.length >= 4) {
      const maxEd = qw.length >= 7 ? 2 : 1;
      if (allWords.some(cw => cw.length >= 3 && editDistanceAtMost(qw, cw.slice(0, Math.max(cw.length, qw.length)), maxEd) <= maxEd)) {
        fuzzyHits++;
      }
    }
  }
  const totalMatched = exactOrPrefixHits + fuzzyHits;
  if (totalMatched === checkWords.length && checkWords.length > 0) {
    best = Math.max(best, fuzzyHits === 0 ? 860 : 640 - fuzzyHits * 35);
  } else if (checkWords.length >= 2 && totalMatched / checkWords.length >= 0.66 && exactOrPrefixHits >= 1) {
    best = Math.max(best, Math.round(420 * (totalMatched / checkWords.length)));
  }

  return best;
}

// Combines text relevance with the 0..1000 Backend Popularity Meter so popular titles always rise to the top
function finalizeSearchScore(baseMatchScore, item, qNorm, popMeterOpt = null) {
  if (baseMatchScore <= 0) return 0;
  const popMeter = popMeterOpt !== null ? popMeterOpt : computePopularityMeter(item);

  // Dampen exact-name monopoly of obscure micro-titles (< 220 popMeter) so global hits aren't buried under 3-vote films
  const credibility = Math.min(1, 0.36 + popMeter / 280);
  let score = baseMatchScore * credibility;

  // Strong backend popularity meter weight (0 .. 1900 pts) + subtle rating tie-breaker
  score += popMeter * 1.9;
  score += (Number(item.rating) || 0) * 9;

  // Subtle boost to root/main series over specials/recaps unless user explicitly searched for season/movie/ova/special
  const lowerTitle = String(item.title || '').toLowerCase();
  const wantsSubEntry = /\b(season|part|cour|ova|special|movie|film|recap)\b|\b[2-9]\b/.test(qNorm);
  if (!wantsSubEntry) {
    if (item.type === 'anime') {
      const fmt = String(item.format || '').toUpperCase();
      if (fmt === 'TV') score += 35;
      else if (fmt === 'MOVIE') score += 20;
      else if (fmt === 'SPECIAL' || fmt === 'OVA') score -= 55;
      if (/\b(season\s*[2-9]|2nd\s*season|3rd\s*season|4th\s*season|part\s*[2-9]|ova|special)\b/i.test(lowerTitle)) {
        score -= 40;
      }
    } else {
      score += 20;
    }
  }
  return score;
}

function searchLocalMegaPlay(term, extraAniMap = null) {
  const qNorm = normalizeTitle(term);
  if (!qNorm) return [];
  const qCompact = qNorm.replace(/\s+/g, '');
  const qWords = qNorm.split(' ').filter(Boolean);
  const results = [];

  for (const rec of indexedAnime) {
    let extraBoost = 0;
    const aniExtra = extraAniMap?.get(rec.item.id);
    let candidates = rec.candidates, compacts = rec.compacts, words = rec.words;
    if (aniExtra) {
      extraBoost = 80;
      if (aniExtra.extraCands.length) {
        const merged = new Set([...rec.candidates, ...aniExtra.extraCands]);
        candidates = [...merged];
        compacts = candidates.map(c => c.replace(/\s+/g, ''));
        const ws = new Set(rec.words);
        for (const c of aniExtra.extraCands) for (const w of c.split(' ')) if (w) ws.add(w);
        words = [...ws];
      }
    }
    let mScore = scoreCandidateMatch(qNorm, qCompact, qWords, rec.primaryNorm, rec.primaryCompact, candidates, compacts, words, rec.subtitles, rec.subCompacts);
    if (mScore <= 0 && aniExtra) mScore = 760;
    if (mScore <= 0) continue;
    const enrichedItem = aniExtra?.mediaItem ? {
      ...rec.item,
      popularity: Math.max(Number(rec.item.popularity) || 0, Number(aniExtra.popularity) || 0),
      backdrop: rec.item.backdrop || aniExtra.mediaItem.backdrop,
      rating: rec.item.rating || aniExtra.mediaItem.rating
    } : rec.item;
    const popMeter = aniExtra?.popularity ? computePopularityMeter(enrichedItem) : rec.popMeter;
    const total = finalizeSearchScore(mScore + extraBoost, enrichedItem, qNorm, popMeter);
    results.push({ item: enrichedItem, score: total, popMeter });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 240);
}

function scoreOttSearchItem(rawTmdb, qNorm, qCompact, qWords, allowTranslatedFallback = true) {
  const item = ott(rawTmdb);
  const pNorm = normalizeTitle(item.title);
  const oNorm = normalizeTitle(item.originalTitle);
  const candidates = [pNorm, oNorm].filter(Boolean);
  const compacts = candidates.map(c => c.replace(/\s+/g, ''));
  const subSet = new Set();
  for (const r of [item.title, item.originalTitle]) {
    for (const sub of extractSubtitleParts(r)) {
      if (!candidates.includes(sub)) subSet.add(sub);
    }
  }
  for (const al of CURATED_OTT_ALIASES.get(`${item.type}:${item.id}`) || []) {
    const n = normalizeTitle(al);
    if (n) subSet.add(n);
  }
  const subtitles = [...subSet];
  const subCompacts = subtitles.map(c => c.replace(/\s+/g, ''));
  const wordSet = new Set();
  for (const c of [...candidates, ...subtitles]) for (const w of c.split(' ')) if (w) wordSet.add(w);
  let mScore = scoreCandidateMatch(qNorm, qCompact, qWords, pNorm, pNorm.replace(/\s+/g, ''), candidates, compacts, [...wordSet], subtitles, subCompacts);
  if (mScore <= 0) {
    if (allowTranslatedFallback) mScore = 480;
    else if ((item.voteCount >= 120 || item.popularity >= 25) && qNorm.length >= 3) mScore = 500;
    else return null;
  }
  const popMeter = computePopularityMeter(item);
  return { item, score: finalizeSearchScore(mScore, item, qNorm || pNorm || 'q', popMeter), popMeter };
}

function animePopRank(item) {
  const aniPop = Number(item.popularity) || 0;
  if (aniPop > 0) return aniPop + (item.rating || 7) * 4000;
  return ((item.rating || 6) ** 4) * (item.dub ? 1.35 : 1) * ((Number(item.year) || 0) >= 2015 ? 1.2 : 1);
}

function sortAnikoto(items, sort) {
  let copy = [...items];
  if (sort === 'rating') copy.sort((a, b) => (b.rating || 0) - (a.rating || 0) || animePopRank(b) - animePopRank(a));
  else if (sort === 'newest') copy.sort((a, b) => (b.year || 0) - (a.year || 0) || String(b.updated).localeCompare(String(a.updated)));
  else if (sort === 'title') copy.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  else copy.sort((a, b) => animePopRank(b) - animePopRank(a));
  return copy;
}

const EPISODIC_ANIME_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);
const EXPLICIT_SEASON_SUFFIX_RE = /(?:\s*[:\-–—]\s*|\s+)(?:season\s*\d+|\d+(?:st|nd|rd|th)\s+season|part\s*\d+|cour\s*\d+|the\s+final\s+season.*|final\s+season.*|(?:ii|iii|iv|v|vi))(?:\s+part\s*\d+)?\s*$/i;

function isEpisodicCatalogAnime(item) {
  if (!item || item.type !== 'anime' || item.isMovie) return false;
  const fmt = String(item.format || '').toUpperCase();
  if (/MOVIE|OVA|SPECIAL|MUSIC/.test(fmt)) return false;
  return true;
}

function stripAnimeSeasonSuffix(rawTitle) {
  let clean = String(rawTitle || '').replace(/\s*\(TV\)\s*$/i, '').trim();
  let prev = '';
  while (clean && clean !== prev) {
    prev = clean;
    clean = clean.replace(EXPLICIT_SEASON_SUFFIX_RE, '').trim();
  }
  return clean;
}

const localSeasonFamilyByMal = new Map();
const localRootItemByMal = new Map();
(() => {
  const byRootKey = new Map();
  const baseExactKeys = new Set();
  for (const it of anikotoItems) {
    if (!isEpisodicCatalogAnime(it)) continue;
    const exactKey = normalizeTitle(it.title);
    if (exactKey && stripAnimeSeasonSuffix(it.title) === it.title.replace(/\s*\(TV\)\s*$/i, '').trim()) {
      baseExactKeys.add(exactKey);
    }
  }
  for (const it of anikotoItems) {
    if (!isEpisodicCatalogAnime(it)) continue;
    const exactKey = normalizeTitle(it.title);
    const stripped = normalizeTitle(stripAnimeSeasonSuffix(it.title));
    if (!stripped || stripped.length < 3) continue;
    if (stripped !== exactKey && !baseExactKeys.has(stripped)) {
      // Also allow grouping multiple explicit seasons even when S1 had "Season 1" in title
      const list = byRootKey.get(stripped) || [];
      list.push(it);
      byRootKey.set(stripped, list);
      continue;
    }
    const list = byRootKey.get(stripped) || [];
    list.push(it);
    byRootKey.set(stripped, list);
  }
  for (const [, group] of byRootKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const aBase = stripAnimeSeasonSuffix(a.title) === a.title.replace(/\s*\(TV\)\s*$/i, '').trim() ? 0 : 1;
      const bBase = stripAnimeSeasonSuffix(b.title) === b.title.replace(/\s*\(TV\)\s*$/i, '').trim() ? 0 : 1;
      return (Number(a.year) || 9999) - (Number(b.year) || 9999) || aBase - bBase || Number(a.id) - Number(b.id);
    });
    const root = sorted[0];
    const entries = sorted.map(s => ({
      id: String(s.id),
      anilistId: s.anilistId ? String(s.anilistId) : '',
      name: s.title,
      episodes: s.episodes,
      format: s.format || 'TV',
      year: Number(s.year) || 9999
    }));
    for (const s of sorted) {
      localSeasonFamilyByMal.set(String(s.id), entries);
      if (String(s.id) !== String(root.id)) localRootItemByMal.set(String(s.id), root);
    }
  }
})();

// Beyblade generations have unrelated titles and are not all direct AniList
// sequels. Explicit provider IDs preserve correct playback for each entry.
const BEYBLADE_IDS = ['288','1669','1668','5962','8410','43421','13231','31049','34901','37283','39282','41439','48455','56566'];
const beybladeEntries = BEYBLADE_IDS.map(id => anikotoItems.find(x => String(x.id) === id)).filter(Boolean);
if (beybladeEntries.length > 1 && String(beybladeEntries[0].id) === '288') {
  const family = beybladeEntries.map(s => ({id:String(s.id), anilistId:String(s.anilistId || ''), name:s.title, episodes:s.episodes, format:s.format || 'TV'}));
  for (const s of beybladeEntries) {
    localSeasonFamilyByMal.set(String(s.id), family);
    if (String(s.id) !== '288') localRootItemByMal.set(String(s.id), beybladeEntries[0]);
  }
}
// Replace title-based guesses with explicit relationship components when known.
// Keep the older conservative suffix fallback only where no linked family is
// available. Curated generation groups cover franchises AniList splits apart.
let animeRelationRecords = {};
try { animeRelationRecords = JSON.parse(fs.readFileSync(path.resolve('data/anime-relations.json'), 'utf8')).records || {}; }
catch (error) { console.warn('[anime] relationship snapshot unavailable:', error.message); }
const relationMemberIds=new Set();
function refreshRelationFamilies() {
for (const id of relationMemberIds) { localRootItemByMal.delete(id); localSeasonFamilyByMal.delete(id); }
relationMemberIds.clear();
const relationFamilies = buildAnimeFamilies(anikotoItems, animeRelationRecords, [BEYBLADE_IDS, [...POKEMON_IDS]]);
for (const group of relationFamilies) {
  // An inferred family overlapping an authoritative one must not redirect a
  // sibling into a different family. Remove that entire old inferred family.
  for (const item of group) {
    const previous = localSeasonFamilyByMal.get(String(item.id)) || [];
    for (const member of previous) { localRootItemByMal.delete(String(member.id)); localSeasonFamilyByMal.delete(String(member.id)); }
  }
  const rootItem=group[0];
  const entries=group.map(s=>({id:String(s.id),anilistId:String(s.anilistId || ''),name:s.title,episodes:s.episodes,format:s.format || 'TV',year:Number(s.year)||9999}));
  for (const item of group) {
    relationMemberIds.add(String(item.id));
    localSeasonFamilyByMal.set(String(item.id), entries);
    if (String(item.id)!==String(rootItem.id)) localRootItemByMal.set(String(item.id),rootItem);
    else localRootItemByMal.delete(String(item.id));
  }
}
}
refreshRelationFamilies();
// The provider's Pokémon series use different titles, so suffix matching alone
// cannot identify them as one franchise. Only redirect when the original series
// is actually playable; keep the individual ids in the selector and deep links.
const pokemonCatalogRoot = anikotoItems.find(item => String(item.id) === '527' && megaByMal.has('527'));

function dedupeCatalog(list, preserveSequels = false) {
  let output = [], positions = new Map();
  for (let rawItem of list) {
    if (!rawItem?.id || !rawItem?.title || !rawItem?.poster) continue;
    let item = rawItem;
    if (item.type === 'anime' && pokemonCatalogRoot && POKEMON_IDS.has(String(item.id))) item = pokemonCatalogRoot;
    if (item.type === 'anime' && localRootItemByMal.has(String(item.id))) {
      item = localRootItemByMal.get(String(item.id));
    }
    if (item.type === 'anime' && !megaByMal.has(String(item.id))) continue;
    if (item.type !== 'anime' && item.japaneseAnimation) continue;
    let kind = item.type === 'movie' || item.isMovie ? 'movie' : 'series';
    let key = item.year ? `${normalizeTitle(item.title)}|${item.year}|${kind}` : `${item.type}:${item.id}`;
    let idKey = `${item.type}:${item.id}`;
    if (positions.has(idKey)) continue;
    if (!positions.has(key)) {
      positions.set(key, output.length);
      positions.set(idKey, output.length);
      output.push(item);
      continue;
    }
    let at = positions.get(key), old = output[at];
    if (old.type === 'anime' && item.type !== 'anime') {
      output[at] = { ...old, backdrop: item.backdrop || old.backdrop };
    } else if (item.type === 'anime' && old.type !== 'anime') {
      output[at] = { ...item, backdrop: old.backdrop || item.backdrop };
      positions.set(idKey, at);
    } else if (old.type !== 'anime' && item.type !== 'anime') {
      // Never drop a distinct TMDB movie/series just because another movie/series shares its title & year!
      positions.set(idKey, output.length);
      output.push(item);
    }
  }
  return output;
}

// A series that has been announced but has nothing to play yet - not on the
// provider, or airing and simply not carried - used to answer 404, which the app
// drew as a dead-end error card. It gets a real details page instead: the title,
// the artwork, the synopsis and an Upcoming mark, with no play button to press.
// Returns null only when AniList has never heard of the id, so a bad link still
// fails the way a bad link should.
async function upcomingAnimeDetail(malId) {
  const media = await animeRecord(malId).catch(() => null);
  if (!media || !(media.idMal || media.id)) return null;
  const item = ani(media);
  // Only "announced, not yet aired" earns the Upcoming mark. A series that is
  // out there but simply not carried is a different truth, and the page says so
  // without borrowing a badge that promises a date.
  item.upcoming = media.status === 'NOT_YET_RELEASED';
  item.unavailable = !item.upcoming;
  item.playable = false;
  item.sub = false;
  item.dub = false;
  item.episodes = null;
  item.episodeCountKind = 'available';
  item.status = media.status || item.status;
  Object.assign(item, animeReleaseHints(media));
  item.backdrop = media.bannerImage || item.backdrop;
  return { item, episodes: [], seasons: [], upcoming: item.upcoming };
}

async function animeRecord(id, withRelations = false) {
  let d = await anilist(`query($id:Int){Media(idMal:$id,type:ANIME){${fields}${withRelations ? ' relations{edges{relationType node{idMal type format}}}' : ''}}}`, { id: Number(id) });
  return d.Media;
}
async function animeRecordsBatch(malIds) {
  const nums = [...new Set(malIds.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 25);
  if (!nums.length) return [];
  const d = await anilist(
    `query($ids:[Int]){Page(page:1,perPage:25){media(idMal_in:$ids,type:ANIME){${fields} relations{edges{relationType node{idMal type format}}}}}}`,
    { ids: nums }
  );
  return d?.Page?.media || [];
}
function animeSeasonEntry(media) {
  const malStr = String(media.idMal);
  const provider = megaByMal.get(malStr);
  const item = ani(media);
  const catalogName = provider ? cleanAnimeDisplayTitle(provider) : '';
  return {
    id: malStr,
    anilistId: String(media.id),
    name: catalogName || item.title,
    episodes: positiveInt(provider?.episodes) || item.episodes,
    format: item.format
  };
}

const seasonFamilyCache = new Map();

async function animeSeasonFamily(media, fallbackMalId = '') {
  const rootMal = String(media?.idMal || fallbackMalId || '');
  if (!rootMal) return [];
  const cached = seasonFamilyCache.get(rootMal);
  if (cached && Date.now() - cached.time < 1800_000) return cached.seasons;

  const localFallback = (localSeasonFamilyByMal.get(rootMal) || []).map(({ year, ...rest }) => rest);
  if (localFallback.length >= 2) return localFallback;
  if (!media || media.format === 'MOVIE' || !EPISODIC_ANIME_FORMATS.has(media.format)) {
    return localFallback.length >= 2 ? localFallback : [];
  }

  const entries = new Map([[rootMal, media]]);
  const seen = new Set([rootMal]);
  let frontier = [media];

  // Traverse PREQUEL/SEQUEL graph across all episodic anime formats (TV, TV_SHORT, ONA) in batched GraphQL hops
  for (let depth = 0; depth < 6 && frontier.length && seen.size < 24; depth++) {
    const nextIds = [];
    for (const cur of frontier) {
      for (const edge of cur.relations?.edges || []) {
        const node = edge.node;
        const nId = String(node?.idMal || '');
        if (
          !['PREQUEL', 'SEQUEL'].includes(edge.relationType) ||
          node?.type !== 'ANIME' ||
          !EPISODIC_ANIME_FORMATS.has(node?.format) ||
          !nId ||
          seen.has(nId)
        ) continue;
        seen.add(nId);
        nextIds.push(nId);
      }
    }
    if (!nextIds.length) break;
    try {
      const fetched = await animeRecordsBatch(nextIds);
      frontier = [];
      for (const linked of fetched) {
        if (linked?.idMal && EPISODIC_ANIME_FORMATS.has(linked.format)) {
          entries.set(String(linked.idMal), linked);
          frontier.push(linked);
        }
      }
    } catch {
      break;
    }
  }

  const aniListSeasons = [...entries.values()]
    .filter(m => releasedAnime(m) && megaForMedia(m))
    .sort((a, b) =>
      (a.startDate?.year || 9999) - (b.startDate?.year || 9999) ||
      (a.startDate?.month || 1) - (b.startDate?.month || 1) ||
      (a.startDate?.day || 1) - (b.startDate?.day || 1) ||
      Number(a.id) - Number(b.id)
    )
    .map(animeSeasonEntry);

  // Merge any local catalog seasons not yet linked on AniList
  const mergedById = new Map();
  for (const s of aniListSeasons) mergedById.set(s.id, s);
  for (const s of localFallback) {
    if (!mergedById.has(s.id)) mergedById.set(s.id, s);
  }
  const finalSeasons = mergedById.size >= 2 ? [...mergedById.values()] : [];

  if (finalSeasons.length >= 2) {
    const now = Date.now();
    for (const s of finalSeasons) {
      seasonFamilyCache.set(s.id, { seasons: finalSeasons, time: now });
    }
  }
  return finalSeasons;
}

let sharedKey = null;
async function tmdbKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  if (!sharedKey) sharedKey = (await freekeys()).tmdb_key;
  return sharedKey;
}
async function tmdb(route, params = {}, timeout = 10000) {
  let key = await tmdbKey();
  let q = new URLSearchParams({ ...params, api_key: key, language: 'en-US' });
  try {
    return await remote('https://api.themoviedb.org/3/' + route + '?' + q, { timeout });
  } catch (e) {
    if (process.env.TMDB_API_KEY) throw e;
    sharedKey = (await freekeys()).tmdb_key;
    q.set('api_key', sharedKey);
    return remote('https://api.themoviedb.org/3/' + route + '?' + q, { timeout });
  }
}

async function getTmdbMetaForResolver(input) {
  let [d, seasonData] = await Promise.all([
    tmdb(`${input.type}/${input.id}`, { append_to_response: 'external_ids' }),
    input.type === 'tv' ? tmdb(`tv/${input.id}/season/${input.season}`).catch(() => null) : Promise.resolve(null)
  ]);
  let epObj = input.type === 'tv' && Array.isArray(seasonData?.episodes)
    ? seasonData.episodes.find(e => Number(e.episode_number) === Number(input.episode))
    : null;
  let epRun = Number(epObj?.runtime) || (Array.isArray(d.episode_run_time) ? Number(d.episode_run_time[0]) : 0) || 0;
  return {
    title: d.title || d.name || d.original_title || d.original_name || '',
    year: String(d.release_date || d.first_air_date || '').slice(0, 4),
    imdbId: d.imdb_id || d.external_ids?.imdb_id || '',
    originalLanguage: String(d.original_language || '').toLowerCase(),
    spokenLanguages: (Array.isArray(d.spoken_languages) ? d.spoken_languages : []).map(l => ({ code: String(l.iso_639_1 || '').toLowerCase(), name: l.english_name || l.name || '' })).filter(l => l.code),
    episodeRuntimeMinutes: epRun,
    movieRuntimeMinutes: Number(d.runtime) || 0
  };
}

function proxySubtitleTracks(rawTracks, defaultProvider = 'vidcore', defaultHeaders = {}) {
  return (rawTracks || []).map(x => {
    try {
      const opts = {};
      if (x.timeScale) opts.timeScale = x.timeScale;
      if (x.offsetSec) opts.offsetSec = x.offsetSec;
      return {
        kind: x.kind || 'subtitles', language: x.language || 'und', label: x.label || 'Subtitle',
        src: mediaUrl(x.src, x.proxyProvider || defaultProvider, x.headers || defaultHeaders, opts)
      };
    } catch { return null; }
  }).filter(Boolean);
}

const readStates = () => {
  try {
    const d = JSON.parse(fs.readFileSync(statesDb, 'utf8'));
    if (!d || typeof d !== 'object' || Array.isArray(d) || (d.visitors && (typeof d.visitors !== 'object' || Array.isArray(d.visitors))) || (d.meta && (typeof d.meta !== 'object' || Array.isArray(d.meta)))) throw Error('invalid state');
    return { visitors: d.visitors || {}, meta: d.meta || {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { visitors: {}, meta: {} };
    // Never treat an unreadable state database as blank and overwrite it.
    throw Error('Saved kozuTV data is unavailable and was not overwritten.');
  }
};
function writeStates(states) {
  const temp = `${statesDb}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(states), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, statesDb);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}
const cleanState = state => ({
  watchlist: Array.isArray(state?.watchlist) ? state.watchlist.slice(0, 100) : [],
  history: Array.isArray(state?.history) ? state.history.slice(0, 100) : [],
  settings: state?.settings && typeof state.settings === 'object' && !Array.isArray(state.settings) ? state.settings : {}
});
function readState(owner) {
  let states = readStates(), existing = states.visitors[owner.id];
  if (!existing && !states.meta.legacyMigrated) {
    let legacy = null;
    try { legacy = JSON.parse(fs.readFileSync(db)); } catch {}
    states.meta.legacyMigrated = true;
    if (legacy && (legacy.watchlist?.length || legacy.history?.length)) states.visitors[owner.id] = cleanState(legacy);
    writeStates(states);
    existing = states.visitors[owner.id];
  }
  return cleanState(existing);
}
function writeState(owner, state) {
  let states = readStates();
  let next = cleanState(state);
  states.visitors[owner.id] = next;
  writeStates(states);
  return next;
}
const parseCookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2));
function appendCookie(res, value) {
  if (!res || res.headersSent) return;
  let old = res.getHeader('Set-Cookie'), all = old ? (Array.isArray(old) ? old : [old]) : [];
  const name = value.split('=', 1)[0];
  res.setHeader('Set-Cookie', [...all.filter(cookie => !String(cookie).startsWith(name + '=')), value]);
}
function setVisitorCookie(res, id) {
  appendCookie(res, `kozutv_visitor=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000`);
}
function visitorId(req, res) {
  const cookies = parseCookies(req);
  const cookieId = cookies.kozutv_visitor || cookies.moscowtv_visitor;
  let id = /^[a-f0-9]{32}$/.test(cookieId || '') ? cookieId : crypto.randomBytes(16).toString('hex');
  if (cookies.kozutv_visitor !== id) {
    setVisitorCookie(res, id);
  }
  return id;
}
// ---------------------------------------------------------------- sessions
const SESSION_COOKIE = 'kozutv_session';
function sessionToken(req) {
  try {
    const jar = parseCookies(req) || {};
    return String(jar[SESSION_COOKIE] || '');
  } catch { return ''; }
}
// Cached per request so a page that asks twice does not hit the database twice.
const userByRequest = new WeakMap();
async function currentUser(req) {
  if (!databaseEnabled()) return null;
  if (userByRequest.has(req)) return userByRequest.get(req);
  const token = sessionToken(req);
  let row = null;
  if (token) row = await userForSession(token).catch(() => null);
  userByRequest.set(req, row);
  return row;
}
// Sign-in ends in a redirect, so the outcome travels back as a query marker the
// app reads once and erases. Without it a failure was silent: Discord said yes,
// the browser landed on the home page, and nothing explained why no avatar came
// with it.
function withSigninMarker(path, marker) {
  const base = /^\/(?!\/)/.test(String(path || '')) ? String(path) : '/browse';
  return marker ? `${base}${base.includes('?') ? '&' : '?'}signin=${encodeURIComponent(marker)}` : base;
}
function redirectWithCookie(res, location, session) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (session) {
    const secure = String(process.env.KOZUTV_SECURE_COOKIES || '').trim() === '1' ? '; Secure' : '';
    headers['Set-Cookie'] = `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
  }
  res.writeHead(302, headers);
  res.end();
}
function stateOwner(req, res) {
  // The app cannot hold a cookie (cross-origin), so it sends the id it was
  // given on first launch. It is the same kind of random 128-bit value a
  // cookie holds - not a credential, and it grants nothing but its own list.
  let device = String(req.headers['x-kozutv-device'] || '');
  if (/^[a-f0-9]{32}$/.test(device)) return { scope: 'visitors', id: device };
  return { scope: 'visitors', id: visitorId(req, res) };
}
async function requestBody(req) {
  let chunks = [];
  for await (let chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 50000) throw Error('Payload too large');
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
// Rate limits reduce online guessing of the intentionally short recovery code;
// they cannot make a six-character token equivalent to an account password.
const tokenFailuresByIp = new Map(), tokenFailuresByVisitor = new Map(), tokenCreatesByIp = new Map();
const reportAttempts = new Map();
const TOKEN_WINDOW = 15 * 60 * 1000;
function recentCount(map, key, window = TOKEN_WINDOW) {
  const now = Date.now(), recent = (map.get(key) || []).filter(t => now - t < window);
  if (recent.length) map.set(key, recent); else map.delete(key);
  if (map.size > 10000) for (const [id, times] of map) if (!times.length || now - times[times.length - 1] >= window) map.delete(id);
  return recent.length;
}
function recordAttempt(map, key, window = TOKEN_WINDOW) {
  recentCount(map, key, window);
  const rows = map.get(key) || []; rows.push(Date.now()); map.set(key, rows);
}
function isSameOriginJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // command-line and same-origin clients without an Origin header
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const allowed = [String(req.headers.host || ''), String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()];
    // Arena's preview proxy may rewrite Host before forwarding the request.
    if (process.env.E2B_SANDBOX_ID) allowed.push(`${process.env.PORT || 3000}-${process.env.E2B_SANDBOX_ID}.e2b.app`);
    return allowed.some(host => host && host.toLowerCase() === url.host.toLowerCase());
  } catch { return false; }
}

function num(s) { return /^\d{1,10}$/.test(s || '') ? s : null; }

const CATALOG_ERA_SHARDS = [
  ['2024-01-01', null],
  ['2021-01-01', '2023-12-31'],
  ['2018-01-01', '2020-12-31'],
  ['2014-01-01', '2017-12-31'],
  ['2008-01-01', '2013-12-31'],
  ['1998-01-01', '2007-12-31'],
  ['1980-01-01', '1997-12-31'],
  ['1900-01-01', '1979-12-31']
];

let cachedCatalogTotals = null;
let cachedCatalogTotalsAt = 0;
async function getCatalogTotals() {
  if (cachedCatalogTotals && Date.now() - cachedCatalogTotalsAt < 3600_000) return cachedCatalogTotals;
  try {
    const td = today();
    const [mShards, tShards] = await Promise.all([
      Promise.all(CATALOG_ERA_SHARDS.map(([gte, lte]) => tmdb('discover/movie', {
        include_adult: 'false',
        'primary_release_date.gte': gte,
        'primary_release_date.lte': lte || td,
        page: '1'
      }, 6000).catch(() => ({ total_results: 0 })))),
      Promise.all(CATALOG_ERA_SHARDS.map(([gte, lte]) => tmdb('discover/tv', {
        include_adult: 'false',
        'first_air_date.gte': gte,
        'first_air_date.lte': lte || td,
        page: '1'
      }, 6000).catch(() => ({ total_results: 0 }))))
    ]);
    const movies = mShards.reduce((s, r) => s + (Number(r?.total_results) || 0), 0) || 160000;
    const tv = tShards.reduce((s, r) => s + (Number(r?.total_results) || 0), 0) || 146000;
    const anime = anikotoItems.length;
    cachedCatalogTotals = { movies, tv, anime, all: movies + tv + anime };
    cachedCatalogTotalsAt = Date.now();
    return cachedCatalogTotals;
  } catch {
    return { movies: 160000, tv: 146000, anime: anikotoItems.length, all: 306000 + anikotoItems.length };
  }
}

function applyGenreToTmdbParams(params, mediaType, genre) {
  if (!genre) return true;
  if (mediaType === 'movie') {
    if (movieGenreIds[genre]) { params.with_genres = String(movieGenreIds[genre]); return true; }
    if (movieKeywordIds[genre]) { params.with_keywords = String(movieKeywordIds[genre]); return true; }
    return false;
  }
  if (tvGenreIds[genre]) { params.with_genres = String(tvGenreIds[genre]); return true; }
  if (tvKeywordIds[genre]) { params.with_keywords = String(tvKeywordIds[genre]); return true; }
  return false;
}

function applyYearFilterToTmdbParams(params, mediaType, yearVal) {
  const gteKey = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const lteKey = mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
  const td = today();
  params[lteKey] = td;
  if (!yearVal) return;
  if (/^\d{4}$/.test(yearVal)) {
    params[mediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = yearVal;
    return;
  }
  const eraRanges = {
    '2020s': ['2020-01-01', td],
    '2010s': ['2010-01-01', '2019-12-31'],
    '2000s': ['2000-01-01', '2009-12-31'],
    '1990s': ['1990-01-01', '1999-12-31'],
    '1980s': ['1980-01-01', '1989-12-31'],
    classic: ['1900-01-01', '1979-12-31']
  };
  if (eraRanges[yearVal]) {
    params[gteKey] = eraRanges[yearVal][0];
    params[lteKey] = eraRanges[yearVal][1];
  }
}

function filterAnimeByYearEra(itemYear, yearVal) {
  if (!yearVal) return true;
  const y = Number(itemYear) || 0;
  if (/^\d{4}$/.test(yearVal)) return String(itemYear) === yearVal;
  if (yearVal === '2020s') return y >= 2020;
  if (yearVal === '2010s') return y >= 2010 && y <= 2019;
  if (yearVal === '2000s') return y >= 2000 && y <= 2009;
  if (yearVal === '1990s') return y >= 1990 && y <= 1999;
  if (yearVal === '1980s') return y >= 1980 && y <= 1989;
  if (yearVal === 'classic') return y > 0 && y <= 1979;
  return true;
}

async function discoverTmdbBatch(mediaType, { genre = '', year = '', lang = '', sort = 'popularity', uiPage = 1, pagesPerBatch = 2, requirePoster = false, allowShards = true, strict = false } = {}) {
  const params = { include_adult: 'false' };
  if (!applyGenreToTmdbParams(params, mediaType, genre)) {
    return { items: [], totalResults: 0, hasMore: false };
  }
  applyYearFilterToTmdbParams(params, mediaType, year);
  if (lang && validLangCodes.has(lang)) {
    params.with_original_language = lang;
  }
  const sortMap = {
    popularity: 'popularity.desc',
    trending: 'popularity.desc',
    rating: 'vote_average.desc',
    newest: mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
    title: mediaType === 'movie' ? 'title.asc' : 'name.asc'
  };
  params.sort_by = sortMap[sort] || 'popularity.desc';
  if (sort === 'rating') {
    params['vote_count.gte'] = lang && lang !== 'en' ? '10' : '25';
  }

  // Trending without genre/year/lang filter uses TMDB's live weekly trending feed for pages 1..250
  const useTrendingFeed = sort === 'trending' && !genre && !year && !lang && (uiPage - 1) * pagesPerBatch + 1 <= 500;
  const rawStart = (uiPage - 1) * pagesPerBatch + 1;

  const pageRequests = [];
  for (let offset = 0; offset < pagesPerBatch; offset++) {
    const absPage = rawStart + offset;
    if (useTrendingFeed) {
      if (absPage <= 500) pageRequests.push(tmdb(`trending/${mediaType}/week`, { page: String(absPage) }));
      continue;
    }
    if (absPage <= 500) {
      pageRequests.push(tmdb(`discover/${mediaType}`, { ...params, page: String(absPage) }));
    } else if (!year && allowShards) {
      const shardIdx = Math.floor((absPage - 1) / 500);
      const shardPage = ((absPage - 1) % 500) + 1;
      const shard = CATALOG_ERA_SHARDS[shardIdx];
      if (shard) {
        const gteKey = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
        const lteKey = mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
        pageRequests.push(tmdb(`discover/${mediaType}`, {
          ...params,
          [gteKey]: shard[0],
          [lteKey]: shard[1] || today(),
          page: String(shardPage)
        }));
      }
    }
  }

  if (!pageRequests.length) return { items: [], totalResults: 0, hasMore: false };
  const settled = await Promise.allSettled(pageRequests);
  if (strict && settled.some(result => result.status === 'rejected')) throw Error('Catalog temporarily unavailable. Please try again.');
  let items = [];
  let totalResults = 0;
  let maxTotalPages = 0;
  let lastQueriedPage = rawStart;

  settled.forEach((res, idx) => {
    if (res.status !== 'fulfilled' || !res.value) return;
    const d = res.value;
    totalResults = Math.max(totalResults, Number(d.total_results) || 0);
    maxTotalPages = Math.max(maxTotalPages, Number(d.total_pages) || 0);
    lastQueriedPage = rawStart + idx;
    for (const raw of d.results || []) {
      const enriched = { ...raw, media_type: mediaType };
      if (releasedOtt(enriched, 0, requirePoster)) {
        items.push(ott(enriched));
      }
    }
  });

  // If unfiltered by genre/year/lang, reflect full sharded library size instead of TMDB's 20,001 single-query cap
  let hasMore = false;
  if (!genre && !year && !lang) {
    const totals = await getCatalogTotals();
    totalResults = Math.max(totalResults, mediaType === 'movie' ? totals.movies : totals.tv);
    hasMore = items.length > 0 && rawStart + pagesPerBatch <= CATALOG_ERA_SHARDS.length * 500;
  } else {
    hasMore = (lastQueriedPage < Math.min(500, maxTotalPages)) || (allowShards && !year && maxTotalPages >= 500 && rawStart + pagesPerBatch <= CATALOG_ERA_SHARDS.length * 500);
  }
  return { items: dedupeCatalog(items), totalResults, hasMore };
}

// Genre pages are cached independently of browser/visitor state. Cap concurrent
// upstream fetches and remember each finite TMDB boundary for the cache TTL, so
// a long local-anime tail doesn't repeatedly request a finished TMDB catalog.
const genrePages = createGenrePageCache();
const genreBoundaries = new Map(), genreAnimeLists = new Map();
const GENRE_CACHE_TTL = 600_000, GENRE_MAX_UI_PAGES = 2000;
async function genreTmdbBatch(mediaType, genre, sort, uiPage, pagesPerBatch) {
  const key = JSON.stringify([mediaType,genre,sort,pagesPerBatch]);
  const boundary = genreBoundaries.get(key);
  if (boundary && boundary.expires > Date.now() && uiPage > boundary.page)
    return {items:[],totalResults:boundary.totalResults,hasMore:false};
  if (boundary && boundary.expires <= Date.now()) genreBoundaries.delete(key);
  // TMDB itself exposes at most 500 pages per query. Don't restart the same
  // catalog in overlapping date shards: that repeats titles and requests.
  const result = await discoverTmdbBatch(mediaType, {genre,sort,uiPage,pagesPerBatch,requirePoster:true,allowShards:false,strict:true});
  if (!result.hasMore) {
    const previous = genreBoundaries.get(key);
    const page = previous && previous.expires > Date.now() ? Math.min(previous.page,uiPage) : uiPage;
    genreBoundaries.delete(key);
    genreBoundaries.set(key,{page,totalResults:result.totalResults,expires:Date.now()+GENRE_CACHE_TTL});
    while (genreBoundaries.size > 180) genreBoundaries.delete(genreBoundaries.keys().next().value);
  }
  return result;
}
function genreAnimeItems(genre,sort) {
  const key=JSON.stringify([genre,sort]), hit=genreAnimeLists.get(key);
  if (hit && hit.expires>Date.now()) {genreAnimeLists.delete(key);genreAnimeLists.set(key,hit);return hit.items;}
  const items=dedupeCatalog(sortAnikoto(anikotoItems.filter(x=>x.genres.includes(genre)),sort));
  genreAnimeLists.delete(key);genreAnimeLists.set(key,{items,expires:Date.now()+GENRE_CACHE_TTL});
  while (genreAnimeLists.size>100) genreAnimeLists.delete(genreAnimeLists.keys().next().value);
  return items;
}
async function buildGenrePage(g,type,sort,uiPage) {
  const wantAnime=type==='all'||type==='anime', wantMovie=type==='all'||type==='movie', wantTv=type==='all'||type==='tv';
  const empty={items:[],totalResults:0,hasMore:false};
  const [mBatch,tBatch]=await Promise.all([
    wantMovie?genreTmdbBatch('movie',g,sort,uiPage,type==='movie'?2:1):Promise.resolve(empty),
    wantTv?genreTmdbBatch('tv',g,sort,uiPage,type==='tv'?2:1):Promise.resolve(empty)
  ]);
  const animeFiltered=wantAnime?genreAnimeItems(g,sort):[];
  const perPage=type==='anime'?36:16;
  const animeSlice=animeFiltered.slice((uiPage-1)*perPage,uiPage*perPage);
  const mixed=[];
  for (let i=0;i<Math.max(animeSlice.length,mBatch.items.length,tBatch.items.length);i++) {
    if(mBatch.items[i])mixed.push(mBatch.items[i]);
    if(tBatch.items[i])mixed.push(tBatch.items[i]);
    if(animeSlice[i])mixed.push(animeSlice[i]);
  }
  const items=dedupeCatalog(mixed);
  const totalResults=mBatch.totalResults+tBatch.totalResults+animeFiltered.length;
  return {items,page:uiPage,hasMore:uiPage<GENRE_MAX_UI_PAGES&&Boolean(mBatch.hasMore||tBatch.hasMore||uiPage*perPage<animeFiltered.length),totalResults:Math.max(totalResults,items.length)};
}

// Same-origin fast LRU-cached image proxy (/api/img?u=...) to eliminate ISP CDN blocks & hotlink failures
const ALLOWED_IMG_HOSTS = new Set([
  'image.tmdb.org',
  'media.themoviedb.org',
  'cdn.anipixcdn.co',
  's4.anilist.co',
  'img.anili.st',
  'artworks.thetvdb.com',
  'thetvdb.com',
  'www.thetvdb.com',
  'cdn.myanimelist.net',
  'myanimelist.net',
  'media.kitsu.app',
  'media.kitsu.io',
  'static.tvmaze.com'
]);
const imgMemCache = new Map();
let imgMemBytes = 0;
const IMG_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const imgInflight = new Map();
// ---- Image fetch limiter (v9) ------------------------------------------
// A catalogue page asks for ~50 posters at once. Firing 50 upstream requests in
// parallel makes some CDN edges drop the tail of the burst, which showed up as
// black tiles. Cap the number in flight and queue the rest; the browser still
// gets every image, just in a few orderly waves.
const IMG_MAX_CONCURRENT = 12;
let imgActive = 0;
const imgQueue = [];
function imgSlot() {
  if (imgActive < IMG_MAX_CONCURRENT) { imgActive++; return Promise.resolve(); }
  return new Promise(resolve => imgQueue.push(resolve));
}
function imgRelease() {
  const next = imgQueue.shift();
  if (next) next();
  else imgActive = Math.max(0, imgActive - 1);
}

const FALLBACK_STILL_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#22252e"/><stop offset="100%" stop-color="#14161c"/></linearGradient></defs><rect width="320" height="180" fill="url(#bg)"/><circle cx="160" cy="90" r="26" fill="#ff731c" fill-opacity="0.16"/><path d="M153 78l20 12-20 12z" fill="#ff731c"/></svg>',
  'utf8'
);

async function handleImageProxy(req, res, url) {
  const raw = String(url.searchParams.get('u') || '').trim();
  let parsed = null;
  try { parsed = new URL(raw); } catch {}
  const host = String(parsed?.hostname || '').toLowerCase();
  const allowed = parsed && parsed.protocol === 'https:' && (
    ALLOWED_IMG_HOSTS.has(host)
    || host.endsWith('.tmdb.org')
    || host.endsWith('.anilist.co')
    || host.endsWith('.anipixcdn.co')
    || host.endsWith('.thetvdb.com')
    || host.endsWith('.myanimelist.net')
  );
  if (!allowed) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Invalid image URL');
  }

  const key = parsed.href;
  const hit = imgMemCache.get(key);
  if (hit && Date.now() - hit.time < 6 * 3600_000) {
    imgMemCache.delete(key);
    imgMemCache.set(key, hit);
    res.writeHead(200, {
      'Content-Type': hit.type,
      'Content-Length': String(hit.buf.byteLength),
      'Cache-Control': 'no-store'
    });
    return res.end(hit.buf);
  }

  let task = imgInflight.get(key);
  if (!task) {
    task = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await imgSlot();
          const r = await fetch(key, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(7500)
          });
          if (!r.ok) {
            imgRelease();
            if (attempt < 2 && (r.status >= 500 || r.status === 429 || r.status === 403)) {
              await new Promise(ok => setTimeout(ok, 180 + attempt * 260));
              continue;
            }
            return null;
          }
          const ct = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
          if (!ct.startsWith('image/')) { imgRelease(); return null; }
          const buf = Buffer.from(await r.arrayBuffer());
          imgRelease();
          if (!buf.byteLength || buf.byteLength > 8 * 1024 * 1024) return null;
          return { buf, type: ct, time: Date.now() };
        } catch {
          imgRelease();
          if (attempt < 2) await new Promise(ok => setTimeout(ok, 180 + attempt * 260));
        }
      }
      return null;
    })();
    imgInflight.set(key, task);
  }

  let result = null;
  try {
    result = await task;
  } finally {
    imgInflight.delete(key);
  }

  if (result) {
    if (result.buf.byteLength <= 1.5 * 1024 * 1024) {
      const previous = imgMemCache.get(key);
      if (previous) { imgMemCache.delete(key); imgMemBytes = Math.max(0, imgMemBytes - previous.buf.byteLength); }
      while (imgMemCache.size > 0 && (imgMemBytes + result.buf.byteLength > IMG_CACHE_MAX_BYTES || imgMemCache.size >= 480)) {
        const oldestKey = imgMemCache.keys().next().value;
        const oldest = imgMemCache.get(oldestKey);
        imgMemCache.delete(oldestKey);
        if (oldest) imgMemBytes = Math.max(0, imgMemBytes - oldest.buf.byteLength);
      }
      imgMemCache.set(key, result);
      imgMemBytes += result.buf.byteLength;
    }
    res.writeHead(200, {
      'Content-Type': result.type,
      'Content-Length': String(result.buf.byteLength),
      'Cache-Control': 'no-store'
    });
    return res.end(result.buf);
  }

  res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  return res.end('Image unavailable');
}

async function resolveAnimeTmdbMapping(malId, available, ep = 1) {
  const isAnimeMovie = String(available?.format || '').toUpperCase().includes('MOVIE');
  const [metaMalId, metaEp] = pokemonEpisodeMetaId(String(malId), Math.max(1, Number(ep) || 1));
  const az = await remote(`https://api.ani.zip/mappings?mal_id=${encodeURIComponent(metaMalId)}`, {
    ttl: 21600000,
    timeout: 2400,
    headers: { Accept: 'application/json' }
  }).catch(() => null);
  let tmdbId = az?.mappings?.themoviedb_id ? String(az.mappings.themoviedb_id) : '';
  let mediaType = isAnimeMovie || az?.mappings?.type === 'MOVIE' ? 'movie' : 'tv';
  const reqEp = metaEp;
  let azEp = az?.episodes?.[String(reqEp)] || null;
  let seasonNum = Number(azEp?.seasonNumber) || 0;
  let episodeNum = Number(azEp?.episodeNumber) || 0;

  // Handle merged split-cour seasons (e.g. Attack on Titan S3 MAL 35760 Ep 13..22 where ani.zip only lists Ep 1..12 in S3)
  if ((!seasonNum || !episodeNum) && az?.episodes) {
    let bestAnchorKey = 0;
    let bestAnchor = null;
    for (const [k, row] of Object.entries(az.episodes)) {
      if (!/^\d+$/.test(k)) continue;
      const kn = Number(k);
      if (kn > 0 && kn <= reqEp && Number(row?.seasonNumber) > 0 && Number(row?.episodeNumber) > 0 && kn > bestAnchorKey) {
        bestAnchorKey = kn;
        bestAnchor = row;
      }
    }
    if (!bestAnchor && az.episodes['1'] && Number(az.episodes['1'].seasonNumber) > 0) {
      bestAnchorKey = 1;
      bestAnchor = az.episodes['1'];
    }
    if (bestAnchor) {
      seasonNum = Number(bestAnchor.seasonNumber) || 1;
      episodeNum = (Number(bestAnchor.episodeNumber) || 1) + (reqEp - bestAnchorKey);
    }
  }
  if (!seasonNum) seasonNum = 1;
  if (!episodeNum) episodeNum = reqEp;

  // Verify/resolve movie TMDB ID via IMDb ID when ani.zip has a mismatched TV ID on a movie (e.g. Stand By Me Doraemon)
  if (mediaType === 'movie' && /^tt\d{5,10}$/i.test(az?.mappings?.imdb_id || '')) {
    const found = await tmdb(`find/${az.mappings.imdb_id}`, { external_source: 'imdb_id' }).catch(() => null);
    const mv = found?.movie_results?.[0];
    if (mv?.id) tmdbId = String(mv.id);
  }

  if (!tmdbId && available) {
    const cleanQ = stripAnimeSeasonSuffix(cleanAnimeDisplayTitle(available));
    if (cleanQ) {
      const sRes = await tmdb(`search/${mediaType}`, { query: cleanQ, page: 1 }).catch(() => null);
      const hit = (sRes?.results || []).find(r => japaneseAnimation(r))
        || (sRes?.results || []).find(r => Array.isArray(r?.genre_ids) && r.genre_ids.includes(16));
      if (hit?.id) tmdbId = String(hit.id);
    }
  }
  if (!tmdbId) return { az, tmdbMapping: null };
  return {
    az,
    tmdbMapping: {
      tmdbId,
      type: mediaType,
      season: mediaType === 'movie' ? 1 : seasonNum,
      episode: mediaType === 'movie' ? 1 : episodeNum
    }
  };
}

// Anonymous transcription consumes a paid external API: bound both the network
// surface and the hourly budget. Real deployments can set lower limits.
const transcriptionRates = new Map();
function transcriptionRate(key, limit) {
  const now = Date.now(); let row = transcriptionRates.get(key);
  if (!row || now - row.start >= 3600_000) row = { start: now, count: 0 };
  if (row.count >= limit) return false;
  row.count++; transcriptionRates.set(key, row);
  if (transcriptionRates.size > 2048) {
    for (const [id, old] of transcriptionRates) if (id !== 'global' && now-old.start>=3600_000) transcriptionRates.delete(id);
    while (transcriptionRates.size > 2048) { const victim=[...transcriptionRates.keys()].find(id=>id!=='global');if(!victim)break;transcriptionRates.delete(victim); }
  }
  return true;
}
async function api(req, res, url) {
  let p = url.pathname, q = url.searchParams;
  try {
    if (p === '/api/img') return await handleImageProxy(req, res, url);
    if (p === '/api/ai-transcription') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed.' }, 405, req);
      if (!req.headers.origin || !isSameOriginJson(req)) return json(res, { error: 'A same-origin JSON request is required.' }, 403, req);
      const clamp = (v, d) => Math.min(50000, Math.max(1, Number(v) || d));
      const ip = req.socket.remoteAddress || 'unknown';
      if (!transcriptionRate('ip:'+ip,clamp(process.env.AI_MAX_PER_IP_HOUR,1800)) || !transcriptionRate('global',clamp(process.env.AI_MAX_GLOBAL_HOUR,6000))) return json(res,{ error:'Rate limit.' },429,req);
      let body; try { body=await requestBody(req); } catch { return json(res,{error:'Invalid request.'},400,req); }
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45_000);
      const disconnected=()=>{if(!res.writableEnded)controller.abort()};
      req.once('aborted',disconnected);res.once('close',disconnected);
      try {const result=await requestTranscription(body,controller.signal,process.env.PORT||3000);if(!res.destroyed)return json(res,result,200,req);}
      catch(e){if(!res.destroyed)return json(res,{error:e instanceof AiError?e.code:'transcription_failed'},e instanceof AiError?e.status:502,req);}
      finally {clearTimeout(timer);req.off('aborted',disconnected);res.off('close',disconnected);}
      return;
    }
    if (p === '/api/presence') {
      // Fire-and-forget telemetry. Always answers instantly so the UI never
      // waits on Discord, and it is not cacheable.
      if (req.method !== 'POST') return json(res, { ok: false }, 405, req);
      let body = {};
      try { body = await requestBody(req); } catch { body = {}; }
      const clampStr = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
      reportPresence(req, {
        activity: clampStr(body.activity, 24),
        title: clampStr(body.title, 140),
        kind: clampStr(body.kind, 16),
        season: Number(body.season) || 0,
        episode: Number(body.episode) || 0,
        page: clampStr(body.page, 80),
        provider: clampStr(body.provider, 24),
        lang: clampStr(body.lang, 24),
        query: clampStr(body.query, 120)
      });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    // ------------------------------------------------------------ accounts
    // Sign in with Discord. The session token lives in an httpOnly cookie and is
    // only ever read here; the client just asks "who am I".
    if (p === '/api/auth/me') {
      return json(res, { configured: discordConfigured(), database: databaseEnabled(), user: publicUser(await currentUser(req)) }, 200, req);
    }

    if (p === '/api/auth/discord/start') {
      if (!discordConfigured()) return json(res, { error: 'Sign in is not configured on this server.' }, 503, req);
      const url = authorizeUrl(req, String(q.get('return') || '/browse'));
      if (!url) return json(res, { error: 'Sign in is not configured on this server.' }, 503, req);
      res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (p === '/api/auth/discord/callback') {
      const code = String(q.get('code') || ''), state = String(q.get('state') || '');
      const back = readOAuthState(state);
      const done = (path, marker) => redirectWithCookie(res, withSigninMarker(path, marker));
      if (q.get('error') || !code || !state) {
        // The visitor pressed Cancel on Discord's screen, or the link was stale.
        return done('/browse', 'cancelled');
      }
      if (!back) {
        // The signed state is what ties this callback to the tab that started it.
        // Ten minutes on Discord's consent screen is enough to expire it.
        return done('/browse', 'expired');
      }
      if (!databaseEnabled()) {
        console.warn('[auth] Discord sign-in arrived while the account database is off; no session could be stored.');
        return done('/browse', 'database');
      }
      try {
        const token = await exchangeCode(req, code);
        const profile = await fetchProfile(token.access_token);
        const row = await upsertDiscordUser(profile);
        if (!row) throw Error('Could not save that account.');
        const session = await createSession(row.id);
        if (!session) throw Error('Could not start a session.');
        pruneSessions().catch(() => {});
        return redirectWithCookie(res, withSigninMarker(back.returnTo || '/browse', 'success'), session);
      } catch (error) {
        // Which half failed decides what the visitor can do about it: an
        // invalid_grant from the token endpoint means the redirect URI recorded
        // in the Discord app and the one this server sends have drifted apart,
        // and nobody would guess that from a silent bounce back to the home page.
        const message = String(error?.message || error || '');
        console.warn(`[auth] Discord callback failed (${message}) | redirect_uri = ${redirectUriFor(req)}`);
        return done('/browse', /token|rejected|400|401/i.test(message) ? 'exchange' : 'profile');
      }
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      const token = sessionToken(req);
      if (token) await deleteSession(token);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (p === '/api/reports' && req.method === 'POST') {
      if (!isSameOriginJson(req)) return json(res, {error:'Invalid request'}, 403, req);
      const ip = String(req.socket.remoteAddress || 'unknown');
      if (recentCount(reportAttempts, ip, 3600000) >= 10) return json(res, {error:'Too many requests. Please try again later.'}, 429, req);
      let body; try { body = await requestBody(req); } catch { return json(res, {error:'Invalid request'}, 400, req); }
      const experienced=typeof body.experienced === 'string' ? body.experienced.trim() : '';
      const episodeSeason=typeof body.episodeSeason === 'string' ? body.episodeSeason.trim() : '';
      const description=typeof body.description === 'string' ? body.description.trim() : '';
      if (!experienced || experienced.length > 300 || episodeSeason.length > 300 || description.length > 5000) return json(res, {error:'Please check the form.'}, 400, req);
      recordAttempt(reportAttempts, ip, 3600000);
      if (!await submitReport(experienced, episodeSeason, description)) return json(res, {error:'Could not submit. Please try again.'}, 503, req);
      return json(res, {ok:true}, 200, req);
    }

    // ------------------------------------------------------------ reactions
    if (p === '/api/reactions' && req.method === 'GET') {
      const mediaType = String(q.get('type') || ''), mediaId = String(q.get('id') || '');
      if (!['anime', 'movie', 'tv'].includes(mediaType) || !/^\d+$/.test(mediaId)) return json(res, { error: 'Invalid title' }, 400);
      const user = await currentUser(req);
      if (!databaseEnabled()) return json(res, { likes: 0, dislikes: 0, mine: 0, available: false }, 200, req);
      if (q.get('all') === '1') {
        const map = await reactionMapForSeason({
          mediaType, mediaId, season: Number(q.get('season')) || 1, userId: user?.id || null
        });
        return json(res, { available: true, episodes: Object.fromEntries(map) }, 200, req);
      }
      const summary = await reactionSummary({
        mediaType, mediaId,
        season: Math.max(1, Number(q.get('season')) || 1),
        episode: Math.max(1, Number(q.get('episode')) || 1),
        userId: user?.id || null
      });
      return json(res, { ...summary, available: true }, 200, req);
    }

    if (p === '/api/reactions' && req.method === 'POST') {
      if (!databaseEnabled()) return json(res, { error: 'Reactions need the database.' }, 503, req);
      const user = await currentUser(req);
      if (!user) return json(res, { error: 'signin_required' }, 401, req);
      let body;
      try { body = await requestBody(req); } catch { return json(res, { error: 'Invalid body' }, 400); }
      const mediaType = String(body.type || ''), mediaId = String(body.id || '');
      if (!['anime', 'movie', 'tv'].includes(mediaType) || !/^\d+$/.test(mediaId)) return json(res, { error: 'Invalid title' }, 400);
      const season = Math.max(1, Number(body.season) || 1), episode = Math.max(1, Number(body.episode) || 1);
      const wanted = Number(body.reaction);
      if (![1, -1, 0].includes(wanted)) return json(res, { error: 'Invalid reaction' }, 400);
      // Pressing the same button twice clears the vote rather than stacking it.
      const current = body.set === true ? null : await reactionSummary({ mediaType, mediaId, season, episode, userId: user.id });
      const next = body.set === true ? wanted : (current.mine === wanted ? 0 : wanted);
      const saved = await setReaction({ userId: user.id, mediaType, mediaId, season, episode, reaction: next });
      if (saved === null) return json(res, { error: 'Could not save that.' }, 503, req);
      const summary = await reactionSummary({ mediaType, mediaId, season, episode, userId: user.id });
      return json(res, { ...summary, available: true }, 200, req);
    }

    if (p === '/api/state' || (p === '/api/settings' && req.method === 'POST') || ((p === '/api/watchlist' || p === '/api/history') && req.method === 'POST')) {
      const owner = stateOwner(req, res);
      const user = await currentUser(req);
      // Never silently write account changes into the guest file on auth/database failure.
      if (sessionToken(req) && !user) return json(res, {error:'Account session or storage unavailable. Please sign in again.'}, 503, req);
      const seed = readState(owner);
      const getState = async mutation => user ? accountState(user.id, seed, mutation) : (mutation ? writeState(owner, mutation(seed)) : seed);
      if (p === '/api/state') {
        const state = await getState(null);
        return state ? json(res, cleanState(state), 200, req) : json(res, {error:'Account storage unavailable'}, 503, req);
      }
      if (p === '/api/settings') {
        const body = await requestBody(req);
        const changes = Object.fromEntries(Object.entries(body.settings || {}).filter(([k,v]) => /^kozutv-[a-z0-9-]{1,70}$/.test(k) && (v === null || (typeof v === 'string' && v.length <= 500))).slice(0,80));
        const saved = await getState(state => { state=cleanState(state); for (const [k,v] of Object.entries(changes)) { if (v===null) delete state.settings[k]; else state.settings[k]=v; } return state; });
        return saved ? json(res, cleanState(saved), 200, req) : json(res, {error:'Account storage unavailable'}, 503, req);
      }

      let item = await requestBody(req);
      if (!['anime', 'movie', 'tv'].includes(item.type) || !num(String(item.id))) return json(res, { error: 'Invalid item' }, 400);
      let field = p.endsWith('watchlist') ? 'watchlist' : 'history';
      if (field === 'history' && item.dismiss === true) {
        try {
          const saved = await getState(state => dismissHistory(cleanState(state), item));
          return saved ? json(res, cleanState(saved), 200, req) : json(res, {error:'Account storage unavailable'}, 503, req);
        } catch { return json(res, {error:'Invalid next episode'}, 400, req); }
      }
      let record = {
        id: String(item.id),
        type: item.type,
        title: String(item.title || '').slice(0, 200),
        poster: String(item.poster || '').slice(0, 500),
        episode: Math.max(1, Number(item.episode) || 1),
        season: Math.max(1, Number(item.season) || 1),
        updated: Date.now(),
        genres: Array.isArray(item.genres) ? item.genres.map(String).slice(0, 10) : [],
        format: typeof item.format === 'string' ? item.format.slice(0, 20) : null,
        isMovie: Boolean(item.isMovie),
        currentTime: Math.max(0, Number(item.currentTime) || 0),
        duration: Math.max(0, Number(item.duration) || 0)
      };
      const saved = await getState(state => {
      state = cleanState(state);
      let found = state[field].findIndex(x => x.id === record.id && x.type === record.type);
      let old = found >= 0 ? state[field].splice(found, 1)[0] : null;
      if (field === 'history' && old && old.episode === record.episode && old.season === record.season) {
        record.currentTime = item.currentTime == null ? old.currentTime || 0 : record.currentTime;
        record.duration = item.duration == null ? old.duration || 0 : record.duration;
      }
      if (!record.genres.length && old) record.genres = old.genres || [];
      if (!item.remove) state[field].unshift(record);
      return state;
      });
      return saved ? json(res, cleanState(saved), 200, req) : json(res, {error:'Account storage unavailable'}, 503, req);
    }

    if (p === '/api/browse') {
      let [o] = await Promise.allSettled([tmdb('trending/all/week')]);
      let freshAnime = anikotoItems.filter(x => !x.isMovie).slice(0, 12);
      let popularAnimeSeries = sortAnikoto(anikotoItems.filter(x => !x.isMovie), 'popularity').slice(0, 10);
      let popularAnimeMovies = sortAnikoto(anikotoItems.filter(x => x.isMovie), 'popularity').slice(0, 10);
      let animeItems = [];
      for (let i = 0; i < 12; i++) {
        if (freshAnime[i]) animeItems.push(freshAnime[i]);
        if (popularAnimeMovies[i]) animeItems.push(popularAnimeMovies[i]);
        if (popularAnimeSeries[i]) animeItems.push(popularAnimeSeries[i]);
      }
      let ottItems = o.status === 'fulfilled'
        ? o.value.results.filter(x => ['tv', 'movie'].includes(x.media_type) && releasedOtt(x, 0, true)).map(ott)
        : [];
      if (!animeItems.length && !ottItems.length) throw Error('Catalogs are unavailable');
      let movies = ottItems.filter(x => x.type === 'movie'), shows = ottItems.filter(x => x.type === 'tv'), mixed = [];
      for (let i = 0; i < Math.max(animeItems.length, movies.length, shows.length); i++) {
        if (animeItems[i]) mixed.push(animeItems[i]);
        if (movies[i]) mixed.push(movies[i]);
        if (shows[i]) mixed.push(shows[i]);
      }
      mixed = dedupeCatalog(mixed);
      let history = readState(stateOwner(req, res)).history, watchedGenres = new Map();
      for (let [index, h] of history.entries()) {
        for (let g of h.genres || []) watchedGenres.set(g.toLowerCase(), (watchedGenres.get(g.toLowerCase()) || 0) + Math.max(1, 8 - index));
      }
      let watched = new Set(history.map(h => h.type + ':' + h.id));
      let suggestions = mixed
        .filter(x => !watched.has(x.type + ':' + x.id))
        .map(x => ({ ...x, match: (x.genres || []).reduce((n, g) => n + (watchedGenres.get(g.toLowerCase()) || 0), 0) }))
        .filter(x => x.match > 0)
        .sort((a, b) => b.match - a.match)
        .slice(0, 12);
      // Swap the low-resolution AniPix covers for the AniList originals so card
      // art is never upscaled on a phone.
      let spotlight = buildRandomizedSpotlight();
      // Serve instantly from whatever covers are already known, then sharpen the
      // unknown ones in the background. Waiting on AniList here is what made the
      // first paint of the catalogue feel slow.
      const knownPoster = x => {
        if (!x) return x;
        const id = x.anilistId || x.malId;
        const k = id ? `i:${id}` : `t:${String(x.title || '').toLowerCase()}|${x.year || ''}`;
        const hit = posterUpgradeCache.get(k);
        return hit ? { ...x, poster: hit } : x;
      };
      mixed = mixed.map(knownPoster);
      spotlight = spotlight.map(knownPoster);
      suggestions = suggestions.map(knownPoster);
      upgradeLowResPosters(mixed).catch(() => {});
      upgradeLowResPosters(spotlight).catch(() => {});
      upgradeLowResPosters(suggestions).catch(() => {});
      return json(res, {
        items: mixed,
        spotlight,
        suggestions,
        hasPreferences: watchedGenres.size > 0
      }, 200, req);
    }

    if (p === '/api/category-page') {
      const section = String(q.get('section') || '');
      const uiPage = Math.max(1, Math.min(2000, Math.floor(Number(q.get('page')) || 1)));
      const perPage = 24;
      if (section === 'trendingMovies') {
        const r = await discoverTmdbBatch('movie', { sort: 'trending', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      if (section === 'popularMovies') {
        const r = await discoverTmdbBatch('movie', { sort: 'popularity', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      if (section === 'topRatedMovies') {
        const r = await discoverTmdbBatch('movie', { sort: 'rating', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      if (section === 'trendingTv') {
        const r = await discoverTmdbBatch('tv', { sort: 'trending', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      if (section === 'popularTv') {
        const r = await discoverTmdbBatch('tv', { sort: 'popularity', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      if (section === 'topRatedTv') {
        const r = await discoverTmdbBatch('tv', { sort: 'rating', uiPage, pagesPerBatch: 2, requirePoster: true });
        return json(res, { items: r.items, page: uiPage, hasMore: r.hasMore }, 200, req);
      }
      let animePool = [];
      if (section === 'latestAnime') animePool = dedupeCatalog(anikotoItems.filter(x => !x.isMovie));
      else if (section === 'airingAnime') animePool = dedupeCatalog(sortAnikoto(anikotoItems.filter(x => x.status === 'RELEASING' && !x.isMovie), 'popularity'));
      else if (section === 'popularAnime') animePool = dedupeCatalog(sortAnikoto(anikotoItems, 'popularity'));
      const offset = (uiPage - 1) * perPage;
      const pageItems = animePool.slice(offset, offset + perPage);
      await upgradeLowResPosters(pageItems);
      return json(res, {
        items: pageItems,
        page: uiPage,
        hasMore: offset + perPage < animePool.length
      }, 200, req);
    }

    if (p === '/api/search-all') {
      let term = (q.get('q') || '').trim().slice(0, 100);
      let filterType = ['all', 'movie', 'tv', 'anime'].includes(q.get('type')) ? q.get('type') : 'all';
      let uiPage = Math.max(1, Math.min(250, Math.floor(Number(q.get('page')) || 1)));
      if (!term) return json(res, { items: [], page: 1, hasMore: false, totalResults: 0 }, 200, req);
      let qNorm = normalizeTitle(term), qCompact = qNorm.replace(/\s+/g, ''), qWords = qNorm.split(' ').filter(Boolean);

      const tmdbStartPage = (uiPage - 1) * 2 + 1;
      const wantAnime = filterType === 'all' || filterType === 'anime';
      const wantMovie = filterType === 'all' || filterType === 'movie';
      const wantTv = filterType === 'all' || filterType === 'tv';

      const [aniRes, multiP1, movieP1, movieP2, tvP1, tvP2] = await Promise.allSettled([
        wantAnime && uiPage <= 10 ? anilist(
          `query($q:String,$p:Int){Page(page:$p,perPage:24){pageInfo{hasNextPage total}media(search:$q,type:ANIME,isAdult:false,status_in:[FINISHED,RELEASING],sort:[SEARCH_MATCH,POPULARITY_DESC]){${fields} relations{edges{relationType node{idMal type format}}}}}}`,
          { q: term, p: uiPage },
          2800
        ) : Promise.resolve(null),
        (wantMovie || wantTv) && uiPage === 1 ? tmdb('search/multi', { query: term, include_adult: 'false', page: '1' }, 3400) : Promise.resolve(null),
        wantMovie && tmdbStartPage <= 500 ? tmdb('search/movie', { query: term, include_adult: 'false', page: String(tmdbStartPage) }, 3400) : Promise.resolve(null),
        wantMovie && tmdbStartPage + 1 <= 500 ? tmdb('search/movie', { query: term, include_adult: 'false', page: String(tmdbStartPage + 1) }, 3400) : Promise.resolve(null),
        wantTv && tmdbStartPage <= 500 ? tmdb('search/tv', { query: term, include_adult: 'false', page: String(tmdbStartPage) }, 3400) : Promise.resolve(null),
        wantTv && tmdbStartPage + 1 <= 500 ? tmdb('search/tv', { query: term, include_adult: 'false', page: String(tmdbStartPage + 1) }, 3400) : Promise.resolve(null)
      ]);

      // Map AniList search hits to released MegaPlay-available anime (probing MegaPlay live for unindexed titles!)
      const extraAniMap = new Map();
      if (aniRes.status === 'fulfilled' && aniRes.value) {
        const aniMediaList = (aniRes.value?.Page?.media || []).filter(m => m?.idMal && releasedAnime(m));
        const unindexed = uiPage === 1 ? aniMediaList.filter(m => !megaForMedia(m)).slice(0, 6) : [];
        if (unindexed.length) {
          await Promise.allSettled(unindexed.map(m => ensureDynamicMegaEntry(m.idMal, m)));
        }
        for (const m of aniMediaList) {
          if (!megaForMedia(m)) continue;
          const extraCands = [
            m.title?.english,
            m.title?.romaji,
            m.title?.native,
            ...(Array.isArray(m.synonyms) ? m.synonyms : [])
          ].map(normalizeTitle).filter(Boolean);
          extraAniMap.set(String(m.idMal), {
            popularity: Number(m.popularity) || 0,
            extraCands,
            mediaItem: ani(m)
          });
        }
      }

      const allLocalAnime = wantAnime ? searchLocalMegaPlay(term, extraAniMap) : [];
      const animePageSlice = wantAnime ? allLocalAnime.slice((uiPage - 1) * 36, uiPage * 36) : [];

      // Merge & score ALL released TMDB movies & web series (minVotes=0, requirePoster=false so zero released titles are hidden!)
      const rawOttMap = new Map();
      let movieTotalResults = 0, tvTotalResults = 0, movieTotalPages = 0, tvTotalPages = 0;
      for (const [srcRes, forcedType] of [
        [multiP1, null],
        [movieP1, 'movie'],
        [movieP2, 'movie'],
        [tvP1, 'tv'],
        [tvP2, 'tv']
      ]) {
        if (srcRes.status !== 'fulfilled' || !srcRes.value) continue;
        if (forcedType === 'movie') {
          movieTotalResults = Math.max(movieTotalResults, Number(srcRes.value.total_results) || 0);
          movieTotalPages = Math.max(movieTotalPages, Number(srcRes.value.total_pages) || 0);
        } else if (forcedType === 'tv') {
          tvTotalResults = Math.max(tvTotalResults, Number(srcRes.value.total_results) || 0);
          tvTotalPages = Math.max(tvTotalPages, Number(srcRes.value.total_pages) || 0);
        }
        for (const raw of srcRes.value?.results || []) {
          const mediaType = forcedType || raw.media_type;
          if (!['movie', 'tv'].includes(mediaType)) continue;
          if (mediaType === 'movie' && !wantMovie) continue;
          if (mediaType === 'tv' && !wantTv) continue;
          const enriched = { ...raw, media_type: mediaType };
          if (!releasedOtt(enriched, 0, false)) continue;
          const k = `${mediaType}:${raw.id}`;
          if (!rawOttMap.has(k)) rawOttMap.set(k, enriched);
        }
      }

      const scoredOttMap = new Map();
      for (const raw of rawOttMap.values()) {
        const scored = scoreOttSearchItem(raw, qNorm, qCompact, qWords, true);
        if (scored) scoredOttMap.set(`${scored.item.type}:${scored.item.id}`, scored);
      }

      if (uiPage === 1 && (wantMovie || wantTv)) {
        // Scan the in-memory Popular Blockbusters Index (2,630 top Movies & TV Series) so short/prefix/compound queries
        // like "end" -> "Avengers: Endgame" or "bat" -> "The Batman" ALWAYS surface the world's most popular hits first!
        for (const rec of indexedPopularOtt) {
          if (rec.item.type === 'movie' && !wantMovie) continue;
          if (rec.item.type === 'tv' && !wantTv) continue;
          const mScore = scoreCandidateMatch(qNorm, qCompact, qWords, rec.primaryNorm, rec.primaryCompact, rec.candidates, rec.compacts, rec.words, rec.subtitles, rec.subCompacts);
          if (mScore <= 0) continue;
          const total = finalizeSearchScore(mScore, rec.item, qNorm, rec.popMeter);
          const prev = scoredOttMap.get(rec.key);
          if (!prev || total > prev.score) {
            scoredOttMap.set(rec.key, { item: prev?.item || rec.item, score: total, popMeter: rec.popMeter });
          }
        }

        // Also fuzzy-match curated OTT Spotlight titles
        for (const sp of spotlightCatalog) {
          const k = `${sp.type}:${sp.id}`;
          if (sp.type === 'anime' || scoredOttMap.has(k)) continue;
          if (sp.type === 'movie' && !wantMovie) continue;
          if (sp.type === 'tv' && !wantTv) continue;
          const pNorm = normalizeTitle(sp.title);
          const pComp = pNorm.replace(/\s+/g, '');
          const subs = extractSubtitleParts(sp.title).filter(s => s !== pNorm);
          const subComps = subs.map(s => s.replace(/\s+/g, ''));
          const pWords = [...new Set([pNorm, ...subs].flatMap(s => s.split(' ')).filter(Boolean))];
          const mScore = scoreCandidateMatch(qNorm, qCompact, qWords, pNorm, pComp, [pNorm], [pComp], pWords, subs, subComps);
          if (mScore > 0) {
            scoredOttMap.set(k, { item: sp, score: finalizeSearchScore(mScore, sp, qNorm, 780), popMeter: 780 });
          }
        }

        // If TMDB missed due to a space-split compound word (e.g. "end game" vs "endgame") or mid-word typo, run a fallback query
        if (scoredOttMap.size < 3 && ((qWords.length >= 2 && qCompact.length >= 5) || (qWords.length === 1 && qWords[0].length >= 6))) {
          const altQuery = qWords.length >= 2 ? qCompact : qWords[0].slice(0, 5);
          const stemRes = await tmdb('search/multi', { query: altQuery, include_adult: 'false', page: '1' }, 2200).catch(() => null);
          for (const raw of stemRes?.results || []) {
            if (!['movie', 'tv'].includes(raw.media_type)) continue;
            if (raw.media_type === 'movie' && !wantMovie) continue;
            if (raw.media_type === 'tv' && !wantTv) continue;
            if (!releasedOtt(raw, 0, false)) continue;
            const k = `${raw.media_type}:${raw.id}`;
            if (scoredOttMap.has(k)) continue;
            const scored = scoreOttSearchItem(raw, qNorm, qCompact, qWords, false);
            if (scored) scoredOttMap.set(k, scored);
          }
        }
      }

      const scoredOtt = [...scoredOttMap.values()];
      const combinedRanked = [...animePageSlice, ...scoredOtt]
        .sort((a, b) => b.score - a.score)
        .map(x => x.item);

      const queryMentionsSeason = /\b(?:season|part|cour|s\d+)\b/i.test(term);
      const deduped = dedupeCatalog(combinedRanked, queryMentionsSeason);
      const hasMoreMovie = wantMovie && tmdbStartPage + 1 < Math.min(500, movieTotalPages);
      const hasMoreTv = wantTv && tmdbStartPage + 1 < Math.min(500, tvTotalPages);
      const hasMoreAnime = wantAnime && uiPage * 36 < allLocalAnime.length;
      const totalResults = (wantMovie ? movieTotalResults : 0) + (wantTv ? tvTotalResults : 0) + (wantAnime ? allLocalAnime.length : 0);

      await upgradeLowResPosters(deduped);
      return json(res, {
        items: deduped,
        page: uiPage,
        hasMore: Boolean(hasMoreMovie || hasMoreTv || hasMoreAnime),
        totalResults: Math.max(totalResults, deduped.length)
      }, 200, req);
    }

    if (p === '/api/genre') {
      const g=q.get('name');
      if (!catalogGenres.includes(g)) return json(res,{error:'Unknown genre'},400,req);
      const type=['all','movie','tv','anime'].includes(q.get('type'))?q.get('type'):'all';
      const sort=['popularity','trending','rating','newest','title'].includes(q.get('sort'))?q.get('sort'):'popularity';
      const uiPage=Math.max(1,Math.min(GENRE_MAX_UI_PAGES,Math.floor(Number(q.get('page'))||1)));
      const key=JSON.stringify([g,type,sort,uiPage]);
      const result=await genrePages.get(key,()=>buildGenrePage(g,type,sort,uiPage));
      // Poster upgrades are a cosmetic, cached-after-first-use refinement. Awaiting
      // them here held the genre response open long enough for concurrent requests
      // to miss the shared page cache and stampede the upstream catalogs, so the
      // cached payload is served immediately and sharpened on the next load.
      const items=result.items.map(x=>({...x, poster: posterUpgradeCache.get(x.anilistId ? `i:${x.anilistId}` : `t:${String(x.title||'').toLowerCase()}|${x.year||''}`) || x.poster}));
      upgradeLowResPosters(result.items).catch(() => {});
      return json(res,q.get('home')==='1'?{items:items.slice(0,24)}:{...result,items},200,req);
    }

    if (p === '/api/collection') {
      const name = String(q.get('name') || '');
      const uiPage = Math.max(1, Math.min(100, Number(q.get('page')) || 1));
      if (name === 'New in 2026') {
        const [movies, shows] = await Promise.all([
          discoverTmdbBatch('movie', { year:'2026', uiPage, pagesPerBatch:1, requirePoster:false }).catch(() => ({items:[],hasMore:false,totalResults:0})),
          discoverTmdbBatch('tv', { year:'2026', uiPage, pagesPerBatch:1, requirePoster:false }).catch(() => ({items:[],hasMore:false,totalResults:0}))
        ]);
        const anime = dedupeCatalog(sortAnikoto(anikotoItems.filter(x => String(x.year) === '2026'), 'popularity'), true);
        const a = anime.slice((uiPage-1)*12, uiPage*12), mixed=[];
        for (let i=0; i<Math.max(a.length,movies.items.length,shows.items.length); i++) {
          if (movies.items[i]) mixed.push(movies.items[i]);
          if (shows.items[i]) mixed.push(shows.items[i]);
          if (a[i]) mixed.push(a[i]);
        }
        const rows=dedupeCatalog(mixed,true);
        return json(res,{items:q.get('home')==='1'?rows.slice(0,24):rows, page:uiPage,
          hasMore:Boolean(movies.hasMore||shows.hasMore||uiPage*12<anime.length), totalResults:Math.max(rows.length, movies.totalResults+shows.totalResults+anime.length)},200,req);
      }
      const curated = {
        'Hindi Dubbed': [['anime','966'],['anime','8687'],['anime','11595'],['anime','40748'],['movie','912649'],['tv','66732'],['tv','93405'],['movie','762509']],
        'Tamil Dubbed': [['anime','11595'],['anime','40748'],['movie','912649'],['tv','66732'],['tv','93405'],['movie','762509']],
        'Telugu Dubbed': [['anime','11595'],['anime','40748'],['movie','912649'],['tv','66732'],['tv','93405'],['movie','762509']]
      };
      if (!curated[name]) return json(res,{error:'Unknown collection'},400,req);
      if (uiPage > 1) return json(res,{items:[],page:uiPage,hasMore:false,totalResults:curated[name].length},200,req);
      const rows = await Promise.all(curated[name].map(async ([type,id]) => {
        if (type === 'anime') { const entry = megaByMal.get(id); return entry ? anikotoItem(entry) : null; }
        const indexed = indexedPopularOtt.find(r => r.item.type === type && String(r.item.id) === id)?.item;
        if (indexed) return indexed;
        return tmdb(type+'/'+id).then(d => releasedOtt({...d,media_type:type},0,false) ? ott({...d,media_type:type}) : null).catch(() => null);
      }));
      const items = dedupeCatalog(rows.filter(Boolean));
      return json(res,{items,page:1,hasMore:false,totalResults:items.length},200,req);
    }

    if (p === '/api/random') {
      let [o] = await Promise.allSettled([tmdb('trending/all/week')]);
      let ottItems = o.status === 'fulfilled' ? o.value.results.filter(x => ['movie', 'tv'].includes(x.media_type) && releasedOtt(x, 0, true)).map(ott) : [];
      let topAnime = sortAnikoto(anikotoItems, 'popularity').slice(0, 250);
      let all = dedupeCatalog([...spotlightCatalog, ...topAnime, ...anikotoItems.slice(0, 150), ...ottItems]);
      if (!all.length) throw Error('Catalogs are unavailable');
      return json(res, { item: all[crypto.randomInt(all.length)] }, 200, req);
    }

    if (p === '/api/schedule') {
      // One schedule for everything: anime episodes from AniList plus TV episodes
      // from TMDB's on-the-air feed, merged onto the same day timeline so the page
      // is "Schedule", not "Anime schedule".
      let now = Math.floor(Date.now() / 1000), start = now - 24 * 3600, week = now + 8 * 86400;
      let pageBlock = n => `p${n}:Page(page:${n},perPage:50){airingSchedules(airingAt_greater:$start,airingAt_lesser:$week,sort:TIME){id airingAt episode media{${fields}}}}`;
      let d = await anilist(
        `query($start:Int,$week:Int){${[1, 2, 3, 4, 5, 6].map(pageBlock).join(' ')}}`,
        { start, week },
        14000
      ).catch(() => null);
      let rawSchedules = [1, 2, 3, 4, 5, 6].flatMap(n => d?.[`p${n}`]?.airingSchedules || []);
      let seenSlot = new Set();
      let entries = [];
      for (let x of rawSchedules) {
        if (!x?.media?.idMal || x.media.isAdult || !megaForMedia(x.media)) continue;
        let slotKey = `${x.media.idMal}:${x.episode}`;
        if (seenSlot.has(slotKey)) continue;
        seenSlot.add(slotKey);
        let item = ani(x.media);
        let provider = megaByMal.get(String(x.media.idMal));
        if (provider) item.title = cleanAnimeDisplayTitle(provider) || item.title;
        entries.push({ id: x.id, airingAt: x.airingAt, episode: x.episode, season: null, kind: 'anime', item });
      }
      // TV shows: TMDB's on-the-air feed lists the shows but omits episode data,
      // so each candidate's detail record supplies next_episode_to_air. The detail
      // calls are cached by remote() and concurrency-limited.
      try {
        const tvFeed = await Promise.all([1, 2, 3, 4, 5].map(page => tmdb('tv/on_the_air', { page }, 12000).catch(() => null)));
        const candidates = [];
        const seenShow = new Set();
        for (const page of tvFeed) {
          for (const show of page?.results || []) {
            if (!show?.id || show.adult || seenShow.has(show.id)) continue;
            if (/^(ja|ko|zh)$/i.test(String(show.original_language || ''))) continue; // anime comes from AniList above
            seenShow.add(show.id);
            candidates.push(show);
            if (candidates.length >= 40) break;
          }
          if (candidates.length >= 40) break;
        }
        const details = [];
        for (let i = 0; i < candidates.length; i += 10) {
          const batch = candidates.slice(i, i + 10);
          const settled = await Promise.all(batch.map(show => tmdb(`tv/${show.id}`, {}, 10000).catch(() => null)));
          for (const detail of settled) if (detail) details.push(detail);
        }
        for (const show of details) {
          const air = show?.next_episode_to_air;
          if (!air?.air_date) continue;
          const at = Math.floor(new Date(`${air.air_date}T${air.air_time || '20:00'}:00Z`).getTime() / 1000);
          if (!(at >= start && at <= week)) continue;
          entries.push({
            id: `tv-${show.id}`,
            airingAt: at,
            episode: Number(air.episode_number) || 1,
            season: Number(air.season_number) || 1,
            kind: 'tv',
            item: {
              id: String(show.id),
              type: 'tv',
              title: show.name,
              poster: show.poster_path ? 'https://image.tmdb.org/t/p/w500' + show.poster_path : '',
              backdrop: show.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + show.backdrop_path : '',
              rating: show.vote_average ? Number(show.vote_average.toFixed(1)) : null,
              year: String(show.first_air_date || '').slice(0, 4),
              genres: [],
              originalLanguage: show.original_language || ''
            }
          });
        }
      } catch {}
      entries.sort((a, b) => a.airingAt - b.airingAt);
      return json(res, { entries }, 200, req);
    }

    if (p === '/api/upcoming') {
      // Upcoming anime: announced, not yet released, with artwork.
      let d = await anilist(
        `query{Page(page:1,perPage:50){media(type:ANIME,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,isAdult:false){${fields}}}}`,
        {},
        14000
      ).catch(() => null);
      let items = (d?.Page?.media || [])
        .filter(x => x?.idMal || x?.id)
        .map(x => {
          const item = ani(x);
          item.upcoming = true;
          item.playable = false;
          Object.assign(item, animeReleaseHints(x));
          item.format = x.format || item.format;
          return item;
        });
      return json(res, { items }, 200, req);
    }

    if (p === '/api/filter') {
      let type = ['anime', 'movie', 'tv', 'all'].includes(q.get('type')) ? q.get('type') : 'all';
      let genre = catalogGenres.includes(q.get('genre')) ? q.get('genre') : '';
      let rawYear = String(q.get('year') || '').trim();
      let validEras = new Set(['2020s', '2010s', '2000s', '1990s', '1980s', 'classic']);
      let year = '';
      if (/^\d{4}$/.test(rawYear)) {
        if (Number(rawYear) > new Date().getFullYear()) return json(res, { items: [], page: 1, hasMore: false, totalResults: 0 }, 200, req);
        year = rawYear;
      } else if (validEras.has(rawYear)) {
        year = rawYear;
      }
      let lang = validLangCodes.has(q.get('lang') || '') ? q.get('lang') : '';
      let sort = ['popularity', 'trending', 'rating', 'newest', 'title'].includes(q.get('sort')) ? q.get('sort') : 'popularity';
      let status = ['releasing', 'finished'].includes(q.get('status')) ? q.get('status') : '';
      let dubOnly = q.get('dub') === '1' || q.get('dub') === 'true';
      let uiPage = Math.max(1, Math.min(4000, Math.floor(Number(q.get('page')) || 1)));

      const wantAnime = (type === 'all' || type === 'anime') && (!lang || lang === 'ja');
      const wantMovie = type === 'all' || type === 'movie';
      const wantTv = type === 'all' || type === 'tv';

      const [mBatch, tBatch, totals] = await Promise.all([
        wantMovie ? discoverTmdbBatch('movie', { genre, year, lang, sort, uiPage, pagesPerBatch: type === 'movie' ? 2 : 1, requirePoster: false }) : Promise.resolve({ items: [], totalResults: 0, hasMore: false }),
        wantTv ? discoverTmdbBatch('tv', { genre, year, lang, sort, uiPage, pagesPerBatch: type === 'tv' ? 2 : 1, requirePoster: false }) : Promise.resolve({ items: [], totalResults: 0, hasMore: false }),
        getCatalogTotals()
      ]);

      let animePool = [];
      if (wantAnime) {
        animePool = dedupeCatalog(sortAnikoto(
          anikotoItems.filter(x =>
            (!genre || x.genres.includes(genre)) &&
            filterAnimeByYearEra(x.year, year) &&
            (!status || x.status === status.toUpperCase()) &&
            (!dubOnly || Boolean(x.dub))
          ),
          sort
        ));
      }
      const animePerPage = type === 'anime' ? 36 : 16;
      const animeSlice = wantAnime ? animePool.slice((uiPage - 1) * animePerPage, uiPage * animePerPage) : [];
      const hasMoreAnime = wantAnime && uiPage * animePerPage < animePool.length;

      let combined = [];
      if (type === 'movie') combined = mBatch.items;
      else if (type === 'tv') combined = tBatch.items;
      else if (type === 'anime') combined = animeSlice;
      else {
        const maxLen = Math.max(mBatch.items.length, tBatch.items.length, animeSlice.length);
        for (let i = 0; i < maxLen; i++) {
          if (mBatch.items[i]) combined.push(mBatch.items[i]);
          if (tBatch.items[i]) combined.push(tBatch.items[i]);
          if (animeSlice[i]) combined.push(animeSlice[i]);
        }
      }

      if (!combined.length && uiPage === 1 && !genre && !year && !lang && !status && !dubOnly) {
        throw Error('Catalogs are unavailable');
      }

      const deduped = dedupeCatalog(combined);
      const totalResults = (wantMovie ? mBatch.totalResults : 0) + (wantTv ? tBatch.totalResults : 0) + (wantAnime ? animePool.length : 0);

      return json(res, {
        items: deduped,
        page: uiPage,
        hasMore: Boolean(mBatch.hasMore || tBatch.hasMore || hasMoreAnime),
        totalResults: Math.max(totalResults, deduped.length),
        totals,
        genres: catalogGenres,
        languages: catalogLanguages
      }, 200, req);
    }

    if (p === '/api/detail') {
      let id = num(q.get('id')), type = q.get('type');
      if (!id || !['anime', 'tv', 'movie'].includes(type)) return json(res, { error: 'Invalid title' }, 400);

      if (type === 'anime') {
        if (MEGA_REDIRECT_MAL_MAP.has(id)) id = MEGA_REDIRECT_MAL_MAP.get(id);
        // Whether the provider carries this title and what AniList says about it
        // are looked up at the same time. The second answer is only needed if the
        // first comes back empty, but waiting for them one after another is what
        // made an announced series take seconds to open.
        const announced = megaByMal.has(id) ? null : upcomingAnimeDetail(id);
        let provider = megaByMal.get(id) || await ensureDynamicMegaEntry(id);
        if (!provider) {
          // Not carried by the provider. If the title is real (AniList knows it),
          // open its details page marked Upcoming rather than failing the route.
          const payload = await announced;
          if (payload) return json(res, payload, 200, req);
          return json(res, { error: 'This anime is not available on MegaPlay.' }, 404, req);
        }
        const ovr = animeEpisodeOverrides[id] || null;
        let [providerData, media] = await Promise.all([
          ovr ? Promise.resolve(null) : anikotoSeries(provider.id).catch(() => null),
          animeRecord(id, true).catch(() => null)
        ]);
        let item = anikotoItem(provider);
        let count = providerData?.episodes?.length || 0;
        if (ovr) {
          const regTotal = id === '966' ? SHINCHAN_REGIONAL_TOTAL : (id === '8687' ? DORAEMON_REGIONAL_TOTAL : 0);
          item.playable = true;
          item.sub = ovr.subCount > 0;
          item.dub = ovr.dubCount > 0;
          item.subCount = ovr.subCount;
          item.dubCount = ovr.dubCount;
          item.differentDubOrder = Boolean(ovr.differentDubOrder);
          if (regTotal > 0) {
            item.regionalCount = regTotal;
            item.regionalDefault = 'hi';
            item.episodes = regTotal;
            if (id === '8687') item.regionalSeasons = DORAEMON_REGIONAL_LIST;
          } else {
            item.episodes = ovr.subCount > 0 ? ovr.subCount : ovr.dubCount;
          }
        } else if (count > 0) {
          if (!item.isMovie) {
            const nums = providerData.episodes.map(row => Number(row.number)).filter(n => Number.isInteger(n) && n > 0).sort((a,b) => a-b);
            item.episodes = nums.at(-1) || count;
            if (nums.length && (nums.length !== item.episodes || nums.some((n,i) => n !== i+1))) item.availableEpisodeNumbers = nums;
          }
          item.playable = true;
          item.sub = providerData.episodes.some(x => x.embed_url?.sub) || provider.sub !== false;
          item.dub = providerData.episodes.some(x => x.embed_url?.dub) || Boolean(provider.dub);
        } else {
          let [subDirect, dubDirect] = await Promise.all([
            resolveMegaPlayDirect({ malId: id, aniId: provider.ani || media?.id, episode: 1, lang: 'sub' }).then(() => true).catch(() => false),
            resolveMegaPlayDirect({ malId: id, aniId: provider.ani || media?.id, episode: 1, lang: 'dub' }).then(() => true).catch(() => false)
          ]);
          if (!subDirect && !dubDirect) {
            const announced = await upcomingAnimeDetail(id);
            if (announced) return json(res, announced, 200, req);
            return json(res, { error: 'This anime has no released episodes available yet.' }, 404, req);
          }
          item.playable = true;
          item.sub = subDirect;
          item.dub = dubDirect || Boolean(provider.dub);
        }
        if (media) {
          let fallback = ani(media);
          item.poster = item.poster || fallback.poster;
          item.backdrop = item.backdrop || fallback.backdrop;
          item.description = item.description || fallback.description;
          item.originalLanguage = fallback.originalLanguage || '';
          if (!item.genres.length) item.genres = fallback.genres;
        }
        item.upcoming = false;
        // Jikan's trailer frame is a low-resolution video still, and pasting it
        // over a banner the curator picked is how the One Piece hero ended up
        // worse than it started. It is now only a last resort, for a title whose
        // artwork is missing entirely - and it never rewrites an existing banner.
        if (!item.backdrop && !item.poster) {
          const jikanHit = jikanBannerNow(id) || await jikanBannerUrl(id).catch(() => '');
          if (jikanHit) item.backdrop = jikanHit;
        }
        // Beyblade X is sometimes absent from the bundled provider index even
        // though MegaPlay serves it. Probe once per process before assembling
        // the franchise selector; unavailable results use the existing miss TTL.
        if (BEYBLADE_IDS.includes(id) && !megaByMal.has('56566')) await ensureDynamicMegaEntry('56566').catch(() => null);
        let seasons = POKEMON_IDS.has(id)
          ? [...new Map(POKEMON_REGIONS.map(r => [r.id, { id:r.id, name:r.name, episodes:r.endEp, format:'TV' }])).values()]
          : await animeSeasonFamily(media, id);
        return json(res, {
          item,
          episodes: [],
          seasons,
          ...(POKEMON_IDS.has(id) ? { pokemonRegions: POKEMON_REGIONS } : {}),
          ...(id === '8687' ? { regionalSeasons: DORAEMON_REGIONAL_LIST } : {})
        }, 200, req);
      }

      let d = await tmdb(type + '/' + id);
      if (!releasedOtt({ ...d, media_type: type }, 0, false)) {
        return json(res, { error: 'This title is unreleased or unavailable for streaming.' }, 404, req);
      }
      let item = ott({ ...d, media_type: type });
      item.upcoming = false;
      item.playable = true;
      let seasons = type === 'tv'
        ? (d.seasons || [])
            .filter(x => x.season_number >= 1 && Number(x.episode_count) > 0 && (!x.air_date || String(x.air_date).slice(0, 10) <= today()))
            .map(x => ({ number: x.season_number, name: x.name, episodes: x.episode_count }))
        : [];
      return json(res, { item, seasons }, 200, req);
    }

    if (p === '/api/anime-episodes') {
      let id = num(q.get('id')), page = Math.max(1, Math.min(10000, Math.floor(Number(q.get('page')) || 1))), limit = 20;
      let rawReqLang = String(q.get('lang') || '').toLowerCase();
      let reqLang = ANIME_VALID_LANG_SET.has(rawReqLang) ? rawReqLang : 'sub';
      if (!id) return json(res, { error: 'Invalid anime' }, 400);
      if (MEGA_REDIRECT_MAL_MAP.has(id)) id = MEGA_REDIRECT_MAL_MAP.get(id);
      let provider = megaByMal.get(id) || await ensureDynamicMegaEntry(id);
      if (!provider) return json(res, { error: 'Episodes are not available for this title.' }, 404);

      const ovr = animeEpisodeOverrides[id] || null;
      if (ovr) {
        const isRegionalMode = (id === '966' || id === '8687') && ANIME_REGIONAL_LANG_SET.has(reqLang);
        if (isRegionalMode && id === '966') {
          const total = SHINCHAN_REGIONAL_TOTAL;
          const offset = (page - 1) * limit;
          const episodes = [];
          for (let n = offset + 1; n <= Math.min(total, offset + limit); n++) {
            const stillName = `shinchan-${String(n).padStart(3,'0')}.jpg`;
            episodes.push({
              number: n,
              title: shinRegionalTitles[String(SHINCHAN_VERIFIED_TITLES[n] || '')] || `Episode ${n}`,
              description: '',
              still: shinRegionalStills.has(stillName) ? `/images/episode-stills/${stillName}` : (provider.backdrop || provider.poster || null),
              embedId: '',
              sub: false,
              dub: n <= 78
            });
          }
          return json(res, { episodes, page, perPage: limit, total, hasNext: offset + limit < total, sources: [] }, 200, req);
        }

        if (isRegionalMode && id === '8687') {
          const total = DORAEMON_REGIONAL_TOTAL;
          const offset = (page - 1) * limit;
          const nums = [];
          for (let n = offset + 1; n <= Math.min(total, offset + limit); n++) nums.push(n);
          // Indian broadcast Doraemon Seasons 1..20 are 22-minute multi-segment TV episodes (52 eps/season),
          // whereas TMDB tv/57911 Season 1 lists 236 8-minute 1979 Japanese shorts — use accurate Indian broadcast Season/Episode titles!
          const fallbackImg = provider.backdrop || provider.poster || null;
          const episodes = nums.map(n => {
            const mapped = mapDoraemonRegionalEp(n);
            const verified = mapped.season === 1 ? doraRegionalTitles[String(mapped.episode)] : null;
            return {
              number: n,
              title: verified?.title || `Season ${mapped.season} · Episode ${mapped.episode}`,
              description: `Doraemon Indian TV Broadcast · Season ${mapped.season}, Episode ${mapped.episode}.`,
              still: verified?.still || fallbackImg,
              embedId: '',
              sub: n <= 156,
              dub: n <= 52
            };
          });
          return json(res, { episodes, page, perPage: limit, total, hasNext: offset + limit < total, sources: [] }, 200, req);
        }

        const effectiveLang = (ovr.subCount === 0 && ovr.dubCount > 0)
          ? 'dub'
          : (reqLang === 'dub' && ovr.dubCount > 0 ? 'dub' : 'sub');
        const total = effectiveLang === 'dub' ? ovr.dubCount : ovr.subCount;
        const offset = (page - 1) * limit;
        const nums = [];
        for (let n = offset + 1; n <= Math.min(total, offset + limit); n++) nums.push(n);
        const anizipMap = await anizipEpisodeMeta(id);
        const episodes = nums.map(n => {
          if (effectiveLang === 'dub' && ovr.dub?.[String(n)]) {
            const dRow = ovr.dub[String(n)];
            const jpMeta = dRow.jpEp ? anizipMap?.get(Number(dRow.jpEp)) : null;
            return {
              number: n,
              title: dRow.title || `Episode ${n}`,
              description: dRow.description || jpMeta?.description || '',
              still: jpMeta?.still || provider.backdrop || provider.poster || null,
              embedId: '',
              sub: ovr.subCount >= n,
              dub: ovr.dubCount >= n
            };
          }
          const sRow = ovr.sub?.[String(n)] || null;
          const azIdx = n + (Number(ovr.subAnizipOffset) || 0);
          const az = azIdx > 0 ? anizipMap?.get(azIdx) : null;
          return {
            number: n,
            title: (sRow?.title || az?.title || `Episode ${n}`).replace(/`/g, "'").trim(),
            description: (sRow?.description || az?.description || '').trim(),
            still: az?.still || provider.backdrop || provider.poster || null,
            embedId: '',
            sub: ovr.subCount >= n,
            dub: ovr.dubCount >= n
          };
        });
        return json(res, { episodes, page, perPage: limit, total, hasNext: offset + limit < total, sources: ['megaplay'] }, 200, req);
      }

      let base = [];
      let data = await anikotoSeries(provider.id).catch(() => null);
      base = (data?.episodes || []).filter(x => Number.isInteger(Number(x.number)) && Number(x.number) > 0).sort((a, b) => Number(a.number) - Number(b.number));
      if (!base.length) {
        let media = await animeRecord(id, false).catch(() => null);
        let fallbackTotal = positiveInt(provider.episodes) || animeEpisodeCount(media) || 0;
        if (fallbackTotal > 0) {
          base = Array.from({ length: fallbackTotal }, (_, i) => ({
            number: i + 1,
            title: `Episode ${i + 1}`,
            episode_embed_id: '',
            embed_url: {
              sub: provider.sub === false ? null : `https://megaplay.buzz/stream/mal/${id}/${i + 1}/sub`,
              dub: provider.dub ? `https://megaplay.buzz/stream/mal/${id}/${i + 1}/dub` : null
            }
          }));
        } else {
          return json(res, { error: 'Episodes are not available for this title.' }, 404);
        }
      }
      let offset = (page - 1) * limit, pageRows = id === '34034' ? base.filter(x => Number(x.number) > offset && Number(x.number) <= offset + limit) : base.slice(offset, offset + limit);
      let [jikanMap, anizipMap] = await Promise.all([jikanAnimeEpisodeMeta(id, pageRows.map(x => Number(x.number))), anizipEpisodeMeta(id)]);
      let pokemonMetaMaps = new Map();
      if (POKEMON_IDS.has(id)) {
        const ids = [...new Set(pageRows.map(row => pokemonEpisodeMetaId(id, Number(row.number))[0]))];
        const maps = await Promise.all(ids.map(k => k === id ? Promise.resolve(anizipMap) : anizipEpisodeMeta(k)));
        ids.forEach((k,i) => pokemonMetaMaps.set(k,maps[i]));
      }
      const permanSeason = id === '11595' ? await tmdb('tv/132791/season/1').catch(() => null) : null;
      const permanStills = new Map((permanSeason?.episodes || []).filter(e => e.still_path).map(e => [Number(e.episode_number), `https://image.tmdb.org/t/p/w500${e.still_path}`]));
      // Backfill split-cour merged seasons (e.g. Attack on Titan S3 MAL 35760 Ep 13..22) from TMDB season metadata when ani.zip stops at Part 1
      let tmdbBackfillMap = null;
      if (pageRows.some(x => !jikanMap?.get(Number(x.number)) && !anizipMap?.get(Number(x.number)))) {
        // Split-cour backfill is a two-hop lookup (MAL -> TMDB -> season) that
        // only adds nicer titles and stills. It runs against a short deadline so
        // a slow second hop cannot decide when the episode list appears.
        const backfillWork = (async () => {
          const { tmdbMapping: epMapInfo } = await resolveAnimeTmdbMapping(id, provider, pageRows[0]?.number || 1).catch(() => ({ tmdbMapping: null }));
          if (!(epMapInfo?.type === 'tv' && epMapInfo.tmdbId && epMapInfo.season > 0)) return null;
          return await tmdb(`tv/${epMapInfo.tmdbId}/season/${epMapInfo.season}`).catch(() => null).then(tSeason => ({ tSeason, epMapInfo }));
        })();
        const backfillHit = await Promise.race([
          backfillWork,
          new Promise(r => setTimeout(() => r(null), 700))
        ]).catch(() => null);
        backfillWork.catch(() => {});
        if (backfillHit) {
          const { tSeason, epMapInfo } = backfillHit;
          if (Array.isArray(tSeason?.episodes) && tSeason.episodes.length) {
            const firstPageNum = Number(pageRows[0]?.number) || 1;
            const epOffset = (Number(epMapInfo.episode) || firstPageNum) - firstPageNum;
            tmdbBackfillMap = new Map();
            for (const te of tSeason.episodes) {
              const localNum = Number(te.episode_number) - epOffset;
              if (localNum > 0) {
                tmdbBackfillMap.set(localNum, {
                  title: te.name || '',
                  still: te.still_path ? `https://image.tmdb.org/t/p/w300${te.still_path}` : null,
                  description: te.overview || ''
                });
              }
            }
          }
        }
      }
      let sources = ['megaplay'];
      if (jikanMap?.size) sources.unshift('jikan');
      if (anizipMap?.size && !sources.includes('jikan')) sources.unshift('jikan-mal');
      let episodes = pageRows.map(x => {
        let n = Number(x.number), jk = jikanMap?.get(n), az = anizipMap?.get(n), tb = tmdbBackfillMap?.get(n), fallbackTitle = decodeEntities(x.title);
        let cleanFallback = fallbackTitle && !/^episode\s*\d+$/i.test(fallbackTitle.trim()) ? fallbackTitle : '';
        if (POKEMON_IDS.has(id)) {
          const [mappedId, mappedNum] = pokemonEpisodeMetaId(id, n);
          az = pokemonMetaMaps.get(mappedId)?.get(mappedNum) || null;
          jk = null; tb = null;
          if ((id === '19291' || id === '31592') && cleanFallback) {
            // XY's provider skips/reorders some specials. Match actual provider
            // titles to the English metadata before using its image or title.
            const providerName = normalizeTitle(cleanFallback);
            const exact = [...(anizipMap?.values() || [])].find(row => {
              const candidate = normalizeTitle(row?.title);
              return candidate.length >= 8 && (providerName === candidate || providerName.startsWith(candidate + ' '));
            });
            az = exact || null;
          }
        }
        let title = (id === '11595' ? (permanTitles[String(n)] || `Episode ${n}`) : (jk?.title || az?.title || tb?.title || cleanFallback || `Episode ${n}`)).replace(/`/g, "'").trim();
        let description = id === '11595' ? '' : (jk?.description || az?.description || tb?.description || '').trim();
        let still = id === '11595' ? (permanStills.get(n) || provider.backdrop || provider.poster || null) : (jk?.still || az?.still || tb?.still || provider.backdrop || provider.poster || null);
        return { number: n, title, description, still, embedId: String(x.episode_embed_id || ''), sub: Boolean(x.embed_url?.sub ?? true), dub: Boolean(x.embed_url?.dub) };
      });
      return json(res, { episodes, page, perPage: limit, total: base.length, hasNext: id === '34034' ? base.some(x => Number(x.number) > offset + limit) : offset + limit < base.length, sources }, 200, req);
    }

    if (p === '/api/season') {
      let id = num(q.get('id')), season = q.get('season') === '0' ? '0' : num(q.get('season'));
      if (!id || season === null) return json(res, { error: 'Invalid season' }, 400);
      let [d, showInfo] = await Promise.all([
        tmdb(`tv/${id}/season/${season}`),
        tmdb(`tv/${id}`).catch(() => null)
      ]);
      let fallbackStill = showInfo?.backdrop_path
        ? 'https://image.tmdb.org/t/p/w500' + showInfo.backdrop_path
        : (showInfo?.poster_path ? 'https://image.tmdb.org/t/p/w500' + showInfo.poster_path : null);
      let rawEps = Array.isArray(d.episodes) ? d.episodes : [];
      let hasAnyDated = rawEps.some(e => Boolean(e.air_date));
      let airedEps = rawEps.filter(e => {
        if (!e.episode_number || e.episode_number <= 0) return false;
        if (e.air_date) return String(e.air_date).slice(0, 10) <= today();
        return !hasAnyDated;
      });
      return json(res, {
        episodes: airedEps.map(e => ({
          number: e.episode_number,
          title: e.name || `Episode ${e.episode_number}`,
          description: e.overview || '',
          still: e.still_path ? 'https://image.tmdb.org/t/p/w300' + e.still_path : fallbackStill
        }))
      }, 200, req);
    }

    if (p === '/api/anime-audio') {
      let id = num(q.get('id')), ep = num(q.get('episode') || '1'), aniId = num(q.get('anilistId'));
      if (!id || !ep) return json(res, { streams: [] }, 200, req);
      if (MEGA_REDIRECT_MAL_MAP.has(id)) id = MEGA_REDIRECT_MAL_MAP.get(id);

      if (id === '966' || id === '8687' || id === '11595' || (id === '527' && Number(ep) === 1)) {
        const specialInput = id === '527'
          ? { type:'tv', id:'60572', season:'1', episode:'1' }
          : id === '966'
          ? (() => {
              const mapped = mapShinchanRegionalEp(ep);
              // No Hindi master for this episode -> let the normal Japanese/English
              // path answer instead of replaying someone else's episode.
              return mapped == null ? null : { type: 'tv', id: '30623', season: '1', episode: String(mapped) };
            })()
          : id === '11595'
            ? { type: 'tv', id: '132791', season: '1', episode: String(ep) }
            : (() => {
                const m = mapDoraemonRegionalEp(ep);
                return { type: 'tv', id: '57911', season: String(m.season), episode: String(m.episode) };
              })();
        const rawSpecial = await resolveSpecialRegionalAnime(specialInput).catch(() => []);
        const streams = rawSpecial
          .filter(a => (id === '527' ? a.key === 'hi' : (ANIME_REGIONAL_LANG_SET.has(a.key) || (id === '11595' && ['sub','dub'].includes(a.key)))))
          .map(a => {
            try {
              const opts = a.audioLang ? { audioLang: a.audioLang } : {};
              return {
                key: a.key,
                language: a.language,
                label: a.label,
                type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
                codec: a.codec || 'h264',
                src: mediaUrl(a.url, a.proxyProvider || 'vidcore', a.headers || {}, opts)
              };
            } catch { return null; }
          }).filter(Boolean);
        // Cartoons: an episode with no Hindi master still has to play. The
        // Japanese/English cut lives on the regular OTT providers, so it is
        // offered as `sub`/`dub` instead of leaving the player empty - that is
        // the whole "Shinchan shows nothing" complaint.
        let jpStreams = [];
        if (CONTINUE_IN_JP_SHOWS.has(id) && !streams.some(r => r.key === 'hi')) {
          // The OTT providers index Shinchan by its own episode number, so the
          // raw episode is tried first and the Hindi run's numbering only as a
          // second guess. (Mapping first used to ask for an episode that does
          // not exist on those providers, so legit episodes looked missing.)
          const jpId = id === '966' ? '30623' : id === '8687' ? '65733' : '60572';
          let jp = null;
          for (const cand of [...new Set([String(ep), String(mapShinchanRegionalEp(ep) ?? ep)])]) {
            jp = await resolveOttWithFallback({ type: 'tv', id: jpId, season: '1', episode: cand }, 'vidcore', getTmdbMetaForResolver).catch(() => null);
            if (jp?.url) break;
          }
          if (jp?.url) {
            jpStreams = [{
              key: 'sub', language: 'ja', label: 'Japanese',
              type: jp.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
              codec: jp.codec || 'h264',
              src: mediaUrl(jp.url, 'vidcore', jp.headers || {}, {})
            }];
          }
        }
        return json(res, { streams: [...streams, ...jpStreams], discoveryStatus:regionalAudioStatus(), availableLangs: animeAvailableLangs({ sub: Boolean(jpStreams.length) || id === '527' || id === '11595' || (id === '8687' && Number(ep) <= 156), dub: id === '527' || (id === '11595' ? streams.some(r => r.key === 'dub') : Number(ep) <= (id === '966' ? 78 : 52)), regional: streams }) }, 200, req);
      }

      let available = megaForIds(id, aniId) || await ensureDynamicMegaEntry(id);
      if (!available) return json(res, { streams: [] }, 200, req);
      const [{ tmdbMapping }, megaRef] = await Promise.all([
        resolveAnimeTmdbMapping(id, available, ep),
        resolveMegaPlayDirect({ malId: id, aniId: aniId || available?.ani || null, episode: ep, lang: available.sub === false ? 'dub' : 'sub' }).catch(() => null)
      ]);
      if (!tmdbMapping) return json(res, { streams: [] }, 200, req);
      const tmdbInput = {
        type: tmdbMapping.type,
        id: String(tmdbMapping.tmdbId),
        season: String(tmdbMapping.season || 1),
        episode: String(tmdbMapping.episode || 1)
      };
      const [meta, megaDur] = await Promise.all([
        getTmdbMetaForResolver(tmdbInput).catch(() => ({ title: cleanAnimeDisplayTitle(available), originalLanguage: 'ja' })),
        megaRef?.url ? measureMegaHlsDurationSec(megaRef.url) : Promise.resolve(-1)
      ]);
      const rawStreams = await resolveAnimeRegionalAudio(tmdbInput, meta, megaDur > 300 ? megaDur : 0).catch(() => []);
      const streams = rawStreams.map(a => {
        try {
          const opts = a.audioLang ? { audioLang: a.audioLang } : {};
          return {
            key: a.key,
            language: a.language,
            label: a.label,
            type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
            codec: a.codec || 'h264',
            src: mediaUrl(a.url, a.proxyProvider || 'vidcore', a.headers || {}, opts)
          };
        } catch { return null; }
      }).filter(Boolean);
      return json(res, {
        streams,
        discoveryStatus:regionalAudioStatus(),
        // What the series carries for this episode, so the menu can list exactly
        // those languages and never promise one it cannot play.
        availableLangs: animeAvailableLangs({ sub: available.sub !== false, dub: Boolean(available.dub), regional: streams })
      }, 200, req);
    }

    if (p === '/api/play') {
      let id = num(q.get('id')), type = q.get('type'), ep = num(q.get('episode') || '1'), season = q.get('season') === '0' ? '0' : num(q.get('season') || '1');
      let rawLang = String(q.get('lang') || 'sub').toLowerCase();
      // 'hindi' / 'tamil' etc. name the same track as their short codes.
      const LANG_ALIASES = { hindi: 'hi', tamil: 'ta', telugu: 'te', malayalam: 'ml', kannada: 'kn', bengali: 'bn', marathi: 'mr', punjabi: 'pa', gujarati: 'gu', urdu: 'ur' };
      if (LANG_ALIASES[rawLang]) rawLang = LANG_ALIASES[rawLang];
      let lang = ANIME_VALID_LANG_SET.has(rawLang) ? rawLang : 'sub';
      const requestedLang = rawLang;
      let requestedProvider = q.get('provider');
      let provider = OTT_SERVER_KEYS.has(requestedProvider) ? requestedProvider : DEFAULT_OTT_SERVER;
      let aniId = num(q.get('anilistId'));
      if (!id || !ep || !season || !['anime', 'movie', 'tv'].includes(type)) return json(res, { error: 'Invalid playback request' }, 400);

      if (type === 'anime') {
        if (MEGA_REDIRECT_MAL_MAP.has(id)) id = MEGA_REDIRECT_MAL_MAP.get(id);
        let available = megaForIds(id, aniId) || await ensureDynamicMegaEntry(id), effectiveAni = aniId || available?.ani || null, fallbackEmbed = null, subFallbackEmbed = null;
        if (!available) return json(res, { error: 'This anime is not available right now.' }, 404, req);
        const ovr = animeEpisodeOverrides[id] || null;
        const isRegionalReq = ANIME_REGIONAL_LANG_SET.has(lang);

        // Reuse the exact Indian-broadcast mapping for both source and captions.
        const shinMapped = id === '966' && Number(ep) <= 181 ? mapShinchanRegionalEp(ep) : null;
        const specialInput = (id === '966' && shinMapped != null)
          ? { type: 'tv', id: '30623', season: '1', episode: String(shinMapped) }
          : (id === '8687' && Number(ep) <= 762)
            ? (() => { const m = mapDoraemonRegionalEp(ep); return { type: 'tv', id: '57911', season: String(m.season), episode: String(m.episode) }; })()
            : (id === '11595' && Number(ep) <= 526)
              ? { type:'tv', id:'132791', season:'1', episode:String(ep) }
              : (id === '527' && Number(ep) === 1)
                ? { type:'tv', id:'60572', season:'1', episode:'1' }
                : null;
        const specialRegionalPromise = specialInput ? resolveSpecialRegionalAnime(specialInput).catch(() => []) : null;

        // Direct regional playback for Shin Chan (1..181 verified) & Doraemon (1..762 verified)
        if (((id === '966' || id === '8687') && isRegionalReq) || (id === '11595' && (isRegionalReq || lang === 'dub')) || (id === '527' && Number(ep) === 1 && isRegionalReq)) {
          const rawSpecial = await (specialRegionalPromise || Promise.resolve([]));
          const regionalStreams = rawSpecial
            .filter(a => (id === '527' ? a.key === 'hi' : (ANIME_REGIONAL_LANG_SET.has(a.key) || (id === '11595' && ['sub','dub'].includes(a.key)))))
            .map(a => {
              try {
                const opts = a.audioLang ? { audioLang: a.audioLang } : {};
                return {
                  key: a.key,
                  language: a.language,
                  label: a.label,
                  type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
                  codec: a.codec || 'h264',
                  src: mediaUrl(a.url, a.proxyProvider || 'vidcore', a.headers || {}, opts)
                };
              } catch { return null; }
            }).filter(Boolean);
          const chosen = regionalStreams.find(r => r.key === lang);
          if (chosen) {
            const chosenRaw = rawSpecial.find(a => a.key === chosen.key);
            const rawCaptionTracks = await Promise.race([
              resolveRegionalSubtitles(specialInput, chosenRaw, { originalLanguage: 'ja' }).catch(() => []),
              new Promise(r => setTimeout(() => r([]), 3000))
            ]);
            const specialTracks = proxySubtitleTracks(rawCaptionTracks, 'vidcore');
            for (const stream of regionalStreams) {
              const raw = rawSpecial.find(a => a.key === stream.key);
              const projected = subtitleTracksForVariant(rawCaptionTracks, chosenRaw?.durationSec, raw?.durationSec);
              stream.tracks = proxySubtitleTracks(projected, 'vidcore');
            }
            return json(res, {
              src: chosen.src,
              type: chosen.type || 'application/x-mpegURL',
              codec: chosen.codec || 'h264',
              kind: 'videojs',
              provider: 'VidCore',
              sourceKey: 'megaplay',
              server: chosen.label,
              activeLang: chosen.key,
              allowSub: id === '527' || id === '11595' || (id === '8687' && Number(ep) <= 156),
              allowDub: id === '527' || (id === '11595' ? regionalStreams.some(r => r.key === 'dub') : Number(ep) <= (id === '966' ? 78 : 52)),
              availableLangs: animeAvailableLangs({ sub: id === '527' || id === '11595' || (id === '8687' && Number(ep) <= 156), dub: id === '527' || (id === '11595' ? regionalStreams.some(r => r.key === 'dub') : Number(ep) <= (id === '966' ? 78 : 52)), regional: regionalStreams }),
              tracks: specialTracks,
              regionalStreams,
              qualityStreams: [],
              intro: null,
              outro: null
            }, 200, req);
          }
          const alternate = regionalStreams.find(r => r.key !== lang)?.key;
          return json(res, { error: 'The selected language is not available for this episode.', ...(alternate ? {availableLang:alternate} : {}) }, 404, req);
        }

        const megaLang = isRegionalReq
          ? (available.sub === false || ovr?.subCount === 0 ? 'dub' : 'sub')
          : (lang === 'dub' || available.sub === false || ovr?.subCount === 0 ? 'dub' : 'sub');

        if (!isRegionalReq && megaLang !== lang) {
          return json(res, { error: 'The selected language is not available for this episode.', availableLang: megaLang }, 404, req);
        }
        if (!ovr && available.id) {
          let seriesData = await anikotoSeries(available.id).catch(() => null);
          let row = seriesData?.episodes?.find(x => Number(x.number) === Number(ep));
          fallbackEmbed = row?.embed_url?.[megaLang] || null;
          subFallbackEmbed = row?.embed_url?.sub || null;
        }
        let mappingPromise = resolveAnimeTmdbMapping(id, available, ep);
        let subCompanionPromise = (megaLang === 'dub' && !ovr?.differentDubOrder && available.sub !== false)
          ? resolveMegaPlayDirect({ malId: id, aniId: effectiveAni, episode: ep, lang: 'sub', fallbackEmbed: subFallbackEmbed }).catch(() => null)
          : Promise.resolve(null);
        try {
          let [megaPrimary, { tmdbMapping }, subCompanion] = await Promise.all([
            resolveMegaPlayDirect({ malId: id, aniId: effectiveAni, episode: ep, lang: megaLang, fallbackEmbed }),
            mappingPromise,
            subCompanionPromise
          ]);
          if (!megaPrimary?.url) throw Error('No anime stream available');

          // Duration is only needed to verify regional variants and to line up a
          // dub bumper. Both are secondary to the first frame, so the probe is
          // started here and waited on later, in parallel with the regional and
          // quality work rather than in front of it.
          const durationPromise = (async () => {
            const [megaPrimaryDur, subCompanionDur] = await Promise.all([
              measureMegaHlsDurationSec(megaPrimary.url).catch(() => -1),
              (megaLang === 'dub' && subCompanion?.url && !ovr?.differentDubOrder)
                ? measureMegaHlsDurationSec(subCompanion.url).catch(() => -1)
                : Promise.resolve(-1)
            ]);
            return { megaPrimaryDur, subCompanionDur };
          })();

          // Keep raw sources request-local for caption matching; clients receive only signed proxy URLs.
          const regionalRaw = new Map();
          let regionalInput = specialInput, regionalMeta = { originalLanguage: 'ja' };
          const regionalPromise = (async () => {
            if (specialRegionalPromise) {
              const rawSpecial = await specialRegionalPromise;
              for (const a of rawSpecial) regionalRaw.set(a.key, a);
              return rawSpecial
                .filter(a => (id === '527' ? a.key === 'hi' : (ANIME_REGIONAL_LANG_SET.has(a.key) || (id === '11595' && ['sub','dub'].includes(a.key)))))
                .map(a => {
                  try {
                    const opts = a.audioLang ? { audioLang: a.audioLang } : {};
                    return {
                      key: a.key,
                      language: a.language,
                      label: a.label,
                      durationSec: a.durationSec || -1,
                      type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
                      codec: a.codec || 'h264',
                      src: mediaUrl(a.url, a.proxyProvider || 'vidcore', a.headers || {}, opts)
                    };
                  } catch { return null; }
                }).filter(Boolean);
            }
            if (tmdbMapping && !ovr?.differentDubOrder) {
              const tmdbInput = {
                type: tmdbMapping.type,
                id: String(tmdbMapping.tmdbId),
                season: String(tmdbMapping.season || 1),
                episode: String(tmdbMapping.episode || 1)
              };
              // Start the metadata + dub lookup but only wait a token amount: the
              // same matrix is fetched by /api/anime-audio, which the player calls
              // on its own and uses to grow the language menu. Awaiting it here
              // duplicates several seconds of work the viewer never asked for.
              const metaPromise = getTmdbMetaForResolver(tmdbInput)
                .catch(() => ({ title: cleanAnimeDisplayTitle(available), originalLanguage: 'ja' }));
              const { megaPrimaryDur } = await durationPromise;
              const regionalLookup = metaPromise.then(meta =>
                resolveAnimeRegionalAudio(tmdbInput, meta, megaPrimaryDur > 300 ? megaPrimaryDur : 0).catch(() => []));
              const meta = await metaPromise;
              // When the viewer actually asked for a regional language, waiting is
              // the whole point: cutting off at 220 ms threw away real Hindi/Tamil
              // streams that had already resolved, and the episode silently played
              // Japanese. Only the speculative (lang=sub) case keeps the short race.
              const rawReg = isRegionalReq
                ? await regionalLookup.catch(() => [])
                : await Promise.race([
                    regionalLookup,
                    new Promise(r => setTimeout(() => r([]), 220))
                  ]).catch(() => []);
              // The full answer still lands in the shared cache for the player's
              // own /api/anime-audio call, so nothing is lost by not waiting.
              regionalLookup.catch(() => {});
              regionalInput = tmdbInput; regionalMeta = meta;
              for (const a of rawReg) regionalRaw.set(a.key, a);
              return rawReg.map(a => {
                try {
                  const opts = a.audioLang ? { audioLang: a.audioLang } : {};
                  return {
                    key: a.key,
                    language: a.language,
                    label: a.label,
                    durationSec: a.durationSec || -1,
                    type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
                    codec: a.codec || 'h264',
                    src: mediaUrl(a.url, a.proxyProvider || 'vidcore', a.headers || {}, opts)
                  };
                } catch { return null; }
              }).filter(Boolean);
            }
            return [];
          })();

          // Play must never wait for a language the viewer did not ask for.
          // The client calls /api/anime-audio separately and grows the language
          // menu when it answers, so a sub/dub start only needs a token window -
          // a cached regional answer still lands inside it, a cold one does not
          // delay the first frame.
          const boundedRegionalPromise = isRegionalReq
            ? regionalPromise
            : Promise.race([regionalPromise, new Promise(r => setTimeout(() => r([]), 180))]);

          const [regionalStreams, rawQualityStreams] = await Promise.all([
            boundedRegionalPromise,
            enrichAnimeQualityStreams({ primaryUrl: megaPrimary.url, lang: megaLang, tmdbMapping }).catch(() => [])
          ]);
          const { megaPrimaryDur, subCompanionDur } = await durationPromise;

          // Pre-resolve the dub matrix for the next two episodes while the
          // viewer is still on this one. The language menu then opens on an
          // answer instead of a spinner, at zero cost to the current response.
          if (tmdbMapping && !ovr?.differentDubOrder) {
            const nextEps = [Number(tmdbMapping.episode) + 1, Number(tmdbMapping.episode) + 2]
              .filter(n => Number.isFinite(n) && n > 0);
            Promise.resolve().then(async () => {
              const meta = await getTmdbMetaForResolver({
                type: tmdbMapping.type, id: String(tmdbMapping.tmdbId),
                season: String(tmdbMapping.season || 1), episode: String(tmdbMapping.episode || 1)
              }).catch(() => null);
              if (!meta) return;
              for (const n of nextEps) {
                await resolveAnimeRegionalAudio({
                  type: tmdbMapping.type, id: String(tmdbMapping.tmdbId),
                  season: String(tmdbMapping.season || 1), episode: String(n)
                }, meta, 0).catch(() => []);
              }
            }).catch(() => {});
          }

          let qualityStreams = rawQualityStreams.map(qs => {
            try { return { tier: qs.tier, height: qs.height, codec: qs.codec || 'h264', type: qs.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL', src: mediaUrl(qs.url, qs.proxyProvider || 'megaplay', qs.headers || {}) }; }
            catch { return null; }
          }).filter(Boolean);

          // Strict bumper offset check: NEVER shift when dub and sub streams share the same duration (e.g. AoT 1556.45s vs 1556.45s)!
          let dubOffsetSec = 0;
          if (megaLang === 'dub' && subCompanion?.url && !ovr?.differentDubOrder && megaPrimaryDur > 300 && subCompanionDur > 300) {
            const durDiff = megaPrimaryDur - subCompanionDur;
            if (Math.abs(durDiff) >= 1.5 && Math.abs(durDiff) <= 25) {
              const dubIntro = Number(megaPrimary?.intro?.start) || 0;
              const subIntro = Number(subCompanion?.intro?.start) || 0;
              if (dubIntro <= 5 || subIntro <= 5 || Math.abs((dubIntro - subIntro) - durDiff) <= 2.5) {
                dubOffsetSec = Number(durDiff.toFixed(3));
              }
            }
          }

          let mergedMegaTracks = Array.isArray(megaPrimary?.tracks) ? megaPrimary.tracks.map(x => ({ ...x })) : [];
          if (megaLang === 'dub') {
            const isEng = t => /^en/i.test(t?.language || '') || /^english\b/i.test(String(t?.label || '').trim());
            const subTracks = (!ovr?.differentDubOrder && Array.isArray(subCompanion?.tracks))
              ? subCompanion.tracks.map(t => ({ ...t, ...(dubOffsetSec ? { offsetSec: dubOffsetSec } : {}) }))
              : [];
            const crunchySub = subTracks.find(t => /crunchyroll/i.test(t?.label || '')) || subTracks.find(isEng) || null;
            const dubEn = mergedMegaTracks.find(isEng) || null;

            if (crunchySub) {
              const crunchyEntry = { ...crunchySub, language: 'en', label: 'English' };
              if (dubEn && dubEn.src !== crunchyEntry.src) {
                let dubCueCount = 999;
                try {
                  const vttRes = await fetch(dubEn.src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://megaplay.buzz/' }, signal: AbortSignal.timeout(1800) });
                  if (vttRes.ok) {
                    const vttTxt = await vttRes.text();
                    dubCueCount = (vttTxt.match(/-->/g) || []).length;
                  }
                } catch {}
                if (dubCueCount >= 90) {
                  // Native MegaPlay full Dub captions are authored for this exact video file (0ms offset) — rank FIRST!
                  dubEn.label = 'English [CC]';
                  mergedMegaTracks = [
                    dubEn,
                    crunchyEntry,
                    ...mergedMegaTracks.filter(t => t !== dubEn && !/crunchyroll/i.test(t.label)),
                    ...subTracks.filter(t => t.src !== crunchyEntry.src && !mergedMegaTracks.some(m => m.label.toLowerCase() === t.label.toLowerCase()))
                  ];
                } else {
                  dubEn.label = 'English (Signs & Songs)';
                  mergedMegaTracks = [
                    crunchyEntry,
                    dubEn,
                    ...mergedMegaTracks.filter(t => t !== dubEn && !/crunchyroll/i.test(t.label)),
                    ...subTracks.filter(t => t.src !== crunchyEntry.src && !mergedMegaTracks.some(m => m.label.toLowerCase() === t.label.toLowerCase()))
                  ];
                }
              } else if (dubEn && dubEn.src === crunchyEntry.src) {
                dubEn.label = 'English';
                if (dubOffsetSec) dubEn.offsetSec = dubOffsetSec;
                for (const st of subTracks) {
                  if (st.src !== dubEn.src && !mergedMegaTracks.some(m => m.label.toLowerCase() === st.label.toLowerCase())) {
                    mergedMegaTracks.push({ ...st });
                  }
                }
              } else {
                mergedMegaTracks = [
                  crunchyEntry,
                  ...mergedMegaTracks,
                  ...subTracks.filter(t => t.src !== crunchyEntry.src && !mergedMegaTracks.some(m => m.label.toLowerCase() === t.label.toLowerCase()))
                ];
              }
            } else if (dubEn && !/crunchyroll/i.test(dubEn.label)) {
              dubEn.label = ovr?.differentDubOrder ? 'English [CC]' : 'English';
            }
          } else {
            const hasCrunchy = mergedMegaTracks.some(t => /crunchyroll/i.test(t?.label || ''));
            if (!hasCrunchy) {
              const firstEn = mergedMegaTracks.find(t => /^en/i.test(t?.language || '') || /^english$/i.test(String(t?.label || '').trim()));
              if (firstEn) firstEn.label = 'English';
            }
          }

          let rawTrackSpecs = mergedMegaTracks.map(x => ({ ...x, proxyProvider: 'megaplay', headers: {}, label: x.label || 'English' }));
          let tracks = proxySubtitleTracks(rawTrackSpecs, 'megaplay');
          // Some MegaPlay episode files ship without any subtitle track. Japanese
          // audio must never be left without an English subtitle, so fall back to
          // the series-level English track resolved through the standard chain.
          let englishFallback = null;
          if (!tracks.some(t => /^en/i.test(t.language || '') || /^english\b/i.test(t.label || ''))) {
            try {
              const megaUrl = String(megaPrimary?.url || '');
              const fallback = await resolveRegionalSubtitles(
                { type: 'tv', id: String(tmdbMapping.tmdbId), season: String(tmdbMapping.season || 1), episode: String(tmdbMapping.episode || 1) },
                { url: megaUrl, durationSec: megaPrimaryDur, fps: megaPrimary?.fps || 0, headers: {}, proxyProvider: 'megaplay' },
                regionalMeta || {}
              );
              englishFallback = (fallback || []).find(t => /^en/i.test(t.language || '') || /^english\b/i.test(t.label || '')) || null;
              if (englishFallback) {
                rawTrackSpecs = [...rawTrackSpecs, { ...englishFallback, label: 'English' }];
                tracks = proxySubtitleTracks(rawTrackSpecs, 'megaplay');
              }
            } catch {}
          }

          if (!tracks.length && tmdbMapping && !ovr?.differentDubOrder) {
            const tmdbSubInput = {
              type: tmdbMapping.type,
              id: String(tmdbMapping.tmdbId),
              season: String(tmdbMapping.season || 1),
              episode: String(tmdbMapping.episode || 1)
            };
            const vsSubs = await fetchVidsparkSubtitles(tmdbSubInput).catch(() => []);
            rawTrackSpecs = vsSubs.map((x, idx) => {
              const isFirstEn = idx === 0 && (/^en/i.test(x.language || '') || /^english/i.test(x.label || ''));
              return { ...x, label: isFirstEn ? 'English' : (x.label || 'Subtitle') };
            });
            tracks = proxySubtitleTracks(rawTrackSpecs, 'vidcore');
          }

          // Still nothing: the Japanese file simply carries no captions. A sibling
          // rendering of the same film often does, and captions do not depend on
          // which audio is playing, so borrow the first sibling that has them.
          if (!tracks.length && regionalInput) {
            // A sub/dub start only waits a token window for regional streams, so
            // the list is often empty even though a Hindi release of the same film
            // exists and carries captions. Nobody asked for that audio to start
            // playing, but an episode with no captions at all is worse than a short
            // wait, so pay for the full lookup here and only here.
            let attempts = 0;
            const tryStream = async (rawStream) => {
              if (!rawStream || attempts >= 3) return false;
              attempts++;
              const borrowed = await Promise.race([
                resolveRegionalSubtitles(regionalInput, rawStream, regionalMeta).catch(() => []),
                new Promise(r => setTimeout(() => r([]), 3500))
              ]);
              if (!borrowed.length) return false;
              rawTrackSpecs = borrowed;
              tracks = proxySubtitleTracks(rawTrackSpecs, 'vidcore');
              return true;
            };

            let got = false;
            for (const st of regionalStreams.slice(0, 3)) {
              if (await tryStream(regionalRaw.get(st.key))) { got = true; break; }
            }
            // The sub/dub start races the audio matrix to a token window, so the
            // stream list is usually empty here even when a Hindi release of the
            // same title exists and carries captions. Pay for that one lookup:
            // an episode with no captions is worse than a slightly later start.
            if (!got && !regionalRaw.size) {
              const special = typeof resolveSpecialRegionalAnime === 'function'
                ? await Promise.race([
                    resolveSpecialRegionalAnime({ id, aniId: aniId || available?.ani || null, episode: ep }).catch(() => []),
                    new Promise(r => setTimeout(() => r([]), 5000))
                  ])
                : [];
              for (const a of special || []) {
                if (await tryStream(a)) { got = true; break; }
              }
            }
          }

          const chosenRegional = isRegionalReq ? regionalStreams.find(r => r.key === lang) : null;
          if (isRegionalReq && !chosenRegional) return json(res, { error: 'The selected language is not available for this episode.', availableLang:megaLang }, 404, req);
          if (chosenRegional && regionalInput && regionalRaw.has(chosenRegional.key)) {
            const rawChosen = regionalRaw.get(chosenRegional.key);
            const directTracks = await Promise.race([
              resolveRegionalSubtitles(regionalInput, rawChosen, regionalMeta).catch(() => []),
              new Promise(r => setTimeout(() => r([]), 2500))
            ]);
            if (directTracks.length) { rawTrackSpecs = directTracks; tracks = proxySubtitleTracks(rawTrackSpecs, 'vidcore'); }
          }
          const captionReference = chosenRegional?.durationSec > 0 && rawTrackSpecs[0]?.proxyProvider !== 'megaplay'
            ? chosenRegional.durationSec : megaPrimaryDur;
          for (const stream of regionalStreams) {
            const projected = subtitleTracksForVariant(rawTrackSpecs, captionReference, stream.durationSec);
            stream.tracks = proxySubtitleTracks(projected, 'megaplay');
          }
          if (chosenRegional) {
            return json(res, {
              src: chosenRegional.src,
              type: chosenRegional.type || 'application/x-mpegURL',
              codec: chosenRegional.codec || 'h264',
              kind: 'videojs',
              provider: 'MegaPlay',
              sourceKey: 'megaplay',
              server: chosenRegional.label,
              activeLang: chosenRegional.key,
              allowSub: ovr ? Number(ep) <= Number(ovr.subCount || 0) : available.sub !== false,
              allowDub: ovr ? Number(ep) <= Number(ovr.dubCount || 0) : Boolean(available.dub),
              availableLangs: animeAvailableLangs({ sub: ovr ? Number(ep) <= Number(ovr.subCount || 0) : available.sub !== false, dub: ovr ? Number(ep) <= Number(ovr.dubCount || 0) : Boolean(available.dub), regional: regionalStreams }),
              tracks,
              regionalStreams,
              qualityStreams: [],
              intro: megaPrimary?.intro || null,
              outro: megaPrimary?.outro || null
            }, 200, req);
          }

          return json(res, {
            src: mediaUrl(megaPrimary.url, 'megaplay'),
            type: /\.mp4(?:\?|$)/i.test(megaPrimary.url) ? 'video/mp4' : 'application/x-mpegURL',
            kind: 'videojs',
            provider: 'MegaPlay',
            sourceKey: 'megaplay',
            server: megaLang === 'dub' ? 'English' : 'Japanese',
            activeLang: megaLang,
            // requestedLang is what the viewer asked for; activeLang is what they
            // actually get. When they differ the UI must say so rather than let a
            // Hindi request quietly play Japanese audio.
            requestedLang: requestedLang,
            langFallback: ANIME_REGIONAL_LANG_SET.has(requestedLang) && requestedLang !== megaLang ? megaLang : null,
            allowSub: ovr ? Number(ep) <= Number(ovr.subCount || 0) : available.sub !== false,
            allowDub: ovr ? Number(ep) <= Number(ovr.dubCount || 0) : Boolean(available.dub),
            // A listed language must be one that can actually play. A dub nothing
            // resolved for is not offered, and tracks are not invented either.
            availableLangs: animeAvailableLangs({
              sub: ovr ? Number(ep) <= Number(ovr.subCount || 0) : available.sub !== false,
              dub: Boolean(megaPrimary?.url) && (megaLang === 'dub' || regionalStreams.some(r => r.key === 'dub')) && (ovr ? Number(ep) <= Number(ovr.dubCount || 0) : available.dub !== false),
              regional: regionalStreams
            }),
            tracks,
            regionalStreams,
            qualityStreams,
            intro: megaPrimary?.intro || null,
            outro: megaPrimary?.outro || null
          }, 200, req);
        } catch {
          let otherLang = megaLang === 'dub' ? 'sub' : 'dub', otherFallback = null;
          if (available.id) {
            let seriesData = await anikotoSeries(available.id).catch(() => null);
            let row = seriesData?.episodes?.find(x => Number(x.number) === Number(ep));
            otherFallback = row?.embed_url?.[otherLang] || null;
          }
          let hasOpposite = await resolveMegaPlayDirect({ malId: id, aniId: effectiveAni, episode: ep, lang: otherLang, fallbackEmbed: otherFallback }).then(() => true).catch(() => false);
          if (hasOpposite) {
            return json(res, { error: megaLang === 'dub' ? 'Dub is not available for this episode.' : 'Sub is not available for this episode.', availableLang: otherLang }, 404, req);
          }
          return json(res, { error: 'This episode is not available right now.' }, 404, req);
        }
      }

      let input = { type, id, season, episode: ep };
      const excluded = String(q.get('exclude') || '').split(',').filter(key => OTT_SERVER_KEYS.has(key));
      let resolved = await resolveOttWithFallback(input, provider, getTmdbMetaForResolver, {exclude:excluded});
      let proxyProvider = resolved.proxyProvider || resolved.sourceKey || DEFAULT_OTT_SERVER;
      let src = resolved.kind === 'dash' ? dashUrl(resolved.url, proxyProvider, resolved.headers) : mediaUrl(resolved.url, proxyProvider, resolved.headers);
      let tracks = proxySubtitleTracks(resolved.tracks, proxyProvider, resolved.headers || {});
      let audioStreams = (resolved.audioStreams || []).map(a => {
        try {
          const opts = a.audioLang ? { audioLang: a.audioLang } : {};
          return {
            language: a.language,
            label: a.label,
            type: a.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL',
            codec: a.codec || 'h264',
            sourceKey: OTT_SERVER_KEYS.has(a.proxyProvider) ? a.proxyProvider : resolved.sourceKey,
            server: OTT_SERVERS.find(([key]) => key === (OTT_SERVER_KEYS.has(a.proxyProvider) ? a.proxyProvider : resolved.sourceKey))?.[1] || resolved.server,
            provider: OTT_SERVERS.find(([key]) => key === (OTT_SERVER_KEYS.has(a.proxyProvider) ? a.proxyProvider : resolved.sourceKey))?.[1] || resolved.provider,
            src: mediaUrl(a.url, a.proxyProvider || proxyProvider, a.headers || resolved.headers, opts),
            tracks: proxySubtitleTracks(a.tracks || resolved.tracks, proxyProvider, resolved.headers || {})
          };
        } catch { return null; }
      }).filter(Boolean);
      let qualityStreams = (resolved.qualityStreams || []).map(qs => {
        try { return { tier: qs.tier, height: qs.height, codec: qs.codec || 'h264', type: qs.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL', src: mediaUrl(qs.url, qs.proxyProvider || proxyProvider, qs.headers || resolved.headers || {}) }; }
        catch { return null; }
      }).filter(Boolean);
      return json(res, { src, type: resolved.kind === 'mp4' ? 'video/mp4' : 'application/x-mpegURL', codec: resolved.codec || 'h264', kind: 'videojs', provider: resolved.provider, sourceKey: resolved.sourceKey, server: resolved.server, audioLang: resolved.audioLang || 'und', audioLabel: resolved.audioLabel || 'Original audio', tracks, audioStreams, qualityStreams }, 200, req);
    }

    return json(res, { error: 'Not found' }, 404);
  } catch (e) {
    return json(res, { error: e.message || 'Request failed' }, e.message?.includes('configured') ? 503 : 502);
  }
}

let jikanUnreachableUntil = 0;
// Jikan (MyAnimeList) carries the highest-resolution anime banner available, so
// it is preferred over the AniList banner when the service answers.
const jikanBannerCache = new Map();
// Cache-only read: never blocks a request on a cold Jikan call.
function jikanBannerNow(malId) {
  const id = String(malId || '').replace(/\D/g, '');
  if (!id) return '';
  const hit = jikanBannerCache.get(id);
  return hit && Date.now() - hit.time < 21600_000 ? hit.url : '';
}
async function jikanBannerUrl(malId) {
  const id = String(malId || '').replace(/\D/g, '');
  if (!id) return '';
  const hit = jikanBannerCache.get(id);
  if (hit && Date.now() - hit.time < 21600_000) return hit.url;
  if (Date.now() < jikanUnreachableUntil) return '';
  try {
    const j = await remote(`https://api.jikan.moe/v4/anime/${id}`, { ttl: 21600_000, timeout: 1500, headers: { Accept: 'application/json' } });
    const d = j?.data || {};
    const url = d.trailer?.images?.maximum_image_url || d.trailer?.images?.large_image_url || '';
    const clean = /^https:\/\//i.test(url || '') ? url : '';
    jikanBannerCache.set(id, { url: clean, time: Date.now() });
    if (jikanBannerCache.size > 500) jikanBannerCache.delete(jikanBannerCache.keys().next().value);
    return clean;
  } catch (err) {
    if (/timeout|abort|fetch|connect/i.test(err?.message || '')) jikanUnreachableUntil = Date.now() + 600000;
    return '';
  }
}
async function jikanAnimeEpisodeMeta(malId, sliceNums) {
  // Jikan is a third-party courtesy source that is regularly down or rate
  // limited. Episode titles and stills also come from ani.zip, so a slow Jikan
  // must never decide when the episode list appears: the whole lookup is bounded
  // and a timeout trips the breaker for ten minutes.
  if (Date.now() < jikanUnreachableUntil) return null;
  try {
    let jikanPage = Math.max(1, Math.ceil((sliceNums[0] || 1) / 100));
    const timeoutAt = new Promise(res => setTimeout(() => res('timeout'), 1200));
    const lookup = Promise.all([
      remote(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/episodes?page=${jikanPage}`, { ttl: 21600000, timeout: 1200, headers: { Accept: 'application/json' } }).catch(err => {
        if (/timeout|abort|fetch/i.test(err.message)) jikanUnreachableUntil = Date.now() + 600000;
        return null;
      }),
      remote(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/videos/episodes?page=1`, { ttl: 21600000, timeout: 1200, headers: { Accept: 'application/json' } }).catch(() => null)
    ]);
    const raced = await Promise.race([lookup.then(v => ['ok', v]), timeoutAt]);
    if (raced === 'timeout') {
      jikanUnreachableUntil = Date.now() + 600000;
      lookup.catch(() => {});
      return null;
    }
    let [epRes, vidRes] = raced[1];
    if (!epRes?.data && !vidRes?.data) return null;
    let byNum = new Map();
    for (let row of epRes?.data || []) {
      let n = Number(row.mal_id);
      if (n > 0) byNum.set(n, { title: row.title || row.title_romanji || '', still: null, description: '' });
    }
    for (let row of vidRes?.data || []) {
      let n = Number(row.mal_id), img = row.images?.jpg?.image_url || null;
      if (n > 0) {
        let prev = byNum.get(n) || { title: '', still: null, description: '' };
        byNum.set(n, { title: prev.title || row.title || '', still: img || prev.still, description: prev.description });
      }
    }
    return byNum;
  } catch { return null; }
}

async function anizipEpisodeMeta(malId) {
  try {
    let d = await remote(`https://api.ani.zip/mappings?mal_id=${encodeURIComponent(malId)}`, { ttl: 21600000, timeout: 4500, headers: { Accept: 'application/json' } });
    let eps = d?.episodes || {};
    let byNum = new Map();
    for (let [k, ep] of Object.entries(eps)) {
      if (!/^\d+$/.test(k)) continue;
      let n = Number(k);
      if (!Number.isInteger(n) || n <= 0) continue;
      let rawTitle = typeof ep.title === 'string' ? ep.title : (ep.title?.en || ep.title?.['x-jat'] || ep.title?.ja || '');
      let rawDesc = String(ep.overview || ep.summary || '').replace(/\s*\(?\bSource:\s*[^)\n]+\)?\s*$/i, '').trim();
      let img = /^https:\/\//.test(ep.image || '') ? ep.image : null;
      byNum.set(n, { title: rawTitle, still: img, description: rawDesc });
    }
    return byNum;
  } catch { return null; }
}

const staticCache = new Map();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};
const CSP = "default-src 'self' https: data: blob:; frame-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' https: data:; connect-src 'self' https: data: blob:; media-src 'self' https: data: blob:; worker-src 'self' blob:";

// The Android app runs on a virtual origin (https://kozutv.local) and calls
// this server directly, so API responses must be readable from there. Only the
// app's own origins are allowed; the site itself stays same-origin.
const APP_ORIGINS = new Set(['https://kozutv.local', 'file://']);
function applyCors(req, res) {
  let origin = String(req.headers.origin || '');
  if (!APP_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-KozuTV-Device');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Vary', 'Origin');
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    let corsOk = applyCors(req, res);
    if (corsOk && req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/browse/watch/')) {
      let dest = u.pathname.replace(/^\/browse\/watch\//, '/watch/');
      res.writeHead(301, { Location: dest + u.search });
      return res.end();
    }
    // /upcoming is a real page again (Upcoming anime); nothing to redirect.
    if (/^\/(anime|ott)(\/|$)/.test(u.pathname)) {
      let dest = u.pathname.replace(/^\/(anime|ott)/, '/browse');
      res.writeHead(302, { Location: dest + u.search });
      return res.end();
    }
    if (u.pathname.startsWith('/api/dash/')) return handleDash(req, res, u);
    if (u.pathname === '/api/media') return handleMedia(req, res, u);
    if (u.pathname.startsWith('/api/')) return api(req, res, u);

    let pathname = u.pathname === '/' ? '/index.html' : u.pathname;
    // Server-side modules live beside public/ and must never be downloadable,
    // otherwise the hard-coded webhook URL would leak to anyone who asks.
    if (/^\/(?:presence|server|ai-transcription|ott-resolvers|media-proxy|megaplay-resolver|vidwave-resolver)(?:\.js)?$/i.test(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    let target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      target = path.join(root, 'index.html');
    }
    let ext = path.extname(target), stat = fs.statSync(target), cached = staticCache.get(target);
    if (!cached || cached.mtime !== stat.mtimeMs) {
      let raw = fs.readFileSync(target), compressible = /^\.(?:html|js|css|svg|webmanifest)$/.test(ext);
      cached = { mtime: stat.mtimeMs, raw, gz: compressible ? zlib.gzipSync(raw, { level: 6 }) : null };
      staticCache.set(target, cached);
    }
    let immutable = u.pathname.startsWith('/vendor/') || u.pathname.startsWith('/fonts/') || u.pathname.startsWith('/images/') || u.searchParams.has('v');
    let headers = {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : (immutable ? 'public, max-age=86400' : 'public, max-age=300'),
      'Content-Security-Policy': CSP
    };
    if (cached.gz && String(req.headers['accept-encoding'] || '').includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      return res.end(cached.gz);
    }
    res.writeHead(200, headers);
    res.end(cached.raw);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  }
});

// The serverless adapter dispatches requests without opening a TCP listener.
export default server.listeners('request')[0];
if (!process.env.VERCEL) server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('kozuTV V5.4.19 listening on ' + (process.env.PORT || 3000));
  // Discord credentials without a database is the one combination that produces
  // a sign-in button that appears to do nothing: the visitor authorises, the
  // callback has nowhere to write the account, and the header stays as it was.
  // Say it once, at boot, in the log the operator actually reads.
  // The speech model is loaded lazily now, so a half-copied release cannot take the
  // site down; say plainly at boot that captions are off, and why.
  try {
    const riva = rivaAvailability();
    if (!riva.ok) console.warn('[ai] Riva speech-to-text is unavailable, so AI captions are switched off: ' + riva.reason + ' (everything else serves normally; a missing riva/proto/ folder means an incomplete copy)');
  } catch { /* never let a diagnostic unboot the app */ }

  if (discordConfigured() && !databaseEnabled()) {
    console.warn('[auth] Discord is configured but there is no account database: sign-in will be refused, and watchlists and reactions need it too.');
    console.warn(`[auth]   DATABASE_URL         ${describeKey('DATABASE_URL')}`);
    console.warn(`[auth]   DATABASE_URL_POOLED  ${describeKey('DATABASE_URL_POOLED')}`);
    console.warn(`[auth]   config file          ${envFileReport()}`);
    console.warn('[auth]   If the file above exists and lists the keys, but the two lines above say EMPTY or not set, the service was started with a blank DATABASE_URL in its environment (dashboard, systemd unit or compose file) - delete it there, or export the real value, and restart.');
  }
  // A blank is a legitimate off switch for NVIDIA_API_KEY - the test harnesses use it -
  // but for the account keys it is nearly always a dashboard that created the row and
  // never filled it. Say so at boot, naming the key, before anyone reads the file again.
  const accountMasked = maskedKeys().filter(k => /^(DATABASE_URL|DATABASE_URL_POOLED|DISCORD_)/.test(k));
  if (accountMasked.length) {
    console.warn(`[env] ${accountMasked.join(', ')} ${accountMasked.length === 1 ? 'is' : 'are'} defined as EMPTY in the process environment, so the value in .env was not used - delete the blank entry (dashboard Environment row, systemd Environment= line, compose environment: block) and restart. \`node scripts/doctor.mjs\` prints the whole picture.`);
  }
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  setTimeout(() => process.exit(0), 300).unref();
});
