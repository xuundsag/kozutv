import { fileURLToPath } from 'node:url';
import './load-env.js';
// Change this value to run kozuTV on a different port. Read it after load-env.js, or a
// PORT set in .env is ignored: this file used to evaluate before any import, so the
// config had not been applied yet and the port defaulted to 3000 regardless.
const PORT = Number(process.env.PORT) || 3000;

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cwd = dirname(fileURLToPath(import.meta.url));
if (!existsSync(join(cwd, 'node_modules', 'freekeys'))) {
  console.log('Installing production dependencies…');
  const result = spawnSync('npm', ['install', '--omit=dev'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}

const server = spawn(process.execPath, ['server.js'], {
  cwd,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit'
});
server.on('exit', code => process.exit(code ?? 0));
