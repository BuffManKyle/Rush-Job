"""Rush Job armor vests -> assets/models/vests.glb

    py tools/blender/build.py vests

The light and heavy vest from src/data/loadout.ts (ARMORS), fitted to the Meshy player's torso:
the faces of assets/models/char_player.glb that the rig weights mostly to the spine bones, between
the hips and the neck, pushed outward and painted by a cylindrical projection (flat colours), plus 3D
plates, pouches and shoulder pads on the heavy vest.

    vest_light   slim navy vest, black side straps, a steel zip: +50 armor, no speed cost
    vest_heavy   plate carrier: dark steel shell, raised front and back plates, pouches,
                 shoulder pads and a collar: +100 armor, slower, and it shows

Same contract as masks.glb: the character's model space (rest pose, feet at 0, facing +Z),
userData.rj_bone = "Spine01". To wear one (three.js):
    const b = player.getObjectByName('Spine01'); const sk = skinnedMesh.skeleton;
    vest.applyMatrix4(sk.boneInverses[sk.bones.indexOf(b)]); b.add(vest);
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import rj

SRC = os.path.join(rj.ROOT, "assets", "models", "char_player.glb")
BONE = "Spine01"
SPINE = {"Spine", "Spine01", "Spine02"}
TEX = 512


NA, NZ = 16, 9          # angles around, rings up


def load_body():
    """The character in rest pose: a BVH of its body surface, the spine axis, and the meshes."""
    rj._reset_scene()
    bpy.ops.import_scene.gltf(filepath=SRC)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.data.pose_position = 'REST'
    if rig.animation_data:
        rig.animation_data.action = None
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bm = bmesh.new()
    for ob in meshes:
        me, mw = ob.data, ob.matrix_world
        vs = [bm.verts.new(mw @ v.co) for v in me.vertices]
        for p in me.polygons:
            if me.materials and me.materials[p.material_index].name.startswith("RJ_Char_player"):
                try:
                    bm.faces.new([vs[i] for i in p.vertices])
                except ValueError:
                    pass
    tree = BVHTree.FromBMesh(bm)
    bones = {b.name: rig.matrix_world @ b.head_local for b in rig.data.bones}
    return tree, meshes, bones


def torso_grid(tree, bones, push_fn):
    """Rings around the torso from the belt line to under the collar. Radius = outermost body surface
    (past the shirt and lapels), then smoothed outward so the vest drapes over the lapels instead of
    following every fold, then pushed out by the vest's thickness."""
    hips, neck = bones["Hips"], bones["neck"]
    z0, z1 = hips.z - 0.04, neck.z - 0.06
    R, axes = [], []
    for j in range(NZ):
        t = j / (NZ - 1)
        z = z0 + t * (z1 - z0)
        ax = hips.lerp(neck, max(0.0, (z - hips.z) / (neck.z - hips.z)))
        o = Vector((ax.x, ax.y, z))
        row, last = [], 0.15
        for i in range(NA):
            th = -math.pi + 2 * math.pi * i / NA
            d = Vector((math.sin(th), -math.cos(th), 0))
            r, q = None, o.copy()
            for _ in range(8):
                hit = tree.ray_cast(q, d, 0.3)
                if not hit[0] or (hit[0] - o).length > 0.3:
                    break
                r = (hit[0] - o).length
                q = hit[0] + d * 0.002
            r = r if r is not None else last
            last = r
            row.append(r)
        R.append(row); axes.append(o)
    # smooth outward: a local max over neighbours (covers lapels), then two passes of averaging
    M = [[max(R[jj][(i + di) % NA] for jj in range(max(0, j - 1), min(NZ, j + 2)) for di in (-1, 0, 1))
          for i in range(NA)] for j in range(NZ)]
    for _ in range(2):
        M = [[max(R[j][i], (M[j][(i - 1) % NA] + 2 * M[j][i] + M[j][(i + 1) % NA]) / 4) for i in range(NA)]
             for j in range(NZ)]
        M = [[max(R[j][i], (M[max(0, j - 1)][i] + 2 * M[j][i] + M[min(NZ - 1, j + 1)][i]) / 4) for i in range(NA)]
             for j in range(NZ)]
    rings = []
    for j in range(NZ):
        t = j / (NZ - 1)
        ring = []
        for i in range(NA + 1):                      # last column repeats the first (texture seam)
            th = -math.pi + 2 * math.pi * i / NA
            d = Vector((math.sin(th), -math.cos(th), 0))
            ring.append((axes[j] + d * (M[j][i % NA] + push_fn(th, t)), th, t))
        rings.append(ring)
    return rings, z0, z1


def cyl_uv(co, cx, cy, z0, z1):
    """theta 0 = front (-Y), +-pi = back; t 0 = bottom .. 1 = top of the vest."""
    return math.atan2(co.x - cx, -(co.y - cy)), (co.z - z0) / (z1 - z0)


