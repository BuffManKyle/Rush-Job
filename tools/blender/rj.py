"""Rush Job: shared Blender build library. Every tools/blender/*_build.py imports this.

    import rj                          (build.py puts this folder on sys.path)
    P = rj.Piece("wall_full_int", kind="wall")
    P.box(-0.5, -0.1, 0, 0.5, 0.1, 2.8, "Plaster")
    rj.finish("kit", [P, ...])         -> assets/models/kit.glb, previews, manifest

Conventions (the contract with the game code; also written up in ASSETS.md):
  * Metres. Blender is Z-up; the GLB is Y-up (glTF). Blender -Y (a piece's FRONT) becomes
    glTF +Z, which is "south"/down-screen on the Tiled map.
  * Grid pieces have their pivot at the CENTRE of their 1 m cell, on the floor (y = 0).
    Multi-cell props pivot at the centre of their footprint, on the floor.
  * Moving parts are child nodes whose pivot is the hinge / swivel (door leaf, safe door,
    camera head). Hideable parts (jewels, glass) are child nodes too, so code can toggle them.
  * Metalness stays <= 0.35: the game has no environment map, and fully metallic surfaces
    render near-black in three.js without one.
  * Materials come from MATS below, all named RJ_<Name>, so code can find and swap them
    (e.g. tint RJ_Danger for the alarm). Only RJ_ materials ever ship.
"""
import bpy, math, os, json, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "assets", "models")
TILE_TEX = os.path.join(ROOT, "assets", "textures", "rj_tile.png")
PREVIEWS = os.path.join(ROOT, "reference-images", "previews")

# ---- palette (sRGB hex). Source of truth is reference-images/STYLE.md; keep in sync. ----
PAL = {
    "navy_deep": "#141d33", "navy": "#22304f", "navy_light": "#3a4d74",
    "teal_dark": "#0f4c5c", "teal": "#1f8a8a", "teal_light": "#6cc5b9",
    "sodium": "#ff9a3c", "sodium_pale": "#ffd59a",
    "gold": "#d9a93f", "gold_dark": "#9c7426",
    "plaster": "#e2d6bd", "plaster_shade": "#b9ab90", "brick": "#7a5446",
    "concrete": "#8d9096", "asphalt": "#2c2f36", "sidewalk": "#a7a59e",
    "wood_dark": "#4a3226", "wood": "#7b5236", "wood_light": "#b08458",
    "carpet": "#3b3550", "linoleum": "#c9c3b1",
    "steel": "#8a9199", "steel_dark": "#3a3f47", "black": "#16171b", "white": "#f2efe8",
    "glass": "#a8dede", "danger": "#e0262f", "amber": "#f2b230", "hatch": "#1b1b1f",
    "safe": "#3d4a45", "plant": "#3f7a55", "van": "#86cdb0", "rubber": "#202125",
    "fabric": "#34373e", "bag": "#6f7788",
    "mask_white": "#f2efe8", "mask_slate": "#5d6577", "mask_cream": "#e8dcc4", "mask_yellow": "#f2c94c",
    "mask_news": "#e9e4d6", "news_ink": "#8a857a", "headline_orange": "#f08a24", "paper": "#f4e48a", "cash": "#6f9a55",
    "skin": "#c99a78", "suit": "#2b2b30", "uniform": "#2f4470", "mask": "#f2efe8",
    # street block (rj-street): neighbour facades, awnings, cars, street paint. No reds.
    "plum": "#6b3f6f", "sage": "#5e8b6c", "slate_blue": "#4f6d8f", "terracotta": "#a8653f",
    "stucco": "#9d8f7c", "stucco_light": "#c8bba3", "brick_dark": "#5b3e35", "roof": "#4a4d57",
    "paint_white": "#e8e6df", "paint_yellow": "#e9d27a", "mustard": "#c99a2e", "window_lit": "#ffcf8a",
}

