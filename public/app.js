/* Shoul Studio — editor client (all heavy work happens server-side) */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = (n = 8) => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

const state = {
  view: 'home',
  projects: [],
  catalog: null,
  project: null,
  t: 0,
  playing: false,
  sel: null,            // {trackId, clipId}
  pps: 60,              // px per second
  exp: { scale: '1080', fps: 30, format: 'mp4' },
  sheet: null,
};

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.status;
    try { msg = (await res.json()).error || msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
}

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function fmtT(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

/* ================= HOME ================= */
async function loadHome() {
  try {
    const [projects, catalog] = await Promise.all([api('/projects'), api('/catalog')]);
    state.projects = projects;
    state.catalog = catalog;
    $('#btnHealth').classList.remove('bad');
  } catch {
    $('#btnHealth').classList.add('bad');
  }
  $('#projCount').textContent = state.projects.length ? `(${state.projects.length})` : '';
  // templates
  const cat = state.catalog;
  $('#tplRow').innerHTML = cat && cat.templates.length ? cat.templates.map((t) => `
    <button class="tpl-card" data-tpl="${t.id}">
      <img src="${t.cover}" onerror="this.style.background='#26262f';this.removeAttribute('src')">
      <b>${t.name}</b><small>${t.desc || ''}</small>
    </button>`).join('') : '<span style="color:var(--dim)">no templates</span>';
  // projects
  $('#projGrid').innerHTML = state.projects.length ? state.projects.map((p) => `
    <div class="proj-card-wrap" style="position:relative">
      <button class="proj-card" data-open="${p.id}">
        <img src="${p.cover}" onerror="this.style.background='#26262f';this.removeAttribute('src')">
        <b>${esc(p.name)}</b>
      </button>
      <button class="del" data-del="${p.id}">&#10005;</button>
    </div>`).join('') : '<span style="color:var(--dim);font-size:12px">no projects yet — tap "new project"</span>';
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function createProject({ name, aspect, template }) {
  const p = await api('/projects', { method: 'POST', body: { name, aspect, template } });
  openEditor(p.id);
}

/* ================= EDITOR ================= */
async function openEditor(id) {
  const [p] = await Promise.all([api('/projects/' + id)]);
  state.project = p;
  state.t = 0;
  state.sel = null;
  state.playing = false;
  state.view = 'editor';
  $('#homeView').classList.add('hidden');
  $('#editorView').classList.remove('hidden');
  $('#edName').textContent = p.name;
  $('#edAspect').textContent = p.aspect;
  const dims = (state.catalog?.aspects?.[p.aspect]) || [1080, 1920];
  $('#stageChip').textContent = `${dims[0]} \u00d7 ${dims[1]} \u00b7 ${p.fps || 30}fps`;
  closeSheet();
  renderTimeline();
  refreshPreview(true);
  updatePlayhead();
}

function goHome() {
  stopPlay();
  state.view = 'home';
  state.project = null;
  $('#editorView').classList.add('hidden');
  $('#homeView').classList.remove('hidden');
  loadHome();
}

function prevW() { return Math.min(540, Math.max(216, Math.floor(window.innerWidth * 0.92))); }

function frameUrl(t, force) {
  const p = state.project;
  return `/api/projects/${p.id}/frame?t=${t.toFixed(3)}&w=${prevW()}${force ? '&v=' + Date.now() : ''}`;
}

let previewBusy = false;
function refreshPreview(force = false) {
  if (!state.project) return;
  if (previewBusy && !force) return;
  previewBusy = true;
  const img = $('#preview');
  img.onload = () => { previewBusy = false; $('#stageBusy').classList.add('hidden'); };
  img.onerror = () => { previewBusy = false; };
  if (force) $('#stageBusy').classList.remove('hidden');
  img.src = frameUrl(state.t, force);
}

/* ---- timeline ---- */
function trackIndex(type) {
  const order = ['video', 'overlay', 'sticker', 'text', 'audio'];
  return order.indexOf(type);
}

function ensureTrack(type) {
  const p = state.project;
  let tr = p.tracks.find((t) => t.type === type);
  if (!tr) {
    tr = { id: uid(), type, name: type, clips: [] };
    p.tracks.push(tr);
  }
  return tr;
}

function trackEnd(tr) {
  return (tr.clips || []).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

function renderTimeline() {
  const p = state.project;
  if (!p) return;
  const dur = Math.max(1, p.duration || 0);
  const w = dur * state.pps + 40;
  $('#tlInner').style.width = w + 'px';
  // ruler
  const step = state.pps >= 90 ? 0.5 : 1;
  let ticks = '';
  for (let s = 0; s <= dur; s += step) {
    ticks += `<span style="left:${s * state.pps}px">${step < 1 && s % 1 ? '' : s}s</span>`;
  }
  $('#ruler').innerHTML = ticks;
  // tracks (visible rows)
  const order = { video: 0, overlay: 1, sticker: 2, text: 3, audio: 4 };
  const tracks = p.tracks.slice().sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  let html = '';
  for (const tr of tracks) {
    const cls = tr.type === 'video' ? '' : tr.type === 'audio' ? 'audio-trk' : 'overlay-trk';
    html += `<div class="trk ${cls}" data-track="${tr.id}"><span class="trk-label">${tr.type}</span>`;
    for (const c of tr.clips || []) {
      const selCls = state.sel && state.sel.clipId === c.id ? ' selected' : '';
      const label = c.type === 'text' ? (c.text?.content || 'text').slice(0, 22)
        : c.type === 'sticker' ? (c.src || '').split('/').pop().replace('.png', '')
          : c.type === 'audio' ? (c.src || '').split('/').pop().replace(/\.(mp3|wav)$/, '').slice(0, 18)
            : (c.src || '').split('/').pop().replace(/\.(mp4|png|jpg|jpeg|webp)$/i, '').slice(0, 16);
      const icon = c.type === 'audio' ? '&#9835; ' : c.type === 'text' ? 'T ' : c.type === 'sticker' ? '&#9786; ' : '';
      const thumb = (c.type === 'video' || c.type === 'image') && c.src && c.src.startsWith('media:')
        ? `<img class="thumb" src="/api/media/${c.src.slice(6)}/thumb" onerror="this.remove()">` : '';
      html += `<div class="clip ${c.type}${selCls}" data-clip="${c.id}" style="left:${c.start * state.pps}px;width:${Math.max(14, c.duration * state.pps)}px">${thumb}${icon}${esc(label)}${c.speed && c.speed !== 1 ? `<small>${c.speed}x</small>` : ''}</div>`;
    }
    html += `</div>`;
  }
  $('#tlTracks').innerHTML = html;
  updatePlayhead();
}

function updatePlayhead() {
  const x = state.t * state.pps;
  $('#playhead').style.left = x + 'px';
  $('#timeLabel').textContent = `${fmtT(state.t)} / ${fmtT(state.project?.duration || 0)}`;
  // auto follow
  const tl = $('#timeline');
  const target = x + 12 - tl.clientWidth / 2;
  if (state.playing && Math.abs(tl.scrollLeft - target) > 30) tl.scrollLeft = Math.max(0, target);
}

$('#timeline').addEventListener('click', (e) => {
  const clipEl = e.target.closest('.clip');
  if (clipEl) {
    const trackEl = clipEl.closest('.trk');
    state.sel = { trackId: trackEl.dataset.track, clipId: clipEl.dataset.clip };
    renderTimeline();
    openSheet('edit');
  } else if (e.target.closest('.trk') || e.target.closest('.ruler')) {
    // scrub
    const tl = $('#timeline');
    const x = (e.clientX - tl.getBoundingClientRect().left + tl.scrollLeft - 12);
    setT(Math.max(0, x / state.pps));
  } else {
    state.sel = null;
    renderTimeline();
  }
});

function setT(t) {
  const dur = state.project?.duration || 0;
  state.t = Math.max(0, Math.min(dur, t));
  updatePlayhead();
  refreshPreview();
}

/* ---- playback ---- */
function stopPlay() {
  state.playing = false;
  $('#btnPlay').innerHTML = '&#9654;';
}

function tick() {
  if (!state.playing) return;
  const p = state.project;
  state.t += 1 / 30;
  if (state.t >= (p.duration || 0)) state.t = 0;
  updatePlayhead();
  refreshPreview();
  setTimeout(tick, 1000 / 30);
}

$('#btnPlay').addEventListener('click', () => {
  if (state.playing) { stopPlay(); return; }
  state.playing = true;
  $('#btnPlay').innerHTML = '&#9208;';
  tick();
});
$('#btnToStart').addEventListener('click', () => setT(0));
$('#btnToEnd').addEventListener('click', () => setT(state.project?.duration || 0));

/* ---- clip mutations ---- */
function selClip() {
  if (!state.sel || !state.project) return null;
  const tr = state.project.tracks.find((t) => t.id === state.sel.trackId);
  if (!tr) return null;
  const c = (tr.clips || []).find((c) => c.id === state.sel.clipId);
  return c ? { track: tr, clip: c } : null;
}

function saveProject() {
  const p = state.project;
  return api('/projects/' + p.id, { method: 'PUT', body: p }).then((r) => {
    p.duration = r.duration;
    renderTimeline();
    refreshPreview(true);
  }).catch((e) => toast('save failed: ' + e.message));
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 320);
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function applyToClip(path, raw) {
  const s = selClip();
  if (!s) return;
  const { type } = raw || {};
  let value = raw;
  if (type === 'num') value = Number(raw.value);
  if (type === 'int') value = Math.round(Number(raw.value));
  if (type === 'bool') value = !!raw.value;
  setPath(s.clip, path, value);
  save();
  if (state.sheet) openSheet(state.sheet); // re-render sliders/labels
}

function baseClip(type, start, duration, extra = {}) {
  return {
    id: uid(), type, start: Math.round(start * 100) / 100,
    duration: Math.round(duration * 100) / 100,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 },
    ...extra,
  };
}

async function addClipFromMedia(media, target = 'main') {
  const p = state.project;
  if (media.type === 'audio') {
    const tr = ensureTrack('audio');
    const start = Math.max(state.t, trackEnd(tr) > state.t ? trackEnd(tr) : state.t);
    tr.clips.push(baseClip('audio', start, Math.max(1, media.duration || 5), {
      src: `media:${media.id}`, in: 0, volume: 1, fadeIn: 0, fadeOut: 0,
    }));
  } else {
    const type = media.type === 'video' ? 'video' : 'image';
    const tr = target === 'overlay' ? ensureTrack('overlay') : ensureTrack('video');
    const start = Math.max(state.t, trackEnd(tr) > state.t ? trackEnd(tr) : state.t);
    tr.clips.push(baseClip(type, start, Math.max(1.5, media.duration || 4), {
      src: `media:${media.id}`,
      in: 0, speed: 1, fit: 'cover', muted: false, volume: 1,
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      effects: [], filter: { preset: 'none' },
      transition: { type: 'none', dur: 0.5 },
    }));
    if (target === 'main' && start + (media.duration || 4) > p.duration) { /* duration updates on save */ }
  }
  toast('added ' + media.name);
  await saveProject();
}

function addTextClip() {
  const tr = ensureTrack('text');
  const start = Math.max(state.t, trackEnd(tr) > state.t ? trackEnd(tr) : state.t);
  tr.clips.push(baseClip('text', start, 3, {
    text: { content: 'your text', preset: 'tiktok', font: 'poppins', weight: 800, size: 110, color: '#ffffff', align: 'center', lineHeight: 1.2, letterSpacing: 0, uppercase: false, maxW: 0.88 },
  }));
  return tr.clips[tr.clips.length - 1];
}

function addStickerClip(src) {
  const tr = ensureTrack('sticker');
  const start = Math.max(state.t, trackEnd(tr) > state.t ? trackEnd(tr) : state.t);
  tr.clips.push(baseClip('sticker', start, 3, {
    src, sticker: { anim: 'pop' },
  }));
  return tr.clips[tr.clips.length - 1];
}

function splitClip() {
  const s = selClip();
  if (!s) return toast('select a clip first');
  const { track, clip } = s;
  const at = state.t;
  if (at <= clip.start + 0.15 || at >= clip.start + clip.duration - 0.15) return toast('move playhead inside the clip');
  const right = JSON.parse(JSON.stringify(clip));
  right.id = uid();
  const off = at - clip.start;
  right.duration = clip.duration - off;
  right.start = at;
  if (clip.type === 'video' || clip.type === 'audio') right.in = (clip.in || 0) + off * (clip.speed || 1);
  if (clip.transition) right.transition = { type: 'none', dur: 0.5 };
  clip.duration = off;
  track.clips.push(right);
  saveProject();
  toast('split');
}

function deleteClip() {
  const s = selClip();
  if (!s) return;
  s.track.clips = s.track.clips.filter((c) => c.id !== s.clip.id);
  state.sel = null;
  saveProject();
  closeSheet();
}

function duplicateClip() {
  const s = selClip();
  if (!s) return;
  const copy = JSON.parse(JSON.stringify(s.clip));
  copy.id = uid();
  copy.start = s.clip.start + s.clip.duration;
  s.track.clips.push(copy);
  saveProject();
  toast('duplicated');
}

/* ================= SHEETS ================= */
function openSheet(name) {
  state.sheet = name;
  $$('#toolbar button').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
  const titles = {
    media: 'media', templates: 'templates', edit: 'edit', text: 'text',
    stickers: 'stickers', overlay: 'overlay', audio: 'audio', filters: 'filters',
    effects: 'effects', transition: 'transition', canvas: 'canvas',
  };
  $('#sheetTitle').textContent = titles[name] || name;
  renderSheet();
  $('#sheetWrap').classList.remove('hidden');
}

function closeSheet() {
  state.sheet = null;
  $('#sheetWrap').classList.add('hidden');
  $$('#toolbar button').forEach((b) => b.classList.remove('active'));
}

$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBackdrop').addEventListener('click', closeSheet);
$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sheet]');
  if (!b) return;
  if (state.sheet === b.dataset.sheet) closeSheet();
  else openSheet(b.dataset.sheet);
});

