// Guard AI: patrol waypoint loops, turn to look at "?", investigate at 60 or on noise, search, return, report at 100.
// One escalation ladder for everyone (Nov 21 rework): suspicious ("?") → investigate → search → radio it in.
// Only a confirmed sighting (you, masked; a body; a shot fired in front of him) goes straight to the radio.
// Guards stay on the store's property (property.ts): they check up to the edge and look out, never past it.
import { T } from '../tuning';
import { angleDiff, emptyInfo } from './detection';
import { clampToProperty, onProperty } from './property';
import { deskCheck, guardSeesDeadCameras } from './cameras';
import type { Vec2 } from './level';
import type { Guard, GuardState } from './types';
import type { Sim } from './sim';

const DEG = Math.PI / 180;

/** A fresh guard on `route` (shared by the route loader in sim.ts and the operator in security.ts). */
export function makeGuard(id: string, label: string, route: Vec2[], routeId: string, wait: number, idleBark: number): Guard {
  const start = route[0];
  const second = route[1] ?? start;
  const yaw = Math.atan2(second.y - start.y, second.x - start.x);
  return {
    kind: 'guard',
    id,
    label,
    pos: { ...start },
    prev: { ...start },
    yaw,
    prevYaw: yaw,
    cone: T.guard.cone * DEG,
    range: T.guard.range,
    suspicion: 0,
    peak: 0,
    sinceSeen: 99,
    sees: false,
    lastKnown: null,
    info: emptyInfo(),
    routeId,
    route,
    routeIdx: 1 % route.length,
    routeWait: wait,
    state: 'patrol',
    stateTime: 0,
    path: [],
    pathGoal: null,
    repathTimer: 0,
    waitTimer: 0,
    target: null,
    lookAt: null,
    searchYaw: 0,
    reportTimer: 0,
    barkTimer: 0,
    idleBarkTimer: idleBark,
    lookHold: 0,
    moving: false,
    reportReason: '',
    pagerDelay: 0,
    pagerRinging: 0,
    pagerDone: false,
    downTime: 0,
    hp: T.guard.hp,
    dead: false,
    fireCd: 1,
    bagged: false,
    role: 'patrol',
    errand: null,
    routeWaits: null,
    seatYaw: null,
  };
}

export function setState(g: Guard, s: GuardState): void {
  if (g.state === s) return;
  g.state = s;
  g.stateTime = 0;
  g.path = [];
  g.pathGoal = null;
  if (s !== 'investigate' && s !== 'search') g.errand = null;
}

export function bark(sim: Sim, g: Guard, prefix: string, force = false): void {
  if (!force && g.barkTimer > 0) return;
  const ids = sim.lineIds(prefix);
  if (!ids.length) return;
  sim.events.emit({ type: 'bark', who: g.id, line: sim.rng.pick(ids) });
  g.barkTimer = 2.5;
}

function turnToward(g: Guard, yaw: number, dt: number): void {
  const d = angleDiff(g.yaw, yaw);
  const max = T.guard.turnRate * DEG * dt;
  g.yaw += Math.max(-max, Math.min(max, d));
}

/** Walk the current path toward `goal`, replanning when the goal moves. Returns true on arrival. */
function walkTo(sim: Sim, g: Guard, goal: Vec2, speed: number, dt: number): boolean {
  if (Math.hypot(goal.x - g.pos.x, goal.y - g.pos.y) < 0.3) return true;
  const goalMoved = !g.pathGoal || Math.hypot(goal.x - g.pathGoal.x, goal.y - g.pathGoal.y) > 0.75;
  if ((goalMoved || g.path.length === 0) && (g.repathTimer <= 0 || !g.pathGoal)) {
    const path = sim.grid.findPath(g.pos, goal, T.guard.radius);
    g.pathGoal = { x: goal.x, y: goal.y };
    g.repathTimer = 0.4;
    if (!path) return true; // unreachable: give up rather than freeze
    // never step off the property, even if the shortest way round is via the street
    if (path.some((q) => !onProperty(sim, q))) return true;
    g.path = path;
  }
  const next = g.path[0];
  if (!next) return false;
  const dx = next.x - g.pos.x;
  const dy = next.y - g.pos.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  turnToward(g, Math.atan2(dy, dx), dt);
  // don't walk sideways through a turn: slow down until roughly facing the next point
  const facing = Math.cos(angleDiff(g.yaw, Math.atan2(dy, dx)));
  const s = facing > 0.3 ? step : step * 0.25;
  if (d <= s) {
    g.pos.x = next.x;
    g.pos.y = next.y;
    g.path.shift();
  } else {
    sim.grid.moveCircle(g.pos, T.guard.radius, (dx / d) * s, (dy / d) * s, true);
  }
  g.moving = true;
  return g.path.length === 0 && Math.hypot(goal.x - g.pos.x, goal.y - g.pos.y) < 0.5;
}

export const busy = (g: Guard) => g.state === 'report' || g.state === 'alert' || g.state === 'down' || g.state === 'tied';

