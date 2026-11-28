// Static asset catalogs: fonts, stickers, sounds, filters, effects, text presets,
// animations, transitions, aspects. Files themselves live under assets/ and are
// produced by scripts/build-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ASPECTS } from './config.js';
import { readJSON } from './util.js';

const FONTS = [
  { id: 'anton', name: 'Anton', family: 'Anton', category: 'display', weights: [400] },
  { id: 'bebas-neue', name: 'Bebas Neue', family: 'Bebas Neue', category: 'display', weights: [400] },
  { id: 'oswald', name: 'Oswald', family: 'Oswald', category: 'display', weights: [400, 700] },
  { id: 'archivo-black', name: 'Archivo Black', family: 'Archivo Black', category: 'display', weights: [400] },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat', category: 'sans', weights: [400, 700, 900] },
  { id: 'poppins', name: 'Poppins', family: 'Poppins', category: 'sans', weights: [400, 600, 800] },
  { id: 'inter', name: 'Inter', family: 'Inter', category: 'sans', weights: [400, 700, 900] },
  { id: 'nunito', name: 'Nunito', family: 'Nunito', category: 'sans', weights: [400, 800] },
  { id: 'roboto-condensed', name: 'Roboto Condensed', family: 'Roboto Condensed', category: 'sans', weights: [400, 700] },
  { id: 'space-grotesk', name: 'Space Grotesk', family: 'Space Grotesk', category: 'sans', weights: [400, 700] },
  { id: 'sora', name: 'Sora', family: 'Sora', category: 'sans', weights: [400, 800] },
  { id: 'syne', name: 'Syne', family: 'Syne', category: 'sans', weights: [400, 800] },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', family: 'JetBrains Mono', category: 'mono', weights: [400, 800] },
  { id: 'playfair-display', name: 'Playfair Display', family: 'Playfair Display', category: 'serif', weights: [400, 700] },
  { id: 'abril-fatface', name: 'Abril Fatface', family: 'Abril Fatface', category: 'serif', weights: [400] },
  { id: 'lobster', name: 'Lobster', family: 'Lobster', category: 'script', weights: [400] },
  { id: 'pacifico', name: 'Pacifico', family: 'Pacifico', category: 'script', weights: [400] },
  { id: 'dancing-script', name: 'Dancing Script', family: 'Dancing Script', category: 'script', weights: [400, 700] },
  { id: 'caveat', name: 'Caveat', family: 'Caveat', category: 'handwriting', weights: [400, 700] },
  { id: 'permanent-marker', name: 'Permanent Marker', family: 'Permanent Marker', category: 'handwriting', weights: [400] },
  { id: 'bangers', name: 'Bangers', family: 'Bangers', category: 'comic', weights: [400] },
  { id: 'luckiest-guy', name: 'Luckiest Guy', family: 'Luckiest Guy', category: 'comic', weights: [400] },
  { id: 'titan-one', name: 'Titan One', family: 'Titan One', category: 'comic', weights: [400] },
  { id: 'fredoka', name: 'Fredoka', family: 'Fredoka', category: 'rounded', weights: [400, 600] },
  { id: 'press-start-2p', name: 'Press Start 2P', family: 'Press Start 2P', category: 'retro', weights: [400] },
  { id: 'righteous', name: 'Righteous', family: 'Righteous', category: 'display', weights: [400] },
  { id: 'rubik-mono-one', name: 'Rubik Mono One', family: 'Rubik Mono One', category: 'retro', weights: [400] },
];

// visual filter presets (looks)
const FILTERS = [
  { id: 'none', name: 'Original' },
  { id: 'vivid', name: 'Vivid', adj: { saturation: 1.35, contrast: 1.12 } },
  { id: 'mono', name: 'Mono', adj: { grayscale: 1, contrast: 1.1 } },
  { id: 'noir', name: 'Noir', adj: { grayscale: 1, contrast: 1.45, brightness: 0.92 } },
  { id: 'sepia', name: 'Sepia', adj: { sepia: 0.75 } },
  { id: 'fade', name: 'Fade', adj: { saturation: 0.72, brightness: 1.08, contrast: 0.9 } },
  { id: 'warm', name: 'Warm', adj: { sepia: 0.22, saturation: 1.15, brightness: 1.03 } },
  { id: 'cool', name: 'Cool', adj: { hue: -12, saturation: 1.1 } },
  { id: 'sunset', name: 'Sunset', adj: { hue: -8, sepia: 0.3, saturation: 1.3, contrast: 1.05 } },
  { id: 'cyberpunk', name: 'Cyberpunk', adj: { hue: 160, saturation: 1.6, contrast: 1.2 } },
  { id: 'dreamy', name: 'Dreamy', adj: { brightness: 1.1, saturation: 0.9, blurSoft: 2 } },
  { id: 'blush', name: 'Blush', adj: { hue: 12, saturation: 1.2, brightness: 1.06 } },
  { id: 'forest', name: 'Forest', adj: { hue: 45, saturation: 1.15 } },
  { id: 'vintage', name: 'Vintage', adj: { sepia: 0.45, contrast: 0.92, saturation: 0.85, grain: 0.25 } },
];

