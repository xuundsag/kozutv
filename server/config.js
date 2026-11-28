import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';

export const DIRS = {
  public: path.join(ROOT, 'public'),
  assets: path.join(ROOT, 'assets'),
  data: process.env.DATA_DIR || path.join(ROOT, 'data'),
  uploads: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  renders: process.env.RENDER_DIR || path.join(ROOT, 'renders'),
  derived: process.env.DERIVED_DIR || path.join(ROOT, 'derived'),
};

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 800);

// aspect -> [width, height] at export scale 1
export const ASPECTS = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '16:9': [1920, 1080],
};

// export scale presets
export const SCALES = {
  1080: 1,
  720: 2 / 3,
  480: 4 / 9,
};

export const PREVIEW_W = Number(process.env.PREVIEW_W || 432);
export const PREVIEW_FPS = 30;