/* ---- generic control builders ---- */
const ctl = {
  slider: (label, path, val, min, max, step = 1, fmt = (v) => v) =>
    `<div class="lbl">${label} <span class="val" data-val="${path}">${fmt(val)}</span></div>
     <input type="range" data-act="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${val}">`,
  chips: (label, path, options, cur, type = 'str') =>
    `<div class="lbl">${label}</div><div class="chips">${options.map((o) =>
      `<button class="chip ${String(cur) === String(o.v) ? 'active' : ''}" data-act="chip" data-path="${path}" data-type="${type}" data-value="${o.v}">${o.l}</button>`).join('')}</div>`,
  select: (label, path, options, cur) =>
    `<div class="lbl">${label}</div><select data-act="select" data-path="${path}">${options.map((o) =>
      `<option value="${o.v}" ${String(cur) === String(o.v) ? 'selected' : ''}>${o.l}</option>`).join('')}</select>`,
  text: (label, path, val) =>
    `<div class="lbl">${label}</div><input type="text" data-act="text" data-path="${path}" value="${esc(val)}">`,
  area: (label, path, val) =>
    `<div class="lbl">${label}</div><textarea rows="3" data-act="text" data-path="${path}">${esc(val)}</textarea>`,
};

function readCtl(el) {
  const path = el.dataset.path;
  const type = el.dataset.type || (el.tagName === 'INPUT' && el.type === 'range' ? 'num' : 'str');
  const value = el.dataset.value != null && el.classList.contains('chip') ? el.dataset.value : el.value;
  applyToClip(path, { value, type: type === 'str' ? 'raw' : type });
}

