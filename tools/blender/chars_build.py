"""Rush Job stand-in characters -> assets/models/char_player.glb, char_guard.glb, char_civilian.glb

    py tools/blender/build.py chars

PLACEHOLDERS until the Meshy characters land: chunky low-poly humanoids (big head, big hands)
on one shared skeleton, rigidly skinned (each body part follows one bone), with the full
animation set the game needs. The Meshy characters will NOT be retargeted onto this skeleton:
each keeps its own Meshy rig (retargeting tears meshes), and what stays stable for game code is
the clip names, attach points by role (hand_R) and the axis/origin convention. See ASSETS.md.

Facing: -Y in Blender = +Z in glTF/three.js. Feet on y = 0. Height ~1.8 m.
Bones: hips > spine > head; spine > upperarm_L/R > forearm_L/R > hand_L/R;
hips > thigh_L/R > shin_L/R. Attach props to hand_R (gun, bag) via bone.add(obj).
Clips (looping, 30 fps): idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot,
hands_up, ziptied, interact.
"""
import math, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import rj

FPS = 30
# name: (head, tail, parent)
BONES = {
    "hips": ((0, 0, 0.92), (0, 0, 1.08), None),
    "spine": ((0, 0, 1.08), (0, 0, 1.46), "hips"),
    "head": ((0, 0, 1.5), (0, 0, 1.86), "spine"),
}
for s, side in ((1, "L"), (-1, "R")):          # character's left is +X (it faces -Y)
    BONES.update({
        f"upperarm_{side}": ((0.27 * s, 0, 1.42), (0.29 * s, 0, 1.13), "spine"),
        f"forearm_{side}": ((0.29 * s, 0, 1.13), (0.3 * s, 0, 0.87), f"upperarm_{side}"),
        f"hand_{side}": ((0.3 * s, 0, 0.87), (0.3 * s, 0, 0.75), f"forearm_{side}"),
        f"thigh_{side}": ((0.11 * s, 0, 0.92), (0.11 * s, 0, 0.5), "hips"),
        f"shin_{side}": ((0.11 * s, 0, 0.5), (0.11 * s, 0, 0.08), f"thigh_{side}"),
    })


def body(outfit):
    """Return {bone: Part} for one outfit. All geometry in rest-pose world space."""
    top, legs, shoes = outfit["top"], outfit["legs"], "Black"
    B = {b: rj.Part(f"{outfit['name']}_{b}") for b in BONES}
    B["hips"].box(-0.2, -0.13, 0.84, 0.2, 0.13, 1.06, legs, bottom=True)
    t = B["spine"]
    t.prism([(-0.21, 1.04), (0.21, 1.04), (0.26, 1.46), (-0.26, 1.46)], -0.14, 0.14, top, axis='y')
    t.box(-0.06, -0.06, 1.46, 0.06, 0.06, 1.52, "Skin", bottom=True)          # neck
    h = B["head"]
    h.box(-0.17, -0.16, 1.5, 0.17, 0.16, 1.86, "Skin", bottom=True)
    for s, side in ((1, "L"), (-1, "R")):
        ua, fa, hd = B[f"upperarm_{side}"], B[f"forearm_{side}"], B[f"hand_{side}"]
        ua.box(0.27 * s - 0.065, -0.07, 1.12, 0.27 * s + 0.065 + 0.02 * s, 0.07, 1.47, top, bottom=True)
        fa.box(0.295 * s - 0.055, -0.055, 0.88, 0.295 * s + 0.055, 0.055, 1.14, outfit.get("sleeve", top), bottom=True)
        hd.box(0.3 * s - 0.065, -0.07, 0.72, 0.3 * s + 0.065, 0.07, 0.89, outfit.get("gloves", "Skin"), bottom=True)
        th, sh = B[f"thigh_{side}"], B[f"shin_{side}"]
        th.box(0.11 * s - 0.085, -0.09, 0.5, 0.11 * s + 0.085, 0.09, 0.9, legs, bottom=True)
        sh.box(0.11 * s - 0.075, -0.08, 0.08, 0.11 * s + 0.075, 0.08, 0.52, legs, bottom=True)
        sh.box(0.11 * s - 0.08, -0.22, 0.0, 0.11 * s + 0.08, 0.09, 0.1, shoes, bottom=True)   # shoe
    outfit["extra"](B)
    return B


