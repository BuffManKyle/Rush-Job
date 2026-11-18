#!/usr/bin/env python3
"""Import lint for every GLB in assets/models (opengame-assets: "one lint names each failure").

    py tools/blender/lint_glb.py            # lint all; exit 1 and name the file on any failure
    py tools/blender/lint_glb.py a.glb ...  # lint some

Checks: metres/Y-up convention (nothing below the floor, height sane), metalness <= 0.35 (no env
map in game) and 0 on skin/fabric, triangle budgets (props 2k, characters 8k), material names are
shared RJ_* ones, node names have no '.' (three.js strips them), no image embedded twice, characters
carry the 10 clips. build.py runs it after every build.
"""
import glob, hashlib, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CLIPS = {"idle", "walk", "run", "crouch_idle", "crouch_walk", "carry_walk", "aim_shoot", "hands_up", "ziptied", "interact"}
NONMETAL = {"RJ_Skin", "RJ_Fabric", "RJ_Suit", "RJ_Uniform", "RJ_Plaster", "RJ_Brick", "RJ_Velvet"}


def read(path):
    d = open(path, "rb").read()
    assert struct.unpack("<I", d[:4])[0] == 0x46546C67, "not a GLB"
    jl = struct.unpack("<I", d[12:16])[0]
    g = json.loads(d[20:20 + jl])
    off = 20 + jl
    binc = d[off + 8:] if off < len(d) else b""
    return g, binc


def lint(path):
    errs, notes = [], []
    g, binc = read(path)
    name = os.path.basename(path)
    is_char = name.startswith("char_")
    for m in g.get("materials", []):
        mn = m.get("name", "?")
        pbr = m.get("pbrMetallicRoughness", {})
        metal = pbr.get("metallicFactor", 1.0)
        if not mn.startswith("RJ_"):
            errs.append(f"material {mn!r} is not a shared RJ_ material")
        if metal > 0.35:
            errs.append(f"material {mn} metalness {metal} > 0.35")
        if mn in NONMETAL and metal > 0:
            errs.append(f"material {mn} should have metalness 0, has {metal}")
    for n in g.get("nodes", []):
        if "." in n.get("name", ""):
            errs.append(f"node name {n['name']!r} contains '.', which three.js strips")
    # per top-level node: triangles and lowest point (translation-only transforms)
    acc = g.get("accessors", [])

    def tris(mi):
        t = 0
        for p in g["meshes"][mi]["primitives"]:
            t += (acc[p["indices"]]["count"] if "indices" in p else acc[p["attributes"]["POSITION"]]["count"]) // 3
        return t

    def walk(ni, oy, out):
        n = g["nodes"][ni]
        y = oy + n.get("translation", [0, 0, 0])[1]
        if "mesh" in n:
            for p in g["meshes"][n["mesh"]]["primitives"]:
                a = acc[p["attributes"]["POSITION"]]
                out["miny"] = min(out["miny"], y + a["min"][1]); out["maxy"] = max(out["maxy"], y + a["max"][1])
            out["tris"] += tris(n["mesh"])
        for c in n.get("children", []):
            walk(c, y, out)

    for ri in g["scenes"][g.get("scene", 0)]["nodes"]:
        out = {"miny": 1e9, "maxy": -1e9, "tris": 0}
        walk(ri, 0.0, out)
        rn = g["nodes"][ri].get("name", "?")
        kind = (g["nodes"][ri].get("extras") or {}).get("rj_kind", "char" if is_char else "prop")
        budget = 8000 if is_char else 2000
        if out["tris"] > budget:
            errs.append(f"{rn}: {out['tris']} tris > {budget}")
        if out["miny"] < -0.01:
            errs.append(f"{rn}: lowest point y={out['miny']:.3f} is below the floor (origin must be at the base)")
        if out["maxy"] > 6.0 and kind != "char":
            errs.append(f"{rn}: {out['maxy']:.2f} m tall; wrong units?")
    # duplicate embedded images
    seen = {}
    for im in g.get("images", []):
        bv = g["bufferViews"][im["bufferView"]] if "bufferView" in im else None
        if bv:
            h = hashlib.sha1(binc[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]).hexdigest()
            if h in seen:
                errs.append(f"image {im.get('name')} embedded twice (same as {seen[h]})")
            seen[h] = im.get("name")
    if is_char:
        have = {a["name"] for a in g.get("animations", [])}
        if have != CLIPS:
            errs.append(f"clips {sorted(have)} != the 10 expected (missing {sorted(CLIPS - have)})")
        if not g.get("skins"):
            errs.append("character has no skin")
    return errs


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "assets", "models", "*.glb")))
    bad = 0
    for f in files:
        errs = lint(f)
        rel = os.path.relpath(f, ROOT)
        if errs:
            bad += 1
            print(f"  LINT FAIL {rel}")
            for e in errs:
                print(f"    - {e}")
        else:
            print(f"  lint ok   {rel}")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
