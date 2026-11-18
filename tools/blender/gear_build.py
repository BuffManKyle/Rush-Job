"""Rush Job weapons and gadgets -> assets/models/gear.glb

    py tools/blender/build.py gear

Everything in DESIGN.md "Gear, guns & progression": the 5 weapons, the 11 gadgets, the thermal
drill and the bank keycard. Built about 1.25x real size (K) so they read from the 55-degree camera;
flat colours from STYLE.md. Red appears only where it means danger (the armed C4 timer).

Conventions (see ASSETS.md "Gear"):
  * HELD items (guns, baton, handheld gadgets): the origin is where the right palm grips it.
    Barrel / business end points FORWARD = Blender -Y = glTF +Z, up = +Y. Attach to the hand by
    adding the piece to the character's hand_R bone (rotate once in code to match that rig's hand).
  * Sockets are empty child nodes named <piece>_<socket>:
      _muzzle  where shots, tracers and the flash start (guns)
      _grip2   where the left hand goes on two-handed guns
      _grip    on PLACED / THROWN gadgets: where the hand holds it while carrying
  * PLACED / THROWN items (noisemaker, C4, ECM, drill, body bag, medkit, smoke) have their origin on
    the floor under their centre, so they can be dropped at a point.
  * Hideable / moving children: thermal_drill_bit (spins about the drill's forward axis),
    c4_timer and ecm_jammer_led (swap materials when armed/active), keycard_cloner_card.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rj

K = 1.25
pieces = []


def P(name, note, cells=(1, 1), **view):
    p = rj.Piece(name, kind="gear", cells=cells, note=note)
    p.view = view or dict(elev=35, azim=-40)
    pieces.append(p)
    return p


def held_view():
    return dict(elev=30, azim=-60)


# =========================================================================================
# WEAPONS (held; origin at the right palm, barrel toward -Y)
# =========================================================================================
def pistol_body(p, slide="SteelDark", grip="Black", accent=None):
    """Compact pistol: slide on top of a frame, angled grip below the origin."""
    bz = 0.075                                     # bore height above the palm
    p.box(-0.014, -0.15, bz - 0.02, 0.014, 0.035, bz + 0.02, slide, bottom=True)          # slide
    p.box(-0.012, -0.14, bz - 0.042, 0.012, 0.02, bz - 0.02, "Black", bottom=True)        # frame / dust cover
    p.prism([(-0.03, -0.055), (0.025, -0.055), (0.045, 0.035), (-0.015, 0.035)], -0.016, 0.016, grip, axis='x')  # grip (y, z)
    p.box(-0.004, -0.06, 0.012, 0.004, -0.02, 0.018, "Black", bottom=True)               # trigger guard
    p.box(-0.006, -0.035, 0.012, 0.006, -0.028, 0.03, "Steel", bottom=True)               # trigger
    p.box(-0.004, 0.025, bz + 0.02, 0.004, 0.032, bz + 0.03, "Black", bottom=True)        # rear sight
    p.box(-0.003, -0.145, bz + 0.02, 0.003, -0.138, bz + 0.027, "Black", bottom=True)     # front sight
    if accent:
        for x in (-0.0165, 0.0165):
            p.box(x - 0.0015, -0.012, -0.03, x + 0.0015, 0.022, 0.025, accent, bottom=True)  # grip panels
    return bz


p = P("pistol_silenced", "pocket pistol with suppressor (start weapon); origin at the palm, muzzle +Z", **held_view())
with p.at((0, 0, 0), s=K):
    bz = pistol_body(p)
    p.cyl(0, bz, -0.15, -0.29, 0.019, "Black", seg=10, axis='y')                         # suppressor
    p.cyl(0, bz, -0.29, -0.292, 0.012, "SteelDark", seg=8, axis='y')
    p.socket("pistol_silenced_muzzle", (0, -0.295, bz))

p = P("tranq_pistol", "tranq pistol: teal grip panels, CO2 bulb under the barrel, dart in the muzzle", **held_view())
with p.at((0, 0, 0), s=K):
    bz = pistol_body(p, slide="Cream", accent="Teal")
    p.cyl(0, bz, -0.15, -0.2, 0.014, "SteelDark", seg=8, axis='y')                        # barrel
    p.cyl(0, bz - 0.045, -0.13, -0.03, 0.013, "Teal", seg=8, axis='y')                    # CO2 bulb
    p.cyl(0, bz, -0.2, -0.225, 0.008, "Gold", seg=6, axis='y', r2=0.0)                    # dart tip
    p.socket("tranq_pistol_muzzle", (0, -0.225, bz))

p = P("smg_compact", "compact SMG, two-handed: _grip2 on the foregrip, folded stock", **held_view())
with p.at((0, 0, 0), s=K):
    bz = 0.07
    p.box(-0.022, -0.2, bz - 0.04, 0.022, 0.09, bz + 0.03, "SteelDark", bottom=True)      # receiver
    p.box(-0.02, -0.19, bz + 0.03, 0.02, 0.06, bz + 0.04, "Black", bottom=True)           # top rail
    p.cyl(0, bz, -0.2, -0.27, 0.013, "Black", seg=8, axis='y')                            # barrel stub
    p.prism([(-0.03, -0.05), (0.02, -0.05), (0.04, 0.035), (-0.012, 0.035)], -0.018, 0.018, "Black", axis='x')   # grip
    p.box(-0.014, -0.15, -0.09, 0.014, -0.11, bz - 0.04, "Black", bottom=True)            # magazine
    p.box(-0.016, -0.2, -0.04, 0.016, -0.17, bz - 0.04, "Black", bottom=True)             # foregrip
    p.box(-0.024, 0.09, bz - 0.03, 0.024, 0.11, bz + 0.02, "Black", bottom=True)          # folded stock hinge
    p.box(0.022, -0.12, bz - 0.03, 0.03, 0.1, bz + 0.0, "Steel", bottom=True)             # stock arm folded along the side
    p.box(-0.004, -0.05, 0.012, 0.004, -0.015, 0.018, "Black", bottom=True)               # trigger guard
    p.socket("smg_compact_muzzle", (0, -0.272, bz))
    p.socket("smg_compact_grip2", (0, -0.185, -0.02))

p = P("shotgun_pump", "pump shotgun, two-handed: _grip2 on the wooden pump", **held_view())
with p.at((0, 0, 0), s=K):
    bz = 0.06
    p.cyl(0, bz, -0.05, -0.55, 0.016, "SteelDark", seg=8, axis='y')                       # barrel
    p.cyl(0, bz - 0.032, -0.06, -0.48, 0.013, "SteelDark", seg=8, axis='y')               # tube magazine
    p.box(-0.024, -0.36, bz - 0.055, 0.024, -0.22, bz - 0.01, "Wood", bottom=True)        # pump
    for y in (-0.34, -0.31, -0.28, -0.25):
        p.box(-0.025, y, bz - 0.05, 0.025, y + 0.008, bz - 0.015, "WoodDark", bottom=True)  # pump grooves
    p.box(-0.022, -0.06, bz - 0.04, 0.022, 0.07, bz + 0.03, "SteelDark", bottom=True)     # receiver
    p.prism([(-0.03, -0.05), (0.02, -0.05), (0.04, 0.035), (-0.012, 0.035)], -0.018, 0.018, "Wood", axis='x')     # pistol grip
    p.prism([(0.07, bz + 0.02), (0.07, bz - 0.04), (0.33, -0.06), (0.33, 0.06)], -0.02, 0.02, "Wood", axis='x')  # stock
    p.box(-0.021, 0.33, -0.065, 0.021, 0.345, 0.065, "Black", bottom=True)                # butt pad
    p.box(-0.003, -0.545, bz + 0.016, 0.003, -0.535, bz + 0.026, "Gold", bottom=True)     # bead sight
    p.socket("shotgun_pump_muzzle", (0, -0.555, bz))
    p.socket("shotgun_pump_grip2", (0, -0.29, bz - 0.06))

p = P("stun_baton", "stun baton: silent melee takedown; electrodes are RJ_Ok (teal), not red", **held_view())
with p.at((0, 0, 0), s=K):
    p.cyl(0, 0, -0.06, 0.07, 0.019, "Black", seg=8, axis='y')                             # handle (along Y)
    p.cyl(0, 0, 0.07, 0.085, 0.024, "SteelDark", seg=8, axis='y')                         # pommel
    p.cyl(0, 0, -0.06, -0.075, 0.026, "SteelDark", seg=8, axis='y')                       # guard
    p.cyl(0, 0, -0.075, -0.42, 0.015, "SteelDark", seg=8, axis='y')                       # shaft
    for x in (-0.009, 0.009):
        p.box(x - 0.004, -0.445, -0.004, x + 0.004, -0.42, 0.004, "Ok", bottom=True)        # electrodes
    p.socket("stun_baton_muzzle", (0, -0.45, 0))


# =========================================================================================
# GADGETS
# =========================================================================================
p = P("zip_ties", "bundle of 4 zip ties, loops lying flat so they read from above (held)", **held_view())
with p.at((0, 0, 0), s=K):
    for i in range(4):
        with p.at((0.006 * i, -0.006 * i, 0.004 * i), rz=12 * i):
            r, t = 0.035, 0.005
            p.box(-r, -r, 0, r, -r + t, 0.004, "White", bottom=True)
            p.box(-r, r - t, 0, r, r, 0.004, "White", bottom=True)
            p.box(-r, -r, 0, -r + t, r, 0.004, "White", bottom=True)
            p.box(r - t, -r - 0.06, 0, r, r, 0.004, "White", bottom=True)                    # side + tail
            p.box(r - 0.009, r - 0.009, 0, r + 0.003, r + 0.003, 0.008, "Black", bottom=True)  # lock head

p = P("lockpick_kit", "leather lockpick wallet, open, picks fanned out (held)", **held_view())
with p.at((0, 0, 0), s=K):
    p.box(-0.06, -0.08, -0.008, 0.06, 0.04, 0.0, "WoodDark", bottom=True)                 # open wallet
    p.box(-0.058, -0.075, 0.0, 0.058, -0.03, 0.004, "Wood", bottom=True)                  # pick pocket
    for i in range(5):
        with p.at((-0.04 + i * 0.02, -0.05, 0.006), rz=-6 + 3 * i):
            p.box(-0.002, -0.09, 0, 0.002, 0.0, 0.003, "Steel", bottom=True)
            p.box(-0.006, -0.093, 0, 0.006 if i % 2 else 0.002, -0.088, 0.003, "Steel", bottom=True)
            p.box(-0.004, 0.0, 0, 0.004, 0.03, 0.006, "Black", bottom=True)                  # handle

p = P("noisemaker", "throwable noisemaker: a squat speaker puck, origin on the floor; _grip for carrying")
with p.at((0, 0, 0), s=K):
    p.cyl(0, 0, 0, 0.06, 0.065, "Teal", seg=10)
    p.cyl(0, 0, 0.06, 0.065, 0.05, "Black", seg=10)                                        # speaker grille
    p.cyl(0, 0, 0.065, 0.068, 0.02, "SteelDark", seg=8)
    p.cyl(0.045, 0.02, 0.06, 0.16, 0.004, "Steel", seg=4)                                  # antenna
    p.box(-0.02, -0.068, 0.025, 0.02, -0.06, 0.04, "Ok", bottom=True)                      # LED strip
    p.socket("noisemaker_grip", (0, 0, 0.035))

p = P("glass_cutter", "suction-cup circle glass cutter (held, cup end forward)", **held_view())
with p.at((0, 0, 0), s=K):
    p.cyl(0, 0, -0.05, 0.08, 0.015, "Black", seg=8, axis='y')                              # handle
    p.cyl(0, 0, -0.05, -0.065, 0.045, "Black", seg=12, axis='y', r2=0.03)                  # suction cup
    p.box(-0.004, -0.06, 0.0, 0.004, -0.055, 0.08, "Steel", bottom=True)                   # radius arm
    p.cyl(0, 0.08, -0.07, -0.06, 0.012, "Steel", seg=8, axis='y')                          # cutting wheel
    p.cyl(0, 0, 0.08, 0.09, 0.02, "Gold", seg=8, axis='y')
    p.socket("glass_cutter_muzzle", (0, -0.07, 0))

p = P("body_bag_folded", "folded body bag, as carried (held)", **held_view())
with p.at((0, 0, 0), s=K):
    p.box(-0.1, -0.07, -0.04, 0.1, 0.07, 0.04, "Black", bottom=True)
    p.box(-0.1, -0.072, -0.005, 0.1, 0.072, 0.005, "Steel", bottom=True)                   # zip line
    p.box(-0.02, -0.075, -0.045, 0.02, 0.075, 0.045, "Fabric", bottom=True)                # strap

p = P("body_bag", "filled body bag lying on the floor, 2 x 1 cells; long axis X, origin on the floor", cells=(2, 1),
      elev=45, azim=-30)
L, R = 1.85, 0.26
prof = [(R * math.cos(2 * math.pi * (i + 0.5) / 8), 0.13 + 0.12 * math.sin(2 * math.pi * (i + 0.5) / 8)) for i in range(8)]
p.prism(prof, -L / 2, L / 2, "Black", axis='x')
p.box(-L / 2 + 0.05, -0.012, 0.248, L / 2 - 0.05, 0.012, 0.256, "Steel", bottom=True)    # zipper
for x in (-0.6, 0.0, 0.6):
    p.box(x - 0.03, -0.27, 0.0, x + 0.03, 0.27, 0.26, "Fabric", bottom=True)                # handles
p.box(-L / 2 - 0.02, -0.18, 0.02, -L / 2, 0.18, 0.22, "Black", bottom=True)
p.box(L / 2, -0.18, 0.02, L / 2 + 0.02, 0.18, 0.22, "Black", bottom=True)

p = P("ecm_jammer", "ECM jammer placed on the floor; child ecm_jammer_led starts RJ_Ok (cameras and pagers off for 20 s)")
with p.at((0, 0, 0), s=K):
    p.box(-0.09, -0.06, 0.0, 0.09, 0.06, 0.08, "SteelDark")
    p.box(-0.06, -0.061, 0.025, 0.04, -0.06, 0.06, "Screen", bottom=True, skip=('+y',))      # display
    for x in (-0.06, 0.0, 0.06):
        p.cyl(x, 0.03, 0.08, 0.25 if x == 0 else 0.2, 0.006, "Black", seg=4)                   # antennas
        p.cyl(x, 0.03, 0.25 if x == 0 else 0.2, (0.26 if x == 0 else 0.21), 0.01, "Black", seg=6)
    for x in (-0.07, 0.07):
        p.box(x - 0.015, -0.065, 0.0, x + 0.015, 0.065, 0.012, "Rubber")                    # feet
    led = p.child("ecm_jammer_led")
    led.box(0.055, -0.062, 0.045, 0.075, -0.06, 0.06, "Ok", bottom=True)
    p.socket("ecm_jammer_grip", (0, 0, 0.08))

p = P("keycard_cloner", "handheld keycard cloner; child keycard_cloner_card slides out when a copy is made", **held_view())
with p.at((0, 0, 0), s=K):
    p.box(-0.035, -0.11, -0.012, 0.035, 0.03, 0.012, "Navy", bottom=True)
    p.box(-0.028, -0.06, 0.012, 0.028, 0.02, 0.014, "Screen", bottom=True)                   # screen
    p.box(-0.028, -0.1, 0.012, 0.028, -0.07, 0.016, "Black", bottom=True)                    # keypad
    p.box(-0.03, -0.112, -0.004, 0.03, -0.11, 0.004, "Black", bottom=True)                   # slot
    card = p.child("keycard_cloner_card")
    card.box(-0.027, -0.15, -0.0015, 0.027, -0.105, 0.0015, "White", bottom=True)
    card.box(-0.027, -0.15, 0.0015, 0.027, -0.14, 0.002, "Teal", bottom=True)

p = P("keycard", "bank keycard (the manager carries one): white card, teal stripe, gold chip; lies flat, origin under its centre",
      elev=60, azim=-20)
with p.at((0, 0, 0), s=K):
    p.box(-0.043, -0.027, 0, 0.043, 0.027, 0.003, "White", bottom=True)
    p.box(-0.043, 0.012, 0.003, 0.043, 0.02, 0.0035, "Teal", bottom=True)
    p.box(-0.032, -0.012, 0.003, -0.018, 0.002, 0.0035, "Gold", bottom=True)
    p.box(0.0, -0.018, 0.003, 0.035, -0.012, 0.0035, "Navy", bottom=True)

p = P("smoke_grenade", "smoke grenade canister, stands on its base; _grip for holding")
with p.at((0, 0, 0), s=K):
    p.cyl(0, 0, 0, 0.13, 0.032, "Navy", seg=10)
    p.cyl(0, 0, 0.05, 0.075, 0.0325, "Cream", seg=10, caps=(False, False))                  # band
    p.cyl(0, 0, 0.13, 0.15, 0.018, "SteelDark", seg=8)                                        # fuse head
    p.box(0.0, -0.006, 0.12, 0.05, 0.006, 0.145, "Steel", bottom=True)                       # spoon
    p.cyl(-0.025, 0, 0.14, 0.144, 0.012, "Steel", seg=8)                                      # pin ring
    p.socket("smoke_grenade_grip", (0, 0, 0.07))

p = P("medkit", "medkit case with a TEAL cross (red stays reserved for danger); stands on its base")
with p.at((0, 0, 0), s=K):
    p.box(-0.11, -0.04, 0, 0.11, 0.04, 0.15, "White")
    p.box(-0.112, -0.042, 0.07, 0.112, 0.042, 0.08, "Cream", bottom=True)                    # seam
    p.box(-0.015, -0.043, 0.04, 0.015, -0.04, 0.12, "Teal", bottom=True, skip=('+y',))       # cross
    p.box(-0.04, -0.043, 0.065, 0.04, -0.04, 0.095, "Teal", bottom=True, skip=('+y',))
    p.box(-0.04, -0.008, 0.15, 0.04, 0.008, 0.18, "Black", bottom=True)                      # handle
    p.socket("medkit_grip", (0, 0, 0.17))

p = P("c4", "C4 charge: two putty blocks, taped detonator; child c4_timer is RJ_Danger (armed = danger). Origin on the floor")
with p.at((0, 0, 0), s=K):
    for x in (-0.042, 0.042):
        p.box(x - 0.04, -0.06, 0, x + 0.04, 0.06, 0.05, "Cream")
    for y in (-0.035, 0.035):
        p.box(-0.085, y - 0.01, 0, 0.085, y + 0.01, 0.052, "Fabric")                           # tape
    p.box(-0.03, -0.03, 0.052, 0.03, 0.02, 0.075, "Black", bottom=True)                       # detonator
    for i, x in enumerate((-0.02, 0.0, 0.02)):
        p.cyl(x, 0.02, 0.06, 0.07, 0.003, ("Teal", "Gold", "Steel")[i], seg=4, axis='y')      # wires (along Y)
    t = p.child("c4_timer")
    t.box(-0.022, -0.022, 0.075, 0.022, 0.0, 0.077, "Danger", bottom=True)                     # timer on top (seen from above)
    p.socket("c4_grip", (0, 0, 0.04))

p = P("mirror_kit", "telescopic inspection mirror for bending laser beams (held); mirror face at the far end", **held_view())
with p.at((0, 0, 0), s=K):
    p.cyl(0, 0, -0.05, 0.08, 0.014, "Black", seg=8, axis='y')
    p.cyl(0, 0, -0.05, -0.25, 0.008, "Steel", seg=6, axis='y')
    p.cyl(0, 0, -0.25, -0.42, 0.006, "Steel", seg=6, axis='y')
    with p.at((0, -0.45, 0), rx=-35):
        p.cyl(0, 0, -0.006, 0.006, 0.045, "SteelDark", seg=12)                                # mirror back (axis z)
        p.cyl(0, 0, 0.006, 0.008, 0.04, "Glass", seg=12, caps=(False, True))
    p.socket("mirror_kit_muzzle", (0, -0.45, 0))

# thermal drill: provided in the van for vault jobs. Mounted on a stand, bit points forward (-Y).
DZ = 0.62                                                                                       # drill axis height
p = P("thermal_drill", "thermal drill on its stand, ~1.1 m long, bit points +Z (into the vault door); child "
      "thermal_drill_bit spins about Z; the status screen (RJ_Screen) faces the back", cells=(1, 2), elev=30, azim=-55)
p.box(-0.3, -0.35, 0.0, 0.3, 0.45, 0.05, "SteelDark")                                         # base plate
for x in (-0.22, 0.22):
    p.box(x - 0.03, -0.2, 0.05, x + 0.03, 0.3, DZ - 0.16, "SteelDark")                         # stand legs
p.box(-0.25, -0.25, DZ - 0.19, 0.25, 0.35, DZ - 0.14, "Steel", bottom=True)                    # cradle
p.cyl(0, DZ, -0.3, 0.45, 0.15, "Navy", seg=12, axis='y')                                        # motor body
for i, y in enumerate((-0.24, -0.09, 0.06, 0.21, 0.36)):
    p.cyl(0, DZ, y, y + 0.035, 0.162, "Gold" if i % 2 else "Teal", seg=12, axis='y', caps=(False, False))  # cooling rings
p.cyl(0, DZ, 0.45, 0.5, 0.11, "SteelDark", seg=10, axis='y')                                    # rear cap
p.box(-0.12, 0.2, DZ + 0.13, 0.12, 0.32, DZ + 0.25, "Black", bottom=True)                       # control box on top
p.box(-0.1, 0.32, DZ + 0.15, 0.1, 0.322, DZ + 0.23, "Screen", bottom=True, skip=('-y',))
bit = p.child("thermal_drill_bit", pivot=(0, -0.3, DZ))
bit.cyl(0, 0, 0.0, -0.08, 0.06, "SteelDark", seg=8, axis='y')                                   # chuck
bit.cyl(0, 0, -0.08, -0.38, 0.025, "Steel", seg=6, axis='y', r2=0.015)                          # bit
bit.cyl(0, 0, -0.38, -0.42, 0.015, "Steel", seg=6, axis='y', r2=0.0)

for p in pieces:            # held items: origin at the palm, so they hang below it (the lint knows)
    if p.view == held_view():
        p.extras["rj_held"] = True
rj.finish("gear", pieces)