def player_extra(B):
    h = B["head"]
    h.box(-0.18, -0.2, 1.52, 0.18, -0.16, 1.84, "Mask", bottom=True)            # the mask
    for x in (-0.07, 0.07):
        h.box(x - 0.045, -0.205, 1.7, x + 0.045, -0.2, 1.74, "Black", bottom=True, skip=('+y',))
    h.box(-0.05, -0.205, 1.58, 0.05, -0.2, 1.6, "Black", bottom=True, skip=('+y',))
    h.box(-0.18, -0.17, 1.8, 0.18, 0.17, 1.9, "Black", bottom=True)             # beanie
    t = B["spine"]
    t.prism([(-0.05, 1.46), (0.05, 1.46), (0.0, 1.2)], -0.145, -0.14, "White", axis='y')   # shirt V
    t.prism([(-0.02, 1.44), (0.02, 1.44), (0.03, 1.22), (0.0, 1.18), (-0.03, 1.22)], -0.15, -0.145, "Teal", axis='y')  # tie


def guard_extra(B):
    h = B["head"]
    h.box(-0.18, -0.17, 1.8, 0.18, 0.17, 1.92, "Navy", bottom=True)             # cap
    h.box(-0.16, -0.32, 1.8, 0.16, -0.17, 1.83, "Black", bottom=True)            # brim
    h.box(-0.04, -0.175, 1.83, 0.04, -0.17, 1.88, "Gold", bottom=True, skip=('+y',))   # badge
    for x in (-0.07, 0.07):
        h.box(x - 0.025, -0.165, 1.68, x + 0.025, -0.16, 1.72, "Black", bottom=True, skip=('+y',))
    B["hips"].box(-0.21, -0.14, 1.0, 0.21, 0.14, 1.07, "Black", bottom=True)     # duty belt
    B["hips"].box(-0.27, -0.06, 0.9, -0.21, 0.06, 1.04, "Black", bottom=True)    # holster (right hip)
    B["spine"].box(0.1, -0.15, 1.3, 0.18, -0.14, 1.36, "Gold", bottom=True, skip=('+y',))      # chest badge
    B["spine"].box(-0.2, -0.16, 1.32, -0.12, -0.14, 1.42, "Black", bottom=True)  # radio (the pager)


def civ_extra(B):
    h = B["head"]
    h.box(-0.18, -0.15, 1.78, 0.18, 0.17, 1.9, "WoodDark", bottom=True)         # hair
    h.box(-0.18, 0.1, 1.6, 0.18, 0.17, 1.8, "WoodDark", bottom=True)
    for x in (-0.07, 0.07):
        h.box(x - 0.025, -0.165, 1.68, x + 0.025, -0.16, 1.72, "Black", bottom=True, skip=('+y',))


OUTFITS = [
    dict(name="player", top="Suit", legs="Suit", gloves="Black", extra=player_extra),
    dict(name="guard", top="Uniform", legs="Navy", extra=guard_extra),
    dict(name="civilian", top="Teal", legs="Cream", extra=civ_extra),
]


# ---- animation clips: f(t in 0..1) -> {bone: (rx, ry, rz) degrees, "_hips_z": offset} ----
# Bone roll is aligned so local X rotation swings a limb forward (+) or back (-) for legs,
# arms and spine alike; local Z rotation swings sideways.
S = math.sin
TAU = 2 * math.pi


def idle(t):
    b = S(TAU * t)
    return {"spine": (1.5 * b, 0, 0), "head": (-1 * b, 0, 0),
            "upperarm_L": (2 * b, 0, 4), "upperarm_R": (2 * b, 0, -4),
            "forearm_L": (8, 0, 0), "forearm_R": (8, 0, 0), "_hips_z": 0.005 * b}


def gait(t, stride, knee, arm, elbow, lean, bob, crouch=0.0):
    a = S(TAU * t)
    k1 = max(0.0, S(TAU * t + 1.4))
    k2 = max(0.0, -S(TAU * t + 1.4))
    return {"thigh_L": (stride * a + crouch * 70, 0, 0), "thigh_R": (-stride * a + crouch * 70, 0, 0),
            "shin_L": (-knee * k2 - crouch * 100, 0, 0), "shin_R": (-knee * k1 - crouch * 100, 0, 0),
            "upperarm_L": (-arm * a, 0, 5), "upperarm_R": (arm * a, 0, -5),
            "forearm_L": (elbow, 0, 0), "forearm_R": (elbow, 0, 0),
            "spine": (lean + crouch * 25, 0, 0), "head": (-lean * 0.5 - crouch * 15, 0, 0),
            "_hips_z": bob * abs(S(TAU * t * 1.0 + 0.0)) * -1 + bob * 0.5 - crouch * 0.36}


