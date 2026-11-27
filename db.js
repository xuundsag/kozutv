// Imported first on purpose: it fills process.env from .env before this module reads it.
// (In an ES module every `import` is evaluated before the statements around it, so a
// loader run by the entry script would come too late for the constant below.)
import './load-env.js';
// Neon Postgres — accounts, Discord links and reactions.
//
// The database is used only for things that must outlive a browser and follow a
// person between devices: who signed in, which Discord account they linked, and
// which episodes they liked or disliked. Catalogue traffic and the player's hot
// path never touch it, so a slow or exhausted free plan can only ever affect
// these three small features.
//
// Every entry point degrades instead of throwing: if DATABASE_URL is missing or
// the pool cannot reach Neon, `db()` answers null and the callers fall back to
// their in-memory behaviour. The app keeps working signed-out, exactly as before.

import crypto from 'node:crypto';

let pg = null;
try {
  const mod = await import('pg');
  pg = mod.default || mod;
} catch {
  // pg is optional. Without it the site runs with no accounts at all.
}

const connectionString = String(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || '').trim();
const enabled = Boolean(pg && connectionString);

let pool = null;
function db() {
  if (!enabled) return null;
  if (pool) return pool;
  try {
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      // The free plan counts connections, so the pool stays deliberately small
      // and idle clients are dropped quickly.
      max: 4,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 6_000,
      allowExitOnIdle: true
    });
    pool.on('error', () => {});
  } catch {
    pool = null;
  }
  return pool;
}

export const databaseEnabled = () => enabled;

