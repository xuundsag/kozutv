// Simple JSON file store: projects + media registry
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from './config.js';
import { readJSON, writeJSON, uid } from './util.js';

const PROJECTS_DIR = path.join(DIRS.data, 'projects');
const MEDIA_REGISTRY = path.join(DIRS.data, 'media.json');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export function listProjects() {
  const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
  const list = files
    .map((f) => readJSON(path.join(PROJECTS_DIR, f)))
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      aspect: p.aspect,
      duration: p.duration || 0,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      cover: `/api/projects/${p.id}/frame?t=0.6&w=360`,
    }));
  return list;
}

export function getProject(id) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null;
  return readJSON(path.join(PROJECTS_DIR, `${id}.json`));
}

export function saveProject(project) {
  project.updatedAt = Date.now();
  writeJSON(path.join(PROJECTS_DIR, `${project.id}.json`), project);
  return project;
}

export function deleteProject(id) {
  const p = path.join(PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// media registry ------------------------------------------------------------
let mediaCache = null;
function loadMedia() {
  if (!mediaCache) mediaCache = readJSON(MEDIA_REGISTRY, []);
  return mediaCache;
}
function saveMediaRegistry() {
  writeJSON(MEDIA_REGISTRY, mediaCache);
}

export function listMedia() {
  return loadMedia().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getMedia(id) {
  return loadMedia().find((m) => m.id === id) || null;
}

export function addMedia(meta) {
  const reg = loadMedia();
  const m = { id: uid(12), createdAt: Date.now(), ...meta };
  reg.push(m);
  saveMediaRegistry();
  return m;
}

export function removeMedia(id) {
  const reg = loadMedia();
  const i = reg.findIndex((m) => m.id === id);
  if (i >= 0) {
    const [m] = reg.splice(i, 1);
    saveMediaRegistry();
    for (const f of [m.file, m.thumb, m.derived]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    return true;
  }
  return false;
}
