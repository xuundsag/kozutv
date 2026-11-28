// Shoul Studio server entry
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, HOST, DIRS } from './config.js';
import { buildRouter } from './routes.js';
import { GlobalFonts } from '@napi-rs/canvas';

// register fonts for the compositor
const manifestPath = path.join(DIRS.assets, 'fonts', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const f of manifest) {
    const file = path.join(DIRS.assets, 'fonts', f.file);
    if (fs.existsSync(file)) {
      try { GlobalFonts.registerFromPath(file, f.family); } catch (e) { console.warn('font reg fail', f.file, e.message); }
    }
  }
  console.log(`fonts registered: ${manifest.length}`);
} else {
  console.warn('no font manifest — run `npm run assets` to build assets');
}

const app = express();
// a render job must never take the whole server down
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/assets', express.static(DIRS.assets, { maxAge: '1d' }));
app.use(express.static(DIRS.public, { maxAge: 0 }));
app.use('/api', buildRouter());

// legacy standalone brat page
app.use('/brat', express.static(path.join(DIRS.public, 'brat')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`Shoul Studio running at http://${HOST}:${PORT}`);
});
