// Builds all bundled assets: fonts, stickers, sounds, sample media, templates.
// Run: node scripts/build-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const TMP = '/tmp/shoul-assets';

const ffmpegPath = process.env.FFMPEG_PATH || path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg');

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });
}

// ---------------------------------------------------------------- fonts ----
const FONTS = [
  { pkg: 'anton', family: 'Anton', weights: [400] },
  { pkg: 'bebas-neue', family: 'Bebas Neue', weights: [400] },
  { pkg: 'oswald', family: 'Oswald', weights: [400, 700] },
  { pkg: 'montserrat', family: 'Montserrat', weights: [400, 700, 900] },
  { pkg: 'poppins', family: 'Poppins', weights: [400, 600, 800] },
  { pkg: 'inter', family: 'Inter', weights: [400, 700, 900] },
  { pkg: 'nunito', family: 'Nunito', weights: [400, 800] },
  { pkg: 'roboto-condensed', family: 'Roboto Condensed', weights: [400, 700] },
  { pkg: 'archivo-black', family: 'Archivo Black', weights: [400] },
  { pkg: 'abril-fatface', family: 'Abril Fatface', weights: [400] },
  { pkg: 'playfair-display', family: 'Playfair Display', weights: [400, 700] },
  { pkg: 'lobster', family: 'Lobster', weights: [400] },
  { pkg: 'pacifico', family: 'Pacifico', weights: [400] },
  { pkg: 'dancing-script', family: 'Dancing Script', weights: [400, 700] },
  { pkg: 'caveat', family: 'Caveat', weights: [400, 700] },
  { pkg: 'permanent-marker', family: 'Permanent Marker', weights: [400] },
  { pkg: 'bangers', family: 'Bangers', weights: [400] },
  { pkg: 'luckiest-guy', family: 'Luckiest Guy', weights: [400] },
  { pkg: 'titan-one', family: 'Titan One', weights: [400] },
  { pkg: 'fredoka', family: 'Fredoka', weights: [400, 600] },
  { pkg: 'press-start-2p', family: 'Press Start 2P', weights: [400] },
  { pkg: 'righteous', family: 'Righteous', weights: [400] },
  { pkg: 'rubik-mono-one', family: 'Rubik Mono One', weights: [400] },
  { pkg: 'space-grotesk', family: 'Space Grotesk', weights: [400, 700] },
  { pkg: 'jetbrains-mono', family: 'JetBrains Mono', weights: [400, 800] },
  { pkg: 'syne', family: 'Syne', weights: [400, 800] },
  { pkg: 'sora', family: 'Sora', weights: [400, 800] },
  { pkg: 'noto-sans', family: 'Noto Sans', weights: [400, 700] },
];
const SUFFIX = { 400: '400Regular', 500: '500Medium', 600: '600SemiBold', 700: '700Bold', 800: '800ExtraBold', 900: '900Black' };

