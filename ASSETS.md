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
| player / guards / civilians | `char_player`, `char_guard` (Meshy pilots), `char_civilian` (stand-in) | face +Z |

## Gear (weapons and gadgets): assets/models/gear.glb

Scripted, not generated: held objects need exact shapes. Everything is about 1.25× real size so it reads from the 55° camera. Look up pieces by name like the kit.
- **Held items** (`userData.rj_held`): `pistol_silenced`, `tranq_pistol`, `smg_compact`, `shotgun_pump`, `stun_baton`, `zip_ties`, `lockpick_kit`, `glass_cutter`, `body_bag_folded`, `keycard_cloner`, `mirror_kit`. **The origin is the right palm**, and the business end points **+Z** (forward). Add the piece to the `hand_R` attach bone and apply one fixed rotation per rig, so the gun's +Z lines up with the hand's forward.
- **Sockets** are empty child nodes: `<piece>_muzzle` (shots, tracers, flash; also the baton tip, the cutter cup and the mirror face) and `<piece>_grip2` (left hand on `smg_compact`, `shotgun_pump`). Placed items have `<piece>_grip`, for carrying them in the hand.
- **Placed or thrown items** have their origin on the floor under their centre: `noisemaker`, `ecm_jammer`, `smoke_grenade`, `medkit`, `c4`, `keycard`, `body_bag` (2 × 1 cells, filled, lying down) and `thermal_drill` (1 × 2 cells, bit pointing +Z into the vault door).
- **Children:** `thermal_drill_bit` spins about Z. `c4_timer` is `RJ_Danger` (armed; pulse it). `ecm_jammer_led` is `RJ_Ok` while jamming. `keycard_cloner_card` slides out when a copy is made.
- Red appears only on the armed C4 timer. The medkit cross and the baton electrodes are teal.

## Masks: assets/models/masks.glb

The five masks in `src/data/loadout.ts`, each fitted to the Meshy player's face: `mask_regular`, `mask_rumor`, `mask_suit`, `mask_objector`, `mask_headline` (`userData.rj_mask` holds the loadout id). Each has one painted 512 px texture, material `RJ_Lacquer_<id>`. The Suit adds gold glasses and The Headline a raised fold. They are 305–449 triangles each.
- **Space:** the character's model space (rest pose, feet at 0, facing +Z), so a mask sits exactly over the face. `userData.rj_bone = "Head"`.
- **Wear one:** `mask.applyMatrix4(sk.boneInverses[sk.bones.indexOf(head)]); head.add(mask);` where `head = player.getObjectByName('Head')`. Then hide the `RJ_Mask` mesh, so the texture mask under it doesn't peek through; `RJ_Face` stays as it is. Drop the colour tint, since the masks carry their own colours.
- **Show one alone** (a shelf, a card): use it as is and centre the camera on its bounds.
- The material names avoid the `RJ_Mask` prefix on purpose, so code that hides or tints `RJ_Mask*` leaves them alone.

## Characters

Load `assets/models/char_<name>.glb`. It is the Meshy model when one exists (`char_player`, `char_guard` today), and otherwise a copy of the stand-in. Stand-ins are also kept as `standin_<name>.glb`. Either way:
- **Attach points by role.** The rig node carries `userData.rj_attach`, e.g. `{"hand_R": "RightHand", "hand_L": "LeftHand", "head": "Head", "spine": "Spine02", "hips": "Hips"}` on Meshy rigs and `{"hand_R": "hand_R", ...}` on stand-ins. Do `obj.getObjectByName(attach.hand_R).add(gun)`.
- **Clips by name** through an `AnimationMixer`, from this set: `idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact`. Every character has at least `idle, walk, run, aim_shoot, hands_up`. A missing clip falls back to `idle`, never to the bind pose.
- Clone with `SkeletonUtils.clone`. Metres, feet at y = 0, facing +Z, no net root travel (the lint checks this).
- Meshy rigs are 24-joint Mixamo-style (`Hips`, `Spine`, `Spine01`, `Spine02`, `neck`, `Head`, `LeftArm`, `LeftForeArm`, `LeftHand`, …) with the bones stored in centimetres under a 0.01 scale. Use world positions, not raw bone `position` values.

Stand-in skeleton, for reference: `hips > spine > head`, `spine > upperarm_L/R > forearm_L/R > hand_L/R`, `hips > thigh_L/R > shin_L/R`. It has all 10 clips.

