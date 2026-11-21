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
from mathutils import Vector, Quaternion, Matrix
from mathutils.kdtree import KDTree
import rj

GEN = os.path.join(rj.ROOT, "assets", "gen", "meshy")
FPS = 30
ATTACH = {"hand_R": "RightHand", "hand_L": "LeftHand", "head": "Head", "spine": "Spine02", "hips": "Hips",
          "grip_R": "hand_R_grip", "grip_L": "hand_L_grip"}
LOW_READY = 30          # degrees the held item's forward is tilted from "along the fingers" toward the front
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


VEST_BONES = {"Hips", "Spine", "Spine01", "Spine02", "neck", "LeftShoulder", "RightShoulder"}


def add_vests(mesh):
    """Skin the fitted vests (assets/models/vests.glb) into this mesh as extra primitives with
    materials RJ_Vest_light / RJ_Vest_heavy, weighted like the nearest body vertices, so they bend
    with the torso. The game shows the one that is worn and hides the others by material name."""
    path = os.path.join(rj.MODELS, "vests.glb")
    if not os.path.exists(path):
        print("RJ_WARN no vests.glb yet; build vests, then meshy"); return
    objs, _ = import_glb(path)
    vests = [o for o in objs if o.type == 'MESH' and o.data.materials]
    for o in vests:                      # the importer may suffix names (.001); the game matches prefixes
        for m in o.data.materials:
            base = m.name.split(".")[0]
            if m.name != base:
                old = bpy.data.materials.get(base)
                if old and old is not m:
                    old.name = base + "_unused"
                m.name = base
    me, mw = mesh.data, mesh.matrix_world
    body = {i for p in me.polygons if me.materials[p.material_index].name.startswith("RJ_Char_") for i in p.vertices}
    kd = KDTree(len(body))
    for i in body:
        kd.insert(mw @ me.vertices[i].co, i)
    kd.balance()
    gname = {g.index: g.name for g in mesh.vertex_groups}
    for vo in vests:
        vo.vertex_groups.clear()
        groups = {}
        for v in vo.data.vertices:
            acc = {}
            for co, idx, d in kd.find_n(vo.matrix_world @ v.co, 4):
                for g in me.vertices[idx].groups:
                    n = gname[g.group]
                    if n in VEST_BONES:          # torso and shoulders only: arms must not crush the vest
                        acc[n] = acc.get(n, 0) + g.weight
            if not acc:
                acc = {"Spine01": 1.0}
            tot = sum(acc.values()) or 1
            for n, w in acc.items():
                if w / tot >= 0.05:
                    if n not in groups:
                        groups[n] = vo.vertex_groups.new(name=n)
                    groups[n].add([v.index], w / tot, 'REPLACE')
    for o in objs:
        if o not in vests:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for vo in vests:
        vo.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    print(f"RJ_VESTS skinned into {mesh.name}: {[m.name for m in mesh.data.materials if m.name.startswith('RJ_Vest')]}")


GRIP_R = 0.024          # radius of the curl = half a gun grip's thickness (gear is built ~1.25x)
CURL_MAX = 3.6          # radians: fingertips end up back against the palm side of the grip


