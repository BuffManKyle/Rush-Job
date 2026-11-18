// Every gameplay knob lives here. Numbers start from DESIGN.md "Systems spec" and get tuned by feel.
// Units: meters, seconds, degrees unless noted. Suspicion is 0..100.

export const T = {
  sim: {
    hz: 30,
    maxStepsPerFrame: 5,
  },

  player: {
    radius: 0.3,
    walkSpeed: 3.0,
    crouchSpeed: 1.5,
    sprintSpeed: 5.2,
    accel: 30, // m/s² toward target velocity
    turnRate: 720, // deg/s, body yaw toward the movement direction
    aimTurnRate: 1080, // deg/s while aiming at the cursor
    aimSpeed: 2.2, // move speed cap while aiming (right mouse)
    maskTime: 1.5, // hold G
    sprintNoiseRadius: 4,
    sprintNoiseInterval: 0.5, // seconds between footstep noise events while sprinting
    interactReach: 1.3, // meters from player center to interactable edge
  },

  detection: {
    fillRate: 40, // per second, before multipliers
    drainRate: 15, // per second
    drainDelay: 1.5, // seconds out of sight before draining starts
    nearDistance: 4, // full distance multiplier inside this
    farMultiplier: 0.25, // multiplier at the cone's edge
    move: { crouch: 0.5, walk: 1.0, sprint: 1.5 }, // standing still counts as walk (or crouch)
    status: { maskedPublic: 2.0, maskedRestricted: 2.0, unmaskedRestricted: 1.0, unmaskedPublic: 0 },
    suitCasingMultiplier: 0.8, // tailored suit: 20% slower suspicion while unmasked
    carryingBag: 1.5,
    look: 30, // "?" turn to look
    investigate: 60, // walk over
    report: 100, // "!"
    crouchedBehindCover: true, // low props block sight to a crouched player
    eyeHeight: 1.6,
  },

  guard: {
    cone: 90,
    range: 12,
    radius: 0.3,
    patrolSpeed: 1.35,
    investigateSpeed: 2.1,
    alertSpeed: 3.6,
    turnRate: 200, // deg/s
    reportTime: 3, // radio window before the alarm trips
    searchTime: 5, // look around at the investigation point
    lookHoldTime: 1.2, // keep staring after suspicion drops under "?"
    hearingMultiplier: 1.0,
    doorOpenTime: 0.4,
    doorCloseDelay: 1.5,
    hp: 100,
    peripheralRadius: 1.2, // bumping right into someone counts as being seen at close range
  },

  camera: {
    cone: 60,
    range: 15,
    deskAlarmTime: 3, // security desk raises the alarm this long after a camera hits 100
    trackSpeed: 60, // deg/s when locked on
    deadReportTime: 15, // shot-out camera: the desk notices this long after
  },

  civilian: {
    cone: 120,
    range: 8,
    radius: 0.28,
    speed: 1.0,
    fleeSpeed: 3.2,
    turnRate: 240,
    screamRadius: 10,
  },

  noise: {
    sprint: 4,
    crowbar: 10,
    smashGlass: 12,
    drill: 15,
    silencedShot: 6,
    shot: 30,
    c4: 999,
  },

  takedown: {
    time: 0.6, // hold E behind an unaware guard
    behindAngle: 110, // degrees off the guard's facing that counts as "from behind"
    reach: 1.2,
    downedWakeTime: 40, // an untied guard gets up (and calls it in) after this long
    zipTieTime: 2,
    zipTies: 4,
  },

  pager: {
    delay: 3, // rings this long after a takedown
    timeout: 10, // unanswered this long = alarm
    answerTime: 4,
    maxCalls: 3, // the Dispatcher's patience runs out on the 4th call
  },

  weapon: {
    // pocket pistol (silenced), DESIGN.md "Weapons": 36 rounds, 6 m noise
    mag: 12,
    reserve: 24,
    damage: 50, // guards and patrol cops drop in 2 hits
    fireInterval: 0.22,
    reloadTime: 1.6,
    range: 25,
    spread: 3, // degrees, doubled while moving
    noise: 6,
    assistArc: 60, // hip fire: degrees (total) around your facing that snap to a guard, cop or camera
    aimAssistArc: 50, // aiming: degrees (total) around the cursor direction that snap to a target
  },

  health: {
    hp: 100,
    armor: 0, // tailored suit: no armor (vests later)
    armorRegenDelay: 4,
    armorRegenRate: 30,
  },

  enemyFire: {
    range: 14,
    intervalMin: 0.9,
    intervalMax: 1.6,
    hitBase: 0.7,
    hitFalloff: 0.03, // per meter
    hitMin: 0.2,
    sprintPenalty: 0.15,
    guardDamage: 10,
    copDamage: 8,
    tacticalDamage: 14,
  },

  heat: {
    hp: { patrol: 100, shield: 150, tactical: 200 },
    shieldArc: 120, // degrees in front of a shield unit that block shots
    firstDelay: 60, // alarm → Heat 1 (Bank: 90)
    levelTime: 60, // each further level; Dot leaves this long after Heat 4 starts
    hostageDelay: 20, // each zip-tied civilian delays the next level
    maxHostages: 3,
    maxCops: 10,
    speed: { patrol: 3.0, shield: 2.0, tactical: 3.5 },
    cuffReach: 1.0,
    cuffTime: 2.0, // seconds of one cop on you to get cuffed
  },

  payout: {
    cleanBonus: 0.25,
    dotCut: 0.1,
    cleanupPerCivilian: 5000,
    bail: 10000,
  },

  casing: {
    escortsBeforeAlarm: 1, // first catch = escorted out, the next one trips the alarm
    escortFadeTime: 1.2,
  },

  doors: {
    openTime: 0.25,
    lockpickTime: 6,
    lockpickKitTime: 3,
    height: 2.1,
  },

  bags: {
    carryScale: 0.7, // bags in hand draw a bit smaller so two don't swallow the character
    maxCarried: 2, // one per hand; with two you can't shoot, aim or take anyone down
    twoBagSpeed: 0.85, // extra multiplier on top of the heaviest bag's speed when carrying two (and no sprint)
    lightCapacity: 12000, // jewelry: keep stuffing one light bag until it holds this much
    flightTime: 0.5,
    landNoise: 2,
    light: { speed: 0.9, sprint: true, throw: 6 },
    medium: { speed: 0.75, sprint: false, throw: 4 },
    heavy: { speed: 0.6, sprint: false, throw: 3 },
  },

  // Loadout: armor and gadgets (DESIGN.md "Gear, guns & progression"). Gadget defs: src/data/loadout.ts.
  armor: {
    suit: { armor: 0, speed: 1.0, casingBonus: true },
    light_vest: { armor: 50, speed: 1.0, casingBonus: true },
    heavy_vest: { armor: 100, speed: 0.9, casingBonus: false }, // can't be hidden under the suit
  },

  gadgets: {
    requireMask: true, // number-key gadgets come out with the mask (DESIGN.md "Mask up")
    useCooldown: 0.6, // seconds between number-key uses
    heldShowTime: 1.2, // the used gadget stays in hand this long (view)
    throwRange: 10, // max throw distance toward the cursor
    throwFlightTime: 0.6,
    noisemaker: { charges: 3, radius: 8, pulses: 3, pulseInterval: 1.0, armTime: 0.3 },
    glassCutter: { time: 4 },
    bodyBag: { charges: 2, time: 3 },
    ecm: { charges: 1, duration: 20 },
    medkit: { charges: 1 },
    smoke: { charges: 2, radius: 3, duration: 12 },
    c4: { charges: 2, fuse: 5, blastRadius: 2.5, blastDamage: 60 },
  },

  intimidate: {
    radius: 8, // civilians within this (and line of sight) drop and cower
    noise: 5, // a shout carries: guards in this radius come to look
    cooldown: 1.5,
    cowerTime: 30, // an intimidated (untied) civilian gets back up after this long and runs for help
    cowerJitter: 8, // plus up to this much, so they don't all get up at once
  },

  power: {
    breakerTime: 2, // hold E at the breaker
    dispatchDelay: 8, // the desk takes this long to send a guard to the breaker
    resetTime: 3, // the guard fiddles with the breaker this long before the power comes back
  },

  panic: {
    pressTime: 0.8, // a civilian at the button needs this long to press it
  },

  view: {
    pitch: 55, // degrees down from horizontal
    zoomClose: 13, // camera distance from target, meters
    zoomPlanning: 26,
    zoomDefault: 16,
    fov: 40,
    facingLead: 1.5, // camera looks this far ahead of the player along their facing
    followLerp: 8, // per second
    wallHeight: 3.0,
    wallStub: 0.35,
    cutRadius: 6.5, // half-width of the cutaway region
    cutDepth: 9, // how far toward the camera walls get cut
    coneRays: 48,
    walkAnimSpeed: 1.6, // m/s the walk clip looks right at; playback scales with real speed
    runAnimSpeed: 4.6,
  },
} as const;

export type Tuning = typeof T;
