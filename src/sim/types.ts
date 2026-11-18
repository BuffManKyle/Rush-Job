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
}

export const NO_INPUT: InputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, sprint: false, crouch: false, interact: false, mask: false, mark: false };

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
  inRestricted: boolean;
  escorts: number;
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

export type GuardState = 'patrol' | 'look' | 'investigate' | 'search' | 'return' | 'report' | 'alert';

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
}

export interface SecurityCamera extends ObserverBase {
  kind: 'camera';
  baseYaw: number;
  sweep: number;
  period: number;
  phase: number;
  locked: boolean;
  deskTimer: number; // >0 while the desk is about to raise the alarm
  dispatched: boolean;
}

export type CivilianState = 'wander' | 'look' | 'flee' | 'cower';

export interface Civilian extends ObserverBase {
  kind: 'civilian';
  role: 'customer' | 'staff';
  wanderZone: string;
  state: CivilianState;
  stateTime: number;
  path: Vec2[];
  goal: Vec2 | null;
  idleTimer: number;
  fleeTo: string | null; // guard id
  moving: boolean;
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
