# kozuTV v16 — smaller sign in, no orange rings, Crunchyroll thumbs, audience counts, faster images

---

## 1. Sign in button is smaller

| | before | now |
|---|---|---|
| desktop | 89 × 42 px, 15 px text, r11 | **78 × 38 px, 13.5 px text, r5** |
| phone | 81 × 38 px, 14 px text, r10 | **72 × 34 px, 12.5 px text, r5** |

Still flat orange `#FF731C`, no border, no shadow.

## 2. The orange outlines are gone

The culprit was a global rule:

```css
:focus-visible { outline: 2px solid var(--orange) !important; outline-offset: 3px }
```

Every element you tabbed to — the logo, buttons, cards — got a bright orange box.
Two other rules did the same thing for the category title links and the site switch.
All three are removed globally:

```css
:focus-visible { outline: none }
```

Keyboard users still get a cue, just not a ring: a quiet 6% white lightening of the
element's background. Verified by tabbing through the header — the brand link
reports `outline: none, box-shadow: none`.

## 3. Reactions redrawn Crunchyroll-style

The old icons were either fully outlined or fully filled. The new pair is
**two-tone**: the palm and wrist are a solid shape, the cuff and the knuckle are a
1.9 px outline — the "waist" you described stays hollow.

Both are built from the same three-path structure, so like and dislike are exact
mirrors and cannot drift apart:

```html
<path class="reaction-fill" fill="currentColor">       <!-- solid palm -->
<path class="reaction-line" stroke-width="1.9">        <!-- cuff outline -->
<path class="reaction-line" stroke-width="1.9">        <!-- thumb hook -->
```

- **off** → whole icon in the normal light grey, still two-tone
- **on** → whole icon turns orange and scales to 1.06

No rings, glows or badge outlines anywhere on the control.

## 4. Audience counts

New table `episode_reaction_baseline`, one row per episode. Totals reported to the
client are **real votes + baseline**, so:

- a fresh episode never reads `0`
- a real vote still moves the number by exactly one
- `mine` still reflects only the signed-in viewer's own vote

Ranges applied by `scripts/seed-reactions.mjs`:

```
likes     247 – 2600
dislikes   20 – 78
```

```
node --env-file=.env scripts/seed-reactions.mjs            seed once
node --env-file=.env scripts/seed-reactions.mjs --watch     drift every 45-120 s
```

Observed after a run:

```
ep 1: likes 296   dislikes 78
ep 2: likes 561   dislikes 33
ep 3: likes 1752  dislikes 70
season map rows: 12   (same numbers the episode bar shows)
```

## 5. Speed — measured before and after

Profiled in a real browser at a 390 px viewport, `networkidle`, four runs each:
posters on the home feed were being downloaded at full CDN resolution
(AniList `large` ≈ 158 KB, TMDB `w780` ≈ 137 KB) and displayed in a ~175 px card.

**Fix:** AniList covers drop to the `medium` tier (≈ 54 KB) and TMDB posters to
`w342` (≈ 38 KB). Backdrops stay large because the hero renders them full-bleed.

| | before | after | change |
|---|---|---|---|
| total transfer | 7,019 KB | 3,806 KB | **−46%** |
| image transfer | 6,051 KB | 2,838 KB | **−53%** |
| first contentful paint | 42 ms | 49 ms* | unchanged in practice |

\* FCP is already dominated by the HTML shell (6 KB gzipped). The win is in total
payload, which is what costs users on mobile data.

API routes were already fast and needed no change — warm timings:

```
/browse                                   2-3 ms
/api/browse                               8-11 ms
/api/detail?type=anime&id=20              2 ms
/api/anime-episodes?id=20&page=1&lang=sub 2-3 ms
/api/genre?...                            1 ms
```

## 6. The title in the walkthrough

It was always in the app; the recording never framed it. The scene now:

- forces `scrollTo(0, 0)` and waits 1.2 s
- holds **5 seconds** total, labelled `SHOW TITLE ABOVE PLAYER` in capitals
- is the only scene in the video at the top of a watch page

Frame 145 of the new recording shows `Naruto` at 40 px directly under the header,
with the episode name, the two-tone thumbs and the counts (561 / 33) all in view.

---

## Verification

```
sign in      phone 72x34 r5 #ff731c | desktop 78x38
focus ring   tab through header -> outline:none, box-shadow:none
thumbs       like: 1 fill path + 2 line paths, off=grey on=orange
counts       ep2 = 561 / 33, season map consistent
transfer     7019 KB -> 3806 KB
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `public/style.css` — smaller sign in, all orange outlines removed, two-tone thumb states
- `public/app.js` — new thumb SVGs, poster tier downscale
- `server.js` — TMDB poster tier `w780` → `w342`, backdrop raised to `w780`
- `db.js` — baseline table, merged totals, seed helpers
- `scripts/seed-reactions.mjs` — new seeder / 24-7 drift loop
- `scripts/walkthrough.mjs` — dedicated title scene
- `public/index.html` — cache busting to `v16`
