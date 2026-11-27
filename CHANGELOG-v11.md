# kozuTV V5.4.19 — v11

Accounts, a new header, episode reactions, and a database that actually stores them.
The walkthrough video is `kozuTV-v11-walkthrough.mp4` (34 s, every page, signed out and
signed in).

---

## 1. Downloads is gone

The `/downloads` screen is removed, not hidden. Opening the old address now lands on
Browse, and the item is out of the drop-down. The app's own download buttons are
untouched — they never lived on that page.

---

## 2. Header: bookmark out, account in

`.watchlist-link` is deleted. **Watchlist moved into the drop-down**, between Home and
Schedule, so it is still one tap away.

| | before | after |
|---|---|---|
| Header, signed out | bookmark icon | **orange `Sign in` pill** |
| Header, signed in | bookmark icon | **circular Discord avatar** |

The account block is last in the header on both breakpoints (it carries the auto
margin now, so the search box sits beside it rather than shoving it to the left edge).

Tapping the avatar opens a menu with exactly one item: **Log out**. Nothing else.

---

## 3. Sign in with Discord

`/login` is a real screen: **“Login or Register”** as the heading, one big blue
**Authorise with Discord** button, and a one-line note that only the username, avatar
and Discord id are read.

Flow (`discord-auth.js` + routes in `server.js`):

```
GET /api/auth/discord/start     302 -> discord.com/oauth2/authorize (scope: identify)
GET /api/auth/discord/callback  code -> token -> /users/@me -> upsert -> session cookie
GET /api/auth/me                who am I (used by the header)
POST /api/auth/logout           clears the cookie and the session row
```

Details that matter:

- **Only `identify`.** No bot, no guild, no email scope.
- The `state` value is **HMAC-signed and timestamped** rather than stored, so a
  restart never rejects a visitor mid-redirect and an old link cannot be replayed.
- Cancel on Discord's screen returns to `/browse?signin=cancelled` instead of a dead end.
- The session is an **httpOnly `SameSite=Lax` cookie** lasting 30 days. `KOZUTV_SECURE_COOKIES=1`
  adds `Secure`; it is set to `0` in the committed `.env` so local HTTP testing works —
  flip it to `1` in production.
- Discord **avatar and username are re-read on every sign-in**, so a changed avatar or
  renamed account shows up immediately.
- If the credentials are missing the endpoint answers `{configured:false}` and the login
  screen explains itself instead of offering a broken button.

---

## 4. Neon Postgres — accounts, sessions, likes

`db.js` talks to Neon through `pg` against the **pooled** connection string.

```
app_users          id, discord_id (unique), username, global_name, discriminator,
                   avatar, email, created_at, last_seen_at
app_sessions       token (PK), user_id, created_at, expires_at
episode_reactions  (user_id, media_type, media_id, season, episode) -> reaction
```

- Schema is created **idempotently on first query**; there is no migration step.
- The pool is deliberately small (`max: 4`, 15 s idle timeout) because the free plan
  counts connections.
- **Every DB call degrades to `null` instead of throwing.** No database means the site
  runs exactly as it did before: no accounts, no counts, everything else works.
- Nothing on the catalogue or player hot path touches the database. Only three small
  features do, so a busy or exhausted free plan cannot slow the site down.
- No Neon branding anywhere in the UI.

---

## 5. Likes and dislikes, saved in the database

The reaction bar sits **between the player and the episodes**, matching the reference:
two thumb buttons with compact counts (`1.4K`), in a row.

- One grouped query per player open (`/api/reactions?all=1`) rather than one per episode.
- **Counts are public, `mine` is personal** — a signed-out visitor sees the real totals.
- Pressing the same button twice clears the vote; switching buttons swaps it.
- A signed-out click **does not say "no"** — it opens the one-tap sign-in, which is the
  whole reason to have an account.

Verified end to end in a real browser:

```
initial      like=1  pressed=true
after dislike like=0  dislike=1  dislikePressed=true
after un-dislike     dislike=0  pressed=false
after like   like=1  likePressed=true
```

