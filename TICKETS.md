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
- [ ] Combat: mouse aim + click fire, R reload, ammo, pocket pistol (silenced 6 m), HP 100 + armor regen 4 s; cops shoot back. Cuffing by proximity stands in until then.
- [ ] Intimidate (shout) civilians into cowering; right now only the alarm makes them cower
- [ ] Body bags / drag a body into a closet
- [ ] Panic button (civilians run to it; breaker kills it)
- [ ] Guards fight in the loud phase (right now they just chase and cuff)
- [ ] Swap graybox for the Blender kit + Meshy characters (assets/models/*.glb exist; contract note in the shared notes folder)
- [ ] Audio: stealth/loud stems, barks, SFX hooks off sim events

## Open questions for Kyle
- Detection is spec-exact. Two calls to make by feel: should standing still count as "walk" (1.0, current) or lower? Should guards notice you bumping into them from behind (a small all-around radius)? It's off now (spec has none).
- Unmasked + camera: I made the desk send the nearest guard to check (no alarm). Spec only covers the masked case.
- Pagers: I read "the Dispatcher's patience runs out on the fourth call" as 3 answers OK and the 4th trips the alarm.
- An untied downed guard wakes after 40 s and calls it in (not in the spec; it's what makes zip ties matter).
- Jewelry stacks into one light bag up to $12k (so the store isn't 8 trips). Tune or drop.

## Bugs / tech debt
- External tilesets (.tsx) aren't supported; embed tilesets in the map.
- HUD meters are DOM positioned via `worldToScreen` (not true 3D sprites): fine for top-down, revisit if first person.
- Cops path straight at the player through guard-only doors; no cover/flanking AI yet.