# Shared material list. tex=(su, sv) means "rj_tile.png x colour" at that UV scale per metre.
MATS = {
    # architecture
    "Plaster":   dict(c="plaster", r=0.9),
    "Brick":     dict(c="brick", r=0.95, tex=(2.0, 4.0)),
    "WallCap":   dict(c="navy_deep", r=0.9),     # wall tops: read as solid ink from above
    "Baseboard": dict(c="navy", r=0.7),
    "Trim":      dict(c="wood_dark", r=0.6),     # door and window frames
    "FloorShowroom": dict(c="teal_dark", r=0.35, tex=(0.5, 0.5)),
    "FloorMarble":   dict(c="white", r=0.3, tex=(0.5, 0.5)),
    "FloorWood":     dict(c="wood", r=0.6, tex=(1.0, 4.0)),
    "FloorCarpet":   dict(c="carpet", r=1.0),
    "FloorConcrete": dict(c="concrete", r=0.9, tex=(0.5, 0.5)),
    "FloorLino":     dict(c="linoleum", r=0.6, tex=(1.0, 1.0)),
    "Sidewalk":      dict(c="sidewalk", r=0.95, tex=(1.0, 1.0)),
    "Asphalt":       dict(c="asphalt", r=1.0),
    "Amber":     dict(c="amber", r=0.6),
    "Hatch":     dict(c="hatch", r=0.6),
    # props
    "Wood":      dict(c="wood", r=0.6),
    "WoodDark":  dict(c="wood_dark", r=0.55),
    "Steel":     dict(c="steel", r=0.35, m=0.3),
    "SteelDark": dict(c="steel_dark", r=0.45, m=0.3),
    "Black":     dict(c="black", r=0.6),
    "White":     dict(c="white", r=0.7),
    "Gold":      dict(c="gold", r=0.35, m=0.35),
    "Teal":      dict(c="teal", r=0.5),
    "TealDark":  dict(c="teal_dark", r=0.5),
    "Navy":      dict(c="navy", r=0.6),
    "Glass":     dict(c="glass", r=0.05, a=0.28),
    "Velvet":    dict(c="navy_deep", r=1.0),     # jewel trays
    "Safe":      dict(c="safe", r=0.45, m=0.2),
    "Plant":     dict(c="plant", r=0.9),
    "VanPaint":  dict(c="van", r=0.4),
    "Rubber":    dict(c="rubber", r=0.9),
    "Fabric":    dict(c="fabric", r=1.0),
    "BagCanvas": dict(c="bag", r=1.0),       # loot bags: lighter than the suits they're carried on
    "Paper":     dict(c="paper", r=1.0),
    "Cash":      dict(c="cash", r=0.9),
    "Cream":     dict(c="plaster", r=0.8),
    "Orange":     dict(c="headline_orange", r=0.6),
    # street block (rj-street)
    "Plum":      dict(c="plum", r=0.55),
    "Sage":      dict(c="sage", r=0.55),
    "SlateBlue": dict(c="slate_blue", r=0.55),
    "Terracotta": dict(c="terracotta", r=0.7),
    "Stucco":    dict(c="stucco", r=0.95, tex=(1.0, 1.0)),
    "StuccoLight": dict(c="stucco_light", r=0.95, tex=(1.0, 1.0)),
    "BrickDark": dict(c="brick_dark", r=0.95, tex=(2.0, 4.0)),
    "Roof":      dict(c="roof", r=1.0, tex=(0.5, 0.5)),
    "Paint":     dict(c="paint_white", r=0.8),       # lane lines, crosswalk
    "PaintYellow": dict(c="paint_yellow", r=0.8),    # centre line (pale, never amber hatch)
    "Mustard":   dict(c="mustard", r=0.6),           # hydrants
    "WindowLit": dict(c="window_lit", r=0.5, e=1.6), # lit shop and flat windows (emissive)
    # light / signal (emissive). Red is ONLY RJ_Danger.
    "Sodium":    dict(c="sodium", r=0.5, e=4.0),
    "Screen":    dict(c="teal_light", r=0.3, e=2.0),
    "Danger":    dict(c="danger", r=0.5, e=3.0),
    "Ok":        dict(c="teal_light", r=0.5, e=3.0),   # keypad accept, camera idle LED
    # characters (stand-ins)
    "Skin":      dict(c="skin", r=0.8),
    "Suit":      dict(c="suit", r=0.8),
    "Uniform":   dict(c="uniform", r=0.8),
    "Mask":      dict(c="mask", r=0.5),
}


