import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const uid = (len = 10) => crypto.randomBytes(16).toString('base64url').slice(0, len);

export function readJSON(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, p);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function isHexColor(c) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(c || ''));
}

export function parseColor(c, fallback = '#000000') {
  if (!isHexColor(c)) return fallback;
  let h = c.slice(1);
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function hexToRgbaStr(c, alphaOverride = null) {
  const { r, g, b, a } = parseColor(c);
  return `rgba(${r},${g},${b},${alphaOverride == null ? a : alphaOverride})`;
}

export function secondsFmt(s) {
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}