// per-clip post effects
const EFFECTS = [
  { id: 'glitch', name: 'Glitch', desc: 'sliced RGB chaos', min: 0, max: 1 },
  { id: 'rgbshift', name: 'RGB Split', desc: 'chromatic offset', min: 0, max: 1 },
  { id: 'vhs', name: 'VHS', desc: 'tape look', min: 0, max: 1 },
  { id: 'scanlines', name: 'Scanlines', desc: 'CRT lines', min: 0, max: 1 },
  { id: 'grain', name: 'Film Grain', desc: 'analog noise', min: 0, max: 1 },
  { id: 'vignette', name: 'Vignette', desc: 'dark edges', min: 0, max: 1 },
  { id: 'pixelate', name: 'Pixelate', desc: '8-bit blocks', min: 0, max: 1 },
  { id: 'zoompulse', name: 'Zoom Pulse', desc: 'beat zoom', min: 0, max: 1 },
  { id: 'shake', name: 'Shake', desc: 'camera shake', min: 0, max: 1 },
  { id: 'rainbow', name: 'Chroma Cycle', desc: 'rainbow hue loop', min: 0, max: 1 },
  { id: 'duotone', name: 'Duotone', desc: 'two-tone ink', min: 0, max: 1 },
  { id: 'glow', name: 'Soft Glow', desc: 'dreamy bloom', min: 0, max: 1 },
  { id: 'mirror', name: 'Mirror', desc: 'kaleidoscope flip', min: 0, max: 1 },
  { id: 'flash', name: 'Strobe', desc: 'flash cut', min: 0, max: 1 },
  { id: 'oldfilm', name: 'Old Film', desc: 'sepia flicker', min: 0, max: 1 },
];

const TRANSITIONS = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'dipblack', name: 'Dip to Black' },
  { id: 'dipwhite', name: 'Dip to White' },
  { id: 'slideleft', name: 'Slide Left' },
  { id: 'slideright', name: 'Slide Right' },
  { id: 'zoomin', name: 'Zoom Punch' },
  { id: 'wipeleft', name: 'Wipe →' },
  { id: 'wipeup', name: 'Wipe ↑' },
  { id: 'blur', name: 'Blur Dissolve' },
];

const TEXT_PRESETS = [
  { id: 'none', name: 'Basic', defaults: { font: 'poppins', weight: 800, color: '#ffffff' } },
  { id: 'classic', name: 'Classic', defaults: { font: 'poppins', weight: 800, color: '#ffffff', stroke: { color: '#000000', width: 5 } } },
  { id: 'tiktok', name: 'TikTok Bold', defaults: { font: 'poppins', weight: 800, color: '#ffffff', stroke: { color: '#000000', width: 8 }, align: 'center' } },
  { id: 'brat', name: 'brat', defaults: { font: 'anton', weight: 400, color: '#ffffff', bg: { enabled: true, color: '#8ace00', padX: 44, padY: 30, radius: 0 }, uppercase: false } },
  { id: 'neon', name: 'Neon', defaults: { font: 'inter', weight: 900, color: '#ffffff', shadow: { color: '#00e5ff', blur: 34, x: 0, y: 0 }, stroke: { color: '#00e5ff', width: 2 } } },
  { id: 'karaoke', name: 'Karaoke', defaults: { font: 'anton', weight: 400, color: '#ffffff', accent: '#ffe600', anim: 'karaoke', stroke: { color: '#000000', width: 4 } } },
  { id: 'meme', name: 'Meme', defaults: { font: 'anton', weight: 400, color: '#ffffff', uppercase: true, stroke: { color: '#000000', width: 9 } } },
  { id: 'subtitle', name: 'Subtitle', defaults: { font: 'poppins', weight: 600, color: '#ffffff', bg: { enabled: true, color: '#000000cc', padX: 26, padY: 14, radius: 10 } } },
  { id: 'gradient', name: 'Gradient', defaults: { font: 'poppins', weight: 900, gradient: ['#ff3d81', '#ffcc00'] } },
  { id: 'quote', name: 'Quote', defaults: { font: 'playfair-display', weight: 700, color: '#ffffff', lineHeight: 1.35 } },
  { id: 'handwritten', name: 'Handwritten', defaults: { font: 'caveat', weight: 700, color: '#ffffff', size: 130 } },
  { id: 'retro', name: 'Retro Terminal', defaults: { font: 'jetbrains-mono', weight: 800, color: '#7cfc00', shadow: { color: '#00ff0044', blur: 22, x: 0, y: 0 } } },
  { id: 'minimal', name: 'Minimal', defaults: { font: 'montserrat', weight: 400, color: '#ffffff', letterSpacing: 8 } },
  { id: 'bold-pop', name: 'Bold Pop', defaults: { font: 'luckiest-guy', weight: 400, color: '#ffffff', stroke: { color: '#000000', width: 6 }, anim: 'bounce' } },
  { id: 'shadow3d', name: '3D Shadow', defaults: { font: 'titan-one', weight: 400, color: '#ffffff', shadow: { color: '#000000cc', blur: 0, x: 8, y: 10 } } },
  { id: 'outline', name: 'Hollow', defaults: { font: 'montserrat', weight: 900, color: '#ffffff00', stroke: { color: '#ffffff', width: 6 } } },
];

