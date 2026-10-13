# Product video: how it is made

`lexai-portal-tour.mp4` is a 1:33 product tour (1920×1080, 30 fps, H.264 + AAC) narrated by **Lexi**, an
illustrated presenter. Everything is built from open-source tools and can be rebuilt from this folder.

| Part | Tool | Licence |
|---|---|---|
| Voice | [Kokoro-82M](https://github.com/hexgrad/kokoro) via [`kokoro-onnx`](https://github.com/thewh1teagle/kokoro-onnx), voice `af_heart` | Apache-2.0 / MIT |
| Music | `make_music.py`: original music synthesised with numpy | Ours |
| Fonts | Inter, Playfair Display (same as the app) | SIL OFL |
| Animation | `video.html` rendered frame by frame in Chromium with Playwright | — |
| Encoding | FFmpeg (libx264, AAC; music ducked under the voice, loudness -16 LUFS) | LGPL/GPL |

## Files
- `script.json`: the narration, one entry per sentence ("beat"), with the screenshot, the area to zoom into
  (`focus`, in screenshot pixels) and the short point shown on the left.
- `make_voice.py`: speaks each sentence, joins them with pauses, and writes `voice/narration.wav`, `timeline.json`
  (when each sentence starts and ends) and the per-frame mouth movement for the presenter.
- `make_music.py`: writes `assets/music.wav`, as long as the narration, with a soft chime at each chapter.
- `video.html`: the animation. `renderAt(t)` draws the exact frame for time `t`, so rendering is repeatable.
- `render.py`: renders every frame in parallel and encodes the final `out/lexai-portal-tour.mp4`.
- `preview.py`: renders single frames to PNG, e.g. `python preview.py 9 76 150`.
- `demo/`: the sample-data app used for the screenshots (a demo server with a scripted stand-in AI model, seed
  scripts, and `capture_all.py`, which saves every screen at 2× resolution into `assets/shots/`).

## Rebuild
Run from this folder with the backend's virtualenv active, plus `pip install kokoro-onnx soundfile playwright httpx`
and FFmpeg on the PATH.

1. Download the voice model (about 350 MB) into `models/`:
   ```bash
   mkdir -p models
   curl -L -o models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
   curl -L -o models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
   ```
2. Screenshots: start the demo app against an empty database (`DATABASE_URL=...ai_law_demo`, `SCHEDULER_ENABLED=false`),
   `alembic upgrade head` in `backend/`, then in `demo/`:
   `uvicorn demo_server:app --port 8000`, `npm run dev` in `frontend/`, `python seed2.py` (prints the matter id),
   `python seed3.py`, `python capture_all.py <matter id>`.
3. `python make_voice.py`, then `python make_music.py`.
4. `python render.py 4` (4 parallel workers). Output: `out/lexai-portal-tour.mp4`.

To change what Lexi says, edit `script.json` and rerun steps 3 and 4. Scene timing follows the new narration.
