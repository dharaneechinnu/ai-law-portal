"""Narration with Kokoro-82M (open source, Apache-2.0) via kokoro-onnx. One clip per sentence, so captions and
scene timing follow the real speech. Writes voice/narration.wav, timeline.json (per beat start/end) and the
per-frame mouth envelope for the presenter's lip sync."""
import json
import os
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FPS, SR = 30, 24000
VOICE, SPEED = "af_heart", 1.0
LEAD_IN, GAP, SCENE_GAP, TAIL = 1.3, 0.45, 1.1, 2.8

os.makedirs("voice", exist_ok=True)
script = json.load(open("script.json"))
k = Kokoro("models/kokoro-v1.0.onnx", "models/voices-v1.0.bin")

pieces, t = [], LEAD_IN
pieces.append(np.zeros(int(LEAD_IN * SR), dtype=np.float32))
for si, scene in enumerate(script["scenes"]):
    scene["start"] = t - (LEAD_IN if si == 0 else SCENE_GAP / 2)
    for bi, beat in enumerate(scene["beats"]):
        audio, sr = k.create(beat["text"], voice=VOICE, speed=SPEED, lang="en-us")
        assert sr == SR
        audio = audio.astype(np.float32)
        # trim leading/trailing near-silence so gaps are ours
        nz = np.where(np.abs(audio) > 0.01)[0]
        audio = audio[max(nz[0] - 600, 0): nz[-1] + 1200] if len(nz) else audio
        beat["start"], beat["end"] = t, t + len(audio) / SR
        pieces.append(audio)
        t = beat["end"]
        gap = GAP if bi < len(scene["beats"]) - 1 else (SCENE_GAP if si < len(script["scenes"]) - 1 else TAIL)
        pieces.append(np.zeros(int(gap * SR), dtype=np.float32))
        t += gap
        print(f"{scene['id']:10s} {beat['start']:7.2f}-{beat['end']:7.2f}  {beat['text'][:60]}")
    scene["end"] = t - (SCENE_GAP / 2 if si < len(script["scenes"]) - 1 else 0)

voice = np.concatenate(pieces)
voice = voice / max(1e-6, np.abs(voice).max()) * 0.89
sf.write("voice/narration.wav", voice, SR)
duration = len(voice) / SR

# mouth envelope: RMS per frame, fast attack / slower release, 0..1
hop = SR // FPS
n = int(np.ceil(duration * FPS))
rms = np.array([np.sqrt(np.mean(voice[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(voice) else 0 for i in range(n)])
rms = np.clip(rms / (np.percentile(rms[rms > 0.005], 95) if (rms > 0.005).any() else 1), 0, 1)
env, prev = [], 0.0
for v in rms:
    prev = v if v > prev else prev * 0.55 + v * 0.45
    env.append(round(float(prev), 3))

script["duration"], script["fps"], script["mouth"] = duration, FPS, env
json.dump(script, open("timeline.json", "w"))
open("timeline.js", "w").write("window.TL=" + json.dumps(script) + ";")  # loaded by video.html
print(f"duration {duration:.1f}s, frames {n}")
