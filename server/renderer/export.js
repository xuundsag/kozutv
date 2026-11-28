// Render job manager: timeline JSON -> mp4/webm/gif via ffmpeg (server-side encode)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ASPECTS, SCALES } from '../config.js';
import { ffmpegPath } from '../bin.js';
import { resolveSrc } from '../media.js';
import { uid } from '../util.js';
import { renderFrame } from './compositor.js';
import { SourcePool, cacheClear } from './sources.js';
import { buildAudioMix } from './audio.js';

const jobs = new Map();
let running = null;
const probeCache = new Map();

export function jobList() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(j => ({
    id: j.id, projectId: j.projectId, type: j.type, status: j.status,
    progress: j.progress, error: j.error, file: j.file, fileName: j.fileName,
    params: j.params, createdAt: j.createdAt, finishedAt: j.finishedAt,
  }));
}

export function getJob(id) { return jobs.get(id) || null; }

export function createJob(project, type, params) {
  const job = {
    id: uid(10),
    projectId: project.id,
    project,
    type, // 'export' | 'preview'
    params,
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
    cancel: false,
  };
  jobs.set(job.id, job);
  queueNext();
  return job;
}

function queueNext() {
  if (running) return;
  const next = [...jobs.values()].filter((j) => j.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!next) return;
  running = next;
  runJob(next).catch((e) => {
    next.status = 'error';
    next.error = String(e);
  }).finally(() => {
    running = null;
    queueNext();
  });
}

async function probeHasAudio(srcPath) {
  if (probeCache.has(srcPath)) return probeCache.get(srcPath);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { ffprobePath } = await import('../bin.js');
  const p = promisify(execFile);
  let has = false;
  try {
    const { stdout } = await p(ffprobePath(), ['-v', 'quiet', '-print_format', 'json', '-show_streams', srcPath]);
    has = JSON.parse(stdout).streams?.some((s) => s.codec_type === 'audio') || false;
  } catch { has = false; }
  probeCache.set(srcPath, has);
  return has;
}

async function collectAudioSegments(project) {
  const segs = [];
  for (const track of project.tracks || []) {
    if (track.type === 'audio') {
      for (const clip of track.clips || []) {
        segs.push({
          path: resolveSrc(clip.src),
          start: clip.start, dur: clip.duration, in: clip.in || 0,
          speed: clip.speed || 1,
          volume: clip.volume == null ? 1 : clip.volume,
          fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0,
        });
      }
    } else if (track.type === 'video') {
      for (const clip of track.clips || []) {
        if (clip.muted || clip.type !== 'video') continue;
        const p = resolveSrc(clip.src);
        if (!p) continue;
        if (await probeHasAudio(p)) {
          segs.push({
            path: p, start: clip.start, dur: clip.duration, in: clip.in || 0,
            speed: clip.speed || 1,
            volume: clip.volume == null ? 1 : clip.volume,
            fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0,
          });
        }
      }
    }
  }
  return segs;
}

