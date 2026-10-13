import glob, sys
from playwright.sync_api import sync_playwright
times = [float(x) for x in sys.argv[1:]]
with sync_playwright() as p:
    exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome")
    b = p.chromium.launch(executable_path=exe[0] if exe else None, args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto("file://" + __import__("os").path.abspath("video.html")); pg.evaluate("window.ready")
    for t in times:
        pg.evaluate(f"renderAt({t})"); pg.screenshot(path=f"preview_{t:06.1f}.png")
    print("errors:", errs[:5]); b.close()
