// Config loader for kozuTV, deliberately its own module.
//
// In an ES module every `import` is evaluated before the statements written around it,
// so an inline .env reader at the top of server.js runs *after* the modules it imports
// have already read process.env - db.js builds its connection string at import time.
// That made `node server.js` and `node start.js` boot with accounts switched off while a
// complete .env sat in the same directory, and only
// `node --env-file-if-exists=.env server.js` worked, because the CLI applies the file
// before any module runs. Loading the file from a module imported *first* fixes every
// entry point, including a host that just runs `node server.js`.
//
// Two rules here decide whether a correct file is actually used on a real server:
//
//   - Anything the process environment defines wins, blank included, and the file fills
//     only what is genuinely absent. That is how this codebase says "switched off": the
//     AI transcription feature and the genre cache are turned off by passing
//     NVIDIA_API_KEY='', five times over in scripts/. Letting a file value override an
//     empty one silently switched those back on - the test suite caught it.
//     The cost is that a deployment dashboard creating a key with a blank value also
//     masks the file, so that case is detected and named in the log instead of guessed
//     around: see maskedKeys().
//
//   - .env is looked for in the working directory, then beside the entry script, then
//     beside this file, so a service or script started with an absolute path still
//     finds the config that belongs to the app.
//
// Values are never printed. Only lengths and sources, which is what a log needs to
// explain a misconfiguration without becoming a secret leak.
import fs from 'node:fs';
import path from 'node:path';

const applied = new Map(); // key -> description of the file that supplied it
const masked = new Set();  // keys the environment defined as empty while .env had a value
export const envFiles = []; // { file, exists, keys } for every candidate we tried

const entryDir = (() => {
  try { return path.dirname(fs.realpathSync(process.argv[1] || '.')); } catch { return process.cwd(); }
})();
// This module lives in the app directory, so it is the one location that is always
// right: it covers `node /srv/kozutv/scripts/seed-reactions.mjs` and any other entry
// point started from elsewhere, where neither the cwd nor the script's own folder
// holds the file.
const appDir = path.dirname(fs.realpathSync(new URL(import.meta.url).pathname));

function readEnvFile(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    envFiles.push({ file, label, exists: false, keys: 0 });
    return false;
  }
  let keys = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!value) continue;
    const current = process.env[key];
    if (typeof current === 'string') {
      // Defined in the environment, so the environment decides - even when it is blank.
      // Remember it, though: a blank that shadows a value in the file is the single most
      // common reason a correct .env looks like it was ignored.
      if (!current.trim()) masked.add(key);
      continue;
    }
    process.env[key] = value;
    applied.set(key, label);
    keys++;
  }
  envFiles.push({ file, label, exists: true, keys });
  return keys > 0;
}

const labels = [[process.cwd(), '.env in the working directory'], [entryDir, '.env beside the entry script'], [appDir, '.env in the app directory']];
const dirsTried = [];
for (const [dir, label] of labels) {
  if (dirsTried.includes(dir)) continue;
  dirsTried.push(dir);
  readEnvFile(path.join(dir, '.env'), label);
}

// How the app sees one variable, in words an operator can act on.
export function describeKey(key) {
  const value = process.env[key];
  if (typeof value !== 'string') return 'not set - neither the environment nor .env supplied it';
  if (!value.trim()) {
    return masked.has(key)
      ? 'present but EMPTY in the process environment, which is overriding the value in .env - delete the blank entry there (a dashboard "Environment" row, a systemd Environment= line or an environment: block in compose) and restart'
      : 'present but EMPTY in the process environment, and no .env supplied a value';
  }
  const source = applied.get(key);
  return `set, ${value.trim().length} chars, from ${source || 'the process environment'}`;
}

// Where the loader looked. Used by the boot warning and by scripts/doctor.mjs.
export function envFileReport() {
  const found = envFiles.filter(f => f.exists);
  if (!found.length) {
    return `no .env found (looked in ${envFiles.map(f => f.file).join(' and ')})`;
  }
  return found.map(f => `${f.file}: ${f.keys} key${f.keys === 1 ? '' : 's'} applied`).join('; ');
}

// Keys the environment defined as blank while a .env had a real value for them.
export function maskedKeys() {
  return [...masked];
}

export function appliedKeys() {
  return [...applied.keys()];
}
