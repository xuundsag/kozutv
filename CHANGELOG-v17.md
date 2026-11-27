# kozuTV v17 — square menu X, every button blocky, smaller drop-down, simple thumbs, image quality restored

---

## 1. The "weird outline" around the X

The button was **19 px wide and 42 px tall** while the X inside it was 19 × 19. So the
X sat in a tall narrow sliver, and the hover/active background stretched down past the
icon — that stretched box is the outline you were seeing. It also made the tap target
awkward.

Now: a **38 × 38 square** with the 19 px X centred, radius 6 px, so the highlight is
exactly the shape of the icon. Verified: button 38×38, icon 19×19, `aria-expanded`
still drives the hamburger-to-X swap.

I also dropped a stale `stroke-width: 2.6` that was being force-applied to a
`fill`-only path.

## 2. Every button is blocky

All fully-rounded pills are gone. Everything now uses the Sign in shape — a flat
6 px radius:

| element | before | now |
|---|---|---|
| `.btn` primary | 999 px pill | **6 px** |
| `.btn` secondary chip | 6 px | 6 px (kept) |
| hero "Start Watching" | 999 px pill | **6 px** |
| hero bookmark | 50% circle | **6 px** |
| reaction buttons | 10 px | **6 px** |
| Discord button | 12 px | **6 px** |
| avatar button | 999 px pill | **6 px** |
| search field | 11 px | **6 px** |
| menu toggle | 8 px | **6 px** |

The only circles left in the stylesheet are genuine ones: the loading spinner, the
button loader and the site-switch knob.

## 3. Profile drop-down is smaller

```
width     196 px -> 168 px
padding    7 px ->   5 px
radius    14 px ->   8 px
row      12/13 px padding -> 9/11 px
icon        19 px ->  17 px
```

Still exactly one item: **Sign out**.

## 4. Thumbs redrawn as simple blobs

The two-tone Crunchyroll idea was too fussy. The icons are now a single compact
shape: a rounded fist with a small thumb stub.

- **like** — fist bottom-left, fingers wrapping right, stub rising from the top-left
- **dislike** — the *same* drawing rotated 180°, which is what a dislike is, so the
  mirroring cannot go wrong again

```
like:     <path fist/>  + stub up
dislike:  <g transform="rotate(180 12 12)"> same two paths </g>
```

Off = light grey outline, on = solid orange. Tap again clears it.

## 5. Image quality restored

The v16 poster downscale is reverted in full:

- AniList covers are back to `cover/large` (was temporarily `medium`)
- TMDB posters are back to `t/p/w780` (was temporarily `w342`)

Verified live: a poster request now reads
`/api/img?u=...anilistcdn/media/anime/cover/large/bx21-...jpg` — the full-resolution
tier. The trade-off from v16 (46% less transfer) is deliberately given up here.

## 6. Workspace

Removed eight superseded zips and five superseded walkthrough videos — every one of
them is already on Drive. Also cleared the intermediate frame directories in `/tmp`.
Freed roughly 200 MB.

---

## Verification

```
menu toggle   38x38, radius 6px, X 19x19, aria-expanded=true
dropdown      168 x 49, radius 8px, items ["Sign out"]
radii         signin 5px | avatar 6px | menuToggle 6px | search 6px | heroWatch 6px
detail btn    149 x 44, radius 6px
poster url    .../cover/large/...   (full quality)
thumbs        like fills orange on click, dislike fills orange, both clear on re-tap
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `public/style.css` — square menu toggle, all radii to 6 px, smaller drop-down, thumb states
- `public/app.js` — simple blob thumb icons, poster tier reverted
- `server.js` — TMDB poster tier reverted to `w780`
- `public/index.html` — cache busting to `v17`
