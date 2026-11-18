"""Import the Meshy characters into the game's conventions -> assets/models/char_<name>.glb

    py tools/blender/build.py meshy

Input: the files tools/gen/meshy.py saved in assets/gen/meshy/ (rigged mesh + one GLB per library
clip). Each character KEEPS ITS OWN MESHY RIG (no retargeting). This script:
  * puts the feet on y = 0, facing +Z, 1.8 m tall, and downsizes the texture to 1024 px JPEG;
  * renames library clips to the game's clip names and strips their net travel (the sim moves
    the root; bob and sway stay);
  * scripts the clips the library doesn't have, on the same rig: hands_up (arms raised, a slight
    tremble) and crouch_idle (the crouch walk's first pose, held);
  * names the material RJ_Char_<name> and writes userData.rj_attach = {"hand_R": "RightHand", ...}
    so game code finds attach points by role.
"""
import json, math, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Quaternion
import rj

GEN = os.path.join(rj.ROOT, "assets", "gen", "meshy")
FPS = 30
ATTACH = {"hand_R": "RightHand", "hand_L": "LeftHand", "head": "Head", "spine": "Spine02", "hips": "Hips"}
# game clip name -> source file suffix in assets/gen/meshy (pilot-<char>-<suffix>.glb)
CHARS = {
    "player": {"idle": "idle_animation_glb_url", "walk": "rig_walking_armature_glb_url",
               "run": "rig_running_armature_glb_url", "crouch_walk": "crouch_walk_animation_glb_url",
               "carry_walk": "carry_walk_animation_glb_url", "aim_shoot": "aim_shoot_animation_glb_url",
               "interact": "interact_animation_glb_url"},
    "guard": {"idle": "idle_animation_glb_url", "walk": "rig_walking_armature_glb_url",
              "run": "rig_running_armature_glb_url", "aim_shoot": "aim_shoot_animation_glb_url",
              "ziptied": "ziptied_animation_glb_url"},
}
LOCOMOTION = {"walk", "run", "crouch_walk", "carry_walk", "aim_shoot"}


def fcurves(act):
    """All F-curves of an action, for both legacy and slotted (4.4+) actions."""
    out = []
    try:
        out += list(act.fcurves)
    except AttributeError:
        pass
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                out += list(bag.fcurves)
    return out


def import_glb(path):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before_o], [a for a in bpy.data.actions if a not in before_a]


def detrend_root(act):
    """Remove net travel from the hips' location curves (keeps the bob)."""
    for fc in fcurves(act):
        if fc.data_path.endswith('"Hips"].location') or ('Hips' in fc.data_path and fc.data_path.endswith('location')):
            kp = fc.keyframe_points
            if len(kp) < 2:
                continue
            (f0, v0), (f1, v1) = kp[0].co[:], kp[-1].co[:]
            if f1 == f0:
                continue
            for k in kp:
                t = (k.co[0] - f0) / (f1 - f0)
                d = (v1 - v0) * t
                k.co[1] -= d; k.handle_left[1] -= d; k.handle_right[1] -= d
            fc.update()


def hold_first_pose(src, name):
    act = src.copy(); act.name = name
    for fc in fcurves(act):
        v = fc.evaluate(fc.keyframe_points[0].co[0]) if len(fc.keyframe_points) else 0
        f0 = fc.keyframe_points[0].co[0]
        for k in fc.keyframe_points:
            k.co[1] = v; k.handle_left[1] = v; k.handle_right[1] = v
        fc.update()
    return act


def hands_up(rig, name):
    """Arms raised above the head, elbows slightly bent, a small tremble; 1.5 s loop."""
    act = bpy.data.actions.new(name)
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = act
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    n = int(1.5 * FPS)
    for f in range(0, n + 1, 3):
        w = math.sin(2 * math.pi * 2 * f / n) * 0.03
        for side, sx in (("Left", 1), ("Right", -1)):
            for bone, target in ((f"{side}Arm", Vector((0.32 * sx, 0.05, 1.0))), (f"{side}ForeArm", Vector((0.12 * sx, -0.12, 1.0)))):
                b = pb[bone]
                rest = b.bone.matrix_local.to_3x3()
                cur_dir = (rest @ Vector((0, 1, 0))).normalized()
                # parent's posed rotation (in armature space) so the target is reached in world terms
                par = b.parent
                par_rot = (par.matrix.to_3x3() @ par.bone.matrix_local.to_3x3().inverted()) if par else rest.inverted() @ rest
                want = (target + Vector((w * sx, 0, 0))).normalized()
                q_arm = (par_rot @ cur_dir).rotation_difference(want)
                full = q_arm.to_matrix() @ par_rot @ rest
                local = (par_rot @ rest).inverted() @ full
                b.rotation_quaternion = local.to_quaternion()
                bpy.context.view_layer.update()
                b.keyframe_insert("rotation_quaternion", frame=f + 1)
        sp = pb["Spine02"]; sp.rotation_quaternion = Quaternion((1, 0, 0), -0.08 + w); sp.keyframe_insert("rotation_quaternion", frame=f + 1)
        bpy.context.view_layer.update()
    ad.action = None
    return act


