"""Writes assets/textures/rj_tile.png: THE one grayscale tile texture of Rush Job.

256 px, tileable. A 2 x 2 grid of square tiles (128 px each) with dark grout lines on the
texture's edges and middle, slight per-tile value shifts and fine noise. Materials multiply it
by a colour (glTF baseColorTexture x baseColorFactor), and the UV scale per material turns the
same image into different floors:
    scale 1      -> 0.5 m tiles           (office linoleum, sidewalk)
    scale 0.5    -> 1 m slabs              (showroom, marble, concrete)
    scale 2      -> 0.25 m tiles           (bathroom, kitchen)
    scale (1, 4) -> 0.5 m x 0.125 m planks (wood floor)
Run with the normal Python (needs Pillow):
    py tools/blender/textures/make_tile.py
"""
import os, random
from PIL import Image

N, TILES = 256, 2
GROUT = 3                 # px half-width of the grout line (so 6 px across a seam)
rng = random.Random(1118)  # jam day 1
img = Image.new("L", (N, N))
px = img.load()
t = N // TILES
shade = [[rng.uniform(0.86, 0.96) for _ in range(TILES)] for _ in range(TILES)]
for y in range(N):
    for x in range(N):
        tx, ty = x // t, y // t
        g = shade[ty][tx] + rng.uniform(-0.025, 0.025)
        lx, ly = x % t, y % t
        d = min(lx, ly, t - 1 - lx, t - 1 - ly)     # distance to this tile's edge
        if d < GROUT:
            g *= 0.55                                 # grout
        elif d < GROUT + 2:
            g *= 1.04                                 # bevel highlight
        px[x, y] = max(0, min(255, int(g * 255)))
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
out = os.path.join(root, "assets", "textures", "rj_tile.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, optimize=True)
print("wrote", out, os.path.getsize(out), "bytes")
