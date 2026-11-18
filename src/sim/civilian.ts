// Civilians: customers and staff. Same detection math (120°, 8 m). On full suspicion they scream
// and run to the nearest guard, who then raises it (masked) or comes to check (unmasked trespass).
import { T } from '../tuning';
import { angleDiff } from './detection';
import { investigate, setState } from './guard';
import { inRect, type Vec2 } from './level';
import type { Civilian, CivilianState, Guard } from './types';
import type { Sim } from './sim';
import { nearestPanic, pressPanic } from './security';

const DEG = Math.PI / 180;

function go(c: Civilian, s: CivilianState): void {
  c.state = s;
  c.stateTime = 0;
  c.path = [];
  c.goal = null;
}

function turnToward(c: Civilian, yaw: number, dt: number): void {
  const d = angleDiff(c.yaw, yaw);
  const max = T.civilian.turnRate * DEG * dt;
  c.yaw += Math.max(-max, Math.min(max, d));
}

function walk(sim: Sim, c: Civilian, speed: number, dt: number): boolean {
  const next = c.path[0];
  if (!next) return true;
  const dx = next.x - c.pos.x;
  const dy = next.y - c.pos.y;
  const d = Math.hypot(dx, dy);
  turnToward(c, Math.atan2(dy, dx), dt);
  const s = speed * dt;
  if (d <= s) {
    c.pos.x = next.x;
    c.pos.y = next.y;
    c.path.shift();
  } else sim.grid.moveCircle(c.pos, T.civilian.radius, (dx / d) * s, (dy / d) * s, true);
  c.moving = true;
  return c.path.length === 0;
}

function randomPointIn(sim: Sim, zoneId: string): Vec2 | null {
  const z = sim.level.zones.find((q) => q.id === zoneId);
  if (!z) return null;
  for (let i = 0; i < 10; i++) {
    const p = { x: z.x + sim.rng.next() * z.w, y: z.y + sim.rng.next() * z.h };
    if (sim.grid.walkable(Math.floor(p.x), Math.floor(p.y)) && inRect(p, z)) return p;
  }
  return null;
}

export function updateCivilian(sim: Sim, c: Civilian, dt: number): void {
  c.stateTime += dt;
  c.moving = false;
  if (c.state === 'tied' || c.state === 'dead') return;
  if (sim.alarm.tripped && c.state !== 'cower') go(c, 'cower');
  if (sim.alarm.tripped) c.cowerTime = Infinity; // after the alarm they stay down for good

  switch (c.state) {
    case 'wander': {
      if (c.suspicion >= T.detection.look && c.lastKnown) {
        go(c, 'look');
        break;
      }
      if (c.path.length) {
        walk(sim, c, T.civilian.speed, dt);
        break;
      }
      c.idleTimer -= dt;
      if (c.idleTimer <= 0) {
        const p = randomPointIn(sim, c.wanderZone);
        if (p) c.path = sim.grid.findPath(c.pos, p, T.civilian.radius) ?? [];
        c.idleTimer = sim.rng.range(2, 6);
      }
      break;
    }
    case 'look': {
      if (c.lastKnown) turnToward(c, Math.atan2(c.lastKnown.y - c.pos.y, c.lastKnown.x - c.pos.x), dt);
      if (c.suspicion < T.detection.look && c.stateTime > 1) go(c, 'wander');
      break;
    }
    case 'flee': {
      const btn = sim.security.panicButtons.find((b) => b.id === c.fleeTo);
      if (btn) {
        if (!sim.security.powerOn) {
          go(c, 'cower');
          c.cowerTime = Infinity;
          break;
        }
        if (Math.hypot(btn.pos.x - c.pos.x, btn.pos.y - c.pos.y) < 0.9) {
          turnToward(c, Math.atan2(btn.pos.y - c.pos.y, btn.pos.x - c.pos.x), dt);
          if (pressPanic(sim, c, btn, dt)) {
            go(c, 'cower');
            c.cowerTime = Infinity;
          }
          break;
        }
        if (!c.path.length) c.path = sim.grid.findPath(c.pos, btn.pos, T.civilian.radius) ?? [];
        walk(sim, c, T.civilian.fleeSpeed, dt);
        break;
      }
      const g = sim.guards.find((q) => q.id === c.fleeTo);
      if (!g) {
        go(c, 'cower');
        break;
      }
      if (!c.path.length || c.stateTime % 1 < dt) c.path = sim.grid.findPath(c.pos, g.pos, T.civilian.radius) ?? [];
      walk(sim, c, T.civilian.fleeSpeed, dt);
      if (Math.hypot(g.pos.x - c.pos.x, g.pos.y - c.pos.y) < 1.6) tell(sim, c, g);
      break;
    }
    case 'cower':
      // shouted down but not tied: after a while they get brave, get up and run for help
      if (c.cowerTime !== Infinity) {
        c.cowerTime -= dt;
        if (c.cowerTime <= 0 && !sim.alarm.tripped) {
          c.cowerTime = Infinity;
          go(c, 'wander');
          c.lastKnown = { ...sim.player.pos };
          c.suspicion = 100;
          sim.events.emit({ type: 'bark', who: c.id, line: 'civ.getup.01' });
          civilianSpotted(sim, c);
        }
      }
      break;
  }
}

/** Reached a guard: hand over what they saw. */
function tell(sim: Sim, c: Civilian, g: Guard): void {
  const where = c.lastKnown ?? sim.player.pos;
  const who = c.role === 'staff' ? 'The clerk' : 'A customer';
  if (g.state === 'down' || g.state === 'tied') {
    go(c, 'cower'); // the guard they ran to is down: nobody to tell
    return;
  }
  if (sim.player.masked) {
    if (g.state !== 'report' && g.state !== 'alert') {
      setState(g, 'report');
      g.reportTimer = T.guard.reportTime;
      g.lastKnown = { ...where };
      g.reportReason = `${who} saw you masked and ran to ${g.label}, who called it in`;
      sim.events.emit({ type: 'bark', who: g.id, line: 'guard.radio.01' });
    }
    go(c, 'cower');
  } else {
    investigate(sim, g, where, 'dispatch');
    sim.events.emit({ type: 'message', text: `${who} told ${g.label} someone's in the staff area.`, tone: 'warn' });
    c.suspicion = 0;
    go(c, 'wander');
  }
}

/** Meter hit 100. */
export function civilianSpotted(sim: Sim, c: Civilian): void {
  if (c.state === 'flee' || c.state === 'cower') return;
  let best: Guard | null = null;
  for (const g of sim.guards) if (g.state !== 'down' && g.state !== 'tied' && (!best || Math.hypot(g.pos.x - c.pos.x, g.pos.y - c.pos.y) < Math.hypot(best.pos.x - c.pos.x, best.pos.y - c.pos.y))) best = g;
  sim.events.emit({ type: 'bark', who: c.id, line: sim.rng.pick(sim.lineIds(sim.player.masked ? 'civ.scream' : 'civ.staffonly')) });
  if (sim.player.masked) sim.emitNoise(c.pos.x, c.pos.y, T.civilian.screamRadius, 'scream');
  // the nearest guard or panic button, whichever is closer (masked only: an unmasked trespass goes to a guard)
  const gd = best ? Math.hypot(best.pos.x - c.pos.x, best.pos.y - c.pos.y) : Infinity;
  const btn = sim.player.masked ? nearestPanic(sim, c.pos, gd) : null;
  if (!best && !btn) {
    go(c, 'cower');
    c.cowerTime = Infinity;
    return;
  }
  go(c, 'flee');
  c.fleeTo = btn ? btn.id : best!.id;
}
