"""Original background music, synthesised with numpy (no samples, no licence): warm pad, soft piano-like
arpeggio, sub bass, and a light chime at each chapter change. Writes assets/music.wav (44.1 kHz stereo)."""
import json
import os
import numpy as np
import soundfile as sf

SR = 44100
os.makedirs("assets", exist_ok=True)
tl = json.load(open("timeline.json"))
DUR = tl["duration"]
N = int(DUR * SR)
t = np.arange(N) / SR
BPM = 80
BEAT = 60 / BPM
BAR = 4 * BEAT

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# I - vi - IV - V flavour in D major, with sevenths: Dmaj7, Bm7, Gmaj7, A6sus
CHORDS = [[50, 57, 61, 64, 66], [47, 54, 57, 62, 64], [43, 50, 54, 59, 62], [45, 52, 57, 59, 64]]

pad = np.zeros(N)
bass = np.zeros(N)
arp = np.zeros(N)
nbars = int(np.ceil(DUR / BAR)) + 1
fade = int(1.2 * SR)
for b in range(nbars):
    ch = CHORDS[b % 4]
    s, e = int(b * BAR * SR), int((b + 1) * BAR * SR)
    s0, e1 = max(s - fade, 0), min(e + fade, N)
    if s0 >= N:
        break
    seg = t[s0:e1]
    env = np.ones(e1 - s0)
    ramp = min(fade, len(env) // 2)
    env[:ramp] *= np.sin(np.linspace(0, np.pi / 2, ramp)) ** 2
    env[-ramp:] *= np.cos(np.linspace(0, np.pi / 2, ramp)) ** 2
    for i, m in enumerate(ch[1:]):
        f = hz(m + 12)
        for det in (-0.12, 0.12):  # slow chorus
            pad[s0:e1] += env * 0.05 * np.sin(2 * np.pi * f * (1 + det / 100) * seg + i) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * seg + i))
    bass[s0:e1] += env * 0.10 * np.sin(2 * np.pi * hz(ch[0] - 12) * seg)
    # arpeggio: eighth notes up and down the chord, piano-like decay
    pattern = [0, 2, 3, 4, 3, 2, 1, 2]
    for k in range(8):
        st = int((b * BAR + k * BEAT / 2) * SR)
        if st >= N:
            break
        L = min(int(1.6 * SR), N - st)
        tt = np.arange(L) / SR
        f = hz(ch[1 + pattern[k] % 4] + 24)
        vel = 0.055 if k % 2 == 0 else 0.038
        tone = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6) + 0.12 * np.sin(6 * np.pi * f * tt) * np.exp(-tt * 9)
        arp[st:st + L] += vel * tone * np.exp(-tt * 3.2) * (1 - np.exp(-tt * 400))

# chimes at each chapter change
chime = np.zeros(N)
for sc in tl["scenes"][1:]:
    st = int(max(sc["start"], 0) * SR)
    L = min(int(2.5 * SR), N - st)
    tt = np.arange(L) / SR
    for f, a in ((hz(86), 0.05), (hz(93), 0.03), (hz(98), 0.018)):
        chime[st:st + L] += a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 2.4) * (1 - np.exp(-tt * 300))

def comb_reverb(x, delays, g):
    out = np.zeros_like(x)
    for D in delays:
        y = x.copy()
        for k in range(D, len(x), D):
            y[k:k + D] += g * y[k - D:k][: len(y[k:k + D])]
        out += y
    return out / len(delays)

dry = pad + bass + arp
wet_l = comb_reverb(arp + chime + pad * 0.5, [1557 * 2, 1617 * 2, 1491 * 2, 1422 * 2], 0.72)
wet_r = comb_reverb(arp + chime + pad * 0.5, [1277 * 2, 1356 * 2, 1188 * 2, 1116 * 2 + 22], 0.72)
pan = 0.15 * np.sin(2 * np.pi * 0.05 * t)
L = dry * (1 - pan) + 0.35 * wet_l + chime * 0.6
R = dry * (1 + pan) + 0.35 * wet_r + chime * 0.6
mix = np.stack([L, R], axis=1)
# fade in / out
fi, fo = int(2.5 * SR), int(4.0 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix = mix / np.abs(mix).max() * 0.85
sf.write("assets/music.wav", mix.astype(np.float32), SR)
print("music", round(DUR, 1), "s")
