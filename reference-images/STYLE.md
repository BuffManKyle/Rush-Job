# Rush Job — Style guide

Status: **draft v1, waiting on Kyle's approval** (Nov 18). Built from the draft in `DESIGN.md` → "Art direction & asset pipeline". The palette and materials below are live in `tools/blender/rj.py` (`PAL`, `MATS`); change them there and re-run `py tools/blender/build.py`.

## The look in one line

Stylized low-poly with a slick noir-pop finish: chunky shapes, flat colour, navy night, sodium-orange light, and one accent per heist. Red means danger, and nothing else.

## Rules

1. **Chunky, readable silhouettes.** Things are read from about 55° above at a distance, so shapes come first and detail second. Bevels and trim are big enough to see at game zoom, or they're cut. Characters have slightly oversized heads and hands so poses read from above.
2. **Flat colour.** Each surface is one colour from the palette. No photo textures, no painted detail.
3. **One texture.** `assets/textures/rj_tile.png` is a 256 px grayscale tile (2 × 2 tiles with grout lines). Floors and brick multiply it by their colour; the UV scale per material turns the same image into 1 m slabs, 0.5 m tiles, brick courses or wood planks. Every other material is untextured.
4. **Night palette.** Shadows and backgrounds are deep navy and teal, never black-gray. Interior light is warm sodium orange. Light sources are emissive materials, so the game can tint or pulse them in code.
5. **Red is danger.** Only `RJ_Danger` is red: alarms, a fully alert vision cone, police lights, a camera's recording LED, a keypad rejecting a code. No red props, no red walls, no red brick (our brick is brown).
6. **Amber hatch means restricted.** Staff-only floors get the amber and black hatched trim strip at their boundary. Nothing else uses amber hatching. Plain amber can appear elsewhere, but sparingly.
7. **Wall tops are ink.** Wall caps are the darkest navy, so from above the floor plan reads like a drawn map, and the cutaway stub reads as a line.
8. **One accent per heist.** Jewelry Store: teal and gold. Bank: green marble and brass. Gallery: white and magenta lasers.
9. **Low metalness.** Metalness stays at 0.35 or below: the game has no environment map, and fully metallic surfaces render near-black in three.js without one. Gold reads as gold through colour, not reflections.
10. **Budgets.** Props under 2k triangles (most are under 500), characters 5–8k, a full heist on screen under 300k, the whole game under 30 MB.

## Palette

Values are sRGB hex. Swatches are the names used in `rj.py`.

| Group | Name | Hex | Use |
| --- | --- | --- | --- |
| Night | `navy_deep` | `#141d33` | Wall caps, jewel-tray velvet, darkest shadow |
| | `navy` | `#22304f` | Background, baseboards |
| | `navy_light` | `#3a4d74` | Spare light navy |
| Jewelry accent | `teal_dark` | `#0f4c5c` | Showroom floor |
| | `teal` | `#1f8a8a` | Case bases, signage, trims |
| | `teal_light` | `#6cc5b9` | Screens, fill light, "OK" lights |
| | `gold` | `#d9a93f` | Jewelry, shop door frame, case rails |
| | `gold_dark` | `#9c7426` | Shaded gold |
| Light | `sodium` | `#ff9a3c` | Lamps, the key light's colour |
| | `sodium_pale` | `#ffd59a` | Key-light tint, UI highlight |
| Signal | `danger` | `#e0262f` | **Danger only** |
| | `amber` | `#f2b230` | Restricted hatch |
| | `hatch` | `#1b1b1f` | Restricted hatch, dark stripe |
| Architecture | `plaster` | `#e2d6bd` | Interior walls, ceilings |
| | `plaster_shade` | `#b9ab90` | Spare |
| | `brick` | `#7a5446` | Exterior walls (brown, never red) |
| | `concrete` | `#8d9096` | Back rooms, curbs |
| | `sidewalk` | `#a7a59e` | Sidewalk, alley |
| | `asphalt` | `#2c2f36` | Street |
| | `linoleum` | `#c9c3b1` | Office floors |
| | `carpet` | `#3b3550` | Office carpet |
| Wood | `wood_dark` | `#4a3226` | Door and window frames, panels |
| | `wood` | `#7b5236` | Doors, desks, wood floor |
| | `wood_light` | `#b08458` | Spare |
| Metal | `steel` | `#8a9199` | Handles, hinges, fittings |
| | `steel_dark` | `#3a3f47` | Metal doors, cabinets, camera bodies |
| | `safe` | `#3d4a45` | Safe body |
| Misc | `black` | `#16171b` | Rubber, screens off, details |
| | `white` | `#f2efe8` | Marble, paper |
| | `glass` | `#a8dede` | Glass, at 28% opacity |
| | `plant` | `#3f7a55` | Plants |
| | `van` | `#86cdb0` | Dot's van (mint) |
| | `rubber` | `#202125` | Tyres |
| | `fabric` | `#34373e` | Body bags, straps, tape |
| | `bag` | `#6f7788` | Loot bags: slate canvas, lighter than the suits so a carried bag reads from above |
| | `paper` | `#f4e48a` | Sticky notes (the safe code) |
| | `cash` | `#6f9a55` | Cash stacks |
| Masks | `mask_white` | `#f2efe8` | The Regular |
| | `mask_slate` | `#5d6577` | The Rumor (black redaction bars) |
| | `mask_cream` | `#e8dcc4` | The Suit (gold glasses, black hair and moustache) |
| | `mask_yellow` | `#f2c94c` | Conscientious Objector (white dove, black outline, olive sprig) |
| | `mask_news` / `news_ink` | `#e9e4d6` / `#8a857a` | The Headline (newsprint) |
| | `headline_orange` | `#f08a24` | The Headline's price tag (orange, not red) |
| Cast (stand-ins) | `skin` | `#c99a78` | |
| | `suit` | `#2b2b30` | Player suit |
| | `uniform` | `#2f4470` | Guard uniform |
| | `mask` | `#f2efe8` | Player mask |