def designs():
    def light(th, t):
        a = abs(th)
        if abs(a - math.pi / 2) < 0.16:
            return "black"                                   # side straps
        if a < 0.035:
            return "steel"                                   # zip
        if t > 0.92:
            return "black"                                   # binding along the top edge
        if t < 0.06:
            return "black"                                   # binding along the hem
        return "navy"

    def heavy(th, t):
        a = abs(th)
        if t > 0.9 or t < 0.07:
            return "black"
        if abs(a - math.pi / 2) < 0.28 and 0.12 < t < 0.7:
            return "black"                                   # cummerbund
        if (a < 0.75 or a > math.pi - 0.75) and 0.2 < t < 0.85:
            return "navy_light"                              # plate panels (front and back)
        return "steel_dark"
    return {"light": light, "heavy": heavy}


def paint(key, fn):
    import numpy as np
    cache = {}
    arr = np.zeros((TEX, TEX, 4), dtype=np.float32)
    for j in range(TEX):
        t = (j + 0.5) / TEX
        for i in range(TEX):
            th = ((i + 0.5) / TEX * 2 - 1) * math.pi
            c = fn(th, t)
            if c not in cache:
                h = rj.PAL[c]
                cache[c] = [int(h[k:k + 2], 16) / 255 for k in (1, 3, 5)] + [1.0]
            arr[j, i] = cache[c]
    img = bpy.data.images.new(f"vest_{key}_paint", TEX, TEX, alpha=False)
    img.pixels[:] = arr.ravel()
    path = os.path.join(rj.PREVIEWS, "vests", f"vest_{key}_paint.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    m = bpy.data.materials.new(f"RJ_Vest_{key}")
    try: m.use_nodes = True
    except Exception: pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    tx = m.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Closest'
    m.node_tree.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    b.inputs['Metallic'].default_value = 0.0
    return m


def plate(th, t):
    a = abs(th)
    return (a < 0.75 or a > math.pi - 0.75) and 0.2 < t < 0.85


def build():
    tree, char_meshes, bones = load_body()
    out = {}
    for key, fn in designs().items():
        push = (lambda th, t: 0.012) if key == "light" else (lambda th, t: 0.04 if plate(th, t) else 0.025)
        rings, z0, z1 = torso_grid(tree, bones, push)
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        V = [[bm.verts.new(p) for p, _, _ in ring] for ring in rings]
        for j in range(NZ - 1):
            for i in range(NA):
                f = bm.faces.new([V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]])
                f.smooth = False
                for l, (jj, ii) in zip(f.loops, ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))):
                    l[uvl].uv = (ii / NA, jj / (NZ - 1))
        bm.normal_update()
        if sum(f.normal.dot(f.calc_center_median() - Vector((bones["Hips"].x, bones["Hips"].y, f.calc_center_median().z)))
               for f in bm.faces) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])   # make the faces point outward
        me = bpy.data.meshes.new(f"vest_{key}")
        bm.to_mesh(me); bm.free()
        me.materials.append(paint(key, fn))
        ob = bpy.data.objects.new(f"vest_{key}", me)
        bpy.context.scene.collection.objects.link(ob)
        # shoulder straps (both vests), pouches/pads/collar (heavy): 3D extras
        g = rj.Part(f"vest_{key}_kit")
        ax = bones["Hips"].lerp(bones["neck"], 0.8)

        def over_shoulder(x, off, phi0=0.0, phi1=math.pi, n=10):
            """Points on the outermost body surface along an arc over the shoulder at this x:
            phi 0 = straight forward, pi/2 = up, pi = straight back (rays from inside the body)."""
            pts = []
            o = Vector((x, ax.y, z1 - 0.06))
            for k in range(n + 1):
                ph = phi0 + (phi1 - phi0) * k / n
                d = Vector((0, -math.cos(ph), math.sin(ph)))
                r, q = None, o.copy()
                for _ in range(8):
                    hit = tree.ray_cast(q, d, 0.25)
                    if not hit[0] or (hit[0] - o).length > 0.25:
                        break
                    r = (hit[0] - o).length
                    q = hit[0] + d * 0.002
                pt = o + d * ((r or 0.12) + off)
                cap = bones["neck"].z + 0.02 + off      # the shoulder line: never ride up onto the hood
                if pt.z > cap:
                    pt = Vector((pt.x, pt.y, cap))
                pts.append((pt, d))
            return pts

        def strip(pts, w, mat):
            for (a, da), (b, db) in zip(pts, pts[1:]):
                quad = [a + Vector((-w, 0, 0)), a + Vector((w, 0, 0)), b + Vector((w, 0, 0)), b + Vector((-w, 0, 0))]
                n = (quad[1] - quad[0]).cross(quad[2] - quad[1])
                if n.dot(da) < 0:
                    quad.reverse()
                g.quad([tuple(q) for q in quad], mat)

        w = 0.028 if key == "light" else 0.042
        col = "Black" if key == "light" else "SteelDark"
        for sgn in (-1, 1):
            x = ax.x + sgn * 0.14
            strip(over_shoulder(x, 0.012 if key == "light" else 0.022), w, col)          # strap, front to back
            if key == "heavy":
                strip(over_shoulder(x, 0.035, math.pi * 0.3, math.pi * 0.7, 4), 0.06, "SteelDark")  # shoulder pad
        if key == "heavy":
            fr = lambda t: min(rings[min(NZ - 1, int(round(t * (NZ - 1))))], key=lambda q: abs(q[1]))[0]
            pz = fr(0.33)
            for x in (-0.1, 0.0, 0.1):                       # three mag pouches across the front plate
                g.box(pz.x + x - 0.042, pz.y - 0.04, pz.z - 0.06, pz.x + x + 0.042, pz.y + 0.005, pz.z + 0.05, "Fabric", bottom=True)
                g.box(pz.x + x - 0.044, pz.y - 0.045, pz.z + 0.03, pz.x + x + 0.044, pz.y + 0.005, pz.z + 0.055, "Black", bottom=True)
            rz = fr(0.72)
            g.box(rz.x - 0.13, rz.y - 0.04, rz.z - 0.04, rz.x - 0.07, rz.y + 0.005, rz.z + 0.04, "Black", bottom=True)  # radio
            g.cyl(rz.x - 0.09, rz.y - 0.02, rz.z + 0.04, rz.z + 0.11, 0.005, "Black", seg=4)
        k = g.build()
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); k.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
        # every material on this vest starts with RJ_Vest_<key>, so the game can show/hide the whole
        # vest (shell, straps, pouches) by material name when it is skinned into char_player
        for i, m in enumerate(ob.data.materials):
            if not m.name.startswith(f"RJ_Vest_{key}"):
                c = m.copy(); c.name = f"RJ_Vest_{key}_{m.name[3:]}"
                ob.data.materials[i] = c
        ob["rj_bone"] = BONE
        ob["rj_kind"] = "vest"
        ob["rj_armor"] = {"light": "light_vest", "heavy": "heavy_vest"}[key]
        out[key] = ob
        print(f"RJ_VEST {key}: z {z0:.2f}-{z1:.2f} m, {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris")
    return out, char_meshes


