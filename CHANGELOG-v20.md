# kozuTV v20 — anime grouping and account sync

## Changes
- Groups playable anime seasons and sequels using a local AniList relationship snapshot, including prequel/sequel graph paths through an unplayable intermediary. Curated grouping is used for Beyblade and Pokémon. The franchise card points to the main title; the season selector retains each provider's own ID for playback. The title-page URL stays on the franchise when changing parts.
- One Piece uses 59 manually mapped arc/special groups, including separate Egghead and Elbaph. Episodes interrupted by specials are filtered to the selected arc rather than mislabeled. The available provider episode count determines which options appear.
- Movies and web series are not grouped as franchises in this update. Relationship metadata and provider availability are imperfect; missing/incorrect relationships can still require a correction. The catalogue audit found 90 eligible entries without AniList metadata. Beyblade X is probed dynamically and may not appear while AniList or the provider is rate-limiting/unavailable.
- Adds PostgreSQL account state for watchlist, history and settings. Existing guest server data is used to initialize a new account once; database transactions serialize concurrent account updates. Personal state is cached per account for 60 seconds, not in the service worker's shared API cache. Player preferences and site preferences sync while online. Account-specific settings are swapped on account changes. Offline write/sync is not promised.
- Reactions are white thumb icons with no box or orange active state; selected icon fills.
- Increases image-fetch concurrency from 7 to 12, fixes a leaked slot on non-image responses, uses exact-key service-worker image caching, and hides incomplete scans on selected posters and episode images. The proxy preserves upstream image bytes.
- Retains the 1.5px logo-to-menu gap and existing header/panel behavior.

## Verification
- `node scripts/test-anime-families.mjs`: 6,747 eligible catalogue records, 970 graph families, 3,218 direct relationship links checked; 90 records unavailable in source metadata. The curated Beyblade/Pokémon groups are additional.
- `node scripts/test-anime-catalog-integration.mjs`: Naruto, Attack on Titan, Beyblade and Pokémon search and selectors.
- `node scripts/test-anime-selector-browser.mjs`: selector keeps the franchise URL and plays selected provider ID.
- `node scripts/test-onepiece-arcs.mjs`: all episodes 1–1181 in exactly one group, Wano and Elbaph UI.
- `node scripts/test-v20-header.mjs`: 1.5px at 1280/651/650/400.
- `node scripts/test-account-state-integration.mjs`: real PostgreSQL temporary accounts, concurrent library writes, second-browser settings and account isolation; temporary accounts removed.
- `npm run test:viewer` and `npm run test:genre`: pass. Image proxy test: one upstream image byte-identical to proxy; warm response 7ms in this sandbox (not a production speed guarantee).
- `scripts/test-v19.mjs` remains blocked at the upcoming-anime detail test because AniList rate-limits the upstream and that uncached title is unavailable. It was not a full pass.

## Deployment and data protection
This archive intentionally contains the full `.env` as requested. Keep the Drive file private. These credentials were previously exposed in conversation; rotate them.

Do NOT overwrite the live app's data/states.json or data/user.json with this archive; they contain visitor history/watchlists. Back them up before deployment. Example for an existing install, adjusting paths:

    cp -a /path/to/app/data /path/to/app-data-backup
    unzip kozuTV-V5.4.19-v20-FULL-with-env.zip
    rsync -a --exclude 'data/states.json' --exclude 'data/user.json' moscowtv_v5419/ /path/to/app/
    cd /path/to/app
    npm install --omit=dev
    chmod 600 .env
    node scripts/doctor.mjs
    # Restart your app with your normal process manager.

The database schema initializes automatically. For a fresh install, do not exclude the supplied initial data files. This archive's .env will replace the destination .env, so back it up first if it has changed.
