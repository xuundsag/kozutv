// Shoul Studio test suite — spawns a server, exercises the full API + render pipeline.
// Run: node scripts/test.mjs  (env TEST_PORT, default 3199)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const ffmpeg = process.env.FFMPEG_PATH || path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg');
const ffprobe = process.env.FFPROBE_PATH || path.join(ROOT, 'node_modules/ffprobe-static/bin/linux/x64/ffprobe');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; failures.push(name); console.log(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`); }
}
async function api(p, opts = {}) {
  const res = await fetch(BASE + '/api' + p, {
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}
function exec(bin, args) {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => out += d);
    p.stderr.on('data', (d) => err += d);
    p.on('close', (code) => resolve({ code, out, err }));
  });
}
async function probe(file) {
  const { code, out } = await exec(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file]);
  if (code !== 0) return null;
  const j = JSON.parse(out);
  return {
    w: j.streams.find((s) => s.codec_type === 'video')?.width,
    h: j.streams.find((s) => s.codec_type === 'video')?.height,
    audio: j.streams.some((s) => s.codec_type === 'audio'),
    duration: Number(j.format?.duration || 0),
    size: Number(j.format?.size || 0),
  };
}
async function waitJob(id, timeoutMs = 240000) {
  const t0 = Date.now();
  for (;;) {
    const { data } = await api('/jobs/' + id);
    if (data.status === 'done') return data;
    if (data.status === 'error' || data.status === 'cancelled') throw new Error(data.error || data.status);
    if (Date.now() - t0 > timeoutMs) throw new Error('job timeout');
    await new Promise((r) => setTimeout(r, 800));
  }
}

// ---------------- start server ----------------
console.log('starting test server…');
const srv = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => srvLog += d);
srv.stderr.on('data', (d) => srvLog += d);
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
}

try {
  // ---------------- health & catalog ----------------
  console.log('\n[1] server & catalog');
  const health = await api('/health');
  ok('health', health.status === 200 && health.data.ok);

  const cat = (await api('/catalog')).data;
  ok('fonts >= 27', cat.fonts.length >= 27, `${cat.fonts.length}`);
  ok('stickers >= 150', cat.stickers.length >= 150, `${cat.stickers.length}`);
  ok('sounds >= 15', cat.sounds.length >= 15, `${cat.sounds.length}`);
  ok('samples >= 8', cat.samples.length >= 8, `${cat.samples.length}`);
  ok('templates = 10', cat.templates.length === 10, `${cat.templates.length}`);
  ok('effects >= 15', cat.effects.length >= 15, `${cat.effects.length}`);
  ok('filters >= 14', cat.filters.length >= 14, `${cat.filters.length}`);
  ok('text presets >= 15', cat.textPresets.length >= 15, `${cat.textPresets.length}`);

  // ---------------- static assets ----------------
  console.log('\n[2] static assets & sticker resolution audit');
  const sharp = (await import('sharp')).default;
  const stickersDir = path.join(ROOT, 'assets/stickers');
  let sCount = 0, sMin = Infinity, sMax = 0, sNonSquare = 0, sBroken = 0;
  const groups = fs.readdirSync(stickersDir);
  for (const g of groups) {
    for (const f of fs.readdirSync(path.join(stickersDir, g))) {
      if (!f.endsWith('.png')) continue;
      sCount++;
      try {
        const meta = await sharp(path.join(stickersDir, g, f)).metadata();
        if (!meta.width || meta.width < 128 || meta.height < 128) sBroken++;
        sMin = Math.min(sMin, meta.width, meta.height);
        sMax = Math.max(sMax, meta.width, meta.height);
        if (meta.width !== meta.height) sNonSquare++;
      } catch { sBroken++; }
    }
  }
  ok(`all ${sCount} sticker PNGs valid (>=128px)`, sCount >= 150 && sBroken === 0, `min ${sMin}px, max ${sMax}px, non-square ${sNonSquare}`);
  for (const g of groups) {
    const res = await fetch(`${BASE}/assets/stickers/${g === 'emoji' ? 'emoji/1f602' : g + '/' + fs.readdirSync(path.join(stickersDir, g))[0].replace('.png', '')}.png`);
    ok(`stickers served: /assets/stickers/${g}/*`, res.status === 200);
  }
  const fontsOnDisk = fs.readdirSync(path.join(ROOT, 'assets/fonts')).filter((f) => f.endsWith('.ttf')).length;
  ok('font files >= 40', fontsOnDisk >= 40, `${fontsOnDisk} ttf`);
  const sndCover = await fetch(`${BASE}/assets/sounds/${cat.sounds[0].id}`);
  ok('sounds served', sndCover.status === 200);

  // ---------------- media upload & probe ----------------
  console.log('\n[3] media upload, probe, thumbs');
  const testVid = '/tmp/test-upload.mp4';
  await exec(ffmpeg, ['-y', '-v', 'quiet', '-f', 'lavfi', '-i', 'testsrc2=s=640x960:d=3:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', testVid]);
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(testVid)], { type: 'video/mp4' }), 'test-video.mp4');
  const up = await fetch(BASE + '/api/media', { method: 'POST', body: fd });
  const vid = await up.json();
  ok('video upload', up.status === 200 && vid.type === 'video', `${vid.duration?.toFixed?.(1) || vid.duration}s ${vid.width}x${vid.height} audio:${vid.hasAudio}`);
  ok('video thumb', !!vid.thumb);

  const testImg = '/tmp/test-img.png';
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#00b140' } }).png().toFile(testImg);
  const fd2 = new FormData();
  fd2.append('file', new Blob([fs.readFileSync(testImg)], { type: 'image/png' }), 'green.png');
  const up2 = await fetch(BASE + '/api/media', { method: 'POST', body: fd2 });
  const img = await up2.json();
  ok('image upload', up2.status === 200 && img.type === 'image' && img.width === 800, `800x600`);

  const mediaList = (await api('/media')).data;
  ok('media list', mediaList.length >= 2, `${mediaList.length} items`);
  const thumbRes = await fetch(BASE + `/api/media/${vid.id}/thumb`);
  ok('media thumb endpoint', thumbRes.status === 200);

  // ---------------- bg removal ----------------
  console.log('\n[4] background removal (server-side)');
  const bgr = await api('/tools/bgremove', { method: 'POST', body: { mediaId: img.id, tolerance: 0.2, feather: 2 } });
  ok('bg remove creates derived media', bgr.status === 200 && bgr.data.src?.startsWith('media:'), bgr.data.error || '');
  if (bgr.status === 200) {
    const m = mediaList.find((x) => x.id === img.id);
    const derived = (await api('/media')).data.find((x) => x.src === bgr.data.src);
    const buf = await (await fetch(BASE + `/api/media/${derived.id}/file`)).arrayBuffer();
    const meta = await sharp(Buffer.from(buf)).metadata();
    ok('bg removed image has alpha', meta.channels === 4, `${meta.width}x${meta.height} ch=${meta.channels}`);
  }

  // ---------------- templates render (all 10) ----------------
  console.log('\n[5] template render checks (all 10 templates)');
  for (const t of cat.templates) {
    const pr = await api('/projects', { method: 'POST', body: { template: t.id, name: 't-' + t.id } });
    const pid = pr.data.id;
    const f = await fetch(`${BASE}/api/projects/${pid}/frame?t=1.0&w=300`);
    ok(`template '${t.id}' frame`, f.status === 200 && (await f.arrayBuffer()).byteLength > 1200);
    const cover = await fetch(`${BASE}/assets/templates/${t.id}.jpg`);
    ok(`template '${t.id}' cover`, cover.status === 200);
  }

  // ---------------- project CRUD + layered edits ----------------
  console.log('\n[6] project CRUD & layered composition');
  const proj = (await api('/projects', { method: 'POST', body: { name: 'matrix-test', aspect: '9:16' } })).data;
  ok('create blank project', !!proj.id && proj.aspect === '9:16');
  const cid = (s) => s + Math.random().toString(36).slice(2, 6);
  const edits = {
    id: proj.id, name: 'matrix-test', aspect: '9:16', fps: 30,
    bg: { type: 'gradient', from: '#160b2e', to: '#3d1d5c', angle: 120 },
    grain: 0.15,
    tracks: [
      {
        id: cid('v'), type: 'video', name: 'main', clips: [
          { id: cid('c'), type: 'video', src: `media:${vid.id}`, start: 0, duration: 3, in: 0, speed: 1, fit: 'cover', transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, effects: [{ id: 'zoompulse', intensity: 0.5 }], filter: { preset: 'vivid' }, anim: { in: 'fade', out: 'none', loop: 'none', dur: 0.4 }, transition: { type: 'fade', dur: 0.5 }, volume: 0.6, muted: false },
          { id: cid('c'), type: 'video', src: `media:${vid.id}`, start: 2.7, duration: 3, in: 0, speed: 1.5, fit: 'cover', transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, effects: [{ id: 'rgbshift', intensity: 0.4 }], filter: { preset: 'cyberpunk' }, anim: { in: 'none', out: 'fade', loop: 'none', dur: 0.4 }, transition: { type: 'slideleft', dur: 0.4 }, volume: 1, muted: true },
        ],
      },
      {
        id: cid('o'), type: 'overlay', name: 'cutout', clips: [
          { id: cid('c'), type: 'image', src: `media:${bgr.data.id || img.id}`, start: 0.5, duration: 4, fit: 'contain', transform: { x: -0.25, y: -0.3, scale: 0.6, rotation: -8, opacity: 0.95 }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, effects: [], filter: { preset: 'none' }, anim: { in: 'pop', out: 'none', loop: 'float', dur: 0.5 }, chroma: { enabled: true, key: '#00b140', similarity: 0.4, blend: 0.1 } },
        ],
      },
      {
        id: cid('s'), type: 'sticker', name: 'stickers', clips: [
          { id: cid('c'), type: 'sticker', src: 'asset:stickers/emoji/1f525.png', start: 0.3, duration: 3, sticker: { anim: 'pulse' }, transform: { x: 0.3, y: 0.3, scale: 1.1, rotation: 0, opacity: 1 }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 } },
          { id: cid('c'), type: 'sticker', src: 'asset:stickers/badges/brat.png', start: 3.5, duration: 3, sticker: { anim: 'wobble' }, transform: { x: -0.28, y: -0.35, scale: 0.9, rotation: 6, opacity: 1 }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 } },
        ],
      },
      {
        id: cid('t'), type: 'text', name: 'captions', clips: [
          { id: cid('c'), type: 'text', start: 0.2, duration: 2.6, text: { content: 'SERVER SIDE EDITING', preset: 'tiktok', font: 'anton', weight: 400, size: 130, color: '#ffffff', align: 'center', uppercase: true }, transform: { x: 0, y: 0.28, scale: 1, rotation: 0, opacity: 1 }, anim: { in: 'pop', out: 'none', loop: 'none', dur: 0.4 } },
          { id: cid('c'), type: 'text', start: 3, duration: 3, text: { content: 'karaoke mode test', preset: 'karaoke', font: 'anton', weight: 400, size: 110, color: '#ffffff', accent: '#ffe600', anim: 'karaoke' }, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 } },
        ],
      },
      {
        id: cid('a'), type: 'audio', name: 'music', clips: [
          { id: cid('c'), type: 'audio', src: 'asset:sounds/trap_808.mp3', start: 0, duration: 6, in: 0, speed: 1, volume: 0.7, fadeIn: 0.5, fadeOut: 1 },
          { id: cid('c'), type: 'audio', src: `media:${vid.id}`, start: 0, duration: 3, in: 0, speed: 1, volume: 0.3, fadeIn: 0, fadeOut: 0 },
        ],
      },
    ],
    duration: 6,
  };
  const put = await api('/projects/' + proj.id, { method: 'PUT', body: edits });
  ok('save layered project', put.status === 200 && put.data.duration >= 5.9, `duration ${put.data.duration}`);
  for (const t of [0.1, 1.5, 3.2, 5.6]) {
    const f = await fetch(`${BASE}/api/projects/${proj.id}/frame?t=${t}&w=270`);
    ok(`layered frame t=${t}`, f.status === 200 && (await f.arrayBuffer()).byteLength > 1200);
  }
  const fUpd = await fetch(`${BASE}/api/projects/${proj.id}/frame?t=1.5&w=270&v=${Date.now()}`);
  ok('cache-busted re-render', fUpd.status === 200);

  // ---------------- aspect × scale export matrix ----------------
  console.log('\n[7] EXPORT MATRIX — every aspect ratio & scale');
  const aspects = ['9:16', '1:1', '4:5', '16:9'];
  const expected = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] };
  for (const aspect of aspects) {
    const p2 = (await api('/projects', { method: 'POST', body: { name: 'aspect-' + aspect.replace(':', 'x'), aspect } })).data;
    const body = JSON.parse(JSON.stringify(edits));
    body.id = p2.id; body.aspect = aspect; body.duration = undefined;
    await api('/projects/' + p2.id, { method: 'PUT', body });
    const { data: job } = await api(`/projects/${p2.id}/export`, { method: 'POST', body: { scale: '480', fps: 24, format: 'mp4' } });
    const done = await waitJob(job.id);
    const meta = await probe(path.join(ROOT, "renders", done.fileName));
    const [ew, eh] = expected[aspect];
    const got = [meta.w, meta.h];
    const ratioOK = Math.abs(got[0] / got[1] - ew / eh) < 0.02;
    ok(`export ${aspect} @480p`, ratioOK && meta.duration > 4 && meta.size > 50000, `${got[0]}x${got[1]} ${meta.duration.toFixed(1)}s ${(meta.size / 1e6).toFixed(2)}MB`);
  }

  // ---------------- full-quality export with audio + formats ----------------
  console.log('\n[8] format exports (mp4+audio / gif / webm / preview)');
  const { data: j1 } = await api(`/projects/${proj.id}/export`, { method: 'POST', body: { scale: '480', fps: 24, format: 'mp4' } });
  const d1 = await waitJob(j1.id);
  const m1 = await probe(path.join(ROOT, "renders", d1.fileName));
  ok('mp4 with mixed audio', m1.audio && m1.duration > 5, `aac:${m1.audio} ${m1.duration.toFixed(1)}s`);
  const { data: j2 } = await api(`/projects/${proj.id}/export`, { method: 'POST', body: { scale: '480', fps: 24, format: 'gif' } });
  const d2 = await waitJob(j2.id);
  const meta2 = await probe(path.join(ROOT, "renders", d2.fileName));
  const gifFile = path.join(ROOT, 'renders', d2.fileName);
  ok('gif export', fs.existsSync(gifFile) && fs.statSync(gifFile).size > 200000, (fs.existsSync(gifFile) ? (fs.statSync(gifFile).size / 1e6).toFixed(1) + 'MB' : 'missing'));
  const { data: j3 } = await api(`/projects/${proj.id}/export`, { method: 'POST', body: { scale: '480', fps: 24, format: 'webm' } });
  const d3 = await waitJob(j3.id);
  const webmFile = path.join(ROOT, 'renders', d3.fileName);
  ok('webm export', fs.existsSync(webmFile) && fs.statSync(webmFile).size > 30000, (fs.existsSync(webmFile) ? (fs.statSync(webmFile).size / 1e6).toFixed(2) + 'MB' : 'missing'));
  const { data: j4 } = await api(`/projects/${proj.id}/preview`, { method: 'POST' });
  const d4 = await waitJob(j4.id);
  ok('low-res preview render', fs.existsSync(path.join(ROOT, 'renders', d4.fileName)), d4.fileName);
  const dl = await fetch(BASE + `/api/jobs/${j1.id}/file`);
  const dlBytes = dl.status === 200 ? (await dl.arrayBuffer()).byteLength : 0;
  ok('job download endpoint', dl.status === 200 && dlBytes > 50000, `${dl.status} ${dlBytes}b`);

  // ---------------- projects list & cleanup ----------------
  console.log('\n[9] project management');
  const list = (await api('/projects')).data;
  ok('projects listed', list.length >= 6, `${list.length} projects`);
  ok('list has covers', list.every((p) => p.cover));
  const del = await api('/projects/' + proj.id, { method: 'DELETE' });
  ok('delete project', del.status === 200);

  // ---------------- static UI ----------------
  console.log('\n[10] UI delivery');
  const ui = await fetch(BASE + '/');
  const html = await ui.text();
  ok('editor page served', ui.status === 200 && html.includes('Shoul Studio'));
  ok('app.js served', (await fetch(BASE + '/app.js')).status === 200);
  ok('app.css served', (await fetch(BASE + '/app.css')).status === 200);
  const brat = await fetch(BASE + '/brat/');
  ok('brat page served at /brat', brat.status === 200 && (await brat.text()).includes('brat generator'));
} catch (e) {
  fail++;
  failures.push('suite: ' + e.message);
  console.log('  \u2717 SUITE ERROR:', e.message);
}

console.log(`\n======== RESULTS: ${pass} passed, ${fail} failed ========`);
if (failures.length) { console.log('failures:'); failures.forEach((f) => console.log('  -', f)); }
if (srvLog) { console.log('---- server log tail ----'); console.log(srvLog.slice(-8000)); }
srv.kill('SIGKILL');
process.exit(fail ? 1 : 0);
