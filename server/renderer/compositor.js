// The compositor: renders any timeline time into a canvas (server-side).
import { createCanvas } from '@napi-rs/canvas';
import { parseColor } from '../util.js';
import { cacheGet, cachePut } from './sources.js';
import { resolveSrc } from '../media.js';
import { filterToCss, applyEffects, effectTransform, drawGrain } from './effects.js';
import { drawTextLayer } from './text.js';

const RAD = Math.PI / 180;

function hexVfColor(c) {
  const { r, g, b } = parseColor(c, '#00ff00');
  return `0x${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** keyed-image cache: removes bg color from an image once, reuses bitmap */
async function keyedImage(srcPath, key, tolerance) {
  const ck = `keyed:${srcPath}:${key}:${tolerance}`;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const { loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(srcPath);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const kh = key.replace('#', '');
  const kr = parseInt(kh.slice(0, 2), 16) || 0;
  const kg = parseInt(kh.slice(2, 4), 16) || 0;
  const kb = parseInt(kh.slice(4, 6), 16) || 0;
  const tol = (tolerance ?? 0.22) * 442;
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < tol) d[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  cachePut(ck, c);
  return c;
}

function drawBackground(project, ctx, W, H) {
  const bg = project.bg || { type: 'color', color: '#000000' };
  if (bg.type === 'gradient') {
    const ang = (bg.angle || 90) * RAD;
    const g = ctx.createLinearGradient(
      W / 2 - Math.cos(ang) * W / 2, H / 2 - Math.sin(ang) * H / 2,
      W / 2 + Math.cos(ang) * W / 2, H / 2 + Math.sin(ang) * H / 2
    );
    g.addColorStop(0, bg.from || '#0f0f1a');
    g.addColorStop(1, bg.to || '#31235f');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg.color || '#000000';
  }
  ctx.fillRect(0, 0, W, H);
}

/** Render a visual clip (video/image) onto its own full-size layer canvas. */
async function renderMediaLayer(clip, localT, W, H, pool) {
  const layer = createCanvas(W, H);
  const ctx = layer.getContext('2d');
  let frame = null;
  const chroma = clip.chroma;
  const src = clip.src || '';
  const isImg = !/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(src);
  if (chroma && chroma.enabled !== false && chroma.key && isImg) {
    const p = resolveSrc(src);
    if (p) frame = await keyedImage(p, chroma.key, chroma.tolerance);
  }
  if (!frame) {
    const vf = chroma && chroma.enabled !== false && chroma.key && !isImg
      ? `colorkey=${hexVfColor(chroma.key)}:${chroma.similarity ?? 0.35}:${chroma.blend ?? 0.12}`
      : '';
    frame = await pool.frame(clip, localT, vf);
  }
  if (!frame) return null;
  const fw = frame.width, fh = frame.height;
  const crop = clip.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const sx = crop.left * fw, sy = crop.top * fh;
  const sw = Math.max(2, fw * (1 - crop.left - crop.right));
  const sh = Math.max(2, fh * (1 - crop.top - crop.bottom));
  const scale = Math.min(W / sw, H / sh);
  const dw = sw * scale, dh = sh * scale;
  const effT = effectTransform(clip.effects, localT);
  const css = filterToCss(clip.filter, localT, effT.hue);
  ctx.save();
  ctx.filter = css === 'none' ? 'none' : css;
  ctx.translate(W / 2 + (effT.ox || 0) * W, H / 2 + (effT.oy || 0) * H);
  const sc = effT.scale || 1;
  ctx.scale(sc, sc);
  ctx.drawImage(frame, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  applyEffects(layer, clip.effects, W, H, localT + (clip.start || 0));
  if (clip.filter?.vignette) drawVignetteSafe(ctx, W, H, clip.filter.vignette);
  return layer;
}

function drawVignetteSafe(ctx, W, H, strength) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, strength)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** composite a media layer canvas onto main ctx with clip transform */
function compositeLayer(ctx, layer, clip, localT, W, H) {
  if (!layer) return;
  const tr = clip.transform || {};
  const opacity = tr.opacity == null ? 1 : tr.opacity;
  if (opacity <= 0) return;
  const dur = clip.anim?.dur ?? 0.5;
  let alpha = opacity;
  const t0 = clip.anim?.in || 'none';
  const t1 = clip.anim?.out || 'none';
  if (t0 === 'fade' || t0 === 'pop' || t0 === 'zoomin') alpha *= Math.min(1, localT / Math.max(0.05, dur));
  const tl = clip.duration - localT;
  if (t1 === 'fade' || t1 === 'zoomout') alpha *= Math.min(1, tl / Math.max(0.05, dur));
  const loop = clip.anim?.loop || 'none';
  let scale = (tr.scale == null ? 1 : tr.scale);
  let ox = 0, oy = 0, rot = (tr.rotation || 0) * RAD;
  if (loop === 'float') oy += Math.sin(localT * 2.2) * H * 0.008;
  if (loop === 'sway') rot += Math.sin(localT * 1.6) * 0.03;
  if (loop === 'pulse') scale *= 1 + Math.sin(localT * Math.PI * 2 * 1.4) * 0.03;
  if (loop === 'shake') { ox += Math.sin(localT * 42) * W * 0.004; oy += Math.cos(localT * 39) * H * 0.004; }
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (clip.blend && clip.blend !== 'normal') ctx.globalCompositeOperation = clip.blend;
  ctx.translate(W / 2 + (tr.x || 0) * W + ox, H / 2 + (tr.y || 0) * H + oy);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  if (tr.flipH || tr.flipV) ctx.scale(tr.flipH ? -1 : 1, tr.flipV ? -1 : 1);
  ctx.drawImage(layer, -W / 2, -H / 2);
  ctx.restore();
}

function drawTextClip(ctx, clip, localT, W, H) {
  drawTextLayer(ctx, clip, localT, W, H);
}

async function drawStickerClip(ctx, clip, localT, W, H) {
  const src = clip.src;
  let bmp = cacheGet(`stk:${src}`);
  if (!bmp) {
    const { loadImage } = await import('@napi-rs/canvas');
    const p = resolveSrc(src);
    if (!p) return;
    try { bmp = await loadImage(p); } catch { return; }
    cachePut(`stk:${src}`, bmp);
  }
  const tr = clip.transform || {};
  const anim = clip.sticker?.anim || 'none';
  const dur = clip.anim?.dur ?? 0.5;
  let scale = (tr.scale == null ? 1 : tr.scale);
  let alpha = tr.opacity == null ? 1 : tr.opacity;
  let ox = 0, oy = 0, rot = (tr.rotation || 0) * RAD;
  const k = Math.min(1, localT / Math.max(0.05, dur));
  const eob = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const tl = clip.duration - localT;
  const outK = Math.min(1, tl / Math.max(0.05, dur));
  switch (anim) {
    case 'pop': scale *= 0.3 + 0.7 * eob(Math.max(0.001, k)); alpha *= Math.min(1, k * 2); break;
    case 'pulse': scale *= 1 + Math.sin(localT * Math.PI * 2 * 1.3) * 0.07; break;
    case 'shake': ox += Math.sin(localT * 46) * W * 0.006; oy += Math.cos(localT * 41) * W * 0.006; break;
    case 'spin': rot += localT * Math.PI * 2; break;
    case 'float': oy += Math.sin(localT * 2.1) * H * 0.012; break;
    case 'bounce': oy += -Math.abs(Math.sin(localT * Math.PI * 2 * 0.9)) * H * 0.03; break;
    case 'wobble': rot += Math.sin(localT * 5) * 0.12; break;
    case 'flash': alpha *= Math.sin(localT * Math.PI * 2 * 3) > 0 ? 1 : 0.25; break;
    default: break;
  }
  const inA = clip.anim?.in || 'none';
  const outA = clip.anim?.out || 'none';
  if (inA === 'fade') alpha *= Math.min(1, k);
  if (inA === 'slideup') { alpha *= k; oy += (1 - k) * H * 0.08; }
  if (outA === 'fade') alpha *= Math.min(1, outK);
  if (outA === 'zoomout') { alpha *= outK; scale *= 0.6 + 0.4 * outK; }
  const base = Math.min(W, H) * 0.34 * scale;
  const ratio = bmp.height / bmp.width;
  const w = base, h = base * ratio;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(W / 2 + (tr.x || 0) * W + ox, H / 2 + (tr.y || 0) * H + oy);
  if (rot) ctx.rotate(rot);
  if (tr.flipH) ctx.scale(-1, 1);
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** main entry: render frame at time t into a new canvas */
export async function renderFrame(project, t, W, H, pool) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(project, ctx, W, H);

  const tracks = (project.tracks || []).filter((tr) => tr.type !== 'audio');
  for (const track of tracks) {
    const clips = (track.clips || []).slice().sort((a, b) => a.start - b.start);
    if (track.type === 'video') {
      // main track with transitions between adjacent clips
      let i = 0;
      while (i < clips.length) {
        const clip = clips[i];
        const next = clips[i + 1];
        const end = clip.start + clip.duration;
        const tr = clip.transition && clip.transition.type !== 'none' && clip.transition.dur > 0
          ? clip.transition : null;
        const winStart = next ? next.start : Infinity;
        const winEnd = next && tr ? next.start + tr.dur : -1;
        if (next && tr && t >= winStart && t < winEnd) {
          const p = Math.min(1, (t - winStart) / Math.max(0.05, tr.dur));
          const ltA = Math.min(Math.max(0.001, t - clip.start), clip.duration - 0.001);
          const ltB = Math.max(0, t - next.start);
          const layerA = await renderMediaLayer(clip, ltA, W, H, pool);
          const layerB = await renderMediaLayer(next, ltB, W, H, pool);
          switch (tr.type) {
            case 'dipblack': case 'dipwhite': {
              const col = tr.type === 'dipblack' ? '#000000' : '#ffffff';
              if (p < 0.5) {
                compositeLayer(ctx, layerA, clip, ltA, W, H);
                ctx.save(); ctx.globalAlpha = p * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore();
              } else if (layerB) {
                ctx.drawImage(layerB, 0, 0);
                ctx.save(); ctx.globalAlpha = (1 - p) * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore();
              }
              break;
            }
            case 'slideleft': case 'slideright': {
              const dir = tr.type === 'slideleft' ? -1 : 1;
              if (layerA) { ctx.save(); ctx.translate(dir * p * W, 0); ctx.drawImage(layerA, 0, 0); ctx.restore(); }
              if (layerB) { ctx.save(); ctx.translate(dir * (p - 1) * W, 0); ctx.drawImage(layerB, 0, 0); ctx.restore(); }
              break;
            }
            case 'zoomin': {
              if (layerA) {
                ctx.save();
                ctx.translate(W / 2, H / 2); ctx.scale(1 + p * 1.2, 1 + p * 1.2); ctx.translate(-W / 2, -H / 2);
                ctx.globalAlpha = 1 - p;
                ctx.drawImage(layerA, 0, 0);
                ctx.restore();
              }
              if (layerB) {
                ctx.save();
                ctx.translate(W / 2, H / 2); const s = 1.3 - 0.3 * p; ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
                ctx.globalAlpha = p;
                ctx.drawImage(layerB, 0, 0);
                ctx.restore();
              }
              break;
            }
            case 'wipeleft': case 'wipeup': {
              if (layerA) ctx.drawImage(layerA, 0, 0);
              if (layerB) {
                ctx.save();
                ctx.beginPath();
                if (tr.type === 'wipeleft') ctx.rect(p * W, 0, W, H);
                else ctx.rect(0, p * H, W, H);
                ctx.clip();
                ctx.drawImage(layerB, 0, 0);
                ctx.restore();
              }
              break;
            }
            case 'blur': {
              if (layerA) { ctx.save(); ctx.globalAlpha = 1 - p; ctx.filter = `blur(${p * 18}px)`; ctx.drawImage(layerA, 0, 0); ctx.restore(); }
              if (layerB) { ctx.save(); ctx.globalAlpha = p; ctx.filter = `blur(${(1 - p) * 18}px)`; ctx.drawImage(layerB, 0, 0); ctx.restore(); }
              break;
            }
            default: { // fade
              compositeLayer(ctx, layerA, clip, ltA, W, H);
              if (layerB) { ctx.save(); ctx.globalAlpha = p; ctx.drawImage(layerB, 0, 0); ctx.restore(); }
            }
          }
          i += 2; // skip normal draw of `next`
          continue;
        }
        if (t >= clip.start && t < end) {
          const layer = await renderMediaLayer(clip, t - clip.start, W, H, pool);
          compositeLayer(ctx, layer, clip, t - clip.start, W, H);
        }
        i++;
      }
    } else {
      for (const clip of clips) {
        const localT = t - clip.start;
        if (localT < 0 || localT >= clip.duration) continue;
        if (track.type === 'text') drawTextClip(ctx, clip, localT, W, H);
        else if (track.type === 'sticker') await drawStickerClip(ctx, clip, localT, W, H);
        else {
          const layer = await renderMediaLayer(clip, localT, W, H, pool);
          compositeLayer(ctx, layer, clip, localT, W, H);
        }
      }
    }
  }
  if (project.grain) drawGrain(ctx, W, H, project.grain, t);
  return canvas;
}
