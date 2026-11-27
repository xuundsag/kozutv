# kozuTV V5.4.13

kozuTV is a responsive anime, movie and series browser with a custom Video.js player and same-origin media proxy.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`. `Screenshot-V5.4.13.html` is an offline guide to this update; the base release's `Screenshot.html` retains the V5.4.12 gallery. To use another port, run `PORT=8080 npm start`. Some optional provider fallbacks use Playwright; if prompted, install Chromium with `npx playwright install chromium`.

Run `npm test` for the isolated token, genre-cache, viewer, V5.4.12 feature and V5.4.13 AI-caption regressions. Browser checks use Playwright Chromium (install it with `npx playwright install chromium` if needed). They use temporary data, mocks and no NVIDIA key, and do not touch saved data. Individual commands are `npm run test:token`, `npm run test:viewer`, `npm run test:genre`, `npm run test:feature` and `npm run test:ai`.

## V5.4.13 update notes (build 5.4.13c)

### Configuration

`.env` in the project root is loaded at startup and is **not** overridden by variables already set in the environment:

```
PORT=3000
MONGODB_URI=mongodb+srv://user:password@cluster0.example.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=kozutv
MONGODB_COLLECTION=cache_token_store
NVIDIA_API_KEY=...
```

Quote values that contain `#`. The release ZIP is built with the real `.env` **inside it** at your request; that file holds the NVIDIA key and the database password, so treat the archive as a secret, do not publish it, and rotate both credentials if it is shared. `.env.example` shows the same keys with placeholders. `.env` is listed in `.gitignore`.

- **Cache Token backup in MongoDB.** Tokens, encrypted display values and preferences are written to one MongoDB document as well as the local files. If `data/cache-tokens.json` or `data/cache-token.key` is deleted, the next start restores both from MongoDB and existing tokens keep working. Configure with `MONGODB_URI` (and optionally `MONGODB_DB` and `MONGODB_COLLECTION`) in `.env`; the server loads `.env` at startup. MongoDB is never required: without a reachable database the app keeps using the local files and retries in the background. The MongoDB document contains the same encrypted values and the separate key, so treat database access as equivalent to file access.
- **Anime Japanese audio uses MegaPlay's English subtitle only.** With AI Transcription on, the automatic anime subtitle is a real English subtitle track from MegaPlay, never an AI transcript; Indian-language tracks keep their AI transcript and Roman option. An extra **Japanese** AI caption can be picked by hand, is never activated automatically, and no AI request runs until you choose it. When MegaPlay returns no English subtitle for an episode (as with Perman episode 2, whose provider lists none), nothing is auto-selected and the AI Japanese option is the only caption available; no English text is fabricated.
- **Rating badge edge is thinner.** The white offset behind the orange rating badge is now 1 pixel instead of 2.
- Settings keeps the dismissible AI transmission notice that was removed from the caption menu in build 5.4.13b.

## V5.4.13 update notes (build 5.4.13b)

- **Removed the extra line under the AI caption choices.** The Hindi/Hinglish or Bengali/Benglish menu now lists only Off and the available tracks. The notice that AI captions send audio to NVIDIA moved to **Settings**, beneath **AI Transcription**, and can be dismissed; it appears again only after Reset preferences.
- **The app is named kozuTV everywhere.** Browser preference keys, the video element id and related identifiers now use `kozutv-*` instead of the legacy `moscowtv-*` names. Preferences saved by an earlier version are copied to the new keys once on first load and keep their values, so playback and language settings survive. Cache Token records that still contain `moscowtv-*` entries remain readable; new changes are saved under `kozutv-*`. The visitor cookie was already `kozutv_visitor`.

## What’s new in V5.4.13

**Source provenance:** Existing third-party providers remain available as requested, but they do not establish whether each audio recording is an official dub. The resolver rejects some sources explicitly marked fan, unofficial or AI dub; an unmarked source is not proof of an official recording. Language labels describe provider metadata, not verified provenance, and this release does **not** guarantee official-only audio.

- When **AI Transcription** is enabled, subtitle choices follow the selected spoken audio. Hindi offers Hindi and Hinglish; Bengali offers Bengali and Benglish. The Latin options are automatic transliterations, not translations, and can be awkward. Unknown track languages and ambiguous embedded multi-audio playlists are not guessed.
- On supported, unencrypted, non-byte-range HLS, the server extracts short audio windows and sends them to NVIDIA's hosted speech service. Parakeet provides estimated word timestamps for supported languages; NVIDIA Whisper is used for Bengali, Tamil, Telugu and several others but supplies no word timestamps here. Whisper captions have **approximate four-second timing**, may repeat or hallucinate, and should not be treated as an accurate transcript. Model availability, language support and provider HLS formats can change. MP4, encrypted, low-latency and byte-range HLS are not supported by this transcription path.
- Captioning prefetches the next 12-second window, follows seeking and source changes, cancels stale work, and falls back to matching existing captions when available if AI fails. If an obvious Latin-versus-non-Latin script conflict suggests the source label may be wrong, captions are turned off with a warning instead of automatically choosing a possibly mismatched fallback. This narrow heuristic cannot verify language or source provenance and can miss mismatches or flag legitimate code-switching. The AI display is biased 0.18 seconds early relative to returned timestamps; network latency, recognition errors or a newly started/seeked window may still cause late or missing text. Use player **Subtitle Settings → Sync Timing** to adjust. Existing subtitle files remain available when AI Transcription is off. AI output is a transcript of speech, not translated subtitles or an official dub.
- **Privacy and consent:** The setting is on by default; audio is sent to NVIDIA only while AI captions are active. Anime subtitles may be activated automatically or restored from a previous caption preference. A dismissible notice under Settings → AI Transcription identifies the external transmission; since build 5.4.13b it is no longer shown inline in the caption menu. Turn the setting off to use matching existing captions without sending audio for AI transcription. Review NVIDIA's terms and your rights to transmit the material. The application keeps a small five-minute in-memory transcript cache; it does not intentionally write extracted audio to disk.
- Anime spotlight mobile artwork uses visually matched higher-resolution TMDB images where available and falls back to the bundled artwork if an image fails. External art remains subject to the rights holders' terms.

