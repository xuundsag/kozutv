#!/usr/bin/env python3
"""Synthesize royalty-free music loops & SFX for Shoul Studio (numpy, no deps)."""
import numpy as np, wave, os, sys

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/sounds'
os.makedirs(OUT, exist_ok=True)

def write(name, sig, gain=0.9):
    sig = np.asarray(sig, dtype=np.float64)
    peak = np.max(np.abs(sig)) or 1.0
    sig = sig / peak * gain
    # gentle master fade edges
    n = len(sig)
    f = min(int(SR * 0.02), n // 4)
    sig[:f] *= np.linspace(0, 1, f)
    sig[-f:] *= np.linspace(1, 0, f)
    st = np.stack([sig, sig], axis=1)
    pcm = (st * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('wrote', name)

def t(dur): return np.arange(int(SR * dur)) / SR

def sine(freq, dur, vol=1.0, glide=None):
    tt = t(dur)
    if glide:
        f = np.linspace(freq, glide, len(tt))
        ph = np.cumsum(2 * np.pi * f / SR)
        return np.sin(ph) * vol
    return np.sin(2 * np.pi * freq * tt) * vol

def saw(freq, dur, vol=1.0):
    tt = t(dur)
    return ((tt * freq) % 1.0 * 2 - 1) * vol

def square(freq, dur, vol=1.0):
    tt = t(dur)
    return np.sign(np.sin(2 * np.pi * freq * tt)) * vol

def noise(dur, vol=1.0):
    return np.random.default_rng(7).uniform(-1, 1, int(SR * dur)) * vol

def envsig(sig, a=0.005, d=0.15, sustain=0.4, rel=0.2):
    n = len(sig)
    e = np.ones(n) * sustain
    ai, di, ri = int(a * SR), int(d * SR), int(rel * SR)
    ai = min(ai, n); di = min(di, n - ai)
    e[:ai] = np.linspace(0, 1, ai)
    if di > 0: e[ai:ai + di] = np.linspace(1, sustain, di)
    ri = min(ri, n)
    e[n - ri:] = np.minimum(e[n - ri:], np.linspace(1, 0, ri))
    return sig * e

def lowpass(sig, alpha=0.12):
    out = np.zeros_like(sig); acc = 0.0
    for i, v in enumerate(sig):
        acc += alpha * (v - acc); out[i] = acc
    return out

def highpass(sig, alpha=0.9):
    lp = lowpass(sig, 1 - alpha)
    return sig - lp

def place(bus, sig, at):
    i = int(at * SR)
    end = min(len(bus), i + len(sig))
    if end > i: bus[i:end] += sig[:end - i]

NOTE = {'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23, 'G': 392.0, 'A': 440.0, 'B': 493.88, 'C5': 523.25}
def freq(n, octv=4):
    if n in NOTE: base = NOTE[n]
    else: base = NOTE[n[0]]
    return base * (2 ** (octv - 4))

# ---------------- instruments ----------------
def kick(dur=0.28, f0=150, f1=42, vol=1.0):
    return envsig(sine(f0, dur, 1.0, glide=f1), a=0.002, d=0.1, sustain=0.25, rel=dur * 0.7) * vol

def hat(dur=0.045, vol=0.5):
    return envsig(highpass(noise(dur), 0.85) * vol, a=0.001, d=0.02, sustain=0.1, rel=dur * 0.6)

def snare(vol=0.8):
    d = 0.18
    return envsig(highpass(noise(d), 0.6) * 0.7 + sine(190, d, 0.5) * 0.5, a=0.001, d=0.05, sustain=0.15, rel=d * 0.8) * vol

def clap(vol=0.7):
    out = np.zeros(int(SR * 0.25))
    for i, at in enumerate([0, 0.012, 0.026]):
        place(out, envsig(highpass(noise(0.12), 0.7), a=0.001, d=0.03, sustain=0.15, rel=0.1), at)
    return out * vol

def pad(freqs, dur, vol=0.3):
    out = np.zeros(int(SR * dur))
    for f in freqs:
        out += sine(f, dur, 0.5) + sine(f * 2.003, dur, 0.12)
    return lowpass(envsig(out, a=0.6, d=0.3, sustain=0.8, rel=0.8), 0.35) * vol / len(freqs)

def pluck(f, dur=0.4, vol=0.5):
    return envsig((sine(f, dur, 0.8) + saw(f, dur, 0.2)), a=0.002, d=0.12, sustain=0.15, rel=dur * 0.6) * vol

def bass808(f, dur=0.5, vol=0.9, glide=None):
    return envsig(sine(f, dur, 1.0, glide=glide), a=0.004, d=0.2, sustain=0.5, rel=dur * 0.5) * vol

# ---------------- songs (8s loops) ----------------
def lofi():
    bus = np.zeros(int(SR * 8)); bpm = 78; beat = 60 / bpm
    prog = [('C', ['C', 'E', 'G', 'A']), ('A', ['A', 'C', 'E', 'G']), ('F', ['F', 'A', 'C', 'E']), ('G', ['G', 'B', 'D', 'F'])]
    for bar in range(4):
        root, notes = prog[bar]
        base_t = bar * 2 * 4 * beat * 0.5
        for bi in range(4):
            place(bus, pad([freq(n, 4 if n != 'C5' else 5) for n in notes], beat * 4, 0.28), base_t)
            base_t += beat * 4 * 0.5
    for bar in range(8):
        bt = bar * 4 * beat * 0.5
        place(bus, kick(beat * 0.6), bt)
        place(bus, kick(beat * 0.6), bt + 2 * beat * 0.5)
        for e in range(8):
            place(bus, hat(0.03, 0.22), bt + e * beat * 0.5 / 2)
    write('lofi_chill', bus, 0.75)

def trap():
    bus = np.zeros(int(SR * 8)); bpm = 140; beat = 60 / bpm
    notes = [('C', 2), ('C', 2), ('D#', 2), ('A#', 1)]
    for bar in range(4):
        bt = bar * 4 * beat
        n, octv = notes[bar % 4]
        place(bus, bass808(freq(n, octv + 1), beat * 1.6, 0.9, glide=freq(n, octv + 1) * 0.75), bt)
        place(bus, bass808(freq(n, octv + 1) * 1.12, beat * 1.2, 0.8), bt + 2.5 * beat)
        place(bus, snare(0.7), bt + 2 * beat)
        for s in range(16):
            v = 0.3 if s % 4 else 0.45
            place(bus, hat(0.035, v), bt + s * beat / 4)
        for s in [7, 15]:
            for k in range(3):
                place(bus, hat(0.03, 0.3), bt + s * beat / 4 + k * beat / 16)
    write('trap_808', bus, 0.8)

def edm():
    bus = np.zeros(int(SR * 8)); bpm = 126; beat = 60 / bpm
    notes = ['A', 'A', 'F', 'G']
    for bar in range(8):
        bt = bar * 4 * beat
        n = notes[bar % 4]
        for b in range(4):
            place(bus, kick(0.24, 160, 48), bt + b * beat)
            if b % 2 == 1: place(bus, clap(0.55), bt + b * beat)
        for e in range(8):
            f = freq(n, 2)
            place(bus, envsig(saw(f, beat * 0.45, 0.35) + saw(f * 1.005, beat * 0.45, 0.25), a=0.003, d=0.05, sustain=0.6, rel=0.1), bt + e * beat / 2)
        for e in range(16):
            place(bus, hat(0.03, 0.25), bt + e * beat / 4 + beat / 4)
    write('edm_pulse', bus, 0.8)

def synthwave():
    bus = np.zeros(int(SR * 8)); bpm = 100; beat = 60 / bpm
    seq = ['A', 'C', 'E', 'A', 'G', 'E', 'C', 'G']
    for bar in range(4):
        bt = bar * 4 * beat
        place(bus, pad([freq('A', 3), freq('C', 4), freq('E', 4)], beat * 4, 0.2), bt)
        for b in range(4):
            place(bus, kick(0.25), bt + b * beat)
            if b % 2 == 1: place(bus, snare(0.5), bt + b * beat)
        for s in range(16):
            n = seq[s % len(seq)]
            place(bus, envsig(saw(freq(n, 4), beat * 0.4, 0.22), a=0.002, d=0.08, sustain=0.3, rel=0.12), bt + s * beat / 4)
    write('synthwave_ride', bus, 0.75)

def cinematic():
    bus = np.zeros(int(SR * 8))
    riser = np.zeros(int(SR * 6))
    for i, tt in enumerate(t(6)):
        f = 120 * (2 ** (tt / 6 * 2.5))
        riser[i] = (saw(f, 1 / SR)[0]) * (tt / 6) ** 1.5
    bus[:len(riser)] += riser * 0.35
    place(bus, kick(1.4, 90, 30, 1.0) * 1.4, 6.0)
    place(bus, envsig(noise(1.2) * 0.4, a=0.001, d=0.3, sustain=0.1, rel=0.8), 6.0)
    place(bus, pad([freq('C', 5), freq('E', 5), freq('G', 5)], 1.8, 0.25), 6.0)
    write('cinematic_riser', bus, 0.85)

def plucky():
    bus = np.zeros(int(SR * 8)); bpm = 112; beat = 60 / bpm
    mel = [('C', 5), ('E', 5), ('G', 5), ('C', 6), ('G', 5), ('E', 5), ('A', 5), ('G', 5),
           ('F', 5), ('A', 5), ('C', 6), ('A', 5), ('G', 5), ('E', 5), ('D', 5), ('C', 5)]
    for bar in range(2):
        bt = bar * 4 * beat
        place(bus, pad([freq('C', 3), freq('G', 3)], beat * 4, 0.18), bt)
        for s in range(16):
            n, o = mel[(bar * 16 + s) % len(mel)]
            place(bus, pluck(freq(n, o - 1), 0.5, 0.5), bt + s * beat / 4)
        for b in range(4):
            if b % 2 == 1: place(bus, clap(0.4), bt + b * beat)
    write('sunny_pluck', bus, 0.7)

def corporate():
    bus = np.zeros(int(SR * 8)); bpm = 120; beat = 60 / bpm
    for bar in range(4):
        bt = bar * 4 * beat
        ch = [freq('C', 4), freq('E', 4), freq('G', 4)]
        for s in range(8):
            place(bus, envsig(square(freq('C', 5 if s % 2 else 4), beat * 0.3, 0.15), a=0.002, d=0.05, sustain=0.4, rel=0.08), bt + s * beat / 2)
            if s % 2 == 0: place(bus, pad(ch, beat * 0.5, 0.12), bt + s * beat / 2)
        for b in range(4):
            place(bus, kick(0.2), bt + b * beat)
            if b % 2 == 1: place(bus, clap(0.5), bt + b * beat)
    write('corporate_pop', bus, 0.7)

# ---------------- sfx ----------------
def sfx_whoosh():
    d = 0.9
    sig = noise(d) * 0.8
    mod = lowpass(sig, 0.05)
    e = np.abs(np.sin(np.linspace(0, np.pi, len(mod)))) ** 2
    write('whoosh', mod * e, 0.8)

def sfx_swoosh_up():
    d = 0.7
    n = int(SR * d)
    sweep = np.zeros(n)
    for i, tt in enumerate(t(d)):
        f = 200 * (2 ** (tt / d * 2.8))
        sweep[i] = sine(f, 1 / SR)[0]
    write('swoosh_up', sweep * (t(d) / d), 0.5)

def sfx_pop():
    write('pop', envsig(sine(500, 0.12, 1.0, glide=1000), a=0.001, d=0.02, sustain=0.3, rel=0.06), 0.85)

def sfx_ding():
    write('ding', envsig(sine(1318, 1.0, 0.7) + sine(1975, 1.0, 0.3), a=0.002, d=0.1, sustain=0.25, rel=0.7), 0.7)

def sfx_boom():
    b = kick(1.2, 110, 28, 1.2)
    n = envsig(noise(0.4), a=0.001, d=0.1, sustain=0.05, rel=0.3) * 0.5
    out = np.zeros(max(len(b), len(n)))
    out[:len(b)] += b; out[:len(n)] += n
    write('boom', out, 0.95)

def sfx_riser():
    d = 2.2
    n = int(SR * d)
    out = np.zeros(n)
    for i, tt in enumerate(t(d)):
        f = 180 * (2 ** (tt / d * 3))
        out[i] = saw(f, 1 / SR)[0] * (tt / d) ** 1.3
    write('riser', out, 0.5)

def sfx_tape_stop():
    d = 1.4
    n = int(SR * d)
    out = np.zeros(n)
    ph = 0.0
    for i, tt in enumerate(t(d)):
        f = 440 * (1 - tt / d) ** 2 + 40
        ph += 2 * np.pi * f / SR
        out[i] = np.sin(ph) * (1 - tt / d) ** 0.3
    write('tape_stop', out, 0.7)

def sfx_click():
    write('click', envsig(noise(0.04), a=0.0005, d=0.005, sustain=0.1, rel=0.02), 0.8)

def sfx_camera():
    for i, at in enumerate([0, 0.09]):
        pass
    out = np.zeros(int(SR * 0.3))
    place(out, envsig(noise(0.03), a=0.0005, d=0.004, sustain=0.1, rel=0.01), 0)
    place(out, envsig(noise(0.05), a=0.0005, d=0.006, sustain=0.1, rel=0.02), 0.09)
    write('camera', out, 0.8)

if __name__ == '__main__':
    lofi(); trap(); edm(); synthwave(); cinematic(); plucky(); corporate()
    sfx_whoosh(); sfx_swoosh_up(); sfx_pop(); sfx_ding(); sfx_boom(); sfx_riser(); sfx_tape_stop(); sfx_click(); sfx_camera()
    print('done ->', OUT)
