"""Rush Job shared heist props -> assets/models/props.glb

    py tools/blender/build.py props

Props used by every heist: security camera, keypad / card reader, safe, loot bags, Dot's van,
office furniture, lamps, the sticky note that carries the safe code. Jewelry-store-only pieces
live in glint_build.py.

Pivot: centre of the footprint, on the floor. "Front" is Blender -Y = glTF +Z = south on the
Tiled map. Moving / hideable parts are child nodes (see each note).
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rj

pieces = []


def P(name, cells=(1, 1), note="", **view):
    p = rj.Piece(name, kind="prop", cells=cells, note=note)
    if view: p.view = view
    pieces.append(p)
    return p


# ---- security camera -----------------------------------------------------------------------
CAM_Z = 2.45
p = P("security_camera", note=f"pivot on the floor under the swivel; child 'security_camera_head' swivels "
      f"about Y at y={CAM_Z}, lens looks +X (east) at rotation 0 (= Tiled yaw 0); "
      "'security_camera_led' is RJ_Ok, set it to RJ_Danger when it sees you", elev=20, azim=-40)
p.box(-0.32, -0.07, CAM_Z + 0.12, -0.26, 0.07, CAM_Z + 0.32, "SteelDark", bottom=True)   # wall plate
p.box(-0.26, -0.025, CAM_Z + 0.17, 0.0, 0.025, CAM_Z + 0.22, "SteelDark", bottom=True)   # arm
p.cyl(0, 0, CAM_Z + 0.06, CAM_Z + 0.22, 0.03, "Steel", seg=6)                             # swivel post
h = p.child("security_camera_head", pivot=(0, 0, CAM_Z))
with h.at((0, 0, 0), ry=25):                    # tilted 25 deg down toward the floor
    h.box(-0.12, -0.07, -0.06, 0.2, 0.07, 0.07, {'+x': "Black", '*': "White"}, bottom=True)
    h.box(-0.14, -0.09, 0.07, 0.24, 0.09, 0.09, "SteelDark", bottom=True)                  # sun hood
    h.cyl(0, 0, 0.2, 0.25, 0.045, "Black", seg=8, axis='x')                                # lens barrel
    h.cyl(0, 0, 0.25, 0.255, 0.03, "Screen", seg=8, axis='x', caps=(False, True))          # glint
led = h.child("security_camera_led", pivot=(0, 0, 0))
with led.at((0, 0, 0), ry=25):
    led.box(0.12, -0.05, 0.035, 0.15, -0.025, 0.055, "Ok", bottom=True)


# ---- keypad / card reader (mounted on the south face of a wall cell) ---------------------
for name, note in (("keypad", "number pad"), ("card_reader", "keycard slot (bank)")):
    p = P(name, note=f"{note}; pivot = centre of the wall cell it hangs on, panel on the -Y (south) face "
          f"at 1.25 m; child '{name}_led' starts RJ_Ok (swap to RJ_Danger on a wrong code)", elev=15, azim=-25)
    y = -0.1
    p.box(-0.08, y - 0.035, 1.15, 0.08, y, 1.37, "SteelDark", bottom=True)
    if name == "keypad":
        p.box(-0.06, y - 0.04, 1.3, 0.06, y - 0.035, 1.35, "Screen", bottom=True)
        for r in range(4):
            for c in range(3):
                x = -0.045 + c * 0.045
                z = 1.17 + r * 0.032
                p.box(x - 0.015, y - 0.045, z, x + 0.015, y - 0.035, z + 0.022, "Steel", bottom=True, skip=('+y',))
    else:
        p.box(-0.05, y - 0.06, 1.2, 0.05, y - 0.035, 1.3, "Black", bottom=True)
        p.box(-0.04, y - 0.062, 1.24, 0.04, y - 0.06, 1.25, "Steel", bottom=True)
    L = p.child(name + "_led")
    L.box(0.04, y - 0.045, 1.335 if name == "card_reader" else 1.155, 0.065, y - 0.035, 1.355 if name == "card_reader" else 1.168, "Ok", bottom=True)


# ---- camera junction box (rj-stealth: hold E to cut the camera wire) -----------------------
JB_W, JB_H, JB_D, JB_Z = 0.4, 0.5, 0.14, 1.05          # width, height, depth, bottom edge
p = P("junction_box", note="wall-mounted camera junction box. Origin on the floor at the WALL SURFACE under the "
      "box; the box sits against the wall on +Y (Blender) and faces -Y = glTF +Z, so rotate it to face away "
      "from the wall. Children: junction_box_door (hinged on its left edge, rotate about Y to open), "
      "junction_box_wire (the teal camera cable: hide it once cut), junction_box_led (RJ_Ok; set RJ_Danger "
      "when tampered). Conduit runs up the wall to the ceiling", elev=15, azim=-35)
x0, x1, y0, y1 = -JB_W / 2, JB_W / 2, -JB_D, 0.0
p.box(x0, y0 + 0.012, JB_Z, x1, y1, JB_Z + JB_H, "SteelDark", bottom=True)                    # body
p.box(x0 + 0.03, y0 + 0.011, JB_Z + 0.03, x1 - 0.03, y0 + 0.012, JB_Z + JB_H - 0.03, "Black",
      bottom=True, skip=('+y',))                                                             # dark interior
for z in (JB_Z + 0.12, JB_Z + 0.25, JB_Z + 0.38):                                             # terminal blocks
    p.box(x0 + 0.06, y0 + 0.03, z, x1 - 0.06, y0 + 0.06, z + 0.05, "Steel", bottom=True)
p.box(-0.03, y1 - 0.06, JB_Z + JB_H, 0.03, y1, JB_Z + JB_H + 0.04, "SteelDark", bottom=True)  # conduit fitting
p.cyl(0, y1 - 0.03, JB_Z + JB_H + 0.04, 3.0, 0.022, "SteelDark", seg=8)                        # conduit up the wall
for z in (1.9, 2.5):
    p.box(-0.035, y1 - 0.05, z, 0.035, y1, z + 0.03, "Steel", bottom=True)                    # conduit clips
d = p.child("junction_box_door", pivot=(x0, y0 + 0.012, 0))
d.box(0, -0.018, JB_Z + 0.005, JB_W, 0, JB_Z + JB_H - 0.005, "SteelDark", bottom=True)
d.box(JB_W - 0.06, -0.03, JB_Z + 0.22, JB_W - 0.035, -0.018, JB_Z + 0.3, "Steel", bottom=True)  # latch
d.box(0.05, -0.0185, JB_Z + JB_H - 0.12, 0.17, -0.018, JB_Z + JB_H - 0.06, "Amber", bottom=True, skip=('+y',))  # warning label
for k in range(3):                                                                            # label hatching
    xk = 0.06 + 0.04 * k
    d.box(xk, -0.0187, JB_Z + JB_H - 0.11, xk + 0.015, -0.0185, JB_Z + JB_H - 0.07, "Hatch", bottom=True, skip=('+y',))
w = p.child("junction_box_wire")
w.box(x1 - 0.005, y0 + 0.04, JB_Z + 0.35, x1 + 0.03, y0 + 0.08, JB_Z + 0.39, "Black", bottom=True)  # gland
w.cyl(x1 + 0.03, y0 + 0.06, JB_Z + 0.37, 2.95, 0.012, "Teal", seg=6)                          # the camera cable
for z in (1.7, 2.3):
    w.box(x1 + 0.015, y0 + 0.045, z, x1 + 0.045, y0 + 0.075, z + 0.02, "Black", bottom=True)  # cable ties
led = p.child("junction_box_led")
led.box(x0 + 0.05, y0 - 0.008, JB_Z + 0.06, x0 + 0.075, y0 + 0.012, JB_Z + 0.08, "Ok", bottom=True)


# ---- safe --------------------------------------------------------------------------------
SW, SD, SH = 0.9, 0.8, 1.25
p = P("safe", note="back-room safe, door faces south; child 'safe_door' hinges at the front-left "
      "corner (rotate about Y, negative = open outward to the left); 'safe_loot' hides once bagged",
      elev=25, azim=-35)
x0, x1, y0, y1 = -SW / 2, SW / 2, -SD / 2, SD / 2
p.box(x0, y0 + 0.06, 0.08, x1, y1, SH, "Safe")                  # body
p.box(x0 + 0.04, y0 + 0.06, 0.0, x1 - 0.04, y1 - 0.04, 0.08, "Black")   # plinth
p.box(x0 + 0.07, y0 + 0.059, 0.15, x1 - 0.07, y0 + 0.07, SH - 0.07, "Black", skip=('+y',))  # dark interior
loot = p.child("safe_loot")
for i, z in enumerate((0.2, 0.6)):
    loot.box(x0 + 0.1, y0 + 0.1, z, x1 - 0.1, y1 - 0.1, z + 0.02, "SteelDark", bottom=True)
for k in range(3):
    loot.cbox(-0.22 + k * 0.22, -0.05, 0.22, 0.17, 0.08, 0.1, "Cash")
    loot.cbox(-0.22 + k * 0.22, 0.05, 0.22, 0.17, 0.08, 0.08, "Cash")
loot.cbox(-0.12, 0.0, 0.62, 0.22, 0.1, 0.08, "Gold")
loot.cbox(0.13, 0.0, 0.62, 0.22, 0.1, 0.08, "Gold")
loot.cbox(0.0, 0.0, 0.7, 0.22, 0.1, 0.08, "Gold")
for z in (0.25, SH - 0.3):                                          # hinges
    p.cyl(x0 - 0.02, y0 + 0.04, z, z + 0.16, 0.035, "Steel", seg=6)
D = p.child("safe_door", pivot=(x0, y0 + 0.06, 0))
D.box(0, -0.12, 0.1, SW, 0, SH - 0.02, "Safe", bottom=True)
D.box(0.06, -0.13, 0.16, SW - 0.06, -0.12, SH - 0.08, "SteelDark", skip=('+y',))
D.cyl(SW * 0.5, SH * 0.66, -0.17, -0.13, 0.11, "Steel", seg=12, axis='y')
D.cyl(SW * 0.5, SH * 0.66, -0.19, -0.17, 0.035, "Black", seg=6, axis='y')
D.box(SW * 0.5 - 0.15, -0.21, SH * 0.36, SW * 0.5 + 0.15, -0.18, SH * 0.36 + 0.035, "Steel", bottom=True)
for x in (SW * 0.5 - 0.15, SW * 0.5 + 0.12):
    D.box(x, -0.18, SH * 0.36, x + 0.03, -0.13, SH * 0.36 + 0.035, "Steel", bottom=True)


# ---- loot bags ---------------------------------------------------------------------------
BAGS = {"light": (0.55, 0.3, "Teal", "jewelry: 90% speed, sprint ok, throw 6 m"),
        "medium": (0.72, 0.38, "Gold", "cash: 75% speed, no sprint, throw 4 m"),
        "heavy": (0.9, 0.46, "Cream", "gold / paintings: 60% speed, throw 3 m")}
for wname, (L, R, strap, note) in BAGS.items():
    p = P(f"bag_{wname}", note=f"duffel, long axis X, pivot on the floor under its centre; {note}", elev=35, azim=-30)
    p.extras["rj_weight"] = wname
    # octagon cross-section, slightly squashed, extruded along X
    oct_ = []
    for i in range(8):
        a = math.pi * 2 * (i + 0.5) / 8
        oct_.append((R * 0.5 * math.cos(a), R * 0.5 + R * 0.45 * math.sin(a)))
    p.prism(oct_, -L / 2, L / 2, "BagCanvas", axis='x')   # lighter than the suit, so it reads on the player
    # end caps a shade darker + straps over the top
    for s in (-1, 1):
        p.box(s * L / 2 - (0.02 if s > 0 else 0), -R * 0.32, R * 0.15, s * L / 2 + (0.02 if s < 0 else 0), R * 0.32, R * 0.85, "Black", bottom=True)
    for x in (-L * 0.22, L * 0.22):
        p.box(x - 0.045, -R * 0.52, 0.02, x + 0.045, R * 0.52, R * 0.97, strap, bottom=True)
    p.box(-L * 0.22, -0.02, R * 0.97, L * 0.22, 0.02, R * 1.0 + 0.1, strap, bottom=True)   # handle
    p.box(-L * 0.3, -R * 0.47, R * 0.75, L * 0.3, -R * 0.44, R * 0.8, "Steel", bottom=True)  # zip
    p.box(-L / 2 + 0.03, -R * 0.14, R * 0.9, L / 2 - 0.03, R * 0.14, R * 0.95, strap, bottom=True)  # weight stripe on top (seen from above)


# ---- Dot's van ---------------------------------------------------------------------------
VL, VW = 4.8, 2.0
p = P("van", cells=(2, 5), note="Dot's van: nose north (-Z), rear doors south (+Z) toward the drop zone; "
      "children 'van_door_l'/'van_door_r' hinge at the rear corners (rotate about Y); fits the 4 x 4 Tiled rect "
      "lengthwise with room to spare", elev=35, azim=-40)
hw = VW / 2
side = [(-VL / 2, 0.35), (VL / 2 - 0.05, 0.35), (VL / 2, 0.95), (VL / 2 - 0.75, 1.15),
        (VL / 2 - 1.35, 2.05), (-VL / 2, 2.1)]          # (y, z) side profile, nose at +y
p.prism([(y, z) for y, z in side], -hw, hw, "VanPaint", axis='x')
p.box(-hw - 0.01, -VL / 2, 0.75, hw + 0.01, VL / 2 - 0.4, 0.95, "Cream", skip=('-z',), bottom=True)   # stripe
p.box(-hw + 0.05, -VL / 2 - 0.08, 0.2, hw - 0.05, -VL / 2 + 0.05, 0.45, "Black", bottom=True)        # rear bumper
p.box(-hw + 0.05, VL / 2 - 0.08, 0.2, hw - 0.05, VL / 2 + 0.06, 0.5, "Black", bottom=True)           # front bumper
# windows: windshield and front side windows (dark glass, slightly proud)
ws = [(VL / 2 - 0.82, 1.2), (VL / 2 - 1.3, 1.98)]
p.quad([(-hw + 0.12, ws[0][0] + 0.02, ws[0][1]), (hw - 0.12, ws[0][0] + 0.02, ws[0][1]),
        (hw - 0.12, ws[1][0] + 0.02, ws[1][1]), (-hw + 0.12, ws[1][0] + 0.02, ws[1][1])], "Black")
for s in (-1, 1):
    x = s * (hw + 0.005)
    q = [(x, VL / 2 - 1.95, 1.25), (x, VL / 2 - 0.9, 1.25), (x, VL / 2 - 1.3, 1.9), (x, VL / 2 - 1.95, 1.9)]
    p.quad(q if s > 0 else q[::-1], "Black")
for wy in (VL / 2 - 0.95, -VL / 2 + 0.95):
    for s in (-1, 1):
        x0w, x1w = (hw - 0.22, hw + 0.03) if s > 0 else (-hw - 0.03, -hw + 0.22)
        p.cyl(wy, 0.38, x0w, x1w, 0.38, "Rubber", seg=10, axis='x')
        p.cyl(wy, 0.38, x1w if s > 0 else x0w - 0.005, (x1w + 0.005) if s > 0 else x0w, 0.18, "Steel", seg=6, axis='x')
for s in (-1, 1):                                                     # lights (no red: taillights are sodium)
    p.box(s * (hw - 0.3) - 0.14, VL / 2 - 0.02, 0.62, s * (hw - 0.3) + 0.14, VL / 2 + 0.01, 0.78, "Sodium", bottom=True)
    p.box(s * (hw - 0.12) - 0.08, -VL / 2 - 0.01, 0.9, s * (hw - 0.12) + 0.08, -VL / 2 + 0.02, 1.35, "Sodium", bottom=True)
p.box(-hw + 0.25, -VL / 2 + 0.3, 2.1, hw - 0.25, -VL / 2 + 1.6, 2.16, "SteelDark", bottom=True)        # roof rack
for s, nm in ((-1, "van_door_l"), (1, "van_door_r")):
    d = p.child(nm, pivot=(s * (hw - 0.04), -VL / 2 - 0.005, 0))
    a, b = (0, hw - 0.06) if s < 0 else (-(hw - 0.06), 0)
    d.box(a, -0.05, 0.42, b, 0, 1.95, "VanPaint", bottom=True)
    d.box(a + 0.1 * (1 if s < 0 else 0), -0.055, 1.35, b - 0.1 * (1 if s > 0 else 0), -0.05, 1.8, "Black", bottom=True, skip=('+y',))
    hx = (b - 0.12) if s < 0 else (a + 0.07)
    d.box(hx, -0.09, 1.05, hx + 0.05, -0.05, 1.12, "Steel", bottom=True)


# ---- office furniture ----------------------------------------------------------------------
p = P("desk_office", cells=(3, 1), note="owner's desk, 3 x 1 cells (matches Tiled 'desk'); front = customer side (south), "
      "chair side north", elev=35, azim=-30)
p.box(-1.4, -0.4, 0.72, 1.4, 0.4, 0.78, "Wood", bottom=True)                          # top
p.box(-1.35, -0.35, 0, -0.85, 0.35, 0.72, "WoodDark")                                  # pedestals
p.box(0.85, -0.35, 0, 1.35, 0.35, 0.72, "WoodDark")
p.box(-0.85, -0.36, 0.25, 0.85, -0.33, 0.72, "WoodDark")                               # modesty panel
for x in (-1.1, 1.1):
    for z in (0.18, 0.42, 0.62):
        p.box(x - 0.15, 0.35, z, x + 0.15, 0.37, z + 0.04, "Gold", bottom=True)        # drawer pulls (chair side)
p.box(-0.35, 0.0, 0.78, 0.35, 0.05, 1.18, "Black", bottom=True)                       # monitor faces the chair
p.box(-0.32, 0.05, 0.81, 0.32, 0.055, 1.15, "Screen", bottom=True, skip=('-y',))
p.box(-0.04, 0.05, 0.78, 0.04, 0.12, 0.95, "Black", bottom=True)
p.box(-0.25, 0.15, 0.78, 0.25, 0.32, 0.8, "Black", bottom=True)                        # keyboard
p.cyl(0.95, -0.1, 0.78, 0.8, 0.12, "Gold", seg=8)                                      # lamp base
p.cyl(0.95, -0.1, 0.8, 1.1, 0.015, "Gold", seg=6)
p.cyl(0.95, -0.1, 1.05, 1.2, 0.14, "Sodium", seg=8, r2=0.07)

p = P("security_desk", cells=(2, 1), note="security monitors, 2 x 1 cells; guard sits on the north side facing the "
      "screens; the screens (RJ_Screen) face north", elev=40, azim=150)
p.box(-0.95, -0.4, 0, 0.95, 0.4, 0.75, {'+z': "Black", '*': "SteelDark"})
p.box(-0.95, -0.4, 0.75, 0.95, -0.15, 0.95, "SteelDark", bottom=True)                   # monitor riser at the back (south)
for i, x in enumerate((-0.6, 0.0, 0.6)):
    p.box(x - 0.27, -0.35, 0.95, x + 0.27, -0.25, 1.35, "Black", bottom=True)
    p.box(x - 0.24, -0.25, 0.98, x + 0.24, -0.245, 1.32, "Screen", bottom=True, skip=('-y',))
    if i == 1:
        p.box(x - 0.27, -0.35, 1.38, x + 0.27, -0.25, 1.75, "Black", bottom=True)
        p.box(x - 0.24, -0.25, 1.41, x + 0.24, -0.245, 1.72, "Screen", bottom=True, skip=('-y',))
p.box(-0.3, 0.05, 0.75, 0.3, 0.25, 0.77, "Black", bottom=True)
p.cbox(0.6, 0.15, 0.75, 0.08, 0.08, 0.1, "White")                                     # coffee cup

p = P("office_chair", note="faces south (-Y blender / +Z glTF); swivel freely", elev=30, azim=-30)
for i in range(5):
    a = 2 * math.pi * i / 5
    with p.at((0, 0, 0), rz=math.degrees(a)):
        p.box(-0.025, 0.0, 0.04, 0.025, 0.3, 0.08, "Black", bottom=True)
        p.cyl(0, 0.28, 0.0, 0.04, 0.03, "Black", seg=6)
p.cyl(0, 0, 0.08, 0.42, 0.035, "Steel", seg=6)
p.box(-0.26, -0.25, 0.42, 0.26, 0.25, 0.52, "Navy", bottom=True)                       # seat
p.box(-0.24, 0.2, 0.55, 0.24, 0.28, 1.05, "Navy", bottom=True)                         # back
p.box(-0.03, 0.22, 0.45, 0.03, 0.27, 0.6, "Black", bottom=True)

p = P("filing_cabinet", note="0.5 x 0.6, drawers face south", elev=25, azim=-35)
p.box(-0.25, -0.3, 0, 0.25, 0.3, 1.3, "SteelDark")
for z in (0.05, 0.37, 0.69, 0.99):
    p.box(-0.22, -0.31, z, 0.22, -0.3, z + 0.28, "Steel", skip=('+y',))
    p.box(-0.08, -0.34, z + 0.18, 0.08, -0.31, z + 0.21, "Black", bottom=True)

p = P("bookshelf", note="1 x 0.35 m, open side south", elev=25, azim=-30)
p.box(-0.5, -0.17, 0, 0.5, 0.17, 2.0, "WoodDark", skip=('-y',))
p.box(-0.47, -0.17, 0.02, 0.47, 0.15, 1.97, "Black", skip=('-y',))
for z in (0.05, 0.5, 0.95, 1.4):
    p.box(-0.47, -0.17, z, 0.47, 0.15, z + 0.03, "WoodDark", bottom=True)
    x = -0.44
    k = 0
    while x < 0.3:
        w = 0.05 + 0.03 * ((k * 7) % 3)
        hgt = 0.26 + 0.05 * ((k * 5) % 3)
        p.box(x, -0.13, z + 0.03, x + w, 0.12, z + 0.03 + hgt, ("Teal", "Cream", "Navy", "WoodDark")[k % 4], bottom=True)
        x += w + 0.01; k += 1

p = P("plant", note="potted plant, 0.4 m pot", elev=30, azim=-30)
p.cyl(0, 0, 0, 0.42, 0.17, "Teal", seg=8, r2=0.21)
p.cyl(0, 0, 0.42, 0.44, 0.19, "Black", seg=8)
for i in range(6):
    a = 2 * math.pi * i / 6
    with p.at((0.05 * math.cos(a), 0.05 * math.sin(a), 0.42), rz=math.degrees(a) + 90, ry=0):
        p.prism([(-0.07, 0), (0.07, 0), (0.0, 0.7 + 0.12 * (i % 3))], -0.01, 0.01, "Plant", axis='y')
with p.at((0, 0, 0.42)):
    p.cyl(0, 0, 0.0, 0.55, 0.13, "Plant", seg=6, r2=0.0)

p = P("lamp_ceiling", note="hanging pendant, pivot on the floor under it, shade bottom at 2.25 m; RJ_Sodium is emissive",
      elev=15, azim=-30)
p.cyl(0, 0, 2.5, 2.8, 0.008, "Black", seg=4)
p.cyl(0, 0, 2.25, 2.5, 0.28, "Navy", seg=10, r2=0.06, caps=(False, True))
p.cyl(0, 0, 2.249, 2.25, 0.27, "Sodium", seg=10, caps=(True, False))

p = P("trash_bin", note="0.3 m bin", elev=30, azim=-30)
p.cyl(0, 0, 0, 0.45, 0.14, "SteelDark", seg=8, r2=0.17, caps=(True, False))
p.cyl(0, 0, 0.3, 0.38, 0.15, "Paper", seg=6, r2=0.08)               # crumpled paper inside

p = P("sticky_note", note="the safe code: an 8 cm note lying flat at y=0.002; lift it onto a desk/counter top in code "
      "(set position.y to the surface height)", elev=60, azim=-20)
p.box(-0.04, -0.04, 0.0, 0.04, 0.04, 0.003, "Paper", bottom=True)
p.box(-0.025, -0.01, 0.003, 0.02, -0.004, 0.0035, "Black", bottom=True)
p.box(-0.025, 0.006, 0.003, 0.01, 0.012, 0.0035, "Black", bottom=True)

p = P("water_cooler", note="break-room filler", elev=25, azim=-30)
p.box(-0.17, -0.17, 0, 0.17, 0.17, 0.95, "White")
p.box(-0.06, -0.18, 0.7, 0.06, -0.17, 0.8, "Black", skip=('+y',))
p.cyl(0, 0, 0.95, 1.35, 0.14, "Glass", seg=8)

rj.finish("props", pieces)