def srgb_to_lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


_tile_avg = None
def _tile_image():
    global _tile_avg
    img = bpy.data.images.get("rj_tile.png") or bpy.data.images.load(TILE_TEX)
    img.colorspace_settings.name = 'sRGB'
    if _tile_avg is None:
        px = list(img.pixels)[0::4][::53]
        _tile_avg = sum(srgb_to_lin('#%02x%02x%02x' % ((int(v * 255),) * 3))[0] for v in px) / len(px)
    return img


def mat(name):
    """Get or create the shared material RJ_<name>."""
    full = "RJ_" + name
    m = bpy.data.materials.get(full)
    if m:
        return m
    d = MATS[name]
    c = srgb_to_lin(PAL[d["c"]])
    m = bpy.data.materials.new(full)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = d.get("r", 0.8)
    b.inputs['Metallic'].default_value = d.get("m", 0.0)
    if "tex" in d:
        img = _tile_image()
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        a_in, b_in = [s for s in mix.inputs if s.type == 'RGBA'][:2]
        nt.links.new(tex.outputs['Color'], a_in)
        k = _tile_avg
        b_in.default_value = (min(c[0] / k, 1), min(c[1] / k, 1), min(c[2] / k, 1), 1)
        nt.links.new(next(s for s in mix.outputs if s.type == 'RGBA'), b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*c, 1)
    if d.get("e"):
        b.inputs['Emission Color'].default_value = (*c, 1)
        b.inputs['Emission Strength'].default_value = d["e"]
    if "a" in d:
        b.inputs['Alpha'].default_value = d["a"]
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
        m.use_backface_culling = False
    m.diffuse_color = (*c, d.get("a", 1.0))
    return m


