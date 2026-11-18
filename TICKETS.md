# Tickets

Running backlog for game code. See DESIGN.md "Jam schedule".
Status: [x] done · [~] partial · [ ] todo.

## How to play-test
- `npm install`, then `npm run dev` → http://localhost:5173 (the browser pane uses `.claude/launch.json`).
- `?seed=123` replays a run exactly. The seed shows on the pause screen (Esc) and the payout receipt.
- Controls: WASD (screen-relative) · Shift sprint · C crouch · E hold to interact · G hold to mask up · Q mark · F throw bag · wheel zoom · F1 debug · Esc pause.
- F1 debug: nav grid, routes (active bright, inactive dim), guard paths, noise radii, and per-observer detection math (why the meter moves). It also shows the shuffle results (spoilers).
- Console: `rj.sim` (read-only state), `rj.test.manual = true; rj.test.run(30, { moveY: -1 })` steps the sim by hand.

## Week 1 — core stealth (Nov 18–24)
- [x] Vite + TS + three.js scaffold
- [x] Fixed 30 Hz sim owns all state; view/HUD only read state or listen to events; render interpolates
- [x] Seeded RNG (`?seed=`), forked streams per system; seed on the pause screen
- [x] Camera module (`GameCamera`: follow / aimRay / worldToScreen / screenAxes): 55° top-down, mouse lead, wheel zoom
- [x] Cutaway walls fade to a 0.35 m stub between camera and player (door lintels and window heads vanish)
- [x] Tiled loader: tile layers (floor, walls/windows by tileset `kind` property), object layers (doors, props, zones, spawns, routes, cameras, shuffle, civilians, police spawns)
- [x] Nav grid + A* (8-way, no corner cutting, string-pulled)
- [x] Graybox Glint & Sons in `levels/glint.tmj` (bootstrapped by `scripts/gen-glint.mjs`; edit the .tmj in Tiled from now on)
- [x] Player: circle vs wall boxes, WASD screen-relative, Shift sprint (4 m noise), C crouch toggle
- [x] Detection per spec: cones, 40/s fill × distance × move × status × bag, 15/s drain after 1.5 s, 30/60/100
- [x] Guards: waypoint loops, "?" turn-to-look, investigate at 60 or on noise, search, give up, return, report (3 s radio → alarm)
- [x] Cameras: sweep, lock on, desk raises alarm 3 s after 100 (masked); unmasked trespass → desk dispatches nearest guard
- [x] Noise rings drawn in world; guards inside the radius investigate
- [x] Hold-to-interact (E) as data (`src/data/interactions.ts`): duration, noise, interrupt rules, progress ring, resumable lockpick
- [x] Doors: open/close, locked (lockpick 6 s), guards and civilians open doors and close them behind them; back door locked by shuffle
- [x] Casing: first catch unmasked in a staff area = escort to lobby; second = called in → alarm
- [x] Marking (Q): tag guard/camera under the cursor; marked cones draw through walls
- [x] Civilians (120°/8 m): customers + clerk wander; masked → scream (10 m noise), run to a guard who radios it in
- [x] Mask up (hold G 1.5 s)
- [x] F1 debug overlay
- [x] Dialogue as data by ID (`src/data/dialogue.ts`), placeholder text
- [x] Low cover (counters, cases, desks) hides a crouched player within 1.6 m
- [ ] Play-test with Kyle and tune (guard speed, cone range, fill feel)
- [ ] First-person go/no-go call (Nov 24). Camera rules respected so far: gameplay never reads the camera.

