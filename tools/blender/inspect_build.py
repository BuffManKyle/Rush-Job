"""Inspection sheets for generated models (Meshy) -> reference-images/previews/inspect_sheet.png

    py tools/blender/build.py inspect

For every GLB in assets/gen/meshy/ (or RJ_INSPECT=path1;path2): import it, report triangles,
height, lowest point and facing, and render front, side and the game's 55-degree camera beside
the stand-in player for scale. Exports nothing; this is the gate before paying for the next stage.
"""
import glob, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import rj

files = os.environ.get("RJ_INSPECT", "")
files = files.split(";") if files else sorted(glob.glob(os.path.join(rj.ROOT, "assets", "gen", "meshy", "*.glb")))
outdir = os.path.join(rj.PREVIEWS, "inspect")
os.makedirs(outdir, exist_ok=True)
manifest = {"lib": "inspect", "glbs": [], "pieces": [], "bytes": 0}
rj._reset_scene()
cam = rj.setup_render((400, 400))
ref = bpy.data.objects.get("RJ_ScaleRef")
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    lo, hi = rj._world_bounds(meshes)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    base = os.path.splitext(os.path.basename(f))[0]
    info = f"{tris} tris, h {hi.z - lo.z:.2f} m, low z {lo.z:.2f}, w {hi.x - lo.x:.2f} d {hi.y - lo.y:.2f}"
    print(f"RJ_INSPECT {base}: {info}")
    # 1.8 m reference post beside it
    post = rj.Part("RJ_ScaleRef")
    post.box(hi.x + 0.2, -0.05, 0, hi.x + 0.3, 0.05, 1.8, "Danger")
    post_ob = post.build()
    for view, (el, az) in {"front": (5, 0), "side": (5, 90), "game": (55, 0), "back": (10, 180)}.items():
        rj.frame(cam, meshes + [post_ob], elev=el, azim=az, pad=1.15)
        name = f"{base}_{view}"
        rj.render(os.path.join(outdir, name + ".png"))
        manifest["pieces"].append({"name": name, "kind": "inspect", "cells": [1, 1], "tris": tris,
                                   "children": [], "bounds": {}, "note": info})
    for o in new + [post_ob]:
        bpy.data.objects.remove(o, do_unlink=True)
with open(os.path.join(outdir, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=1)
print(f"RJ_DONE inspect: {len(files)} files")
