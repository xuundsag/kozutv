// Captures a snapshot of the API so a freshly installed APK has a browsable
// catalogue before it has ever reached a server.
//
// Writes public/offline-manifest.json:
//   { generated, documents: [{path, body}], seed: [paths] }
// The page seeds the service-worker cache from it (public/app.js) and the
// worker pre-warms anything missing.
//
// Usage: node scripts/build-offline-bundle.mjs [baseUrl] [outFile]
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const out = process.argv[3] || path.resolve('public/offline-manifest.json');

// Ordered: the browse payload matters most, the rest are small extras.
const ENDPOINTS = [
  '/api/browse',
  '/api/browse?page=2',
  '/api/schedule',
  '/api/upcoming'
];

const documents = [];
for (const endpoint of ENDPOINTS) {
  try {
    const response = await fetch(base + endpoint, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      console.warn(`skip ${endpoint} (HTTP ${response.status})`);
      continue;
    }
    const body = await response.json();
    const size = JSON.stringify(body).length;
    documents.push({ path: endpoint, body });
    console.log(`ok   ${endpoint} (${(size / 1024).toFixed(0)} KB)`);
  } catch (error) {
    console.warn(`skip ${endpoint} (${error.message})`);
  }
}

if (!documents.length) {
  console.error('No documents captured - is the server running?');
  process.exit(1);
}

const manifest = {
  generated: new Date().toISOString(),
  version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  seed: documents.map(d => d.path),
  documents
};
fs.writeFileSync(out, JSON.stringify(manifest));
const bytes = fs.statSync(out).size;
console.log(`\nwrote ${out} (${(bytes / 1024).toFixed(0)} KB, ${documents.length} documents)`);