And the API contract: anonymous `GET` returns counts with `mine:0`; anonymous `POST`
returns **401**.

---

## 6. Episode name + description block

Under the player, above the episode list:

- **`E<n>` in orange, then the episode name** — one heading, smaller than the page title.
- The description underneath in small type, **collapsed to three lines with a “Show
  more” toggle that only appears when the text is actually clipped**.
- Movies and anime films drop the number and the top title entirely: the **film's name
  takes the episode-name slot** and its own description goes underneath (verified on
  `/watch/movie/912649` — `#watch-title` is `hidden`, the block reads “Venom: The Last
  Dance”, and there is no Episodes section).
- No comment section, as asked.

---

## 7. AI transcription actually off

The player read the setting as *“anything that is not the string `false` is on”*, and
the settings toggle defaults to `false`. A fresh browser has nothing stored, so it read
`null`, which is not `false`, which meant **on**.

```js
// before
return localStorage.getItem('kozutv-ai-transcription') !== 'false';
// after: only an explicit truthy value enables it
const raw = localStorage.getItem('kozutv-ai-transcription');
if (raw === null || raw === '') return false;
return raw === 'true' || raw === '1' || raw === 'on';
```

Measured with a request listener: **0 calls to `/api/ai-transcription`** on a fresh
profile, and still 0 after the 12-second window in which the player would have fired one.

---

## 8. Performance

Accounts add one tiny call (`/api/auth/me`, cached per request and answered in ~2 ms
from the session table) and the player adds one reaction read. Both are off the
catalogue path, so the v10 numbers hold:

| | before v10 | now |
|---|---|---|
| First video frame (warm) | 7322 ms | **~1.0 s** |
| `/api/play` (anime) | 3917 ms | **~0.95 s** |
| `/api/detail` | 3142 ms | **~510 ms** |

One thing worth calling out: `/api/reactions` was being served from the client's
shared API response cache, so the counts were whatever the first visit saw. Account-
backed answers are now excluded from that cache in **both** directions.

---

## 9. Walkthrough video

`kozuTV-v11-walkthrough.mp4` — 34 s, 400×780, captioned. Recorded by
`scripts/walkthrough.mjs` against the live server, so every frame is the real app:

1. Home / Browse → movie details → anime details
2. Schedule → Upcoming anime → Advanced filters
3. Watchlist (signed out) → old `/downloads` link redirecting to Browse
4. Search results → **Login or Register**
5. Header drop-down (Watchlist in the list)
6. Player, anime — now-playing block, description, reaction row
7. Player, movie — no top title, film name in the slot
8. **Signed in:** avatar in the header → account menu (Log out only)
9. Signed in: like saved → dislike saved
10. Settings with AI Transcription off

---

## 10. Config

`.env` now carries the Neon connection strings, the Discord application, and the
NVIDIA key. What changed vs the shared snippet:

```
DATABASE_URL=...sslmode=verify-full     # silences the pg v9 deprecation and is
DATABASE_URL_POOLED=...sslmode=verify-full   # the strict mode, not 'require'
DISCORD_REDIRECT_URI=https://kozutv.bond/api/auth/discord/callback
KOZUTV_PUBLIC_URL=https://kozutv.bond
KOZUTV_SECURE_COOKIES=1                 # set to 0 for local HTTP
```

> The Discord redirect must be registered on the Discord application exactly as it
> appears in `DISCORD_REDIRECT_URI`. For local testing set
> `DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback` and add the
> same value to the app's redirect list.

Start with `node --env-file=.env server.js` (or `npm start`).

---

## Regression checks

```
node scripts/test-genre-cache.mjs      PASS  (coalescing, LRU, expiry, errors)
node scripts/test-viewer-settings.mjs  ALL V5.4.12 VIEWER QA PASSED
```

The viewer test asserted the old header bookmark; it now asserts the new contract —
`.watchlist-link` absent, `#account-slot` present, `Watchlist` **in** the drop-down.
