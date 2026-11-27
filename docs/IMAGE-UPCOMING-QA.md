# v45 images, Upcoming, Continue Watching and reports

## Implemented

- Persistent cache-first same-origin images, including proxy requests, posters,
  spotlight art and local image assets. Separate cache survives shell updates.
  Limits: **64 MiB, 240 entries, 8 MiB per image**. Oldest insertion is evicted
  first; reading an image does not move it to the back. Failed, opaque,
  non-image and no-store responses are not cached. Writes are serialised and
  quota errors trim old entries. Images evicted by the app/browser refetch.
- Successful image proxy responses permit ordinary HTTP caching too. App and
  service worker caches are v45. This is browser-local storage, not a shared
  database; clearing site data/private browsing can remove it.
- Upcoming combines AniList anime, TMDB upcoming movies and upcoming TV, using
  the same cards/release metadata. Future movie/TV detail pages display release
  information rather than failing the released-title gate or offering Play.
- Continue Watching reconciles keyed cards, retains unchanged image DOM, fades
  removed cards and animates surviving cards into the gap. Episode advancement
  updates progress metadata in place. No dismissal success/status toast.
- Bigger left-side X, subtle orange hover/focus pop and reduced-motion handling.
- Report form contains only the required issue description. Server accepts that
  payload with existing DB columns kept compatible. No schema reset.
- Latest report #14 (mobile expanded-search/menu gap) fixed and browser-tested.
- Regional discovery remains in the background with no fetching/status copy.

## Artwork

All shared anime cards, Continue Watching and detail posters use exact MAL-ID
Jikan lookups. The loader validates returned MAL identity and the official MAL
CDN, coalesces requests, spaces calls and backs off on outages. No generated
anime art or invented title overlay is added. The source catalogue artwork is
retained temporarily if Jikan is unreachable; these fallback cache entries expire
in an hour. Normal client fallback remains available for new/unknown titles.

**Not a complete visual audit:** Jikan does not label whether a poster contains
printed title lettering. The numeric identity/routing of catalogue cards is
covered by tests, not a claim that every remote cover was visually inspected.
Live Jikan requests from the diagnostic Vercel build failed to connect for MAL
20, 21 and 40748, so fresh Jikan imagery is not verified for these titles.

## Audio comparison and reports

Read the latest reports using a preview-only diagnostic deployment; no report
records were deleted or marked resolved. Older completion/icon/subtitle/audio
reports remain accounted for in UI-AUDIO-QA.md. Newly observed report #14 is fixed.

At comparison time, kozutv.bond served v42, while kozutv.vercel.app served v44.
Both returned no regional streams for Naruto (MAL 20) S1E1 and Jujutsu Kaisen
(MAL 40748) S1E1. v44 reported the upstream provider blocked. This is not proof
that no titles work on the old site; a specific currently-working old-site
example is still needed. No audio-provider fix or restored playback is claimed
in this release. Discovery status text is removed as requested, not the lookup.

## Verification

`npm test` includes real service-worker reload/offline/FIFO/byte-limit/refetch
checks, poster identity/host/backoff tests, mixed Upcoming mapping, report form,
mobile search geometry, retained Continue Watching image DOM and the existing
playback/caption/catalogue regression suites. `node scripts/test-vercel.mjs`
checks the serverless adapter. Remote media and live Jikan remain separate checks.
