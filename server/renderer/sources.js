// Frame sources for the compositor.
// VideoSource: streams decoded raw frames from ffmpeg (server-side decode).
// SourcePool: per-clip decoder management for a render session.
import { spawn } from 'node:child_process';
import { ffmpegPath } from '../bin.js';
import { resolveSrc } from '../media.js';

const { createCanvas, loadImage } = await import('@napi-rs/canvas');

export function isVideoFile(src) {
  return /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(src);
}

const MAX_CACHE = 192 * 1024 * 1024;
const bitmapCache = new Map(); // key -> {bitmap, bytes}
let cacheBytes = 0;

export function cachePut(key, bitmap) {
  if (bitmapCache.has(key)) return;
  const bytes = (bitmap.width || 1) * (bitmap.height || 1) * 4;
  if (bytes > MAX_CACHE) return;
  bitmapCache.set(key, { bitmap, bytes });
  cacheBytes += bytes;
  while (cacheBytes > MAX_CACHE) {
    const first = bitmapCache.keys().next().value;
    const ent = bitmapCache.get(first);
    cacheBytes -= ent.bytes;
    bitmapCache.delete(first);
  }
}
export function cacheGet(key) {
  const ent = bitmapCache.get(key);
  if (!ent) return null;
  bitmapCache.delete(key);
  bitmapCache.set(key, ent);
  return ent.bitmap;
}
export function cacheClear() {
  bitmapCache.clear();
  cacheBytes = 0;
}

export class VideoSource {
  constructor(file, opts) {
    this.file = file;
    this.w = Math.max(2, opts.w | 0);
    this.h = Math.max(2, opts.h | 0);
    this.fps = opts.fps || 30;
    this.seek = Math.max(0, opts.seek || 0);
    this.dur = opts.dur || 0;
    this.vf = opts.vf || '';
    this.proc = null;
    this.nextIdx = 0;
    this.buf = []; // frames after idx0
    this.idx0 = 0; // index of buf[0]
    this.pending = null;
    this.eof = false;
    this.err = null;
    this._start();
  }

  args() {
    const vf = [];
    if (this.vf) vf.push(this.vf);
    vf.push(`fps=${Math.max(1, Math.min(120, this.fps))}`,
      `scale=${this.w}:${this.h}:flags=bicubic`, 'format=rgb24');
    const a = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (this.seek > 0) a.push('-ss', this.seek.toFixed(3));
    if (this.dur > 0) a.push('-t', this.dur.toFixed(3));
    a.push('-i', this.file, '-an', '-vf', vf.join(','), '-f', 'rawvideo', 'pipe:1');
    return a;
  }

  _start() {
    this.proc = spawn(ffmpegPath(), this.args(), { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.stderr.on('data', (d) => { this.err = (this.err || '') + d.toString(); });
    this.proc.on('error', (e) => { this.err = String(e); this.eof = true; });
    this.proc.stdout.on('end', () => { this.eof = true; });
  }

  get frameBytes() { return this.w * this.h * 3; }

  _readChunk() {
    return new Promise((resolve) => {
      const p = this.proc && this.proc.stdout;
      if (!p) return resolve(null);
      const onData = (c) => { cleanup(); resolve(c); };
      const onEnd = () => { cleanup(); resolve(null); };
      const cleanup = () => {
        p.removeListener('data', onData);
        p.removeListener('end', onEnd);
        p.removeListener('close', onEnd);
        p.removeListener('error', onEnd);
      };
      p.on('data', onData);
      p.on('end', onEnd);
      p.on('close', onEnd);
      p.on('error', onEnd);
    });
  }

  /** ensure frames up to and including idx exist in buf */
  async ensure(idx) {
    while (this.nextIdx <= idx) {
      if (this.eof) return false;
      const need = this.frameBytes;
      let buf = this.pending || Buffer.alloc(0);
      while (buf.length < need) {
        const chunk = await this._readChunk();
        if (!chunk) {
          if (buf.length < need) { this.eof = true; return false; }
          break;
        }
        buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      }
      this.buf.push(Buffer.from(buf.subarray(0, need)));
      this.pending = buf.length > need ? Buffer.from(buf.subarray(need)) : null;
      this.nextIdx++;
      // trim history
      while (this.idx0 < idx - 2) {
        this.buf.shift();
        this.idx0++;
      }
    }
    return true;
  }

  /** canvas bitmap of resampled frame idx (0-based from seek point) */
  async frameAt(idx) {
    if (idx < 0) idx = 0;
    if (!(await this.ensure(idx))) return null;
    const raw = this.buf[idx - this.idx0];
    if (!raw) return null;
    const c = createCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(this.w, this.h);
    const dst = imgData.data;
    const n = this.w * this.h;
    for (let i = 0, j = 0; i < n * 3; i += 3, j += 4) {
      dst[j] = raw[i]; dst[j + 1] = raw[i + 1]; dst[j + 2] = raw[i + 2]; dst[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  dispose() {
    if (this.proc) { try { this.proc.kill('SIGKILL'); } catch { /* */ } this.proc = null; }
    this.buf = [];
    this.pending = null;
    this.eof = true;
  }
}

export class SourcePool {
  constructor({ w, h, fps }) {
    this.w = w; this.h = h; this.fps = fps;
    this.decoders = new Map(); // clipId -> VideoSource
  }

  /** extraVf: ffmpeg filter chain applied BEFORE scale (e.g. colorkey) */
  async frame(clip, localT, extraVf = '') {
    const src = resolveSrc(clip.src);
    if (!src) return null;
    if (!isVideoFile(src)) {
      const key = `img:${clip.src}`;
      let bmp = cacheGet(key);
      if (!bmp) {
        try { bmp = await loadImage(src); } catch { return null; }
        cachePut(key, bmp);
      }
      return bmp;
    }
    const speed = clip.speed || 1;
    const inPoint = clip.in || 0;
    const srcTime = inPoint + localT * speed;
    let dec = this.decoders.get(clip.id);
    if (!dec || dec.src !== src || dec.vf !== extraVf || srcTime < dec.seek - 0.001 || srcTime > dec.seek + dec.fps * 3600) {
      dec?.dispose();
      dec = new VideoSource(src, {
        w: this.w, h: this.h, fps: this.fps,
        seek: srcTime,
        dur: Math.max(0.6, (clip.duration - localT) * speed + 0.6),
        vf: extraVf,
      });
      dec.src = src;
      this.decoders.set(clip.id, dec);
    }
    const steps = Math.round((srcTime - dec.seek) * this.fps);
    if (steps < 0 || steps > 1200) { // far jump -> restart
      dec.dispose();
      dec = new VideoSource(src, {
        w: this.w, h: this.h, fps: this.fps, seek: srcTime,
        dur: Math.max(0.6, (clip.duration - localT) * speed + 0.6),
        vf: extraVf,
      });
      dec.src = src;
      this.decoders.set(clip.id, dec);
    }
    const idx = Math.max(0, Math.round((srcTime - dec.seek) * this.fps));
    return dec.frameAt(idx);
  }

  dispose() {
    for (const d of this.decoders.values()) d.dispose();
    this.decoders.clear();
  }
}
