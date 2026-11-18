# Tickets

Running backlog for game code. Week 1 (Nov 18–24): core stealth. See DESIGN.md "Jam schedule".
Status: [x] done · [~] partial · [ ] todo. Newest notes at the bottom of each section.

## How to play-test
- `npm install`, then `npm run dev` → http://localhost:5173 (the browser pane uses `.claude/launch.json`).
- `?seed=123` replays a run exactly. The seed shows on the pause screen (Esc).
- F1 debug: nav grid, routes, paths, noise radii, and per-observer detection math (why the meter moves).
- Console: `rj.sim` (read-only state), `rj.test.manual = true; rj.test.run(30, { moveY: -1 })` steps the sim by hand.

## Week 1 — core stealth
- [x] Vite + TS + three.js scaffold
- [x] Fixed 30 Hz sim owns all state; view/HUD only read state or listen to events; render interpolates
- [x] Seeded RNG (`?seed=`), forked streams per system; seed on the pause screen
- [x] Camera module (`GameCamera`: follow / aimRay / worldToScreen / screenAxes): 55° top-down, mouse lead, wheel zoom
- [x] Cutaway walls fade to a 0.35 m stub between camera and player (door lintels and window heads vanish)
- [x] Tiled loader: tile layers (floor, walls/windows by tileset `kind` property), object layers (doors, props, zones, spawns, routes, cameras, shuffle)
- [x] Nav grid + A* (8-way, no corner cutting, string-pulled)
- [x] Graybox Glint & Sons in `levels/glint.tmj` (written by `scripts/gen-glint.mjs` once; edit the .tmj in Tiled from now on)
- [x] Player: circle vs wall boxes, WASD screen-relative, Shift sprint (4 m noise), C crouch toggle
- [x] Detection per spec: cones, 40/s fill × distance × move × status × bag, 15/s drain after 1.5 s, 30/60/100
- [x] Guards: waypoint loops, "?" turn-to-look, investigate at 60 or on noise, search, give up, return, report (3 s radio → alarm)
- [x] Cameras: sweep, lock on, desk raises alarm 3 s after 100 (masked); unmasked trespass → desk dispatches nearest guard
- [x] Noise rings drawn in world; guards inside the radius investigate
- [x] Hold-to-interact (E) as data (`src/data/interactions.ts`): duration, noise, interrupt rules, progress ring, resumable lockpick
- [x] Doors: open/close, locked (lockpick 6 s), guards open and close doors behind them; back door locked by shuffle
- [x] Casing: first catch unmasked in a staff area = escort to lobby; second = called in → alarm
- [x] Mask up (hold G 1.5 s)
- [x] F1 debug overlay
- [x] Dialogue as data by ID (`src/data/dialogue.ts`), placeholder text
- [x] Low cover (counters, cases, desks) hides a crouched player within 1.6 m
- [ ] Play-test with Kyle and tune (guard speed, cone range, fill feel)
- [ ] First-person go/no-go call (Nov 24) — camera rules respected so far: gameplay never reads the camera
- [ ] Marking (Q): tag guards/cameras, marked cones visible through walls
- [ ] Civilians (120°/8 m cone): customers + staff in the showroom

## Week 2 — Jewelry Store (in DESIGN.md order)
- [~] Casing rules (escort/second-strike done; Q marking todo)
- [~] Mask up (done; needs camera push-in + sting)
- [ ] Takedowns from behind + zip-tie
- [ ] Pagers (ring 3 s after takedown, hold E 4 s, 4 per job, 10 s timeout)
- [~] Display cases: smash (12 m) done; glass cutter (4 s, quiet) needs gadget
- [~] Bags: light bag + van drop zone done; throw (F), medium/heavy, one-bag rule UI
- [ ] Safe: code from the sticky note (shuffled location already placed)
- [ ] Van + Dot
- [ ] Alarm → loud phase, Heat 1–4 clock, cops, cuffed, payout screen

## Open questions for Kyle
- Detection is spec-exact. Two calls to make by feel: should standing still count as "walk" (1.0, current) or lower? Should guards notice you bumping into them from behind (a small all-around radius)? It's off now (spec has none).
- Unmasked + camera: I made the desk send the nearest guard to check (no alarm). Spec only covers the masked case.

## Bugs / tech debt
- External tilesets (.tsx) aren't supported; embed tilesets in the map.
- HUD meters are DOM positioned via `worldToScreen` (not true 3D sprites) — fine for top-down, revisit if first person.
