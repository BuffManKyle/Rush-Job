"""Meshy civilian cast -> assets/models/char_civ_<name>.glb   (owner: rj-street)

    py tools/blender/build.py civs

Input: what tools/gen/civ_batch.py bought into assets/gen/meshy/ (civ-<name>-*.glb). Uses the pilot
importer in meshy_build.py (same conventions: own Meshy rig, feet at 0, facing +Z, 1024 px texture,
renamed clips with root travel stripped, scripted hands_up), then adds a scripted `cower` clip
(hunched, forearms over the head, trembling) on the same rig. Characters whose files aren't there
yet are skipped, so this library builds (empty) before anything is bought.
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Quaternion, Vector
import rj
import meshy_build as mb

CAST = ["clerk", "manager", "cust_elder", "cust_young", "cust_coat", "cust_suit",
        "ped_teen", "ped_courier", "ped_oldman", "ped_woman"]
CLIPS = {"idle": "idle_animation_glb_url", "walk": "rig_walking_armature_glb_url",
         "run": "rig_running_armature_glb_url", "ziptied": "ziptied_animation_glb_url"}


def aim_bone(pb, bone, want):
    """Rotate a pose bone so its Y axis points along `want` (armature space), given its parent's pose."""
    b = pb[bone]
    rest = b.bone.matrix_local.to_3x3()
    par = b.parent
    par_rot = (par.matrix.to_3x3() @ par.bone.matrix_local.to_3x3().inverted()) if par else rest.inverted() @ rest
    cur = (par_rot @ rest @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(want.normalized())
    full = q.to_matrix() @ par_rot @ rest
    b.rotation_quaternion = ((par_rot @ rest).inverted() @ full).to_quaternion()
    bpy.context.view_layer.update()


def cower(rig, name="cower"):
    """Hunched over, forearms crossed above the head, a tremble; 1.2 s loop. Armature space is
    Z-up with the figure facing -Y (Blender), so 'forward' is -Y."""
    act = bpy.data.actions.new(name)
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = act
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    n = int(1.2 * mb.FPS)
    for f in range(0, n + 1, 3):
        w = math.sin(2 * math.pi * 3 * f / n) * 0.035
        for bone, ang in (("Spine", 0.18), ("Spine01", 0.22), ("Spine02", 0.2), ("neck", 0.25)):
            if bone in pb:
                pb[bone].rotation_quaternion = Quaternion((1, 0, 0), ang + w * 0.5)
                bpy.context.view_layer.update()
                pb[bone].keyframe_insert("rotation_quaternion", frame=f + 1)
        for side, sx in (("Left", 1), ("Right", -1)):
            aim_bone(pb, f"{side}Arm", Vector((0.45 * sx + w * sx, -0.55, 0.75)))
            pb[f"{side}Arm"].keyframe_insert("rotation_quaternion", frame=f + 1)
            aim_bone(pb, f"{side}ForeArm", Vector((-0.9 * sx, -0.25, 0.25 + w)))
            pb[f"{side}ForeArm"].keyframe_insert("rotation_quaternion", frame=f + 1)
    ad.action = None
    return act


def add_clip(rig, act, clip):
    ad = rig.animation_data or rig.animation_data_create()
    act.use_fake_user = True
    ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    tr = ad.nla_tracks.new(); tr.name = clip
    st = tr.strips.new(clip, int(act.frame_range[0]), act)
    if hasattr(st, "action_slot") and len(getattr(act, "slots", [])):
        st.action_slot = act.slots[0]
    tr.mute = True
    ad.action = None


manifest = {"lib": "civs", "glbs": [], "pieces": [], "bytes": 0}
outdir = os.path.join(rj.PREVIEWS, "civs")
os.makedirs(outdir, exist_ok=True)
preview = os.environ.get("RJ_PREVIEW", "1") == "1"
built = 0
for name in CAST:
    need = [f"civ-{name}-rig_rigged_character_glb_url.glb"] + [f"civ-{name}-{s}.glb" for s in CLIPS.values()]
    if not all(os.path.exists(os.path.join(mb.GEN, f)) for f in need):
        print(f"RJ_SKIP civ {name}: not bought yet")
        continue
    rig, mesh, names, tris, path = mb.build(name, CLIPS, prefix="civ")
    add_clip(rig, cower(rig), "cower")
    for m in mesh.data.materials:              # 512 px is plenty for a civilian seen from 13-26 m up
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image and max(nd.image.size) > 512:
                nd.image.scale(512, 512)
    names = sorted(names + ["cower"])
    # re-export with the extra clip, under the civ name
    bpy.ops.object.select_all(action='DESELECT')
    for o in (rig, mesh):
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.remove(path)
    path = os.path.join(rj.MODELS, f"char_civ_{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_cameras=False, export_lights=False,
                              export_extras=True, export_image_format='JPEG', export_jpeg_quality=80, **rj.COMPRESS)
    manifest["glbs"].append(os.path.relpath(path, rj.ROOT).replace("\\", "/"))
    manifest.setdefault("chars", {})[f"civ_{name}"] = {"clips": names, "tris": tris}
    if preview:
        cam = rj.setup_render((400, 400))
        ad = rig.animation_data
        for clip in ("idle", "walk", "cower", "hands_up", "ziptied"):
            act = bpy.data.actions[clip]
            for t in ad.nla_tracks: t.mute = True
            ad.action = act
            if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
                ad.action_slot = act.slots[0]
            f0, f1 = act.frame_range
            bpy.context.scene.frame_set(int(f0 + (f1 - f0) * 0.3))
            bpy.context.view_layer.update()
            rj.frame(cam, [mesh], elev=30, azim=-35, pad=1.3)
            rj.render(os.path.join(outdir, f"civ_{name}_{clip}.png"))
            manifest["pieces"].append({"name": f"civ_{name}_{clip}", "kind": "char", "cells": [1, 1], "tris": tris,
                                       "children": [], "bounds": {}, "note": ""})
        ad.action = None
    built += 1
manifest["bytes"] = sum(os.path.getsize(os.path.join(rj.ROOT, g)) for g in manifest["glbs"])
json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1)
print(f"RJ_DONE civs: {built} characters, {manifest['bytes']} bytes")