def walk(t): return gait(t, 25, 40, 18, 12, 3, 0.03)
def run(t): return gait(t, 45, 80, 45, 70, 12, 0.06)
def crouch_idle(t):
    g = gait(0, 0, 0, 0, 30, 0, 0, crouch=1.0); g["spine"] = (28 + 1.5 * S(TAU * t), 0, 0); return g
def crouch_walk(t): return gait(t, 18, 25, 10, 30, 0, 0.02, crouch=1.0)


def carry_walk(t):
    g = gait(t, 22, 35, 15, 10, 6, 0.03)
    g["upperarm_R"] = (8, 0, -14)            # bag in the right hand, held out from the leg
    g["forearm_R"] = (5, 0, 0)
    g["spine"] = (6, 0, 6)                   # leaning away from the weight
    return g


def aim_shoot(t):
    kick = max(0.0, 1 - t * 6) * 8          # recoil at the start of each loop (one shot per loop)
    return {"upperarm_R": (85 + kick, 0, 8), "forearm_R": (5 + kick, 0, 0),
            "upperarm_L": (70, 0, -30), "forearm_L": (35, 0, 0),
            "spine": (4 - kick * 0.3, 0, 0), "head": (-4, 0, 0),
            "thigh_L": (12, 0, 0), "thigh_R": (-8, 0, 0), "shin_L": (-10, 0, 0), "shin_R": (-5, 0, 0)}


def hands_up(t):
    w = S(TAU * t * 2) * 3                  # trembling
    return {"upperarm_L": (165, 0, -15 + w), "upperarm_R": (165, 0, 15 - w),
            "forearm_L": (25, 0, 0), "forearm_R": (25, 0, 0), "spine": (-4, 0, 0), "head": (6 + w, 0, 0)}


def ziptied(t):
    w = S(TAU * t) * 4                      # wriggling
    return {"_hips_z": -0.66, "thigh_L": (88, 0, 4), "thigh_R": (88, 0, -4),
            "shin_L": (-5, 0, 0), "shin_R": (-5, 0, 0),
            "upperarm_L": (-35, 0, 10), "upperarm_R": (-35, 0, -10),
            "forearm_L": (-50, 0, -25), "forearm_R": (-50, 0, 25),
            "spine": (5 + w, 0, w), "head": (-10, 0, -w * 2)}


def interact(t):
    j = S(TAU * t * 2) * 6
    g = gait(0, 0, 0, 0, 0, 0, 0, crouch=0.55)
    g.update({"upperarm_L": (70 + j, 0, -10), "upperarm_R": (70 - j, 0, 10),
              "forearm_L": (30, 0, 0), "forearm_R": (30, 0, 0), "spine": (30, 0, 0), "head": (-15, 0, 0)})
    return g


CLIPS = [("idle", idle, 2.0), ("walk", walk, 1.0), ("run", run, 0.66), ("crouch_idle", crouch_idle, 2.0),
         ("crouch_walk", crouch_walk, 1.2), ("carry_walk", carry_walk, 1.1), ("aim_shoot", aim_shoot, 0.5),
         ("hands_up", hands_up, 1.5), ("ziptied", ziptied, 2.0), ("interact", interact, 1.0)]


def build_armature(name):
    arm = bpy.data.armatures.new(name + "_rig")
    ob = bpy.data.objects.new(name + "_rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b, (h, tl, par) in BONES.items():
        e = arm.edit_bones.new(b)
        e.head, e.tail = Vector(h), Vector(tl)
        e.align_roll(Vector((0, -1, 0)))       # local Z = forward, so +X rotation swings forward
        if par:
            e.parent = eb[par]
            e.use_connect = False
        eb[b] = e
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ob


def build_char(outfit):
    rig = build_armature(outfit["name"])
    parts = body(outfit)
    objs = []
    for b, part in parts.items():
        o = part.build()
        vg = o.vertex_groups.new(name=b)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = outfit["name"]
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    # actions
    rig.animation_data_create()
    for clip, fn, dur in CLIPS:
        act = bpy.data.actions.new(f"{clip}")
        act.use_fake_user = True
        rig.animation_data.action = act
        n = max(2, int(round(dur * FPS)))
        step = 2
        for f in list(range(0, n, step)) + [n]:
            pose = fn(f / n)
            for pb in rig.pose.bones:
                rx, ry, rz = pose.get(pb.name, (0, 0, 0))
                pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
                pb.keyframe_insert("rotation_euler", frame=f + 1)
            hp = rig.pose.bones["hips"]
            hp.location = (0, pose.get("_hips_z", 0.0), 0)    # hips local Y is world up
            hp.keyframe_insert("location", frame=f + 1)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 1, act)
        track.mute = True
        rig.animation_data.action = None
    return rig, mesh, tris


