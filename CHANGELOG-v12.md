# kozuTV v12 — UI fix round

Everything here comes from the round-2 screenshot review. No backend or catalog
behaviour changed; this is the front end catching up with the design.

---

## 1. Sign in button — rebuilt from the screenshot

The button was re-measured from the reference image rather than eyeballed:

| property | value |
|---|---|
| fill | `#26A3D6` (sampled `rgb(38,163,214)`) |
| text | white, "Sign in" |
| height | 44 px desktop / 38 px phone |
| radius | 11 px desktop / 10 px phone |
| border, gradient, shadow | none |

The old gradient-and-border treatment is gone. It is a flat blue pill, exactly as
in the picture.

## 2. Search moved back beside the wordmark

On phones the search glyph had `margin-left:auto`, which flung it into the middle
of the bar with nothing next to it. It is now ordered directly after the wordmark,
so the reading order is **menu → kozuTV → search … Sign in** on every breakpoint.
Measured gaps: 10 px on phone, 16 px on desktop.

The expanded mobile field was also overlapping the Sign in button; it now stops
short of it.

## 3. Search icon — thin and muted, not heavy and white

Was a 20 px glyph at `stroke-width:2.8` in full white. It is now a 26 px outline
magnifier at `stroke-width:2` in `#A0B1C5`, matching the reference's quiet grey-blue.

## 4. Reactions fill when active

A like now fills solid teal (`#2BD9C8`), a dislike solid orange (`#FF731C`), and
each returns to a plain outline when toggled off. Clicking one still replaces the
other, and clicking the same one again clears it.

## 5. Compact counts

Counts of 1000 and over render as `1.1K` / `12.3K` / `1M` rather than `1,100`.
The formatter also handles the rollover properly, so 999,999 reads `1M` and not
`1000K`.

## 6. The episode heading is the actual episode name

This was the real bug of the round. The heading fell back to the series name
("Naruto") because the episode record was looked up in an array that the anime
loader never populated — anime episodes live in a page map. Two fixes:

- the lookup now searches every loaded page of the episode feed;
- the wanted episode number is read from the live URL first, so a click or a
  deep link always wins over stale state.

The result is `My Name Is Konohamaru!`, not `E2 Naruto`.

The duplicate 56 px series heading that sat above the player is gone. The series
name is now a small uppercase eyebrow above the episode name, and it links back
to the show. The episode name is the only heading on the page, set at up to 40 px
at weight 900.

## 7. Description — no "Show more" button

The button is removed. The description is clamped to three lines, and clicking
anywhere on the text expands it; clicking again collapses it. Typography is
lighter-set body copy (`#B9C0CC`, 14.5 px, 1.68 line-height) on a 78ch measure.

## 8. Tighter name-to-description gap

The heading, description, and reaction bar are now one block with 10 px and 14 px
steps instead of three separately-margined elements.

## 9. Login is a card, not a page

`signin-btn` opens a modal card over the current page, with the page behind it
blurred (`backdrop-filter: blur(14px)`). It closes on Escape, on a backdrop click,
or on the Discord button.

Anyone who has `/login` bookmarked still gets the flow: that URL now redirects to
Browse and opens the card over it. It is never a blank route and never a dead link.

Asking to like something while signed out opens the same card in place — the
visitor is not navigated away from the episode they were watching.

## 10. Login card copy

"Login or Register", then the Discord button. No icon row, no explanatory
paragraph, no extra links.

## 11. Profile drop-down

Clicking the avatar opens a single-item menu containing only **Sign out**, with a
log-out glyph, on a 196 px dark card. Verified by reading the DOM: the menu's
item list is exactly `["Sign out"]`.

---

## Verification

Both existing suites were re-run and pass:

```
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

The viewer suite needed one update: it used to click `#watch-title` to hand
keyboard focus back to the player. That heading is now hidden (the episode name
below the player is the heading), so the test clicks the player container instead.

Measurements confirmed in a real browser:

```
phone   brand right 175 | search 185 w34 | icon 26px | account right 378 | gap 10
desktop brand right 204 | search 220 w256 | icon 26px | account right 1256 | gap 16
button  rgb(38,163,214)  h44  radius 11px
counts  1000→1K  1100→1.1K  1234→1.2K  12345→12.3K  999999→1M  1234567→1.2M
menu    visible, 196px wide, items ["Sign out"]
/login  → /browse with the card open
heading "My Name Is Konohamaru!" @38px, matching episode blurb
```

## Files touched

- `public/index.html` — Discord glyph, Sign out row, login card shell, search icon weight
- `public/style.css` — sign-in button, search placement and icon, account menu, login overlay, now-playing block, reaction fill
- `public/app.js` — modal login, `/login` deep link, episode heading resolver, description toggle, compact counts
- `scripts/test-viewer-settings.mjs` — focus-click target
- `scripts/walkthrough.mjs` — new scenes for the card, the expanded description, and the filled reactions
- `scripts/add-captions.py` — captions now shrink to fit instead of clipping
