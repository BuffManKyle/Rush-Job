"""Rush Job modular architecture kit -> assets/models/kit.glb

    py tools/blender/build.py kit

Everything sits on the 1 m grid, pivot at the centre of its cell on the floor. A wall-type
piece runs along X (east-west) through the middle of its cell, 0.2 m thick; rotate it 90
degrees about Y for north-south. Every *_full_* piece has a *_low_* twin with the same
footprint: the camera's cutaway swaps full -> low (stub height LOW_H).

Walls are built from a POST (the 0.2 x 0.2 centre) plus one ARM per connected neighbour
(from the post to the cell edge, pointing +X / east at rotation 0), so any corner, T or
cross is post + 2..4 arms. wall_*_straight is post + both arms in one mesh, for the common
case. Arms and straights leave out their end faces (a neighbour always covers them).
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rj

H, LOW_H, T = 2.8, 0.4, 0.2          # wall height, cutaway stub height, thickness
DOOR_W, DOOR_H = 0.9, 2.1            # clear opening (DESIGN.md: doorways at 2.1 m)
SILL, HEAD = 0.9, 2.1                # window
BASE_H = 0.12                        # baseboard
t = T / 2
FIN = {"int": "Plaster", "ext": "Brick"}
pieces = []


def P(name, kind, note="", **view):
    p = rj.Piece(name, kind=kind, note=note)
    if view: p.view = view
    pieces.append(p)
    return p


def wall_box(p, x0, x1, z0, z1, fin, skip=()):
    """A slab of wall between x0..x1 and z0..z1, with the dark cap on top."""
    p.box(x0, -t, z0, x1, t, z1, {'+z': "WallCap", '*': FIN[fin]}, skip=skip)


def baseboard(p, x0, x1, skip=('-x', '+x')):
    p.box(x0, -t - 0.012, 0, x1, t + 0.012, BASE_H, "Baseboard", skip=skip)


# ---- walls -------------------------------------------------------------------------------
for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"wall_{hname}_{fin}_post", "wall", "centre post; add one arm per neighbour")
        wall_box(p, -t, t, 0, hh, fin)
        baseboard(p, -t, t, skip=())
        p = P(f"wall_{hname}_{fin}_arm", "wall", "post -> +X edge; rotate for other sides")
        wall_box(p, t, 0.5, 0, hh, fin, skip=('-x', '+x'))
        baseboard(p, t, 0.5)
        p = P(f"wall_{hname}_{fin}_straight", "wall", "straight run along X (E-W)")
        wall_box(p, -0.5, 0.5, 0, hh, fin, skip=('-x', '+x'))
        baseboard(p, -0.5, 0.5)


# ---- doorways (the opening; door leaves are separate pieces) -------------------------------
def casing(p, x0, x1, z0, z1):
    """Door/window frame trim on both faces, 2 cm proud."""
    for y0, y1 in ((-t - 0.02, -t), (t, t + 0.02)):
        p.box(x0, y0, z0, x1, y1, z1, "Trim", skip=('-y', '+y')[0:0])


ow = DOOR_W / 2
for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"doorway_{hname}_{fin}", "doorway", f"{DOOR_W} m x {DOOR_H} m opening; door pieces hinge at x=-{ow}")
        top = min(hh, H)
        wall_box(p, -0.5, -ow, 0, top, fin, skip=('-x',))
        wall_box(p, ow, 0.5, 0, top, fin, skip=('+x',))
        baseboard(p, -0.5, -ow, skip=('-x',)); baseboard(p, ow, 0.5, skip=('+x',))
        if hname == "full":
            wall_box(p, -ow, ow, DOOR_H, H, fin, skip=('-x', '+x'))
            for s in (-1, 1):           # jamb casings + head casing
                casing(p, s * ow - (0.06 if s > 0 else 0), s * ow + (0.06 if s < 0 else 0), 0, DOOR_H + 0.06)
                casing(p, -ow, ow, DOOR_H, DOOR_H + 0.06)
        p.box(-ow, -t, 0, ow, t, 0.015, "WoodDark")     # threshold
        p.view = dict(elev=30, azim=-30)


# ---- windows -----------------------------------------------------------------------------
for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"window_{hname}_{fin}", "window", f"sill {SILL} m, head {HEAD} m; child 'glass' can be hidden when smashed")
        wall_box(p, -0.5, 0.5, 0, min(SILL, hh), fin, skip=('-x', '+x'))
        baseboard(p, -0.5, 0.5)
        if hname == "full":
            wall_box(p, -0.5, 0.5, HEAD, H, fin, skip=('-x', '+x'))
            p.box(-0.5, -t - 0.05, SILL, 0.5, t + 0.03, SILL + 0.04, "Trim", skip=('-x', '+x'))  # sill
            casing(p, -0.5, 0.5, HEAD - 0.05, HEAD)
            for x in (-0.5, 0.45):                         # side posts of the frame
                p.box(x, -t, SILL, x + 0.05, t, HEAD, "Trim")
            p.box(-0.02, -0.02, SILL, 0.02, 0.02, HEAD, "Trim")   # mullion
            g = p.child(f"window_{hname}_{fin}_glass")
            g.box(-0.45, -0.01, SILL + 0.04, 0.45, 0.01, HEAD - 0.05, "Glass", skip=('-x', '+x', '-z', '+z'))
        p.view = dict(elev=25, azim=-30)

# Shopfront: one 1 m cell of floor-to-head glass for the Glint & Sons windows.
for hname, hh in (("full", H), ("low", LOW_H)):
    p = P(f"window_shop_{hname}", "window", "storefront glass 0.35-2.5 m; child 'glass' hideable")
    p.box(-0.5, -t, 0, 0.5, t, min(0.35, hh), {'+z': "WallCap", '*': "SteelDark"}, skip=('-x', '+x'))
    if hname == "full":
        p.box(-0.5, -t, 2.5, 0.5, t, H, {'+z': "WallCap", '*': "SteelDark"}, skip=('-x', '+x'))
        p.box(-0.5, -0.04, 0.35, -0.46, 0.04, 2.5, "Gold")
        p.box(0.46, -0.04, 0.35, 0.5, 0.04, 2.5, "Gold")
        g = p.child("window_shop_full_glass")
        g.box(-0.46, -0.01, 0.35, 0.46, 0.01, 2.5, "Glass", skip=('-x', '+x', '-z', '+z'))
    p.view = dict(elev=25, azim=-30)


# ---- doors (leaf only, child pivots at the hinge) -----------------------------------------
def door(name, body, note, glass=False, kick=None):
    p = P(name, "door", note + "; child '<name>_leaf' pivots at the hinge (x=-0.45), rotate about Y to open")
    p.view = dict(elev=25, azim=-30)
    for z in (0.25, 1.75):                                   # hinge knuckles stay on the frame
        p.cyl(-ow + 0.01, 0, z, z + 0.14, 0.018, "Steel", seg=6)
    L = p.child(name + "_leaf", pivot=(-ow, 0, 0))
    w, h, d = DOOR_W - 0.01, DOOR_H - 0.01, 0.025
    if glass:
        L.box(0, -d, 0, w, d, 0.3, body); L.box(0, -d, h - 0.2, w, d, h, body)
        L.box(0, -d, 0.3, 0.12, d, h - 0.2, body); L.box(w - 0.12, -d, 0.3, w, d, h - 0.2, body)
        L.box(0.12, -0.008, 0.3, w - 0.12, 0.008, h - 0.2, "Glass", skip=('-x', '+x', '-z', '+z'))
    else:
        L.box(0, -d, 0, w, d, h, body)
        L.box(0.12, -d - 0.012, 1.2, w - 0.12, -d, h - 0.15, body if body != "Wood" else "WoodDark", skip=('+y',))
        L.box(0.12, -d - 0.012, 0.15, w - 0.12, -d, 1.05, body if body != "Wood" else "WoodDark", skip=('+y',))
    if kick:
        L.box(0, -d - 0.006, 0, w, d + 0.006, 0.2, kick)
    for s in (-1, 1):                                         # lever handles both sides
        y = s * (d + 0.03)
        L.box(w - 0.12, y - 0.015, 1.0, w - 0.1, y + 0.015, 1.06, "Steel")
        L.box(w - 0.2, y - 0.012, 1.02, w - 0.1, y + 0.012, 1.045, "Steel")
    return p


door("door_wood", "Wood", "staff / office door")
door("door_metal", "SteelDark", "security closet / safe room door", kick="Steel")
door("door_glass", "Gold", "shop entrance, gold frame", glass=True)


# ---- floors, ceiling, street -------------------------------------------------------------
FLOORS = {"showroom": "FloorShowroom", "marble": "FloorMarble", "wood": "FloorWood",
          "carpet": "FloorCarpet", "concrete": "FloorConcrete", "lino": "FloorLino",
          "sidewalk": "Sidewalk", "asphalt": "Asphalt"}
for k, m in FLOORS.items():
    p = P(f"floor_{k}", "floor", "1 x 1 m quad at y=0; texture tiles seamlessly across cells")
    p.quad([(-0.5, -0.5, 0), (0.5, -0.5, 0), (0.5, 0.5, 0), (-0.5, 0.5, 0)], m)
    p.view = dict(elev=60, azim=-20)

p = P("ceiling", "ceiling", f"1 x 1 m, faces down, at y={H}; hide for the top-down camera")
p.quad([(-0.5, -0.5, H), (-0.5, 0.5, H), (0.5, 0.5, H), (0.5, -0.5, H)], "Plaster")
p.view = dict(elev=-40, azim=-20)

p = P("curb", "floor", "sidewalk-to-road edge along the cell's south (+Z) edge, 0.15 m high")
p.box(-0.5, -0.5, 0, 0.5, -0.3, 0.15, {'+z': "Sidewalk", '*': "FloorConcrete"}, skip=('-x', '+x'))


# ---- restricted-area trim: amber/black hatch strip --------------------------------------
def clip_x(poly, lo, hi):
    def clip(pts, keep, xi):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            ia, ib = keep(a), keep(b)
            if ia: out.append(a)
            if ia != ib:
                k = (xi - a[0]) / (b[0] - a[0])
                out.append((xi, a[1] + k * (b[1] - a[1])))
        return out
    poly = clip(poly, lambda q: q[0] >= lo, lo)
    return clip(poly, lambda q: q[0] <= hi, hi) if poly else poly


TW, TZ = 0.15, 0.004             # strip width, height above floor (sits on the floor tile)
p = P("trim_restricted", "trim", "hatched strip on the cell's south (+Z) edge, inside the restricted side; rotate per edge")
w = 1 / 7
for k in range(-2, 9):
    x0 = -0.5 + k * w
    poly = [(x0, -0.5), (x0 + w, -0.5), (x0 + w + TW, -0.5 + TW), (x0 + TW, -0.5 + TW)]
    poly = clip_x(poly, -0.5, 0.5)
    if len(poly) >= 3:
        p.quad([(x, y, TZ) for x, y in poly], "Amber" if k % 2 else "Hatch")
p.view = dict(elev=60, azim=-20)
p = P("trim_restricted_corner", "trim", "fills the SW corner where two strips meet (inner corners)")
p.quad([(-0.5, -0.5, TZ), (-0.5 + TW, -0.5, TZ), (-0.5 + TW, -0.5 + TW, TZ), (-0.5, -0.5 + TW, TZ)], "Amber")
p.view = dict(elev=60, azim=-20)


# ---- demo diorama: a corner of a shop, to judge the look from the game's camera -----------
def demo(cam, built, outdir):
    for ob in built.values():
        for o in rj._descendants(ob):
            o.hide_render = True
    put = lambda n, x, y, rz=0: rj.place_copy(built[n], (x + 0.5, y + 0.5, 0), rz)
    W, D = 7, 6
    for x in range(W):
        for y in range(D):
            put("floor_showroom" if x < 4 else "floor_lino", x, y)
    for y in range(-2, 0):
        for x in range(-1, W + 1):
            put("floor_sidewalk", x, y)
    for x in range(-1, W + 1):
        put("curb", x, -3, 0); put("floor_asphalt", x, -3)
    # back wall (north, y = D), full height
    for x in range(W):
        put("wall_full_int_straight", x, D)
    put("wall_full_int_post", -1, D)
    put("wall_full_int_arm", -1, D)
    # west wall (x = -1), full
    for y in range(0, D):
        put("wall_full_ext_straight", -1, y, 90)
    # interior partition at x = 4 with a door, full height
    for y in range(D):
        if y == 3:
            put("doorway_full_int", 4, y, 90); put("door_wood", 4, y, 90)
        else:
            put("wall_full_int_straight", 4, y, 90)
    # front wall (south, y = -1) cut away to the low stub, as the camera would see it
    for x in range(W):
        if x in (1, 2):
            put("window_shop_low", x, -1)
        elif x == 3:
            put("doorway_low_ext", x, -1)
        else:
            put("wall_low_ext_straight", x, -1)
    put("wall_low_ext_post", -1, -1); put("wall_low_ext_arm", -1, -1)
    # east wall (x = W) low
    for y in range(0, D):
        put("wall_low_ext_straight", W, y, 90)
    put("wall_low_ext_post", W, -1); put("wall_low_ext_arm", W, -1, 180)
    put("wall_low_ext_post", W, D); put("wall_low_ext_arm", W, D, 180)
    # restricted trim on the office side of the partition
    for y in range(D):
        put("trim_restricted", 5, y, -90)
    put("window_full_int", 5, D); put("window_full_int", 6, D)
    sc = rj.bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800
    demo_objs = [o for o in sc.objects if "rj_demo" in o]
    rj.frame(cam, demo_objs, elev=55, azim=0, pad=1.02)
    rj.render(os.path.join(os.path.dirname(outdir), "kit_demo.png"))
    for o in demo_objs:
        rj.bpy.data.objects.remove(o, do_unlink=True)
    sc.render.resolution_x, sc.render.resolution_y = 400, 400


rj.finish("kit", pieces, extra_scene=demo)
