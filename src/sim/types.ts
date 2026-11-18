import type { Vec2 } from './level';

/** One tick of player intent, already mapped to world space by the input layer. */
export interface InputFrame {
  moveX: number; // world-space desired direction, length <= 1
  moveY: number;
  aimX: number; // world-space aim point on the ground
  aimY: number;
  sprint: boolean;
  crouch: boolean;
  interact: boolean; // E held
  mask: boolean; // G held
  mark: boolean; // Q pressed this tick (edge)
  throw: boolean; // F pressed this tick (edge)
  fire: boolean; // left mouse (or Space) held
  aim: boolean; // right mouse held: face the cursor and shoot at it
  reload: boolean; // R pressed this tick (edge)
  gadget1: boolean; // 1 pressed this tick (edge): use gadget slot 1
  gadget2: boolean; // 2 pressed this tick (edge): use gadget slot 2
  shout: boolean; // V pressed this tick (edge): intimidate civilians
}

export const NO_INPUT: InputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, sprint: false, crouch: false, interact: false, mask: false, mark: false, throw: false, fire: false, reload: false, aim: false, gadget1: false, gadget2: false, shout: false };

export type BagWeight = 'light' | 'medium' | 'heavy';

export interface Player {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  yaw: number;
  prevYaw: number;
  crouch: boolean;
  sprinting: boolean;
  moving: boolean;
  masked: boolean;
  maskProgress: number; // 0..1 while holding G
  carrying: BagWeight | null;
  carryValue: number;
  bagCount: number;
  inRestricted: boolean;
  escorts: number;
  zipTies: number;
  hp: number;
  armor: number;
  armorMax: number;
  speedMul: number; // armor: heavy vest is slower
  casingBonus: boolean; // tailored suit look: slower casing suspicion (not with a heavy vest)
  lastHit: number;
  mag: number;
  reserve: number;
  reloadTimer: number;
  fireCd: number;
  aiming: boolean;
  frozen: number; // seconds of no control (escort fade)
  noiseTimer: number;
}

/** Why the meter is moving, kept per observer so the debug overlay and HUD can explain a detection. */
export interface DetectionInfo {
  inRange: boolean;
  inCone: boolean;
  los: boolean;
  dist: number;
  fDist: number;
  fMove: number;
  fStatus: number;
  fBag: number;
  rate: number; // suspicion per second right now (negative = draining)
}

export interface ObserverBase {
  id: string;
  label: string; // short human name for messages ("Guard A", "Showroom camera")
  pos: Vec2;
  prev: Vec2;
  yaw: number;
  prevYaw: number;
  cone: number; // radians, full angle
  range: number;
  suspicion: number;
  peak: 0 | 30 | 60 | 100; // highest threshold crossed in the current episode
  sinceSeen: number;
  sees: boolean; // has the player in view this tick (with nonzero fill)
  lastKnown: Vec2 | null;
  info: DetectionInfo;
}

export type GuardState = 'patrol' | 'look' | 'investigate' | 'search' | 'return' | 'report' | 'alert' | 'down' | 'tied';

export interface Guard extends ObserverBase {
  kind: 'guard';
  routeId: string;
  route: Vec2[];
  routeIdx: number;
  routeWait: number;
  state: GuardState;
  stateTime: number;
  path: Vec2[];
  pathGoal: Vec2 | null;
  repathTimer: number;
  waitTimer: number;
  target: Vec2 | null; // investigation point
  searchYaw: number;
  reportTimer: number;
  barkTimer: number;
  idleBarkTimer: number;
  lookHold: number;
  moving: boolean;
  reportReason: string;
  /** Pager: >0 counts down to the first ring after a takedown; ringing counts up while it rings. */
  pagerDelay: number;
  pagerRinging: number;
  pagerDone: boolean;
  downTime: number;
  hp: number;
  dead: boolean;
  fireCd: number;
  bagged: boolean; // in a body bag: bodies checks skip him and he never wakes
}

export interface SecurityCamera extends ObserverBase {
  kind: 'camera';
  baseYaw: number;
  sweep: number;
  period: number;
  phase: number;
  locked: boolean;
  deskTimer: number; // >0 while the desk is about to raise the alarm
  deskReason: string;
  dead: boolean;
  dispatched: boolean;
}

export type CivilianState = 'wander' | 'look' | 'flee' | 'cower' | 'tied' | 'dead';

export interface Civilian extends ObserverBase {
  kind: 'civilian';
  role: 'customer' | 'staff';
  wanderZone: string;
  state: CivilianState;
  stateTime: number;
  path: Vec2[];
  goal: Vec2 | null;
  idleTimer: number;
  fleeTo: string | null; // guard id or panic button id
  moving: boolean;
  cowerTime: number; // seconds left cowering after a shout before they get up (Infinity = for good)
  bagged: boolean;
}

export type Observer = Guard | SecurityCamera | Civilian;

export interface CaseState {
  id: string;
  x: number;
  y: number;
  value: number;
  smashed: boolean;
  looted: boolean;
}

export interface Interactable {
  id: string;
  x: number;
  y: number;
  /** Returns the interaction def id currently offered, or a reason string prefixed with '!' when blocked. */
  offer: () => string | null;
}

export interface ActiveInteraction {
  targetId: string;
  defId: string;
  progress: number;
  time: number;
  noiseTimer: number;
}

export interface NoiseRing {
  x: number;
  y: number;
  r: number;
  age: number;
  source: string;
}

export interface AlarmState {
  tripped: boolean;
  cause: string;
  time: number;
}
