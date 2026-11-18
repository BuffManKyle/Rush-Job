# Rush Job — Design Doc

Nov 8, 2026 · @Kyle

## The brief

**Rush Job is a single-player, top-down 3D heist game for the browser. Every job can be pulled off as a ghost, a professional or a hurricane, and when the plan goes sideways it doesn't end. It gets loud.** Built in three.js for the opengameio jam, Nov 18 to Dec 18, 2026, and entered in the **Action & Adventure** track.

The fantasy is Payday's: case the place, mask up, crack the vault, carry the bags out. The difference is that it's solo and readable at a glance. You play one crew member with a voiced handler in your ear instead of three friends. The genre is stealth-action with an escape, not a shooter.

**Design pillars**

1. **Three answers to every lock.** Each obstacle has a quiet, a clever and a loud solution. Gadgets and guns are keys, not stat upgrades.
2. **Failure escalates, it doesn't end.** Blown stealth turns into a loud getaway. The run only ends if you're cuffed or you leave.
3. **Read the room.** Vision cones, suspicion, noise and patrol routes are visible, so a caught player always knows why.
4. **Character in everything.** Slick and a bit funny. The handler, the guards' lines, the item text and the payout screen all have a voice.

**What it is not**

- Not a wave shooter. Going loud means grab what you can and get out, never "hold out for 10 waves."
- Not multiplayer. The jam is solo and judges play alone, so it's one player with an AI handler.
- Not procedural. Layouts are designed by hand and details are shuffled each run, the same rule Salt & Shot uses for its world.
- Not Payday. No Payday names, masks, characters or music. The mechanics are fair game; the identity is ours.

**Comparables:** Payday 2 (approaches, gadgets, bags), Monaco (top-down heists; we differ by being 3D, solo and deeper in stealth and gadgets), Hitman (one place, many solutions), and Ocean's Eleven for tone.

## Tone & cast

**The tone is slick and a bit funny: grounded heists played straight, with the jokes in the characters, not slapstick.** Think Ocean's Eleven crossed with a dry office comedy. The stakes feel real; the people around them are a little ridiculous.

**Tone rules**

- The world plays it straight. Guards, alarms and cops are a real threat; the humor comes from people reacting to them.
- Jokes are short, one line, and never in the way of gameplay information.
- Nothing mean-spirited. Civilians are scared, not punchlines. Dark humor goes in the payout math ("cleanup fee"), not in violence.
- Style over gore. Downed guards are zip-tied and grumbling. No blood decals; the loud phase stays at action-movie level.

**The cast**

| Character | Role | Voice and personality |
| --- | --- | --- |
| **The Accountant** | Your handler, in your ear the whole job | Dry, precise, quietly appalled. Counts your take out loud, itemizes your mistakes, and is secretly proud of you. Narrates briefings and the payout. |
| **Dot** | The getaway driver, waiting in the van | Upbeat, impatient, always snacking. Honks when bags land. Warns when the cops are close ("I'm double-parked, people"). |
| **You** | The pro (player) | Silent. Your personality is your mask and your approach. |
| **Guards** | Patrol, investigate, raise the alarm | Bored, underpaid, chatty. Idle lines about their shift; nervous lines while searching ("Hello? Is that... a raccoon?"). |
| **Staff and civilians** | Managers, tellers, customers | Panic, comply, or try to be a hero. The bank manager carries the keycard and has opinions. |
| **Police** | The loud-phase threat | Radio chatter and a negotiator who's far too polite. Sergeant on the bullhorn. |
| **The Dispatcher** | Voice on a downed guard's pager | Suspicious but tired. Your cover stories get worse with each call. |

**Where the character shows up:** briefing lines, idle guard chatter, pager calls, item descriptions in the shop, rating titles on the payout screen, loading-screen tips, and the van radio. Every one of these is a cheap place to be funny, and judges will notice it.

## Core loop

**One run is 5 to 12 minutes: pick a job, kit up, case the place, mask up, take the score and get it to the van.** The alarm can trip at any point after you mask up, or during casing if you're caught somewhere you shouldn't be.

&#91;embedded content: core loop · stealth and loud both end at the payout\]

Getting cuffed ends the job, but it isn't a wipe. Dot drives off with whatever bags already reached the van, and the Accountant deducts your bail. Even a disaster usually pays something, so players replay instead of quitting.

