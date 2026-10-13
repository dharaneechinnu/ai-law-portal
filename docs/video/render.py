"""Render video.html frame by frame (deterministic renderAt(t)) and encode with ffmpeg.
Usage: python render.py [workers]   -> out/lexai-portal-tour.mp4"""
import glob, json, os, subprocess, sys, time
from multiprocessing import Process
from playwright.sync_api import sync_playwright

W = int(sys.argv[1]) if len(sys.argv) > 1 else 4
TL = json.load(open("timeline.json"))
FPS, N = TL["fps"], int(TL["duration"] * TL["fps"])
os.makedirs("out", exist_ok=True)


def worker(k: int, a: int, b: int) -> None:
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS),
                            f"out/seg{k}.mp4"], stdin=subprocess.PIPE)
    with sync_playwright() as p:
        exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")
        br = p.chromium.launch(executable_path=exe[0] if exe else None, args=["--allow-file-access-from-files"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto("file://" + os.path.abspath("video.html"))
        pg.evaluate("window.ready")
        t0 = time.time()
        for i in range(a, b):
            pg.evaluate(f"renderAt({i / FPS})")
            enc.stdin.write(pg.screenshot(type="jpeg", quality=95))
            if (i - a) % 300 == 0:
                print(f"w{k} {i - a}/{b - a} {time.time() - t0:.0f}s", flush=True)
        br.close()
    enc.stdin.close()
    enc.wait()


if __name__ == "__main__":
    step = -(-N // W)
    ps = [Process(target=worker, args=(k, k * step, min(N, (k + 1) * step))) for k in range(W)]
    [p.start() for p in ps]
    [p.join() for p in ps]
    with open("out/list.txt", "w") as f:
        f.writelines(f"file 'seg{k}.mp4'\n" for k in range(W))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "out/list.txt", "-c", "copy", "out/video-only.mp4"], check=True)
    # mix: narration (mono 24k) + music ducked under the voice, normalised to -16 LUFS
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "out/video-only.mp4", "-i", "voice/narration.wav", "-i", "assets/music.wav",
                    "-filter_complex",
                    "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,asplit=2[v1][v2];"
                    "[2:a]aresample=48000,volume=0.5[m];"
                    "[m][v1]sidechaincompress=threshold=0.02:ratio=7:attack=20:release=450[duck];"
                    "[duck][v2]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-tune", "animation", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-movflags", "+faststart", "-shortest", "out/lexai-portal-tour.mp4"], check=True)
    print("done", N, "frames")