# ---------------------------------------------------------------------------------------
# Part: accumulates faces for ONE mesh object (a piece, or a moving/hideable child of one)
# ---------------------------------------------------------------------------------------
class Part:
    def __init__(self, name, pivot=(0, 0, 0)):
        self.name = name
        self.pivot = Vector(pivot)        # where this part sits in its parent (hinge, swivel...)
        self.verts, self.faces, self.fmat, self.mats = [], [], [], []
        self.xf = Matrix.Identity(4)
        self.children = []
        self.sockets = []           # (name, location): empty nodes for attach points (grip, muzzle)
        self.extras = {}

    # -- transform stack: with P.at((x, y, z), rz=deg): ... --
    class _At:
        def __init__(self, part, m): self.p, self.m = part, m
        def __enter__(self): self.old = self.p.xf; self.p.xf = self.p.xf @ self.m
        def __exit__(self, *a): self.p.xf = self.old

    def at(self, loc=(0, 0, 0), rz=0.0, rx=0.0, ry=0.0, s=1.0):
        m = Matrix.Translation(Vector(loc)) @ Euler((math.radians(rx), math.radians(ry),
                                                     math.radians(rz))).to_matrix().to_4x4()
        if s != 1.0:
            m = m @ Matrix.Diagonal((s, s, s, 1)) if not hasattr(s, '__len__') else m @ Matrix.Diagonal((*s, 1))
        return Part._At(self, m)

    def socket(self, name, loc):
        """An empty node at loc (this part's space): e.g. 'muzzle' where shots and flashes start."""
        self.sockets.append((name, (self.xf @ Vector(loc)).to_tuple()))

    def child(self, name, pivot=(0, 0, 0)):
        """A moving or hideable sub-part. It inherits the current transform (e.g. a scale set
        with `at`): its pivot goes through it, and so does its own geometry, minus the offset."""
        c = Part(name, (self.xf @ Vector(pivot)).to_tuple())
        c.xf = self.xf.copy()
        c.xf.translation = (0, 0, 0)
        self.children.append(c)
        return c

    def _mi(self, matname):
        if matname not in self.mats:
            self.mats.append(matname)
        return self.mats.index(matname)

    def v(self, co):
        self.verts.append((self.xf @ Vector(co)).to_tuple())
        return len(self.verts) - 1

    def face(self, cos, m):
        idx = [self.v(c) for c in cos]
        self.faces.append(idx); self.fmat.append(self._mi(m))

    def box(self, x0, y0, z0, x1, y1, z1, m, skip=(), bottom=None):
        """Axis-aligned box from (x0,y0,z0) to (x1,y1,z1). skip: any of -x +x -y +y -z +z.
        The bottom face is dropped automatically when the box sits on the floor (z0 <= 0)."""
        if bottom is None:
            bottom = z0 > 0.0005
        sk = set(skip)
        if not bottom:
            sk.add('-z')
        F = {
            '-z': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)],
            '+z': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
            '-y': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
            '+y': [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)],
            '-x': [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)],
            '+x': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
        }
        mm = m if isinstance(m, dict) else None
        for k, cos in F.items():
            if k not in sk:
                self.face(cos, mm.get(k, mm['*']) if mm else m)

    def cbox(self, cx, cy, z0, sx, sy, sz, m, **kw):
        """Box centred on (cx, cy) in XY, bottom at z0."""
        self.box(cx - sx / 2, cy - sy / 2, z0, cx + sx / 2, cy + sy / 2, z0 + sz, m, **kw)

    def quad(self, cos, m):
        self.face(cos, m)

    def cyl(self, cx, cy, z0, z1, r, m, seg=8, r2=None, caps=(True, True), axis='z', cap_m=None):
        """Cylinder (or cone/frustum with r2) along axis, centred at (cx, cy) in the other two."""
        r2 = r if r2 is None else r2
        def P(a, rad, h):
            u, w = rad * math.cos(a), rad * math.sin(a)
            if axis == 'z': return (cx + u, cy + w, h)
            if axis == 'x': return (h, cx + u, cy + w)
            return (cx + u, h, cy + w)        # axis 'y'
        angs = [2 * math.pi * (i + 0.5) / seg for i in range(seg)]
        flip = axis == 'y'
        for i in range(seg):
            a, b = angs[i], angs[(i + 1) % seg]
            q = [P(a, r, z0), P(b, r, z0), P(b, r2, z1), P(a, r2, z1)]
            if r2 < 1e-6: q = q[:3]
            self.face(q[::-1] if flip else q, m)
        cm = cap_m or m
        if caps[0] and (z0 > 0.0005 or axis != 'z'):
            c = [P(a, r, z0) for a in angs][::-1]
            self.face(c[::-1] if flip else c, cm)
        if caps[1] and r2 > 1e-6:
            c = [P(a, r2, z1) for a in angs]
            self.face(c[::-1] if flip else c, cm)

    def prism(self, pts, a0, a1, m, axis='y', caps=True, cap_m=None):
        """Extrude a 2D outline along an axis, from a0 to a1. pts are (u, w) pairs,
        counter-clockwise in the (u, w) plane. axis 'y': (u, w) = (x, z), i.e. drawn as seen
        from the front; 'x': (y, z); 'z': (x, y), i.e. a floor plan."""
        def P(u, w, a):
            if axis == 'y': return (u, a, w)
            if axis == 'x': return (a, u, w)
            return (u, w, a)
        n = len(pts)
        sgn = -1 if axis == 'y' else 1      # (x, z) seen down +y is mirrored
        for i in range(n):
            (u0, w0), (u1, w1) = pts[i], pts[(i + 1) % n]
            q = [P(u0, w0, a0), P(u1, w1, a0), P(u1, w1, a1), P(u0, w0, a1)]
            self.face(q if sgn > 0 else q[::-1], m)
        if caps:
            cm = cap_m or m
            lo = [P(u, w, a0) for u, w in pts][::-1]
            hi = [P(u, w, a1) for u, w in pts]
            if sgn < 0: lo, hi = lo[::-1], hi[::-1]
            if not (axis == 'z' and a0 <= 0.0005):
                self.face(lo, cm)
            self.face(hi, cm)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces) + sum(c.tris() for c in self.children)

    # -- build the Blender objects --
    def build(self, parent=None):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(self.verts, [], self.faces)
        for mn in self.mats:
            me.materials.append(mat(mn))
        for p, mi in zip(me.polygons, self.fmat):
            p.material_index = mi
            p.use_smooth = False
        if any("tex" in MATS[mn] for mn in self.mats):
            uv = me.uv_layers.new(name="UVMap")
            for p, mi in zip(me.polygons, self.fmat):
                su, sv = MATS[self.mats[mi]].get("tex", (1.0, 1.0))
                n = p.normal
                ax = max(range(3), key=lambda i: abs(n[i]))
                for li in p.loop_indices:
                    co = Vector(me.vertices[me.loops[li].vertex_index].co) + self.pivot
                    if ax == 2: u, w = co.x, co.y
                    elif ax == 0: u, w = co.y, co.z
                    else: u, w = co.x, co.z
                    uv.data[li].uv = ((u + 0.5) * su, (w + 0.5) * sv)
        me.validate(); me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        ob.location = self.pivot
        for k, val in self.extras.items():
            ob[k] = json.dumps(val) if isinstance(val, dict) else val
        for c in self.children:
            c.build(ob)
        for sname, loc in self.sockets:
            e = bpy.data.objects.new(sname, None)
            e.empty_display_size = 0.05
            bpy.context.scene.collection.objects.link(e)
            e.parent = ob
            e.location = loc
        return ob


