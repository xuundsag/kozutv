// kozuTV config doctor. Run it on the server, from the directory you start the app in:
//
//   node scripts/doctor.mjs
//
// It answers one question: why does the app say there is no DATABASE_URL when .env has
// everything? It prints what the file contains, what the process actually sees, and the
// difference between the two. No secret values are printed - lengths, the scheme, and
// which line the key came from.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const CRITICAL = ['DATABASE_URL', 'DATABASE_URL_POOLED', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'KOZUTV_PUBLIC_URL', 'KOZUTV_SECURE_COOKIES', 'NVIDIA_API_KEY'];
const KEY_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

const ok = m => console.log('  ok    ' + m);
const bad = m => console.log('  FAIL  ' + m);
const note = m => console.log('  note  ' + m);
const head = m => console.log('\n' + m);

// Values are described, never shown.
function shape(raw) {
  if (raw === undefined) return 'absent';
  if (!raw.trim()) return 'present but EMPTY';
  const v = raw.trim();
  let extra = '';
  if (/^postgres(ql)?:\/\//i.test(v)) extra = ', starts postgresql://, ' + (/[?&]sslmode=/.test(v) ? 'has sslmode' : 'NO sslmode param');
  if (/^https?:\/\//i.test(v)) extra = ', starts ' + v.slice(0, v.indexOf('/', 8) > 0 ? v.indexOf('/', 8) : v.length);
  if ((v.startsWith('"') && !v.endsWith('"')) || (v.startsWith("'") && !v.endsWith("'"))) extra += ', UNBALANCED QUOTE';
  return `${v.length} chars${extra}`;
}

let fatal = 0;

head('kozutv config doctor');
console.log(`  node    ${process.version}`);
console.log(`  cwd     ${process.cwd()}`);
console.log(`  app dir ${root}`);

// ---------------------------------------------------------------- the file itself
head('.env candidates');
const candidates = [path.resolve('.env'), path.join(root, '.env')].filter((f, i, a) => a.indexOf(f) === i);
let parsed = new Map();
let best = null;
for (const file of candidates) {
  if (!fs.existsSync(file)) { note(`${file} - does not exist`); continue; }
  const stat = fs.statSync(file);
  const buf = fs.readFileSync(file);
  const text = buf.toString('utf8');
  const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const crlf = /\r\n/.test(text);
  const lines = text.split(/\r?\n/);
  const found = new Map();
  const skipped = [];
  lines.forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const m = KEY_LINE.exec(line);
    if (!m) { skipped.push([i + 1, line.trim().slice(0, 48)]); return; }
    found.set(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2'));
  });
  console.log(`\n  ${file}`);
  console.log(`         ${stat.size} bytes, mode ${(stat.mode & 0o777).toString(8)}, ${lines.length} lines, ${found.size} keys${bom ? ', UTF-8 BOM' : ''}${crlf ? ', CRLF line endings' : ''}`);
  if (!best) { best = file; parsed = found; }
  if (bom) { bad('a byte-order mark is hiding the first key from every parser'); fatal++; }
  for (const [no, text2] of skipped) {
    bad(`line ${no} is not KEY=VALUE and is ignored: ${text2}${/^\s*(export|setenv|SET )/i.test(text2) ? '  <- drop the "export"' : ''}`);
    fatal++;
  }
}
if (!best) { bad('no .env anywhere the app looks'); console.log('\n  Fix: put the file beside server.js and start the app from that directory,\n       or set the same keys in the service environment instead.'); process.exit(1); }

head('keys the app needs (from ' + best + ')');
for (const key of CRITICAL) {
  const v = parsed.get(key);
  if (v === undefined) note(`${key.padEnd(23)} not in the file`);
  else if (!v.trim()) bad(`${key.padEnd(23)} in the file but EMPTY`);
  else ok(`${key.padEnd(23)} ${shape(v)}`);
}

// ----------------------------------------------------- what a running process sees
head('what THIS process sees (after load-env.js runs, exactly like server.js)');
const { describeKey, envFileReport } = await import('../load-env.js');
for (const key of ['DATABASE_URL', 'DATABASE_URL_POOLED', 'DISCORD_CLIENT_ID']) {
  console.log(`  ${key.padEnd(23)} ${describeKey(key)}`);
}
note(envFileReport());

const maskedButSet = CRITICAL.filter(k => typeof process.env[k] === 'string' && !process.env[k].trim() && parsed.get(k)?.trim());
if (maskedButSet.length) {
  bad(`these are in the file but the environment defines them as EMPTY, so the file was ignored: ${maskedButSet.join(', ')}`);
  console.log('\n  Fix: delete those blank keys from the deployment environment (Render/Railway/Fly\n       "Environment" panel, a systemd Environment= line, docker-compose environment:),\n       then restart. The app deliberately does NOT let the file override a value the\n       environment defines - a blank is how a key is switched off here (NVIDIA_API_KEY=\n       means AI transcription off) - so the blank has to go, not the file.');
  fatal++;
}

const { databaseEnabled } = await import('../db.js').catch(() => ({ databaseEnabled: () => false }));
const { discordConfigured } = await import('../discord-auth.js').catch(() => ({ discordConfigured: () => false }));
head('the verdict the server acts on');
const dbOn = typeof databaseEnabled === 'function' ? databaseEnabled() : false;
(dbOn ? ok : bad)(`databaseEnabled() → ${dbOn}`);
const dOk = typeof discordConfigured === 'function' ? discordConfigured() : false;
(dOk ? ok : note)(`discordConfigured() → ${dOk}`);
if (!dbOn) {
  console.log('\n  With databaseEnabled() false, /api/auth/me answers "database":false and the\n  sign-in card says accounts are unavailable. Everything above explains which key is\n  missing; fix that one line and restart - the code is not the problem.');
  fatal++;
}

// ------------------------------------------------------------- deploy + reachability
head('how the file could have gone missing in transit');
if (fs.existsSync(path.join(root, '.git'))) {
  try {
    const ignored = execFileSync('git', ['check-ignore', '-v', '.env'], { cwd: root }).toString().trim();
    note(`git ignores .env (${ignored.replace(/\s+/g, ' ')}) - by design, so a deploy that clones or pulls the\n        repo will NOT contain the file. The host has to place it; this is why an "I deployed the zip\n        but the server has no .env" report usually means a git-based deploy.`);
  } catch {
    note('.env is not git-ignored here - unusual, and worth a look if this directory is ever pushed');
  }
} else {
  note('no .git directory here, so this copy did not arrive through git');
}
{
  const files = candidates.map(f => `${path.basename(f)} ${fs.existsSync(f) ? 'present' : 'MISSING'}`).join(', ');
  note(`dotfiles are skipped by a plain \`cp -r dir/* dest/\` or an FTP tool set to hide dotfiles: ${files}`);
}

head('will this tree even boot?');
{
  // A half-copied release is the other common way this turns into a CDN 502: the process
  // dies during `import` and never listens. Each of these is read or required at boot.
  const needed = [
    ['server.js', 'the app'], ['load-env.js', 'the config loader'], ['db.js', 'accounts'], ['anime-families.js', 'anime grouping'],
    ['public/index.html', 'the shell'], ['public/app.js', 'the client'],
    ['public/style.css', 'the styles'], ['public/sw.js', 'the offline worker'],
    ['public/fonts/manrope-latin.woff2', 'the bundled font'], ['data', 'the catalogue cache dir (must be writable)']
  ];
  let absent = 0;
  for (const [rel, why] of needed) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { bad(`missing ${rel} — ${why} — the app cannot start without it`); fatal++; absent++; continue; }
    if (rel === 'data') {
      try { fs.accessSync(abs, fs.constants.W_OK); ok('data/ is writable'); }
      catch { bad('data/ is NOT writable — the app writes data/user.json and states.json at boot and dies if it cannot'); fatal++; absent++; }
      continue;
    }
  }
  if (!absent) ok('every boot-critical file is present');
  // riva/proto is only the speech model; missing is survivable now, but worth naming.
  const riva = fs.existsSync(path.join(root, 'riva/proto/riva_asr.proto'));
  if (!riva) note('riva/proto/riva_asr.proto is missing — AI captions will be off; the rest of the site still serves (since v19e this no longer aborts boot)');
  else ok('riva/proto present — AI captions available');
  for (const mod of ['freekeys', 'pg', '@grpc/grpc-js', '@grpc/proto-loader', '@ffmpeg-installer/ffmpeg']) {
    const found = fs.existsSync(path.join(root, 'node_modules', ...mod.split('/')));
    if (!found) { bad(`node_modules/${mod} is missing — run \`npm install --omit=dev\` in ${root}`); fatal++; }
  }
}

