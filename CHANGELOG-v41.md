# V41 — partial movie and TV audio investigation

- The movie/TV player now shows embedded HLS audio tracks even when separate alternate audio sources also exist. Duplicate language labels are numbered so they can be distinguished.
- Real browser test: The Matrix via VidSrc had three English-labelled HLS tracks; switching the second track worked. The mixed-source browser test uses a synthetic Hindi entry solely to verify the menu; it does not prove an actual Hindi stream.
- Audited 8 movies and 4 TV series across four requested providers, 48 resolutions in total (some requests fail over to another server). Sampled responses had no separate alternate audio streams and no manifest-declared non-English alternative audio. Sources and availability can change. This does not establish universal absence.
- Hindi/Tamil/Telugu movie and TV audio has not been restored. A verified independent multilingual source is still needed. EmbedWave remains removed. Captions were out of scope.
- Removed npm's reference to the retired legacy test that depended on the removed provider. Browser audio tests in scripts require the local server on port 3015.
- Known previous limitation: rapid watchlist updates can still persist out of order. This is not a completed fix. Vidwave URL validation still has a DNS lookup/fetch race.
- Not deployed. Actual .env is included; keep archive private.
