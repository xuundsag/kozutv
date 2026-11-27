# kozuTV v14 — show title restored to full size, login blur removed

Two corrections from the v13 review.

---

## 1. The big show title above the player

The heading was there, but it was constrained to the 1080 px player column, so on a
wide screen it read as an ordinary line rather than the page title.

- It now lives **outside** the player column and runs the full content width
  (measured 1204 px at a 1280 px viewport, starting at x=38 instead of x=100).
- Size raised from a 36–56 px clamp to a **40–64 px** clamp, weight 900, tighter
  tracking (-2.2 px) and a slightly heavier text stroke.
- Responsive steps raised with it: 46 px at ≤800 px, **38 px at ≤650 px**
  (was 34), 33 px at ≤380 px.

Confirmed present for:

| page | top title | below the player |
|---|---|---|
| anime series (`Naruto`) | **shown, 64 px** | episode name |
| TV series (`The Lord of the Rings: The Rings of Power`) | **shown** | episode name |
| movie (`Venom: The Last Dance`) | hidden | film name |
| anime movie (`A Silent Voice`) | hidden | film name |

No `E2` prefix anywhere, and the film name never appears twice.

## 2. Login backdrop is no longer blurred

The blur is gone entirely. The overlay is now a plain dim veil —
`rgba(4,8,14,.62)` with **no** `backdrop-filter` — so the page behind the card is
fully sharp and readable, just darker. The card itself is unchanged.

---

## Verification

```
desktop  title 64px weight 900 | x38 w1204 | player starts y174
phone    title 40px weight 900 | x16 w358  | player starts y141
overlay  background rgba(4,8,14,.62) | backdrop-filter: none

series       top shown "Naruto"                          below "My Name Is Konohamaru!"
tv           top shown "The Lord of the Rings: ..."      below "A Shadow of the Past"
movie        top hidden                                  below "Venom: The Last Dance"
anime movie  top hidden                                  below "A Silent Voice"
```

Both suites re-run clean:

```
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `public/app.js` — the `h1` moved out of `.player-wrap` so it can span the container
- `public/style.css` — larger `.watch-title` scale, player column spacing, blur removed
- `public/index.html` — asset cache busting to `v13`