async function buildFonts() {
  console.log('== fonts ==');
  const outDir = path.join(ASSETS, 'fonts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  sh(`cd ${TMP} && npm init -y >/dev/null && npm i --no-audit --no-fund ${FONTS.map((f) => `@expo-google-fonts/${f.pkg}`).join(' ')} 2>&1 | tail -1`, { cwd: TMP });
  const manifest = [];
  for (const f of FONTS) {
    const pkgDir = path.join(TMP, 'node_modules', `@expo-google-fonts/${f.pkg}`);
    const pascal = f.family.replace(/\s+/g, '');
    for (const w of f.weights) {
      const suffix = SUFFIX[w];
      const pascal = f.family.replace(/\s+/g, '');
      const candidates = [
        path.join(pkgDir, `${suffix}`, `${pascal}_${suffix}.ttf`),
        path.join(pkgDir, `${pascal}_${suffix}.ttf`),
      ];
      const src = candidates.find((c) => fs.existsSync(c));
      if (!fs.existsSync(src)) {
        console.warn(`  missing ${pascal}_${suffix}.ttf`);
        continue;
      }
      const dest = `${pascal}_${suffix}.ttf`;
      fs.copyFileSync(src, path.join(outDir, dest));
      manifest.push({ file: dest, family: f.family, weight: w });
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`  fonts: ${manifest.length} files`);
}

// -------------------------------------------------------------- stickers ----
const EMOJI = [
  ['1f602', 'joy'], ['1f60d', 'heart-eyes'], ['1f923', 'rofl'], ['1f60e', 'cool'], ['1f973', 'party-face'],
  ['1f621', 'rage'], ['1f62d', 'sob'], ['1f644', 'eye-roll'], ['1f911', 'money-face'], ['1f925', 'lying'],
  ['1f929', 'star-struck'], ['1f60c', 'relieved'], ['1f636', 'no-face'], ['1f608', 'devil'], ['1f480', 'skull'],
  ['1f47b', 'ghost'], ['1f916', 'robot'], ['1f44d', 'thumbs-up'], ['1f44f', 'clap'], ['1f64f', 'pray'],
  ['1f4aa', 'muscle'], ['1f919', 'call-me'], ['1f440', 'eyes'], ['1f445', 'tongue'], ['1f64c', 'raise-hands'],
  ['1f91d', 'handshake'], ['1f4af', '100'], ['1f525', 'fire'], ['2728', 'sparkles'], ['1f31f', 'star'],
  ['1f389', 'party-popper'], ['1f38a', 'confetti'], ['2764', 'red-heart'], ['1f495', 'two-hearts'], ['1f494', 'broken-heart'],
  ['1f4a5', 'collision'], ['1f4a8', 'dash'], ['1f4a9', 'poop'], ['1f984', 'unicorn'], ['1f43c', 'panda'],
  ['1f98a', 'fox'], ['1f431', 'cat'], ['1f436', 'dog'], ['1f42f', 'tiger'], ['1f43b', 'bear'],
  ['1f437', 'pig'], ['1f435', 'monkey'], ['1f981', 'lion'], ['1f430', 'rabbit'], ['1f43a', 'wolf'],
  ['1f996', 't-rex'], ['1f991', 'squid'], ['1f420', 'tropical-fish'], ['1f419', 'octopus'], ['1f980', 'crab'],
  ['1f40d', 'snake'], ['1f98b', 'butterfly'], ['1f41d', 'bee'], ['1f338', 'cherry-blossom'], ['1f339', 'rose'],
  ['1f33a', 'hibiscus'], ['1f340', 'clover'], ['1f341', 'maple-leaf'], ['1f34b', 'lemon'], ['1f34d', 'pineapple'],
  ['1f353', 'strawberry'], ['1f355', 'pizza'], ['1f356', 'meat'], ['1f363', 'sushi'], ['1f35c', 'noodles'],
  ['1f37f', 'popcorn'], ['1f382', 'birthday-cake'], ['1f381', 'gift'], ['1f3c6', 'trophy'], ['1f3c5', 'medal'],
  ['1f947', 'gold-medal'], ['1f3b5', 'music-note'], ['1f3b6', 'notes'], ['1f3a7', 'headphones'], ['1f3a4', 'microphone'],
  ['1f3ae', 'game-controller'], ['1f3af', 'bullseye'], ['26bd', 'soccer'], ['1f3c0', 'basketball'], ['1f3be', 'tennis'],
  ['1f3c1', 'checkered-flag'], ['1f6a8', 'siren'], ['26a1', 'zap'], ['1f308', 'rainbow'], ['2b50', 'star2'],
  ['1f31e', 'sun'], ['1f31b', 'moon'], ['1f319', 'crescent'], ['23f0', 'alarm'], ['1f4c5', 'calendar'],
  ['1f4b0', 'moneybag'], ['1f4b8', 'money-wings'], ['1f4dd', 'memo'], ['1f680', 'rocket'], ['2708', 'plane'],
  ['1f697', 'car'], ['26f5', 'sailboat'], ['1f378', 'cocktail'], ['1f37a', 'beer'], ['1f384', 'christmas-tree'],
  ['1f514', 'bell'], ['1f4f8', 'flash'], ['1f4f7', 'camera'], ['1f393', 'graduation'], ['1f3b3', 'bowling'],
];

async function buildEmojiStickers() {
  console.log('== emoji stickers ==');
  const outDir = path.join(ASSETS, 'stickers', 'emoji');
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(path.join(TMP, 'openmoji-pkg'), { recursive: true, force: true });
  sh(`cd ${TMP} && npm pack openmoji@17 --silent && mkdir openmoji-pkg && tar -xzf openmoji-*.tgz -C openmoji-pkg`);
  const srcDir = path.join(TMP, 'openmoji-pkg', 'package', 'color', 'svg');
  const sharp = (await import('sharp')).default;
  let n = 0;
  for (const [code] of EMOJI) {
    const svg = path.join(srcDir, `${code.toUpperCase()}.svg`);
    if (!fs.existsSync(svg)) { console.warn(`  missing emoji ${code}`); continue; }
    await sharp(svg, { density: 300 }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toFile(path.join(outDir, `${code}.png`));
    n++;
  }
  console.log(`  emoji stickers: ${n}`);
}

// custom drawn stickers (badges, shapes, frames)
async function buildCustomStickers() {
  console.log('== custom stickers ==');
  const { createCanvas } = await import('@napi-rs/canvas');
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'fonts', 'manifest.json'), 'utf8'));
  for (const m of manifest) {
    try { createRequire(import.meta.url); } catch { /* noop */ }
  }
  const { GlobalFonts } = await import('@napi-rs/canvas');
  for (const m of manifest) GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', m.file), m.family);

  const save = (group, name, canvas) => {
    const dir = path.join(ASSETS, 'stickers', group);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.png`), canvas.toBuffer('image/png'));
  };

  const mk = (w = 512, h = 512) => {
    const c = createCanvas(w, h);
    return [c, c.getContext('2d')];
  };

  const badge = (name, text, bg, fg = '#ffffff') => {
    const [c, ctx] = mk();
    ctx.font = '96px "Anton"';
    const w = Math.min(470, ctx.measureText(text).width + 90);
    const x = (512 - w) / 2, y = 196, h = 120, r = h / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = fg;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, y + h / 2 + 6);
    save('badges', name, c);
  };

  // badges
  [
    ['lol', '#111111'], ['omg', '#ff2d55'], ['viral', '#ff2d55'], ['new', '#00c853'], ['hot', '#ff3d00'],
    ['sale', '#ff1744'], ['live', '#ff1744'], ['brat', '#8ace00'], ['fyp', '#000000'], ['pov', '#3d5afe'],
    ['hype', '#7c4dff'], ['boom', '#ff6d00'], ['wow', '#ffc400'], ['top', '#00bfa5'], ['free', '#00c853'],
    ['sub', '#d50000'], ['4k', '#000000'], ['hd', '#000000'],
  ].forEach(([n, c]) => badge(n, n.toUpperCase(), c));

  const shape = (name, fn) => { const [c, ctx] = mk(); fn(ctx); save('shapes', name, c); };
  const heart = (ctx, x, y, s, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.25, x - s * 0.5, y + s * 0.12);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.45, x, y + s * 0.7, x, y + s * 0.95);
    ctx.bezierCurveTo(x, y + s * 0.7, x + s * 0.5, y + s * 0.45, x + s * 0.5, y + s * 0.12);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.25, x, y, x, y + s * 0.3);
    ctx.fill();
  };
  shape('heart-red', (ctx) => heart(ctx, 256, 120, 340, '#ff1744'));
  shape('heart-white', (ctx) => { heart(ctx, 256, 120, 340, '#ffffff'); });
  shape('heart-outline', (ctx) => {
    ctx.lineWidth = 26; ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(256, 210); ctx.bezierCurveTo(236, 130, 86, 160, 86, 268);
    ctx.bezierCurveTo(86, 380, 226, 430, 256, 470);
    ctx.bezierCurveTo(286, 430, 426, 380, 426, 268);
    ctx.bezierCurveTo(426, 160, 276, 130, 256, 210);
    ctx.stroke();
  });
  shape('star-gold', (ctx) => {
    ctx.fillStyle = '#ffc400';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 210 : 95;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  });
  shape('sparkle', (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(256, 60);
    ctx.quadraticCurveTo(286, 226, 452, 256);
    ctx.quadraticCurveTo(286, 286, 256, 452);
    ctx.quadraticCurveTo(226, 286, 60, 256);
    ctx.quadraticCurveTo(226, 226, 256, 60);
    ctx.fill();
  });
  shape('crown', (ctx) => {
    ctx.fillStyle = '#ffc400';
    ctx.beginPath();
    ctx.moveTo(86, 360); ctx.lineTo(86, 190); ctx.lineTo(170, 260); ctx.lineTo(256, 140);
    ctx.lineTo(342, 260); ctx.lineTo(426, 190); ctx.lineTo(426, 360); ctx.closePath(); ctx.fill();
    ctx.fillRect(86, 360, 340, 46);
  });
  shape('flame', (ctx) => {
    const g = ctx.createLinearGradient(0, 80, 0, 460);
    g.addColorStop(0, '#ff9100'); g.addColorStop(1, '#ff1744');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(256, 80);
    ctx.bezierCurveTo(330, 180, 380, 230, 380, 320);
    ctx.bezierCurveTo(380, 410, 325, 455, 256, 455);
    ctx.bezierCurveTo(187, 455, 132, 410, 132, 320);
    ctx.bezierCurveTo(132, 250, 190, 210, 200, 140);
    ctx.bezierCurveTo(230, 190, 250, 190, 256, 80);
    ctx.fill();
  });
  shape('diamond', (ctx) => {
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(256, 90); ctx.lineTo(420, 220); ctx.lineTo(256, 440); ctx.lineTo(92, 220); ctx.closePath(); ctx.fill();
  });
  shape('lightning', (ctx) => {
    ctx.fillStyle = '#ffe500';
    ctx.beginPath();
    ctx.moveTo(280, 60); ctx.lineTo(150, 280); ctx.lineTo(235, 280); ctx.lineTo(200, 460); ctx.lineTo(370, 220); ctx.lineTo(270, 220);
    ctx.closePath(); ctx.fill();
  });
  shape('trophy', (ctx) => {
    ctx.fillStyle = '#ffc400';
    ctx.fillRect(176, 100, 160, 170);
    ctx.beginPath(); ctx.arc(176, 160, 44, Math.PI / 2, Math.PI * 1.5, true); ctx.lineWidth = 26; ctx.strokeStyle = '#ffc400'; ctx.stroke();
    ctx.beginPath(); ctx.arc(336, 160, 44, Math.PI * 1.5, Math.PI / 2, true); ctx.stroke();
    ctx.fillRect(226, 270, 60, 60);
    ctx.fillRect(176, 330, 160, 44);
    ctx.fillRect(150, 374, 212, 30);
  });
  shape('music-note', (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(180, 380, 90, 64, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(248, 90, 28, 290);
    ctx.beginPath(); ctx.moveTo(248, 90); ctx.quadraticCurveTo(390, 110, 400, 210);
    ctx.quadraticCurveTo(350, 160, 248, 170); ctx.closePath(); ctx.fill();
  });
  shape('arrow-right', (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, 220, 280, 52);
    ctx.beginPath(); ctx.moveTo(320, 140); ctx.lineTo(440, 246); ctx.lineTo(320, 352); ctx.closePath(); ctx.fill();
  });
  shape('check-badge', (ctx) => {
    ctx.fillStyle = '#00c853';
    ctx.beginPath(); ctx.arc(256, 256, 200, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 40; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(150, 260); ctx.lineTo(225, 335); ctx.lineTo(370, 185); ctx.stroke();
  });
  shape('cross-mark', (ctx) => {
    ctx.lineWidth = 48; ctx.strokeStyle = '#ff1744'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(150, 150); ctx.lineTo(362, 362); ctx.moveTo(362, 150); ctx.lineTo(150, 362); ctx.stroke();
  });
  shape('speech-bubble', (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(66, 110, 380, 220, 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(150, 330); ctx.lineTo(130, 420); ctx.lineTo(230, 330); ctx.closePath(); ctx.fill();
  });
  shape('ribbon', (ctx) => {
    ctx.fillStyle = '#ff1744';
    ctx.beginPath(); ctx.moveTo(20, 200); ctx.lineTo(492, 200); ctx.lineTo(430, 256); ctx.lineTo(492, 312); ctx.lineTo(20, 312); ctx.lineTo(82, 256); ctx.closePath(); ctx.fill();
  });
  shape('tape', (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.save(); ctx.translate(150, 256); ctx.rotate(-0.5); ctx.fillRect(-60, -170, 120, 340); ctx.restore();
    ctx.save(); ctx.translate(362, 256); ctx.rotate(0.5); ctx.fillRect(-60, -170, 120, 340); ctx.restore();
  });
  shape('progress-bar', (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.roundRect(56, 216, 400, 80, 40); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(56, 216, 260, 80, 40); ctx.fill();
  });
  shape('like-counter', (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(96, 186, 320, 140, 70); ctx.fill();
    heart(ctx, 176, 210, 90, '#ff1744');
    ctx.fillStyle = '#ffffff'; ctx.font = '64px "Anton"'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('1.2K', 250, 262);
  });
  shape('burst', (ctx) => {
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 === 0 ? 230 : 150;
      const a = i * Math.PI / 12;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '72px "Anton"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NEW', 256, 262);
  });
  shape('confetti', (ctx) => {
    const cols = ['#ff1744', '#ffc400', '#00e5ff', '#76ff03', '#d500f9'];
    let s = 42;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>>= 0) / 4294967296; };
    for (let i = 0; i < 42; i++) {
      ctx.save();
      ctx.translate(rand() * 512, rand() * 512);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(-14, -7, 28, 14);
      ctx.restore();
    }
  });
  shape('mic-drop', (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(216, 90, 80, 210, 40); ctx.fill();
    ctx.beginPath(); ctx.arc(256, 300, 90, Math.PI, 0, false); ctx.lineWidth = 34; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(256, 390); ctx.lineTo(256, 300);
    ctx.lineWidth = 34; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(196, 380, 120, 34, 17); ctx.fill();
  });

  const frame = (name, fn) => { const [c, ctx] = mk(); fn(ctx); save('frames', name, c); };
  frame('neon-frame', (ctx) => {
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 40;
    ctx.lineWidth = 10; ctx.strokeStyle = '#00e5ff';
    ctx.beginPath(); ctx.roundRect(40, 40, 432, 432, 60); ctx.stroke();
    ctx.strokeStyle = '#ff40c4'; ctx.shadowColor = '#ff40c4';
    ctx.beginPath(); ctx.roundRect(56, 56, 400, 400, 48); ctx.stroke();
  });
  frame('glitch-bars', (ctx) => {
    const cols = ['#ff1744', '#00e5ff', '#ffffff', '#76ff03', '#ff40c4', '#ffe500'];
    let s = 7;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>>= 0) / 4294967296; };
    for (let i = 0; i < 14; i++) {
      const y = rand() * 512, h = 6 + rand() * 26;
      ctx.fillStyle = cols[i % cols.length];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(rand() * 120 - 60, y, 512, h);
    }
  });
  frame('story-ring', (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#f9ce34'); g.addColorStop(0.5, '#ee2a7b'); g.addColorStop(1, '#6228d7');
    ctx.strokeStyle = g; ctx.lineWidth = 34;
    ctx.beginPath(); ctx.arc(256, 256, 210, 0, Math.PI * 2); ctx.stroke();
  });
  frame('film-strip', (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 90); ctx.fillRect(0, 422, 512, 90);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.roundRect(20 + i * 62, 14, 40, 26, 6); ctx.fill();
      ctx.beginPath(); ctx.roundRect(20 + i * 62, 436, 40, 26, 6); ctx.fill();
    }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 12;
    ctx.strokeRect(6, 86, 500, 340);
  });
  frame('vignette-frame', (ctx) => {
    const g = ctx.createRadialGradient(256, 256, 150, 256, 256, 300);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  });
  frame('polaroid', (ctx) => {
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(40, 40, 432, 432, 14); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(64, 64, 384, 320);
    ctx.fillStyle = '#111111'; ctx.font = '44px "Caveat"'; ctx.textAlign = 'center';
    ctx.fillText('my caption', 256, 440);
  });
  console.log('  custom stickers: badges 18, shapes 20, frames 6');
}

// ---------------------------------------------------------------- sounds ----
async function buildSounds() {
  console.log('== sounds ==');
  const outDir = path.join(ASSETS, 'sounds');
  fs.mkdirSync(outDir, { recursive: true });
  try {
    sh(`python3 ${path.join(__dirname, 'synth_sounds.py')} ${outDir}`, { cwd: ROOT });
    const wavs = fs.readdirSync(outDir).filter((f) => f.endsWith('.wav'));
    for (const f of wavs) {
      const mp3 = f.replace('.wav', '.mp3');
      try {
        sh(`"${ffmpegPath}" -y -v quiet -i "${path.join(outDir, f)}" -b:a 160k "${path.join(outDir, mp3)}"`);
        fs.unlinkSync(path.join(outDir, f));
      } catch {
        console.warn(`  mp3 encode failed for ${f}, keeping wav`);
      }
    }
    console.log(`  sounds: ${fs.readdirSync(outDir).length}`);
  } catch (e) {
    console.warn('  sound synth failed (numpy missing?):', e.message);
  }
}

// ---------------------------------------------------------------- samples ----
const GRADS = [
  ['gradient-sunset', '#ff9a56', '#ff5e78'],
  ['gradient-ocean', '#2b5876', '#4e4376'],
  ['gradient-neon', '#12c2e9', '#f64f59'],
  ['gradient-forest', '#134e5e', '#71b280'],
];

async function buildSamples() {
  console.log('== sample media ==');
  const outDir = path.join(ASSETS, 'samples');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, c0, c1] of GRADS) {
    const mp4 = path.join(outDir, `${name}.mp4`);
    if (!fs.existsSync(mp4)) {
      sh(`"${ffmpegPath}" -y -v quiet -f lavfi -i "gradients=s=720x1280:d=4:speed=0.03:c0=0x${c0.slice(1)}:c1=0x${c1.slice(1)}:x0=200:y0=200:x1=520:y1=1100" -c:v libx264 -preset veryfast -pix_fmt yuv420p "${mp4}"`);
    }
    const png = path.join(outDir, `${name}.png`);
    if (!fs.existsSync(png)) {
      sh(`"${ffmpegPath}" -y -v quiet -f lavfi -i "gradients=s=1080x1920:d=1:c0=0x${c0.slice(1)}:c1=0x${c1.slice(1)}:x0=200:y0=200:x1=880:y1=1700" -frames:v 1 "${png}"`);
    }
  }
  // green screen demo: moving white blob on brat green
  const gs = path.join(outDir, 'greenscreen-demo.mp4');
  if (!fs.existsSync(gs)) {
    const blob = path.join(TMP, 'blob.png');
    const sharp = (await import('sharp')).default;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><circle cx="210" cy="210" r="190" fill="#ffffff"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(blob);
    sh(`"${ffmpegPath}" -y -v quiet -f lavfi -i "color=c=0x00b140:s=720x1280:d=4:r=30" -i "${blob}" -filter_complex "[0:v][1:v]overlay=x='(main_w-overlay_w)/2+170*sin(t*2.1)':y='(main_h-overlay_h)/2+140*cos(t*1.6)'" -c:v libx264 -preset veryfast -pix_fmt yuv420p "${gs}"`);
  }
  console.log('  samples ready');
}

// -------------------------------------------------------------- templates ----
let _cid = 0;
const cid = (p) => `${p}${(_cid++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const vclip = (src, start, dur, extra = {}) => ({ id: cid('v'), type: 'video', src, start, duration: dur, in: 0, speed: 1, fit: 'cover', transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, effects: [], filter: { preset: 'none' }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 }, transition: { type: 'none', dur: 0.5 }, volume: 1, ...extra });
const iclip = (src, start, dur, extra = {}) => ({ id: cid('i'), type: 'image', src, start, duration: dur, fit: 'cover', transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, crop: { top: 0, right: 0, bottom: 0, left: 0 }, effects: [], filter: { preset: 'none' }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 }, ...extra });
const tclip = (content, start, dur, extra = {}) => {
  const { text, ...rest } = extra;
  return {
    id: cid('t'), type: 'text', start, duration: dur,
    text: { content, ...(text || {}) },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 },
    ...rest,
  };
};
const sclip = (src, start, dur, extra = {}) => ({ id: cid('s'), type: 'sticker', src, start, duration: dur, sticker: { anim: 'pop' }, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, anim: { in: 'none', out: 'none', loop: 'none', dur: 0.5 }, ...extra });
const aclip = (src, start, dur, extra = {}) => ({ id: cid('a'), type: 'audio', src, start, duration: dur, in: 0, volume: 0.8, fadeIn: 0, fadeOut: 0.5, ...extra });

function template(id, name, desc, aspect, tracks, extra = {}) {
  return { id, name, desc, aspect, fps: 30, bg: { type: 'color', color: '#000000' }, tracks, duration: 0, ...extra };
}

async function buildTemplates() {
  console.log('== templates ==');
  const outDir = path.join(ASSETS, 'templates');
  fs.mkdirSync(outDir, { recursive: true });
  const T = [];

  T.push(template('brat-lyric', 'brat lyrics', 'green screen lyric edit, brat style', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [] },
    {
      id: cid('tr'), type: 'text', name: 'lyrics', clips: [
        tclip('green screen summer', 0, 3, { text: { preset: 'brat', font: 'anton', size: 160, color: '#ffffff' } }),
        tclip('it\u2019s so brat in here', 3, 3, { text: { preset: 'brat', font: 'anton', size: 150 } }),
        tclip('no thoughts', 6, 3, { text: { preset: 'brat', font: 'anton', size: 170 } }),
        tclip('ok bye \u2661', 9, 3, { text: { preset: 'brat', font: 'anton', size: 160 } }),
      ],
    },
  ], { bg: { type: 'color', color: '#8ace00' } }));

  T.push(template('lyric-karaoke', 'karaoke lyrics', 'word-by-word sing-along captions', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-neon.mp4', 0, 12)] },
    {
      id: cid('tr'), type: 'text', name: 'captions', clips: [
        tclip('we were dancing all night long', 0, 4, { text: { preset: 'karaoke', size: 110 }, transform: { x: 0, y: 0.3, scale: 1, rotation: 0, opacity: 1 } }),
        tclip('under the electric sky', 4, 4, { text: { preset: 'karaoke', size: 110 }, transform: { x: 0, y: 0.3, scale: 1, rotation: 0, opacity: 1 } }),
        tclip('and i would do it all again', 8, 4, { text: { preset: 'karaoke', size: 110 }, transform: { x: 0, y: 0.3, scale: 1, rotation: 0, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/edm_pulse.mp3', 0, 8)] },
  ]));

  T.push(template('vlog-intro', 'vlog intro', 'punchy opener with crown sticker', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-sunset.mp4', 0, 6, { effects: [{ id: 'zoompulse', intensity: 0.6 }] })] },
    {
      id: cid('tr'), type: 'sticker', name: 'stickers', clips: [
        sclip('asset:stickers/shapes/crown.png', 0.6, 2.5, { sticker: { anim: 'pop' }, transform: { x: 0, y: -0.3, scale: 1.2, rotation: 8, opacity: 1 } }),
        sclip('asset:stickers/shapes/sparkle.png', 2.2, 3, { sticker: { anim: 'float' }, transform: { x: -0.32, y: 0.15, scale: 0.6, rotation: 0, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'text', name: 'title', clips: [tclip('SUNDAY VLOG', 0.4, 4, { text: { preset: 'bold-pop', size: 150 } })] },
    { id: cid('tr'), type: 'audio', name: 'audio', clips: [aclip('asset:sounds/whoosh.mp3', 0, 0.9, { volume: 0.9 }), aclip('asset:sounds/sunny_pluck.mp3', 0.5, 5.5)] },
  ]));

  T.push(template('product-promo', 'product promo', 'sale badge + bold offer', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [iclip('asset:samples/gradient-ocean.png', 0, 6)] },
    {
      id: cid('tr'), type: 'sticker', name: 'stickers', clips: [
        sclip('asset:stickers/badges/sale.png', 0.3, 5, { sticker: { anim: 'pulse' }, transform: { x: 0, y: -0.28, scale: 1.1, rotation: -6, opacity: 1 } }),
        sclip('asset:stickers/shapes/burst.png', 1.5, 4, { sticker: { anim: 'wobble' }, transform: { x: 0.3, y: 0.28, scale: 0.7, rotation: 0, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'text', name: 'copy', clips: [tclip('50% OFF TODAY ONLY', 0.5, 5, { text: { preset: 'tiktok', size: 120 }, transform: { x: 0, y: 0.22, scale: 1, rotation: 0, opacity: 1 } })] },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/edm_pulse.mp3', 0, 6)] },
  ]));

  T.push(template('gaming-glitch', 'gaming glitch', 'glitch + rgb split + neon text', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-neon.mp4', 0, 6, { effects: [{ id: 'glitch', intensity: 0.7 }, { id: 'rgbshift', intensity: 0.5 }] })] },
    { id: cid('tr'), type: 'sticker', name: 'stickers', clips: [sclip('asset:stickers/frames/glitch-bars.png', 0, 6, { sticker: { anim: 'flash' }, transform: { x: 0, y: 0, scale: 2.2, rotation: 0, opacity: 0.5 } })] },
    { id: cid('tr'), type: 'text', name: 'text', clips: [tclip('GG WP', 0.4, 4, { text: { preset: 'neon', size: 190 } })] },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/trap_808.mp3', 0, 6)] },
  ]));

  T.push(template('quote-post', 'quote post', 'aesthetic quote card', '4:5', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [iclip('asset:samples/gradient-forest.png', 0, 8)] },
    { id: cid('tr'), type: 'sticker', name: 'stickers', clips: [sclip('asset:stickers/shapes/sparkle.png', 0, 8, { sticker: { anim: 'float' }, transform: { x: -0.3, y: -0.3, scale: 0.55, rotation: 0, opacity: 0.9 } })] },
    { id: cid('tr'), type: 'text', name: 'quote', clips: [tclip('stay soft.\nthe world is loud enough already.', 0.5, 7, { text: { preset: 'quote', size: 100, lineHeight: 1.5 } })] },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/lofi_chill.mp3', 0, 8)] },
  ]));

  T.push(template('birthday', 'birthday blast', 'cake, confetti, bangers text', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-sunset.mp4', 0, 8)] },
    {
      id: cid('tr'), type: 'sticker', name: 'stickers', clips: [
        sclip('asset:stickers/emoji/1f382.png', 0.2, 7, { sticker: { anim: 'bounce' }, transform: { x: 0, y: -0.3, scale: 1.3, rotation: 0, opacity: 1 } }),
        sclip('asset:stickers/shapes/confetti.png', 0, 8, { sticker: { anim: 'none' }, transform: { x: 0, y: 0, scale: 2.2, rotation: 0, opacity: 0.85 } }),
        sclip('asset:stickers/shapes/heart-red.png', 1, 6, { sticker: { anim: 'float' }, transform: { x: -0.33, y: 0.1, scale: 0.5, rotation: -10, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'text', name: 'title', clips: [tclip('HAPPY BDAY!!', 0.5, 6.5, { text: { preset: 'none', font: 'bangers', size: 170, color: '#ffffff', stroke: { color: '#000000', width: 7 }, shadow: { color: '#ff2d55', blur: 26, x: 0, y: 0 } } })] },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/corporate_pop.mp3', 0, 8)] },
  ]));

  T.push(template('meme-caption', 'meme caption', 'top/bottom meme text with VHS', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-forest.mp4', 0, 6, { effects: [{ id: 'vhs', intensity: 0.5 }] })] },
    {
      id: cid('tr'), type: 'text', name: 'captions', clips: [
        tclip('nobody:', 0, 2.5, { text: { preset: 'meme', size: 120 }, transform: { x: 0, y: -0.33, scale: 1, rotation: 0, opacity: 1 } }),
        tclip('me at 3am watching tutorials', 2.5, 3.5, { text: { preset: 'meme', size: 90 }, transform: { x: 0, y: 0.33, scale: 1, rotation: 0, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/lofi_chill.mp3', 0, 6)] },
  ]));

  T.push(template('podcast-clip', 'podcast clip', 'captioned quote on dark', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [iclip('asset:samples/gradient-ocean.png', 0, 8, { filter: { preset: 'none', brightness: 0.55, saturation: 1.1 } })] },
    { id: cid('tr'), type: 'sticker', name: 'stickers', clips: [sclip('asset:stickers/shapes/mic-drop.png', 0, 8, { sticker: { anim: 'float' }, transform: { x: 0, y: -0.32, scale: 0.8, rotation: 0, opacity: 1 } })] },
    {
      id: cid('tr'), type: 'text', name: 'captions', clips: [
        tclip('the secret is', 0, 2.6, { text: { preset: 'subtitle', size: 100 }, transform: { x: 0, y: 0.28, scale: 1, rotation: 0, opacity: 1 } }),
        tclip('just start before', 2.6, 2.6, { text: { preset: 'subtitle', size: 100 }, transform: { x: 0, y: 0.28, scale: 1, rotation: 0, opacity: 1 } }),
        tclip('you feel ready.', 5.2, 2.6, { text: { preset: 'subtitle', size: 100 }, transform: { x: 0, y: 0.28, scale: 1, rotation: 0, opacity: 1 } }),
      ],
    },
    { id: cid('tr'), type: 'audio', name: 'music', clips: [aclip('asset:sounds/lofi_chill.mp3', 0, 8)] },
  ]));

  T.push(template('green-screen-demo', 'green screen cutout', 'chroma-key a green screen video onto any bg', '9:16', [
    { id: cid('tr'), type: 'video', name: 'main', clips: [vclip('asset:samples/gradient-sunset.mp4', 0, 4)] },
    {
      id: cid('tr'), type: 'overlay', name: 'cutout', clips: [
        { ...vclip('asset:samples/greenscreen-demo.mp4', 0, 4), fit: 'cover', chroma: { enabled: true, key: '#00b140', similarity: 0.42, blend: 0.12 } },
      ],
    },
    { id: cid('tr'), type: 'text', name: 'text', clips: [tclip('bg removed \u2728', 0.5, 3, { text: { preset: 'tiktok', size: 100 }, transform: { x: 0, y: 0.34, scale: 1, rotation: 0, opacity: 1 } })] },
    { id: cid('tr'), type: 'audio', name: 'audio', clips: [aclip('asset:sounds/pop.mp3', 0, 0.4, { volume: 1 })] },
  ]));

  for (const t of T) {
    let maxEnd = 0;
    for (const tr of t.tracks) for (const c of tr.clips || []) maxEnd = Math.max(maxEnd, c.start + c.duration);
    t.duration = maxEnd;
    fs.writeFileSync(path.join(outDir, `${t.id}.json`), JSON.stringify(t, null, 1));
  }

  // cover frames via compositor
  try {
    const { renderFrame } = await import(path.join(ROOT, 'server/renderer/compositor.js'));
    const { SourcePool } = await import(path.join(ROOT, 'server/renderer/sources.js'));
    const { GlobalFonts } = await import('@napi-rs/canvas');
    for (const m of JSON.parse(fs.readFileSync(path.join(ASSETS, 'fonts', 'manifest.json'), 'utf8'))) {
      try { GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', m.file), m.family); } catch { /* */ }
    }
    const ASPECTS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] };
    for (const t of T) {
      const [aw, ah] = ASPECTS[t.aspect];
      const W = 360, H = Math.round(360 * ah / aw);
      const pool = new SourcePool({ w: W, h: H, fps: 30 });
      const canvas = await renderFrame(t, Math.min(1.2, t.duration * 0.4), W, H, pool);
      pool.dispose();
      fs.writeFileSync(path.join(outDir, `${t.id}.jpg`), canvas.toBuffer('image/jpeg', 0.8));
    }
    console.log(`  templates: ${T.length} (+ covers)`);
  } catch (e) {
    console.warn('  cover render skipped:', e.message);
    console.log(`  templates: ${T.length}`);
  }
}

// ------------------------------------------------------------------ main ----
async function main() {
  await buildFonts();
  await buildEmojiStickers();
  await buildCustomStickers();
  await buildSounds();
  await buildSamples();
  await buildTemplates();
  console.log('assets done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
