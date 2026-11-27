# GitHub / Vercel deployment

## Imported source

Imported from the owner's Google Drive archive
`kozuTV-V5.4.19-v43-PARTIAL-with-env.zip` (root directory `moscowtv_v5419`).
The archive's original release notes and staging warnings are retained. This is
not a claim that the partial release or all third-party providers passed QA.

## Vercel

- Entry point: `api/index.js`, forwarding to the original Node request handler.
- Runtime: Node 22. `vercel.json` sends application routes to that handler and
  explicitly bundles public assets, catalogue snapshots and Riva protobuf files.
- Installation: `npm ci --omit=dev`.
- The FFmpeg binary is installed from npm using `@ffmpeg-installer/ffmpeg` rather
  than a separate GitHub download in the `ffmpeg-static` postinstall hook.
- Writable files use `/tmp/kozutv-data` on Vercel. Catalogue files remain in the
  read-only application bundle. Standalone Node installations still use `data/`.
- **Temporary data is not persistent or shared between Vercel instances.** Guest
  history, guest watchlists, recovery tokens, in-memory rate limits and caches
  have this limitation. Signed-in account storage uses the configured Postgres
  database. For durable guest state, use an external store or a persistent Node
  host; configuring unused S3 variables does not enable that functionality.
- Long playback/proxy requests remain subject to Vercel's duration, payload and
  bandwidth limits. Browser-based providers need a separately installed browser;
  this deployment does not bundle Chromium. Verify each provider independently.

## Environment configuration

Secrets are stored only in the project's encrypted Vercel environment variables.
The original `.env` and Drive ZIP are excluded from Git and deployment output.
The original hard-coded webhook was moved to `DISCORD_WEBHOOK_URL`.

All supplied variables except `PORT` were copied to Vercel; `PORT` is managed by
the host. A private `MEDIA_PROXY_SECRET` was added so signed media links can be
validated across serverless instances. Keep it unchanged across redeployments.
Neon Auth, S3 and realtime variables are preserved but are not used by this app.

`KOZUTV_PUBLIC_URL` and `DISCORD_REDIRECT_URI` use the project's existing URL:

```
https://kozutv.vercel.app
https://kozutv.vercel.app/api/auth/discord/callback
```

**Add the exact callback URL to the Discord application's OAuth2 redirect list.**
The archive used `kozutv.bond`, which is not currently linked to this project.
If moving to that domain, configure its Vercel/DNS mapping and update both these
variables and Discord's allowed redirects before redeploying.

## GitHub integration fallback

The connected Vercel account has no GitHub account linked, so Git-sourced deploys
are rejected. A small uploaded build package can fetch the public repository at
an exact commit and produce Vercel Build Output API v3 output instead. The build
script is preserved as `scripts/vercel-build-from-github.mjs`; run it only in a
disposable build directory. The initial deployment pins application commit
`aada2163a20c67a51e8706971fc67120c3453876`.

Automatic deployment on GitHub pushes is **not enabled**. Link GitHub in Vercel
and import this repository to enable that workflow. The source branch is
`arena/56f1fe70-kozutv`; `main` remains unchanged until its pull request is merged.

Vercel deployment protection is enabled on the existing project. A protected URL
requires the owner's Vercel login; make the project public in its deployment
protection settings if anonymous visitors should have access.

## Verification

```
npm ci --omit=dev
node --check server.js
node scripts/test-vercel.mjs
npm run test:genre
npm run test:dubs
node scripts/test-anime-families.mjs
```

`test-vercel` runs without real credentials or external API calls and verifies
the handler, temporary storage, homepage, SPA routes and signed-out account API.
Browser-based tests require a Playwright Chromium installation. Authentication,
remote database connectivity, AI billing and upstream playback need separate
end-to-end checks; the restricted development sandbox cannot verify those hosts.