class Piece(Part):
    """A top-level asset: one node in the exported GLB, sitting at the origin."""
    def __init__(self, name, kind="prop", cells=(1, 1), note=""):
        super().__init__(name)
        self.kind, self.cells, self.note = kind, cells, note
        self.extras = {"rj_kind": kind, "rj_cells": list(cells)}


# ---------------------------------------------------------------------------------------
# preview + export
# ---------------------------------------------------------------------------------------
def _reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def _descendants(ob):
    out = [ob]
    for c in ob.children:
        out += _descendants(c)
    return out


def _world_bounds(objs):
    pts = []
    for o in objs:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def setup_render(res=(400, 400)):
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            sc.render.engine = eng; break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    if sc.world is None:
        sc.world = bpy.data.worlds.new("RJ_World")
    try: sc.world.use_nodes = True
    except Exception: pass
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (*srgb_to_lin(PAL["navy"]), 1)
    bg.inputs[1].default_value = 1.0
    if not sc.objects.get("RJ_Key"):
        key = bpy.data.objects.new("RJ_Key", bpy.data.lights.new("RJ_Key", "SUN"))
        key.data.energy = 4.0
        key.data.color = srgb_to_lin(PAL["sodium_pale"])
        key.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(-35)))
        sc.collection.objects.link(key)
        fill = bpy.data.objects.new("RJ_Fill", bpy.data.lights.new("RJ_Fill", "SUN"))
        fill.data.energy = 0.6
        fill.data.color = srgb_to_lin(PAL["teal_light"])
        fill.rotation_euler = Euler((math.radians(60), 0, math.radians(150)))
        sc.collection.objects.link(fill)
    cam = sc.objects.get("RJ_Cam")
    if cam is None:
        cam = bpy.data.objects.new("RJ_Cam", bpy.data.cameras.new("RJ_Cam"))
        cam.data.type = 'ORTHO'
        sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def frame(cam, objs, elev=40.0, azim=-35.0, pad=1.12):
    """Point the ortho camera at objs from the front-left, elevation/azimuth in degrees.
    azim 0 = looking from -Y (the piece's front) toward +Y."""
    bpy.context.view_layer.update()
    lo, hi = _world_bounds(objs)
    ctr = (lo + hi) / 2
    e, a = math.radians(elev), math.radians(azim)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = ctr + d * 30
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    corners = [inv @ Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    w = max(c.x for c in corners) - min(c.x for c in corners)
    h = max(c.y for c in corners) - min(c.y for c in corners)
    sc = bpy.context.scene
    aspect = sc.render.resolution_x / sc.render.resolution_y
    cam.data.ortho_scale = max(w, h * aspect, 0.3) * pad
    cam.data.clip_end = 100


def render(path):
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _gltf_bounds(objs):
    lo, hi = _world_bounds(objs)
    # Blender (x, y, z) -> glTF (x, z, -y)
    return {"min": [round(lo.x, 3), round(lo.z, 3), round(-hi.y, 3)],
            "max": [round(hi.x, 3), round(hi.z, 3), round(-lo.y, 3)]}


def finish(lib, pieces, previews=None, extra_scene=None):
    """Build every piece, render one preview each, export assets/models/<lib>.glb and
    reference-images/previews/<lib>/manifest.json. extra_scene(cam) may render more shots."""
    if previews is None:
        previews = os.environ.get("RJ_PREVIEW", "1") == "1"
    _reset_scene()
    roots = []
    for P in pieces:
        ob = P.build()
        roots.append((P, ob))
    outdir = os.path.join(PREVIEWS, lib)
    manifest = {"lib": lib, "glb": f"assets/models/{lib}.glb", "pieces": []}
    if previews:
        cam = setup_render()
    for P, ob in roots:
        objs = _descendants(ob)
        manifest["pieces"].append({
            "name": P.name, "kind": P.kind, "cells": list(P.cells), "tris": P.tris(),
            "children": [o.name for o in objs[1:]], "bounds": _gltf_bounds(objs), "note": P.note,
        })
    if previews:
        for P, ob in roots:
            objs = set(_descendants(ob))
            for _, o2 in roots:
                for o in _descendants(o2):
                    o.hide_render = o not in objs
            frame(cam, list(objs), **getattr(P, "view", {}))
            render(os.path.join(outdir, P.name + ".png"))
        for _, o2 in roots:
            for o in _descendants(o2):
                o.hide_render = False
    # export: every piece root plus descendants, nothing else
    for _, o2 in roots:
        for o in _descendants(o2):
            o.hide_render = False
    if extra_scene and previews:
        extra_scene(cam, dict((P.name, ob) for P, ob in roots), outdir)
    bpy.ops.object.select_all(action='DESELECT')
    for _, ob in roots:
        for o in _descendants(ob):
            o.select_set(True)
    bpy.context.view_layer.objects.active = roots[0][1]
    path = os.path.join(MODELS, lib + ".glb")
    os.makedirs(MODELS, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_animations=False, export_image_format='AUTO')
    manifest["bytes"] = os.path.getsize(path)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"RJ_DONE {lib}: {len(pieces)} pieces, {manifest['bytes']} bytes -> {path}")
    return manifest


def text_into(part, text, size, depth, m, loc=(0, 0, 0), rx=90.0, rz=0.0, align='CENTER'):
    """Add extruded text (Blender's built-in font) to a Part. By default the text stands up,
    readable from the front (-Y). loc is the baseline centre."""
    cu = bpy.data.curves.new("rj_text", type='FONT')
    cu.body = text
    cu.size = size
    cu.extrude = depth / 2
    cu.align_x = align
    cu.resolution_u = 2
    cu.fill_mode = 'BOTH'
    ob = bpy.data.objects.new("rj_text", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    with part.at(loc, rx=rx, rz=rz):
        for poly in me.polygons:
            part.face([tuple(me.vertices[i].co) for i in poly.vertices], m)
    ob.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)


def place_copy(ob, loc, rz=0.0, name=None):
    """Linked duplicate of a built piece (with children) for demo scenes. Not exported."""
    def dup(o, parent):
        c = o.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = parent
        c["rj_demo"] = 1
        c.hide_render = False
        for ch in o.children:
            dup(ch, c)
        return c
    r = dup(ob, None)
    r.location = loc
    r.rotation_euler = (0, 0, math.radians(rz))
    if name: r.name = name
    return r