MASKED = {"player"}       # characters whose mask the game hides while casing


def split_mask(mesh, name):
    """Give the mask its own material RJ_Mask (same texture), and put a skin-toned face (RJ_Face)
    4 mm behind it, so the game can hide RJ_Mask while the player is unmasked without leaving a
    hole. Mask faces = light, unsaturated texels on the front of the head."""
    import bmesh
    import numpy as np
    me = mesh.data
    base = me.materials[0]
    img = next(n.image for n in base.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)
    mw = mesh.matrix_world
    lo, hi = rj._world_bounds([mesh])
    height = hi.z - lo.z
    uv = me.uv_layers.active.data

    def texel(p):
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        return px[min(h - 1, int(v * h)) % h, min(w - 1, int(u * w)) % w, :3]

    def head(p, z_frac):
        c = mw @ p.center
        return c.z > lo.z + z_frac * height and (mw.to_3x3() @ p.normal).normalized().y < 0.5

    # seeds: bright, grey-white faces on the front of the head
    seeds = [p.index for p in me.polygons if head(p, 0.8)
             and min(texel(p)) > 0.5 and max(texel(p)) - min(texel(p)) < 0.12]
    # grow across edges into connected pale faces (the shaded chin and edges), stopping at the
    # dark hood and suit
    edge_faces = {}
    for p in me.polygons:
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(p.index)
    picks, todo = set(seeds), list(seeds)
    while todo:
        p = me.polygons[todo.pop()]
        for ek in p.edge_keys:
            for q in edge_faces[ek]:
                if q in picks:
                    continue
                qp = me.polygons[q]
                t = texel(qp)
                if head(qp, 0.72) and min(t) > 0.28 and max(t) - min(t) < 0.16:
                    picks.add(q); todo.append(q)
    picks = sorted(picks)
    if len(picks) < 20:
        raise SystemExit(f"mask split for {name}: only {len(picks)} light faces found; check the threshold")
    mask_mat = base.copy(); mask_mat.name = "RJ_Mask"
    face_mat = bpy.data.materials.new("RJ_Face")
    try: face_mat.use_nodes = True
    except Exception: pass
    bsdf = next(n for n in face_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rj.srgb_to_lin(rj.PAL["skin"]), 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    me.materials.append(mask_mat); me.materials.append(face_mat)
    mi_mask, mi_face = len(me.materials) - 2, len(me.materials) - 1
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    faces = [bm.faces[i] for i in picks]
    for f in faces:
        f.material_index = mi_mask
    dup = bmesh.ops.duplicate(bm, geom=faces)           # keeps the deform weights
    new_faces = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMFace)]
    new_verts = {v for f in new_faces for v in f.verts}
    inv = mw.inverted().to_3x3()
    inset = inv @ Vector((0, 0.004, 0))                  # 4 mm toward the back of the head
    for v in new_verts:
        v.co += inset
    for f in new_faces:
        f.material_index = mi_face
    bm.to_mesh(me); bm.free(); me.update()
    print(f"RJ_MASK {name}: {len(picks)} faces -> RJ_Mask, face patch RJ_Face behind it")