/* ---- sheet renderers ---- */
function renderSheet() {
  const name = state.sheet;
  const body = $('#sheetBody');
  const cat = state.catalog || { fonts: [], stickers: [], sounds: [], samples: [], textPresets: [], anims: { in: [], out: [], loop: [], sticker: [] }, filters: [], effects: [], transitions: [] };

  if (name === 'media' || name === 'overlay') {
    const media = state.mediaCache || [];
    const isOverlay = name === 'overlay';
    body.innerHTML = `
      <button class="upload-btn" id="uploadBtn">${isOverlay ? '&#9974; upload video / image for overlay' : '&#10133; upload video, photo or audio'}</button>
      <input type="file" id="fileInput" class="hidden" accept="video/*,image/*,audio/*" ${isOverlay ? 'data-overlay="1"' : ''}>
      <div id="mediaList">${media.map((m) => mediaRow(m, isOverlay)).join('') || '<div style="color:var(--dim);font-size:12px">no uploads yet</div>'}</div>`;
    $('#uploadBtn').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = onUpload;
    bindMediaRows(body, isOverlay);
    return;
  }

  if (name === 'templates') {
    const tpls = cat.templates || [];
    body.innerHTML = `<div class="grid">${tpls.map((t) => `
      <button class="cell" data-usetpl="${t.id}"><img src="${t.cover}" onerror="this.style.background='#26262f';this.removeAttribute('src')">${esc(t.name)}</button>`).join('')}</div>
      <p style="color:var(--dim);font-size:11px">templates open as a <b>new project</b> — your current one stays safe.</p>`;
    $$('[data-usetpl]', body).forEach((b) => b.onclick = () => {
      closeSheet();
      createProject({ name: b.textContent.trim() || 'template', aspect: state.project?.aspect || '9:16', template: b.dataset.usetpl });
    });
    return;
  }

  if (name === 'text') {
    const s = selClip();
    if (s && (s.clip.type === 'text')) {
      body.innerHTML = textEditor(s.clip, cat);
    } else {
      body.innerHTML = `<button class="cta" id="addText">+ add text at playhead</button>
        <p style="color:var(--dim);font-size:11px">tip: select an existing text clip on the timeline to edit it</p>`;
      $('#addText').onclick = () => {
        const c = addTextClip();
        state.sel = { trackId: ensureTrack('text').id, clipId: c.id };
        saveProject();
        openSheet('text');
      };
    }
    bindGeneric(body);
    bindColorInputs(body);
    return;
  }

  if (name === 'stickers') {
    const groups = {};
    for (const st of cat.stickers || []) (groups[st.group] = groups[st.group] || []).push(st);
    body.innerHTML = Object.entries(groups).map(([g, items]) => `
      <div class="lbl">${g}</div>
      <div class="grid">${items.map((st) => `
        <button class="cell" data-addsticker="${st.src}" title="${esc(st.name)}"><img src="${st.thumb}" loading="lazy" onerror="this.style.background='#26262f';this.removeAttribute('src')"></button>`).join('')}</div>`).join('');
    $$('[data-addsticker]', body).forEach((b) => b.onclick = () => {
      const c = addStickerClip(b.dataset.addsticker);
      state.sel = { trackId: ensureTrack('sticker').id, clipId: c.id };
      saveProject();
      toast('sticker added');
    });
    return;
  }

  if (name === 'audio') {
    const sounds = cat.sounds || [];
    const media = (state.mediaCache || []).filter((m) => m.type === 'audio');
    body.innerHTML = `
      <button class="upload-btn" id="upAudio">&#9835; upload music / voiceover</button>
      <input type="file" id="fileAudio" class="hidden" accept="audio/*">
      ${media.length ? '<div class="lbl">my uploads</div>' + media.map((m) => mediaRow(m)).join('') : ''}
      <div class="lbl">bundled sounds (royalty-free)</div>
      <div id="soundList">${sounds.map((s) => `
        <div class="media-item"><div class="ico">&#9835;</div>
          <div class="grow"><b>${esc(s.name)}</b><small>bundled</small></div>
          <button class="add" data-addsound="${s.src}">add</button></div>`).join('')}</div>`;
    $('#upAudio').onclick = () => $('#fileAudio').click();
    $('#fileAudio').onchange = onUpload;
    bindMediaRows(body);
    $$('[data-addsound]', body).forEach((b) => b.onclick = () => {
      const tr = ensureTrack('audio');
      const start = Math.max(state.t, trackEnd(tr) > state.t ? trackEnd(tr) : state.t);
      tr.clips.push(baseClip('audio', start, 8, { src: b.dataset.addsound, in: 0, volume: 0.8, fadeIn: 0, fadeOut: 0.5 }));
      saveProject();
      toast('sound added');
    });
    return;
  }

  if (name === 'filters') {
    const s = selClip();
    const clip = s ? s.clip : mainClipAtPlayhead();
    if (!clip || !(clip.type === 'video' || clip.type === 'image' || clip.type === 'overlay')) {
      body.innerHTML = '<p style="color:var(--dim)">select a video / image clip on the timeline first</p>';
      return;
    }
    const f = clip.filter || {};
    body.innerHTML = `
      <div class="lbl">selected: ${esc(clipLabel(clip))}</div>
      ${ctl.chips('look', 'filter.preset', [{ v: 'none', l: 'Original' }, ...cat.filters.filter((x) => x.id !== 'none').map((x) => ({ v: x.id, l: x.name }))], f.preset || 'none')}
      ${ctl.slider('brightness', 'filter.brightness', f.brightness ?? 1, 0.2, 2, 0.01, (v) => Number(v).toFixed(2))}
      ${ctl.slider('contrast', 'filter.contrast', f.contrast ?? 1, 0.2, 2, 0.01, (v) => Number(v).toFixed(2))}
      ${ctl.slider('saturation', 'filter.saturation', f.saturation ?? 1, 0, 2, 0.01, (v) => Number(v).toFixed(2))}
      ${ctl.slider('hue', 'filter.hue', f.hue ?? 0, -180, 180, 1, (v) => v + '\u00b0')}
      ${ctl.slider('blur', 'filter.blur', f.blur ?? 0, 0, 20, 0.5, (v) => v + 'px')}
      ${ctl.slider('vignette', 'filter.vignette', f.vignette ?? 0, 0, 0.9, 0.05, (v) => v)}`;
    bindGeneric(body);
    return;
  }

  if (name === 'effects') {
    const s = selClip();
    const clip = s ? s.clip : mainClipAtPlayhead();
    if (!clip) { body.innerHTML = '<p style="color:var(--dim)">select a clip on the timeline first</p>'; return; }
    const fx = clip.effects || [];
    body.innerHTML = `
      <div class="lbl">selected: ${esc(clipLabel(clip))} — tap to toggle</div>
      <div class="chips">${cat.effects.map((e) => {
        const on = fx.find((f) => (f.id || f) === e.id);
        return `<button class="chip ${on ? 'active' : ''}" data-fx="${e.id}">${e.name}</button>`;
      }).join('')}</div>
      <div id="fxSliders">${fx.map((f) => {
        const id = f.id || f;
        const meta = cat.effects.find((e) => e.id === id);
        return ctl.slider(`${meta ? meta.name : id} intensity`, `effects.${id}.intensity`, f.intensity ?? 0.6, 0, 1, 0.05, (v) => Number(v).toFixed(2));
      }).join('')}</div>`;
    bindGeneric(body);
    $$('[data-fx]', body).forEach((b) => b.onclick = () => {
      const id = b.dataset.fx;
      const arr = clip.effects || (clip.effects = []);
      const i = arr.findIndex((f) => (f.id || f) === id);
      if (i >= 0) arr.splice(i, 1); else arr.push({ id, intensity: 0.6 });
      save();
      openSheet('effects');
    });
    return;
  }

  if (name === 'transition') {
    const s = selClip();
    const clip = s ? s.clip : mainClipAtPlayhead();
    if (!clip || clip.type !== 'video') { body.innerHTML = '<p style="color:var(--dim)">select a main-track video clip — the transition plays when the <b>next</b> clip starts</p>'; return; }
    const tr = clip.transition || {};
    body.innerHTML = `
      ${ctl.chips('type', 'transition.type', cat.transitions.map((t) => ({ v: t.id, l: t.name })), tr.type || 'none')}
      ${ctl.slider('duration', 'transition.dur', tr.dur ?? 0.5, 0.2, 2, 0.1, (v) => Number(v).toFixed(1) + 's')}`;
    bindGeneric(body);
    return;
  }

  if (name === 'canvas') {
    const bg = state.project.bg || { type: 'color', color: '#000000' };
    const dots = ['#000000', '#111111', '#ffffff', '#8ace00', '#00b140', '#ff2d55', '#3d5afe', '#ffc400', '#12c2e9', '#f64f59'];
    body.innerHTML = `
      ${ctl.chips('background type', 'bg.type', [{ v: 'color', l: 'solid' }, { v: 'gradient', l: 'gradient' }], bg.type || 'color')}
      <div class="lbl">color ${bg.type === 'gradient' ? '(from)' : ''}</div>
      <div class="color-row">${dots.map((c) => `<button class="color-dot ${bg.color === c ? 'active' : ''}" data-bgcolor="${c}" style="background:${c}"></button>`).join('')}
        <input type="color" value="${(bg.color || '#000000').slice(0, 7)}" data-bgcustom style="width:30px;height:30px;border:none;background:none;padding:0">
      </div>
      ${bg.type === 'gradient' ? `
        <div class="lbl">gradient to</div>
        <div class="color-row">${dots.map((c) => `<button class="color-dot ${bg.to === c ? 'active' : ''}" data-bgto="${c}" style="background:${c}"></button>`).join('')}
          <input type="color" value="${(bg.to || '#31235f').slice(0, 7)}" data-bgtocustom style="width:30px;height:30px;border:none;background:none;padding:0">
        </div>
        ${ctl.slider('angle', 'bg.angle', bg.angle ?? 90, 0, 360, 5, (v) => v + '\u00b0')}` : ''}
      ${ctl.slider('film grain', 'grain', state.project.grain ?? 0, 0, 1, 0.05, (v) => v)}`;
    bindGeneric(body);
    $$('[data-bgcolor]', body).forEach((b) => b.onclick = () => { state.project.bg.color = b.dataset.bgcolor; save(); openSheet('canvas'); });
    $$('[data-bgto]', body).forEach((b) => b.onclick = () => { state.project.bg.to = b.dataset.bgto; save(); openSheet('canvas'); });
    const bc = $('[data-bgcustom]', body); if (bc) bc.oninput = () => { state.project.bg.color = bc.value; save(); };
    const bt = $('[data-bgtocustom]', body); if (bt) bt.oninput = () => { state.project.bg.to = bt.value; save(); };
    return;
  }

  if (name === 'edit') {
    const s = selClip();
    if (!s) {
      body.innerHTML = `<p style="color:var(--dim);font-size:12px">tap a clip on the timeline to edit it. at playhead:</p>` +
        clipsAtPlayhead().map(({ track, clip }) => `<div class="media-item"><div class="ico">${clip.type === 'audio' ? '&#9835;' : clip.type === 'text' ? 'T' : '&#9654;'}</div><div class="grow"><b>${esc(clipLabel(clip))}</b><small>${track.type} track</small></div><button class="add" data-pick="${track.id}:${clip.id}">edit</button></div>`).join('') || '<p style="color:var(--dim)">nothing here — move the playhead</p>';
      $$('[data-pick]', body).forEach((b) => b.onclick = () => {
        const [trackId, clipId] = b.dataset.pick.split(':');
        state.sel = { trackId, clipId };
        renderTimeline();
        openSheet('edit');
      });
      return;
    }
    body.innerHTML = clipEditor(s, cat);
    bindGeneric(body);
    $$('[data-cmd]', body).forEach((b) => b.onclick = () => {
      const cmd = b.dataset.cmd;
      if (cmd === 'delete') deleteClip();
      if (cmd === 'dup') duplicateClip();
      if (cmd === 'split') splitClip();
    });
    return;
  }
}

