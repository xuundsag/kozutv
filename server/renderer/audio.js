// Audio mixing graph builder (ffmpeg filter_complex) — server side
export function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2) { parts.push('atempo=2'); s /= 2; }
  while (s < 0.5) { parts.push('atempo=0.5'); s *= 2; }
  if (Math.abs(s - 1) > 0.001) parts.push(`atempo=${s.toFixed(4)}`);
  return parts;
}

/**
 * Build ffmpeg args for the audio mix.
 * segments: [{path, start, dur, in, speed, volume, fadeIn, fadeOut, delay}]
 * Returns { inputs: ['-i',p,...], filter: '...'} or null if no audio.
 */
export function buildAudioMix(segments, totalDur, inputOffset = 0) {
  const real = (segments || []).filter((s) => s.path && s.dur > 0.01);
  if (!real.length) return null;
  const inputs = [];
  const chains = [];
  real.forEach((seg, i) => {
    inputs.push('-i', seg.path);
    const idx = i + inputOffset;
    const speed = seg.speed || 1;
    const srcDur = seg.dur * speed;
    const c = [`[${idx}:a]aresample=44100`,
      `atrim=start=${(seg.in || 0).toFixed(3)}:end=${((seg.in || 0) + srcDur).toFixed(3)}`,
      'asetpts=N/SR/TB'];
    c.push(...atempoChain(speed));
    const vol = seg.volume == null ? 1 : seg.volume;
    if (vol !== 1) c.push(`volume=${vol.toFixed(3)}`);
    if (seg.fadeIn > 0) c.push(`afade=t=in:st=0:d=${seg.fadeIn.toFixed(3)}`);
    if (seg.fadeOut > 0) c.push(`afade=t=out:st=${Math.max(0, seg.dur - seg.fadeOut).toFixed(3)}:d=${seg.fadeOut.toFixed(3)}`);
    const delayMs = Math.max(0, Math.round((seg.start || 0) * 1000));
    c.push(`adelay=${delayMs}:all=1`);
    chains.push(c.join(',') + `[a${i}]`);
  });
  const mixIn = real.map((_, i) => `[a${i}]`).join('');
  const tail = totalDur ? `,apad=whole_dur=${totalDur.toFixed(3)}` : '';
  chains.push(`${mixIn}amix=inputs=${real.length}:normalize=0:dropout_transition=0${tail}[amixout]`);
  return { inputs, filter: chains.join(';'), map: '[amixout]' };
}
