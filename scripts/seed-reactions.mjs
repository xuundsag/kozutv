#!/usr/bin/env node
// Keeps a plausible audience on every episode.
//
// For each episode it has seen, it stores a like/dislike baseline in
// episode_reaction_baseline. Reaction totals are (real votes + baseline), so the
// numbers on screen move as people vote but never start from zero.
//
//   node --env-file=.env scripts/seed-reactions.mjs            seed what exists
//   node --env-file=.env scripts/seed-reactions.mjs --watch    keep it moving
//   node --env-file=.env scripts/seed-reactions.mjs --episodes anime:20:1
//
// The row shape matches what the API reads, so nothing changes on the client.

import { databaseEnabled, upsertBaseline, baselineFor, randomBaseline, BASELINE_RANGES } from '../db.js';
import pg from 'pg';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const only = args.find(a => a.startsWith('--episodes='))?.split('=')[1];

if (!(await databaseEnabled())) {
  console.error('database not configured');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: true } : false
});
await client.connect();

// Which episodes should carry an audience? Everything that has any reaction row,
// plus anything listed explicitly. Falls back to the anime episodes that the
// browse feed exposes.
async function targets() {
  if (only) {
    return only.split(',').map(spec => {
      const [mediaType, mediaId, season = '1', episode = '1'] = spec.split(':');
      return { mediaType, mediaId, season: Number(season), episode: Number(episode) };
    });
  }
  const rows = await client.query(
    `SELECT DISTINCT media_type AS "mediaType", media_id AS "mediaId",
            season, episode
       FROM episode_reactions`
  );
  if (rows.rows.length) return rows.rows;
  // Nothing has been watched yet: seed a sensible default spread instead of
  // leaving the feature invisible.
  const defaults = [];
  for (const mediaId of ['20', '21', '28851', '16498', '5114']) {
    for (let ep = 1; ep <= 12; ep++) defaults.push({ mediaType: 'anime', mediaId, season: 1, episode: ep });
  }
  return defaults;
}

function jitter(value, pct) {
  const delta = Math.round(value * pct);
  return Math.max(BASELINE_RANGES.likes[0], value + delta);
}

async function seedOnce() {
  const list = await targets();
  let created = 0, moved = 0;
  for (const t of list) {
    const existing = await baselineFor(t);
    if (!existing) {
      const fresh = randomBaseline();
      await upsertBaseline({ ...t, ...fresh });
      created++;
    } else if (Math.random() < 0.55) {
      // Nudge the totals so they read as a live audience rather than a constant.
      const likes = jitter(Number(existing.likes), 0.035);
      const dislikes = Math.min(
        BASELINE_RANGES.dislikes[1],
        Math.max(BASELINE_RANGES.dislikes[0], Number(existing.dislikes) + (Math.random() < 0.5 ? 1 : 0))
      );
      await upsertBaseline({ ...t, likes, dislikes });
      moved++;
    }
  }
  console.log(`${new Date().toISOString()}  targets=${list.length}  created=${created}  moved=${moved}`);
}

await seedOnce();

if (watch) {
  // Drift on a slow, uneven cadence so the numbers never tick in lockstep.
  const tick = () => {
    seedOnce()
      .catch(e => console.error('seed error:', e.message))
      .finally(() => setTimeout(tick, 45_000 + Math.floor(Math.random() * 75_000)));
  };
  setTimeout(tick, 45_000);
  console.log('watching: baseline will drift every 45-120 s. Ctrl-C to stop.');
} else {
  await client.end();
  process.exit(0);
}
