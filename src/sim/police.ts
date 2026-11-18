// The loud scramble (DESIGN.md "The alarm and the loud scramble"): a heat clock, cops that push in
// from the entrances, and getting cuffed. No waves: pressure only rises.
import { T } from '../tuning';
import type { Vec2 } from './level';
import type { Sim } from './sim';

export type CopKind = 'patrol' | 'shield' | 'tactical';

export interface Cop {
  id: string;
  kind: CopKind;
  pos: Vec2;
  prev: Vec2;
  yaw: number;
  prevYaw: number;
  path: Vec2[];
  repath: number;
}

export interface HeatState {
  level: number; // 0 = alarm, cops not here yet; 1..4
  nextAt: number; // sim time the next level starts (Infinity after 4)
  vanLeavesAt: number;
  arrest: number; // 0..1 cuffing progress on the player
}

export const HEAT_NAMES = ['Alarm', 'Response', 'Pressure', 'Breach', 'Leave now'];

export function startHeat(sim: Sim): void {
  sim.heat = { level: 0, nextAt: sim.time + T.heat.firstDelay + hostageDelay(sim), vanLeavesAt: Infinity, arrest: 0 };
}

function hostageDelay(sim: Sim): number {
  const tied = sim.civilians.filter((c) => c.state === 'tied').length;
  return Math.min(T.heat.maxHostages, tied) * T.heat.hostageDelay;
}

function spawn(sim: Sim, kind: CopKind, entrance: string): void {
  const spots = sim.level.markers.filter((m) => m.type === 'police_spawn' && (m.group === entrance || !m.group));
  if (!spots.length || sim.cops.length >= T.heat.maxCops) return;
  const s = sim.rng.pick(spots);
  const p = { x: s.x + sim.rng.range(-0.4, 0.4), y: s.y + sim.rng.range(-0.4, 0.4) };
  sim.cops.push({ id: `cop_${sim.cops.length + 1}`, kind, pos: p, prev: { ...p }, yaw: -Math.PI / 2, prevYaw: -Math.PI / 2, path: [], repath: 0 });
}

const WAVES: Record<number, [CopKind, string][]> = {
  1: [
    ['patrol', 'front'],
    ['patrol', 'front'],
  ],
  2: [
    ['patrol', 'front'],
    ['patrol', 'alley'],
    ['patrol', 'alley'],
  ],
  3: [
    ['shield', 'front'],
    ['shield', 'alley'],
  ],
  4: [
    ['tactical', 'front'],
    ['tactical', 'alley'],
    ['tactical', 'front'],
  ],
};

export function updateHeat(sim: Sim, dt: number): void {
  const h = sim.heat;
  if (!h) return;
  if (sim.time >= h.nextAt && h.level < 4) {
    h.level++;
    for (const [k, e] of WAVES[h.level] ?? []) spawn(sim, k, e);
    h.nextAt = h.level < 4 ? sim.time + T.heat.levelTime + hostageDelay(sim) : Infinity;
    if (h.level === 4) h.vanLeavesAt = sim.time + T.heat.levelTime;
    sim.events.emit({ type: 'heat', level: h.level });
    sim.events.emit({ type: 'bark', who: 'dot', line: `dot.heat.0${h.level}` });
  }
  if (sim.time >= h.vanLeavesAt) {
    sim.endJob('cuffed', 'Dot drove off without you');
    return;
  }

  // cops chase the player
  for (const c of sim.cops) {
    c.prev.x = c.pos.x;
    c.prev.y = c.pos.y;
    c.prevYaw = c.yaw;
    c.repath -= dt;
    if (c.repath <= 0) {
      c.path = sim.grid.findPath(c.pos, sim.player.pos, 0.3) ?? [];
      c.repath = 0.5;
    }
    const d = Math.hypot(sim.player.pos.x - c.pos.x, sim.player.pos.y - c.pos.y);
    const next = c.path[0];
    if (next && d > 0.8) {
      const dx = next.x - c.pos.x;
      const dy = next.y - c.pos.y;
      const l = Math.hypot(dx, dy);
      const s = T.heat.speed[c.kind] * dt;
      c.yaw = Math.atan2(dy, dx);
      if (l <= s) {
        c.pos.x = next.x;
        c.pos.y = next.y;
        c.path.shift();
      } else sim.grid.moveCircle(c.pos, 0.3, (dx / l) * s, (dy / l) * s, true);
    } else c.yaw = Math.atan2(sim.player.pos.y - c.pos.y, sim.player.pos.x - c.pos.x);
  }

  // cuffing: anyone hostile within reach fills the arrest meter; more of them, faster
  const p = sim.player.pos;
  const near =
    sim.cops.filter((c) => Math.hypot(c.pos.x - p.x, c.pos.y - p.y) < T.heat.cuffReach).length +
    sim.guards.filter((g) => g.state === 'alert' && Math.hypot(g.pos.x - p.x, g.pos.y - p.y) < T.heat.cuffReach).length;
  if (near > 0) h.arrest += (dt / T.heat.cuffTime) * (1 + 0.5 * (near - 1));
  else h.arrest = Math.max(0, h.arrest - dt / T.heat.cuffTime);
  if (h.arrest >= 1) sim.endJob('cuffed', 'Cuffed');
}
