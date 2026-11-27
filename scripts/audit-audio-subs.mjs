#!/usr/bin/env node
// Audits every show the catalogue exposes: does the dub actually resolve to a
// playable stream, and do the subtitles exist, load, and contain real cues?
//
//   node --env-file=.env scripts/audit-audio-subs.mjs
//   node --env-file=.env scripts/audit-audio-subs.mjs --limit=25 --type=anime
//
// For each target it asks /api/play once per language, then fetches every
// subtitle track it advertises and parses the WebVTT so an empty or HTML-error
// "track" cannot pass as working captions.

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:3000';
const args = process.argv.slice(2);
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=999').split('=')[1]);
const onlyType = (args.find(a => a.startsWith('--type=')) || '').split('=')[1];
const verbose = args.includes('--verbose');

const REGIONAL = ['hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali'];

function parseVtt(text) {
  if (!/^WEBVTT/.test(text.trim())) return { ok: false, reason: 'not WebVTT' };
  const cues = (text.match(/-->/g) || []).length;
  const hasTimestamps = /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(text);
  const words = text.replace(/WEBVTT[\s\S]*?\n\n/, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (!hasTimestamps) return { ok: false, reason: 'no valid cue timings', cues };
  if (cues === 0) return { ok: false, reason: 'zero cues', cues };
  if (words < 5) return { ok: false, reason: 'no caption text', cues, words };
  return { ok: true, cues, words };
}

async function json(url, ms = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(BASE + url, { signal: ctl.signal });
    const body = await r.text();
    let data = null;
    try { data = JSON.parse(body); } catch {}
    return { status: r.status, data, raw: body };
  } catch (e) {
    return { status: 0, data: null, raw: e.message };
  } finally { clearTimeout(t); }
}

async function text(url, ms = 45000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url.startsWith('http') ? url : BASE + url, { signal: ctl.signal });
    const body = await r.text();
    return { status: r.status, body, type: r.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, body: e.message, type: '' };
  } finally { clearTimeout(t); }
}

// ---- build the target list from the catalogue -----------------------------
async function targets() {
  const out = [];
  const seen = new Set();
  const add = (type, id, title) => {
    const k = type + ':' + id;
    if (!seen.has(k)) { seen.add(k); out.push({ type, id, title }); }
  };
  const browse = await json('/api/browse');
  const items = browse.data?.items || [];
  for (const it of items) if (!onlyType || it.type === onlyType) add(it.type, it.id, it.title);

  // Genre pages widen the sample beyond whatever the home feed happens to show.
  if (!onlyType || onlyType === 'anime') {
    for (const g of ['Action', 'Comedy', 'Drama', 'Fantasy', 'Romance']) {
      const r = await json(`/api/genre?genre=${g}&type=anime`);
      for (const it of (r.data?.items || []).slice(0, 12)) add('anime', it.id, it.title);
    }
  }
  if (!onlyType || onlyType === 'tv') {
    for (const g of ['Action', 'Drama', 'Comedy']) {
      const r = await json(`/api/genre?genre=${g}&type=tv`);
      for (const it of (r.data?.items || []).slice(0, 8)) add('tv', it.id, it.title);
    }
  }
  return out.slice(0, limit);
}

const rows = [];
const list = await targets();
console.log(`auditing ${list.length} titles\n`);

