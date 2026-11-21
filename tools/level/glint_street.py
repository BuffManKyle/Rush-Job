#!/usr/bin/env python3
"""Glint & Sons street block: grows levels/glint.tmj around the shop and (re)writes its street.

    py tools/level/glint_street.py

Idempotent. The first run moves the original 33 x 25 shop map by (+OX, +OY) tiles into a 72 x 40 block
(the shop's interior and gameplay objects are untouched apart from the shift). Every run rewrites
what this script owns, so edit the tables below rather than the map:
  * floor rows of the street (sidewalks, road, the concrete alley);
  * the `decor` object layer (buildings, street furniture, cars, road paint; read by src/view/street.ts);
  * zone `property_bounds` (type `property`, for rj-stealth), the sidewalk wander zones and the pedestrians;
  * the police spawns at the street ends.

Decor objects (type `decor`, property `piece` = a street.glb / kit piece, `rot` = degrees, three.js
rotation.y: 90 turns the piece's front (south) to face east):
  * rectangle  -> the piece at the rect centre; SOLID (the sim makes it a prop; `cover` honoured);
  * point      -> the piece at the point; not solid (paint, litter, things you can walk over);
  * polyline   -> the piece repeated every `step` m along the line; not solid (road paint).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMJ = os.path.join(ROOT, "levels", "glint.tmj")
TILES = os.path.join(ROOT, "levels", "tiles.png")
OX, OY = 18, 2           # shift of the original shop map
W, H = 72, 40
PX = 32

# tile gids (firstgid 1)
SHOWROOM, BACK, SIDEWALK, ASPHALT, WALL, WINDOW, CONCRETE = 1, 2, 3, 4, 5, 6, 7

# street rows
SIDE_N = range(22, 25)      # north sidewalk (curb on its south edge, row 24)
ROAD = range(25, 33)        # parking 25-26, lanes 27-28 | 29-30, parking 31-32
SIDE_S = range(33, 36)      # south sidewalk (curb on its north edge, row 33)
ALLEY_X = range(44, 50)
ALLEY_Y = range(3, 22)
CROSS_X = (29, 32)          # crosswalk x range [29, 32)

# ---------------------------------------------------------------------------------------
# decor tables: (piece, x, y, w, h, rot[, extra props])  -- rects are solid, w/h None = point
# ---------------------------------------------------------------------------------------
def solid(piece, x, y, w=1, h=1, rot=0, **kw):
    return dict(piece=piece, x=x, y=y, w=w, h=h, rot=rot, **kw)


def point(piece, x, y, rot=0, **kw):
    return dict(piece=piece, x=x, y=y, rot=rot, point=True, **kw)


def line(piece, pts, step, rot=0):
    return dict(piece=piece, pts=pts, step=step, rot=rot)


def pole(piece, x, y, rot=0):
    """A thin solid thing on one cell: a small rect so only that cell blocks."""
    return solid(piece, x + 0.3, y + 0.3, 0.4, 0.4, rot)


DECOR = []
# buildings: near side (fronts south), far side (rotated 180, fronts north), backdrop
for name, x, w in (("bldg_diner", 0, 9), ("bldg_laundromat", 9, 9), ("bldg_books", 51, 7),
                   ("bldg_deli", 58, 7), ("bldg_tailor", 65, 7)):
    DECOR.append(solid(name, x, 2, w, 20))
for name, x, w in (("bldg_cinema", 0, 16), ("bldg_pharmacy", 16, 12), ("bldg_bar", 28, 10),
                   ("bldg_pawn", 38, 10), ("bldg_cafe", 48, 12), ("bldg_hardware", 60, 12)):
    DECOR.append(solid(name, x, 36, w, 12, 180))
for name, x, w in (("bldg_rear_a", 0, 18), ("bldg_rear_b", 18, 16), ("bldg_rear_a", 34, 18), ("bldg_rear_c", 52, 21)):
    DECOR.append(solid(name, x, -10, w, 12))
# past the street ends (outside the map: scenery only)
DECOR += [solid("bldg_rear_d", -12, 10, 12, 12), solid("bldg_rear_d", 72, 10, 12, 12),
          solid("bldg_rear_c", -21, 36, 21, 12, 180), solid("bldg_rear_b", 72, 36, 16, 12, 180),
          solid("bldg_rear_a", -18, -2, 18, 12), solid("bldg_rear_b", 72, -2, 16, 12)]

# street ends: road-work barricades across sidewalks and road
for y in range(22, 36, 2):
    DECOR += [solid("barricade", 0, y, 1, 2, 90), solid("barricade", 71, y, 1, 2, -90)]

# north sidewalk (curb row 24); things on the curb row face the road (rot 0)
for x in (6, 21, 37, 53, 66):
    DECOR.append(pole("streetlight", x, 24))
for x in (3, 9, 15, 24, 40, 55, 62, 69):
    DECOR.append(pole("parking_meter", x, 24))
DECOR += [pole("hydrant", 13, 24), pole("hydrant", 57, 24),
          pole("trash_can", 27, 24), pole("trash_can", 42, 24),
          pole("newspaper_box", 25, 24), pole("mailbox", 35, 24),
          solid("bench", 12, 22, 2, 1), solid("planter_long", 2, 22, 2, 1), solid("planter_long", 5, 22, 2, 1),
          solid("planter", 28, 22), solid("planter", 34, 22),
          solid("crates", 59, 22), solid("crates", 61, 22), solid("planter", 66, 22)]
# south sidewalk (curb row 33): face the road = rot 180
for x in (12, 28, 44, 60):
    DECOR.append(pole("streetlight", x, 33, 180))
for x in (5, 16, 47, 67):
    DECOR.append(pole("parking_meter", x, 33, 180))
for x in (8, 36, 64):
    DECOR.append(solid("street_tree", x, 33))
DECOR += [pole("trash_can", 20, 33, 180), pole("trash_can", 54, 33, 180), pole("mailbox", 40, 33, 180),
          pole("hydrant", 24, 33, 180), pole("newspaper_box", 56, 33, 180), pole("bus_sign", 49, 33, 180),
          solid("bus_stop", 50, 34, 3, 2, 180), solid("bench", 13, 35, 2, 1, 180),
          solid("planter", 33, 35), solid("planter", 43, 35)]
# alley: dumpsters against the walls, bags, a pallet (back door is at (43, 10): keep x44 y9-11 clear)
DECOR += [solid("dumpster", 49, 10, 1, 2, -90, cover=True), solid("dumpster", 44, 15, 1, 2, 90, cover=True),
          point("bin_bags", 49.5, 12.5), point("bin_bags", 44.5, 17.5, 40), point("pallet", 49.6, 18.5, -90),
          point("bin_bags", 49.4, 20.2, 110)]
# parked cars: north lane (y 25-26) parked facing west, south lane (y 31-32) facing east; cover
for piece, x in (("car_sedan_plum", 2), ("car_hatch_sage", 9), ("car_wagon_navy", 15), ("car_sedan_slate", 36),
                 ("car_hatch_cream", 52), ("car_wagon_steel", 60)):
    DECOR.append(solid(piece, x, 25, 4, 2, 180, cover=True))
for piece, x in (("car_wagon_steel", 4), ("car_sedan_slate", 12), ("car_hatch_cream", 20), ("car_sedan_plum", 38),
                 ("car_hatch_sage", 55), ("car_wagon_navy", 64)):
    DECOR.append(solid(piece, x, 31, 4, 2, 0, cover=True))
# road paint
for y in (29.0,):
    DECOR += [line("paint_centre", [(1, y), (CROSS_X[0] - 1, y)], 1), line("paint_centre", [(CROSS_X[1] + 1, y), (71, y)], 1)]
for y in (27.0, 31.0):
    DECOR += [line("paint_edge", [(1, y), (CROSS_X[0] - 1, y)], 1), line("paint_edge", [(CROSS_X[1] + 1, y), (71, y)], 1)]
DECOR += [line("paint_tick", [(1, 26.7), (CROSS_X[0] - 1, 26.7)], 6), line("paint_tick", [(CROSS_X[1] + 1, 26.7), (71, 26.7)], 6),
          line("paint_tick", [(1, 31.3), (CROSS_X[0] - 1, 31.3)], 6), line("paint_tick", [(CROSS_X[1] + 1, 31.3), (71, 31.3)], 6)]
for x in range(*CROSS_X):
    DECOR.append(line("paint_crosswalk", [(x + 0.5, 25), (x + 0.5, 33)], 1, 90))
DECOR += [line("paint_stop", [(CROSS_X[1] + 0.6, 27), (CROSS_X[1] + 0.6, 29)], 1),      # westbound lanes
          line("paint_stop", [(CROSS_X[0] - 0.6, 29), (CROSS_X[0] - 0.6, 31)], 1)]      # eastbound lanes
DECOR += [point("manhole", 20.5, 28.0), point("manhole", 51.5, 30.0), point("manhole", 46.5, 14.5),
          point("storm_drain", 18.5, 25.0), point("storm_drain", 58.5, 25.0),
          point("storm_drain", 10.5, 33.0, 180), point("storm_drain", 45.5, 33.0, 180)]

PEDESTRIANS = [("ped_1", 8.5, 23.5, "wander_sidewalk_n"), ("ped_2", 58.5, 23.5, "wander_sidewalk_n"),
               ("ped_3", 20.5, 34.5, "wander_sidewalk_s"), ("ped_4", 62.5, 34.5, "wander_sidewalk_s")]


# ---------------------------------------------------------------------------------------
def tile_png():
    """Add a 7th tile (concrete) to the Tiled preview tileset image if it isn't there yet."""
    from PIL import Image
    im = Image.open(TILES)
    if im.width >= 7 * PX:
        return
    out = Image.new(im.mode, (7 * PX, PX))
    out.paste(im, (0, 0))
    out.paste(Image.new(im.mode, (PX, PX), (141, 144, 150) if im.mode == "RGB" else (141, 144, 150, 255)), (6 * PX, 0))
    out.save(TILES)


