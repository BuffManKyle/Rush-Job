"""Glint & Sons street block -> assets/models/street.glb   (owner: rj-street)

    py tools/blender/build.py street

Everything outside the shop: neighbour buildings (front facades, signs and awnings, lit windows,
rooftop clutter), street furniture, parked cars, road paint. The game places pieces from the
`decor` object layer of levels/glint.tmj (src/view/street.ts); see ASSETS.md "Street block".

Conventions (same as the kit): Blender Z-up, front = -Y (= glTF +Z = south on the map), pivot at
the centre of the footprint on the floor, footprint in whole cells (rj_cells). A building's front
is its street face; buildings across the street are placed rotated 180 degrees.
Style: noir-pop flat colour. No red anywhere (red = danger); no amber hatch (restricted only).
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
import rj

pieces = []


def P(name, cells=(1, 1), note="", elev=35, azim=-30, kind="prop"):  # kind "building": lint allows 16 m
    p = rj.Piece(name, kind=kind, cells=cells, note=note)
    p.view = dict(elev=elev, azim=azim)
    pieces.append(p)
    return p


def qf(p, cos, m, want):
    """A quad/polygon whose normal is turned to face `want` (so single-sided rendering shows it)."""
    a, b, c = (Vector(cos[0]), Vector(cos[1]), Vector(cos[2]))
    n = (b - a).cross(c - b)
    if n.dot(Vector(want)) < 0:
        cos = list(reversed(cos))
    p.face(cos, m)


def front_quad(p, x0, x1, z0, z1, y, m):
    """A rectangle in the facade plane y, facing the street (-Y)."""
    p.face([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], m)


def top_quad(p, x0, y0, x1, y1, z, m):
    p.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], m)


# ---------------------------------------------------------------------------------------
# buildings
# ---------------------------------------------------------------------------------------
def window(p, x, z0, ww, wh, y, style, frame="White"):
    """Upper-floor window on the facade plane y: frame box, pane, sill."""
    p.box(x - ww / 2 - 0.08, y - 0.04, z0 - 0.08, x + ww / 2 + 0.08, y, z0 + wh + 0.08, frame,
          skip=('+y',), bottom=True)
    yp = y - 0.045
    if style == "lit":
        front_quad(p, x - ww / 2, x + ww / 2, z0, z0 + wh, yp, "WindowLit")
    elif style == "blind":       # blind pulled half down over a lit room
        front_quad(p, x - ww / 2, x + ww / 2, z0 + wh * 0.55, z0 + wh, yp, "Cream")
        front_quad(p, x - ww / 2, x + ww / 2, z0, z0 + wh * 0.55, yp, "WindowLit")
    elif style == "tv":          # a teal TV glow
        front_quad(p, x - ww / 2, x + ww / 2, z0, z0 + wh, yp, "Screen")
    else:                        # dark
        front_quad(p, x - ww / 2, x + ww / 2, z0, z0 + wh, yp, "Navy")
    p.box(x - ww / 2 - 0.12, y - 0.14, z0 - 0.14, x + ww / 2 + 0.12, y, z0 - 0.06, frame,
          skip=('+y',), bottom=True)


def awning(p, x0, x1, yw, zt, depth, drop, mats, stripes):
    """Striped shop awning on the facade plane yw: slope from zt at the wall out `depth`,
    falling 0.5 m, with a valance `drop` deep. Alternates mats across `stripes` bands."""
    zb = zt - 0.55
    yo = yw - depth
    n = stripes
    for i in range(n):
        a = x0 + (x1 - x0) * i / n
        b = x0 + (x1 - x0) * (i + 1) / n
        m = mats[i % len(mats)]
        qf(p, [(a, yw, zt), (b, yw, zt), (b, yo, zb), (a, yo, zb)], m, (0, -0.5, 1))
        qf(p, [(a, yo, zb), (b, yo, zb), (b, yo, zb - drop), (a, yo, zb - drop)], m, (0, -1, 0))
        qf(p, [(a, yw, zt), (b, yw, zt), (b, yo, zb), (a, yo, zb)], "Navy", (0, 0.5, -1))  # underside
    for x, s in ((x0, -1), (x1, 1)):     # side cheeks
        qf(p, [(x, yw, zt), (x, yo, zb), (x, yo, zb - drop), (x, yw, zb - drop)], mats[0], (s, 0, 0))


def roof_clutter(p, w, d, h, rng, n=4):
    """AC units, vents, a skylight and maybe a water tank, read from above."""
    for i in range(n):
        x = rng.uniform(-w / 2 + 1.2, w / 2 - 1.2)
        y = rng.uniform(-d / 2 + 1.5, d / 2 - 1.2)
        k = i % 4
        if k == 0:                                   # AC unit with a fan grille
            p.cbox(x, y, h, 1.2, 0.9, 0.7, "Steel", bottom=True)
            p.cyl(x, y, h + 0.7, h + 0.72, 0.32, "SteelDark", seg=8, caps=(False, True))
        elif k == 1:                                 # vent stack
            p.cyl(x, y, h, h + 0.9, 0.14, "SteelDark", seg=6)
            p.cyl(x, y, h + 0.9, h + 1.05, 0.22, "SteelDark", seg=6, r2=0.05)
        elif k == 2:                                 # skylight
            p.cbox(x, y, h, 1.6, 1.0, 0.25, "SteelDark", bottom=True)
            p.cbox(x, y, h + 0.25, 1.4, 0.8, 0.06, "WindowLit", bottom=True)
        else:                                        # roof hatch
            p.cbox(x, y, h, 0.9, 0.9, 0.35, "Steel", bottom=True)


def body(p, w, d, h, wall, cap="WallCap", roof="Roof", parapet=0.5):
    """The building mass: walls, flat roof, parapet with an ink cap (reads like the kit's walls)."""
    p.box(-w / 2, -d / 2, 0, w / 2, d / 2, h, {'*': wall, '+z': roof})
    t = 0.22
    for (x0, y0, x1, y1) in ((-w / 2, -d / 2, w / 2, -d / 2 + t), (-w / 2, d / 2 - t, w / 2, d / 2),
                             (-w / 2, -d / 2 + t, -w / 2 + t, d / 2 - t), (w / 2 - t, -d / 2 + t, w / 2, d / 2 - t)):
        p.box(x0, y0, h, x1, y1, h + parapet, {'*': wall, '+z': cap}, bottom=False)


def storefront(name, w, d, h, wall, awn, sign_text, sign_board, sign_ink, seed, interior="shop",
               floors=1, note="", sub=None, door_at=None, fire_escape=False):
    """A neighbour shop with flats above. Footprint w x d cells, front (street) at -Y."""
    rng = random.Random(seed)
    p = P(name, cells=(w, d), note=note or f"neighbour shop '{sign_text}', {w} x {d} cells, {h} m; not enterable",
          elev=20, azim=-20, kind="building")
    yf = -d / 2
    body(p, w, d, h, wall)
    # plinth and the ground-floor frame
    p.box(-w / 2, yf - 0.06, 0, w / 2, yf, 0.45, "Navy", skip=('+y',))
    # shop windows: lit backdrop, dark goods silhouettes, glass, mullions
    door_x = door_at if door_at is not None else (-w / 2 + 1.4 if w >= 8 else w / 2 - 1.3)
    ws0, ws1 = -w / 2 + 0.35, w / 2 - 0.35
    gz0, gz1 = 0.5, 2.75
    front_quad(p, ws0, ws1, gz0, gz1, yf - 0.01, "WindowLit")
    x = ws0 + 0.3
    while x < ws1 - 0.5:                            # goods / furniture inside, as dark shapes
        if abs(x - door_x) > 0.9:
            if interior == "diner":                 # booths and a counter
                p.box(x, yf - 0.03, gz0, x + 0.7, yf - 0.02, gz0 + 0.55, "Plum", skip=('+y',), bottom=True)
            elif interior == "laundry":             # washers: white boxes with a dark door
                p.box(x, yf - 0.03, gz0, x + 0.6, yf - 0.02, gz0 + 0.85, "White", skip=('+y',), bottom=True)
                p.cyl(x + 0.3, gz0 + 0.45, yf - 0.035, yf - 0.03, 0.2, "Navy", seg=8, axis='y', caps=(True, False))
            elif interior == "books":               # shelves
                p.box(x, yf - 0.03, gz0, x + 0.8, yf - 0.02, gz1 - 0.3, "WoodDark", skip=('+y',), bottom=True)
                for k in range(2):
                    z = gz0 + 0.3 + k * 0.84
                    p.box(x + 0.06, yf - 0.035, z, x + 0.74, yf - 0.03, z + 0.28,
                          ["Teal", "Plum", "Cream", "Sage"][(k + int(x * 3)) % 4], skip=('+y',), bottom=True)
            elif interior == "deli":                # produce bins
                p.box(x, yf - 0.03, gz0, x + 0.8, yf - 0.02, gz0 + 0.6, "Wood", skip=('+y',), bottom=True)
                p.box(x + 0.05, yf - 0.035, gz0 + 0.6, x + 0.75, yf - 0.03, gz0 + 0.75,
                      ["Sage", "Mustard", "Terracotta"][int(x * 7) % 3], skip=('+y',), bottom=True)
            else:                                   # racks
                p.box(x, yf - 0.03, gz0 + 0.9, x + 0.7, yf - 0.02, gz0 + 1.6, "SteelDark", skip=('+y',), bottom=True)
        x += 1.1
    front_quad(p, ws0, ws1, gz0, gz1, yf - 0.06, "Glass")
    for mx in [ws0, ws1] + [ws0 + (ws1 - ws0) * k / max(2, round(w / 2.6)) for k in range(1, max(2, round(w / 2.6)))]:
        p.box(mx - 0.05, yf - 0.1, gz0, mx + 0.05, yf, gz1, "Navy", skip=('+y',), bottom=True)
    p.box(ws0 - 0.05, yf - 0.1, gz1, ws1 + 0.05, yf, gz1 + 0.12, "Navy", skip=('+y',), bottom=True)
    # door: dark leaf with a lit glass panel
    p.box(door_x - 0.5, yf - 0.12, 0, door_x + 0.5, yf - 0.06, 2.25, "Navy", skip=('+y',))
    front_quad(p, door_x - 0.32, door_x + 0.32, 1.0, 2.0, yf - 0.125, "WindowLit")
    p.box(door_x + 0.22, yf - 0.2, 1.0, door_x + 0.3, yf - 0.12, 1.12, "Steel", skip=('+y',), bottom=True)
    # awning and sign
    zt = 3.15
    awning(p, -w / 2 + 0.2, w / 2 - 0.2, yf - 0.02, zt, 0.75, 0.22, awn, max(4, w))
    sb = p.child(f"{name}_sign")
    sw = min(w - 0.8, max(3.0, 0.36 * len(sign_text) + 1.2))
    sb.box(-sw / 2, yf - 0.12, zt + 0.12, sw / 2, yf, zt + 0.85, sign_board, skip=('+y',), bottom=True)
    rj.text_into(sb, sign_text, 0.42 if len(sign_text) < 12 else 0.34, 0.03, sign_ink, loc=(0, yf - 0.13, zt + 0.3))
    if sub:
        rj.text_into(sb, sub, 0.1, 0.01, "Cream", loc=(0, yf - 0.13, zt + 0.16))
    # upper floors
    fz = 3.35
    rows = 0
    while fz + 2.1 < h - 0.2 and rows < floors:
        n = max(2, int(w / 1.9))
        for k in range(n):
            x = -w / 2 + (k + 0.5) * w / n
            style = rng.choice(["lit", "lit", "dark", "blind", "dark", "tv"])
            window(p, x, fz + 0.75, 1.0, 1.35, yf, style)
        fz += 2.9
        rows += 1
    # cornice
    p.box(-w / 2 - 0.05, yf - 0.22, h - 0.35, w / 2 + 0.05, yf, h - 0.1, "Cream" if wall != "StuccoLight" else "Navy",
          skip=('+y',), bottom=True)
    roof_clutter(p, w, d, h, rng, n=4 if w > 7 else 3)
    if fire_escape:
        add_fire_escape(p, -w / 2, yf, h)
    return p


def add_fire_escape(p, xw, yf, h):
    """Fire-escape balconies and ladders on the west (-X) side wall of a building, alley side."""
    t = 0.04
    for z in (3.4, 6.2):
        if z + 1.2 > h:
            break
        y0, y1 = yf + 3.0, yf + 6.0
        # grated platform (dark), rail posts and top rail
        p.box(xw - 1.0, y0, z, xw, y1, z + 0.06, "Black", bottom=True)
        for y in (y0, y1):
            p.box(xw - 1.0, y - t / 2, z + 0.06, xw - 1.0 + t, y + t / 2, z + 1.0, "Black", bottom=True)
        p.box(xw - 1.0, y0, z + 0.96, xw - 1.0 + t, y1, z + 1.02, "Black", bottom=True)
        p.box(xw - 1.0, y0, z + 0.5, xw - 1.0 + t, y1, z + 0.54, "Black", bottom=True)
        # a window behind it, lit
        qf(p, [(xw - 0.01, y0 + 0.8, z + 0.5), (xw - 0.01, y0 + 2.0, z + 0.5), (xw - 0.01, y0 + 2.0, z + 1.8),
               (xw - 0.01, y0 + 0.8, z + 1.8)], "WindowLit", (-1, 0, 0))
        # ladder down to the next level (or drop ladder above the alley)
        lz0 = z - (2.8 if z > 4 else 1.2)
        for yy in (y1 - 0.75, y1 - 0.35):
            p.box(xw - 0.85, yy - t / 2, lz0, xw - 0.85 + t, yy + t / 2, z, "Black", bottom=True)
        k = lz0 + 0.3
        while k < z:
            p.box(xw - 0.85, y1 - 0.75, k, xw - 0.85 + t, y1 - 0.35, k + t, "Black", bottom=True)
            k += 0.5


def rear_block(name, w, d, h, wall, seed, note=""):
    """A building seen from behind: brick with scattered windows on the side facing the shop (-Y),
    rooftop clutter, a water tank on the tall ones. Backdrop north of the block and past its ends."""
    rng = random.Random(seed)
    p = P(name, cells=(w, d), note=note or f"backdrop building, {w} x {d} cells, {h} m; rear face is -Y", elev=40, azim=-25,
          kind="building")
    yf = -d / 2
    body(p, w, d, h, wall, parapet=0.6)
    z = 3.6
    while z + 1.6 < h:
        n = max(2, int(w / 2.6))
        for k in range(n):
            if rng.random() < 0.3:
                continue
            x = -w / 2 + (k + 0.5) * w / n + rng.uniform(-0.3, 0.3)
            window(p, x, z, 0.9, 1.2, yf, rng.choice(["lit", "dark", "dark", "blind", "tv"]), frame="Cream")
        z += 2.8
    # drainpipe and a back door
    p.box(w / 2 - 0.6, yf - 0.12, 0, w / 2 - 0.48, yf, h, "SteelDark", skip=('+y',))
    p.box(-1.0, yf - 0.06, 0, 0.0, yf, 2.1, "SteelDark", skip=('+y',))
    roof_clutter(p, w, d, h, rng, n=5)
    if h > 7:
        x, y = rng.uniform(-w / 4, w / 4), rng.uniform(0, d / 4)
        for dx, dy in ((-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)):
            p.cyl(x + dx, y + dy, h, h + 1.6, 0.06, "Black", seg=4)
        p.cyl(x, y, h + 1.6, h + 3.4, 1.0, "WoodDark", seg=10)
        p.cyl(x, y, h + 3.4, h + 4.0, 1.05, "Navy", seg=10, r2=0.1)
    return p


# --- the block -----------------------------------------------------------------------------
# near side (north of the street, fronts face south): west of the shop and east of the alley
storefront("bldg_diner", 9, 20, 6.8, "StuccoLight", ["Plum", "Cream"], "ROSA'S DINER", "Plum", "Cream", 11,
           interior="diner", sub="OPEN ALL NIGHT", floors=1)
storefront("bldg_laundromat", 9, 20, 7.4, "Brick", ["Sage", "Cream"], "KWIK WASH", "Navy", "Ok", 12,
           interior="laundry", sub="COIN LAUNDRY", floors=1)
storefront("bldg_books", 7, 20, 6.6, "BrickDark", ["SlateBlue", "Cream"], "PAGE TURNER", "SlateBlue", "Cream", 13,
           interior="books", sub="USED BOOKS", floors=1, fire_escape=True)
storefront("bldg_deli", 7, 20, 7.2, "Stucco", ["Terracotta", "Cream"], "DELI", "Terracotta", "Cream", 14,
           interior="deli", sub="GROCERY  COFFEE  LOTTO", floors=1)
storefront("bldg_tailor", 7, 20, 6.2, "Brick", ["Navy", "Cream"], "TAILOR", "Navy", "Gold", 15,
           interior="shop", sub="ALTERATIONS", floors=1)
# far side (south of the street; placed rotated 180 so the fronts face north onto the street).
# One storey, so they hide as little of the far sidewalk as possible from the 55 degree camera.
storefront("bldg_cinema", 16, 12, 4.6, "BrickDark", ["Plum", "Gold"], "ORPHEUM", "Plum", "WindowLit", 21,
           interior="shop", sub="LATE SHOW 11:45", floors=0, door_at=0.0,
           note="across the street: one-storey cinema with a marquee; placed rotated 180")
storefront("bldg_pharmacy", 12, 12, 4.2, "StuccoLight", ["Teal", "Cream"], "PHARMACY", "Teal", "Cream", 22,
           interior="shop", sub="OPEN 24 HOURS", floors=0, note="across the street; placed rotated 180")
storefront("bldg_bar", 10, 12, 4.4, "Brick", ["Navy", "Sage"], "LAST CALL", "Navy", "WindowLit", 23,
           interior="diner", sub="COCKTAILS", floors=0, note="across the street; placed rotated 180")
storefront("bldg_pawn", 10, 12, 4.0, "Stucco", ["Mustard", "Navy"], "PAWN & LOAN", "Navy", "Mustard", 24,
           interior="shop", sub="WE BUY GOLD", floors=0, note="across the street; placed rotated 180")
storefront("bldg_cafe", 12, 12, 4.4, "StuccoLight", ["Sage", "Cream"], "NIGHT OWL CAFE", "Sage", "Cream", 25,
           interior="diner", sub="ESPRESSO  PIE", floors=0, note="across the street; placed rotated 180")
storefront("bldg_hardware", 12, 12, 4.0, "BrickDark", ["SlateBlue", "Cream"], "HARDWARE", "SlateBlue", "Cream", 26,
           interior="books", sub="KEYS CUT", floors=0, note="across the street; placed rotated 180")
# backdrop: rears of the next street's buildings, behind (north of) the block and past its ends
rear_block("bldg_rear_a", 18, 12, 9.0, "Brick", 31)
rear_block("bldg_rear_b", 16, 12, 7.5, "BrickDark", 32)
rear_block("bldg_rear_c", 21, 12, 6.0, "Stucco", 33)
rear_block("bldg_rear_d", 12, 12, 8.0, "StuccoLight", 34)

# ---------------------------------------------------------------------------------------
# street furniture (front = -Y = toward the road on the north sidewalk)
# ---------------------------------------------------------------------------------------
p = P("streetlight", note="sodium streetlight, 4.8 m, arm reaches 1.6 m toward the road (-Y); "
      "the lamp (RJ_Sodium) is at (0, 4.55, +1.6) in glTF; the game adds a light pool under it", elev=15)
p.cyl(0, 0, 0, 0.35, 0.16, "SteelDark", seg=8)
p.cyl(0, 0, 0.35, 4.8, 0.07, "SteelDark", seg=6, r2=0.05)
p.box(-0.035, -1.65, 4.62, 0.035, 0, 4.7, "SteelDark", bottom=True)
p.cbox(0, -1.6, 4.5, 0.36, 0.6, 0.18, "SteelDark", bottom=True)
p.cbox(0, -1.6, 4.47, 0.28, 0.5, 0.03, "Sodium", bottom=True)

p = P("hydrant", note="fire hydrant (mustard, never red), 0.75 m")
p.cyl(0, 0, 0, 0.12, 0.17, "Mustard", seg=8)
p.cyl(0, 0, 0.12, 0.58, 0.12, "Mustard", seg=8)
p.cyl(0, 0, 0.58, 0.72, 0.13, "Mustard", seg=8, r2=0.06)
p.cyl(0, 0.42, -0.19, 0.19, 0.05, "Steel", seg=6, axis='x')    # side caps
p.box(-0.2, -0.05, 0.36, 0.2, 0.05, 0.46, "Steel", bottom=True)
p.box(-0.05, -0.22, 0.34, 0.05, 0.0, 0.46, "Steel", bottom=True)

p = P("mailbox", note="street mailbox, slate blue, 1.15 m")
for x in (-0.22, 0.22):
    for y in (-0.18, 0.18):
        p.box(x - 0.03, y - 0.03, 0, x + 0.03, y + 0.03, 0.25, "SteelDark")
p.box(-0.27, -0.24, 0.25, 0.27, 0.24, 0.85, "SlateBlue", bottom=True)
p.prism([(-0.24, 0.85), (0.24, 0.85), (0.24, 0.95), (0.12, 1.12), (-0.12, 1.12), (-0.24, 0.95)], -0.27, 0.27, "SlateBlue", axis='x')
p.box(-0.18, -0.25, 0.8, 0.18, -0.24, 0.86, "Black", bottom=True)
p.box(-0.12, -0.26, 0.45, 0.12, -0.24, 0.6, "White", bottom=True)

p = P("newspaper_box", note="newspaper vending box, teal, 1.0 m")
for x in (-0.18, 0.18):
    p.box(x - 0.025, -0.15, 0, x + 0.025, 0.15, 0.3, "SteelDark")
p.box(-0.24, -0.2, 0.3, 0.24, 0.2, 1.0, {'*': "Teal", '+z': "TealDark"}, bottom=True)
front_quad(p, -0.18, 0.18, 0.62, 0.92, -0.205, "Glass")
front_quad(p, -0.16, 0.16, 0.64, 0.9, -0.201, "White")
p.box(-0.2, -0.22, 0.52, 0.2, -0.2, 0.58, "SteelDark", bottom=True)

p = P("trash_can", note="street litter bin, 0.95 m")
p.cyl(0, 0, 0, 0.85, 0.26, "SteelDark", seg=10, r2=0.28)
p.cyl(0, 0, 0.85, 0.95, 0.3, "Black", seg=10, r2=0.22)
p.cyl(0, 0, 0.95, 0.97, 0.1, "Navy", seg=6)

p = P("parking_meter", note="parking meter, 1.3 m; screen is RJ_Screen")
p.cyl(0, 0, 0, 1.0, 0.04, "SteelDark", seg=6)
p.cbox(0, 0, 1.0, 0.2, 0.14, 0.3, "Steel", bottom=True)
p.cyl(0, 0, 1.3, 1.34, 0.1, "Steel", seg=6, r2=0.04)
front_quad(p, -0.07, 0.07, 1.12, 1.24, -0.071, "Screen")

p = P("bench", cells=(2, 1), note="street bench, 1.8 m, seat faces -Y (the road)", elev=30)
for x in (-0.75, 0.75):
    p.box(x - 0.04, -0.25, 0, x + 0.04, 0.2, 0.45, "Black")
    p.box(x - 0.04, 0.12, 0.45, x + 0.04, 0.2, 0.9, "Black", bottom=True)
for k in range(3):
    y0 = -0.24 + k * 0.15
    p.box(-0.9, y0, 0.42, 0.9, y0 + 0.12, 0.47, "Wood", bottom=True)
for k in range(2):
    z0 = 0.58 + k * 0.17
    p.box(-0.9, 0.2, z0, 0.9, 0.25, z0 + 0.12, "Wood", bottom=True)

p = P("planter", note="concrete planter with a shrub, 0.9 m square")
p.box(-0.42, -0.42, 0, 0.42, 0.42, 0.5, {'*': "FloorConcrete", '+z': "WoodDark"})
p.cyl(0, 0, 0.5, 0.95, 0.38, "Plant", seg=7, r2=0.3)
p.cyl(0.05, 0.03, 0.95, 1.25, 0.3, "Plant", seg=7, r2=0.08)

p = P("planter_long", cells=(2, 1), note="long planter box with low hedge, 1.8 x 0.6 m", elev=30)
p.box(-0.9, -0.3, 0, 0.9, 0.3, 0.45, {'*': "TealDark", '+z': "WoodDark"})
for x in (-0.55, 0.0, 0.55):
    p.cyl(x, 0, 0.45, 0.8, 0.27, "Plant", seg=6, r2=0.18)

p = P("street_tree", note="sidewalk tree in an iron grate pit; low-poly canopy at 2.6-4.4 m")
p.box(-0.5, -0.5, 0, 0.5, 0.5, 0.02, "Black", bottom=False)
p.cyl(0, 0, 0, 2.7, 0.1, "WoodDark", seg=6, r2=0.07)
p.cyl(0, 0, 2.3, 3.7, 1.15, "Plant", seg=7, r2=0.9)
p.cyl(0, 0, 3.7, 4.4, 0.9, "Plant", seg=7, r2=0.15)

p = P("dumpster", cells=(2, 1), note="alley dumpster, 1.9 x 1.0 m, sage with black lids; cover", elev=35)
p.prism([(-0.5, 0.0), (0.45, 0.0), (0.5, 1.25), (-0.5, 1.15)], -0.95, 0.95, "Sage", axis='x')
lid = p.child("dumpster_lid")
lid.prism([(-0.52, 1.15), (0.52, 1.26), (0.52, 1.3), (-0.52, 1.19)], -0.94, 0.94, "Black", axis='x')
for x in (-0.95, 0.95):
    p.box(x - 0.04, -0.55, 0.3, x + 0.04, -0.45, 0.4, "SteelDark", bottom=True)
for x in (-0.7, 0.7):
    for y in (-0.35, 0.35):
        p.cyl(x, y, 0, 0.1, 0.07, "Rubber", seg=6)
p.box(-0.8, -0.52, 0.55, -0.3, -0.5, 0.75, "White", bottom=True)

p = P("bin_bags", note="pile of black bin bags, ~0.6 m")
p.cyl(-0.15, 0.05, 0, 0.45, 0.28, "Black", seg=6, r2=0.12)
p.cyl(0.2, -0.05, 0, 0.38, 0.24, "Fabric", seg=6, r2=0.1)
p.cyl(0.0, 0.25, 0, 0.32, 0.22, "Black", seg=6, r2=0.08)

p = P("crates", note="stack of wooden produce crates, 0.8 m")
p.cbox(0, 0, 0, 0.7, 0.5, 0.35, "Wood")
p.cbox(0.05, 0.02, 0.35, 0.6, 0.45, 0.3, "Wood", bottom=True)
p.cbox(0.05, 0.02, 0.62, 0.5, 0.38, 0.06, "Sage", bottom=True)

p = P("pallet", note="wooden pallet leaning on a wall, back at +Y")
p.prism([(-0.15, 0.0), (0.0, 0.0), (0.42, 1.1), (0.27, 1.1)], -0.6, 0.6, "Wood", axis='x')

p = P("bus_stop", cells=(3, 2), note="bus shelter, 3 x 2 cells: back glass panel at +Y, lit ad panel on the -X end, "
      "bench inside, roof at 2.4 m; front (open side) -Y toward the road", elev=30)
for x in (-1.45, 1.45):
    for y in (0.75, -0.55):
        p.box(x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, 2.4, "SteelDark")
p.box(-1.55, -0.75, 2.4, 1.55, 0.9, 2.5, {'*': "SteelDark", '+z': "Teal"}, bottom=True)
qf(p, [(-1.45, 0.76, 0.15), (1.45, 0.76, 0.15), (1.45, 0.76, 2.35), (-1.45, 0.76, 2.35)], "Glass", (0, -1, 0))
p.box(-1.5, -0.5, 0.2, -1.42, 0.7, 2.1, "SteelDark", bottom=True)              # ad box frame
qf(p, [(-1.42 + 0.005, -0.45, 0.35), (-1.42 + 0.005, 0.65, 0.35), (-1.42 + 0.005, 0.65, 2.0), (-1.42 + 0.005, -0.45, 2.0)],
   "WindowLit", (1, 0, 0))
qf(p, [(-1.5 - 0.005, -0.45, 0.35), (-1.5 - 0.005, 0.65, 0.35), (-1.5 - 0.005, 0.65, 2.0), (-1.5 - 0.005, -0.45, 2.0)],
   "WindowLit", (-1, 0, 0))
p.box(-1.0, 0.35, 0.42, 1.2, 0.7, 0.47, "Wood", bottom=True)
for x in (-0.8, 1.0):
    p.box(x - 0.04, 0.5, 0, x + 0.04, 0.6, 0.42, "Black")
p = P("bus_sign", note="bus stop pole with a teal BUS plate, 2.6 m")
p.cyl(0, 0, 0, 2.6, 0.04, "SteelDark", seg=6)
p.box(-0.3, -0.06, 2.05, 0.3, -0.04, 2.55, "Teal", bottom=True)
rj.text_into(p, "BUS", 0.22, 0.01, "White", loc=(0, -0.065, 2.2))

p = P("barricade", cells=(2, 1), note="road-work sawhorse barricade, 2 m, white/navy boards (not red, not amber); "
      "sodium blinker on top. Marks the ends of the playable street", elev=25)
for x in (-0.85, 0.85):
    p.prism([(-0.3, 0.0), (-0.24, 0.0), (0.0, 1.1), (-0.06, 1.1)], x - 0.04, x + 0.04, "SteelDark", axis='x')
    p.prism([(0.24, 0.0), (0.3, 0.0), (0.06, 1.1), (0.0, 1.1)], x - 0.04, x + 0.04, "SteelDark", axis='x')
for z in (0.55, 0.88):
    n = 6
    for k in range(n):
        a, b = -1.0 + 2.0 * k / n, -1.0 + 2.0 * (k + 1) / n
        p.box(a, -0.1, z, b, -0.04, z + 0.2, "White" if k % 2 == 0 else "Navy", bottom=True)
p.cyl(0.85, -0.07, 1.1, 1.26, 0.07, "Sodium", seg=6)

p = P("manhole", note="manhole cover, flush with the road")
p.cyl(0, 0, 0.0, 0.012, 0.36, "SteelDark", seg=10, caps=(False, True))
p = P("storm_drain", note="curb storm drain grate; sits in the gutter on the road side of a curb (-Y edge)")
p.box(-0.45, -0.25, 0.0, 0.45, 0.0, 0.012, "Black", bottom=False)
for k in range(5):
    x = -0.36 + k * 0.18
    p.box(x - 0.03, -0.22, 0.012, x + 0.03, -0.03, 0.016, "SteelDark", bottom=True)

# ---------------------------------------------------------------------------------------
# road paint (thin quads 12 mm above the asphalt; one piece per 1 m cell)
# ---------------------------------------------------------------------------------------
Z = 0.012
p = P("paint_centre", note="double centre line along X through the pivot (pale yellow)", elev=60)
for y in (-0.09, 0.09):
    top_quad(p, -0.5, y - 0.05, 0.5, y + 0.05, Z, "PaintYellow")
p = P("paint_edge", note="solid white edge line along X through the pivot", elev=60)
top_quad(p, -0.5, -0.05, 0.5, 0.05, Z, "Paint")
p = P("paint_dash", note="white lane dash, 1 m along X (place every 2 m)", elev=60)
top_quad(p, -0.5, -0.06, 0.5, 0.06, Z, "Paint")
p = P("paint_crosswalk", note="one zebra bar of a crosswalk: 0.5 m (X) x 1 m (Y); place one per cell", elev=60)
top_quad(p, -0.25, -0.5, 0.25, 0.5, Z, "Paint")
p = P("paint_stop", note="stop line across a lane: 0.3 m (X) x 1 m (Y) per cell", elev=60)
top_quad(p, -0.15, -0.5, 0.15, 0.5, Z, "Paint")
p = P("paint_tick", note="parking bay tick: 0.1 m (X) x 0.6 m (Y), from the edge line toward the curb", elev=60)
top_quad(p, -0.05, -0.3, 0.05, 0.3, Z, "Paint")


# ---------------------------------------------------------------------------------------
# parked cars (long axis X, 4 x 2 cells). Low poly, flat paint, roof in body colour.
# ---------------------------------------------------------------------------------------
def car(name, paint, shape="sedan", note=""):
    p = P(name, cells=(4, 2), note=note or f"parked {shape}, {paint}; long axis X, nose +X; cover", elev=35, azim=-30)
    L = 2.1 if shape != "hatch" else 1.85
    W = 0.88
    # lower body
    p.prism([(-L, 0.28), (L, 0.28), (L, 0.78), (L - 0.25, 0.92), (-L + 0.15, 0.95), (-L, 0.82)], -W, W, paint, axis='y')
    if shape == "sedan":
        cab = [(-1.45, 0.92), (1.05, 0.92), (0.45, 1.42), (-1.0, 1.42)]
    elif shape == "hatch":
        cab = [(-L + 0.1, 0.94), (0.85, 0.92), (0.25, 1.45), (-L + 0.25, 1.45)]
    else:   # wagon
        cab = [(-L + 0.15, 0.95), (1.05, 0.92), (0.45, 1.45), (-L + 0.2, 1.45)]
    p.prism(cab, -W + 0.08, W - 0.08, "Black", axis='y')                  # glass all round
    rz = cab[2][1]
    p.box(cab[3][0] + 0.05, -W + 0.1, rz, cab[2][0] - 0.05, W - 0.1, rz + 0.05, paint, bottom=True)   # roof
    for x in (L - 0.65, -L + 0.65):
        for y in (-W + 0.05, W - 0.05):
            p.cyl(x, 0.33, y - 0.12 if y < 0 else y - 0.12, y + 0.12 if y > 0 else y + 0.12, 0.33, "Rubber", seg=8, axis='y')
    # lights: cream headlights (+X), dark tail lamps (no red)
    for y in (-0.6, 0.6):
        p.box(L - 0.02, y - 0.16, 0.62, L + 0.02, y + 0.16, 0.74, "Cream", bottom=True)
        p.box(-L - 0.02, y - 0.16, 0.66, -L + 0.02, y + 0.16, 0.76, "Navy", bottom=True)
    p.box(L - 0.02, -0.75, 0.32, L + 0.06, 0.75, 0.44, "SteelDark", bottom=True)
    p.box(-L - 0.06, -0.75, 0.32, -L + 0.02, 0.75, 0.44, "SteelDark", bottom=True)
    return p


car("car_sedan_plum", "Plum", "sedan")
car("car_sedan_slate", "SlateBlue", "sedan")
car("car_hatch_sage", "Sage", "hatch")
car("car_hatch_cream", "Cream", "hatch")
car("car_wagon_steel", "Steel", "wagon")
car("car_wagon_navy", "Navy", "wagon")

rj.finish("street", pieces)
