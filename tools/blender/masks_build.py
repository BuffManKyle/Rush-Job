"""Rush Job player masks -> assets/models/masks.glb

    py tools/blender/build.py masks

The five masks in src/data/loadout.ts (MASKS), each fitted to the Meshy player's own face: the
RJ_Mask faces of assets/models/char_player.glb, subdivided once, pushed 6 mm forward, and painted by
face region (flat colours, no texture) plus a few 3D details.

    mask_regular    The Regular            white, dark eye slits (start mask)
    mask_rumor      The Rumor (Ghost)      slate grey, black redaction bars over the eyes and mouth
    mask_suit       The Suit (Professional) cream, slicked hairline, gold glasses, neat moustache
    mask_objector   Conscientious Objector (Pacifist)  yellow, a white dove across the eyes, olive sprig
    mask_headline   The Headline (Loud)    newsprint face, black headline banner, orange tag, columns

Each mask is in the CHARACTER'S model space (rest pose, metres, feet at 0, facing +Z), so on its own
it floats where the face is. userData.rj_bone = "Head". To wear one (three.js):
    const head = player.getObjectByName('Head'); const sk = skinnedMesh.skeleton;
    mask.applyMatrix4(sk.boneInverses[sk.bones.indexOf(head)]); head.add(mask);
and hide the RJ_Mask mesh (RJ_Face stays). To show one alone, use it as is (centre on its bounds).
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import rj

SRC = os.path.join(rj.ROOT, "assets", "models", "char_player.glb")
OFFSET = 0.006
EYE_U, EYE_V = 0.36, 0.6        # eye centres in mask space: u across (0 = nose), v up (0 = chin)


def load_face():
    rj._reset_scene()
    bpy.ops.import_scene.gltf(filepath=SRC)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.data.pose_position = 'REST'
    if rig.animation_data:
        rig.animation_data.action = None
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    # collect the RJ_Mask faces (in whichever imported mesh holds them) in world space
    bm = bmesh.new()
    lum = []                          # (luminance, world centre) per mask face; the darkest are the eyes
    for ob in meshes:
        me = ob.data
        idx = [i for i, m in enumerate(me.materials) if m and m.name.startswith("RJ_Mask")]
        if not idx:
            continue
        mw = ob.matrix_world
        img = next((n.image for n in me.materials[idx[0]].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        px = list(img.pixels) if img else None
        w, h = img.size if img else (0, 0)
        uv = me.uv_layers.active.data if me.uv_layers else None
        vmap = {}
        for p in me.polygons:
            if p.material_index not in idx:
                continue
            vs = []
            for vi in p.vertices:
                if vi not in vmap:
                    vmap[vi] = bm.verts.new(mw @ me.vertices[vi].co)
                vs.append(vmap[vi])
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
            if px and uv:
                u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
                v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
                k = (min(h - 1, int(v * h)) * w + min(w - 1, int(u * w))) * 4
                lum.append((sum(px[k:k + 3]) / 3, mw @ p.center))
    bm.normal_update()
    lum.sort(key=lambda t: t[0])
    dark = [c for _, c in lum[:max(4, len(lum) // 12)]]
    return bm, dark, meshes


def frame_of(bm):
    xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    cx = (min(xs) + max(xs)) / 2
    return cx, (max(xs) - min(xs)) / 2, min(zs), max(zs)


# ---- designs: (u, v) -> material; u in -1..1 across (character's left = +u), v 0 = chin .. 1 = brow
def in_poly(u, v, poly):
    inside = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[i - 1]
        if (y0 > v) != (y1 > v) and u < (x1 - x0) * (v - y0) / (y1 - y0) + x0:
            inside = not inside
    return inside


def designs(eu, ev):
    def eye(u, v, ru=0.17, rv=0.06):
        return ((abs(u) - eu) / ru) ** 2 + ((v - ev) / rv) ** 2 < 1

    def regular(u, v):
        return "black" if abs(v - ev) < 0.035 and eu - 0.17 < abs(u) < eu + 0.17 else "mask_white"

    def rumor(u, v):
        if abs(v - ev) < 0.075:
            return "black"                                   # redacted: the eyes
        if abs(v - 0.24) < 0.045 and abs(u) < 0.55:
            return "black"                                   # redacted: the mouth
        return "mask_slate"

    def suit(u, v):
        if v > 0.9 or (v > 0.84 and u > 0.25):
            return "black"                                   # slicked hair, side parting
        if eye(u, v, 0.13, 0.045):
            return "black"
        if 0.32 < v < 0.37 and 0.06 < abs(u) < 0.42 + (0.37 - v):
            return "black"                                   # neat moustache
        if abs(v - (ev + 0.1)) < 0.015 and eu - 0.15 < abs(u) < eu + 0.15:
            return "black"                                   # brows
        return "mask_cream"

    dove = [(-0.97, ev + 0.22), (-0.72, ev + 0.13), (-0.45, ev + 0.03), (-0.2, ev - 0.03),      # left wing, top edge
            (-0.1, ev + 0.03), (0.0, ev + 0.08), (0.1, ev + 0.03),                                   # head
            (0.2, ev - 0.03), (0.45, ev + 0.03), (0.72, ev + 0.13), (0.97, ev + 0.22),               # right wing
            (0.72, ev + 0.02), (0.42, ev - 0.1), (0.16, ev - 0.16),                                  # right wing, under
            (0.13, ev - 0.31), (0.0, ev - 0.26), (-0.13, ev - 0.31),                                 # tail
            (-0.16, ev - 0.16), (-0.42, ev - 0.1), (-0.72, ev + 0.02)]

    def near_edge(u, v, poly, d):
        for i in range(len(poly)):
            (x0, y0), (x1, y1) = poly[i - 1], poly[i]
            dx, dy = x1 - x0, (y1 - y0) * 2          # v spans half of u's range, so weight it to look even
            t = max(0, min(1, ((u - x0) * dx + (v - y0) * 2 * dy) / (dx * dx + dy * dy)))
            if math.hypot(u - (x0 + t * dx), (v - (y0 + t * (y1 - y0))) * 2) < d:
                return True
        return False

    def objector(u, v):
        if eye(u, v, 0.11, 0.04):
            return "black"
        if near_edge(u, v, dove, 0.03):
            return "black"                                   # outline, so the dove reads on yellow
        if in_poly(u, v, dove):
            return "white"
        if abs(v - 0.28) < 0.03 and 0.1 < u < 0.5 or (0.3 < v < 0.36 and 0.2 < u < 0.28) or (0.21 < v < 0.26 and 0.32 < u < 0.4):
            return "plant"                                   # olive sprig
        return "mask_yellow"

    FONT = {"E": ["111", "100", "110", "100", "111"], "X": ["101", "101", "010", "101", "101"],
            "T": ["111", "010", "010", "010", "010"], "R": ["110", "101", "110", "101", "101"],
            "A": ["010", "101", "111", "101", "101"], "!": ["1", "1", "1", "0", "1"]}
    word = "EXTRA!"
    cols = sum(len(FONT[c][0]) + 1 for c in word) - 1
    B0, B1, U0, U1 = 0.74, 0.96, -0.82, 0.5                     # banner box (v) and lettering span (u)

    def headline(u, v):
        if B0 < v < B1:
            if u > 0.58:
                return "headline_orange"                         # the price tag
            row = int((B1 - 0.03 - v) / ((B1 - B0 - 0.06) / 5))
            if 0 <= row < 5 and U0 <= u < U1:
                col = int((u - U0) / ((U1 - U0) / cols))
                for ch in word:
                    w = len(FONT[ch][0])
                    if col < w:
                        return "mask_news" if FONT[ch][row][col] == "1" else "black"
                    col -= w + 1
                    if col < 0:
                        return "black"
            return "black"
        if eye(u, v, 0.13, 0.05):
            return "black"
        if abs(u) < 0.06:
            return "mask_news"                                   # gutter between the columns
        if v < B0 - 0.04 and ((v * 100) % 7) < 2.4 and not abs(v - ev) < 0.09:
            return "news_ink"                                    # lines of print
        return "mask_news"

    return {"regular": regular, "rumor": rumor, "suit": suit, "objector": objector, "headline": headline}


TEX = 512
ROUGH = {"regular": 0.4, "rumor": 0.55, "suit": 0.4, "objector": 0.4, "headline": 0.85}


def paint(key, fn):
    """Draw a design into a TEX x TEX image (u across, v up), flat palette colours, saved as PNG."""
    import numpy as np
    cache = {}
    arr = np.zeros((TEX, TEX, 4), dtype=np.float32)
    for j in range(TEX):
        v = (j + 0.5) / TEX
        for i in range(TEX):
            u = (i + 0.5) / TEX * 2 - 1
            c = fn(u, v)
            if c not in cache:
                h = rj.PAL[c]
                cache[c] = [int(h[k:k + 2], 16) / 255 for k in (1, 3, 5)] + [1.0]
            arr[j, i] = cache[c]
    img = bpy.data.images.new(f"mask_{key}_paint", TEX, TEX, alpha=False)
    img.pixels[:] = arr.ravel()
    path = os.path.join(rj.PREVIEWS, "masks", f"mask_{key}_paint.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    return img


def lacquer(key, img):
    """RJ_Lacquer_<key>: the painted design (not RJ_Mask*, which the game hides and tints)."""
    m = bpy.data.materials.new(f"RJ_Lacquer_{key}")
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = ROUGH[key]
    b.inputs['Metallic'].default_value = 0.0
    return m


NAMES = {"regular": "The Regular", "rumor": "The Rumor", "suit": "The Suit",
         "objector": "Conscientious Objector", "headline": "The Headline"}


def build_masks():
    base, dark, char_meshes = load_face()
    for v in base.verts:
        v.co += v.normal * OFFSET
    base.normal_update()
    cx, hw, z0, z1 = frame_of(base)
    to_uv = lambda p: ((p.x - cx) / hw, (p.z - z0) / (z1 - z0))
    # Eye centres on the Meshy face, measured by eye from the masked close-up (texture-based
    # detection picked up the hood's shadow at the mask edge instead). Re-check if the face changes.
    eu, ev = EYE_U, EYE_V
    print(f"RJ_MASKFRAME width {2 * hw:.3f} m, height {z1 - z0:.3f} m, eyes u={eu:.2f} v={ev:.2f} ({len(dark)} dark faces)")
    # BVH of the shell, to put 3D details on the surface
    tree = BVHTree.FromBMesh(base)

    def on_face(u, v, lift=0.0):
        x, z = cx + u * hw, z0 + v * (z1 - z0)
        hit = tree.ray_cast(Vector((x, -5.0, z)), Vector((0, 1, 0)))
        y = hit[0].y if hit[0] else -0.1
        return Vector((x, y - lift, z))

    out = {}
    for key, fn in designs(eu, ev).items():
        img = paint(key, fn)
        bm = base.copy()
        me = bpy.data.meshes.new(f"mask_{key}")
        for f in bm.faces:
            f.smooth = False
        uvl = bm.loops.layers.uv.new("UVMap")
        for f in bm.faces:
            for l in f.loops:
                u, v = to_uv(l.vert.co)
                l[uvl].uv = ((u + 1) / 2, v)
        bm.to_mesh(me); bm.free()
        me.materials.append(lacquer(key, img))
        ob = bpy.data.objects.new(f"mask_{key}", me)
        bpy.context.scene.collection.objects.link(ob)
        extra = None
        if key == "suit":                                    # gold glasses, standing just off the face
            g = rj.Part("mask_suit_glasses")
            for s in (-1, 1):
                c = on_face(s * eu, ev, 0.012)
                w, hh, t = 0.032, 0.022, 0.004
                g.box(c.x - w, c.y - t, c.z + hh - t, c.x + w, c.y + t, c.z + hh, "Gold", bottom=True)
                g.box(c.x - w, c.y - t, c.z - hh, c.x + w, c.y + t, c.z - hh + t, "Gold", bottom=True)
                g.box(c.x - w, c.y - t, c.z - hh, c.x - w + t, c.y + t, c.z + hh, "Gold", bottom=True)
                g.box(c.x + w - t, c.y - t, c.z - hh, c.x + w, c.y + t, c.z + hh, "Gold", bottom=True)
                g.quad([(c.x - w + t, c.y + 0.001, c.z - hh + t), (c.x + w - t, c.y + 0.001, c.z - hh + t),
                        (c.x + w - t, c.y + 0.001, c.z + hh - t), (c.x - w + t, c.y + 0.001, c.z + hh - t)], "Glass")
            l, r = on_face(-eu + 0.12, ev + 0.02, 0.012), on_face(eu - 0.12, ev + 0.02, 0.012)
            g.box(l.x, l.y - 0.003, l.z, r.x, l.y + 0.003, l.z + 0.005, "Gold", bottom=True)   # bridge
            extra = g.build()
        if key == "headline":                                # a raised fold down the middle of the paper
            g = rj.Part("mask_headline_fold")
            for i in range(12):
                v0, v1 = 0.05 + i * 0.07, 0.05 + (i + 1) * 0.07
                a, b = on_face(0.0, v0, 0.003), on_face(0.0, v1, 0.003)
                g.box(a.x - 0.002, min(a.y, b.y) - 0.002, a.z, a.x + 0.002, max(a.y, b.y) + 0.002, b.z, "Black", bottom=True)
            extra = g.build()
        if extra:
            bpy.ops.object.select_all(action='DESELECT')
            ob.select_set(True); extra.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.join()
        ob["rj_bone"] = "Head"
        ob["rj_kind"] = "mask"
        ob["rj_mask"] = key
        ob["rj_name"] = NAMES[key]
        out[key] = ob
    return out, char_meshes


masks, char_meshes = build_masks()
manifest = {"lib": "masks", "glb": "assets/models/masks.glb", "pieces": []}
outdir = os.path.join(rj.PREVIEWS, "masks")
preview = os.environ.get("RJ_PREVIEW", "1") == "1"
for key, ob in masks.items():
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    manifest["pieces"].append({"name": f"mask_{key}", "kind": "mask", "cells": [1, 1], "tris": tris, "children": [],
                               "bounds": rj._gltf_bounds([ob]), "note": f"{NAMES[key]}; wear on the Head bone (see masks_build.py)"})
if preview:
    cam = rj.setup_render((400, 400))
    # the face mask texture under the 3D mask is hidden, as the game will do
    for m in bpy.data.materials:
        if m.name == "RJ_Mask":
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            b.inputs['Alpha'].default_value = 0.0
            try: m.surface_render_method = 'BLENDED'
            except Exception: pass
    for key, ob in masks.items():
        for o in masks.values():
            o.hide_render = o is not ob
        # worn: head and shoulders, from the loadout angle
        for c in char_meshes: c.hide_render = False
        lo, hi = rj._world_bounds([ob])
        box = rj.Part("RJ_Bust"); box.box(lo.x - 0.2, lo.y - 0.1, lo.z - 0.35, hi.x + 0.2, hi.y + 0.25, hi.z + 0.15, "Glass")
        bo = box.build(); bo.hide_render = True
        rj.frame(cam, [bo], elev=8, azim=-25, pad=1.0)
        bpy.data.objects.remove(bo, do_unlink=True)
        rj.render(os.path.join(outdir, f"mask_{key}_worn.png"))
        # alone, straight on
        for c in char_meshes: c.hide_render = True
        rj.frame(cam, [ob], elev=5, azim=-15, pad=1.15)
        rj.render(os.path.join(outdir, f"mask_{key}.png"))
    # contact sheet: worn shots (kind "preview", skipped by the asset table), then each mask alone
    tris_of = {p["name"]: p["tris"] for p in manifest["pieces"]}
    manifest["pieces"] = [{"name": f"mask_{k}_worn", "kind": "preview", "cells": [1, 1], "tris": tris_of[f"mask_{k}"],
                           "children": [], "bounds": {}, "note": ""} for k in masks] + manifest["pieces"]
# export only the masks
for c in [o for o in bpy.data.objects if o.name not in [m.name for m in masks.values()]]:
    bpy.data.objects.remove(c, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in masks.values():
    ob.hide_render = False
    ob.select_set(True)
bpy.context.view_layer.objects.active = next(iter(masks.values()))
path = os.path.join(rj.MODELS, "masks.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_extras=True, export_cameras=False, export_lights=False, export_animations=False, **rj.COMPRESS)
manifest["bytes"] = os.path.getsize(path)
os.makedirs(outdir, exist_ok=True)
json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1)
print(f"RJ_DONE masks: {len(masks)} masks, {manifest['bytes']} bytes")