## Shared materials

Every shipped mesh uses only these, named `RJ_<Name>` in the GLB so the game can find them (e.g. to pulse `RJ_Danger` during the alarm, or swap `RJ_Glass` for a cracked look).

| Material | Colour | Notes |
| --- | --- | --- |
| `RJ_Plaster` | plaster | Interior walls, ceilings |
| `RJ_Brick` | brick | Tile texture, scale 2 × 4 per m (brick courses) |
| `RJ_WallCap` | navy_deep | Top face of every wall |
| `RJ_Baseboard` | navy | 12 cm skirting on every wall |
| `RJ_Trim` | wood_dark | Door and window casings, sills |
| `RJ_FloorShowroom` | teal_dark | Texture, 1 m tiles, glossy |
| `RJ_FloorMarble` | white | Texture, 1 m slabs (bank) |
| `RJ_FloorWood` | wood | Texture, 0.5 m × 12.5 cm planks |
| `RJ_FloorCarpet` | carpet | Flat |
| `RJ_FloorConcrete` | concrete | Texture, 1 m slabs |
| `RJ_FloorLino` | linoleum | Texture, 0.5 m tiles |
| `RJ_Sidewalk` | sidewalk | Texture, 0.5 m slabs |
| `RJ_Asphalt` | asphalt | Flat |
| `RJ_Amber`, `RJ_Hatch` | amber, hatch | Restricted trim only |
| `RJ_Wood`, `RJ_WoodDark` | wood, wood_dark | Furniture, doors |
| `RJ_Steel`, `RJ_SteelDark` | steel, steel_dark | Metallic |
| `RJ_Black`, `RJ_White`, `RJ_Cream` | | |
| `RJ_Gold` | gold | Metallic, low roughness |
| `RJ_Teal`, `RJ_TealDark`, `RJ_Navy` | | Jewelry accent pieces |
| `RJ_Glass` | glass | Alpha blend, 28% |
| `RJ_Velvet` | navy_deep | Jewel trays and busts |
| `RJ_Safe` | safe | Metallic |
| `RJ_Plant`, `RJ_VanPaint`, `RJ_Rubber`, `RJ_Fabric`, `RJ_BagCanvas`, `RJ_Paper`, `RJ_Cash` | | Loot bags use `RJ_BagCanvas`, with straps and a top stripe in the weight colour: teal (light), gold (medium), cream (heavy) |
| `RJ_Sodium` | sodium | **Emissive** 4.0: lamps |
| `RJ_Screen` | teal_light | **Emissive** 2.0: monitors |
| `RJ_Danger` | danger | **Emissive** 3.0: the only red |
| `RJ_Ok` | teal_light | **Emissive** 3.0: keypad accept, camera idle LED |
| `RJ_Skin`, `RJ_Suit`, `RJ_Uniform`, `RJ_Mask` | | Stand-in characters only |

## Lighting (for previews; the game's lighting lives in code)

- Background and ambient: `navy`.
- Key: one sun tinted `sodium_pale`, from the front-left and high.
- Fill: a weak sun tinted `teal_light`, from behind.
- Previews are orthographic at 25–60° elevation. The kit demo (`previews/kit_demo.png`) uses the game's 55° camera.

## Open for Kyle

- [ ] Approve the palette and rules above, or mark changes.
- [ ] Concept art first? fal costs money per image, and the image-tool decision is still open. Scripted models are going ahead in the meantime, so this doesn't block anything.
- [ ] Dot's van colour: mint (`#86cdb0`) is a placeholder for "upbeat", so pick another if you prefer.
