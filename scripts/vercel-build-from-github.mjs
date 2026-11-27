// Build Output API fallback for deploying without a Vercel GitHub integration.
// Run in a disposable build directory, not in the source checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const commit = process.env.KOZUTV_SOURCE_COMMIT || 'aada2163a20c67a51e8706971fc67120c3453876';
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full Git commit SHA is required');
const response = await fetch(`https://codeload.github.com/xuundsag/kozutv/tar.gz/${commit}`);
if (!response.ok) throw new Error(`GitHub source download failed: ${response.status}`);
await fs.writeFile('/tmp/kozutv-source.tar.gz', Buffer.from(await response.arrayBuffer()));
const source = path.resolve('source');
await fs.mkdir(source, { recursive: true });
execFileSync('tar', ['-xzf', '/tmp/kozutv-source.tar.gz', '--strip-components=1', '-C', source], { stdio: 'inherit' });
execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: source, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }
});
const output = path.resolve('.vercel/output');
const fn = path.join(output, 'functions/index.func');
await fs.mkdir(fn, { recursive: true });
for (const entry of await fs.readdir(source, { withFileTypes: true })) {
  if ((entry.isFile() && (entry.name.endsWith('.js') || entry.name === 'package.json')) ||
      ['api', 'node_modules', 'data', 'public', 'riva'].includes(entry.name)) {
    await fs.cp(path.join(source, entry.name), path.join(fn, entry.name), { recursive: true });
  }
}
await fs.writeFile(path.join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x', handler: 'api/index.js', launcherType: 'Nodejs',
  shouldAddHelpers: true, maxDuration: 300
}));
await fs.writeFile(path.join(output, 'config.json'), JSON.stringify({
  version: 3, routes: [{ src: '/(.*)', dest: '/index' }]
}));
console.log(`Built kozuTV from GitHub commit ${commit}`);
