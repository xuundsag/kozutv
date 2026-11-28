# Shoul Studio

A **CapCut-style, server-side video editor** for the web. Everything — decoding, compositing,
effects, text rendering, audio mixing and encoding — happens **on your server**. The browser is
just a remote control, so it runs smoothly on any phone (designed for 360px screens first, zero
overlaps, compact bottom-sheet UI).

Includes the original **brat green-screen lyric generator** at `/brat`.

---

## Features

**Editing**
- Multi-track timeline: main video, overlays, stickers, text, audio
- Split / duplicate / delete / nudge clips, drag-free compact controls
- Server-rendered preview of every frame; playhead scrubbing + playback

**Media**
- Upload video / images / audio (probed with ffprobe, thumbnails auto-generated)
- Speed (0.5x–3x), volume, mute, fit (cover / contain / stretch), crop, flip
- **Chroma key (green screen)** on video *and* images, similarity + blend controls
- **Background removal** tool for photos (corner-sampling key + feathered alpha)

**Looks**
- 14 filter presets (Vivid, Mono, Noir, Fade, Warm, Cyberpunk, Dreamy, Vintage, …) + manual
  brightness / contrast / saturation / hue / blur / vignette
- 15 post effects: Glitch, RGB Split, VHS, Scanlines, Grain, Vignette, Pixelate, Zoom Pulse,
  Shake, Chroma Cycle, Duotone, Soft Glow, Mirror, Strobe, Old Film — with intensity sliders
- 10 transitions: fade, dip to black/white, slide L/R, zoom punch, wipe, blur dissolve

**Text & lyrics**
- 27 bundled Google Fonts (Anton, Bebas, Montserrat, Poppins, Inter, Playfair, Lobster,
  Permanent Marker, Bangers, Press Start 2P, …) registered server-side
- 16 caption/lyric presets including **brat**, TikTok Bold, Karaoke (word-by-word), Neon,
  Meme, Subtitle, Gradient, Quote, Typewriter, Bounce, Wobble
- Per-word animations, strokes, shadows, background boxes, letter-spacing, gradients

**Stickers** — 156 bundled PNGs (110 OpenMoji emoji + 46 hand-built badges/shapes/frames),
all 512×512, with pop / pulse / shake / spin / float / bounce / wobble / flash animations.

**Audio** — bundled royalty-free loops & SFX (synthesized: lofi, trap 808, EDM, synthwave,
cinematic riser, pluck, corporate pop + whoosh/pop/ding/boom/riser/tape-stop/click/camera),
plus your own music/voiceover. Mixes every audible source (video audio + music tracks) into
one AAC track with fades and per-clip speed/volume.

**Templates** — 10 ready-made projects: brat lyrics, karaoke lyrics, vlog intro, product
promo, gaming glitch, quote post, birthday blast, meme caption, podcast clip, green-screen
cutout demo.

**Export** — MP4 (H.264 + AAC, faststart), WebM (VP8), GIF (palettegen/paletteuse) at
1080p / 720p / 480p, 24 or 30 fps. 9:16, 1:1, 4:5 and 16:9 all verified pixel-exact by the
test suite. Jobs run through a queue with progress, cancel and download endpoints.

---

## Architecture

```
public/            editor UI (vanilla JS, no build step)  +  /brat standalone page
server/
  index.js         express app, font registration, static + /api
  routes.js        REST: media, projects, frames, jobs, tools
  store.js         JSON-file project & media registry (data/)
  media.js         uploads, probe, thumbs, background removal
  catalog.js       fonts/filters/effects/presets/stickers catalog
  bin.js           ffmpeg/ffprobe resolution (env → npm → PATH)
  renderer/
    compositor.js  frame compositor (the heart)
    sources.js     streaming ffmpeg rawvideo decoder + bitmap cache
    text.js        text engine (wrapping, karaoke, typewriter, per-word anims)
    effects.js     pixel effects (Skia-safe snapshot pipeline)
    audio.js       ffmpeg filter_complex audio mix graph
    export.js      job queue: frames → stdin pipe → encoder
assets/            generated: fonts, stickers, sounds, samples, templates
scripts/
  build-assets.mjs downloads/builds all bundled assets
  synth_sounds.py  numpy music/SFX synthesizer
  test.mjs         66-check integration test suite
```

Frame pipeline: for each frame, video clips stream decoded rawvideo from their own ffmpeg
process (seek + fps resample), images come from an LRU bitmap cache, everything is composited
on Skia (@napi-rs/canvas), piped as RGBA to a single ffmpeg encoder. Audio is mixed by a
generated `filter_complex` graph (atrim → atempo → volume → afade → adelay → amix).

## Run on your VPS

```bash
# 1. get the code (zip from Google Drive, or git clone)
cd shoul-studio

# 2. install
npm install          # express, sharp, @napi-rs/canvas + optional ffmpeg-static/ffprobe-static
npm run assets       # fonts, stickers, sounds, samples, templates (needs internet once)

# 3. ffmpeg — any ONE of these works:
#    apt install ffmpeg            (system binary)
#    npm i ffmpeg-static ffprobe-static   (bundled binaries)
#    or point env vars at existing binaries

# 4. start
node server/index.js          # PORT=3000 HOST=0.0.0.0 by default
```

Env vars: `PORT`, `HOST`, `DATA_DIR`, `UPLOAD_DIR`, `RENDER_DIR`, `DERIVED_DIR`,
`MAX_UPLOAD_MB` (default 800), `FFMPEG_PATH`, `FFPROBE_PATH`, `PREVIEW_W`.

Put it behind nginx/Caddy for TLS. All state lives in `data/`, `uploads/`, `renders/`,
`derived/` — back those up (or mount them on a volume) and you can wipe the rest.

## Tests

```bash
FFMPEG_PATH=… FFPROBE_PATH=… node scripts/test.mjs
```
66 checks: catalog completeness, sticker resolution audit (all ≥512px, none broken),
upload/probe/thumbs, bg-removal alpha, all 10 template renders, layered composition frames,
**export matrix across all 4 aspect ratios**, mp4/gif/webm/preview formats, download endpoint,
UI delivery.

## Credits

- Fonts: Google Fonts (OFL) via @expo-google-fonts packages
- Emoji stickers: OpenMoji v17 (CC BY-SA 4.0) — openmoji.org
- brat look: fan-made homage to Charli XCX's *brat* aesthetic (#8ACE00, stretched Arial-style)
- Music/SFX: original synthesized audio (this repo, public domain)

Not affiliated with Charli XCX or Atlantic Records.
