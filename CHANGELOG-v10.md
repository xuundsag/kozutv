# kozuTV V5.4.19 — v10 (backend polish)

Scope: backend only, plus the one CSS line needed to fix the mis-centred spinner.
No new pages, no UI redesign.

---

## 1. Loading icon — finally centred

The ring sat one ring-height above the middle of the player. `getBoundingClientRect()`
insisted the box was centred, which is why it kept coming back.

**Cause.** `.loading` is `display:grid` with a hidden text node ("Loading player…")
as a second child. The text created a **second grid row**, so the box was split
into two implicit rows and the ring was vertically centred inside the first one:

```
gridTemplateRows: "125.5px 75.5px"     ← two rows
```

**Fix** (`public/style.css`, inside `.loading`):

```css
grid-template-rows: 1fr !important;
align-content: center !important;
text-indent: -9999px !important;
overflow: hidden !important;
```

One row now spans the whole box, so the ring is centred by the grid itself and no
longer depends on whether the label text renders.

Verified on `/watch/anime/20/2` and `/watch/movie/912649` at 390×844 and 1280×800 —
`gridTemplateRows` reports `"201.375px 0px"` / `"607.5px 0px"` (single row) everywhere,
and a green crosshair drawn at the true player centre lands inside the ring.

---

## 2. Player load — 7.3 s → ~1.0 s

Measured as first decoded video frame on `/watch/anime/20/2` (phone viewport):

| | before | after |
|---|---|---|
| Warm navigation | **7322 ms** | **~1030 ms** |
| First cold navigation after a restart | 7322 ms | **~2500 ms** |
| `/api/play` (anime) | 3917 ms | **~950 ms** |
| `/api/play` (anime, warm) | 3304 ms | **~900 ms** |
| `/api/detail` | 3142 ms | **513 ms** |
| `/api/anime-episodes` | 1810 ms | **~0 ms** (cached) |

Five separate causes, all backend:

### 2.1 nitro's throttled probe held the whole request (≈10 s at worst)
`probeEmbedWaveStream` retried a CDN-throttled URL with `900 + attempt*1400` delay and
no ceiling, so one throttled candidate could sit there for ten seconds while three
siblings had already answered. Each probe now carries its own
`NITRO_RETRY_BUDGET_MS = 4200` budget (3 attempts, 350 ms apart), and the field is
waited on with a 5200 ms overall deadline instead of `Promise.allSettled` with no bound.
A candidate that answers late still lands in `probedMap` for the next request.

### 2.2 `/api/play` resolved the dub matrix twice
There was a second, unbounded `resolveAnimeRegionalAudio` call inside the regional
branch — years of work for a language the viewer had not asked for. It now starts
immediately but is only waited on for 220 ms, and the full answer still populates the
shared cache for the player's own `/api/anime-audio` call. The outer bound went
1500 ms → 180 ms for the same reason.

### 2.3 `enrichAnimeQualityStreams` spent 2.8 s to return nothing
On a master with a single rendition it makes three more upstream calls and usually
comes back empty — and the player works fine without extra tiers (VHS switches
natively whenever the master has two or more). It is now cached per episode for
10 minutes with a 900 ms budget on a miss; late results are cached and used next time.

### 2.4 Jikan was blocking the title page
`/api/detail` awaited `jikanBannerUrl()` — a 2.6 s timeout against an API that is
currently **not answering at all** (30 s+ on a direct request). Jikan only supplies a
higher-resolution banner for an image that already exists. It is now read from cache
only (`jikanBannerNow`), warmed in the background, and appears on the next view.

`jikanAnimeEpisodeMeta` had the same problem (1.8 s on the episode list). It is now
bounded to 1200 ms, and a timeout trips the existing `jikanUnreachableUntil` breaker
for ten minutes instead of retrying on every page.

### 2.5 Split-cour backfill blocked the episode list
The MAL → TMDB → season backfill is a two-hop lookup that only improves titles and
stills. It now runs against a 700 ms deadline and the list renders without it.

### 2.6 The catalog cache survives a restart
`remote()` cached JSON in memory only, so every restart paid ~3 s to re-fetch the whole
catalog before the first page could paint. The same TTL-bounded entries are now mirrored
to `data/remote-cache.json` (writer: every 20 s and on SIGINT/SIGTERM, atomic rename)
and replayed on boot, skipping anything expired. A restart is now a file read.

### 2.7 Warm-ahead for the next two episodes
`/api/play` quietly resolves the dub matrix for episodes `n+1` and `n+2` after it has
answered. Opening the language menu on the next episode is instant — measured
**884 ms warm vs 3978 ms cold** on the same show.

---

## 3. Dubs — more languages, and verified working

### More codes actually requested
`cleanLanguageOnlyLabel` has always *recognised* Marathi, Punjabi, Urdu and Gujarati
(they are in `CLEAN_AUDIO_LANG_PATTERNS`), but neither the resolver nor the server ever
asked for them, so a track sitting in a master could never reach the menu.

`REGIONAL_ANIME_WANTED` (`ott-resolvers.js`) and `ANIME_REGIONAL_LANG_SET` (`server.js`)
now both carry:

```
hi, ta, te, ml, kn, bn, mr, pa, gu, ur, zh, yue
```

The probe priority list also went from 3 names to 6 (`hi, ta, te, ml, kn, bn`).

> Note on expectation: a direct census of the upstream scrapers (8 shows × episodes ×
> 8 providers) found the services genuinely carry only Hindi, Tamil, Telugu, Malayalam,
> Bengali, Kannada, English and Japanese, plus "multi audio" containers. No provider
> offers Punjabi, Marathi, Urdu or Gujarati dubs — if one ever appears it is now parsed
> and offered instead of being dropped on the floor.

### Every offered track checked end-to-end
For `id=20 ep2`, every language the menu offers was fetched through `/api/play` and the
returned manifest was requested through the proxy:

| lang | `activeLang` | server | manifest |
|---|---|---|---|
| hi | hi | Hindi | 200, valid m3u8 |
| ta | ta | Tamil | 200, valid m3u8 |
| te | te | Telugu | 200, valid m3u8 |
| ml | ml | Malayalam | 200, valid m3u8 |
| bn | bn | Bengali | 200, valid m3u8 |

Dub coverage across shows (`/api/anime-audio`, ep 1 unless noted):

```
20     Naruto      hi,ta,te,ml,bn
1735   Shippuden   hi,ta,ml
21     One Piece   hi,ta,te,ml,kn
16498  AoT         hi,ta,te,kn
1535   Death Note  hi,ta,te
11061  HxH         hi,ta,te,ml,kn
5114   FMA:B       hi
8687   Doraemon    hi
```

Missing entries are checked against the source, not assumed: e.g. `46260` ep4 and ep14
return no dub even with the retry budget raised to 12 s, so the upstream episode really
has no dub — the menu correctly shows none rather than a label that would not play.

---

## 4. Downloads page

Not added. `/downloads` still renders the existing in-app gate ("Downloads live in the
app") when there is no native bridge, which is what it did in v9. No new page, route or
UI was created.

---

## Regression checks

```
node scripts/test-genre-cache.mjs      PASS  (coalescing, LRU, expiry, errors)
node scripts/test-viewer-settings.mjs  ALL V5.4.12 VIEWER QA PASSED
```

Also re-verified by hand after every change: `/api/play` for `sub`, `dub` and all five
regional languages; `/api/anime-audio` across 12 shows; both spinner breakpoints; the
warm-ahead path; and a full cold restart to confirm the persisted cache loads.