**Session shape:** a first-time player finishes the Jewelry Store in about 5 minutes and the Bank in 10 to 12. A judge who plays 15 minutes sees the full loop at least twice, including one payout screen and one unlock.

## Approach matrix

**Every obstacle ships with at least three solutions: quiet (skill, no gear), clever (a gadget or a found item) and loud (fast, noisy, starts the alarm or the clock).** This table is the game's content checklist. An obstacle without three working answers isn't done.

| Obstacle | Quiet | Clever | Loud |
| --- | --- | --- | --- |
| **Guard** | Time the patrol, stay out of the cone | Takedown from behind + zip-tie, then answer the pager; or a noisemaker to pull him off-route | Shoot; triggers the alarm if anyone hears it |
| **Camera** | Dodge the sweep | ECM jammer (20 s), cut its wire at the junction box, or take the security room and loop the feed | Shoot it out; the security desk reports a dead camera in 15 s |
| **Locked door** | Find the key or keycard on staff | Lockpick (slow, quiet) or keycard cloner | Crowbar (loud), shaped charge (very loud) |
| **Panic button** | Keep staff away from the counter | Zip-tie staff before they reach it | Kill the power at the breaker, which kills the lights too |
| **Vault** | Manager's keycard + code from the office | Hack the time lock at a terminal (3 stages, can be traced) | Thermal drill (90 s, jams) or C4 on the hinges (instant, alarm) |
| **Display case** | Find the case key | Glass cutter (quiet, slow) | Smash it (fast, alarm) |
| **Civilians** | Avoid sightlines | Intimidate (shout) and zip-tie | Let them flee; each one calls the cops and speeds up response |
| **Laser grid** (Gallery) | Time the pattern and slip through | Mirror kit to bend a beam, or the fuse box | Trip it and run |
| **Loot out** | Carry bags one at a time | Throw bags out a window or down a chute | Sprint with them under fire, slowed |
| **Escape** | Walk out the front unmasked (stealth only) | Rooftop or sewer route unlocked by a gadget | Fight to the van; Dot pulls up under fire |

**The clever column is where gadgets live.** Each gadget answers one or two rows, so loadout choice really means choosing your plan before the job.

## Systems spec

**Six systems carry the game: detection, casing, pagers, one hold-to-interact verb, loot bags, and the alarm-driven loud scramble.** Every number below is a first-pass tuning constant. They all live in one `tuning.ts` file and get set by feel in playtests, the same way Salt & Shot keeps its knobs up top.

### Detection

Each guard, camera and civilian has a suspicion meter from 0 to 100 for you. It fills while you're in their view cone and drains after 1.5 s out of sight.

| Observer | Cone | Range | On full suspicion |
| --- | --- | --- | --- |
| Guard | 90° | 12 m | Radios it in: a 3 s window to stop him before the alarm |
| Camera | 60°, sweeping | 15 m | Security desk raises the alarm in 3 s (none if the desk is taken) |
| Civilian | 120° | 8 m | Screams, runs to the nearest guard or panic button |

