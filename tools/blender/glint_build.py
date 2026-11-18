"""Glint & Sons Jewelers props -> assets/models/glint.glb

    py tools/blender/build.py glint

The vertical-slice heist's own pieces: display cases (intact / smashed / tall wall case), the
jewelry counter in 1 m segments, a register counter, the shop sign. Shared props (safe, camera,
bags, van, office furniture) are in props.glb.

Pivot: centre of the footprint, on the floor. Front (customer side) = Blender -Y = glTF +Z =
south on the Tiled map. Hideable parts are child nodes:
    <case>_glass   the glass (hide / swap when cut or smashed)
    <case>_jewels  the loot (hide after "Bag loot")
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rj

pieces = []


def P(name, cells=(1, 1), note="", **view):
    p = rj.Piece(name, kind="prop", cells=cells, note=note)
    if view: p.view = view
    pieces.append(p)
    return p


def ring(part, x, y, z, r=0.035, m="Gold", gem=None):
    """A ring standing up on a tray: an 8-sided band plus an optional gem on top."""
    seg = 8
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        p0 = (x + r * math.cos(a0), y, z + r + r * math.sin(a0))
        p1 = (x + r * math.cos(a1), y, z + r + r * math.sin(a1))
        part.box(min(p0[0], p1[0]) - 0.005, y - 0.008, min(p0[2], p1[2]) - 0.005,
                 max(p0[0], p1[0]) + 0.005, y + 0.008, max(p0[2], p1[2]) + 0.005, m, bottom=True)
    if gem:
        part.cbox(x, y, z + 2 * r, 0.03, 0.03, 0.03, gem)


def jewels(part, x0, x1, y0, y1, z, dense=1.0):
    """Velvet tray with rings, a necklace bust and a couple of watches between x0..x1, y0..y1."""
    part.box(x0, y0, z, x1, y1, z + 0.025, "Velvet", bottom=True)
    z += 0.025
    w = x1 - x0
    # necklace bust on the left
    bx = x0 + w * 0.22
    with part.at((bx, (y0 + y1) / 2, z)):
        part.prism([(-0.06, 0), (0.06, 0), (0.035, 0.12), (0.08, 0.17), (0.0, 0.2), (-0.08, 0.17), (-0.035, 0.12)],
                   -0.03, 0.03, "Velvet", axis='y')
        part.prism([(-0.06, 0.16), (0.06, 0.16), (0.0, 0.08)], -0.034, -0.03, "Gold", axis='y')
        part.cbox(0.0, -0.036, 0.08, 0.025, 0.006, 0.025, "Teal")
    # rings in a row
    n = max(2, int(3 * dense))
    for i in range(n):
        rx = x0 + w * (0.45 + 0.45 * i / max(n - 1, 1))
        ring(part, rx, y0 + (y1 - y0) * 0.35, z, gem=("Teal" if i % 2 else "White"))
    # watches lying flat at the back
    for i in range(2):
        cx = x0 + w * (0.55 + 0.3 * i)
        part.box(cx - 0.06, y1 - 0.09, z, cx + 0.06, y1 - 0.05, z + 0.008, "Black", bottom=True)
        part.cyl(cx, y1 - 0.07, z + 0.008, z + 0.02, 0.03, "Gold", seg=8)


# ---- display cases -------------------------------------------------------------------------
CW, CD, BASE_H, GLASS_H = 0.9, 0.6, 0.85, 0.32
for state in ("intact", "smashed", "empty"):
    name = "display_case" if state == "intact" else f"display_case_{state}"
    note = {"intact": "1 x 1 cell glass case on a teal plinth; children _glass and _jewels",
            "smashed": "after the glass is smashed (loud) or cut: jagged glass stubs, shards on the floor; _jewels child still there until bagged",
            "empty": "looted: intact glass, bare velvet"}[state]
    p = P(name, note=note, elev=40, azim=-30)
    x0, x1, y0, y1 = -CW / 2, CW / 2, -CD / 2, CD / 2
    p.box(x0 + 0.05, y0 + 0.05, 0, x1 - 0.05, y1 - 0.05, 0.08, "Black")                    # toe kick
    p.box(x0, y0, 0.08, x1, y1, BASE_H - 0.04, "Teal")                                       # plinth
    p.box(x0 - 0.01, y0 - 0.01, BASE_H - 0.04, x1 + 0.01, y1 + 0.01, BASE_H, "Gold", bottom=True)  # gold band
    for x in (x0, x1 - 0.025):                                                                # gold corner posts
        for y in (y0, y1 - 0.025):
            p.box(x, y, BASE_H, x + 0.025, y + 0.025, BASE_H + GLASS_H, "Gold", bottom=True)
    zt = BASE_H + GLASS_H
    for x in (x0, x1 - 0.025):           # top frame: side rails (all states)
        p.box(x, y0, zt, x + 0.025, y1, zt + 0.02, "Gold", bottom=True)
    if state != "smashed":               # front and back rails
        for y in (y0, y1 - 0.025):
            p.box(x0 + 0.025, y, zt, x1 - 0.025, y + 0.025, zt + 0.02, "Gold", bottom=True)
    if state != "empty":
        jw = p.child(name + "_jewels")
        jewels(jw, x0 + 0.06, x1 - 0.06, y0 + 0.06, y1 - 0.06, BASE_H, dense=1.0 if state == "intact" else 0.6)
    else:
        p.box(x0 + 0.06, y0 + 0.06, BASE_H, x1 - 0.06, y1 - 0.06, BASE_H + 0.025, "Velvet", bottom=True)
    g = p.child(name + "_glass")
    gz0, gz1 = BASE_H, BASE_H + GLASS_H
    if state != "smashed":
        g.box(x0 + 0.01, y0 + 0.01, gz0, x1 - 0.01, y1 - 0.01, gz1, "Glass", skip=('-z',))
    else:
        # jagged stubs: triangles rising from each side's base edge
        import random
        rnd = random.Random(7)
        for side in range(4):
            xa, ya, xb, yb = [(x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)][side]
            n = 5
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                tm = (t0 + t1) / 2 + rnd.uniform(-0.05, 0.05)
                hgt = rnd.uniform(0.04, 0.16)
                pa = (xa + (xb - xa) * t0, ya + (yb - ya) * t0, gz0)
                pb = (xa + (xb - xa) * t1, ya + (yb - ya) * t1, gz0)
                pc = (xa + (xb - xa) * tm, ya + (yb - ya) * tm, gz0 + hgt)
                g.face([pa, pb, pc], "Glass")
        for i in range(9):                                                                     # shards on the floor
            a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0.45, 0.75)
            cx, cy, s = r * math.cos(a), r * math.sin(a), rnd.uniform(0.03, 0.07)
            g.face([(cx - s, cy - s * 0.4, 0.004), (cx + s, cy - s * 0.2, 0.004), (cx + s * 0.1, cy + s * 0.8, 0.004)], "Glass")

# tall wall case: 1 x 1 cell, back against a wall to the north
p = P("display_case_tall", note="wall-standing case, back to the north wall; children _glass and _jewels (3 shelves)",
      elev=25, azim=-30)
x0, x1, y0, y1 = -0.45, 0.45, -0.3, 0.2
p.box(x0, y0, 0, x1, y1, 0.75, "Teal")
p.box(x0, y1 - 0.04, 0.75, x1, y1, 2.1, "TealDark")                                          # back panel
p.box(x0, y0, 2.1, x1, y1, 2.25, "Teal", bottom=True)                                         # crown
p.box(x0 - 0.01, y0 - 0.01, 2.06, x1 + 0.01, y1 + 0.01, 2.1, "Gold", bottom=True)
p.box(x0 - 0.01, y0 - 0.01, 0.71, x1 + 0.01, y1 + 0.01, 0.75, "Gold", bottom=True)
for x in (x0, x1 - 0.025):
    p.box(x, y0, 0.75, x + 0.025, y0 + 0.025, 2.06, "Gold", bottom=True)
p.box(x0 + 0.1, y0 + 0.05, 2.05, x1 - 0.1, y0 + 0.15, 2.06, "Sodium", bottom=True)             # case light strip
jw = p.child("display_case_tall_jewels")
for z in (0.75, 1.2, 1.62):
    jw.box(x0 + 0.03, y0 + 0.03, z, x1 - 0.03, y1 - 0.05, z + 0.015, "Glass" if z > 0.8 else "Velvet", bottom=True)
    jewels(jw, x0 + 0.08, x1 - 0.08, y0 + 0.06, y1 - 0.08, z + 0.015, dense=0.75)
g = p.child("display_case_tall_glass")
g.box(x0 + 0.01, y0 + 0.005, 0.75, x1 - 0.01, y1 - 0.04, 2.06, "Glass", skip=('-z', '+z', '+y'))


# ---- counter segments ----------------------------------------------------------------------
# Tiled 'counter' is a 9 x 1 rect: lay one segment per cell along X. Customer side south (-Y).
CH = 1.0
def counter_body(p, glass_top):
    x0, x1, y0, y1 = -0.5, 0.5, -0.35, 0.35
    p.box(x0, y0 + 0.04, 0, x1, y1, 0.08, "Black", skip=('-x', '+x'))                         # toe kick
    p.box(x0, y0, 0.08, x1, y1 - 0.1, CH - 0.05 - (0.3 if glass_top else 0), "Teal", skip=('-x', '+x'))
    p.box(x0, y0 - 0.005, 0.5, x1, y0, 0.53, "Gold", skip=('-x', '+x', '+y'), bottom=True)  # gold pinstripe
    if glass_top:
        p.box(x0, y0, CH - 0.35, x1, y1 - 0.1, CH - 0.33, "Gold", skip=('-x', '+x'), bottom=True)
        jw = p.child(p.name + "_jewels")
        jewels(jw, x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.15, CH - 0.33, dense=0.75)
        g = p.child(p.name + "_glass")
        g.box(x0, y0, CH - 0.33, x1, y1 - 0.1, CH - 0.02, "Glass", skip=('-x', '+x', '-z'))
        p.box(x0, y0, CH - 0.02, x1, y0 + 0.03, CH, "Gold", skip=('-x', '+x'), bottom=True)
    else:
        p.box(x0 - 0.0, y0 - 0.03, CH - 0.05, x1, y1, CH, "WoodDark", skip=('-x', '+x'), bottom=True)  # top
    # staff side: an open shelf under the top
    p.box(x0, y1 - 0.1, 0.0, x1, y1, 0.08, "Black", skip=('-x', '+x'))
    p.box(x0, y1 - 0.1, 0.45, x1, y1, 0.48, "WoodDark", skip=('-x', '+x'), bottom=True)


p = P("counter", note="1 m segment of the sales counter (wood top); lay along X, customer side south; "
      "shoulder-height cover (1.0 m)", elev=35, azim=-30)
counter_body(p, False)
p = P("counter_glass", note="1 m counter segment with a glass jewelry top; children _glass and _jewels", elev=35, azim=-30)
counter_body(p, True)
p = P("counter_register", note="1 m counter segment with the cash register (faces the staff side, north)", elev=35, azim=30)
counter_body(p, False)
p.box(-0.2, -0.15, CH, 0.2, 0.15, CH + 0.12, "SteelDark", bottom=True)
p.box(-0.18, -0.12, CH + 0.12, 0.18, 0.05, CH + 0.18, "Black", bottom=True)
p.box(-0.08, 0.0, CH + 0.18, 0.08, 0.04, CH + 0.3, "Black", bottom=True)
p.box(-0.07, 0.04, CH + 0.19, 0.07, 0.045, CH + 0.29, "Screen", bottom=True, skip=('-y',))
p = P("counter_end", note="end cap: a closed panel on the segment's +X (east) end; rotate 180 for the west end",
      elev=35, azim=40)
p.box(0.47, -0.36, 0, 0.5, 0.36, CH, {'+x': "Teal", '*': "Gold"})


# ---- shop sign ---------------------------------------------------------------------------
p = P("sign_glint", cells=(5, 1), note="'GLINT & SONS' fascia sign, 5 m wide; hang it on the storefront wall's "
      "south face above the door (pivot = cell centre at floor level, sign at 2.55-3.2 m)", elev=10, azim=-15)
SY = -0.14
p.box(-2.45, SY - 0.08, 2.55, 2.45, SY, 3.2, "TealDark", bottom=True)
p.box(-2.5, SY - 0.1, 2.52, 2.5, SY - 0.02, 2.57, "Gold", bottom=True)
p.box(-2.5, SY - 0.1, 3.18, 2.5, SY - 0.02, 3.23, "Gold", bottom=True)
rj.text_into(p, "GLINT & SONS", 0.42, 0.03, "Gold", loc=(0, SY - 0.1, 2.72))
rj.text_into(p, "JEWELERS  EST. 1962", 0.11, 0.01, "Cream", loc=(0, SY - 0.09, 2.6))

rj.finish("glint", pieces)
