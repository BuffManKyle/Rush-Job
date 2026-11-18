# Assets

One row per asset. Source: script / Meshy / fal. Status: needed / placeholder / done.
Owner: the assets session (`tools/blender/`, `assets/`, `reference-images/`). Style rules and palette: `reference-images/STYLE.md`.

## How to build

```
py tools/blender/build.py            # everything (about 40 s)
py tools/blender/build.py kit props  # just some libraries
```

Each `tools/blender/<lib>_build.py` writes `assets/models/<lib>.glb`, a contact sheet `reference-images/previews/<lib>_sheet.png` for review, and `reference-images/previews/<lib>/manifest.json` (every piece's triangles, children and glTF bounds). The table at the bottom is regenerated from the manifests. Details: `tools/blender/README.md`.

## Contract with the game code (agreed through this file)

**Units and axes.** Metres, glTF Y-up. A piece's front faces glTF **+Z**, which is south (down the screen) on the Tiled map. Tiled cell (col, row) → world `(col + 0.5, 0, row + 0.5)`. Rotations are about Y, and three.js `rotation.y = +90°` turns a piece's +X (east) to −Z (north).

**One GLB per library, one top-level node per piece.** Every piece sits at the origin of its file, so load the file once, find the node by name (`gltf.scene.getObjectByName('wall_full_int')`) and clone or instance it. A piece with several materials loads as a Group of Meshes: make one InstancedMesh per child mesh. Every node carries glTF extras `rj_kind` (wall / doorway / window / door / floor / trim / ceiling / prop) and `rj_cells` ([w, d] footprint); three.js puts them in `userData`.

**Pivots.**
- Grid pieces: centre of their 1 m cell, on the floor.
- Multi-cell props: centre of their footprint, on the floor (`rj_cells` gives the footprint).
- Moving parts are child nodes whose origin is the hinge or swivel: `door_*_leaf` (hinge at x = −0.46, like the graybox leaf), `safe_door`, `van_door_l/r`, `security_camera_head`.
- Hideable parts are child nodes: `*_glass` (cut or smashed), `*_jewels` / `safe_loot` (bagged), `*_led` (set its material to `RJ_Danger` when alarmed).

**Heights, matching `src/tuning.ts`.** Walls are 3.0 m (`view.wallHeight`), the cutaway stub is 0.35 m (`view.wallStub`), door openings are 2.1 m (`doors.height`), and windows run from 0.9 m to 2.3 m. If tuning changes, change `H`, `LOW_H`, `DOOR_H`, `SILL` and `HEAD` at the top of `kit_build.py` and rebuild.

**Cutaway.** Every `*_full_*` piece has a `*_low_*` twin with the same footprint. Swap full → low, or keep the full piece and scale it on Y the way the graybox does: pieces are flat-coloured, so a Y squash looks fine. Hide door leaves (or scale them too) in cut-away cells.

**Materials.** Only shared `RJ_*` materials ship (list in `STYLE.md`). `RJ_Glass` is alpha-blended. `RJ_Sodium`, `RJ_Screen`, `RJ_Danger` and `RJ_Ok` are emissive. Metalness stays ≤ 0.35 because the game has no environment map.

**Compression.** Pending. The GLBs are plain (no meshopt yet): about 0.8 MB for everything so far. `build.py` meshopt-compresses automatically once `gltfpack` is on PATH. Keep GLTFLoader's `MeshoptDecoder` ready; it does no harm on uncompressed files.

## Tiled → kit mapping (levels/glint.tmj)

Walls, windows and doors are whole cells, the same as the graybox and the collision grid.

| Tiled | Kit piece | Rotation |
| --- | --- | --- |
| floor tile `floor_showroom` | `floor_showroom` | 0 |
| floor tile `floor_back` | `floor_lino` (offices), `floor_concrete` (safe room, closet, back hall) | 0 |
| floor tile `floor_sidewalk` | `floor_sidewalk` (+ `curb` on the row next to the street) | 0 |
| floor tile `floor_asphalt` | `floor_asphalt` | 0 |
| wall tile `wall` | `wall_full_ext` on the building's outer ring, `wall_full_int` inside | 0 |
| wall tile `window` | `window_full_ext`, or `window_shop_full` on the storefront row (y = 19) | 0 if wall neighbours are east/west, else 90° |
| door object | `doorway_full_int` / `_ext` + a leaf: `door_glass` (front_door), `door_metal` (safe_room_door, closet_door, back_door), `door_wood` (others) | same rule as windows |
| zone `restricted` | `trim_restricted` along each inside edge of the rect, `trim_restricted_corner` at inside corners | strip on the south edge at 0; −90° west, 180° north, 90° east |
| prop `counter` (9 × 1) | 9 × 1 m segments: `counter`, with `counter_glass` and one `counter_register` mixed in, and `counter_end` at both ends | 0 (customer side south) |
| prop `case` (1 × 1) | `display_case` → `display_case_smashed` / `display_case_empty` as it's looted; `display_case_tall` against walls | 0 |
| prop `desk` (3 × 1) | `desk_office` + `office_chair` | 0 |
| prop `security_desk` (2 × 1) | `security_desk` + `office_chair` | 0 (screens face north) |
| prop `safe` | `safe` | 0 (door south) |
| prop `van` (4 × 4 rect) | `van` at the rect centre | 0 (rear doors south, toward `van_drop`) |
| camera point | `security_camera` at the point, `rotation.y` from `yaw` | lens is +X at 0, which matches Tiled yaw 0 = east |
| code_note point | `sticky_note`, lifted to the surface height | any |
| bags | `bag_light` / `bag_medium` / `bag_heavy` (`userData.rj_weight`) | any |
| player / guards / civilians | `char_player`, `char_guard`, `char_civilian` (stand-ins) | face +Z |

## Characters (stand-ins until Meshy)

`char_*.glb` share one skeleton: `hips > spine > head`, `spine > upperarm_L/R > forearm_L/R > hand_L/R`, `hips > thigh_L/R > shin_L/R` (underscores, because three.js strips dots from node names). Attach guns and bags to `hand_R`. Clips (looping, 30 fps): `idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact`. Use an `AnimationMixer` and look clips up by name. The Meshy characters will ship with the same clip names, and code should go through a small bone-name map for the hand attach point.

## Asset table

<!-- RJ-TABLE:BEGIN (generated by tools/blender/assets_table.py) -->
| Asset | Source | Status | Path | Notes |
| --- | --- | --- | --- | --- |
| `wall_full_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 18 tris. one wall cell (plaster). |
| `wall_low_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 18 tris. one wall cell (plaster). |
| `wall_full_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 18 tris. one wall cell (brick, building exterior). |
| `wall_low_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 18 tris. one wall cell (brick, building exterior). |
| `doorway_full_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 102 tris. door cell: lintel 2.1-3.0 m over a 1 m opening, passage along Z. |
| `doorway_low_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 10 tris. door cell: lintel 2.1-3.0 m over a 1 m opening, passage along Z; low = threshold only. |
| `doorway_full_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 102 tris. door cell: lintel 2.1-3.0 m over a 1 m opening, passage along Z. |
| `doorway_low_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 10 tris. door cell: lintel 2.1-3.0 m over a 1 m opening, passage along Z; low = threshold only. |
| `window_full_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 78 tris. window cell: sill 0.9 m, head 2.3 m; child glass is hideable (smashed). Children: `window_full_int_glass`. |
| `window_low_int` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 10 tris. window cell: sill 0.9 m, head 2.3 m; child glass is hideable (smashed). |
| `window_full_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 78 tris. window cell: sill 0.9 m, head 2.3 m; child glass is hideable (smashed). Children: `window_full_ext_glass`. |
| `window_low_ext` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 10 tris. window cell: sill 0.9 m, head 2.3 m; child glass is hideable (smashed). |
| `window_shop_full` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 46 tris. storefront cell: glass 0.35-2.5 m, gold mullion; child glass hideable. Children: `window_shop_full_glass`. |
| `window_shop_low` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 6 tris. storefront cell: glass 0.35-2.5 m, gold mullion; child glass hideable. |
| `door_wood` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 138 tris. staff / office door; child 'door_wood_leaf' hinges at x=-0.46 (rotate about Y to open), like the graybox leaf. Children: `door_wood_leaf`. |
| `door_metal` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 148 tris. security closet / safe room door; child 'door_metal_leaf' hinges at x=-0.46 (rotate about Y to open), like the graybox leaf. Children: `door_metal_leaf`. |
| `door_glass` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 138 tris. shop entrance, gold frame; child 'door_glass_leaf' hinges at x=-0.46 (rotate about Y to open), like the graybox leaf. Children: `door_glass_leaf`. |
| `floor_showroom` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_marble` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_wood` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_carpet` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_concrete` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_lino` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_sidewalk` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `floor_asphalt` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad at y=0; texture tiles seamlessly across cells. |
| `ceiling` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. 1 x 1 m quad facing down at y=3.0; hide it for the top-down camera. |
| `curb` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 6 tris. sidewalk-to-road edge along the cell's south (+Z) edge, 0.15 m high; lay on the sidewalk row. |
| `trim_restricted` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 20 tris. hatched strip on the cell's south (+Z) edge, inside the restricted side; rotate per edge. |
| `trim_restricted_corner` | script `tools/blender/kit_build.py` | done | `assets/models/kit.glb` | 2 tris. fills the SW corner where two strips meet (inner corners). |
| `security_camera` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 130 tris. pivot on the floor under the swivel; child 'security_camera_head' swivels about Y at y=2.45, lens looks +X (east) at rotation 0 (= Tiled yaw 0); 'security_camera_led' is RJ_Ok, set it to RJ_Danger when it sees you. Children: `security_camera_head`, `security_camera_led`. |
| `keypad` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 156 tris. number pad; pivot = centre of the wall cell it hangs on, panel on the -Y (south) face at 1.25 m; child 'keypad_led' starts RJ_Ok (swap to RJ_Danger on a wrong code). Children: `keypad_led`. |
| `card_reader` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 48 tris. keycard slot (bank); pivot = centre of the wall cell it hangs on, panel on the -Y (south) face at 1.25 m; child 'card_reader_led' starts RJ_Ok (swap to RJ_Danger on a wrong code). Children: `card_reader_led`. |
| `safe` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 326 tris. back-room safe, door faces south; child 'safe_door' hinges at the front-left corner (rotate about Y, negative = open outward to the left); 'safe_loot' hides once bagged. Children: `safe_door`, `safe_loot`. |
| `bag_light` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 100 tris. duffel, long axis X, pivot on the floor under its centre; jewelry: 90% speed, sprint ok, throw 6 m. |
| `bag_medium` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 100 tris. duffel, long axis X, pivot on the floor under its centre; cash: 75% speed, no sprint, throw 4 m. |
| `bag_heavy` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 100 tris. duffel, long axis X, pivot on the floor under its centre; gold / paintings: 60% speed, throw 3 m. |
| `van` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 412 tris. Dot's van: nose north (-Z), rear doors south (+Z) toward the drop zone; children 'van_door_l'/'van_door_r' hinge at the rear corners (rotate about Y); fits the 4 x 4 Tiled rect lengthwise with room to spare. Children: `van_door_l`, `van_door_r`. |
| `desk_office` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 238 tris. owner's desk, 3 x 1 cells (matches Tiled 'desk'); front = customer side (south), chair side north. |
| `security_desk` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 134 tris. security monitors, 2 x 1 cells; guard sits on the north side facing the screens; the screens (RJ_Screen) face north. |
| `office_chair` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 196 tris. faces south (-Y blender / +Z glTF); swivel freely. |
| `filing_cabinet` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 98 tris. 0.5 x 0.6, drawers face south. |
| `bookshelf` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 498 tris. 1 x 0.35 m, open side south. |
| `plant` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 104 tris. potted plant, 0.4 m pot. |
| `lamp_ceiling` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 68 tris. hanging pendant, pivot on the floor under it, shade bottom at 2.25 m; RJ_Sodium is emissive. |
| `trash_bin` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 36 tris. 0.3 m bin. |
| `sticky_note` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 36 tris. the safe code: an 8 cm note lying flat at y=0.002; lift it onto a desk/counter top in code (set position.y to the surface height). |
| `water_cooler` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 48 tris. break-room filler. |
| `display_case` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 600 tris. 1 x 1 cell glass case on a teal plinth; children _glass and _jewels. Children: `display_case_glass`, `display_case_jewels`. |
| `display_case_smashed` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 487 tris. after the glass is smashed (loud) or cut: jagged glass stubs, shards on the floor; _jewels child still there until bagged. Children: `display_case_smashed_glass`, `display_case_smashed_jewels`. |
| `display_case_empty` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 152 tris. looted: intact glass, bare velvet. Children: `display_case_empty_glass`. |
| `display_case_tall` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 1192 tris. wall-standing case, back to the north wall; children _glass and _jewels (3 shelves). Children: `display_case_tall_glass`, `display_case_tall_jewels`. |
| `counter` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 42 tris. 1 m segment of the sales counter (wood top); lay along X, customer side south; shoulder-height cover (1.0 m). |
| `counter_glass` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 408 tris. 1 m counter segment with a glass jewelry top; children _glass and _jewels. Children: `counter_glass_glass`, `counter_glass_jewels`. |
| `counter_register` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 88 tris. 1 m counter segment with the cash register (faces the staff side, north). |
| `counter_end` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 10 tris. end cap: a closed panel on the segment's +X (east) end; rotate 180 for the west end. |
| `sign_glint` | script `tools/blender/glint_build.py` | done | `assets/models/glint.glb` | 1504 tris. 'GLINT & SONS' fascia sign, 5 m wide; hang it on the storefront wall's south face above the door (pivot = cell centre at floor level, sign at 2.55-3.2 m). |
| `char_player` | script (stand-in for Meshy) | placeholder | `assets/models/char_player.glb` | shared rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
| `char_guard` | script (stand-in for Meshy) | placeholder | `assets/models/char_guard.glb` | shared rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
| `char_civilian` | script (stand-in for Meshy) | placeholder | `assets/models/char_civilian.glb` | shared rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
<!-- RJ-TABLE:END -->