**Fill rate:** 40 per second × distance (1.0 within 4 m, down to 0.25 at the cone's edge) × movement (crouch 0.5, walk 1.0, sprint 1.5) × what you are (masked in public 2.0, unmasked in a restricted area 1.0, unmasked in public 0) × carrying a bag 1.5. **Drain:** 15 per second. **Thresholds:** 30 = "?" (they turn to look), 60 = they walk over to investigate, 100 = "!" (they report you).

**Noise:** actions make noise in a radius, and any guard inside walks to the source to investigate. Sprint 4 m, crowbar 10 m, smashed glass 12 m, drill 15 m (constant), silenced shot 6 m, unsilenced shot 30 m. C4 is heard across the whole map.

**Bodies:** a downed or zip-tied guard found by anyone raises the alarm. Body bags, or dragging him into a closet, prevent that.

### Casing

You start every job unmasked, as a customer. Public areas are free to walk. Restricted areas, marked with amber hatched floor trim (red is reserved for danger), build suspicion at the normal rate.

- **First time caught:** a guard escorts you back to the lobby ("Sir, this is staff only").
- **Second time:** they call it in, and the alarm trips before you've even masked up.
- **Marking (Q):** tag guards, cameras and objectives. Marked guards show their cones through walls; marked cameras stay highlighted for the whole job. Casing is where good players build their plan.

### Mask up

Hold G for 1.5 s. It can't be undone. It unlocks guns, gadgets, takedowns and intimidation, and makes any civilian who sees you panic. It's the moment of commitment, so it gets a sound sting, a camera push-in and a line from the Accountant.

### Pagers

A takedown starts the guard's pager ringing 3 s later. Hold E for 4 s to answer with a cover story; the Dispatcher's patience runs out on the fourth call of the job. Leave it ringing for 10 s, or get interrupted mid-answer, and the alarm trips. A cheap system that creates a lot of tension, and a natural spot for the funniest writing in the game.

### Hold to interact

One verb, E, does almost everything: lockpick, zip-tie, answer a pager, bag loot, place the drill, fix the drill, hack a terminal. Each interaction has a duration, a noise radius and an interrupt rule, and it always shows a progress ring. Building this once, as data, is what keeps 20+ actions cheap.

| Interaction | Time | Noise | Notes |
| --- | --- | --- | --- |
| Zip-tie civilian or guard | 2 s | 0 | Needs a zip tie |
| Answer pager | 4 s | 0 | 4 per job |
| Lockpick door | 6 s | 0 | Lockpick kit cuts this to 3 s |
| Bag loot | 1.5 s | 0 | Jewelry, cash stacks, gold |
| Glass cutter | 4 s | 0 | Display cases |
| Place drill | 3 s | 15 m (continuous) | Runs 90 s, jams every \~30 s |
| Hack time lock | 3 × 8 s | 0 | Each stage can be traced |

### Loot bags

You carry one bag at a time, and bags slow you down. **Light** (jewelry): 90% speed, sprint allowed. **Medium** (cash): 75% speed, no sprint. **Heavy** (gold, paintings): 60% speed, no sprint, and no climbing. Throw with F: 6 / 4 / 3 m by weight. A bag counts once it lands in the van's drop zone. Bag value scales by heist, so the decision is always "one more trip?"

### The alarm and the loud scramble

**When the alarm trips, the job becomes an escape. You never fight waves. Police pressure rises on a clock, and the question is how much you can carry out before it's too hot to stay.**

| Heat | Starts | What happens |
| --- | --- | --- |
| 1 Response | Alarm + 60 s (Bank 90 s) | Red lights and the music switch. Guards fight; first patrol cars arrive at the front. |
| 2 Pressure | +60 s | Officers push in from two entrances; the drill starts jamming more often. |
| 3 Breach | +60 s | Shield units and smoke. The van route gets harder; Dot complains. |
| 4 Leave now | +60 s | Tactical team storms the building. Staying means getting cuffed. |

- **Hostages buy time.** Each zip-tied civilian delays the next heat level by 20 s, up to 3 hostages.
- **The van waits, but not forever.** Dot pulls away at the end of Heat 4; anything not in the van is lost.
- **Combat stays simple.** Mouse aim, click to fire, R to reload, limited ammo. Cops outnumber you and keep coming, so shooting buys space, not victory.
- **Health:** 100 HP plus armor that regenerates 4 s after your last hit. At 0 HP you're cuffed. A medkit gadget gives one heal.
- **Police types:** patrol officer, shield unit (Heat 3), tactical officer (Heat 4). Three types are enough for the jam.

## Gear, guns & progression

**Loadout = 1 weapon + 2 gadget slots + armor + a mask. Cash from jobs unlocks new tools, and each tool opens a new way through the approach matrix, never a flat stat boost.** Progress saves in the browser (localStorage), with an export code as a backup.

### Weapons

| Weapon | Unlock | Noise | Role |
| --- | --- | --- | --- |
| Pocket pistol (silenced) | Start | 6 m | Quiet backup; 36 rounds |
| Tranq pistol | $25k | 2 m | Non-lethal: the guard sleeps 60 s, no pager. The pacifist pick. |
| Compact SMG | $40k | 30 m | Loud-phase crowd control |
| Pump shotgun | $75k | 30 m | Staggers shield units; short range |
| Stun baton | $15k | 0 | Silent melee takedown from the front |

### Gadgets

| Gadget | Unlock | Answers |
| --- | --- | --- |
| Zip ties (×4) | Start | Civilians, takedowns, hostages |
| Lockpick kit | Start | Doors at half the time |
| Noisemaker (×3) | $10k | Throw to pull a guard off his route |
| Glass cutter | $15k | Display cases, silently |
| Body bags (×2) | $20k | Hide downed guards |
| ECM jammer (×1) | $35k | Cameras and pagers off for 20 s |
| Keycard cloner | $45k | Copy a keycard by standing near its holder for 3 s |
| Smoke grenade (×2) | $30k | Break line of sight during the loud phase |
| Medkit (×1) | $20k | One full heal |
| C4 (×2) | $60k | Vault hinges, walls marked as weak |
| Mirror kit | $80k | Bend a laser beam (Gallery) |

The thermal drill isn't a slot item. Any job with a vault provides it in the van, so going loud is always possible.

### Armor

- **Tailored suit** (start): no armor, and you look like a customer, so casing gets 20% slower suspicion.
- **Light vest** ($30k): +50 armor, no speed cost.
- **Heavy vest** ($70k): +100 armor, −10% speed, and it can't be hidden under the suit.

### Payout and ratings

The Accountant reads the payout as an itemized receipt. It's the most screenshot-able moment in the game, so it gets a typewriter animation and voice.

```
Take            secured bag value
+ Objectives    bonus per optional objective
+ Clean job     +25% if the alarm never tripped
− Dot's cut     10%
− Cleanup       $5k per civilian casualty
− Bail          if cuffed
```

| Rating | Condition | Unlocks |
| --- | --- | --- |
| **Ghost** | Never spotted, no takedowns | Mask: "The Rumor" |
| **Professional** | No alarm | Mask: "The Suit" |
| **Pacifist** | Alarm OK, nobody killed | Mask: "Conscientious Objector" |
| **Loud** | Alarm, out with the bags | Mask: "The Headline" |
| **Bloodbath** | Civilian casualties | The Accountant's disappointment and a bigger cleanup bill |

Masks are cosmetic. They reward replaying a job a different way, which is the whole point of the game.

## Heists

**Two polished heists make a complete entry; a third is a stretch goal.** Each layout is designed by hand, and each run shuffles the details (who holds the keycard, where the code is, guard routes, camera spots), so a known map still needs a fresh plan.

|  | Glint & Sons Jewelers | Third Most Trusted Bank | The Vandermeer Gallery |
| --- | --- | --- | --- |
| **Role** | Tutorial and first cut line | Flagship heist | Stretch goal |
| **Size** | 1 floor, \~6 rooms | 2 floors, \~14 rooms + vault | 2 floors, night |
| **Run time** | 3–5 min | 8–12 min | 8–12 min |
| **Guards / cameras** | 2 / 3 | 5 / 8 | 6 / 10 + laser grids |
| **Civilians** | 4–6 customers and staff | 10–14 | None (night job) |
| **Score** | Display cases + back-room safe | Vault (cash, gold), deposit boxes, manager's office | 4 paintings (heavy, two-handed) + a sculpture |
| **Take** | $20k–$60k | $150k–$400k | $300k–$600k |
| **Unlocks** | Start | After the Jewelry Store | After the Bank |

### Glint & Sons Jewelers (vertical slice)

A small shop with a showroom, back office, safe room, security closet and an alley exit. It teaches every system in under 5 minutes: casing, mask up, a camera, a guard with a pager, display cases, one heavy bag, the van. The Accountant's briefing doubles as the tutorial ("Cases are glass. Glass is loud. You see where I'm going.").

**Shuffled each run:** which of 3 guard routes is active, the safe's code (on a sticky note in one of 3 places), whether the back door is locked.

### Third Most Trusted Bank (flagship)

A lobby, teller line, manager's office, security room, server room, upstairs offices, roof access and a basement vault. It's built so that all three columns of the approach matrix are fully playable:

- **Ghost:** case the place, find which employee carries the keycard, lift it, get the vault code from the manager's computer, empty the vault in silence, carry bags out a back window to the van. Hardest, best paid.
- **Clever:** take the security room, loop the cameras, zip-tie the lobby, hack the time lock while the Dispatcher hears your increasingly weak excuses.
- **Loud:** mask up in the lobby, C4 the vault hinges, and see how many bags you can get out before Heat 4.

**Shuffled each run:** keycard holder (1 of 4 staff), code location (1 of 3), 2 of 4 guard route sets, 3 optional camera positions, deposit-box values, which wall is the weak "C4 shortcut."

**Optional objectives** (bonus pay): the manager's personal deposit box, the server drive ("blackmail is a growth industry"), leave with zero hostages hurt.

### The Vandermeer Gallery (stretch)

A night job with no civilians. Laser grids, heavy two-handed paintings and a rooftop escape. It only gets built if the Bank is polished by the start of week 4; otherwise it becomes "coming soon" on the job board, which still sells the game's scope to judges.

## Camera

**We ship top-down/isometric first, and every system is built so a first-person camera can be added without a rewrite. The go/no-go on first person is end of week 1, once guard AI works.**

**Top-down (default)**

- Angled orthographic-feel perspective camera, about 55° down, following the player with slight lead toward the mouse.
- **Cutaway walls:** walls between the camera and the player fade to a low stub, so interiors read like a diorama.
- Mouse aims; WASD moves relative to the screen. Mouse wheel zooms between "planning" and "close" distances.
- Vision cones, noise rings and suspicion meters are drawn in the world, which is the reason top-down is the right first camera for a stealth game.

**Rules that keep first person possible**

1. **Gameplay never reads the camera.** Detection, noise, aim and interaction all work in world space. Aim is a world-space ray from the player, whatever drew the crosshair.
2. **Levels are real 3D rooms:** full-height walls, ceilings that can be hidden, doorways at human scale (2.1 m), windows you could look through.
3. **Camera is a swappable module** with one interface (`follow`, `aimRay`, `worldToScreen`), so a first-person camera is a new file, not a refactor.
4. **Readability has a fallback.** If first person happens, it needs detection arrows on the HUD, a mark-and-ping system, and a top-down tablet view during casing.

**If we do it:** the most promising version is a hybrid. Casing and planning stay top-down (you're scouting), then mask up switches to first person for the job itself. It's a dramatic moment and keeps the planning readable. The cost is roughly a week: arms and weapon view models, first-person animations, and a lighting pass for eye level.

## Art direction & asset pipeline

**Every asset is ours: no CC0 packs. Architecture and props come from Blender build scripts I write and run, characters come from Meshy, and 2D art comes from fal.** No sponsor credits are confirmed: Meshy and ElevenLabs start on their free tiers, and fal (a pay-per-use API for image models like FLUX, not an LLM) is a paid extra that any image generator can replace. You're the art director: you approve the style guide and model sheets and pick between versions, with no hand-modeling. It's the same pipeline that built Salt & Shot's ships, where `tools/blender/*_build.py` scripts generate every hull from a model sheet.

### Style guide (draft)

> Stylized low-poly with a slick noir-pop finish. Chunky, readable silhouettes with slightly oversized heads and hands so poses read from above. Flat colors with one tileable grayscale texture tinted per material, no photo textures. Deep navy and teal shadows, warm sodium-orange interior light, one signature accent per heist: Jewelry = teal + gold, Bank = green marble + brass, Gallery = white + magenta lasers. **Red means danger and nothing else:** alarms, cones on full suspicion, police lights.

### Who makes what

| Source | Makes | Why it fits |
| --- | --- | --- |
| **Blender build scripts** (me, run headless with Blender 5.2) | Modular wall/floor/door/window kit, furniture, counters, display cases, safes, vault door, drill, bags, van, police car | Exact sizes for the level grid, consistent style, cheap to iterate ("make the counter 10 cm taller" is a re-run). Meshy is weak at architecture. |
| **Meshy** | Player, guards, police (3 types), civilians, staff, the Accountant and Dot for briefings | AI-generated characters with rigging and animation. Check on Nov 18 that its auto-rig and animation library cover walk, run, crouch, carry, shoot, zip-tied and hands-up. |
| **fal** | Concept art and model sheets (done first, like Salt & Shot's `reference-images/`), item icons, job-board posters, title logo, cover and jam-page art | Sets the look before any 3D is made, and gives both Meshy and the Blender scripts a target. |
| **three.js code** (me) | Vision cones, noise rings, wall cutaway, alarm lights, sparks, drill smoke, laser grids, outlines on marked targets | Effects are code, so they're free to tune live in the browser. |

**Animation fallback:** if Meshy's rigging falls short, one shared humanoid rig retargeted to every Meshy mesh, with a small set of animations. From top-down, stylized bob-and-lean motion holds up, so this is a risk, not a blocker.

### Budgets

- **Download:** first playable load under 10 MB, the whole game under 30 MB. GLB with meshopt compression and KTX2 textures.
- **Triangles:** characters \~5–8k, props under 2k, a full heist on screen under 300k.
- **Performance:** 60 fps on a mid-range laptop's integrated GPU at 1080p. Judges won't all have gaming PCs.

### Tracking

An `ASSETS.md` manifest like Salt & Shot's: one row per asset with source (script / Meshy / fal), status (needed / placeholder / done) and file path. Graybox boxes stand in until each asset lands, so code never waits on art.

## Sound & voice

**Sound is half the character of this game. ElevenLabs makes the voices, sound effects and music, and the one moment judges must remember is the music flipping from cool stealth jazz to full-tilt chase the instant the alarm trips.**

### Music: one track, two layers

- Each heist gets one piece of music in two stems recorded at the same tempo and key: **Stealth** (brushed drums, upright bass, muted trumpet, jazz-funk) and **Loud** (the same theme with breakbeat drums, brass stabs and guitar).
- Both stems play in sync from the start; the loud stem sits muted. The alarm crossfades it in over 0.5 s with a brass hit, so the switch lands on the beat.
- Suspicion above 60 brings in a tension layer (hi-hat and strings) under the stealth stem.
- Menu, job board and payout get their own short loops. Silence and room tone are used too: casing is mostly ambience.

### Voice

| Speaker | Lines (estimate) | Notes |
| --- | --- | --- |
| The Accountant | \~120 | Briefings, objective callouts, reactions, the payout receipt, the tutorial |
| Dot | \~40 | Van arrival, bags secured, heat warnings, leaving |
| Guards (2–3 voices) | \~80 | Idle chatter, "?" and "!" reactions, searching, giving up, zip-tied grumbles |
| The Dispatcher | \~20 | Pager calls; your cover stories get worse each time |
| Police (radio, bullhorn, negotiator) | \~40 | Heat-level announcements |
| Civilians and staff | \~40 | Panic, compliance, the would-be hero |

The script is written in a `voice-script.md` with an ID per line, so dialogue is data (`guard.search.03`) and lines can be regenerated one at a time. The draft script lives in the `Writing/` folder of this vault (start at [[00 Start here]]); recording happens once the jam opens.

### Sound effects

Footsteps per floor surface, lockpick clicks, zip-tie zips, glass cutter squeak, smashed glass, the drill (start, loop, jam, restart), pager ring, camera servo, keycard beep, vault door, C4 beep, bag rustle and thud, gunshots (silenced and loud), alarm bell, police sirens getting closer with each heat level, the van's honk.

**Mixing rule:** gameplay information beats atmosphere. A pager ring or a guard's "Huh?" is never covered by music, so music ducks under voice and key cues.

## Tech

**three.js + TypeScript + Vite, no physics engine, levels drawn in Tiled.** A static build that loads fast in any desktop browser, and one I can run and play-test live in the browser pane while we build.

&#91;embedded content: architecture · inputs feed one simulation; renderer, audio and HUD only read it\]

The simulation runs at a fixed 30 Hz and owns all game state. The renderer, audio and HUD read that state or listen for its events (`alarm`, `bagSecured`, `pagerRinging`) and never change it. That split is what makes the camera swappable and the game testable.

**Key choices**

- **Levels in Tiled.** A 1 m grid: tile layers for floors and walls, object layers for guard routes, cameras, loot, doors, restricted zones and the shuffle options ("keycard holder: one of these 4"). You can draw or edit a layout; the loader turns it into kit pieces and a nav grid.
- **Movement and collision** on the grid: the player is a circle against wall boxes. Enough for a top-down game, and no physics engine to fight.
- **AI pathing:** A\* on the nav grid, with guard routes as waypoint loops from Tiled.
- **Seeded shuffles.** Each run's seed shows on the pause screen, so any bug can be replayed exactly.
- **Assets:** GLB through GLTFLoader with meshopt and KTX2. Kit pieces use instanced meshes, so a whole bank is a few draw calls.
- **Lighting:** one shadow-casting key light plus unshadowed point lights for lamps and alarm strobes. Tuned for integrated GPUs.
- **Debug overlay (F1):** cones, suspicion values, nav grid, noise rings and AI states, drawn live. I use it for every test.

**Repo:** a new `rush-job` git repo, created on Nov 18 with its first commit that day. Alongside the code: this design doc exported as `DESIGN.md`, plus `TICKETS.md`, `ASSETS.md`, `voice-script.md`, `tools/blender/` and `tuning.ts`, mirroring how Salt & Shot is organized.

## Jam schedule

**Four weeks, Nov 18 to Dec 18, built around two cut lines. After Dec 1 there's always a game that could be submitted, and the last 5 days are polish only.** Riskiest work comes first: guard AI and detection in week 1, because if stealth doesn't feel good, nothing else matters.

&#91;embedded content: jam schedule · Nov 18 to Dec 18, 2026, with cut lines\]

**Exit criteria, week by week**

1. **Week 1, core stealth (Nov 18–24).** Graybox jewelry store from Tiled; movement, camera, cutaway; guards patrol, see, suspect and report; cameras; noise; the hold-to-interact system; debug overlay. Fal concept art and the style guide approved. *Exit: you can sneak past or get caught, and it's clear why. First-person call made.*
2. **Week 2, Jewelry Store (Nov 25–Dec 1).** Casing, mask up, takedowns and pagers, zip ties, display cases, bags, van, alarm, Heat 1–4, cops, cuffed, payout screen. First Blender kit and Meshy characters replace grayboxes. *Exit (cut line 1): a stranger can play the Jewelry Store start to finish, quiet or loud, and get paid.*
3. **Week 3, Bank and unlocks (Dec 2–9).** Bank layout and shuffles, keycard, code, time lock, drill, C4, hostages; the shop and unlocks; the voice pass, music stems and SFX. *Exit (cut line 2): two heists, progression and full audio.*
4. **Stretch (Dec 10–13).** The Gallery if the Bank is solid; otherwise more gadgets, more lines, onboarding and controller support.
5. **Polish only (Dec 14–18).** Bug fixes, performance on a weak laptop, loading speed, the first 60 seconds, the jam-page art and trailer GIF. No new features.

**Working rhythm:** during the day you send short prompts ("tune guard speed," "generate the cop model"). I build, play-test in the browser pane and commit. In the evening you play the latest build and make decisions. Each day ends with a playable commit.

## Jam compliance & prep

**Before Nov 18 we plan, write, and build general-purpose tools and a generic kit. Nothing specific to Rush Job's game code, levels or props is made early. From Nov 18 everything is committed to git daily, so the dev history proves the game was made during the jam.**

**The rules as published** (quoted Nov 13):

> - **Creation timeframe:** All games must be built during the jam window; pre-existing games or projects already in development are not allowed.
> - **Assets and libraries:** Reusable general-purpose frameworks, libraries, tools, and starter credits are allowed, but pre-existing game-specific levels, code systems, or completed gameplay mechanics are prohibited.

**How we read them:** general-purpose and reusable is fine early; anything that only makes sense in Rush Job waits. Art and audio aren't named in the prohibited list, but they aren't "general-purpose" either, so game-specific art waits until the organizers say otherwise.

**Allowed before the jam**

- This design doc, the style guide, asset lists, and all writing in `Writing/` (voice script, shop text, rating titles, loading tips). It's design and script, recorded during the jam.
- A general-purpose three.js starter: renderer, input, audio, asset loading, debug overlay shell. No Rush Job systems in it.
- The Blender build-script tooling (headless runner, preview renders, GLB export) and a **generic low-poly kit**: modular walls, floors, doors and windows on the 1 m grid, generic furniture (desks, chairs, shelves, plain counters), and a generic humanoid rig and animation set. Each piece must make sense in any game.
- Learning Meshy, ElevenLabs and image tools on throwaway subjects.

**Kept in their own repos.** The starter and the generic kit live in separate repos (e.g. `threejs-starter`, `lowpoly-kit`) with their own history, and `rush-job` imports them as libraries on Nov 18. That keeps the "reusable" claim easy to show.

**Not before the jam:** Rush Job game code or systems (detection, pagers, alarm, etc.), Tiled layouts, scripts for Rush Job-specific props (display cases, safe, vault, drill, bags, van), the cast, masks, logo, recorded voice, music or SFX made for the game.

**Pre-jam checklist (Nov 8–17)**

- [x] Review this doc and settle the open questions (the remaining ones are scheduled for week 1)
- [x] Sign up for the jam's email so we hear when the page opens
- [ ] When the page opens: read the full rules and the submission format
- [ ] Ask the organizers: (1) Dec 18 ends at what hour and time zone? (2) May we make game-specific art and audio before the start, or only generic? (3) Confirm a general-purpose starter and generic asset kit in separate repos are fine.
- [ ] Try Meshy and ElevenLabs free tiers on a throwaway subject (not a heist asset): Meshy rigging and animation (walk, run, crouch, carry, hands-up), ElevenLabs voice design, sound effects and music
- [ ] Decide the 2D image tool: fal (paid, pay-per-use) or a free alternative
- [ ] Install Tiled; confirm Blender 5.2 runs headless (it's already installed)
- [ ] Build the general-purpose three.js starter and the generic Blender kit in their own repos
- [ ] Review the writing in `Writing/` ([[00 Start here]])
- [ ] Pick the final mask, logo and title treatment ideas for day 1

**Submission checklist (Dec 14–18)**

- [ ] Plays in Chrome, Firefox and Edge on desktop; mouse and keyboard only
- [ ] Loads in under 10 seconds on a normal connection; works on a mid-range laptop
- [ ] First 60 seconds teach the controls without a manual
- [ ] Genre set to Action & Adventure
- [ ] Jam page: cover art, screenshots, a short GIF of the alarm moment, a credits section naming each AI tool used (Meshy, ElevenLabs, fal or its replacement) and how
- [ ] Repo history and source ready if the organizers ask

## Open questions & decisions on record

**Open questions (decide before or during week 1)**

- [x] Character names: are "The Accountant" and "Dot" keepers, or placeholders?
- [x] Heist names: Glint & Sons, Third Most Trusted Bank, The Vandermeer Gallery. Keep, or rename?
- [x] Does the player get a name and face (for the cover art), or stay a masked nobody?
- [ ] First person: hybrid (top-down casing, first person after mask up), full first person, or top-down only? Decided Nov 24.
- [ ] Meshy: are rigging and animations good enough, or do we use one shared rig? Decided in week 1.
- [ ] How lethal should guards be in the loud phase: a few hits, or a real gunfight? Tune in week 2.
- [x] Do we want a short intro scene (van ride, the Accountant's pitch), or straight to the job board?

**Decisions on record**

| Date         | Decision                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Nov 8, 2026  | Doc written from the brainstorm; Salt & Shot is the quality bar for docs and pipeline, Hazard Pay is reference only |
| Nov 8, 2026  | Title: **Rush Job**                                                                                                 |
| Nov 8, 2026  | Tone: slick and a bit funny; character in every line                                                                |
| Nov 8, 2026  | Assets: all custom (Blender scripts, Meshy, fal); no CC0 packs                                                      |
| Nov 8, 2026  | Progression: cash unlocks tools and guns between heists                                                             |
| Nov 8, 2026  | Loud phase: grab what you can and get away, no wave fighting                                                        |
| Nov 8, 2026  | Engine: three.js + TypeScript + Vite; top-down first, first person kept possible                                    |
| Nov 8, 2026  | Single-player with a voiced handler; genre track Action & Adventure                                                 |
| Nov 8, 2026  | Controller support later, not core                                                                                  |
| Nov 13, 2026 | Character names The Accountant and Dot can be kept                                                                  |
| Nov 13, 2026 | Heist names work                                                                                                    |
| Nov 13, 2026 | Player is a masked nobody                                                                                           |
| Nov 13, 2026 | Intro with van ride and accountant's pitch is good.                                                                 |
| Nov 13, 2026 | Restricted areas use amber hatched trim; red stays danger-only                                                      |
| Nov 13, 2026 | No sponsor credits assumed: Meshy and ElevenLabs free tiers first; fal optional (paid)                              |
| Nov 13, 2026 | Pre-jam: writing, a general-purpose starter and a generic Blender kit (separate repos) are allowed; game-specific work waits |

New decisions get added here with their date as we go, the same way Salt & Shot's design doc records them.