def pose_at(rig, clip, t):
    fn, dur = next((f, d) for c, f, d in CLIPS if c == clip)
    pose = fn(t)
    for pb in rig.pose.bones:
        rx, ry, rz = pose.get(pb.name, (0, 0, 0))
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        pb.location = (0, 0, 0)
    rig.pose.bones["hips"].location = (0, pose.get("_hips_z", 0.0), 0)
    bpy.context.view_layer.update()


rj._reset_scene()
preview = os.environ.get("RJ_PREVIEW", "1") == "1"
manifest = {"lib": "chars", "glbs": [], "pieces": [], "clips": [c for c, _, _ in CLIPS], "bones": list(BONES)}
total = 0
built = []
for outfit in OUTFITS:
    rig, mesh, tris = build_char(outfit)
    name = outfit["name"]
    built.append((name, rig, mesh, tris))
    # export one GLB per character (rig + mesh + its 10 clips), then drop the clips so the
    # next character's export doesn't pick them up as well
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    # Meshy characters own char_<name>.glb; the stand-in is always standin_<name>.glb, and also
    # char_<name>.glb for characters that have no Meshy version yet
    has_meshy = os.path.exists(os.path.join(rj.ROOT, "assets", "gen", "meshy", f"pilot-{name}-rig_rigged_character_glb_url.glb"))
    rig["rj_attach"] = json.dumps({b: b for b in ("hand_R", "hand_L", "head", "spine", "hips")})
    rig["rj_source"] = "standin"
    path = os.path.join(rj.MODELS, f"standin_{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_cameras=False, export_lights=False,
                              export_extras=True, **rj.COMPRESS)
    manifest["glbs"].append(f"assets/models/standin_{name}.glb")
    if not has_meshy:
        import shutil
        shutil.copyfile(path, os.path.join(rj.MODELS, f"char_{name}.glb"))
        manifest["glbs"].append(f"assets/models/char_{name}.glb")
    print(f"RJ_CHAR {name}: {tris} tris, {os.path.getsize(path)} bytes")
    rig.animation_data_clear()
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

if preview:
    cam = rj.setup_render((400, 400))
    outdir = os.path.join(rj.PREVIEWS, "chars")
    shots = [("idle", 0.0), ("walk", 0.25), ("run", 0.25), ("crouch_walk", 0.25), ("carry_walk", 0.25),
             ("aim_shoot", 0.5), ("hands_up", 0.0), ("ziptied", 0.0), ("interact", 0.25)]
    for name, rig, mesh, tris in built:
        for n2, r2, m2, _ in built:
            m2.hide_render = n2 != name
        shot_list = shots if name != "civilian" else [("idle", 0.0), ("hands_up", 0.0), ("ziptied", 0.0)]
        for clip, t in shot_list:
            pose_at(rig, clip, t)
            rj.frame(cam, [mesh], elev=30, azim=-35, pad=1.25)
            # frame on the rest-pose bounds (bound_box ignores the armature), so pad generously
            rj.render(os.path.join(outdir, f"{name}_{clip}.png"))
            manifest["pieces"].append({"name": f"{name}_{clip}", "kind": "char", "cells": [1, 1], "tris": tris,
                                       "children": [], "bounds": {}, "note": ""})
manifest["bytes"] = sum(os.path.getsize(os.path.join(rj.ROOT, g)) for g in manifest["glbs"])
os.makedirs(os.path.join(rj.PREVIEWS, "chars"), exist_ok=True)
with open(os.path.join(rj.PREVIEWS, "chars", "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
print(f"RJ_DONE chars: {len(built)} characters, {len(CLIPS)} clips, {manifest['bytes']} bytes")
