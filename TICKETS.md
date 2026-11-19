# Tickets

Running backlog for game code. See DESIGN.md "Jam schedule".
Status: [x] done · [~] partial · [ ] todo.

## How to play-test
- `npm install`, then `npm run dev` → http://localhost:5173 (the browser pane uses `.claude/launch.json`).
- The loadout screen ("the locker") opens before the job: your masked character in front of a wall, wearing the loadout. Click a slot next to the body (mask, weapon, gadget 1/2 on the belt, armor) to pick; hovering an option previews it on the character; drag to turn. Cash banked from payouts shows top right (`src/wallet.ts`, localStorage `rj.progress`). Enter starts; your pick is remembered in this browser. `?nopick` skips it with the last loadout. On the pause or payout screen, L reopens it and restarts.
- `?seed=123` replays a run exactly. The seed shows on the pause screen (Esc) and the payout receipt.
- Controls: WASD (screen-relative; you face where you walk) · Shift sprint · C crouch · E hold to interact · G hold to mask up · Q mark (cursor) · F throw bag · 1/2 use gadget slot · V shout (intimidate) · right mouse aim · left click/Space shoot · R reload · wheel zoom · F1 debug · Esc pause.
- F1 debug: nav grid, routes (active bright, inactive dim), guard paths, noise radii, and per-observer detection math (why the meter moves). It also shows the shuffle results (spoilers).
- Console: `rj.sim` (read-only state), `rj.test.manual = true; rj.test.run(30, { moveY: -1 })` steps the sim by hand. `rj.test.kit({ gadgets: ['noisemaker', 'smoke'], armor: 'heavy_vest' })` restarts the same seed with a loadout.

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