/**
 * Send a guard to look at `at`. Off-property points are clamped to the property edge; he stops there and
 * looks toward the real spot. `errand: 'desk'` means "go read the security monitors" (cameras.ts deskCheck).
 */
export function investigate(sim: Sim, g: Guard, at: Vec2, why: 'noise' | 'saw' | 'dispatch', errand: 'desk' | null = null): boolean {
  if (busy(g)) return false; // radioing, fighting, downed or tied guards don't hear anything
  const goal = clampToProperty(sim, at);
  if (!goal) return false;
  g.target = goal;
  g.lookAt = { x: at.x, y: at.y };
  if (g.state !== 'investigate') {
    setState(g, 'investigate');
    if (why !== 'dispatch' || errand !== 'desk') bark(sim, g, why === 'noise' ? 'guard.noise' : 'guard.search', true);
  }
  g.errand = errand;
  return true;
}

/** Footsteps are only heard on the property: running down the street is just the city. */
const FOOTSTEPS = new Set(['sprint', 'footstep']);

/** A noise at (x, y) with radius r. Guards in earshot come and look (up to the property edge). */
export function hearNoise(sim: Sim, x: number, y: number, r: number, source: string): void {
  if (FOOTSTEPS.has(source) && !onProperty(sim, { x, y })) return;
  for (const g of sim.guards) {
    if (Math.hypot(g.pos.x - x, g.pos.y - y) > r * T.guard.hearingMultiplier) continue;
    if (g.errand === 'desk' && g.state === 'investigate') continue; // on his way to a buzzing desk: that comes first
    investigate(sim, g, { x, y }, 'noise');
  }
}

/** Where a waiting guard should be facing (the operator faces his monitors). */
function waitFor(sim: Sim, g: Guard): number {
  const w = g.routeWaits?.[g.routeIdx];
  return w ? sim.rng.range(w[0], w[1]) : Math.max(0.05, g.routeWait);
}

