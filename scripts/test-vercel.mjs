import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// No real credentials, paid API calls, or external services in this smoke test.
process.env.VERCEL = '1';
for (const key of ['DATABASE_URL', 'DATABASE_URL_POOLED', 'NVIDIA_API_KEY', 'DISCORD_WEBHOOK_URL']) process.env[key] = '';
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.DISCORD_REDIRECT_URI = 'https://kozutv.vercel.app/api/auth/discord/callback';
const { default: handler } = await import('../api/index.js');
const { runtimeDataDir } = await import('../runtime-data.js');
assert.equal(runtimeDataDir, path.join(os.tmpdir(), 'kozutv-data'));
for (const file of ['user.json', 'states.json', 'remote-cache.json', 'poster-cache.json']) {
  assert.ok(fs.existsSync(path.join(runtimeDataDir, file)), file);
}
const server = http.createServer(handler);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /kozuTV/i);
  const route = await fetch(base + '/browse');
  assert.equal(route.status, 200);
  const me = await fetch(base + '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user, null);
  const protectedFile = await fetch(base + '/server.js');
  assert.equal(protectedFile.status, 404);
  const env = await fetch(base + '/.env');
  assert.doesNotMatch(await env.text(), /test-secret/);
  console.log('PASS Vercel adapter, temporary runtime storage, homepage, client routes, auth and private source exclusion');
} finally {
  await new Promise(resolve => server.close(resolve));
}
