# kozuTV V5.4.19 — v9

## 1. Dub / language matrix
- **Naruto** (and every anime using a nitro multi-audio master) now lists **Hindi, Tamil, Telugu, Malayalam, Bengali**.
  Root cause: nitro's master carries no `#EXTINF` duration, so the probe returned `durationSec: -1`
  and the "too short to be an episode" gate rejected every regional track. `-1` now means *unknown*.
- **Phantom AniList ids** no longer blank a whole page: AniList 404s the entire query if one alias is bad,
  so batches are bisected and a failing entry falls back to a title+year search.
- **Shinchan episode mapping** no longer clamps. `mapShinchanRegionalEp()` returned the *last* Hindi
  episode for every episode past the end of the list, and shifted every episode after the first gap
  onto the wrong source. It now returns `null`, and those episodes fall back to the Japanese cut.
- **Cartoons never show an empty player**: Shinchan / Doraemon episodes with no Hindi master now
  serve the Japanese stream (via the standard OTT providers) as `sub`.
- **`cleanLanguageOnlyLabel`** already understood Devanagari/Tamil/Telugu/Malayalam/Bengali track names;
  the parser was never the problem — it was the duration gate above.

## 2. embedwave is last resort
`fallbackPool` reordered to `vidcore → cinesrc → vidlink → vidsrc → embedwave`.

## 3. Poster quality — no more soft 480p art
- Card art needs 338 physical px at dpr 3; `cdn.anipixcdn.co/thumbnail/` caps at **283×400** (and is the
  only path that exists — `poster/cover/large/original` all 404).
- Every catalogue surface (`/api/browse`, `/api/genre`, `/api/category-page`, `/api/search-all`) now
  swaps AniPix art for AniList `cover/extraLarge` (**460×690**), falling back to TMDB `w780` when
  AniList's own file is still the 230px one.
- Result: **0 AniPix covers** across anime / TV / movie / genre / search.
- Covers are persisted in `data/poster-cache.json`, so a restart no longer re-blurs the site.

## 4. Load time
- `/api/browse?type=anime`: **815 ms → 168 ms cold, 10 ms warm**.
- Poster upgrades no longer block the response; they resolve in the background from cache.
- Genre page cache stays pristine (poster upgrade is a copy + fire-and-forget), so concurrent
  requests still share one upstream fetch — `test-genre-cache.mjs` passes.
- `/api/img` keeps its 7-way concurrency cap and 3-attempt retry.

## 5. Watchlist
Continue Watching removed from the Watchlist page. Home keeps its own Continue section.

## 6. Language menu
The `/api/anime-audio` lookup used to be skipped whenever any regional track already existed, so a
series with an English dub never discovered its Indian ones. It now always runs.
Verified on `/watch/anime/20/2`: menu lists Japanese, English, Hindi, Tamil, Telugu, Malayalam, Bengali.

## Verification
- `v9-evidence/*.png` — full screenshot set.
- `kozuTV-v9-tour.mp4` — 99 s screen recording of every major surface.
