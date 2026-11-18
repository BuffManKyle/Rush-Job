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
    turnRate: 720, // deg/s, body yaw toward aim
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
    peripheralRadius: 1.2, // bumping right into someone counts as being seen at close range
  },

  camera: {
    cone: 60,
    range: 15,
    deskAlarmTime: 3, // security desk raises the alarm this long after a camera hits 100
    trackSpeed: 60, // deg/s when locked on
  },

  civilian: {
    cone: 120,
    range: 8,
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
    light: { speed: 0.9, sprint: true, throw: 6 },
    medium: { speed: 0.75, sprint: false, throw: 4 },
    heavy: { speed: 0.6, sprint: false, throw: 3 },
  },

  view: {
    pitch: 55, // degrees down from horizontal
    zoomClose: 13, // camera distance from target, meters
    zoomPlanning: 26,
    zoomDefault: 16,
    fov: 40,
    mouseLead: 0.22, // fraction of the player→aim vector the camera leads by
    mouseLeadMax: 3.5,
    followLerp: 8, // per second
    wallHeight: 3.0,
    wallStub: 0.35,
    cutRadius: 6.5, // half-width of the cutaway region
    cutDepth: 9, // how far toward the camera walls get cut
    coneRays: 48,
  },
} as const;

export type Tuning = typeof T;