### Configure NVIDIA transcription

Node.js 20+ and outbound access to `grpc.nvcf.nvidia.com:443` are required. `npm install` downloads the platform-specific `ffmpeg-static` binary; installation requires network access and a supported platform. Store the NVIDIA API key **outside** the project and all archives, either in `NVIDIA_API_KEY`, in a file named by `NVIDIA_API_KEY_FILE`, or in `~/.config/kozutv/nvidia-nim.key` (the default). Restrict the secret file to the server account, for example `chmod 600 ~/.config/kozutv/nvidia-nim.key`; do not put the key in the browser, source control, command history or a release. Restart the server after changing environment configuration. If no key is available or transcription fails, the player falls back to matching existing captions when possible.

This endpoint has no account-level authorization. Same-origin checks and limits mitigate some abuse but are not authentication. Put an authenticated, trusted reverse proxy and a spending alert/budget in front of any public deployment. Default request caps are **1,800 per socket IP per hour** and **6,000 globally per hour**; `AI_MAX_PER_IP_HOUR` and `AI_MAX_GLOBAL_HOUR` may adjust them (1–50,000). Behind a proxy all visitors may share one socket IP. These counts include failed and cached requests. Higher limits can substantially increase NVIDIA usage and cost. Forty independent viewers requesting one new window every 12 seconds need roughly **12,000 endpoint requests/hour**, before retries and seeks; the defaults do not support that for an hour.

Riva protocol files and license notices are in `riva/proto` and `THIRD-PARTY/`; gRPC and its loader use Apache 2.0, Sanscript uses MIT, and `ffmpeg-static` and its downloaded binary carry GPL-family notices. FFmpeg source and build information: https://github.com/eugeneware/ffmpeg-static and https://johnvansickle.com/ffmpeg/ . Check all applicable dependency and media-rights obligations before redistribution.

## What's new in V5.4.12

- Genres were removed from the main navigation dropdown only. The genre selector remains in Advanced Filters. Browse row names now open the corresponding genre or collection; the separate See all links are gone. A Spotlight title opens its details.
- Spotlight supports animated mouse and touch swipes: **left goes to the previous item**, and **right goes to the next**. Dots and the Spotlight autoplay setting still work; app and operating-system reduced-motion preferences remove the slide animation.
- Anime tries the requested or preferred audio, then English, then Japanese, silently. Source and media failures are both considered. When an anime has incompatible episode orders, moving to a different catalog starts that catalog at episode 1 without a confirmation or a guessed episode match. Automatic fallback does not overwrite the saved preference. If all attempts fail, the player shows a retryable playback error rather than a misleading language label.
- **Preferred Movies/Series Audio** sits directly under Preferred anime audio in Settings. Available audio sources or tracks are matched to that preference, then English and Japanese; if none matches, the original source stays selected. Original / default preserves source behavior. Older player audio preferences are honored until the new selector is explicitly changed. The player and URL identify the actual selected server and audio, including after a failure. Source switching retains position, captions and play state where possible.
- Settings save immediately, without a Saved message or the token-generation reminder. The new preference is synchronized through Cache Token and cleared by Reset preferences, without removing the token, history or watchlist.
- Individual genre pages load more titles on scroll and recycle off-screen cards. A bounded browser cache and a ten-minute, size-limited server cache coalesce duplicate requests and limit parallel catalog fetches. Results stop when exhausted; they do not loop. TMDB limits each genre query to its first 500 pages, with local anime results continuing as available.

## Previously in V5.4.11

- New in 2026 and the Hindi, Tamil and Telugu Dubbed collections appear as shuffled Browse rows, not in Explore or the genre dropdown. The dubbed collections and Language & sources use a headphones icon; Playback has its own screen-and-play icon.
- Dub-detection notices are no longer shown. The episode-order confirmation introduced for incompatible regional and Japanese/English catalogs was replaced by silent episode-one switching in V5.4.12.
- Viewer settings now include **Seek interval** (5, 10, 15 or 30 seconds for the arrow/J/L keys and player double taps), **Resume playback**, **Save watch history**, **Spotlight autoplay** and **Reduce motion**. Defaults preserve the previous behavior. Turning off history stops new progress writes from that browser without deleting previous history or the watchlist; other open browsers apply a synced change when they refresh, regain focus, or poll. Turning off resume starts the selected episode at the beginning. Manual spotlight dots remain usable when autoplay is off. Reduce motion minimizes page and player animations.
- The new preferences are saved locally, synchronized using Cache Token, and included when resetting preferences. Existing history, watchlist and the token are not deleted by reset.