function mediaRow(m, isOverlay = false) {
  const img = m.thumb ? `<img src="${m.thumb}" loading="lazy">` : `<div class="ico">${m.type === 'audio' ? '&#9835;' : '&#128444;'}</div>`;
  return `<div class="media-item">${img}
    <div class="grow"><b>${esc(m.name)}</b><small>${m.type}${m.duration ? ' \u00b7 ' + m.duration.toFixed(1) + 's' : ''}${m.width ? ' \u00b7 ' + m.width + '\u00d7' + m.height : ''}</small></div>
    <button class="add" data-addmedia="${m.id}" data-mtype="${m.type}">${isOverlay ? 'overlay' : 'add'}</button></div>`;
}

function bindMediaRows(root, isOverlay = false) {
  $$('[data-addmedia]', root).forEach((b) => b.onclick = () => {
    const m = (state.mediaCache || []).find((x) => x.id === b.dataset.addmedia);
    if (!m) return;
    if (m.type === 'audio' || !isOverlay) addClipFromMedia(m, 'main');
    else addClipFromMedia(m, 'overlay');
  });
}

async function onUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  toast('uploading ' + file.name + '\u2026', 6000);
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/media', { method: 'POST', body: fd });
    const m = await res.json();
    if (m.error) throw new Error(m.error);
    toast('uploaded: ' + m.name);
    await loadMediaCache();
    if (state.sheet) openSheet(state.sheet);
    if (m.type !== 'audio') {
      await addClipFromMedia(m, e.target.dataset.overlay ? 'overlay' : 'main');
    } else {
      await addClipFromMedia(m, 'main');
    }
  } catch (err) {
    toast('upload failed: ' + err.message);
  }
  e.target.value = '';
}

