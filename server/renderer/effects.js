// Pixel-level effects & filter chains. All operate on a layer canvas.
// NOTE: Skia cannot read+write the same canvas in one draw; every effect that
// feeds a canvas back into itself reads from a SNAPSHOT scratch canvas instead.
import { filterPreset } from '../catalog.js';

const { createCanvas } = await import('@napi-rs/canvas');

// scratch canvas pool to reduce allocations
const scratch = new Map();
function getScratch(key, w, h) {
  const k = `${key}_${w}x${h}`;
  let c = scratch.get(k);
  if (!c || c.width !== w || c.height !== h) {
    c = createCanvas(w, h);
    scratch.set(k, c);
  }
  return c;
}

function snapshot(layer, W, H) {
  const snap = getScratch(`snap`, W, H);
  const sctx = snap.getContext('2d');
  sctx.save();
  sctx.clearRect(0, 0, W, H);
  sctx.globalCompositeOperation = 'source-over';
  sctx.drawImage(layer, 0, 0, W, H);
  sctx.restore();
  return snap;
}

/** ctx.filter CSS string from filter object + preset */
export function filterToCss(f = {}, t = 0, animatedHue = null) {
  const preset = filterPreset(f.preset || 'none');
  const adj = { ...preset, ...(f.adjust || {}) };
  const brightness = Number(f.brightness != null ? f.brightness : 1) * Number(adj.brightness || 1);
  const contrast = Number(f.contrast != null ? f.contrast : 1) * Number(adj.contrast || 1);
  const saturation = Number(f.saturation != null ? f.saturation : 1) * Number(adj.saturation || 1);
  const hue = Number(f.hue || 0) + Number(adj.hue || 0) + (animatedHue == null ? 0 : animatedHue);
  const blur = Number(f.blur || 0) + Number(adj.blurSoft || 0);
  const sepia = Number(f.sepia != null ? f.sepia : 0) + Number(adj.sepia || 0);
  const gray = Number(adj.grayscale || 0) + Number(f.grayscale || 0);
  const parts = [];
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  if (contrast !== 1) parts.push(`contrast(${contrast})`);
  if (saturation !== 1) parts.push(`saturate(${saturation})`);
  if (hue) parts.push(`hue-rotate(${hue}deg)`);
  if (sepia > 0) parts.push(`sepia(${Math.min(1, sepia)})`);
  if (gray > 0) parts.push(`grayscale(${Math.min(1, gray)})`);
  if (blur > 0) parts.push(`blur(${blur * (f.blurScale || 1)}px)`);
  return parts.join(' ') || 'none';
}

function seededNoiseCanvas(w, h, seed) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  let s = seed >>> 0 || 1;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function drawGrain(ctx, W, H, strength, t) {
  const seed = (Math.floor(t * 24) % 5) + 1;
  const nw = Math.max(2, Math.round(W / 3)), nh = Math.max(2, Math.round(H / 3));
  const nkey = `noise${seed}_${nw}x${nh}`;
  let noise = scratch.get(nkey);
  if (!noise) { noise = seededNoiseCanvas(nw, nh, seed * 7919); scratch.set(nkey, noise); }
  ctx.save();
  ctx.globalAlpha = strength * 0.35;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(noise, 0, 0, W, H);
  ctx.restore();
}

