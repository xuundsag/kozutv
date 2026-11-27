# kozuTV v15 — orange like fill, walkthrough shows the title

Two corrections from the v14 review.

---

## 1. Like fills orange

The active like was `#2BD9C8` — a cyan/teal that reads as blue on screen. Both
reactions are mutually exclusive (only one can ever be filled at a time), so the
thumb shape carries the meaning and the accent carries the "on" state. Both now
fill with the brand orange `#FF731C`:

```css
.reaction-btn[data-on="1"][data-kind="like"]    { color: var(--orange-strong) }
.reaction-btn[data-on="1"][data-kind="dislike"] { color: var(--orange-strong) }
```

Confirmed in the browser: an active like reports `fill: rgb(255, 115, 28)`, an
inactive one reports `fill: none`, and clicking again clears it back to outline.

## 2. The walkthrough now actually shows the top title

The title was never missing from the app — the recording scrolled past it. The
script called `window.scrollTo(0, 230)` before capturing, which put the heading
just above the viewport, so the scene labelled "Show title on top" was showing the
episode block only.

The scene now holds at `scroll 0` first, where the title sits directly above the
player, and is labelled **"Big show title above the player"** — 2.4 s with the
heading clearly in frame. The scrolled-down shot that follows is relabelled to
describe what is actually visible at that offset ("Episode name, description and
reactions"), and the movie scene is labelled explicit about having no top title
by design.

Frame 145 of the new recording shows `Naruto` at the top of the watch page.
Frame 260 shows the like thumb filled orange with count 1.

---

## Verification

```
like active   fill rgb(255,115,28)  count 1
like inactive fill none
dislike active fill rgb(255,115,28)
click again   both back to outline
```

```
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `public/style.css` — both active reaction states use `var(--orange-strong)`
- `scripts/walkthrough.mjs` — captured at scroll 0 so the title is visible; scenes relabelled
- `public/index.html` — asset cache busting to `v14`