async function loadMediaCache() {
  state.mediaCache = await api('/media').catch(() => []);
}

function mainClipAtPlayhead() {
  const tr = state.project?.tracks.find((t) => t.type === 'video');
  if (!tr) return null;
  return tr.clips.find((c) => state.t >= c.start && state.t < c.start + c.duration) || null;
}

function clipsAtPlayhead() {
  const out = [];
  for (const track of state.project?.tracks || []) {
    for (const clip of track.clips || []) {
      if (state.t >= clip.start && state.t < clip.start + clip.duration) out.push({ track, clip });
    }
  }
  return out;
}

function clipLabel(c) {
  if (c.type === 'text') return (c.text?.content || 'text').slice(0, 26);
  return (c.src || c.type).split('/').pop().replace(/\.(mp4|png|jpg|jpeg|webp|mp3|wav)$/i, '').slice(0, 24) || c.type;
}

/* ---- clip editors ---- */
function commonClipControls(s) {
  const c = s.clip;
  return `
    <div class="row" style="margin:4px 0 10px">
      <button class="chip danger" data-cmd="delete">&#10005; delete</button>
      <button class="chip" data-cmd="dup">&#9750; duplicate</button>
      <button class="chip" data-cmd="split">&#9924; split</button>
    </div>
    <div class="lbl">timing</div>
    <div class="row"><span class="val">start ${c.start.toFixed(1)}s</span><span class="val">len ${c.duration.toFixed(1)}s</span></div>
    <div class="row" style="margin-top:6px">
      <button class="chip" data-nudge="start:-0.1">&#8592; 0.1s</button>
      <button class="chip" data-nudge="start:0.1">0.1s &#8594;</button>
      <button class="chip" data-nudge="dur:-0.1">shorter</button>
      <button class="chip" data-nudge="dur:0.1">longer</button>
    </div>`;
}