vests, char_meshes = build()
manifest = {"lib": "vests", "glb": "assets/models/vests.glb", "pieces": []}
outdir = os.path.join(rj.PREVIEWS, "vests")
for key, ob in vests.items():
    manifest["pieces"].append({"name": f"vest_{key}", "kind": "vest", "cells": [1, 1],
                               "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), "children": [],
                               "bounds": rj._gltf_bounds([ob]), "note": f"armor {ob['rj_armor']}; wear on the {BONE} bone"})
if os.environ.get("RJ_PREVIEW", "1") == "1":
    cam = rj.setup_render((400, 400))
    worn = []
    for key, ob in vests.items():
        for o in vests.values():
            o.hide_render = o is not ob
        for c in char_meshes:
            c.hide_render = False
        for az, tag in ((-30, "worn"), (150, "back")):
            lo, hi = rj._world_bounds([ob])
            bx = rj.Part("RJ_Frame"); bx.box(lo.x - 0.3, lo.y - 0.2, lo.z - 0.3, hi.x + 0.3, hi.y + 0.2, hi.z + 0.45, "Glass")
            fo = bx.build(); fo.hide_render = True
            rj.frame(cam, [fo], elev=10, azim=az, pad=1.0)
            bpy.data.objects.remove(fo, do_unlink=True)
            rj.render(os.path.join(outdir, f"vest_{key}_{tag}.png"))
            worn.append({"name": f"vest_{key}_{tag}", "kind": "preview", "cells": [1, 1], "tris": 0,
                         "children": [], "bounds": {}, "note": ""})
        for c in char_meshes:
            c.hide_render = True
        rj.frame(cam, [ob], elev=15, azim=-30, pad=1.15)
        rj.render(os.path.join(outdir, f"vest_{key}.png"))
    manifest["pieces"] = worn + manifest["pieces"]
for c in [o for o in bpy.data.objects if o.name not in [v.name for v in vests.values()]]:
    bpy.data.objects.remove(c, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in vests.values():
    ob.hide_render = False
    ob.select_set(True)
bpy.context.view_layer.objects.active = next(iter(vests.values()))
path = os.path.join(rj.MODELS, "vests.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_extras=True, export_cameras=False, export_lights=False, export_animations=False, **rj.COMPRESS)
manifest["bytes"] = os.path.getsize(path)
json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1)
print(f"RJ_DONE vests: {len(vests)} vests, {manifest['bytes']} bytes")