## Week 2 — Jewelry Store (Nov 25–Dec 1), in DESIGN.md order
- [x] Casing rules + marking
- [~] Mask up: done; needs the camera push-in and the sound sting
- [x] Takedowns (masked, from behind, or any side while he's radioing) + zip ties (4)
- [x] Pagers: ring 3 s after takedown, hold E 4 s, 10 s unanswered or hanging up = alarm, 4th call fails
- [x] Bodies: guards, cameras and civilians who see a downed/tied guard or tied civilian raise it
- [~] Display cases: smash (12 m noise) done; glass cutter (4 s, quiet) needs the gadget/loadout
- [x] Safe: code from the shuffled sticky note (read it, enter it, bag the gold)
- [x] Bags: light (jewelry, stacks to $12k) and heavy (gold); speed/sprint rules; F throws 6/4/3 m; secured in the van zone
- [x] Van: hold E in the drop zone to leave → payout
- [x] Alarm → Heat 1–4 clock (60 s each), hostages (tied civilians) delay each level 20 s (max 3), Dot leaves 60 s into Heat 4
- [x] Cops push in (front, then alley; shields at 3, tactical at 4); cuffed when they (or alert guards) hold you 2 s
- [x] Payout receipt (take, +25% clean, −10% Dot, −bail) + rating (Ghost/Professional/Pacifist/Loud/Cuffed)
- [x] Combat (`src/sim/combat.ts`): masked only. Hold left mouse to fire the silenced pocket pistol (12 + 24 rounds, 50 dmg, 6 m noise), R reloads (1.6 s). Hitscan stops at walls; spread doubles while moving.
  - A shot heard by a guard is called in (3 s window); civilians who hear it panic. A guard who's shot but standing calls it in.
  - Shot guards die (no pager, body still raises the alarm); shot civilians count as casualties ($5k cleanup, Bloodbath rating). Shot-out cameras go dark and the desk notices in 15 s.
  - Cops: patrol 100 HP, shield 150 (blocks from the front, 120°), tactical 200. Cops and alerted guards shoot back with line of sight within 14 m (hit chance falls with distance and when you sprint). HP 100, armor regen 4 s after the last hit (suit has 0 armor). At 0 HP you're cuffed. Proximity cuffing still applies.
- [ ] Combat follow-ups: weapon unlocks (tranq, SMG, shotgun, baton), vests, medkit; muzzle flash/hit sparks/sound; guards keep distance and take cover instead of rushing
- [ ] Intimidate (shout) civilians into cowering; right now only the alarm makes them cower
- [ ] Body bags / drag a body into a closet
- [ ] Panic button (civilians run to it; breaker kills it)
- [~] Guards fight in the loud phase: they shoot and chase; no cover AI yet
- [x] Blender kit swapped in (`src/view/kit.ts`, `src/view/kitLevel.ts`): instanced walls/windows/doorways/floors/trim with cutaway, door leaves, counter segments, display cases (intact → smashed → bagged; tall against walls), safe door + loot, van, desks, security cameras, sticky note, sign, bags. Stand-in characters with clips (idle/walk/run/crouch/carry/interact/hands_up/ziptied); cops reuse the guard rig, darkened. `?graybox` forces the old look; a failed load falls back to it too.
- [ ] Kit follow-ups: `floor_back` maps to lino everywhere (ASSETS.md wants concrete in the safe room, closet and hall, which needs a Tiled tile or zone); trim corners not placed; ceiling lamps left out (they read as dark blobs from 55°); ~340 draw calls with shadows (6 ms/frame at 1024×768 on the dev GPU): merge static props if integrated GPUs struggle
- [ ] Meshy characters when they land: per-model attach map (`attach('hand_R')`), same clip names
- [ ] Audio: stealth/loud stems, barks, SFX hooks off sim events

## Open questions for Kyle
- Lethality (design doc open question): guards and patrol cops die in 2 hits; enemies hit about 50% of the time for 8–14 damage, so you last about 10–12 hits. Tune by feel.
- Shooting a guard kills him (counts against Ghost/Pacifist). Should the pocket pistol knock out instead, leaving killing to the louder guns?
- Detection is spec-exact. Two calls to make by feel: should standing still count as "walk" (1.0, current) or lower? Should guards notice you bumping into them from behind (a small all-around radius)? It's off now (spec has none).
- Unmasked + camera: I made the desk send the nearest guard to check (no alarm). Spec only covers the masked case.
- Pagers: I read "the Dispatcher's patience runs out on the fourth call" as 3 answers OK and the 4th trips the alarm.
- An untied downed guard wakes after 40 s and calls it in (not in the spec; it's what makes zip ties matter).
- Jewelry stacks into one light bag up to $12k (so the store isn't 8 trips). Tune or drop.

## Jam platform (OpenGame) requirements
- Static `dist/` with `index.html` from `npm run build`; three.js bundled (no CDN); no login, ads or tracking. `opengame.json` and `.opengame/` belong to the design-review session, so leave them alone.
- [x] Fills 1024×640 and 3440×1440 (checked Nov 18); canvas resizes with the window
- [ ] HUD text is fixed px: tiny at 2560×1440 and 3440×1440. Scale the HUD with viewport height.
- [ ] Debug panel overlaps the status box at 1024×640 (debug only)
- [ ] Measure: fps at 1080p on integrated GPU (target median 45+), load time (<10 s), memory (<1.2 GB)

## Bugs / tech debt
- External tilesets (.tsx) aren't supported; embed tilesets in the map.
- HUD meters are DOM positioned via `worldToScreen` (not true 3D sprites): fine for top-down, revisit if first person.
- Cops path straight at the player through guard-only doors; no cover/flanking AI yet.
