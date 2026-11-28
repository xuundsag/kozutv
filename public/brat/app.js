/* brat generator — standalone page (uses Shoul Studio server for video export) */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const state = { mode: 'lyrics', aspect: '9:16', bg: '#8ace00', text: '#ffffff', dur: 15, anim: 'scroll' };

// load Anton from the server's bundled fonts
const font = new FontFace('Anton', 'url(/assets/fonts/Anton_400Regular.ttf)');
font.load().then((f) => document.fonts.add(f));

function lines() {
  const raw = state.mode === 'title'
    ? [$('#titleInput').value || 'brat']
    : $('#lyricsInput').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const lc = $('#lowercaseChk').checked;
  return raw.map((s) => lc ? s.toLowerCase() : s);
}

function setupCanvas() {
  const [w, h] = ASPECTS[state.aspect];
  const c = $('#stage');
  c.width = w; c.height = h;
}

function drawFrame(t) {
  const c = $('#stage');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const dur = state.dur;
  const L = lines();
  ctx.save();
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = state.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.filter = 'blur(0.6px)';

  if (state.mode === 'title') {
    const txt = L[0] || 'brat';
    let size = Math.min(W * 0.34, (W * 1.7) / Math.max(3, txt.length));
    ctx.font = `700 ${size}px Anton, Arial`;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1.12, 1.3);
    ctx.fillText(txt, 0, 0, W * 0.92);
    ctx.restore();
    ctx.restore();
    return;
  }

  const per = dur / Math.max(1, L.length);
  const idx = Math.min(L.length - 1, Math.floor(t / per));
  const local = t - idx * per;
  const txt = L[idx] || '';
  let size = Math.min(W * 0.16, (W * 1.45) / Math.max(6, txt.length));
  ctx.font = `700 ${size}px Anton, Arial`;

  if (state.anim === 'type') {
    const chars = Math.floor((local / Math.min(per * 0.7, 1.2)) * txt.length);
    const shown = txt.slice(0, Math.max(0, chars));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1.06, 1.22);
    ctx.fillText(shown, 0, 0, W * 0.94);
    ctx.restore();
  } else if (state.anim === 'pop') {
    const k = Math.min(1, local / 0.35);
    const s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
    const fade = Math.min(1, (per - local) / 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(W / 2, H / 2); ctx.scale(1.06 * s, 1.22 * s);
    ctx.fillText(txt, 0, 0, W * 0.94);
    ctx.restore();
  } else if (state.anim === 'static') {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1.06, 1.22);
    ctx.fillText(txt, 0, 0, W * 0.94);
    ctx.restore();
  } else { // scroll: line slides up through the frame
    const p = local / per;
    const y = H * 1.15 - p * H * 1.3;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(1.06, 1.22);
    ctx.fillText(txt, 0, 0, W * 0.94);
    ctx.restore();
  }
  ctx.restore();
}

let playing = false, t0 = 0, raf = 0;
function tick() {
  if (!playing) return;
  const t = ((Date.now() - t0) / 1000) % state.dur;
  drawFrame(t);
  $('#progressBar').style.width = (t / state.dur * 100) + '%';
  raf = requestAnimationFrame(tick);
}
function play() {
  if (playing) { playing = false; cancelAnimationFrame(raf); $('#btnPlay').innerHTML = '&#9654;'; drawFrame(0); return; }
  playing = true; t0 = Date.now(); $('#btnPlay').innerHTML = '&#9208;';
  tick();
}

function render() {
  setupCanvas();
  drawFrame(0);
  $('#durVal').textContent = state.dur + 's';
}

// controls
$$('.tab').forEach((b) => b.onclick = () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
  state.mode = b.dataset.mode;
  $('#titleWrap').classList.toggle('hidden', state.mode !== 'title');
  $('#lyricsWrap').classList.toggle('hidden', state.mode !== 'lyrics');
  render();
});
$$('#aspectSeg button').forEach((b) => b.onclick = () => {
  $$('#aspectSeg button').forEach((x) => x.classList.toggle('active', x === b));
  state.aspect = b.dataset.aspect;
  render();
});
$$('.swatch[data-bg]').forEach((b) => b.onclick = () => {
  $$('.swatch').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  state.bg = b.dataset.bg;
  state.text = b.dataset.text;
  render();
});
$('#customBg').oninput = (e) => {
  $$('.swatch').forEach((x) => x.classList.remove('active'));
  $('.swatch.custom').classList.add('active');
  state.bg = e.target.value;
  const r = parseInt(e.target.value.slice(1, 3), 16), g = parseInt(e.target.value.slice(3, 5), 16), bl = parseInt(e.target.value.slice(5, 7), 16);
  state.text = (r * 0.299 + g * 0.587 + bl * 0.114) > 150 ? '#111111' : '#ffffff';
  render();
};
$('#animSelect').onchange = (e) => { state.anim = e.target.value; };
$('#durRange').oninput = (e) => { state.dur = Number(e.target.value); $('#durVal').textContent = state.dur + 's'; };
$('#lowercaseChk').onchange = render;
$('#lyricsInput').oninput = render;
$('#titleInput').oninput = render;
$('#btnPlay').onclick = play;
$('#restartBtn').onclick = () => { t0 = Date.now(); if (!playing) play(); };

// PNG download
$('#dlPng').onclick = () => {
  drawFrame(state.mode === 'title' ? 0 : 0.01);
  const a = document.createElement('a');
  a.download = 'brat-cover.png';
  a.href = $('#stage').toDataURL('image/png');
  a.click();
  $('#recHint').textContent = 'cover png saved \u2713';
};

// video export via server (same renderer as the main editor)
$('#dlVideo').onclick = async () => {
  const btn = $('#dlVideo');
  btn.disabled = true;
  $('#recHint').textContent = 'rendering on server\u2026';
  try {
    const L = lines();
    const per = Math.max(1.2, state.dur / Math.max(1, L.length));
    const clips = L.map((line, i) => ({
      id: 't' + i, type: 'text', start: i * per, duration: per,
      text: { content: line, preset: 'brat', font: 'anton', weight: 400, size: state.mode === 'title' ? 300 : 165, color: state.text, align: 'center', lineHeight: 1.18, anim: state.anim === 'type' ? 'typewriter' : state.anim === 'pop' ? 'pop' : 'none' },
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      anim: { in: state.anim === 'pop' ? 'pop' : 'none', out: 'none', loop: 'none', dur: 0.4 },
    }));
    const body = {
      id: 'brat' + Date.now().toString(36), name: 'brat-lyrics', aspect: state.aspect, fps: 30,
      bg: { type: 'color', color: state.bg },
      tracks: [{ id: 'tr1', type: 'text', name: 'lyrics', clips }],
      duration: state.dur,
    };
    const pr = await (await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const job = await (await fetch(`/api/projects/${pr.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scale: '1080', fps: 30, format: 'mp4' }) })).json();
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await (await fetch('/api/jobs/' + job.id)).json();
      $('#recHint').textContent = `rendering on server\u2026 ${Math.round((st.progress || 0) * 100)}%`;
      if (st.status === 'done') {
        const a = document.createElement('a');
        a.href = `/api/jobs/${job.id}/file`;
        a.download = st.fileName;
        a.click();
        $('#recHint').textContent = 'video saved \u2713 silent clip \u2014 add your song on instagram';
        break;
      }
      if (st.status === 'error') throw new Error(st.error);
    }
  } catch (e) {
    $('#recHint').textContent = 'render failed: ' + e.message;
  }
  btn.disabled = false;
};

render();