def build(name, clips):
    rj._reset_scene()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    objs, _ = import_glb(os.path.join(GEN, f"pilot-{name}-rig_rigged_character_glb_url.glb"))
    rig = next(o for o in objs if o.type == 'ARMATURE')
    mesh = next(o for o in objs if o.type == 'MESH')
    for a in list(bpy.data.actions):            # the rig file's own 0.3 s clip: not used
        bpy.data.actions.remove(a)
    rig.name, mesh.name = f"{name}_rig", name
    # convention: feet at 0 (the rig's root sits there already; check and correct the object)
    bpy.context.view_layer.update()
    lo, hi = rj._world_bounds([mesh])
    root = rig if rig.parent is None else rig.parent
    root.location.z -= lo.z
    bpy.context.view_layer.update()
    lo, hi = rj._world_bounds([mesh])
    # material + texture
    for i, m in enumerate(mesh.data.materials):
        m.name = f"RJ_Char_{name}" + (f"_{i}" if i else "")
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > 1024:
                n.image.scale(1024, 1024)
    if name in MASKED:
        split_mask(mesh, name)
    # clips
    acts = {}
    for clip, suffix in clips.items():
        o2, a2 = import_glb(os.path.join(GEN, f"pilot-{name}-{suffix}.glb"))
        act = a2[0] if a2 else None
        for o in o2:
            bpy.data.objects.remove(o, do_unlink=True)
        if act is None:
            raise SystemExit(f"no action in pilot-{name}-{suffix}.glb")
        act.name = clip; act.use_fake_user = True
        if clip in LOCOMOTION:
            detrend_root(act)
        acts[clip] = act
    if "crouch_walk" in acts:
        acts["crouch_idle"] = hold_first_pose(acts["crouch_walk"], "crouch_idle")
    acts["hands_up"] = hands_up(rig, "hands_up")
    # attach every clip to the rig as muted NLA tracks so the exporter writes them all
    ad = rig.animation_data or rig.animation_data_create()
    for clip, act in acts.items():
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
    rig["rj_attach"] = json.dumps(ATTACH)
    rig["rj_source"] = "meshy"
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(rj.MODELS, f"char_{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_cameras=False, export_lights=False,
                              export_extras=True, export_image_format='JPEG', export_jpeg_quality=85)
    print(f"RJ_CHAR {name}: {tris} tris, h {hi.z - lo.z:.2f} m, clips {sorted(acts)}, {os.path.getsize(path)} bytes")
    return rig, mesh, sorted(acts), tris, path


manifest = {"lib": "meshy", "glbs": [], "pieces": [], "bytes": 0}
preview = os.environ.get("RJ_PREVIEW", "1") == "1"
outdir = os.path.join(rj.PREVIEWS, "meshy")
for name, clips in CHARS.items():
    rig, mesh, names, tris, path = build(name, clips)
    manifest["glbs"].append(os.path.relpath(path, rj.ROOT).replace("\\", "/"))
    manifest.setdefault("chars", {})[name] = {"clips": names, "tris": tris}
    if preview:
        cam = rj.setup_render((400, 400))
        ad = rig.animation_data
        for clip in names:
            act = bpy.data.actions[clip]
            for t in ad.nla_tracks: t.mute = True
            ad.action = act
            if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
                ad.action_slot = act.slots[0]
            f0, f1 = act.frame_range
            bpy.context.scene.frame_set(int(f0 + (f1 - f0) * 0.3))
            bpy.context.view_layer.update()
            rj.frame(cam, [mesh], elev=30, azim=-35, pad=1.3)
            rj.render(os.path.join(outdir, f"{name}_{clip}.png"))
            manifest["pieces"].append({"name": f"{name}_{clip}", "kind": "char", "cells": [1, 1], "tris": tris,
                                       "children": [], "bounds": {}, "note": ""})
        ad.action = None
        if name in MASKED:                     # masked vs unmasked head close-ups (preview only)
            bpy.context.scene.frame_set(1)
            mm = bpy.data.materials["RJ_Mask"]
            bs = next(n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            head = rj._world_bounds([mesh]); top = head[1].z
            for label, alpha in (("masked", 1.0), ("unmasked", 0.0)):
                bs.inputs['Alpha'].default_value = alpha
                try: mm.surface_render_method = 'BLENDED' if alpha < 1 else 'DITHERED'
                except Exception: pass
                post = rj.Part("RJ_HeadFrame")
                post.box(-0.25, -0.25, top - 0.45, 0.25, 0.25, top, "Glass")
                pf = post.build(); pf.hide_render = True
                rj.frame(cam, [pf], elev=10, azim=-20, pad=1.0)
                bpy.data.objects.remove(pf, do_unlink=True)
                rj.render(os.path.join(outdir, f"{name}_{label}.png"))
                manifest["pieces"].append({"name": f"{name}_{label}", "kind": "char", "cells": [1, 1], "tris": tris,
                                           "children": [], "bounds": {}, "note": ""})
            bs.inputs['Alpha'].default_value = 1.0
            try: mm.surface_render_method = 'DITHERED'
            except Exception: pass
manifest["bytes"] = sum(os.path.getsize(os.path.join(rj.ROOT, g)) for g in manifest["glbs"])
os.makedirs(outdir, exist_ok=True)
json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1)
print(f"RJ_DONE meshy: {len(CHARS)} characters, {manifest['bytes']} bytes")