**Each Meshy character keeps its own Meshy rig. They are not retargeted onto the stand-in skeleton.** Clips retargeted onto a shared rig tear meshes (see the `opengame-characters` skill), so every Meshy figure plays library clips on the rig Meshy made for it. What stays stable for game code:
- **Clip names.** Each Meshy GLB will expose the same 10 names, renamed from Meshy's library actions at import.
- **Attach points by role, not by bone name.** Code asks for `attach('hand_R')` through a per-model map. The stand-in maps to `hand_R`; Meshy's rig has 24 joints, no fingers, and torso bones numbered in the opposite direction to Mixamo, so its map is filled in at import.
- **Same convention.** Metres, Y-up, facing +Z, origin at the feet, no root motion (the sim moves the root; clips only bob and sway).

## Sponsor tools and evidence (OpenGame tracks: Meshy, fal, ElevenLabs)

The entry form asks for evidence of what each sponsor tool produced, so every generated file gets a row here, plus a line in the spend ledger (`tools/gen/spend.jsonl`, written **before** each paid call). Generation runs on Kyle's machine with keys from the environment (`MESHY_API_KEY`, `FAL_KEY`). Keys never go in the repo or the game, and only finished files ship.

| Tool | Used for | Status | Caps (set by Kyle) |
| --- | --- | --- | --- |
| Meshy | Player, guards, police ×3, civilians, staff, the Accountant, Dot | Pilots done through the API: player and guard textured, rigged and animated (`char_player.glb`, `char_guard.glb`), waiting on Kyle's in-game review before the batch. | 150 credits for the pilots (64 used), 100-credit reserve; balance 1,036 of 1,100 |
| fal | Concept art, model sheets, item icons, posters, title and cover art | Waiting on Kyle's go-ahead | not set |
| ElevenLabs | Voices, SFX, music (audio session) | not started here | not set |

**Meshy plan (`opengame-assets` / `opengame-characters`):**
1. A canon sheet per character first: a front/side A-pose turnaround in our style (chunky, slightly big head and hands, close-fitting clothes, arms well out from the body, no long coats). Look at it before buying any mesh.
2. **Pilot two bodies end to end** before any batch: the player (masked, suit) and a guard (heavier build, cap). Mesh at a set polycount (target 5–8k triangles), then clean, rig, add clips, then check them in the game from the 55° camera beside the canon sheet.
3. Pick clips by **id** from Meshy's library after watching the preview, because names mislead. Check that the library covers our 10 clips. Carry, hands-up and zip-tied are the doubtful ones; anything missing gets a scripted clip on that figure's own rig.
4. Every job is recorded (request, job id, file hash) and downloaded right away, because Meshy deletes results after 3 days. A timeout is recovered by polling the job id, never by buying again.
5. Only then the batch: police ×3, civilians and staff, the Accountant, Dot.

Generated-file evidence (one row per file: tool, model version, job id, date, cost, used as):

