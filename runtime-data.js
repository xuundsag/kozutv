// Vercel's application bundle is read-only. Only /tmp is writable there.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const runtimeDataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'kozutv-data')
  : path.resolve('data');
fs.mkdirSync(runtimeDataDir, { recursive: true });
if (process.env.VERCEL) {
  for (const name of ['remote-cache.json', 'poster-cache.json']) {
    const destination = path.join(runtimeDataDir, name);
    const source = path.resolve('data', name);
    if (!fs.existsSync(destination) && fs.existsSync(source)) {
      fs.copyFileSync(source, destination);
    }
  }
}
