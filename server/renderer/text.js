// Text layer rendering: fonts, presets, wrapping, animations (incl. karaoke)
import { fontById, textPreset } from '../catalog.js';

const { createCanvas } = await import('@napi-rs/canvas');

const RAD = Math.PI / 180;

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

export function mergedTextStyle(clip) {
  const preset = textPreset(clip.text?.preset || 'none');
  const t = clip.text || {};
  return {
    font: t.font || preset.font || 'poppins',
    weight: t.weight || preset.weight || 800,
    size: t.size || preset.size || 110,
    color: t.color || preset.color || '#ffffff',
    accent: t.accent || preset.accent || null,
    gradient: t.gradient || preset.gradient || null,
    align: t.align || preset.align || 'center',
    valign: t.valign || preset.valign || 'middle',
    lineHeight: t.lineHeight || preset.lineHeight || 1.2,
    letterSpacing: t.letterSpacing == null ? (preset.letterSpacing || 0) : t.letterSpacing,
    uppercase: t.uppercase == null ? (preset.uppercase || false) : t.uppercase,
    stroke: { width: 0, color: '#000000', ...(preset.stroke || {}), ...(t.stroke || {}) },
    shadow: { blur: 0, x: 0, y: 0, color: '#00000000', ...(preset.shadow || {}), ...(t.shadow || {}) },
    bg: { enabled: false, color: '#000000cc', padX: 24, padY: 14, radius: 12, ...(preset.bg || {}), ...(t.bg || {}) },
    anim: t.anim || preset.anim || 'none',
    maxW: t.maxW || 0.88,
  };
}

function fontStr(style, px) {
  const fam = fontById(style.font).family;
  return `${style.weight} ${px}px "${fam}"`;
}

function layoutWords(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  let curW = 0;
  const spaceW = ctx.measureText(' ').width;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (cur.length && curW + spaceW + ww > maxW) {
      lines.push({ words: cur, width: curW });
      cur = []; curW = 0;
    }
    cur.push({ text: w, w: ww });
    curW += (cur.length > 1 ? spaceW : 0) + ww;
  }
  if (cur.length) lines.push({ words: cur, width: curW });
  return { lines, spaceW };
}