function clipEditor(s, cat) {
  const c = s.clip;
  const head = `<div class="lbl">selected: <b style="color:var(--acc)">${esc(clipLabel(c))}</b> (${c.type} \u00b7 ${s.track.type} track)</div>` + commonClipControls(s);
  const transform = `
    ${ctl.slider('opacity', 'transform.opacity', c.transform?.opacity ?? 1, 0, 1, 0.05, (v) => Number(v).toFixed(2))}
    ${ctl.slider('scale', 'transform.scale', c.transform?.scale ?? 1, 0.2, 3, 0.05, (v) => Number(v).toFixed(2))}
    ${ctl.slider('rotation', 'transform.rotation', c.transform?.rotation ?? 0, -180, 180, 1, (v) => v + '\u00b0')}
    ${ctl.slider('x position', 'transform.x', c.transform?.x ?? 0, -0.5, 0.5, 0.01, (v) => Number(v).toFixed(2))}
    ${ctl.slider('y position', 'transform.y', c.transform?.y ?? 0, -0.5, 0.5, 0.01, (v) => Number(v).toFixed(2))}
    ${ctl.chips('animation in', 'anim.in', cat.anims.in.map((a) => ({ v: a, l: a })), c.anim?.in || 'none')}
    ${ctl.chips('animation out', 'anim.out', cat.anims.out.map((a) => ({ v: a, l: a })), c.anim?.out || 'none')}
    ${ctl.chips('loop animation', 'anim.loop', cat.anims.loop.map((a) => ({ v: a, l: a })), c.anim?.loop || 'none')}`;

  if (c.type === 'video' || c.type === 'image') {
    return head + `
      ${c.type === 'video' ? ctl.chips('speed', 'speed', [{ v: 0.5, l: '0.5x' }, { v: 1, l: '1x' }, { v: 1.5, l: '1.5x' }, { v: 2, l: '2x' }, { v: 3, l: '3x' }], c.speed || 1, 'num') : ''}
      ${c.type === 'video' ? ctl.slider('volume', 'volume', c.volume == null ? 1 : c.volume, 0, 2, 0.05, (v) => Number(v).toFixed(2)) : ''}
      ${c.type === 'video' ? ctl.chips('audio', 'muted', [{ v: false, l: 'on' }, { v: true, l: 'muted' }], !!c.muted, 'bool') : ''}
      ${ctl.chips('fit', 'fit', [{ v: 'cover', l: 'cover' }, { v: 'contain', l: 'contain' }, { v: 'fill', l: 'stretch' }], c.fit || 'cover')}
      <div class="lbl">flip</div>
      <div class="chips">
        <button class="chip ${c.transform?.flipH ? 'active' : ''}" data-flip="flipH">mirror &#8596;</button>
        <button class="chip ${c.transform?.flipV ? 'active' : ''}" data-flip="flipV">flip &#8597;</button>
      </div>
      ${ctl.slider('crop top', 'crop.top', (c.crop?.top ?? 0) * 100, 0, 45, 1, (v) => v + '%')}
      ${ctl.slider('crop bottom', 'crop.bottom', (c.crop?.bottom ?? 0) * 100, 0, 45, 1, (v) => v + '%')}
      ${ctl.slider('crop left', 'crop.left', (c.crop?.left ?? 0) * 100, 0, 45, 1, (v) => v + '%')}
      ${ctl.slider('crop right', 'crop.right', (c.crop?.right ?? 0) * 100, 0, 45, 1, (v) => v + '%')}
      ${ctl.chips('green screen (chroma key)', 'chroma.enabled', [{ v: true, l: 'on' }, { v: false, l: 'off' }], c.chroma?.enabled ?? false, 'bool')}
      ${c.chroma?.enabled ? `
        <div class="lbl">key color</div>
        <div class="chips">${[['#00b140', 'green'], ['#0047bb', 'blue'], ['#000000', 'black'], ['#ffffff', 'white']].map(([hex, l]) =>
          `<button class="chip ${c.chroma?.key === hex ? 'active' : ''}" data-chromakey="${hex}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};margin-right:5px"></span>${l}</button>`).join('')}</div>
        ${ctl.slider('similarity', 'chroma.similarity', c.chroma?.similarity ?? 0.35, 0.05, 0.7, 0.01, (v) => Number(v).toFixed(2))}
        ${ctl.slider('blend', 'chroma.blend', c.chroma?.blend ?? 0.12, 0, 0.4, 0.01, (v) => Number(v).toFixed(2))}` : ''}
      ${transform}`;
  }

  if (c.type === 'text') return head + textEditor(c, cat);

  if (c.type === 'sticker') {
    return head + `
      ${ctl.chips('sticker animation', 'sticker.anim', cat.anims.sticker.map((a) => ({ v: a, l: a })), c.sticker?.anim || 'none')}
      ${transform}`;
  }

  if (c.type === 'audio') {
    return head + `
      ${ctl.chips('speed', 'speed', [{ v: 0.5, l: '0.5x' }, { v: 1, l: '1x' }, { v: 1.5, l: '1.5x' }, { v: 2, l: '2x' }], c.speed || 1, 'num')}
      ${ctl.slider('volume', 'volume', c.volume == null ? 1 : c.volume, 0, 2, 0.05, (v) => Number(v).toFixed(2))}
      ${ctl.slider('fade in', 'fadeIn', c.fadeIn ?? 0, 0, 4, 0.1, (v) => Number(v).toFixed(1) + 's')}
      ${ctl.slider('fade out', 'fadeOut', c.fadeOut ?? 0, 0, 4, 0.1, (v) => Number(v).toFixed(1) + 's')}`;
  }
  return head;
}

