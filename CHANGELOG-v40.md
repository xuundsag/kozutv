# V40 — partial: provider removal

Removed the EmbedWave provider, fallback, proxy, regional-audio and subtitle integration from active application code. Historical changelogs describe older builds and do not represent active providers. Retired the obsolete test-v5412.mjs which asserted the removed provider; it was not rewritten as a passing test.

Vidwave Hindi remains available only where an upstream playable source is found; MegaPlay remains for Japanese/English where available. Browser tests switched Alya (AniList 162804) and Jujutsu Kaisen to Vidwave after removal. Automated tests did not independently identify spoken language. Other regional anime and some cartoon tracks depended on the removed provider and have not been restored. Four sampled movie/TV provider responses succeeded but supplied no alternative audioStreams; this is not evidence that other language tracks are universally available.

This is not deployed. Captions were out of scope. Rapid watchlist changes can still persist out of order; do not describe this as a completed fix. Vidwave redirect DNS validation still has a lookup/fetch race. Upstream availability can change.
