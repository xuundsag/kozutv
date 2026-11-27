# Continue Watching, spotlight and audio follow-up — 2026-11-27

## Changes

- Continue Watching has a quiet translucent white X. Dismissal atomically advances
  to the next episode with zero progress, or removes the title. Stale episode
  dismissals cannot remove a newer episode. TV advancement uses released season
  episode lists. Anime advancement respects sparse episode lists and title groups.
- Playback completion uses the same transition, blocks later progress saves from
  that player, and removes a completed movie from its watchlist as well.
- Spotlight blends opacity over the outgoing slide, in either direction. The same
  art URLs used by desktop/mobile markup are preloaded and decoded in advance.
  Reduced motion skips the blend.
- Recommendation headings use a stacked-layers glyph matching the existing style.
- Anime hides only its server picker; movie/TV server pickers remain. Explicit
  anime language selection automatically resolves its source and does not silently
  change to another language on failure.
- API validation, discovery and playback share a larger language contract. Native
  HLS audio is retained even when no external audio variants are returned.
  Mandarin and Cantonese remain separate. Scraper failures are isolated; regional
  probes are awaited instead of losing late results to a fixed race. Existing OTT
  failover provides a secondary regional-audio path with episode-duration checks.
- Caption sizing is relative to the player, with bounded persisted scale values.
  This affects selectable captions, **not subtitles burned into provider video**.
- Client asset/service-worker cache is v44.

## Reports and external limitation

The database report review identified episode completion/history, recommendation
icon, oversized Hindi captions and inaccessible Hindi audio. One greeting was not
an actionable issue. Report status records were not changed to claim resolution.

A preview-only provider audit of Naruto S1E1 and Infinity War queried eight
EmbedWave scrapers. The sources API returned HTTP 403 from Vercel; all scrapers
returned no usable sources. The client now distinguishes a blocked provider from
an ordinary empty episode. These code fixes **do not prove Hindi/Tamil/Telugu
playback is restored**. Live multilingual playback and signed-in cross-device
history still require end-to-end verification. No Vidwave dependency was added.

## Tests

- `npm run test:history`: atomic dismissal, zero progress, stale requests,
  season/title transitions, completed movie watchlist, expanded language contract
  and duration-checked fallback tracks.
- `npm run test:viewer`: real browser at 1440/390/320px, actual history endpoint
  through card dismissal, final episode removal, rapid spotlight reversals with
  no translation, real local video, and anime-only server hiding.
- `npm run test:dubs`, `npm run test:genre`, `npm run test:ai`, and
  `node scripts/test-vercel.mjs` cover existing behavior. The AI browser fixture
  now explicitly opts in where transcription is tested; reset/default remains off.

Offline tests use mocked media/catalogs; they cannot certify remote streams.