/** Draw one text clip onto ctx at time localT (clips canvas state; caller saves/restores) */
export function drawTextLayer(ctx, clip, localT, W, H) {
  const t = clip.text || {};
  const style = mergedTextStyle(clip);
  let content = t.content == null ? 'text' : String(t.content);
  if (style.uppercase) content = content.toUpperCase();
  if (!content.trim()) return;

  const px = Math.max(8, style.size * (W / 1080));
  ctx.font = fontStr(style, px);
  ctx.textAlign = 'center';
  try { ctx.letterSpacing = `${style.letterSpacing * (W / 1080)}px`; } catch { /* not supported */ }
  ctx.textBaseline = 'middle';

  const maxW = Math.min(style.maxW, 0.98) * W;
  const { lines, spaceW } = layoutWords(ctx, content, maxW);
  const lineH = px * style.lineHeight;
  const blockH = lines.length * lineH;
  const blockW = Math.max(...lines.map((l) => l.width), 1);

  // base position (centered), then transform offsets
  const tr = clip.transform || {};
  let cx = W / 2 + (tr.x || 0) * W;
  let cy = H / 2 + (tr.y || 0) * H;

  // entrance / exit anim state
  const anim = style.anim;
  const dur = clip.anim?.dur ?? 0.5;
  let alpha = tr.opacity == null ? 1 : tr.opacity;
  let scale = tr.scale == null ? 1 : tr.scale;
  let offY = 0, offX = 0, rot = (tr.rotation || 0) * RAD;
  const inA = clip.anim?.in || 'none', outA = clip.anim?.out || 'none';
  const fadeIn = Math.min(1, localT / Math.max(0.05, dur));
  const timeLeft = clip.duration - localT;
  const fadeOut = Math.min(1, timeLeft / Math.max(0.05, dur));

  const applyIn = (name, k) => { // k 0..1
    if (name === 'fade') alpha *= k;
    else if (name === 'pop') { alpha *= k; scale *= 0.4 + 0.6 * easeOutBack(k); }
    else if (name === 'zoomin') { alpha *= k; scale *= 0.6 + 0.4 * k; }
    else if (name === 'slideup') { alpha *= k; offY += (1 - easeOutCubic(k)) * H * 0.12; }
    else if (name === 'slidedown') { alpha *= k; offY -= (1 - easeOutCubic(k)) * H * 0.12; }
    else if (name === 'slideleft') { alpha *= k; offX += (1 - easeOutCubic(k)) * W * 0.2; }
    else if (name === 'slideright') { alpha *= k; offX -= (1 - easeOutCubic(k)) * W * 0.2; }
    else if (name === 'bounce') { alpha *= k; scale *= 0.5 + 0.5 * Math.abs(Math.sin(k * Math.PI * 2.2)) * 0.5 + 0.5 * k; }
    else if (name === 'spin') { alpha *= k; rot += (1 - k) * Math.PI * 2; }
  };
  const applyOut = (name, k) => {
    if (name === 'fade') alpha *= k;
    else if (name === 'popout') { alpha *= k; scale *= 1 + (1 - k) * 0.4; }
    else if (name === 'zoomout') { alpha *= k; scale *= 0.6 + 0.4 * k; }
    else if (name === 'slideup') { alpha *= k; offY -= (1 - k) * H * 0.12; }
    else if (name === 'slideleft') { alpha *= k; offX -= (1 - k) * W * 0.2; }
  };
  if (inA !== 'none') applyIn(inA, fadeIn); else if (anim === 'pop') applyIn('pop', fadeIn);
  if (outA !== 'none') applyOut(outA, fadeOut);

  // loop anims
  const loop = clip.anim?.loop || 'none';
  const lt = localT;
  if (loop === 'float') offY += Math.sin(lt * 2.2) * H * 0.008;
  if (loop === 'sway') rot += Math.sin(lt * 1.6) * 0.03;
  if (loop === 'shake') { offX += Math.sin(lt * 42) * W * 0.004; offY += Math.cos(lt * 39) * H * 0.004; }
  if (loop === 'pulse') scale *= 1 + Math.sin(lt * Math.PI * 2 * 1.4) * 0.03;
  if (loop === 'wobble') scale *= 1 + Math.sin(lt * Math.PI * 2 * 1.1) * 0.02;

  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  ctx.translate(cx + offX, cy + offY);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);

  // background box
  if (style.bg.enabled) {
    const padX = style.bg.padX * (W / 1080);
    const padY = style.bg.padY * (W / 1080);
    const bw = blockW + padX * 2;
    const bh = blockH + padY * 2;
    ctx.fillStyle = style.bg.color;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, style.bg.radius * (W / 1080));
      ctx.fill();
    } else {
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
  }

  // vertical start
  let y = -blockH / 2 + lineH / 2;

  const shadow = style.shadow;
  const drawLineBase = (words, lineIdx, lineWidth) => {
    const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - lineWidth : -lineWidth / 2;
    let x = x0;
    for (const w of words) {
      if (shadow.blur || shadow.x || shadow.y) {
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur * (W / 1080);
        ctx.shadowOffsetX = shadow.x * (W / 1080);
        ctx.shadowOffsetY = shadow.y * (W / 1080);
      }
      if (style.stroke.width > 0) {
        ctx.lineWidth = style.stroke.width * (W / 1080) * 2;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = style.stroke.color;
        ctx.strokeText(w.text, x + w.w / 2, y + lineIdx * lineH);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
      x += w.w + spaceW;
    }
  };

  // fills (with anim variants)
  const fillMode = anim;
  const grad = style.gradient;
  let fillGradient = null;
  if (grad && grad.length >= 2) {
    fillGradient = ctx.createLinearGradient(-blockW / 2, 0, blockW / 2, 0);
    fillGradient.addColorStop(0, grad[0]);
    fillGradient.addColorStop(1, grad[1]);
  }

  const totalLen = content.replace(/\s+/g, '').length || 1;
  const progress = Math.min(1, localT / Math.max(0.3, clip.duration));

  if (fillMode === 'typewriter') {
    const chars = Math.floor(content.length * Math.min(1, localT / Math.max(0.5, clip.duration * 0.8)));
    const shown = content.slice(0, chars);
    const shownLines = layoutWords(ctx, shown, maxW);
    let yy = -shownLines.lines.length * lineH / 2 + lineH / 2;
    ctx.fillStyle = fillGradient || style.color;
    for (const line of shownLines.lines) {
      const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - line.width : -line.width / 2;
      let x = x0;
      for (const w of line.words) { ctx.fillText(w.text, x + w.w / 2, yy); x += w.w + spaceW; }
      yy += lineH;
    }
  } else if (fillMode === 'karaoke' && style.accent) {
    let consumed = 0;
    let yy = y;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - line.width : -line.width / 2;
      let x = x0;
      for (const w of line.words) {
        const startFrac = consumed / totalLen;
        const endFrac = (consumed + w.text.length) / totalLen;
        const lit = progress >= endFrac ? 1 : progress > startFrac ? (progress - startFrac) / (endFrac - startFrac) : 0;
        drawLineBase([{ text: w.text, w: w.w }], 0, line.width);
        ctx.save();
        ctx.translate(0, yy - (y));
        ctx.fillStyle = lit >= 1 ? style.accent : style.color;
        ctx.fillText(w.text, x + w.w / 2, y);
        if (lit > 0 && lit < 1) {
          // partial word: overdraw base then clip-width accent
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y - lineH / 2 - px, w.w * lit, lineH + px * 2);
          ctx.clip();
          ctx.fillStyle = style.accent;
          ctx.fillText(w.text, x + w.w / 2, y);
          ctx.restore();
        }
        ctx.restore();
        x += w.w + spaceW;
        consumed += w.text.length;
      }
      yy += lineH;
    }
  } else if (fillMode === 'bounce') {
    // per-word stagger pop
    let consumed = 0;
    let yy = y;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - line.width : -line.width / 2;
      let x = x0;
      for (const w of line.words) {
        const start = (consumed / totalLen) * Math.min(1.6, clip.duration * 0.6);
        const k = Math.min(1, Math.max(0, (localT - start) / 0.4));
        const s = 0.3 + 0.7 * easeOutBack(Math.max(0.001, k));
        drawLineBase([{ text: w.text, w: w.w }], 0, line.width);
        ctx.save();
        ctx.translate(x + w.w / 2, yy);
        ctx.scale(s, s);
        ctx.fillStyle = fillGradient || style.color;
        ctx.fillText(w.text, 0, 0);
        ctx.restore();
        x += w.w + spaceW;
        consumed += w.text.length;
      }
      yy += lineH;
    }
  } else {
    // standard fill (with optional per-word wobble)
    let yy = y;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      drawLineBase(line.words, li, line.width);
      const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - line.width : -line.width / 2;
      let x = x0;
      for (const w of line.words) {
        let wx = x + w.w / 2, wy = yy;
        if (fillMode === 'wobble') {
          wx += Math.sin(localT * 6 + w.w) * px * 0.02;
          wy += Math.cos(localT * 5 + x) * px * 0.03;
        }
        ctx.fillStyle = fillGradient || style.color;
        ctx.fillText(w.text, wx, wy);
        x += w.w + spaceW;
      }
      yy += lineH;
    }
  }
  ctx.restore();
}

/** approximate text block size (for hit testing / UI) */
export function textBlockSize(clip, W, H) {
  const style = mergedTextStyle(clip);
  const px = Math.max(8, style.size * (W / 1080));
  const c = createCanvas(10, 10);
  const ctx = c.getContext('2d');
  ctx.font = fontStr(style, px);
  const content = (clip.text?.content || '').trim();
  const { lines } = layoutWords(ctx, content, Math.min(style.maxW, 0.98) * W);
  return {
    w: Math.max(...lines.map((l) => l.width), px),
    h: lines.length * px * style.lineHeight,
  };
}
