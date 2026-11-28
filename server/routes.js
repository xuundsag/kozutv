import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ASPECTS, SCALES, MAX_UPLOAD_MB, PREVIEW_W } from './config.js';
import { uid } from './util.js';
import { listProjects, getProject, saveProject, deleteProject, listMedia, getMedia, addMedia, removeMedia } from './store.js';
import { probeFile, makeThumb, bgRemove } from './media.js';
import { catalog } from './catalog.js';
import { renderFrame } from './renderer/compositor.js';
import { SourcePool, cacheClear } from './renderer/sources.js';
import { createJob, getJob, jobList } from './renderer/export.js';

const up = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIRS.uploads),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase() ||
        ({ 'video/mp4': '.mp4', 'image/png': '.png', 'image/jpeg': '.jpg', 'audio/mpeg': '.mp3', 'audio/wav': '.wav' }[file.mimetype] || '.bin');
      cb(null, `${uid(12)}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

export function buildRouter() {
  const r = express.Router();
  r.use(express.json({ limit: '12mb' }));

  r.get('/health', (req, res) => res.json({ ok: true, name: 'shoul-studio', time: Date.now() }));
  r.get('/catalog', (req, res) => res.json(catalog()));

  // ---- media ----
  r.post('/media', up.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'no file' });
      const file = req.file.path;
      const ext = path.extname(file).toLowerCase();
      const type = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(ext) ? 'video'
        : ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext) ? 'audio'
          : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext) ? 'image' : null;
      if (!type) { fs.unlinkSync(file); return res.status(400).json({ error: 'unsupported file type' }); }
      let meta = { duration: 0, width: 0, height: 0, hasAudio: false };
      if (type === 'image') {
        const sharpMod = await import('sharp');
        const info = await sharpMod.default(file).metadata();
        meta = { duration: 0, width: info.width || 0, height: info.height || 0, hasAudio: false };
      } else {
        meta = await probeFile(file);
      }
      const thumbExt = type === 'image' ? ext : '.jpg';
      const thumb = path.join(DIRS.uploads, `${path.basename(file, ext)}-thumb${thumbExt}`);
      let thumbOk = false;
      try {
        if (type === 'image') {
          const sharpMod = await import('sharp');
          await sharpMod.default(file).resize(320).jpeg({ quality: 78 }).toFile(thumb.replace('.png', '.jpg'));
          thumbOk = true;
        } else if (type === 'video') {
          thumbOk = !!(await makeThumb(file, thumb, { isVideo: true, at: Math.min(0.2, (meta.duration || 1) / 3) }));
        }
      } catch { thumbOk = false; }
      const m = addMedia({
        name: req.file.originalname || 'clip',
        type, file, size: req.file.size,
        duration: meta.duration, width: meta.width, height: meta.height,
        hasAudio: meta.hasAudio,
        thumb: thumbOk ? thumb : null,
      });
      res.json({ id: m.id, name: m.name, type: m.type, duration: m.duration, width: m.width, height: m.height, hasAudio: m.hasAudio, thumb: m.thumb ? `/media/${m.id}/thumb` : null, src: `media:${m.id}` });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  r.get('/media', (req, res) => {
    res.json(listMedia().map((m) => ({
      id: m.id, name: m.name, type: m.type, duration: m.duration,
      width: m.width, height: m.height, hasAudio: m.hasAudio,
      thumb: m.thumb ? `/media/${m.id}/thumb` : null, src: `media:${m.id}`,
    })));
  });

  r.delete('/media/:id', (req, res) => res.json({ ok: removeMedia(req.params.id) }));

  r.get('/media/:id/file', (req, res) => {
    const m = getMedia(req.params.id);
    if (!m) return res.status(404).end();
    res.setHeader('content-type', m.type === 'video' ? 'video/mp4' : m.type === 'audio' ? 'audio/mpeg' : 'image/png');
    fs.createReadStream(m.file).pipe(res);
  });
  r.get('/media/:id/thumb', (req, res) => {
    const m = getMedia(req.params.id);
    if (!m || !m.thumb || !fs.existsSync(m.thumb)) return res.status(404).end();
    res.setHeader('content-type', m.thumb.endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(m.thumb).pipe(res);
  });

  // ---- projects ----
  r.get('/projects', (req, res) => res.json(listProjects()));
  r.post('/projects', (req, res) => {
    const { name, aspect, template } = req.body || {};
    let project;
    if (template) {
      const tplPath = path.join(DIRS.assets, 'templates', `${template}.json`);
      if (!fs.existsSync(tplPath)) return res.status(404).json({ error: 'template not found' });
      project = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
      project.id = uid(10);
      project.name = name || project.name;
      if (aspect && ASPECTS[aspect]) project.aspect = aspect;
      retimeProject(project);
    } else {
      project = {
        id: uid(10),
        name: name || 'Untitled',
        aspect: ASPECTS[aspect] ? aspect : '9:16',
        fps: 30,
        bg: { type: 'color', color: '#000000' },
        tracks: [{ id: uid(8), type: 'video', name: 'main', clips: [] }],
        duration: 0,
      };
    }
    project.createdAt = Date.now();
    saveProject(project);
    res.json(project);
  });
  r.get('/projects/:id', (req, res) => {
    const p = getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json(p);
  });
  r.put('/projects/:id', (req, res) => {
    const existing = getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const p = req.body || {};
    p.id = existing.id;
    if (!ASPECTS[p.aspect]) p.aspect = existing.aspect;
    retimeProject(p);
    saveProject(p);
    res.json({ ok: true, duration: p.duration });
  });
  r.delete('/projects/:id', (req, res) => { deleteProject(req.params.id); res.json({ ok: true }); });

  // preview frame (server-rendered)
  const frameCache = new Map();
  r.get('/projects/:id/frame', async (req, res) => {
    const p = getProject(req.params.id);
    if (!p) return res.status(404).end();
    const t = Math.max(0, Number(req.query.t) || 0);
    const w = Math.max(60, Math.min(1080, Number(req.query.w) || PREVIEW_W));
    const [aw, ah] = ASPECTS[p.aspect] || ASPECTS['9:16'];
    const W = Math.round(w);
    const H = Math.round(w * ah / aw);
    const key = `${p.id}:${p.updatedAt}:${t.toFixed(3)}:${W}`;
    const hit = frameCache.get(key);
    if (hit) {
      res.setHeader('content-type', 'image/jpeg');
      return res.send(hit);
    }
    try {
      const pool = new SourcePool({ w: W, h: H, fps: 30 });
      const canvas = await renderFrame(p, t, W, H, pool);
      pool.dispose();
      cacheClear();
      const buf = canvas.toBuffer('image/jpeg', 0.82);
      if (frameCache.size > 320) frameCache.clear();
      frameCache.set(key, buf);
      res.setHeader('content-type', 'image/jpeg');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ---- jobs ----
  r.post('/projects/:id/export', (req, res) => {
    const p = getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    const { scale = 1, fps = 30, format = 'mp4', quality = 21 } = req.body || {};
    const job = createJob(p, 'export', {
      scale: SCALES[scale] != null ? SCALES[scale] : 1,
      fps: [24, 25, 30].includes(Number(fps)) ? Number(fps) : 30,
      format: ['mp4', 'webm', 'gif'].includes(format) ? format : 'mp4',
      quality, gifColors: 128,
    });
    res.json({ id: job.id });
  });
  r.post('/projects/:id/preview', (req, res) => {
    const p = getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    const job = createJob(p, 'preview', { scale: 4 / 9, fps: 24, format: 'mp4', quality: 32 });
    res.json({ id: job.id });
  });
  r.get('/jobs', (req, res) => res.json(jobList()));
  r.get('/jobs/:id', (req, res) => {
    const j = getJob(req.params.id);
    if (!j) return res.status(404).json({ error: 'not found' });
    res.json({ id: j.id, status: j.status, progress: j.progress, error: j.error, fileName: j.fileName, type: j.type, params: j.params });
  });
  r.delete('/jobs/:id', (req, res) => {
    const j = getJob(req.params.id);
    if (j) j.cancel = true;
    res.json({ ok: true });
  });
  r.get('/jobs/:id/file', (req, res) => {
    const j = getJob(req.params.id);
    if (!j || !j.file || !fs.existsSync(j.file)) return res.status(404).end();
    res.setHeader('content-disposition', `attachment; filename="${j.fileName}"`);
    res.setHeader('content-type', j.fileName.endsWith('.gif') ? 'image/gif' : j.fileName.endsWith('.webm') ? 'video/webm' : 'video/mp4');
    fs.createReadStream(j.file).pipe(res);
  });

  // ---- tools ----
  r.post('/tools/bgremove', async (req, res) => {
    try {
      const { mediaId, tolerance = 0.22, feather = 2, key = null } = req.body || {};
      const m = getMedia(mediaId);
      if (!m) return res.status(404).json({ error: 'media not found' });
      const out = path.join(DIRS.derived, `${m.id}-keyed-${uid(6)}.png`);
      await bgRemove({ mediaId, tolerance, feather, key, out });
      const nm = addMedia({
        name: `${m.name} (bg removed)`, type: 'image', file: out, derived: true,
        duration: 0, width: m.width, height: m.height, hasAudio: false, thumb: null,
      });
      const sharpMod = await import('sharp');
      const thumb = out.replace('.png', '-thumb.jpg');
      await sharpMod.default(out).resize(320).jpeg({ quality: 78 }).toFile(thumb);
      nm.thumb = thumb;
      res.json({ id: nm.id, src: `media:${nm.id}`, thumb: `/media/${nm.id}/thumb`, type: 'image' });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  return r;
}

export function retimeProject(p) {
  let maxEnd = 0;
  for (const tr of p.tracks || []) {
    for (const c of tr.clips || []) {
      c.start = Math.max(0, Number(c.start) || 0);
      c.duration = Math.max(0.1, Number(c.duration) || 1);
      maxEnd = Math.max(maxEnd, c.start + c.duration);
    }
  }
  p.duration = maxEnd;
}
