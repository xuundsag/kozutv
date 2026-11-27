# V21 — images, storage and mobile improvements

- Removed the faulty image visibility gate; browsers can show successfully loaded posters normally.
- The v5 service worker deletes previous kozutv-vN caches on activation and stores only an essential application shell. It does not cache catalogue API results or posters. Image responses are no-store in the browser; a bounded 24 MB image cache remains on the server. Existing HTTP caches outside CacheStorage are controlled by the browser and may not be instantly deleted. No offline catalogue is promised.
- Reduced browser-side catalogue retention and prefetching, removed some mobile and reaction animations. Mobile hero avoids loading both full-resolution hero pictures when lazy loading is supported. These measures reduce pressure but do not guarantee a device will never run out of memory.
- Header controls moved left together, preserving the 1.5px gap and flush, unboxed menu. Avatar is 34px.
- Reaction updates paint immediately; absolute writes are serialized for rapid clicks. Errors revert to the last confirmed state and show a message. Legacy toggle clients still work.
- Non-fullscreen watch player is centered and constrained to the viewport; reactions and episode lists remain accessible by scrolling below it.

## Testing
Playwright tests cover real visible browse posters, old worker cache cleanup, unrelated cache preservation, a 1.28MB shell, mobile scrolling (3MB JS heap measured, not total device RAM), 360–1280px header alignment, player fit at 390x844, 844x390 and 1280x720, optimistic rapid reactions and failure rollback. Temporary database account tested idempotent vote writes and legacy toggle, and was removed. Anime relation graph, arcs, season selector, account integration, genre and viewer tests passed. The legacy test-sw-refresh checks intentionally obsolete offline catalogue seeding and should not be treated as a v21 acceptance test.

## Deployment safety
This ZIP includes actual credentials in .env; share privately. Back up destination .env and data/ before deployment. Do not overwrite live visitor data/states.json or data/user.json. Example: `rsync -a --exclude 'data/states.json' --exclude 'data/user.json' moscowtv_v5419/ /path/to/app/`. This will replace destination .env unless it is also excluded. Then run `npm install --omit=dev`, `chmod 600 .env`, `node scripts/doctor.mjs`, and restart normally. After deployment check production sw.js is kozutv-v5 and browse images are visible. Old CacheStorage is cleared only when the new service worker activates in each browser; old HTTP cache may be evicted separately by the browser. See CHANGELOG-v20.md for other prior changes. Production was not deployed by the build author.
