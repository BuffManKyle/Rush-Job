// Civilians: customers and staff. Same detection math (120°, 8 m). On full suspicion they scream
// and run to the nearest guard, who then raises it (masked) or comes to check (unmasked trespass).
import { T } from '../tuning';
import { angleDiff } from './detection';
import { investigate, setState } from './guard';
import { inRect, type Vec2 } from './level';
import type { Civilian, CivilianState, Guard } from './types';
import type { Sim } from './sim';

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
  if (sim.alarm.tripped && c.state !== 'cower') go(c, 'cower');

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
      break;
  }
}

/** Reached a guard: hand over what they saw. */
function tell(sim: Sim, c: Civilian, g: Guard): void {
  const where = c.lastKnown ?? sim.player.pos;
  const who = c.role === 'staff' ? 'The clerk' : 'A customer';
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
  for (const g of sim.guards) if (!best || Math.hypot(g.pos.x - c.pos.x, g.pos.y - c.pos.y) < Math.hypot(best.pos.x - c.pos.x, best.pos.y - c.pos.y)) best = g;
  sim.events.emit({ type: 'bark', who: c.id, line: sim.rng.pick(sim.lineIds(sim.player.masked ? 'civ.scream' : 'civ.staffonly')) });
  if (sim.player.masked) sim.emitNoise(c.pos.x, c.pos.y, T.civilian.screamRadius, 'scream');
  if (!best) {
    go(c, 'cower');
    return;
  }
  go(c, 'flee');
  c.fleeTo = best.id;
}