const ANIM_IN = ['none', 'fade', 'pop', 'slideup', 'slidedown', 'slideleft', 'slideright', 'zoomin', 'bounce', 'spin'];
const ANIM_OUT = ['none', 'fade', 'popout', 'zoomout', 'slideup', 'slideleft'];
const ANIM_LOOP = ['none', 'float', 'pulse', 'shake', 'wobble', 'spin', 'sway'];
const STICKER_ANIMS = ['none', 'pop', 'pulse', 'shake', 'spin', 'float', 'bounce', 'wobble', 'flash'];

let _assetLists = null;
export function assetLists() {
  if (_assetLists) return _assetLists;
  const stickersDir = path.join(DIRS.assets, 'stickers');
  const groups = {};
  if (fs.existsSync(stickersDir)) {
    for (const g of fs.readdirSync(stickersDir)) {
      const d = path.join(stickersDir, g);
      if (!fs.statSync(d).isDirectory()) continue;
      groups[g] = fs.readdirSync(d).filter((f) => f.endsWith('.png')).sort();
    }
  }
  const soundsDir = path.join(DIRS.assets, 'sounds');
  const sounds = fs.existsSync(soundsDir)
    ? fs.readdirSync(soundsDir).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav')).sort()
    : [];
  const samplesDir = path.join(DIRS.assets, 'samples');
  const samples = fs.existsSync(samplesDir)
    ? fs.readdirSync(samplesDir).filter((f) => /\.(mp4|png|jpg)$/i.test(f)).sort()
    : [];
  const templatesDir = path.join(DIRS.assets, 'templates');
  const templates = fs.existsSync(templatesDir)
    ? fs.readdirSync(templatesDir).filter((f) => f.endsWith('.json')).sort()
    : [];
  _assetLists = { groups, sounds, samples, templates };
  return _assetLists;
}

export function catalog() {
  const { groups, sounds, samples, templates } = assetLists();
  const stickers = Object.entries(groups).flatMap(([group, files]) =>
    files.map((f) => ({
      id: `${group}/${f.replace(/\.png$/, '')}`,
      name: f.replace(/\.png$/, '').replace(/[-_]/g, ' '),
      group,
      src: `asset:stickers/${group}/${f}`,
      thumb: `/assets/stickers/${group}/${f}`,
    }))
  );
  const tplList = templates.map((f) => {
    const t = readJSON(path.join(DIRS.assets, 'templates', f), {});
    return { id: f.replace(/\.json$/, ''), name: t.name || f, desc: t.desc || '', aspect: t.aspect || '9:16', cover: `/assets/templates/${f.replace(/\.json$/, '')}.jpg` };
  });
  return {
    fonts: FONTS,
    filters: FILTERS,
    effects: EFFECTS,
    transitions: TRANSITIONS,
    textPresets: TEXT_PRESETS,
    anims: { in: ANIM_IN, out: ANIM_OUT, loop: ANIM_LOOP, sticker: STICKER_ANIMS },
    aspects: ASPECTS,
    stickers,
    sounds: sounds.map((f) => ({ id: f, name: f.replace(/\.(mp3|wav)$/, '').replace(/[-_]/g, ' '), src: `asset:sounds/${f}` })),
    samples: samples.map((f) => ({ id: f, src: `asset:samples/${f}`, type: f.endsWith('.mp4') ? 'video' : 'image' })),
    templates: tplList,
  };
}

export function textPreset(id) {
  return (TEXT_PRESETS.find((p) => p.id === id) || TEXT_PRESETS[0]).defaults;
}

export function filterPreset(id) {
  return (FILTERS.find((p) => p.id === id) || FILTERS[0]).adj || {};
}

export function fontById(id) {
  return FONTS.find((f) => f.id === id) || FONTS[0];
}
