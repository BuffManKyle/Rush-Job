#!/usr/bin/env python3
"""Rush Job asset runner: runs tools/blender/*_build.py in headless Blender 5.2.

    py tools/blender/build.py              # build everything
    py tools/blender/build.py kit props    # just kit_build.py and props_build.py
    py tools/blender/build.py --no-preview # skip renders (faster; GLB + manifest only)

Each build script writes assets/models/<lib>.glb, one preview PNG per piece and a
manifest.json in reference-images/previews/<lib>/. This runner then composes a labelled
contact sheet reference-images/previews/<lib>_sheet.png (needs Pillow) and, if gltfpack is
on PATH, meshopt-compresses the GLB in place. Set RJ_BLENDER to override the Blender path.
"""
import glob, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BLENDER = os.environ.get("RJ_BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
PREVIEWS = os.path.join(ROOT, "reference-images", "previews")


def run_one(script, preview):
    env = dict(os.environ, PYTHONPATH=HERE, RJ_PREVIEW="1" if preview else "0")
    cmd = [BLENDER, "--background", "--factory-startup", "--python-exit-code", "1",
           "--python", script]
    t = time.time()
    p = subprocess.run(cmd, env=env, capture_output=True, text=True, errors="replace")
    done = [l for l in p.stdout.splitlines() if l.startswith("RJ_")]
    if p.returncode != 0 or not any(l.startswith("RJ_DONE") for l in done):
        print(p.stdout[-4000:]); print(p.stderr[-4000:])
        raise SystemExit(f"FAILED: {os.path.basename(script)} (exit {p.returncode})")
    for l in done:
        print("  " + l)
    print(f"  ({time.time() - t:.1f} s)")


def sheet(lib):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("  (no Pillow: skipping contact sheet)"); return
    d = os.path.join(PREVIEWS, lib)
    man = json.load(open(os.path.join(d, "manifest.json")))
    items = [(p, os.path.join(d, p["name"] + ".png")) for p in man["pieces"]]
    items = [(p, f) for p, f in items if os.path.exists(f)]
    if not items:
        return
    cell, cols = 260, 6
    rows = (len(items) + cols - 1) // cols
    W, H = cols * cell, rows * (cell + 34) + 40
    img = Image.new("RGB", (W, H), (20, 29, 51))
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("consola.ttf", 15); big = ImageFont.truetype("consola.ttf", 20)
    except OSError:
        font = big = ImageFont.load_default()
    dr.text((10, 10), f"{lib}.glb  {len(items)} pieces  {man['bytes'] / 1024:.0f} KB", fill=(255, 213, 154), font=big)
    for i, (p, f) in enumerate(items):
        x, y = (i % cols) * cell, 40 + (i // cols) * (cell + 34)
        im = Image.open(f).convert("RGB").resize((cell - 6, cell - 6))
        img.paste(im, (x + 3, y))
        dr.text((x + 6, y + cell - 2), p["name"], fill=(242, 239, 232), font=font)
        dr.text((x + 6, y + cell + 15), f"{p['tris']} tris", fill=(108, 197, 185) if p["tris"] < 2000 else (224, 38, 47), font=font)
    out = os.path.join(PREVIEWS, f"{lib}_sheet.png")
    img.save(out)
    print(f"  sheet -> {os.path.relpath(out, ROOT)}")


def meshopt(lib):
    gp = shutil.which("gltfpack")
    path = os.path.join(ROOT, "assets", "models", lib + ".glb")
    if not gp:
        print("  (gltfpack not on PATH: GLB left uncompressed, meshopt pending)"); return
    tmp = path + ".tmp.glb"
    # -cc: meshopt compression; -kn/-km: keep node and material names (the loader uses them);
    # -noq off by default would quantize; keep quantization, it is lossless enough for low-poly.
    subprocess.run([gp, "-i", path, "-o", tmp, "-cc", "-kn", "-km", "-ke"], check=True)
    os.replace(tmp, path)
    print(f"  meshopt -> {os.path.getsize(path)} bytes")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--no-preview" not in sys.argv
    scripts = sorted(glob.glob(os.path.join(HERE, "*_build.py")))
    if args:
        scripts = [s for s in scripts if os.path.basename(s)[:-9] in args]
    if not scripts:
        raise SystemExit("no matching *_build.py")
    for s in scripts:
        lib = os.path.basename(s)[:-9]
        print(f"[{lib}]")
        run_one(s, preview)
        if preview:
            sheet(lib)
        meshopt(lib)


if __name__ == "__main__":
    main()