// ---------------------------------------------------------------- schema
// One idempotent bootstrap. It runs once per process and is awaited by the first
// query, so nothing else has to think about migrations.
let schemaReady = null;
function ensureSchema() {
  const p = db();
  if (!p) return Promise.resolve(false);
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    try {
      await p.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id            TEXT PRIMARY KEY,
          discord_id    TEXT UNIQUE NOT NULL,
          username      TEXT NOT NULL DEFAULT '',
          global_name   TEXT NOT NULL DEFAULT '',
          discriminator TEXT NOT NULL DEFAULT '',
          avatar        TEXT NOT NULL DEFAULT '',
          email         TEXT NOT NULL DEFAULT '',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS app_sessions (
          token       TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at  TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
        CREATE TABLE IF NOT EXISTS app_user_state (
          user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
          state JSONB NOT NULL DEFAULT '{"watchlist":[],"history":[],"settings":{}}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS user_reports (
          id BIGSERIAL PRIMARY KEY,
          experienced TEXT NOT NULL,
          episode_season TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS episode_reactions (
          user_id     TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          media_type  TEXT NOT NULL,
          media_id    TEXT NOT NULL,
          season      INTEGER NOT NULL DEFAULT 1,
          episode     INTEGER NOT NULL DEFAULT 1,
          reaction    SMALLINT NOT NULL,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, media_type, media_id, season, episode)
        );
        CREATE INDEX IF NOT EXISTS episode_reactions_target_idx
          ON episode_reactions(media_type, media_id, season, episode);
        CREATE TABLE IF NOT EXISTS episode_reaction_baseline (
          media_type  TEXT NOT NULL,
          media_id    TEXT NOT NULL,
          season      INTEGER NOT NULL DEFAULT 1,
          episode     INTEGER NOT NULL DEFAULT 1,
          likes       INTEGER NOT NULL DEFAULT 0,
          dislikes    INTEGER NOT NULL DEFAULT 0,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (media_type, media_id, season, episode)
        );
      `);
      return true;
    } catch {
      schemaReady = null;
      return false;
    }
  })();
  return schemaReady;
}

// Thin wrapper: every caller gets null instead of an exception.
async function q(text, params) {
  if (!(await ensureSchema())) return null;
  try {
    return await db().query(text, params);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- users
const AVATAR_BASE = 'https://cdn.discordapp.com';

export function discordAvatarUrl(user, size = 128) {
  const id = String(user?.discord_id || user?.discordId || '');
  const hash = String(user?.avatar || '');
  if (!id) return '';
  if (!hash) {
    // Default Discord avatar: index is (id >> 22) % 6 for the modern set.
    let idx = 0;
    try { idx = Number((BigInt(id) >> 22n) % 6n); } catch { idx = 0; }
    return `${AVATAR_BASE}/embed/avatars/${idx}.png`;
  }
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `${AVATAR_BASE}/avatars/${id}/${hash}.${ext}?size=${size}`;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username || '',
    globalName: row.global_name || '',
    name: row.global_name || row.username || 'Viewer',
    discriminator: row.discriminator || '',
    avatar: discordAvatarUrl(row),
    hasCustomAvatar: Boolean(row.avatar)
  };
}

export async function upsertDiscordUser(profile) {
  const discordId = String(profile?.id || '').trim();
  if (!discordId) return null;
  const username = String(profile?.username || '').slice(0, 80);
  const globalName = String(profile?.global_name || '').slice(0, 80);
  const discriminator = String(profile?.discriminator || '0').slice(0, 8);
  const avatar = String(profile?.avatar || '').slice(0, 120);
  const email = String(profile?.email || '').slice(0, 200);
  const res = await q(
    `INSERT INTO app_users (id, discord_id, username, global_name, discriminator, avatar, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (discord_id) DO UPDATE SET
       username = EXCLUDED.username,
       global_name = EXCLUDED.global_name,
       discriminator = EXCLUDED.discriminator,
       avatar = EXCLUDED.avatar,
       email = EXCLUDED.email,
       last_seen_at = now()
     RETURNING *`,
    [crypto.randomUUID(), discordId, username, globalName, discriminator, avatar, email]
  );
  return res?.rows?.[0] || null;
}

export async function createSession(userId, days = 30) {
  const token = crypto.randomBytes(32).toString('base64url');
  const res = await q(
    `INSERT INTO app_sessions (token, user_id, expires_at)
     VALUES ($1,$2, now() + ($3 || ' days')::interval)
     RETURNING token, expires_at`,
    [token, userId, String(days)]
  );
  return res?.rows?.[0] ? token : null;
}

export async function userForSession(token) {
  if (!token) return null;
  const res = await q(
    `SELECT u.* FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()
      LIMIT 1`,
    [token]
  );
  return res?.rows?.[0] || null;
}

export async function deleteSession(token) {
  if (!token) return false;
  const res = await q(`DELETE FROM app_sessions WHERE token = $1`, [token]);
  return Boolean(res);
}

export async function pruneSessions() {
  await q(`DELETE FROM app_sessions WHERE expires_at <= now()`);
}

// ---------------------------------------------------------------- reactions
// A reaction is +1 (like), -1 (dislike) or 0 (cleared). Counts are aggregated in
// a single grouped read so opening a player costs one round trip, not one per
// episode.
export async function setReaction({ userId, mediaType, mediaId, season = 1, episode = 1, reaction }) {
  const value = Number(reaction);
  if (!userId) return null;
  if (value === 0) {
    const result = await q(
      `DELETE FROM episode_reactions
        WHERE user_id=$1 AND media_type=$2 AND media_id=$3 AND season=$4 AND episode=$5`,
      [userId, mediaType, mediaId, season, episode]
    );
    return result ? 0 : null;
  }
  if (value !== 1 && value !== -1) return null;
  const res = await q(
    `INSERT INTO episode_reactions (user_id, media_type, media_id, season, episode, reaction)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, media_type, media_id, season, episode)
     DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = now()`,
    [userId, mediaType, mediaId, season, episode, value]
  );
  return res ? value : null;
}

export async function reactionSummary({ mediaType, mediaId, season = 1, episode = 1, userId = null }) {
  const res = await q(
    `SELECT
       COUNT(*) FILTER (WHERE r.reaction = 1)  AS likes,
       COUNT(*) FILTER (WHERE r.reaction = -1) AS dislikes,
       MAX(CASE WHEN r.user_id = $5 THEN r.reaction END) AS mine,
       MAX(b.likes)    AS base_likes,
       MAX(b.dislikes) AS base_dislikes
     FROM episode_reactions r
     FULL OUTER JOIN episode_reaction_baseline b
       ON b.media_type = r.media_type AND b.media_id = r.media_id
      AND b.season = r.season AND b.episode = r.episode
     WHERE COALESCE(r.media_type, b.media_type) = $1
       AND COALESCE(r.media_id,   b.media_id)   = $2
       AND COALESCE(r.season,     b.season)     = $3
       AND COALESCE(r.episode,    b.episode)    = $4`,
    [mediaType, mediaId, season, episode, userId]
  );
  const row = res?.rows?.[0] || {};
  return {
    likes: Number(row.likes || 0) + Number(row.base_likes || 0),
    dislikes: Number(row.dislikes || 0) + Number(row.base_dislikes || 0),
    mine: Number(row.mine || 0)
  };
}

// Whole-season map in one query, so the episode list can show counts next to
// every row without N calls.
export async function reactionMapForSeason({ mediaType, mediaId, season = 1, userId = null }) {
  const res = await q(
    `SELECT episode,
       COUNT(*) FILTER (WHERE reaction = 1)  AS likes,
       COUNT(*) FILTER (WHERE reaction = -1) AS dislikes,
       MAX(CASE WHEN user_id = $5 THEN reaction END) AS mine
     FROM episode_reactions
     WHERE media_type=$1 AND media_id=$2 AND season=$3
     GROUP BY episode`,
    [mediaType, mediaId, season, userId]
  );
  const map = new Map();
  for (const r of res?.rows || []) {
    map.set(Number(r.episode), {
      likes: Number(r.likes || 0),
      dislikes: Number(r.dislikes || 0),
      mine: Number(r.mine || 0)
    });
  }
  // Fold in the synthetic audience so the episode list shows the same numbers
  // the episode's own reaction bar does.
  const base = await q(
    `SELECT episode, likes, dislikes FROM episode_reaction_baseline
      WHERE media_type=$1 AND media_id=$2 AND season=$3`,
    [mediaType, mediaId, season]
  );
  for (const b of base?.rows || []) {
    const key = Number(b.episode);
    const cur = map.get(key) || { likes: 0, dislikes: 0, mine: 0 };
    cur.likes += Number(b.likes || 0);
    cur.dislikes += Number(b.dislikes || 0);
    map.set(key, cur);
  }
  return map;
}

// Fixed ranges for the synthetic audience each episode carries.
export const BASELINE_RANGES = { likes: [247, 2600], dislikes: [20, 78] };

export function randomBaseline(rnd = Math.random) {
  const pick = ([lo, hi]) => lo + Math.floor(rnd() * (hi - lo + 1));
  return { likes: pick(BASELINE_RANGES.likes), dislikes: pick(BASELINE_RANGES.dislikes) };
}

export async function upsertBaseline({ mediaType, mediaId, season = 1, episode = 1, likes, dislikes }) {
  await q(
    `INSERT INTO episode_reaction_baseline (media_type, media_id, season, episode, likes, dislikes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (media_type, media_id, season, episode)
     DO UPDATE SET likes = EXCLUDED.likes, dislikes = EXCLUDED.dislikes, updated_at = now()`,
    [mediaType, mediaId, season, episode, likes, dislikes]
  );
}

export async function baselineFor({ mediaType, mediaId, season = 1, episode = 1 }) {
  const res = await q(
    `SELECT likes, dislikes FROM episode_reaction_baseline
      WHERE media_type=$1 AND media_id=$2 AND season=$3 AND episode=$4`,
    [mediaType, mediaId, season, episode]
  );
  return res?.rows?.[0] || null;
}

// Serialise mutations per account to prevent simultaneous devices losing writes.
// A guest library is imported once, only when the account has no row yet.
export async function accountState(userId, seed, mutate = null) {
  if (!(await ensureSchema())) return null;
  const pool = db(); let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('INSERT INTO app_user_state(user_id,state) VALUES ($1,$2::jsonb) ON CONFLICT (user_id) DO NOTHING', [userId, JSON.stringify(seed)]);
    const result = await client.query('SELECT state FROM app_user_state WHERE user_id=$1 FOR UPDATE', [userId]);
    let state = result.rows[0].state;
    if (mutate) {
      state = mutate(state);
      await client.query('UPDATE app_user_state SET state=$2::jsonb,updated_at=now() WHERE user_id=$1', [userId,JSON.stringify(state)]);
    }
    await client.query('COMMIT');
    return state;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error('[state] account storage unavailable:', error.message);
    return null;
  } finally { if (client) client.release(); }
}

export async function submitReport(experienced, episodeSeason, description) {
  const r = await q("INSERT INTO user_reports (experienced, episode_season, description) VALUES ($1,$2,$3) RETURNING id", [experienced, episodeSeason, description]);
  return Boolean(r?.rowCount);
}