export function drawVignette(ctx, W, H, strength) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, strength)})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawScanlines(ctx, W, H, strength) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.25 * strength})`;
  const step = Math.max(2, Math.round(H / 480));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  ctx.restore();
}

export function fxPixelate(ctx, snap, W, H, strength) {
  const px = Math.max(2, Math.round(Math.pow(strength, 1.6) * W * 0.06));
  const sw = Math.max(2, Math.round(W / px)), sh = Math.max(2, Math.round(H / px));
  const small = getScratch(`pxs`, sw, sh);
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.clearRect(0, 0, sw, sh);
  sctx.drawImage(snap, 0, 0, sw, sh);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
}

export function fxMirror(ctx, snap, W, H) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(snap, 0, 0, W / 2, H, 0, 0, W / 2, H);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(snap, 0, 0, W / 2, H, 0, 0, W / 2, H);
  ctx.restore();
  ctx.restore();
}

export function fxGlow(ctx, snap, W, H, strength) {
  const glow = getScratch(`glow`, W, H);
  const gctx = glow.getContext('2d');
  gctx.save();
  gctx.clearRect(0, 0, W, H);
  gctx.filter = `blur(${Math.round(W * 0.02)}px) brightness(1.35)`;
  gctx.drawImage(snap, 0, 0);
  gctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.75 * strength;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(glow, 0, 0);
  ctx.restore();
}

export function fxRGBShift(ctx, snap, W, H, strength, t) {
  const jx = W * 0.008 * strength * (1 + 0.4 * Math.sin(t * 9.1));
  const jy = H * 0.004 * strength;
  const chan = (color) => {
    const c = getScratch(`chan_${color}`, W, H);
    const cc = c.getContext('2d');
    cc.save();
    cc.clearRect(0, 0, W, H);
    cc.drawImage(snap, 0, 0);
    cc.globalCompositeOperation = 'multiply';
    cc.fillStyle = color;
    cc.fillRect(0, 0, W, H);
    cc.restore();
    return c;
  };
  const r = chan('#ff0000'), g = chan('#00ff00'), b = chan('#0000ff');
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(r, -jx, -jy);
  ctx.drawImage(g, 0, 0);
  ctx.drawImage(b, jx, jy);
  ctx.restore();
}

export function fxGlitch(ctx, snap, W, H, strength, t) {
  const slices = 9;
  const seed = Math.floor(t * 8) + 1;
  let s = (seed * 2654435761) >>> 0 || 1;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(snap, 0, 0);
  for (let i = 0; i < slices; i++) {
    const sy = Math.floor(rand() * H);
    const sh = Math.max(4, Math.floor(rand() * H * 0.08));
    const dx = (rand() - 0.5) * W * 0.09 * strength;
    ctx.drawImage(snap, 0, sy, W, sh, dx, sy, W, sh);
    if (rand() > 0.6) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,0,80,0.25)' : 'rgba(0,255,255,0.25)';
      ctx.fillRect(0, sy, W, sh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}

export function fxDuotone(ctx, snap, W, H, strength) {
  const mono = getScratch(`duo`, W, H);
  const mc = mono.getContext('2d');
  mc.save();
  mc.clearRect(0, 0, W, H);
  mc.filter = 'grayscale(1) contrast(1.1)';
  mc.drawImage(snap, 0, 0);
  mc.filter = 'none';
  mc.globalCompositeOperation = 'multiply';
  mc.fillStyle = '#ff5cb8';
  mc.fillRect(0, 0, W, H);
  mc.globalCompositeOperation = 'screen';
  mc.fillStyle = '#12005e';
  mc.fillRect(0, 0, W, H);
  mc.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(mono, 0, 0);
  ctx.restore();
}

/** apply the full effect stack onto a layer canvas (in place) */
export function applyEffects(layer, effects, W, H, t) {
  const list = (effects || []);
  if (!list.length) return;
  const ctx = layer.getContext('2d');
  for (const ef of list) {
    const id = ef.id || ef;
    const k = ef.intensity == null ? 0.6 : ef.intensity;
    // effects that rewrite the layer read from a fresh snapshot
    const REWRITE = ['glitch', 'rgbshift', 'pixelate', 'mirror', 'glow', 'duotone'];
    const snap = REWRITE.includes(id) ? snapshot(layer, W, H) : null;
    switch (id) {
      case 'glitch': fxGlitch(ctx, snap, W, H, k, t); break;
      case 'rgbshift': fxRGBShift(ctx, snap, W, H, k, t); break;
      case 'pixelate': fxPixelate(ctx, snap, W, H, k); break;
      case 'mirror': fxMirror(ctx, snap, W, H); break;
      case 'glow': fxGlow(ctx, snap, W, H, k); break;
      case 'duotone': fxDuotone(ctx, snap, W, H, k); break;
      case 'scanlines': drawScanlines(ctx, W, H, k); break;
      case 'grain': drawGrain(ctx, W, H, k, t); break;
      case 'vignette': drawVignette(ctx, W, H, k); break;
      case 'vhs': {
        const s2 = snapshot(layer, W, H);
        fxRGBShift(ctx, s2, W, H, 0.7 * k, t);
        drawScanlines(ctx, W, H, k);
        const bandY = ((t * 0.35) % 1) * H;
        ctx.save();
        ctx.globalAlpha = 0.12 * k;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, bandY, W, H * 0.02);
        ctx.restore();
        drawGrain(ctx, W, H, k * 0.6, t);
        break;
      }
      case 'oldfilm': {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(112,66,20,0.25)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        drawGrain(ctx, W, H, Math.min(1, k + 0.3), t);
        drawVignette(ctx, W, H, k * 0.7);
        const flick = 0.85 + 0.15 * Math.abs(Math.sin(t * 31.7));
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(255,255,255,${flick})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        break;
      }
      case 'flash': {
        const p = (t * 2.4) % 1;
        if (p < 0.12) {
          ctx.save();
          ctx.globalAlpha = (1 - p / 0.12) * 0.8 * k;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
        break;
      }
      default: break;
    }
  }
}

/** transform modifications driven by transform-type effects */
export function effectTransform(effects, t) {
  let scale = 1, ox = 0, oy = 0, hue = null;
  for (const ef of effects || []) {
    const id = ef.id || ef;
    const k = ef.intensity == null ? 0.6 : ef.intensity;
    if (id === 'zoompulse') scale *= 1 + 0.05 * k * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.9));
    if (id === 'shake') { ox += (Math.sin(t * 57.3) + Math.sin(t * 23.7)) * 0.006 * k; oy += (Math.cos(t * 49.1) + Math.sin(t * 31.3)) * 0.006 * k; }
    if (id === 'rainbow') hue = ((t * 120 * Math.max(0.2, k)) % 360);
  }
  return { scale, ox, oy, hue };
}