export function updateGuard(sim: Sim, g: Guard, dt: number): void {
  g.stateTime += dt;
  g.barkTimer -= dt;
  g.repathTimer -= dt;
  g.moving = false;
  const sus = g.suspicion;

  if (g.state === 'down' || g.state === 'tied') return; // handled in takedown.ts
  if (sim.interaction?.targetId === g.id && sim.interaction.defId === 'takedown') return; // in a headlock
  if (sim.alarm.tripped && g.state !== 'alert') setState(g, 'alert');

  // threshold reactions (the meter itself is updated by detection.ts before this runs)
  if (g.state !== 'report' && g.state !== 'alert') {
    if (sus >= T.detection.investigate && g.lastKnown && g.sees) {
      if (g.state !== 'investigate') bark(sim, g, 'guard.search', true);
      g.target = clampToProperty(sim, g.lastKnown) ?? g.target;
      g.lookAt = { ...g.lastKnown };
      if (g.state !== 'investigate') setState(g, 'investigate');
      g.errand = null;
    } else if (sus >= T.detection.look && (g.state === 'patrol' || g.state === 'return')) {
      setState(g, 'look');
      bark(sim, g, 'guard.huh', true);
    }
    if (g.state !== 'investigate' || g.errand !== 'desk') guardSeesDeadCameras(sim, g);
  }

  switch (g.state) {
    case 'patrol': {
      const wp = g.route[g.routeIdx];
      if (g.waitTimer > 0) {
        g.waitTimer -= dt;
        if (g.seatYaw !== null && g.routeIdx === 0) turnToward(g, g.seatYaw, dt);
        else {
          // glance toward the next leg while waiting
          const nx = g.route[(g.routeIdx + 1) % g.route.length];
          if (g.waitTimer < g.routeWait * 0.5) turnToward(g, Math.atan2(nx.y - g.pos.y, nx.x - g.pos.x), dt * 0.5);
        }
        if (g.waitTimer <= 0) {
          g.routeIdx = (g.routeIdx + 1) % g.route.length;
          if (g.role === 'operator') sim.events.emit({ type: 'message', text: g.routeIdx === 0 ? `${g.label} is heading back to the monitors.` : `${g.label} left the monitors for a smoke break.`, tone: 'info' });
        }
        break;
      }
      if (walkTo(sim, g, wp, T.guard.patrolSpeed, dt)) {
        g.waitTimer = waitFor(sim, g);
        g.path = [];
        g.pathGoal = null;
        if (g.role === 'operator' && g.routeIdx === 0) deskCheck(sim, g); // back in the chair: look over the board
      }
      g.idleBarkTimer -= dt;
      if (g.idleBarkTimer <= 0) {
        bark(sim, g, 'guard.idle');
        g.idleBarkTimer = sim.rng.range(18, 35);
      }
      break;
    }
    case 'look': {
      if (g.lastKnown) turnToward(g, Math.atan2(g.lastKnown.y - g.pos.y, g.lastKnown.x - g.pos.x), dt);
      if (sus < T.detection.look) {
        g.lookHold += dt;
        if (g.lookHold > T.guard.lookHoldTime) {
          g.lookHold = 0;
          setState(g, 'return');
        }
      } else g.lookHold = 0;
      break;
    }
    case 'investigate': {
      if (!g.target) {
        setState(g, 'return');
        break;
      }
      if (walkTo(sim, g, g.target, T.guard.investigateSpeed, dt) || g.stateTime > 20) {
        const errand = g.errand;
        setState(g, 'search');
        g.errand = errand;
        // face what he came for (the street beyond the door, the camera on the wall)
        const at = g.lookAt ?? g.target;
        g.searchYaw = Math.hypot(at.x - g.pos.x, at.y - g.pos.y) > 0.6 ? Math.atan2(at.y - g.pos.y, at.x - g.pos.x) : g.yaw;
        if (errand === 'desk' && sim.security.seat) g.searchYaw = sim.security.seat.yaw;
      }
      break;
    }
    case 'search': {
      if (g.errand === 'desk') {
        // reading the monitors
        turnToward(g, g.searchYaw, dt);
        if (g.stateTime >= T.security.deskCheckTime) {
          g.errand = null;
          if (!deskCheck(sim, g)) setState(g, 'return');
        }
        break;
      }
      const sweep = Math.sin(g.stateTime * 1.6) * 70 * DEG;
      turnToward(g, g.searchYaw + sweep, dt);
      if (g.stateTime > T.guard.searchTime + sim.security.wary * T.security.warySearch && sus < T.detection.investigate) {
        bark(sim, g, 'guard.giveup', true);
        setState(g, 'return');
      }
      break;
    }
    case 'return': {
      // rejoin the loop at the nearest waypoint (the operator goes straight back to his chair)
      if (g.stateTime < dt * 1.5) {
        let best = 0;
        let bd = Infinity;
        if (g.role !== 'operator')
          g.route.forEach((p, i) => {
            const d = Math.hypot(p.x - g.pos.x, p.y - g.pos.y);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
        g.routeIdx = best;
      }
      if (walkTo(sim, g, g.route[g.routeIdx], T.guard.patrolSpeed, dt)) {
        setState(g, 'patrol');
        g.waitTimer = g.role === 'operator' ? waitFor(sim, g) : 0.5;
        if (g.role === 'operator' && g.routeIdx === 0) deskCheck(sim, g);
      }
      break;
    }
    case 'report': {
      if (g.lastKnown) turnToward(g, Math.atan2(g.lastKnown.y - g.pos.y, g.lastKnown.x - g.pos.x), dt);
      g.reportTimer -= dt;
      sim.events.emit({ type: 'reporting', who: g.id, time: Math.max(0, g.reportTimer) });
      if (g.reportTimer <= 0) sim.tripAlarm(g.reportReason);
      break;
    }
    case 'alert': {
      // guards hold the store; the street is the police's job
      const p = sim.player.pos;
      const goal = clampToProperty(sim, p);
      const d = Math.hypot(p.x - g.pos.x, p.y - g.pos.y);
      if (goal && d > 0.8 && Math.hypot(goal.x - g.pos.x, goal.y - g.pos.y) > 0.4) walkTo(sim, g, goal, T.guard.alertSpeed, dt);
      else turnToward(g, Math.atan2(p.y - g.pos.y, p.x - g.pos.x), dt);
      break;
    }
  }
}

/** Radio it in: the last rung of the ladder. `reason` ends up on the alarm banner. */
export function startReport(sim: Sim, g: Guard, reason: string, line = 'guard.spotted'): void {
  if (busy(g)) return;
  bark(sim, g, line, true);
  setState(g, 'report');
  g.suspicion = 100;
  g.reportTimer = T.guard.reportTime;
  g.reportReason = reason;
  sim.events.emit({ type: 'suspicion', who: g.id, level: 'report' });
}

/** Called the tick an observer's meter reaches 100. */
export function guardSpotted(sim: Sim, g: Guard, reason: string): void {
  if (g.state === 'report' || g.state === 'alert') return;
  const p = sim.player;
  if (!p.masked) {
    // Casing rules: the first catch is an escort to the lobby, the next one gets called in.
    if (p.escorts < T.casing.escortsBeforeAlarm) {
      sim.escort(g);
      return;
    }
    startReport(sim, g, `${g.label} caught you in a staff area again and called it in`, 'guard.trespass');
    return;
  }
  startReport(sim, g, reason);
}

export type GuardStep = 'calm' | 'suspicious' | 'investigating' | 'checking_desk' | 'searching' | 'radioing' | 'alert' | 'down';

/** Which rung of the escalation ladder a guard is on (for the HUD badge: pillar 3, read the room). */
export function guardStep(g: Guard): GuardStep {
  switch (g.state) {
    case 'down':
    case 'tied':
      return 'down';
    case 'look':
      return 'suspicious';
    case 'investigate':
      return g.errand === 'desk' ? 'checking_desk' : 'investigating';
    case 'search':
      return g.errand === 'desk' ? 'checking_desk' : 'searching';
    case 'report':
      return 'radioing';
    case 'alert':
      return 'alert';
    default:
      return 'calm';
  }
}
