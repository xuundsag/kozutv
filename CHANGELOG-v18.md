# kozuTV v18 — language selection actually works, dead caption links gone, honest language menu

---

## 1. Picking Hindi used to silently play Japanese

`lang=hindi` was being normalised to `sub` **before** the regional-audio branch ran,
so `requestedLang` was always `'sub'` and the Hindi release was never even looked up.
You asked for Hindi, got Japanese audio, and nothing told you.

Now the request is aliased first (`hindi→hi`, `tamil→ta`, `telugu→te`, `bengali→bn`,
`malayalam→ml`, `kannada→kn`, `punjabi→pa`, `marathi→mr`, `urdu→ur`, `gujarati→gu`)
and the *requested* language is what the server answers with:

```
28851 lang=hindi  -> server: Hindi, activeLang: hi, regional: 1
28851 lang=tamil  -> 404 "The selected language is not available for this episode."
                     availableLang: sub
```

A language that does not exist for an episode now says so, instead of quietly
handing you the Japanese track.

## 2. The language menu no longer promises what it cannot play

`availableLangs` used to advertise `dub` from a catalogue flag even when no dub
stream had actually resolved, so the menu offered a language that 404'd on click.
`dub` is now listed only when a dub stream really resolved for that episode:

```
Naruto 20 ep2  sub -> ['sub']          dub -> ['sub','dub']
28851          sub -> ['sub']          hindi -> ['sub','dub','hi']
```

## 3. Dead caption links removed (31 broken caption sets → 0)

OpenSubtitles hands out short-lived download tokens that are routinely dead by the
time a viewer picks a track. The player was being offered 20–30 caption tracks per
title that all 502'd. A new `verifySubtitleTracks()` in `ott-resolvers.js` probes
every track before it is shown and drops tracks from hosts that answer but never
once serve caption text. A host that is merely unreachable (flaky CDN) is **not**
counted as dead, so one bad probe can never strip a good list:

```
The Odyssey     29 tracks -> 1  (en, real VTT)
Resident Evil    29 tracks -> 5  (en + 4 und, all 200)
Howl's Castle    31 tracks -> 31 (all valid — nothing pruned)
```

## 4. Captions borrowed from a sibling release

When the primary stream carries no captions, the sub/dub path now borrows the
caption set from a sibling regional release of the same title (e.g. the Hindi
release's tracks) instead of showing nothing.

## 5. Avatar is a circle again

The avatar button was flattened to a 6 px radius in v17 along with every other
button. The button stays blocky; the avatar image and initials are now a proper
38×38 circle.

---

## Full-catalogue audit (48 titles, live)

```
sub stream resolves      46  (96%)
dub stream resolves      27  (56%)
dub advertised, no src    0   (was 16 — every advertised dub now resolves)
at least one caption set 40  (83%)
caption sets failed       0   (was 31)
```

### Titles with genuinely no caption source

These eight return **no caption tracks from any provider** — there is nothing to
borrow and nothing to fix server-side. The player shows no caption menu for them
rather than a list of dead links:

| type  | id      | title |
|-------|---------|-------|
| anime | 28851   | A Silent Voice |
| anime | 32281   | Your Name. |
| movie | 1300968 | The Hunger Games: Sunrise on the Reaping |
| movie | 1567605 | Ebenezer |
| movie | 1339713 | Obsession |
| tv    | 84773   | The Lord of the Rings: The Rings of Power |
| tv    | 254630  | 12 12 12 |
| tv    | 1489    | Jimmy Kimmel Live! |

Note on A Silent Voice: its Hindi release *does* exist and plays, but the only
caption set attached to it was a list of expired OpenSubtitles links, so it now
correctly reports no captions instead of 26 dead ones.

---

## Verification

```
28851 lang=hindi  -> Hindi audio, activeLang hi, regional 1
28851 lang=tamil  -> 404 not-available, availableLang sub
28851 lang=dub    -> English stream resolves
28851 lang=sub    -> ['sub'], 0 tracks (honest)
Naruto 20 ep2     -> sub ['sub'] / dub ['sub','dub']
The Odyssey       -> 1 track, 200 VTT
Resident Evil     -> 5 tracks, all 200 VTT
Howl's Castle dub -> 31 tracks, sampled all valid VTT
ALL V5.4.12 VIEWER QA PASSED
PASS cache coalescing, LRU, expiry, concurrency, errors and bounded server exclusions
PASS real genre route: shared page cache, no exhausted-upstream requests, error retry and finite tail
```

## Files touched

- `server.js` — `LANG_ALIASES` + `requestedLang` captured before normalisation;
  `langFallback` and the response use the requested language; `availableLangs`
  derives `dub` from real resolution; sibling-caption borrow on the sub/dub path
- `ott-resolvers.js` — `verifySubtitleTracks()` called from `fetchOpenSubtitles`
  before caching; per-host verdict (answered-but-never-caption-text = dead,
  unreachable = kept)
- `public/style.css` — avatar image/initials circular 38×38
- `public/index.html` — cache busting to `v18`