def hand_frame(rig, mesh, side):
    """Measure one hand in rest pose (world space): wrist W, along-fingers F, thumb side T (forward),
    palm normal P (toward the body), the hand's vertex indices, its length and its centre across T."""
    me, mw = mesh.data, mesh.matrix_world
    bone = "RightHand" if side == "R" else "LeftHand"
    gi = mesh.vertex_groups[bone].index
    idx = [v.index for v in me.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    pts = [mw @ me.vertices[i].co for i in idx]
    c = sum(pts, Vector()) / len(pts)
    w = rig.matrix_world @ rig.data.bones[bone].head_local
    f = (c - w).normalized()
    fwd = Vector((0, -1, 0))
    t = (fwd - f * f.dot(fwd)).normalized()
    p = f.cross(t).normalized()
    if p.x * (-c.x) < 0:                                     # palm faces the body
        p = -p
    length = max((q - w).dot(f) for q in pts)
    mid_t = sum((q - w).dot(t) for q in pts) / len(pts)
    return dict(W=w, F=f, T=t, P=p, idx=idx, L=length, mid_t=mid_t, bone=bone)


def knuckle(h):
    return h["W"] + h["F"] * (0.45 * h["L"])


def add_fists(rig, mesh):
    """Shape keys fist_R / fist_L (glTF morph targets): the fingers past the knuckles curl around a
    GRIP_R cylinder on the palm side, so a held gun or bag handle sits in a closed hand. The Meshy
    rig has no finger bones, so this is a blend shape the game sets to 1 while the hand holds something."""
    me, mw = mesh.data, mesh.matrix_world
    inv = mw.inverted()
    if not me.shape_keys:
        mesh.shape_key_add(name="Basis", from_mix=False)
    for side in ("R", "L"):
        h = hand_frame(rig, mesh, side)
        k = knuckle(h)
        sk = mesh.shape_key_add(name=f"fist_{side}", from_mix=False)
        moved = 0
        for i in h["idx"]:
            v = mw @ me.vertices[i].co
            a = (v - k).dot(h["F"])                              # along the fingers, past the knuckles
            if a <= 0:
                continue
            b = (v - k).dot(h["P"])                              # toward the palm
            c = (v - k).dot(h["T"])                              # across the hand
            thumb = c - (h["mid_t"] - (k - h["W"]).dot(h["T"])) > 0.035   # thumb side: curls less
            rc = GRIP_R
            phi = min(a / rc, CURL_MAX * (0.45 if thumb else 1.0))
            extra = max(0.0, a - phi * rc)                       # length past the full curl stays straight
            centre = k + h["P"] * rc
            radial = -h["P"] * (rc - b)
            new = centre + radial * math.cos(phi) + h["F"] * (rc - b) * math.sin(phi) + h["T"] * c
            if extra:
                tang = h["F"] * math.cos(phi) + h["P"] * math.sin(phi)
                new += tang * extra
            sk.data[i].co = inv @ new
            moved += 1
        print(f"RJ_FIST {side}: curled {moved} of {len(h['idx'])} hand vertices")


def add_grips(rig, mesh):
    """Empty nodes hand_R_grip / hand_L_grip under the hand bones: origin on the axis the fist_*
    fingers curl around (in the palm, mid-hand), +Z (glTF) / -Y (Blender) = the held item's forward,
    tilted LOW_READY degrees from along-the-fingers toward the front, +Y (glTF) = the thumb side.
    World scale 1, so a gear.glb item added with an identity transform sits in the closed hand."""
    out = []
    for side in ("R", "L"):
        h = hand_frame(rig, mesh, side)
        f, t = h["F"], h["T"]
        a = math.radians(LOW_READY)
        fb, tb = (f * math.cos(a) + t * math.sin(a)).normalized(), (t * math.cos(a) - f * math.sin(a)).normalized()
        y, z = -fb, tb                                       # gear forward is -Y in Blender
        x = y.cross(z)
        m = Matrix((x, y, z)).transposed().to_4x4()
        k = knuckle(h)
        m.translation = k + h["P"] * GRIP_R + t * (h["mid_t"] - (k - h["W"]).dot(t))
        e = bpy.data.objects.new(f"hand_{side}_grip", None)
        e.empty_display_size = 0.05
        bpy.context.scene.collection.objects.link(e)
        e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = h["bone"]
        bpy.context.view_layer.update()
        e.matrix_world = m
        out.append(e)
    bpy.context.view_layer.update()
    return out


def level_aim(rig, act, grip, bone="RightHand"):
    """The library aim clip holds the hand ~35 degrees nose-up. On every frame, rotate the hand about
    the wrist so the held item's forward (grip -Y in Blender) is level, keeping where it points."""
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    pb = rig.pose.bones[bone]
    pb.rotation_mode = 'QUATERNION'
    f0, f1 = (int(round(x)) for x in act.frame_range)
    worst = 0.0
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        fw = (grip.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        flat = Vector((fw.x, fw.y, 0))
        if flat.length < 1e-4:
            continue
        flat.normalize()
        worst = max(worst, math.degrees(fw.angle(flat)))
        q = fw.rotation_difference(flat)                         # world-space correction
        bw = (rig.matrix_world @ pb.matrix).to_quaternion()     # the hand's current world rotation
        q_local = bw.inverted() @ q @ bw                         # the correction in the hand's own frame
        pb.rotation_quaternion = pb.rotation_quaternion @ q_local  # rotation only: location/scale untouched
        bpy.context.view_layer.update()
        pb.keyframe_insert("rotation_quaternion", frame=f)
    ad.action = None
    print(f"RJ_AIM levelled {act.name}: up to {worst:.0f} deg corrected over frames {f0}-{f1}")


def build(name, clips, prefix="pilot", max_tex=1024):
    rj._reset_scene()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    objs, _ = import_glb(os.path.join(GEN, f"{prefix}-{name}-rig_rigged_character_glb_url.glb"))
    rig = next(o for o in objs if o.type == 'ARMATURE')
    mesh = next(o for o in objs if o.type == 'MESH')
    for a in list(bpy.data.actions):            # the rig file's own 0.3 s clip: not used
        bpy.data.actions.remove(a)
    rig.name, mesh.name = f"{name}_rig", name
    for o in [o for o in objs if o.type == 'MESH' and o is not mesh]:   # importer's bone-shape icosphere
        bpy.data.objects.remove(o, do_unlink=True)
    objs = [rig, mesh]
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
            if n.type == 'TEX_IMAGE' and n.image and max_tex and max(n.image.size) > max_tex:
                n.image.scale(max_tex, max_tex)       # max_tex=None keeps the source (civs re-bake from it)
    if name in MASKED:
        split_mask(mesh, name)
    grips = []
    if name in MASKED:                    # the player: vests skinned in, measured grip points
        add_vests(mesh)
        add_fists(rig, mesh)
        grips = add_grips(rig, mesh)
        objs = [o for o in objs if o.name in bpy.data.objects] + grips
    # clips
    acts = {}
    for clip, suffix in clips.items():
        o2, a2 = import_glb(os.path.join(GEN, f"{prefix}-{name}-{suffix}.glb"))
        act = a2[0] if a2 else None
        for o in o2:
            bpy.data.objects.remove(o, do_unlink=True)
        if act is None:
            raise SystemExit(f"no action in {prefix}-{name}-{suffix}.glb")
        act.name = clip; act.use_fake_user = True
        if clip in LOCOMOTION:
            detrend_root(act)
        acts[clip] = act
    if "crouch_walk" in acts:
        acts["crouch_idle"] = hold_first_pose(acts["crouch_walk"], "crouch_idle")
    acts["hands_up"] = hands_up(rig, "hands_up")
    if grips and "aim_shoot" in acts:
        level_aim(rig, acts["aim_shoot"], bpy.data.objects["hand_R_grip"])
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
    rig["rj_attach"] = json.dumps({k: v for k, v in ATTACH.items() if grips or not k.startswith("grip")})
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
                              export_extras=True, export_image_format='JPEG', export_jpeg_quality=85,
                              export_try_sparse_sk=True, **rj.COMPRESS)
    print(f"RJ_CHAR {name}: {tris} tris, h {hi.z - lo.z:.2f} m, clips {sorted(acts)}, {os.path.getsize(path)} bytes")
    return rig, mesh, sorted(acts), tris, path


def show_mat(prefix, visible):
    """Preview only: show or hide every material starting with prefix (the game does this by name)."""
    for m in bpy.data.materials:
        if m.name.startswith(prefix):
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            b.inputs['Alpha'].default_value = 1.0 if visible else 0.0
            try: m.surface_render_method = 'DITHERED' if visible else 'BLENDED'
            except Exception: pass


def held_previews(rig, mesh, cam, outdir, manifest, tris):
    """The player holding every held gear.glb item on hand_R_grip (identity transform), idle and aiming,
    and wearing each vest."""
    grip = bpy.data.objects.get("hand_R_grip")
    gear_path = os.path.join(rj.MODELS, "gear.glb")
    if not grip or not os.path.exists(gear_path):
        return
    objs, _ = import_glb(gear_path)
    held = [o for o in objs if o.parent is None and o.get("rj_held")]
    for o in objs:
        o.hide_render = True
    ad = rig.animation_data
    show_mat("RJ_Vest", False)
    keys = mesh.data.shape_keys.key_blocks if mesh.data.shape_keys else {}
    if "fist_R" in keys:
        keys["fist_R"].value = 1.0
    shots = []
    for item in [o for o in held if o.name in ("pistol_silenced", "tranq_pistol", "smg_compact", "shotgun_pump", "stun_baton", "glass_cutter")]:
        item.parent = grip
        item.matrix_parent_inverse = Matrix.Identity(4)
        item.location, item.rotation_euler, item.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
        for o in [item] + list(item.children_recursive):
            o.hide_render = False
        for clip, t in (("idle", 0.3), ("aim_shoot", 0.5)):
            act = bpy.data.actions[clip]
            for tr in ad.nla_tracks: tr.mute = True
            ad.action = act
            if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
                ad.action_slot = act.slots[0]
            f0, f1 = act.frame_range
            bpy.context.scene.frame_set(int(f0 + (f1 - f0) * t))
            bpy.context.view_layer.update()
            rj.frame(cam, [mesh, item], elev=12, azim=-55 if clip == "idle" else -75, pad=1.08)
            nm = f"held_{item.name}_{clip}"
            rj.render(os.path.join(outdir, nm + ".png"))
            shots.append(nm)
            if item.name == "pistol_silenced":                  # close-up of the closed hand
                gp = grip.matrix_world.translation
                bx = rj.Part("RJ_HandFrame"); bx.box(gp.x - 0.13, gp.y - 0.13, gp.z - 0.13, gp.x + 0.13, gp.y + 0.13, gp.z + 0.13, "Glass")
                fo = bx.build(); fo.hide_render = True
                for az in (-60, 30):
                    rj.frame(cam, [fo], elev=10, azim=az, pad=1.0)
                    nm2 = f"held_{item.name}_{clip}_hand{az}"
                    rj.render(os.path.join(outdir, nm2 + ".png"))
                    shots.append(nm2)
                bpy.data.objects.remove(fo, do_unlink=True)
        for o in [item] + list(item.children_recursive):
            o.hide_render = True
    ad.action = None
    if "fist_R" in keys:
        keys["fist_R"].value = 0.0
    for vest in ("light", "heavy"):
        show_mat("RJ_Vest", False); show_mat(f"RJ_Vest_{vest}", True)
        for clip, az in (("idle", -30), ("idle", 150), ("crouch_walk", -30)):
            act = bpy.data.actions[clip]
            ad.action = act
            if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
                ad.action_slot = act.slots[0]
            f0, f1 = act.frame_range
            bpy.context.scene.frame_set(int(f0))
            bpy.context.view_layer.update()
            rj.frame(cam, [mesh], elev=10, azim=az, pad=1.05)
            nm = f"vest_{vest}_{clip}_{'back' if az > 90 else 'front'}"
            rj.render(os.path.join(outdir, nm + ".png"))
            shots.append(nm)
    show_mat("RJ_Vest", False)
    ad.action = None
    for o in objs:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    manifest["pieces"] += [{"name": n, "kind": "preview", "cells": [1, 1], "tris": tris, "children": [],
                            "bounds": {}, "note": ""} for n in shots]


def main():
    """Build the pilot characters (guarded so civs_build.py can import this module's helpers)."""
    manifest = {"lib": "meshy", "glbs": [], "pieces": [], "bytes": 0}
    preview = os.environ.get("RJ_PREVIEW", "1") == "1"
    outdir = os.path.join(rj.PREVIEWS, "meshy")
    for name, clips in CHARS.items():
        rig, mesh, names, tris, path = build(name, clips)
        manifest["glbs"].append(os.path.relpath(path, rj.ROOT).replace("\\", "/"))
        manifest.setdefault("chars", {})[name] = {"clips": names, "tris": tris}
        if preview:
            cam = rj.setup_render((400, 400))
            show_mat("RJ_Vest", False)
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
                held_previews(rig, mesh, cam, outdir, manifest, tris)
    manifest["bytes"] = sum(os.path.getsize(os.path.join(rj.ROOT, g)) for g in manifest["glbs"])
    os.makedirs(outdir, exist_ok=True)
    json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"), indent=1)
    print(f"RJ_DONE meshy: {len(CHARS)} characters, {manifest['bytes']} bytes")


if __name__ == "__main__":
    main()
