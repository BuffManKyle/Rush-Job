// Guard AI: patrol waypoint loops, turn to look at "?", investigate at 60 or on noise, search, return, report at 100.
import { T } from '../tuning';
import { angleDiff } from './detection';
import type { Vec2 } from './level';
import type { Guard, GuardState } from './types';
import type { Sim } from './sim';

const DEG = Math.PI / 180;

export function setState(g: Guard, s: GuardState): void {
  if (g.state === s) return;
  g.state = s;
  g.stateTime = 0;
  g.path = [];
  g.pathGoal = null;
}

function bark(sim: Sim, g: Guard, prefix: string, force = false): void {
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

export function investigate(sim: Sim, g: Guard, at: Vec2, why: 'noise' | 'saw' | 'dispatch'): void {
  if (g.state === 'report' || g.state === 'alert') return;
  g.target = { x: at.x, y: at.y };
  if (g.state !== 'investigate') {
    setState(g, 'investigate');
    bark(sim, g, why === 'noise' ? 'guard.noise' : 'guard.search', true);
  }
}

export function updateGuard(sim: Sim, g: Guard, dt: number): void {
  g.stateTime += dt;
  g.barkTimer -= dt;
  g.repathTimer -= dt;
  g.moving = false;
  const sus = g.suspicion;

  if (sim.alarm.tripped && g.state !== 'alert') setState(g, 'alert');

  // threshold reactions (the meter itself is updated by detection.ts before this runs)
  if (g.state !== 'report' && g.state !== 'alert') {
    if (sus >= T.detection.investigate && g.lastKnown && g.sees) {
      if (g.state !== 'investigate') bark(sim, g, 'guard.search', true);
      g.target = { ...g.lastKnown };
      if (g.state !== 'investigate') setState(g, 'investigate');
    } else if (sus >= T.detection.look && (g.state === 'patrol' || g.state === 'return')) {
      setState(g, 'look');
      bark(sim, g, 'guard.huh', true);
    }
  }

  switch (g.state) {
    case 'patrol': {
      const wp = g.route[g.routeIdx];
      if (g.waitTimer > 0) {
        g.waitTimer -= dt;
        // glance toward the next leg while waiting
        const nx = g.route[(g.routeIdx + 1) % g.route.length];
        if (g.waitTimer < g.routeWait * 0.5) turnToward(g, Math.atan2(nx.y - g.pos.y, nx.x - g.pos.x), dt * 0.5);
        if (g.waitTimer <= 0) g.routeIdx = (g.routeIdx + 1) % g.route.length;
        break;
      }
      if (walkTo(sim, g, wp, T.guard.patrolSpeed, dt)) {
        g.waitTimer = Math.max(0.05, g.routeWait);
        g.path = [];
        g.pathGoal = null;
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
        setState(g, 'search');
        g.searchYaw = g.yaw;
      }
      break;
    }
    case 'search': {
      const sweep = Math.sin(g.stateTime * 1.6) * 70 * DEG;
      turnToward(g, g.searchYaw + sweep, dt);
      if (g.stateTime > T.guard.searchTime && sus < T.detection.investigate) {
        bark(sim, g, 'guard.giveup', true);
        setState(g, 'return');
      }
      break;
    }
    case 'return': {
      // rejoin the loop at the nearest waypoint
      if (g.stateTime < dt * 1.5) {
        let best = 0;
        let bd = Infinity;
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
        g.waitTimer = 0.5;
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
      const p = sim.player.pos;
      const d = Math.hypot(p.x - g.pos.x, p.y - g.pos.y);
      if (d > 1.4) walkTo(sim, g, p, T.guard.alertSpeed, dt);
      else turnToward(g, Math.atan2(p.y - g.pos.y, p.x - g.pos.x), dt);
      break;
    }
  }
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
    bark(sim, g, 'guard.trespass', true);
    reason = `${g.label} caught you in a staff area again and called it in`;
  } else {
    bark(sim, g, 'guard.spotted', true);
  }
  setState(g, 'report');
  g.reportTimer = T.guard.reportTime;
  g.reportReason = reason;
  sim.events.emit({ type: 'suspicion', who: g.id, level: 'report' });
}
