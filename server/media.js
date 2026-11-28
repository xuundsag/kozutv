// Media handling: uploads, probing, thumbnails, derived assets (bg removal)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DIRS, MAX_UPLOAD_MB } from './config.js';
import { ffprobePath, ffmpegPath } from './bin.js';
import { getMedia, addMedia } from './store.js';

const pExecFile = promisify(execFile);

export async function probeFile(file) {
  const { stdout } = await pExecFile(ffprobePath(), [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const info = JSON.parse(stdout);
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  const a = (info.streams || []).find((s) => s.codec_type === 'audio');
  return {
    duration: info.format ? Number(info.format.duration || 0) : 0,
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    fps: v && v.avg_frame_rate && v.avg_frame_rate !== '0/0'
      ? Number(v.avg_frame_rate.split('/').reduce((a, b) => Number(a) / Number(b)).toFixed(3))
      : 30,
    hasAudio: !!a,
    videoCodec: v ? v.codec_name : null,
    rotation: v && v.tags && v.tags.rotate ? Number(v.tags.rotate) : 0,
  };
}

export function mediaPath(id) {
  const m = getMedia(id);
  return m ? m.file : null;
}

// Resolve clip src refs to disk paths
export function resolveSrc(src) {
  if (!src) return null;
  if (src.startsWith('media:')) return mediaPath(src.slice(6));
  if (src.startsWith('asset:')) {
    const rel = src.slice(6);
    const p = path.join(DIRS.assets, rel);
    return fs.existsSync(p) ? p : null;
  }
  if (fs.existsSync(src)) return src;
  return null;
}

export async function makeThumb(file, out, { isVideo = true, at = 0.1, width = 320 } = {}) {
  const args = ['-y', '-v', 'quiet'];
  if (isVideo) args.push('-ss', String(at));
  args.push('-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, out);
  await pExecFile(ffmpegPath(), args);
  return fs.existsSync(out) ? out : null;
}

// ---- background removal (chroma-key style, works on any dominant bg) ----
async function loadImageBitmap(file) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(file);
  return img;
}

export async function bgRemove({ mediaId, tolerance = 0.22, feather = 2, key = null, out }) {
  const m = getMedia(mediaId);
  if (!m || m.type !== 'image') throw new Error('bg remove currently supports image media');
  const { createCanvas } = await import('@napi-rs/canvas');
  const img = await loadImageBitmap(m.file);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);

  let keyRGB;
  if (key) {
    const h = key.replace('#', '');
    keyRGB = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else {
    // sample the 4 corners
    const corners = [
      [0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1],
      [Math.floor(c.width / 2), 0], [0, Math.floor(c.height / 2)],
    ];
    let r = 0, g = 0, b = 0;
    for (const [x, y] of corners) {
      const i = (y * c.width + x) * 4;
      r += data.data[i]; g += data.data[i + 1]; b += data.data[i + 2];
    }
    keyRGB = [r / corners.length, g / corners.length, b / corners.length];
  }

  const tol = tolerance * 442; // max rgb distance
  const d = data.data;
  const alphaMask = new Float32Array(c.width * c.height);
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    const dr = d[i] - keyRGB[0], dg = d[i + 1] - keyRGB[1], db = d[i + 2] - keyRGB[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    alphaMask[px] = dist < tol ? 0 : 1;
  }
  // feather: simple box blur on the alpha mask
  if (feather > 0) {
    const w = c.width, h = c.height;
    const copy = alphaMask.slice();
    const r = Math.max(1, Math.round(feather));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            sum += copy[yy * w + xx]; n++;
          }
        }
        alphaMask[y * w + x] = sum / n;
      }
    }
  }
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    d[i + 3] = Math.round(255 * alphaMask[px]);
  }
  ctx.putImageData(data, 0, 0);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, c.toBuffer('image/png'));
  return out;
}