def main():
    d = json.load(open(TMJ, encoding="utf-8"))
    layers = {l["name"]: l for l in d["layers"]}
    ts = d["tilesets"][0]
    if d["width"] != W:
        assert (d["width"], d["height"]) == (33, 25), "unexpected map size"
        ow, oh = d["width"], d["height"]
        for name in ("floor", "walls"):
            old = layers[name]["data"]
            new = [0] * (W * H)
            for y in range(oh):
                for x in range(ow):
                    if y >= 20 and name == "floor":
                        continue                    # old street rows: rebuilt below
                    v = old[y * ow + x]
                    if v and 0 <= y + OY < H:
                        new[(y + OY) * W + x + OX] = v
            layers[name]["data"] = new
            layers[name]["width"], layers[name]["height"] = W, H
        for l in d["layers"]:
            if l["type"] != "objectgroup":
                continue
            for o in l["objects"]:
                o["x"] += OX * PX
                o["y"] += OY * PX
        d["width"], d["height"] = W, H

    # tileset: concrete floor tile (the alley)
    if not any(t["id"] == 6 for t in ts.get("tiles", [])):
        ts["tiles"].append({"id": 6, "properties": [{"name": "kind", "type": "string", "value": "floor"},
                                                     {"name": "name", "type": "string", "value": "floor_concrete"}]})
        ts["tilecount"], ts["columns"], ts["imagewidth"] = 7, 7, 7 * PX
    tile_png()

    # floor: street rows and the alley
    fl = layers["floor"]["data"]
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if y in SIDE_N or y in SIDE_S:
                fl[i] = SIDEWALK
            elif y in ROAD:
                fl[i] = ASPHALT
            elif y >= 36:
                fl[i] = 0
            elif x in ALLEY_X and y in ALLEY_Y and layers["walls"]["data"][i] == 0:
                fl[i] = CONCRETE

    nid = d["nextobjectid"]

    def obj(name, typ, x, y, w=0, h=0, props=(), **extra):
        nonlocal nid
        o = {"id": nid, "name": name, "type": typ, "x": x * PX, "y": y * PX, "width": w * PX, "height": h * PX,
             "rotation": 0, "visible": True, "properties": [dict(p) for p in props]}
        o.update(extra)
        nid += 1
        return o

    def prop(name, value):
        t = "bool" if isinstance(value, bool) else "float" if isinstance(value, float) else "int" if isinstance(value, int) else "string"
        return {"name": name, "type": t, "value": value}

    # zones: property bounds and the sidewalk wander zones (replace ours, keep everyone else's)
    zones = layers["zones"]["objects"]
    zones[:] = [o for o in zones if o["name"] not in ("property_bounds", "wander_sidewalk_n", "wander_sidewalk_s")]
    zones.append(obj("property_bounds", "property", OX, OY, 32, 20))
    zones.append(obj("wander_sidewalk_n", "wander", 1, 22, 70, 3))
    zones.append(obj("wander_sidewalk_s", "wander", 1, 33, 70, 3))

    # police: front units arrive from both street ends; the alley unit at the alley mouth
    sp = layers["spawns"]["objects"]
    for o in sp:
        if o["name"] == "police_front_1":
            o["x"], o["y"] = 2.5 * PX, 27.5 * PX
        elif o["name"] == "police_front_2":
            o["x"], o["y"] = 69.5 * PX, 30.5 * PX

    # pedestrians
    civ = layers["civilians"]["objects"]
    civ[:] = [o for o in civ if not o["name"].startswith("ped_")]
    for name, x, y, zone in PEDESTRIANS:
        civ.append(obj(name, "civilian", x, y, point=True,
                       props=[prop("role", "customer"), prop("wander", zone), prop("pedestrian", True)]))

    # decor layer (rewritten every run)
    dec = layers.get("decor")
    if dec is None:
        dec = {"id": d["nextlayerid"], "name": "decor", "type": "objectgroup", "draworder": "topdown",
               "x": 0, "y": 0, "opacity": 1, "visible": True, "objects": []}
        d["nextlayerid"] += 1
        d["layers"].insert(2, dec)             # under the gameplay layers in Tiled
    dec["objects"] = []
    counts = {}
    for e in DECOR:
        counts[e["piece"]] = counts.get(e["piece"], 0) + 1
        name = f"{e['piece']}_{counts[e['piece']]}"
        props = [prop("piece", e["piece"]), prop("rot", float(e["rot"]))]
        if "pts" in e:
            (x0, y0) = e["pts"][0]
            o = obj(name, "decor", x0, y0, polyline=[{"x": (px - x0) * PX, "y": (py - y0) * PX} for px, py in e["pts"]],
                    props=props + [prop("step", float(e["step"]))])
        elif e.get("point"):
            o = obj(name, "decor", e["x"], e["y"], point=True, props=props)
        else:
            if e.get("cover"):
                props.append(prop("cover", True))
            o = obj(name, "decor", e["x"], e["y"], e["w"], e["h"], props=props)
        dec["objects"].append(o)
    d["nextobjectid"] = nid
    with open(TMJ, "w", encoding="utf-8", newline="\n") as f:
        json.dump(d, f, indent=1)
        f.write("\n")
    print(f"glint.tmj: {W} x {H}, {len(dec['objects'])} decor objects")


if __name__ == "__main__":
    main()