function textEditor(c, cat) {
  const t = c.text || {};
  const colors = ['#ffffff', '#000000', '#8ace00', '#ff2d55', '#ffc400', '#00e5ff', '#ff40c4', '#7cfc00', '#3d5afe', '#ff9100'];
  return `
    ${ctl.area('text', 'text.content', t.content || '')}
    ${ctl.chips('preset', 'text.preset', cat.textPresets.map((p) => ({ v: p.id, l: p.name })), t.preset || 'none')}
    ${ctl.select('font', 'text.font', cat.fonts.map((f) => ({ v: f.id, l: f.name })), t.font || 'poppins')}
    ${ctl.slider('size', 'text.size', t.size || 110, 30, 320, 2, (v) => v + 'px')}
    <div class="lbl">color</div>
    <div class="color-row">${colors.map((cc) => `<button class="color-dot ${t.color === cc ? 'active' : ''}" data-txtcolor="${cc}" style="background:${cc}"></button>`).join('')}
      <input type="color" value="${(t.color || '#ffffff').slice(0, 7)}" data-txtcustom style="width:30px;height:30px;border:none;background:none;padding:0"></div>
    ${ctl.chips('weight', 'text.weight', [{ v: 400, l: 'regular' }, { v: 700, l: 'bold' }, { v: 800, l: 'extra' }, { v: 900, l: 'black' }], t.weight || 800, 'num')}
    ${ctl.chips('align', 'text.align', [{ v: 'left', l: 'left' }, { v: 'center', l: 'center' }, { v: 'right', l: 'right' }], t.align || 'center')}
    ${ctl.chips('uppercase', 'text.uppercase', [{ v: true, l: 'on' }, { v: false, l: 'off' }], !!t.uppercase, 'bool')}
    ${ctl.slider('letter spacing', 'text.letterSpacing', t.letterSpacing ?? 0, -5, 30, 1, (v) => v)}
    ${ctl.slider('line height', 'text.lineHeight', t.lineHeight || 1.2, 0.9, 2.2, 0.05, (v) => Number(v).toFixed(2))}
    ${ctl.chips('special animation', 'text.anim', [{ v: 'none', l: 'none' }, { v: 'typewriter', l: 'typewriter' }, { v: 'karaoke', l: 'karaoke' }, { v: 'bounce', l: 'bounce word' }, { v: 'wobble', l: 'wobble' }], t.anim || 'none')}
    ${t.anim === 'karaoke' ? ctl.text('accent color (karaoke fill)', 'text.accent', t.accent || '#ffe600') : ''}
    ${ctl.slider('stroke width', 'text.stroke.width', t.stroke?.width ?? 0, 0, 20, 0.5, (v) => v)}
    ${t.stroke?.width > 0 ? ctl.text('stroke color', 'text.stroke.color', t.stroke?.color || '#000000') : ''}
    ${ctl.chips('background box', 'text.bg.enabled', [{ v: true, l: 'on' }, { v: false, l: 'off' }], !!(t.bg?.enabled), 'bool')}
    ${t.bg?.enabled ? ctl.text('box color', 'text.bg.color', t.bg?.color || '#000000cc') : ''}
    ${transformLite}`;
}

const transformLite = `
    ${ctl.slider('opacity', 'transform.opacity', 1, 0, 1, 0.05, (v) => Number(v).toFixed(2))}
    ${ctl.slider('scale', 'transform.scale', 1, 0.2, 3, 0.05, (v) => Number(v).toFixed(2))}
    ${ctl.slider('rotation', 'transform.rotation', 0, -180, 180, 1, (v) => v + '\u00b0')}
    ${ctl.slider('x position', 'transform.x', 0, -0.5, 0.5, 0.01, (v) => Number(v).toFixed(2))}
    ${ctl.slider('y position', 'transform.y', 0, -0.5, 0.5, 0.01, (v) => Number(v).toFixed(2))}
    ${ctl.chips('animation in', 'anim.in', ['none', 'fade', 'pop', 'slideup', 'slidedown', 'slideleft', 'slideright', 'zoomin', 'bounce', 'spin'].map((a) => ({ v: a, l: a })), 'none')}
    ${ctl.chips('animation out', 'anim.out', ['none', 'fade', 'popout', 'zoomout', 'slideup', 'slideleft'].map((a) => ({ v: a, l: a })), 'none')}
    ${ctl.chips('loop animation', 'anim.loop', ['none', 'float', 'pulse', 'shake', 'wobble', 'spin', 'sway'].map((a) => ({ v: a, l: a })), 'none')}`;

/* ---- generic binder: data-act controls -> applyToClip ---- */
function bindGeneric(root) {
  $$('[data-act="range"]', root).forEach((el) => {
    el.addEventListener('input', () => {
      const span = $(`[data-val="${el.dataset.path}"]`, root);
      if (span) span.textContent = el.value;
      applyToClipQuiet(el.dataset.path, Number(el.value));
    });
    el.addEventListener('change', () => { save(); });
  });
  $$('[data-act="chip"]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const type = el.dataset.type || 'str';
      applyToClip(el.dataset.path, {
        value: el.dataset.value,
        type: type === 'num' ? 'num' : type === 'bool' ? 'bool' : 'raw',
      });
    });
  });
  $$('[data-act="select"]', root).forEach((el) => {
    el.addEventListener('change', () => applyToClip(el.dataset.path, { value: el.value, type: el.tagName === 'SELECT' && !isNaN(Number(el.value)) && el.value !== '' ? 'raw' : 'raw' }));
  });
  $$('[data-act="text"]', root).forEach((el) => {
    let t = null;
    el.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => applyToClipQuiet(el.dataset.path, el.value), 350);
    });
    el.addEventListener('change', () => { applyToClipQuiet(el.dataset.path, el.value); save(); });
  });
  $$('[data-nudge]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const [what, amt] = el.dataset.nudge.split(':');
      const s = selClip();
      if (!s) return;
      if (what === 'start') s.clip.start = Math.max(0, s.clip.start + Number(amt));
      if (what === 'dur') s.clip.duration = Math.max(0.3, s.clip.duration + Number(amt));
      save();
      openSheet('edit');
    });
  });
  $$('[data-flip]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const s = selClip();
      if (!s) return;
      const k = el.dataset.flip;
      s.clip.transform[k] = !s.clip.transform[k];
      el.classList.toggle('active');
      save();
    });
  });
  $$('[data-chromakey]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const s = selClip();
      if (!s) return;
      setPath(s.clip, 'chroma.key', el.dataset.chromakey);
      setPath(s.clip, 'chroma.enabled', true);
      save();
      openSheet('edit');
    });
  });
  $$('[data-txtcolor]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const s = selClip();
      if (!s) return;
      setPath(s.clip, 'text.color', el.dataset.txtcolor);
      save();
      openSheet('text');
    });
  });
  const tc = $('[data-txtcustom]', root);
  if (tc) tc.addEventListener('input', () => {
    const s = selClip();
    if (!s) return;
    setPath(s.clip, 'text.color', tc.value);
    save();
  });
}

