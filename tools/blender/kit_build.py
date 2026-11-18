"""Rush Job modular architecture kit -> assets/models/kit.glb

    py tools/blender/build.py kit

Matches the graybox in src/view/renderer.ts and src/tuning.ts: a wall, window or door is a
WHOLE 1 m grid cell (same as the collision grid), walls are H = 3.0 m tall, and the camera's
cutaway sinks them to LOW_H = 0.35 m. Pivot = centre of the cell, on the floor.

Every *_full_* piece has a *_low_* twin with the same footprint, so the cutaway can either swap
full -> low, or keep the full piece and scale it on Y (all pieces are flat-coloured, so a Y
squash looks fine; that is what the graybox does today).

Doorways and windows run along X (wall cells to the east and west, you pass through along Z /
north-south); rotate 90 degrees about Y when the wall runs north-south. Door leaves are separate
pieces whose leaf child hinges at x = -0.46, like the graybox door.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rj

H, LOW_H = 3.0, 0.35                 # T.view.wallHeight, T.view.wallStub
DOOR_W, DOOR_H = 0.92, 2.1           # T.doors.height; leaf width as in the graybox
SILL, HEAD = 0.9, 2.3                # window sill / head, as in the graybox
BASE_H = 0.12                        # baseboard
FIN = {"int": "Plaster", "ext": "Brick"}
pieces = []


def P(name, kind, note="", **view):
    p = rj.Piece(name, kind=kind, note=note)
    if view: p.view = view
    pieces.append(p)
    return p


def block(p, z0, z1, fin, skip=()):
    """A full-cell slab of wall from z0 to z1, ink cap on top, baseboard if it reaches the floor."""
    p.box(-0.5, -0.5, z0, 0.5, 0.5, z1, {'+z': "WallCap", '*': FIN[fin]}, skip=skip)
    if z0 <= 0.0005:
        p.box(-0.512, -0.512, 0, 0.512, 0.512, min(BASE_H, z1 - 0.01), "Baseboard", skip=tuple(skip) + ('+z',))


# ---- walls -------------------------------------------------------------------------------
for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"wall_{hname}_{fin}", "wall", "one wall cell" + (" (plaster)" if fin == "int" else " (brick, building exterior)"))
        block(p, 0, hh, fin)


# ---- doorways (the opening; door leaves are separate pieces) -------------------------------
def casing(p, z_top, ow=0.5):
    """Door frame trim around the opening on both faces (north and south), 3 cm proud."""
    for y0, y1 in ((-0.53, -0.5), (0.5, 0.53)):
        p.box(-ow, y0, z_top, ow, y1, z_top + 0.08, "Trim", bottom=True)
        for x in (-ow, ow - 0.07):
            p.box(x, y0, 0, x + 0.07, y1, z_top, "Trim")


for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"doorway_{hname}_{fin}", "doorway", f"door cell: lintel {DOOR_H}-{H} m over a 1 m opening, passage along Z"
              + ("" if hname == "full" else "; low = threshold only"))
        if hname == "full":
            p.box(-0.5, -0.5, DOOR_H, 0.5, 0.5, H, {'+z': "WallCap", '*': FIN[fin]}, skip=('-x', '+x'))
            casing(p, DOOR_H)
            for x in (-0.5, 0.46):                                   # jamb linings
                p.box(x, -0.5, 0, x + 0.04, 0.5, DOOR_H, "Trim")
        p.box(-0.5, -0.5, 0, 0.5, 0.5, 0.015, "WoodDark")          # threshold
        p.view = dict(elev=30, azim=-30)


# ---- windows -----------------------------------------------------------------------------
for fin in FIN:
    for hname, hh in (("full", H), ("low", LOW_H)):
        p = P(f"window_{hname}_{fin}", "window", f"window cell: sill {SILL} m, head {HEAD} m; child glass is hideable (smashed)")
        block(p, 0, min(SILL, hh), fin, skip=('-x', '+x'))
        if hname == "full":
            p.box(-0.5, -0.5, HEAD, 0.5, 0.5, H, {'+z': "WallCap", '*': FIN[fin]}, skip=('-x', '+x'))
            p.box(-0.5, -0.56, SILL, 0.5, 0.56, SILL + 0.04, "Trim", skip=('-x', '+x'))      # sill board
            for x in (-0.5, 0.45):
                p.box(x, -0.06, SILL, x + 0.05, 0.06, HEAD, "Trim")       # frame sides
            p.box(-0.5, -0.06, HEAD - 0.06, 0.5, 0.06, HEAD, "Trim", bottom=True)
            p.box(-0.025, -0.03, SILL, 0.025, 0.03, HEAD, "Trim")          # mullion
            g = p.child(f"window_{hname}_{fin}_glass")
            g.box(-0.45, -0.01, SILL + 0.04, 0.45, 0.01, HEAD - 0.06, "Glass", skip=('-x', '+x', '-z', '+z'))
        p.view = dict(elev=25, azim=-30)

# Shopfront: one 1 m cell of tall glass for the Glint & Sons windows.
for hname, hh in (("full", H), ("low", LOW_H)):
    p = P(f"window_shop_{hname}", "window", "storefront cell: glass 0.35-2.5 m, gold mullion; child glass hideable")
    p.box(-0.5, -0.5, 0, 0.5, 0.5, min(0.35, hh), {'+z': "WallCap", '*': "SteelDark"}, skip=('-x', '+x'))
    if hname == "full":
        p.box(-0.5, -0.5, 2.5, 0.5, 0.5, H, {'+z': "WallCap", '*': "SteelDark"}, skip=('-x', '+x'))
        p.box(-0.5, -0.06, 0.35, -0.45, 0.06, 2.5, "Gold")
        p.box(-0.5, -0.56, 0.35, 0.5, -0.5, 0.4, "Gold", bottom=True, skip=('-x', '+x'))
        p.box(-0.5, -0.56, 2.45, 0.5, -0.5, 2.5, "Gold", bottom=True, skip=('-x', '+x'))
        g = p.child("window_shop_full_glass")
        g.box(-0.45, -0.01, 0.35, 0.5, 0.01, 2.5, "Glass", skip=('-x', '+x', '-z', '+z'))
    p.view = dict(elev=25, azim=-30)


# ---- doors (leaf only, child pivots at the hinge) -----------------------------------------
ow = DOOR_W / 2


def door(name, body, note, glass=False, kick=None):
    p = P(name, "door", note + f"; child '{name}_leaf' hinges at x=-{ow} (rotate about Y to open), like the graybox leaf")
    p.view = dict(elev=25, azim=-30)
    for z in (0.25, 1.75):                                   # hinge knuckles stay on the frame
        p.cyl(-ow + 0.01, 0, z, z + 0.14, 0.022, "Steel", seg=6)
    L = p.child(name + "_leaf", pivot=(-ow, 0, 0))
    w, h, d = DOOR_W, DOOR_H - 0.02, 0.035
    if glass:
        L.box(0, -d, 0, w, d, 0.3, body); L.box(0, -d, h - 0.2, w, d, h, body)
        L.box(0, -d, 0.3, 0.12, d, h - 0.2, body); L.box(w - 0.12, -d, 0.3, w, d, h - 0.2, body)
        L.box(0.12, -0.008, 0.3, w - 0.12, 0.008, h - 0.2, "Glass", skip=('-x', '+x', '-z', '+z'))
    else:
        L.box(0, -d, 0, w, d, h, body)
        inset = body if body != "Wood" else "WoodDark"
        for s in (-1, 1):
            y0, y1 = (-d - 0.012, -d) if s < 0 else (d, d + 0.012)
            sk = ('+y',) if s < 0 else ('-y',)
            L.box(0.12, y0, 1.2, w - 0.12, y1, h - 0.15, inset, skip=sk, bottom=True)
            L.box(0.12, y0, 0.15, w - 0.12, y1, 1.05, inset, skip=sk, bottom=True)
    if kick:
        L.box(0, -d - 0.006, 0, w, d + 0.006, 0.2, kick)
    for s in (-1, 1):                                         # lever handles both sides
        y = s * (d + 0.03)
        L.box(w - 0.12, y - 0.015, 1.0, w - 0.1, y + 0.015, 1.06, "Steel", bottom=True)
        L.box(w - 0.2, y - 0.012, 1.02, w - 0.1, y + 0.012, 1.045, "Steel", bottom=True)
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

p = P("ceiling", "ceiling", f"1 x 1 m quad facing down at y={H}; hide it for the top-down camera")
p.quad([(-0.5, -0.5, H), (-0.5, 0.5, H), (0.5, 0.5, H), (0.5, -0.5, H)], "Plaster")
p.view = dict(elev=-40, azim=-20)

p = P("curb", "floor", "sidewalk-to-road edge along the cell's south (+Z) edge, 0.15 m high; lay on the sidewalk row")
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


# ---- demo diorama: a corner of a shop from the game's 55 degree camera ---------------------
# Rows read north (top) to south (bottom) like the Tiled map.
# '#' wall  '|' window  'D' door  'W' shop glass  '.' showroom  ',' office  '_' sidewalk  'a' street
PLAN = [
    "#########",
    "#...#,,,#",
    "#...D,,,|",
    "#...#,,,#",
    "#...#####",
    "#.......#",
    "##WWDWW##",
    "_________",
    "aaaaaaaaa",
]
CUT_FROM = 5          # rows from here south sit between the camera and the player: cut away


def demo(cam, built, outdir):
    for ob in built.values():
        for o in rj._descendants(ob):
            o.hide_render = True
    put = lambda n, x, y, rz=0: rj.place_copy(built[n], (x + 0.5, y + 0.5, 0), rz)
    rows = len(PLAN)
    for r, line in enumerate(PLAN):
        y = rows - 1 - r
        hh = "low" if r >= CUT_FROM else "full"
        for x, c in enumerate(line):
            put({".": "floor_showroom", ",": "floor_lino", "_": "floor_sidewalk", "a": "floor_asphalt"}.get(c, "floor_lino"), x, y)
            ext = r in (0, 6) or x in (0, 8)
            ew = 0 < x < len(line) - 1 and line[x - 1] in "#WD|" and line[x + 1] in "#WD|"
            rz = 0 if ew else 90
            if c == "#":
                put(f"wall_{hh}_{'ext' if ext else 'int'}", x, y)
            elif c == "|":
                put(f"window_{hh}_ext", x, y, rz)
            elif c == "W":
                put(f"window_shop_{hh}", x, y)
            elif c == "D":
                put(f"doorway_{hh}_{'ext' if ext else 'int'}", x, y, rz)
                if hh == "full":
                    put("door_glass" if r == 6 else "door_wood", x, y, rz)
            elif c == "_" and r == 7:
                put("curb", x, y)
    for r in (1, 2, 3):                  # restricted trim inside the office, along its west edge
        put("trim_restricted", 5, rows - 1 - r, -90)
    sc = rj.bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1280, 900
    demo_objs = [o for o in sc.objects if "rj_demo" in o]
    rj.frame(cam, demo_objs, elev=55, azim=0, pad=1.02)
    rj.render(os.path.join(os.path.dirname(outdir), "kit_demo.png"))
    for o in demo_objs:
        rj.bpy.data.objects.remove(o, do_unlink=True)
    sc.render.resolution_x, sc.render.resolution_y = 400, 400


rj.finish("kit", pieces, extra_scene=demo)