let n = 0;
for (const t of list) {
  n++;
  const langs = t.type === 'anime' ? ['sub', 'dub', ...REGIONAL] : ['sub', 'dub'];
  const row = { type: t.type, id: t.id, title: String(t.title || '').slice(0, 34), streams: {}, captionOk: 0, captionBad: 0, captionNote: [] };

  for (const lang of langs) {
    const r = await json(`/api/play?type=${t.type}&id=${t.id}&episode=1&season=1&lang=${lang}`);
    const d = r.data;
    if (!d || !d.src) { row.streams[lang] = { ok: false, why: r.status ? `http ${r.status}` : 'no src' }; continue; }

    const allowed = Array.isArray(d.availableLangs) ? d.availableLangs : [];
    // A language the server does not actually offer must not claim to work.
    const offered = allowed.includes(lang);
    row.streams[lang] = { ok: true, offered, src: String(d.src).slice(0, 40), server: d.server || '' };

    if (lang === 'sub' || lang === 'dub' || offered) {
      for (const tr of (d.tracks || [])) {
        const got = await text(tr.src);
        const ct = (got.type || '').toLowerCase();
        if (got.status !== 200) { row.captionBad++; row.captionNote.push(`${lang}:${tr.language} http ${got.status}`); continue; }
        if (!ct.includes('vtt') && !/^WEBVTT/.test(got.body.trim())) {
          row.captionBad++; row.captionNote.push(`${lang}:${tr.language} not vtt (${ct || 'no type'})`); continue;
        }
        const v = parseVtt(got.body);
        if (v.ok) { row.captionOk++; }
        else { row.captionBad++; row.captionNote.push(`${lang}:${tr.language} ${v.reason}`); }
      }
    }
  }
  rows.push(row);

  if (verbose || n % 10 === 0) {
    const langs = Object.entries(row.streams).filter(([, v]) => v.ok).map(([k]) => k);
    console.log(`[${n}/${list.length}] ${row.type.padEnd(5)} ${row.id.padEnd(7)} ${row.title.padEnd(34)} streams:${langs.join(',') || 'NONE'}  caps ok:${row.captionOk} bad:${row.captionBad}`);
  }
}

// ---- summary --------------------------------------------------------------
const tot = rows.length;
const withSub = rows.filter(r => r.streams.sub?.ok).length;
const withDub = rows.filter(r => r.streams.dub?.ok && r.streams.dub.offered !== false).length;
const claimsDubNoStream = rows.filter(r => r.streams.dub && r.streams.dub.ok && r.streams.dub.offered === false).length;
const noSub = rows.filter(r => !r.streams.sub?.ok);
const noDub = rows.filter(r => !(r.streams.dub?.ok && r.streams.dub.offered !== false));
const capsOk = rows.filter(r => r.captionOk > 0).length;
const capsNone = rows.filter(r => r.captionOk === 0);
const capsBadRows = rows.filter(r => r.captionBad > 0);
const regionalRows = rows.filter(r => REGIONAL.some(l => r.streams[l]?.ok && r.streams[l]?.offered !== false));

console.log('\n================ AUDIT SUMMARY ================');
console.log(`titles tested            ${tot}`);
console.log(`sub stream resolves      ${withSub}  (${pct(withSub, tot)})`);
console.log(`dub stream resolves      ${withDub}  (${pct(withDub, tot)})`);
console.log(`dub advertised, no src   ${claimsDubNoStream}`);
console.log(`at least one caption set ${capsOk}  (${pct(capsOk, tot)})`);
console.log(`no captions at all       ${capsNone.length}`);
console.log(`caption sets failed      ${rows.reduce((a, r) => a + r.captionBad, 0)}`);
console.log(`regional audio resolves  ${regionalRows.length}`);

if (noDub.length) console.log('\nNO DUB (' + noDub.length + '):\n' + noDub.map(r => `  ${r.type}:${r.id} ${r.title}`).join('\n'));
if (capsNone.length) console.log('\nNO CAPTIONS (' + capsNone.length + '):\n' + capsNone.map(r => `  ${r.type}:${r.id} ${r.title}`).join('\n'));
if (capsBadRows.length) console.log('\nCAPTION FAILURES:\n' + capsBadRows.map(r => `  ${r.type}:${r.id} ${r.title} -> ${r.captionNote.slice(0, 3).join('; ')}`).join('\n'));

function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '0%'; }

import fs from 'node:fs';
fs.writeFileSync('/tmp/audio-sub-audit.json', JSON.stringify(rows, null, 2));
console.log('\nfull report: /tmp/audio-sub-audit.json');
process.exit(0);
