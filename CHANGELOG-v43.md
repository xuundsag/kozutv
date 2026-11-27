# V43 — partial report follow-up

Private reports were read from the configured database; records were not deleted or changed.
- Reverted anime Hindi selection to pre-Vidwave behavior: MegaPlay for Japanese/English and previously implemented EmbedWave-backed regional anime resolver, including special cartoon handling. Vidwave is no longer selectable or used by the app for anime. Verified actual browser switching and playback of Hindi-labelled episode 1 for Alya, Naruto, Jujutsu Kaisen. Automated tests rely on upstream labels; spoken language and correct cut not independently confirmed. Availability is not universal.
- Replaced More like this sparkles heading icon with an overlapping cards/play icon; browser verified 12 recommendation cards and actual icon rendering.
- Infinity War Hindi hardcoded-subtitle report remains unresolved: sampled four positions on a current Hindi-labelled EmbedWave stream with player text tracks off, without seeing subtitles in those frames. This is not proof the stream has none. Need reported timestamp, screenshot and source to reproduce; permanently burned-in text cannot be resized or disabled by the player.
- EmbedWave movie/TV support and V42 quality ranking retained. Corrected OTT provider list via reverting the app to pre-Vidwave behavior.
- Not deployed. .env is included: keep private. Existing restored provider probing has network/SSRF security risk; harden it before public deployment. Existing rapid watchlist writes can persist out of order.
