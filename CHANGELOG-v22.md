# V22 — full-width watch descriptions

Watch-page descriptions now use the available viewport width before naturally wrapping, rather than being capped at 78 characters and the 1080px player wrapper. Player remains centered with its existing size constraints; standard page padding remains. Detail-page descriptions also no longer have an 860px cap. Long unbroken words may wrap to prevent horizontal overflow. Clicking the watch description expands/collapses it, even when the player has not loaded.

Verified using browser screenshots and text-line measurements at 390, 844, 1280, and 1920px, and v21 player-fit, rapid-reaction, and header tests. The screenshot uses a mocked title/stream for repeatability. Service worker is kozutv-v6; v21 essential-only storage policy remains in place.

Production was not deployed. This archive contains real credentials in .env; keep it private. Back up live data and destination .env before deploying; protect data/states.json and data/user.json from overwriting. See CHANGELOG-v21.md for deployment safety and preceding changes. If retaining the destination .env, exclude it too.