> **Ownership (Nov 18):** loadout and gadget slots, the gadgets (noisemaker, glass cutter, ECM, body bags, medkit, lockpick kit, keycard cloner), the pre-job loadout picker, intimidate, and the panic button and breaker belong to the **rj-gadgets** session. This session (game code) leaves them alone. Shared files (`sim.ts`, `hud.ts`, `interactions.ts`, `tuning.ts`, `input.ts`, `main.ts`): re-read right before editing, keep commits small.
- [x] Casing rules + marking
- [~] Mask up: done; needs the camera push-in and the sound sting
- [x] Takedowns (masked, from behind, or any side while he's radioing) + zip ties (4)
- [x] Pagers: ring 3 s after takedown, hold E 4 s, 10 s unanswered or hanging up = alarm, 4th call fails
- [x] Bodies: guards, cameras and civilians who see a downed/tied guard or tied civilian raise it
- [x] Display cases: smash (12 m noise); with the glass cutter in a slot, E cuts quietly (4 s). After the alarm, E smashes for speed.
- [x] Safe: code from the shuffled sticky note (read it, enter it, bag the gold)
- [x] Bags: light (jewelry, stacks to $12k) and heavy (gold); speed/sprint rules; F throws 6/4/3 m; secured in the van zone
- [x] Two bags at once (one per hand). With one bag you can still shoot and aim. With two: no shooting, aiming, takedowns or zip ties, no sprint, and an extra 0.85× speed. Movement follows the heavier bag. F throws the last bag picked up; jewelry tops up a light bag with room first.
- [x] Carry animation: legs play walk/run scaled to real speed (`view.walkAnimSpeed`/`runAnimSpeed`), with the bag arm(s) held in the idle pose (`walk@L`, `walk@LR`, ...). Bags are slung across the back at shoulder height (the second stacked on top), 0.7× size. At the player's sides the far bag hid behind the torso from the 55° camera. The Meshy `carry_walk` clip (9.3 s, box-carry cadence) is no longer used.
- [x] Van: hold E in the drop zone to leave → payout
- [x] Alarm → Heat 1–4 clock (60 s each), hostages (tied civilians) delay each level 20 s (max 3), Dot leaves 60 s into Heat 4
- [x] Cops push in (front, then alley; shields at 3, tactical at 4); cuffed when they (or alert guards) hold you 2 s
- [x] Payout receipt (take, +25% clean, −10% Dot, −bail) + rating (Ghost/Professional/Pacifist/Loud/Cuffed)
- [x] Combat (`src/sim/combat.ts`): masked only. Hold left mouse to fire the silenced pocket pistol (12 + 24 rounds, 50 dmg, 6 m noise), R reloads (1.6 s). Hitscan stops at walls; spread doubles while moving.
  - A shot heard by a guard is called in (3 s window); civilians who hear it panic. A guard who's shot but standing calls it in.
  - Shot guards die (no pager, body still raises the alarm); shot civilians count as casualties ($5k cleanup, Bloodbath rating). Shot-out cameras go dark and the desk notices in 15 s.
  - Cops: patrol 100 HP, shield 150 (blocks from the front, 120°), tactical 200. Cops and alerted guards shoot back with line of sight within 14 m (hit chance falls with distance and when you sprint). HP 100, armor regen 4 s after the last hit (suit has 0 armor). At 0 HP you're cuffed. Proximity cuffing still applies.
- [ ] Combat follow-ups: weapon unlocks (tranq, SMG, shotgun, baton: in the picker, greyed out "not built yet"); muzzle flash/hit sparks/sound; guards keep distance and take cover instead of rushing
- [x] Loadout (`src/data/loadout.ts`): 1 weapon + 2 gadget slots + armor, as data. Pre-job picker (`src/view/loadoutPicker.ts`), everything unlocked for testing (`UNLOCK_ALL`). HUD panel bottom right (`src/view/gearHud.ts`): slots, charges, cooldown, and chips for ECM time, power out, C4 fuse, smoke. Gear models from `gear.glb` in hand_R (`src/view/gear.ts`): the weapon while masked, the gadget for ~1 s after using it, the tool while you hold E with it (glass cutter, lockpick kit, zip ties, body bag).
- [x] Gadgets (`src/sim/gadgets.ts`, numbers in `T.gadgets`). Number keys 1/2 use throw/place/self gadgets (masked only); tool gadgets change an E interaction instead.
  - Noisemaker ×3 (1/2: throw at the cursor, 10 m max): 3 pulses of 8 m noise, 1 s apart. Guards investigate it.
  - Glass cutter (tool): quiet 4 s case cut.
  - Body bags ×2 (tool): hold E 3 s on a downed, tied or shot guard, or a shot civilian. Bagged bodies are skipped by the bodies check and never wake. Order on a downed guard: answer pager > zip-tie > bag (bag directly when out of ties). A bagged guard's pager still rings.
  - ECM jammer ×1 (1/2: set down): 20 s of blind cameras (cones hidden, pending desk calls cancelled, a shot-out camera's 15 s report paused) and quiet pagers (pager delay and ring timers freeze).
  - Medkit ×1 (1/2): full HP and armor; refuses at full health.
  - Lockpick kit (tool): lockpick 3 s instead of 6.
  - Smoke ×2 (1/2: throw): 3 m cloud for 12 s. `Grid.canSee` treats it as solid, so detection, bodies, enemy fire and aim assist all respect it.
  - C4 ×2 (1/2 next to a locked door or the closed safe): 5 s fuse, then the door is open/unlocked or the safe is open (no code needed). Alarm, map-wide noise, 60 damage within 2.5 m.
  - Keycard cloner: in the picker, greyed out (no keycards at Glint & Sons). Mirror kit: not in the picker.
- [x] Armor: suit (0, casing bonus), light vest (+50), heavy vest (+100, 0.9× speed, no casing bonus).
- [x] Intimidate (V, masked): civilians within 8 m and in sight drop and cower; a shout is 5 m of noise. Untied, they get up after 30–38 s and run for a guard or the panic button. After the alarm they stay down.
- [x] Panic button (`levels/glint.tmj` layer `security`, behind the counter): a civilian who sees you masked runs to the nearest guard OR panic button; 0.8 s at the button = alarm. Dead while the power is out.
- [x] Breaker (same layer, back hall): hold E 2 s (no mask needed). Cameras blind, panic button dead, lights dimmed. The desk sends the nearest guard after 8 s; 3 s at the box and the power is back (about a 15–20 s window). `T.power`.
- [x] Masks (cosmetic, `MASKS` in `src/data/loadout.ts`): The Regular (start), The Rumor (Ghost), The Suit (Professional), Conscientious Objector (Pacifist), The Headline (Loud). For now they're tints on the RJ_Mask material, in the locker and in game. Ratings and cash bank into `rj.progress` when a job ends; nothing is spent yet.
- [ ] Locker follow-ups: real mask models and vest models from rj-assets (vests are primitive boxes now); the designed menu scene to replace the brick wall; enforce prices once the shop exists.
- [ ] Gadget follow-ups: drag bodies (the closet option); throw arc preview for the noisemaker and smoke; keycard cloner when the Bank has keycards; mirror kit (Gallery); shop prices enforced once the cash shop exists; sounds for each gadget.
- [~] Guards fight in the loud phase: they shoot and chase; no cover AI yet
- [x] Blender kit swapped in (`src/view/kit.ts`, `src/view/kitLevel.ts`): instanced walls/windows/doorways/floors/trim with cutaway, door leaves, counter segments, display cases (intact → smashed → bagged; tall against walls), safe door + loot, van, desks, security cameras, sticky note, sign, bags. Stand-in characters with clips (idle/walk/run/crouch/carry/interact/hands_up/ziptied); cops reuse the guard rig, darkened. `?graybox` forces the old look; a failed load falls back to it too.
- [ ] Kit follow-ups: `floor_back` maps to lino everywhere (ASSETS.md wants concrete in the safe room, closet and hall, which needs a Tiled tile or zone); trim corners not placed; ceiling lamps left out (they read as dark blobs from 55°); ~340 draw calls with shadows (6 ms/frame at 1024×768 on the dev GPU): merge static props if integrated GPUs struggle
- [ ] Meshy characters when they land: per-model attach map (`attach('hand_R')`), same clip names
- [ ] Audio: stealth/loud stems, barks, SFX hooks off sim events

## Decisions (Kyle)
- Nov 18: Shots kill (keep lethality as is).
- Nov 18: The player faces their movement direction (WASD). Hold right mouse (masked) to aim: you face the cursor, move at 2.2 m/s, and shots go toward the cursor with half the spread. Aimed shots snap to the target nearest the cursor direction within ±25° (`weapon.aimAssistArc`), so a trailing cursor still hits a runner; civilians are never auto-targeted. Left click (or Space) fires; without aiming, shots go along the facing and snap to the nearest guard, cop or camera within ±30° (`weapon.assistArc`). Bags throw along the facing. The camera leads ahead of the facing, or toward the cursor while aiming.

## Open questions for Kyle
- Gadgets (rj-gadgets, Nov 18): zip ties stay a free extra (×4) rather than taking a gadget slot, otherwise the takedown loop costs a slot. Say if they should be a slot item as the design table lists them.
- Gadgets: the breaker is a timed window, not an alarm. The desk sends a guard to flip it back, so it's a clever-column tool. The design lists it under Loud. Tune `T.power` or make it trip the alarm instead.
- Gadgets: C4 has a key-press plant (no hold), works on the safe too, and the ECM blinds every camera on the map (no radius). All three are easy to change.
- Gadgets: number-key gadgets need the mask (the design says the mask unlocks gadgets), so you can't throw a noisemaker while casing. `T.gadgets.requireMask`.
- Gadgets: a shout is 5 m of noise and also reaches civilians behind glass counters (low cover doesn't block sight).
- The held pistol is small and dark against the suit from the 55° camera. It reads best while aiming; it might need a rim light or a 1.5× scale.
- Lethality (design doc open question): guards and patrol cops die in 2 hits; enemies hit about 50% of the time for 8–14 damage, so you last about 10–12 hits. Tune by feel.
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