async function runJob(job) {
  const { project, params } = job;
  job.status = 'running';
  job.progress = 0;
  const [aw, ah] = ASPECTS[project.aspect] || ASPECTS['9:16'];
  const isGif = params.format === 'gif';
  const scale = isGif ? Math.min(params.scale || 1, 0.34) : (params.scale || 1);
  const W = Math.round((aw * scale) / 2) * 2;
  const H = Math.round((ah * scale) / 2) * 2;
  const fps = isGif ? Math.min(params.fps || 30, 15) : (params.fps || 30);
  const totalDur = Math.max(0.1, project.duration || 1);
  const totalFrames = Math.max(1, Math.round(totalDur * fps));

  const ext = isGif ? 'gif' : (params.format === 'webm' ? 'webm' : 'mp4');
  const fileName = `${(project.name || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}-${job.id}.${ext}`;
  const file = path.join(DIRS.renders, fileName);
  job.file = file;
  job.fileName = fileName;

  const segs = await collectAudioSegments(project);
  const mix = buildAudioMix(segs, totalDur, 1); // audio inputs start after the video pipe
  const isPreview = job.type === 'preview';
  const withAudio = !isGif && !!mix;

  const encArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin'];
  encArgs.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0');
  if (withAudio) encArgs.push(...mix.inputs);
  if (withAudio) encArgs.push('-filter_complex', mix.filter, '-map', '0:v', '-map', mix.map);
  if (ext === 'mp4') {
    encArgs.push('-c:v', 'libx264', '-preset', isPreview ? 'ultrafast' : 'veryfast',
      '-crf', isPreview ? '30' : String(params.quality || 21), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (withAudio) encArgs.push('-c:a', 'aac', '-b:a', '192k');
    else encArgs.push('-an');
    encArgs.push('-t', totalDur.toFixed(3));
  } else if (ext === 'webm') {
    encArgs.push('-c:v', 'libvpx', '-b:v', '3M', '-deadline', 'realtime', '-cpu-used', '8',
      '-pix_fmt', 'yuv420p', '-auto-alt-ref', '0');
    if (withAudio) encArgs.push('-c:a', 'libvorbis'); else encArgs.push('-an');
    encArgs.push('-t', totalDur.toFixed(3));
  } else { // gif
    encArgs.push('-vf', `fps=${fps},split[s0][s1];[s0]palettegen=max_colors=${params.gifColors || 128}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0');
  }
  encArgs.push(file);

  const proc = spawn(ffmpegPath(), encArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });
  job.proc = proc;

  // stdin backpressure without per-write listeners
  const pipeState = { stdinFailed: false, drainWait: null };
  proc.stdin.on('drain', () => {
    const w = pipeState.drainWait;
    pipeState.drainWait = null;
    if (w) w(true);
  });
  proc.stdin.on('error', () => { pipeState.stdinFailed = true; });
  proc.stdin.on('close', () => { pipeState.stdinFailed = true; });

  const pipeError = new Promise((_, rej) => proc.on('exit', (code) => {
    if (code !== 0 && !job.cancel) rej(new Error(`ffmpeg exited ${code}: ${stderr}`));
  }));
  pipeError.catch(() => { /* handled where awaited */ });

  const pool = new SourcePool({ w: W, h: H, fps });
  let failed = null;
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (job.cancel) break;
      const t = f / fps;
      const canvas = await renderFrame(project, t, W, H, pool);
      const ctx = canvas.getContext('2d');
      const rgba = ctx.getImageData(0, 0, W, H).data;
      if (!(await writeChunk(proc.stdin, Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), pipeState))) break;
      job.progress = Math.min(0.92, (f + 1) / totalFrames * 0.92);
    }
  } catch (e) {
    failed = e;
  } finally {
    pool.dispose();
    cacheClear();
  }
  try { proc.stdin.end(); } catch { /* */ }

  if (failed) {
    try { proc.kill('SIGKILL'); } catch { /* */ }
    job.status = 'error';
    job.error = String(failed.message || failed);
    return;
  }
  try {
    await Promise.race([pipeError, new Promise((r) => proc.on('exit', r))]);
  } catch (e) {
    job.status = 'error';
    job.error = String(e.message || e);
    return;
  }
  if (job.cancel) {
    try { fs.unlinkSync(file); } catch { /* */ }
    job.status = 'cancelled';
    return;
  }
  job.progress = 1;
  job.status = fs.existsSync(file) && fs.statSync(file).size > 0 ? 'done' : 'error';
  if (job.status === 'error') job.error = 'empty output';
  job.finishedAt = Date.now();
}

function writeChunk(stream, buf, state) {
  return new Promise((resolve) => {
    if (stream.destroyed || state.stdinFailed) return resolve(false);
    const ok = stream.write(buf);
    if (ok) return resolve(true);
    state.drainWait = resolve;
  });
}