head('can this host reach the database?');
const conn = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || '').trim();
const m = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?([^:\/?#]+)(?::(\d+))?/i.exec(conn);
if (!m) {
  note('no postgresql:// URL to test');
} else {
  const host = m[1];
  const port = Number(m[2] || 5432);
  await new Promise(resolve => {
    const sock = net.connect({ host, port });
    const done = msg => { sock.destroy(); console.log(msg); resolve(); };
    const timer = setTimeout(() => done(`  FAIL  tcp ${host}:${port} - no answer in 6s (firewall, DNS or Neon's IP allow list)`), 6000);
    sock.once('connect', () => { clearTimeout(timer); done(`  ok    tcp ${host}:${port} reachable`); });
    sock.once('error', e => { clearTimeout(timer); done(`  FAIL  tcp ${host}:${port} - ${e.code || e.message}`); });
  });
  if (!/[?&]sslmode=/i.test(conn)) { note('the URL has no sslmode= parameter - Neon requires sslmode=require at minimum'); }
  if (/sslmode=verify-full/.test(conn) && /channel_binding=require/.test(conn)) {
    note('sslmode=verify-full + channel_binding=require: fine for Neon, but an old pg driver or a\n        pooled-proxy certificate can fail the handshake. If the log says the connection was\n        rejected rather than missing, that is the thing to loosen, not DATABASE_URL.');
  }
}

head('result');
if (fatal) {
  console.log(`  ${fatal} problem(s) above would keep accounts switched off. Nothing in public/ needs\n  changing for them - this is configuration, not code.`);
  process.exit(1);
}
console.log('  .env parses, every critical key resolves, and the app would enable accounts.');
console.log('  Restart the service and check:  curl -s https://kozutv.bond/api/auth/me');
console.log('  want  {"configured":true,"database":true,"user":null}');