## Previously in V5.4.10

- The Settings gear is fixed, and the individual setting descriptions have been removed.
- Cache Token links a browser to its existing kozuTV watchlist, viewing history, and app-owned playback, audio, subtitle, quality and other preferences. See the restore and privacy notes below.
- Hindi Dubbed, Tamil Dubbed and Telugu Dubbed were moved into randomized Browse rows alongside the other categories.

## Cache Token

1. In Settings, choose **Generate Token**, then copy and save the six-character code. The copy icon is available in the current page session; after reloading, the visible token is locked and the two buttons are disabled.
2. On another browser using **the same kozuTV server**, enter that code and choose **Set Token**. The token's saved watchlist, history and app-owned preferences replace this browser's current kozuTV data. Changes are saved to the shared profile; preferences are restored on load and refreshed when the page regains focus.
3. To use a different token on a browser, manually clear this site's data, including **both cookies and local storage**, and reload. Reset preferences does not remove or change the token.

The token identifies data stored on this kozuTV server; six characters cannot contain the data itself. Preserve and back up `data/states.json`, `data/cache-tokens.json` and `data/cache-token.key` together when upgrading or moving the server. The release archive omits runtime user and token files; the server creates fresh ones on first run, so extracting an update does not overwrite existing runtime data. If these files are lost, the token cannot restore that server's data. This feature covers kozuTV's stored history, watchlist and app-owned browser preferences, not the browser's entire cache, passwords, downloads, or data belonging to other sites.

**Privacy:** A six-character token has limited strength. Anyone who knows or guesses it can access the associated history, watchlist and preferences. Keep it private and do not use it for sensitive information. Online attempts are rate-limited, but this is not a substitute for a secure account.

## Previously in V5.4.9

- Pokémon has a region/series selector from Kanto through Horizons, provider-aware episode titles and artwork, and chronological next/previous navigation. The normal Journeys path moves to *To Be a Pokémon Master* after episode 136 rather than repeating the overlapping episodes. Direct links to the overlapping Journeys episodes still work. The provider currently skips Sun & Moon episode 6; navigation skips that gap.
- Doraemon's Indian-broadcast first season has 52 episode titles and corresponding stills. Perman and Shin-chan have additional episode metadata; episode stills are used where matched, and unknown titles or images fall back rather than borrowing an unrelated episode. Shin-chan's regional provider does not consistently follow broadcast numbering, so only checked matches are named.
- Language and direct-quality changes are committed only after the new source loads. Where possible, playback position, play/pause state, fullscreen, and a matching caption selection are retained. A failed switch attempts to restore the previous source; an unrecoverable failure remains visible. An unavailable language is not silently relabeled as another.
- Shin-chan and Doraemon's regional broadcasts and Japanese/English catalogs use different episode orders. Switching between them opens episode 1 of the other catalog; since V5.4.12 it does this silently and does not pretend to find an equivalent episode.
- The Browse page automatically loads shuffled genre and collection rows as you scroll, and recycles off-screen cards while preserving scroll position. Explore is collapsible; V5.4.12 removes Genres from the menu while keeping Advanced Filters.
- A Settings page saves playback, language, quality, speed and source preferences on this device. Reset clears those preferences and player caption/audio settings, not the watchlist or history. Artwork falls back to show art or a neutral placeholder when an episode image fails.
- Search and navigation ignore stale requests, and changing sources refreshes the available quality and subtitle lists.

**Availability and accuracy:** Providers and subtitle catalogs are external and may change or fail. Dubs, captions, image matches, and particular resolutions are not guaranteed for every title or episode. Dub collections are curated from observed tracks, not a guarantee of availability for an entire series. Some sources use different cuts or contain embedded watermarks or advertising. Unknown episode names are deliberately left generic. Automatic subtitle alignment is best-effort; use the player's sync control if a release differs. Pokémon's first episode has a sampled Hindi source; that does not imply all Pokémon episodes have Hindi audio.

The app offers VidCore, EmbedWave, CineSrc, VidLink and VidSrc for movies and series. EmbedWave may provide extra language tracks when available. Anime uses MegaPlay for Japanese/English and EmbedWave regional sources for Hindi and other languages where available. Player features include subtitle controls, playback speed, picture-in-picture, seek previews and quality choices when provided by the source.

Watchlist and history are stored per visitor in `data/states.json`; a fresh installation starts with an empty state. Device preferences are stored in the browser and are synchronized to the shared profile after a Cache Token is set. See [data/ATTRIBUTION.md](data/ATTRIBUTION.md) for episode-data and artwork sources, and the included license files for third-party software and fonts.
