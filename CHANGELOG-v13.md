# kozuTV v13 — header corrections + title structure

Corrects five things from the v12 review. No backend or catalog behaviour changed.

---

## 1. Search icon is bold again

v12 thinned it to a 2px stroke in muted grey. That was wrong — the reference is
weighty. Measured off the new screenshot: 18 px glyph at a **2.7–3.0 px stroke**
(after dividing the capture's 3× density down to CSS pixels). It is now a 23 px
glyph at `stroke-width:2.9` in `#C8D0DA`, so it reads solid without being pure white.

## 2. Search position — it belongs on the right, not beside the wordmark

This is what v12 got wrong: I moved the glyph up against the wordmark. The
reference keeps the bar's rhythm **menu → wordmark → (gap) → search → Sign in**,
with the glyph pushed to the right of the bar so it sits immediately before the
button. Measured on the reference: 11.7 px of space between the glyph and the
button's left edge.

The phone layout is now ordered menu (0) → brand (1) → search (3, `margin-left:auto`)
→ account (4), giving 8 px of clearance to the button. An older rule in the same
stylesheet was still winning with `order:2`; that duplicate has been corrected too,
which is why the earlier attempt appeared not to take.

## 3. Sign in is orange and properly blocky

Measured geometry from the reference: **71 × 31 CSS px, radius 6 px**, fill resolved
to `#FF731C` after removing the modal's dimming veil (the screenshot was taken with
the login card open, so the whole page was at ~40% brightness — the un-dimmed maths
lands on the same orange the site already uses).

Now: `var(--orange-strong)` fill, dark `#19110B` text matching the existing
`.hero-watch` convention, **6 px radius**, no border, no shadow, 42 px tall with
88 px minimum width, and weight 800 so it reads as a solid block rather than a pill.
Phone: 38 px tall, 78 px minimum width, still 6 px radius.

## 4. Login card — the page shows through the blur

The old backdrop was `#06080ccc` plus a 14 px blur, which greyed the page out to
near-nothing. The reference clearly keeps the page's colours and layout visible
through the veil — you can read the hero artwork and the poster grid behind it.

Now: `rgba(6,11,20,.55)` with `backdrop-filter: blur(20px) saturate(1.35) brightness(.82)`.
Real poster colour and layout come through, blurred, instead of a flat grey wall.
The card itself is untouched, as instructed — same size, padding, radius, colours
and Discord button.

## 5. Titles — show name on top again, name below

The top heading above the player is back where it was, and it is the **show name**.
The block below the player names what is actually playing:

| page | top heading | below the player |
|---|---|---|
| series / anime | show name (`Naruto`) | episode name (`My Name Is Konohamaru!`) |
| movie / anime movie | hidden, as before | the film name (`Venom: The Last Dance`) |

Neither heading carries an `E2` prefix. The temporary `.np-series` eyebrow from v12
is removed since it is no longer needed. The below-player heading was dialled back
to 31 px / weight 800 so it supports the top title instead of competing with it.

---

## Verification

Measured in a real browser at 390 / 768 / 1280 px:

```
phone    brand right 173 | search x251 w38 | icon 23px 2.9 stroke #C8D0DA | signin x297 w81 h38 r6px #ff731c
tablet   brand x55 w149  | search x220      | icon 23px 2.9 stroke           | signin x655 w89 h42 r6px
desktop  brand x55 w149  | search x220      | icon 23px 2.9 stroke           | signin x1167 w89 h42 r6px
overlay  background rgba(6,11,20,.55) | backdrop blur(20px) saturate(1.35) brightness(.82)
anime    top "Naruto" visible          | below "My Name Is Konohamaru!"
movie    top hidden                    | below "Venom: The Last Dance"
signed in avatar takes the right slot, search shifts left, menu items ["Sign out"]
```

Both suites re-run clean:

```
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `public/style.css` — sign-in button, search glyph weight/colour, phone header order,
  login backdrop, below-player heading size
- `public/app.js` — top heading restored and kept in sync, below-player naming rules
- `public/index.html` — asset cache busting to `v12`