function applyToClipQuiet(path, value) {
  const s = selClip();
  if (!s) return;
  setPath(s.clip, path, value);
}

/* ================= EXPORT ================= */
$('#btnExport').addEventListener('click', openExport);
$('#exportClose').addEventListener('click', () => $('#exportWrap').classList.add('hidden'));
$('#exportBackdrop').addEventListener('click', () => $('#exportWrap').classList.add('hidden'));

function openExport() {
  stopPlay();
  const ex = state.exp;
  $('#exportBody').innerHTML = `
    <div class="lbl">resolution</div>
    <div class="chips" id="expScale">
      ${['1080', '720', '480'].map((s) => `<button class="chip ${ex.scale === s ? 'active' : ''}" data-v="${s}">${s === '480' ? '480p draft' : s + 'p'}</button>`).join('')}
    </div>
    <div class="lbl">frame rate</div>
    <div class="chips" id="expFps">
      ${[24, 30].map((f) => `<button class="chip ${ex.fps === f ? 'active' : ''}" data-v="${f}">${f} fps</button>`).join('')}
    </div>
    <div class="lbl">format</div>
    <div class="chips" id="expFmt">
      ${[['mp4', 'MP4 video'], ['gif', 'GIF'], ['webm', 'WebM']].map(([v, l]) => `<button class="chip ${ex.format === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}
    </div>
    <button class="cta" id="btnStartExport">&#9889; render on server</button>
    <div id="expProg"></div>`;
  const bind = (id, key) => $$('#' + id + ' .chip').forEach((b) => b.onclick = () => {
    state.exp[key] = key === 'fps' ? Number(b.dataset.v) : b.dataset.v;
    openExport();
  });
  bind('expScale', 'scale'); bind('expFps', 'fps'); bind('expFmt', 'format');
  $('#btnStartExport').onclick = startExport;
  $('#exportWrap').classList.remove('hidden');
}

async function startExport() {
  const btn = $('#btnStartExport');
  btn.disabled = true;
  btn.textContent = 'queued\u2026';
  const prog = $('#expProg');
  try {
    const { id } = await api(`/projects/${state.project.id}/export`, { method: 'POST', body: state.exp });
    prog.innerHTML = `<div class="prog"><i id="expBar"></i></div><div style="color:var(--dim);font-size:12px" id="expMsg">rendering on server\u2026</div>`;
    const bar = $('#expBar');
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const j = await api('/jobs/' + id).catch(() => null);
      if (!j) continue;
      if (j.status === 'running') {
        bar.style.width = Math.round(j.progress * 100) + '%';
        $('#expMsg').textContent = `rendering on server\u2026 ${Math.round(j.progress * 100)}%`;
        btn.textContent = `rendering ${Math.round(j.progress * 100)}%`;
      } else if (j.status === 'done') {
        bar.style.width = '100%';
        $('#expMsg').textContent = 'done!';
        btn.textContent = '\u2713 rendered';
        prog.innerHTML += `<a class="dl-btn" href="/api/jobs/${id}/file" download>download ${state.exp.format.toUpperCase()}</a>`;
        return;
      } else if (j.status === 'error' || j.status === 'cancelled') {
        $('#expMsg').textContent = 'failed: ' + (j.error || 'unknown');
        btn.textContent = 'retry';
        btn.disabled = false;
        return;
      }
    }
    $('#expMsg').textContent = 'timeout — check jobs on the server';
  } catch (e) {
    toast('export failed: ' + e.message);
    btn.textContent = 'retry';
  }
  btn.disabled = false;
}

/* ================= NEW PROJECT MODAL ================= */
$('#btnNew').addEventListener('click', () => {
  $('#newTpl').innerHTML = `<button class="chip active" data-tpl="">blank</button>` +
    (state.catalog?.templates || []).map((t) => `<button class="chip" data-tpl="${t.id}">${esc(t.name)}</button>`).join('');
  let tpl = '';
  $$('#newTpl .chip').forEach((b) => b.onclick = () => {
    tpl = b.dataset.tpl;
    $$('#newTpl .chip').forEach((x) => x.classList.toggle('active', x === b));
  });
  let aspect = '9:16';
  $$('#newAspect .chip').forEach((b) => b.onclick = () => {
    aspect = b.dataset.a;
    $$('#newAspect .chip').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#newModal').classList.remove('hidden');
  $('#btnCancelNew').onclick = () => $('#newModal').classList.add('hidden');
  $('#btnCreate').onclick = () => {
    $('#newModal').classList.add('hidden');
    createProject({ name: $('#newName').value || 'my edit', aspect, template: tpl || undefined });
  };
});

$('#tplRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tpl]');
  if (b) createProject({ name: b.querySelector('b')?.textContent || 'template', aspect: '9:16', template: b.dataset.tpl });
});

$('#projGrid').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    del.disabled = true;
    api('/projects/' + del.dataset.del, { method: 'DELETE' }).then(loadHome);
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) openEditor(open.dataset.open);
});

$('#btnBack').addEventListener('click', goHome);
$('#btnHealth').addEventListener('click', async () => {
  try { await api('/health'); toast('server: online \u2713'); } catch { toast('server: unreachable'); }
});

/* ================= BOOT ================= */
(async function boot() {
  try {
    state.catalog = await api('/catalog');
  } catch { /* server down; home shows offline dot */ }
  await loadMediaCache();
  await loadHome();
})();
