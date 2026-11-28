// Resolve ffmpeg / ffprobe binaries:
// 1. env FFMPEG_PATH / FFPROBE_PATH
// 2. optional npm packages ffmpeg-static / ffprobe-static
// 3. system PATH
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function existsExec(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function fromNpm(name, sub) {
  try {
    const mod = require(name);
    const p = typeof mod === 'string' ? mod : (mod.path || (mod.default));
    if (p && existsExec(p)) return p;
    if (sub) {
      const alt = path.join(path.dirname(require.resolve(path.join(name, 'package.json'))), sub);
      if (existsExec(alt)) return alt;
    }
  } catch { /* not installed */ }
  return null;
}

function fromPath(bin) {
  try {
    const out = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

let _ffmpeg, _ffprobe;

export function ffmpegPath() {
  if (_ffmpeg) return _ffmpeg;
  _ffmpeg =
    process.env.FFMPEG_PATH ||
    fromNpm('ffmpeg-static') ||
    fromNpm('ffmpeg-static', 'ffmpeg') ||
    fromPath('ffmpeg');
  if (!_ffmpeg) throw new Error('ffmpeg not found. Install it (apt install ffmpeg) or `npm i ffmpeg-static`.');
  return _ffmpeg;
}

export function ffprobePath() {
  if (_ffprobe) return _ffprobe;
  _ffprobe =
    process.env.FFPROBE_PATH ||
    fromNpm('ffprobe-static', path.join('bin', process.platform, 'x64', 'ffprobe')) ||
    fromPath('ffprobe');
  if (!_ffprobe) throw new Error('ffprobe not found. Install it (apt install ffmpeg) or `npm i ffprobe-static`.');
  return _ffprobe;
}