| File | Tool | Job id | Date | Cost | Used as |
| --- | --- | --- | --- | --- | --- |
| `assets/gen/meshy/pilot-player-preview_glb.glb` | Meshy text-to-3d preview, meshy-6-lite | `01a1ef58-8969-7056-8352-1bfbfdbea4cf` | 2026-11-18 | 5 credits | Player pilot, untextured shape check (7,261 tris, A-pose) |
| `assets/gen/meshy/pilot-guard-preview_glb.glb` | Meshy text-to-3d preview, meshy-6-lite | `01a1ef5a-7457-740d-bff1-635148f4e37b` | 2026-11-18 | 5 credits | Guard pilot, untextured shape check (7,247 tris, A-pose) |
| `assets/gen/meshy/pilot-player-refine_glb.glb` | Meshy text-to-3d | `01a1ef65-da8b-73ec-bf57-e7d9aceed677` | 2026-11-18 | 10 credits | Player pilot: textured mesh (meshy-6-lite, no PBR) |
| `assets/gen/meshy/pilot-guard-refine_glb.glb` | Meshy text-to-3d | `01a1ef66-8dba-7475-bdcb-c9627927bf38` | 2026-11-18 | 10 credits | Guard pilot: textured mesh (meshy-6-lite, no PBR) |
| `assets/gen/meshy/pilot-player-rig_rigged_character_glb_url.glb`, `assets/gen/meshy/pilot-player-rig_walking_armature_glb_url.glb`, `assets/gen/meshy/pilot-player-rig_running_armature_glb_url.glb` | Meshy rigging | `01a1ef67-4844-7524-81ea-d7b61da92bec` | 2026-11-18 | 5 credits | Player pilot: auto-rig at 1.8 m, plus the free walk and run clips |
| `assets/gen/meshy/pilot-guard-rig_rigged_character_glb_url.glb`, `assets/gen/meshy/pilot-guard-rig_walking_armature_glb_url.glb`, `assets/gen/meshy/pilot-guard-rig_running_armature_glb_url.glb` | Meshy rigging | `01a1ef67-ab2c-71f6-b63c-8f6dfc9c91cd` | 2026-11-18 | 5 credits | Guard pilot: auto-rig at 1.8 m, plus the free walk and run clips |
| `assets/gen/meshy/pilot-player-idle_animation_glb_url.glb` | Meshy animations | `01a1ef68-dc07-707a-b645-02c192b4e4b6` | 2026-11-18 | 3 credits | Player pilot: `idle` clip (library action 0) |
| `assets/gen/meshy/pilot-player-crouch_walk_animation_glb_url.glb` | Meshy animations | `01a1ef69-26da-75c0-8ea3-9e9d64fc58cc` | 2026-11-18 | 3 credits | Player pilot: `crouch_walk` clip (library action 524) |
| `assets/gen/meshy/pilot-player-aim_shoot_animation_glb_url.glb` | Meshy animations | `01a1ef69-58cb-76e5-8286-10593b4bc56c` | 2026-11-18 | 3 credits | Player pilot: `aim_shoot` clip (library action 234) |
| `assets/gen/meshy/pilot-player-interact_animation_glb_url.glb` | Meshy animations | `01a1ef69-86a8-769f-8bd0-68d8fb2d2d04` | 2026-11-18 | 3 credits | Player pilot: `interact` clip (library action 165) |
| `assets/gen/meshy/pilot-guard-idle_animation_glb_url.glb` | Meshy animations | `01a1ef69-b46f-715b-9fd7-f24f57357782` | 2026-11-18 | 3 credits | Guard pilot: `idle` clip (library action 0) |
| `assets/gen/meshy/pilot-guard-aim_shoot_animation_glb_url.glb` | Meshy animations | `01a1ef69-e39d-775b-b444-03082039fbe9` | 2026-11-18 | 3 credits | Guard pilot: `aim_shoot` clip (library action 234) |
| `assets/gen/meshy/pilot-guard-ziptied_animation_glb_url.glb` | Meshy animations | `01a1ef6a-127e-71aa-bf88-7867aab8d714` | 2026-11-18 | 3 credits | Guard pilot: `ziptied` clip (library action 363) |
| `assets/gen/meshy/pilot-player-carry_walk_animation_glb_url.glb` | Meshy animations | `01a1ef6a-6032-7561-994d-7078272906d4` | 2026-11-18 | 3 credits | Player pilot: `carry_walk` clip (library action 552) |

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
| `bag_light` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 112 tris. duffel, long axis X, pivot on the floor under its centre; jewelry: 90% speed, sprint ok, throw 6 m. |
| `bag_medium` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 112 tris. duffel, long axis X, pivot on the floor under its centre; cash: 75% speed, no sprint, throw 4 m. |
| `bag_heavy` | script `tools/blender/props_build.py` | done | `assets/models/props.glb` | 112 tris. duffel, long axis X, pivot on the floor under its centre; gold / paintings: 60% speed, throw 3 m. |
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
| `pistol_silenced` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 148 tris. pocket pistol with suppressor (start weapon); origin at the palm, muzzle +Z. Children: `pistol_silenced_muzzle`. |
| `tranq_pistol` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 174 tris. tranq pistol: teal grip panels, CO2 bulb under the barrel, dart in the muzzle. Children: `tranq_pistol_muzzle`. |
| `smg_compact` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 124 tris. compact SMG, two-handed: _grip2 on the foregrip, folded stock. Children: `smg_compact_grip2`, `smg_compact_muzzle`. |
| `shotgun_pump` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 176 tris. pump shotgun, two-handed: _grip2 on the wooden pump. Children: `shotgun_pump_grip2`, `shotgun_pump_muzzle`. |
| `stun_baton` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 136 tris. stun baton: silent melee takedown; electrodes are RJ_Ok (teal), not red. Children: `stun_baton_muzzle`. |
| `zip_ties` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 240 tris. bundle of 4 zip ties, loops lying flat so they read from above (held). |
| `lockpick_kit` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 204 tris. leather lockpick wallet, open, picks fanned out (held). |
| `noisemaker` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 116 tris. throwable noisemaker: a squat speaker puck, origin on the floor; _grip for carrying. Children: `noisemaker_grip`. |
| `glass_cutter` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 140 tris. suction-cup circle glass cutter (held, cup end forward). Children: `glass_cutter_muzzle`. |
| `body_bag_folded` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 36 tris. folded body bag, as carried (held). |
| `body_bag` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 100 tris. filled body bag lying on the floor, 2 x 1 cells; long axis X, origin on the floor. |
| `ecm_jammer` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 148 tris. ECM jammer placed on the floor; child ecm_jammer_led starts RJ_Ok (cameras and pagers off for 20 s). Children: `ecm_jammer_grip`, `ecm_jammer_led`. |
| `keycard_cloner` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 72 tris. handheld keycard cloner; child keycard_cloner_card slides out when a copy is made. Children: `keycard_cloner_card`. |
| `keycard` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 48 tris. bank keycard (the manager carries one): white card, teal stripe, gold chip; lies flat, origin under its centre. |
| `smoke_grenade` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 116 tris. smoke grenade canister, stands on its base; _grip for holding. Children: `smoke_grenade_grip`. |
| `medkit` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 54 tris. medkit case with a TEAL cross (red stays reserved for danger); stands on its base. Children: `medkit_grip`. |
| `c4` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 100 tris. C4 charge: two putty blocks, taped detonator; child c4_timer is RJ_Danger (armed = danger). Origin on the floor. Children: `c4_grip`, `c4_timer`. |
| `mirror_kit` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 136 tris. telescopic inspection mirror for bending laser beams (held); mirror face at the far end. Children: `mirror_kit_muzzle`. |
| `thermal_drill` | script `tools/blender/gear_build.py` | done | `assets/models/gear.glb` | 326 tris. thermal drill on its stand, ~1.1 m long, bit points +Z (into the vault door); child thermal_drill_bit spins about Z; the status screen (RJ_Screen) faces the back. Children: `thermal_drill_bit`. |
| `mask_regular` | script `tools/blender/masks_build.py` | done | `assets/models/masks.glb` | 305 tris. The Regular; wear on the Head bone (see masks_build.py). |
| `mask_rumor` | script `tools/blender/masks_build.py` | done | `assets/models/masks.glb` | 305 tris. The Rumor; wear on the Head bone (see masks_build.py). |
| `mask_suit` | script `tools/blender/masks_build.py` | done | `assets/models/masks.glb` | 417 tris. The Suit; wear on the Head bone (see masks_build.py). |
| `mask_objector` | script `tools/blender/masks_build.py` | done | `assets/models/masks.glb` | 305 tris. Conscientious Objector; wear on the Head bone (see masks_build.py). |
| `mask_headline` | script `tools/blender/masks_build.py` | done | `assets/models/masks.glb` | 449 tris. The Headline; wear on the Head bone (see masks_build.py). |
| `char_player` | Meshy (pilot), imported by `tools/blender/meshy_build.py` | done (pilot, pending Kyle's review) | `assets/models/char_player.glb` | 7549 tris, own Meshy rig, clips: aim_shoot, carry_walk, crouch_idle, crouch_walk, hands_up, idle, interact, run, walk |
| `char_guard` | Meshy (pilot), imported by `tools/blender/meshy_build.py` | done (pilot, pending Kyle's review) | `assets/models/char_guard.glb` | 7242 tris, own Meshy rig, clips: aim_shoot, hands_up, idle, run, walk, ziptied |
| `standin_player` | script (stand-in) | placeholder | `assets/models/standin_player.glb` | shared stand-in rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
| `standin_guard` | script (stand-in) | placeholder | `assets/models/standin_guard.glb` | shared stand-in rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
| `standin_civilian` | script (stand-in) | placeholder | `assets/models/standin_civilian.glb` | shared stand-in rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
| `char_civilian` | script (stand-in) | placeholder | `assets/models/char_civilian.glb` | shared stand-in rig, clips: idle, walk, run, crouch_idle, crouch_walk, carry_walk, aim_shoot, hands_up, ziptied, interact |
<!-- RJ-TABLE:END -->
