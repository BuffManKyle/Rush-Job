// Loot bags (DESIGN.md "Loot bags"), the safe + its shuffled code, and leaving in the van.
import { T } from '../tuning';
import { inRect, type Vec2 } from './level';
import type { BagWeight, Interactable } from './types';
import type { Sim } from './sim';

export interface Bag {
  id: string;
  weight: BagWeight;
  value: number;
  contents: string;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  flight: number; // seconds of flight left
  state: 'ground' | 'carried' | 'flying' | 'secured';
}

export interface SafeState {
  id: string;
  x: number;
  y: number;
  value: number;
  open: boolean;
  looted: boolean;
}

let bagSeq = 0;

export function inVanZone(sim: Sim, p: Vec2): boolean {
  return sim.level.zones.some((z) => z.type === 'van_drop' && inRect(p, z));
}

/** Put loot in the player's hands (a new bag), or into the light bag they already carry. */
export function bagLoot(sim: Sim, weight: BagWeight, value: number, contents: string): void {
  const p = sim.player;
  const cur = carried(sim);
  if (cur && cur.weight === 'light' && weight === 'light') {
    cur.value += value;
    cur.contents = contents;
  } else {
    const b: Bag = {
      id: `bag_${++bagSeq}`,
      weight,
      value,
      contents,
      pos: { ...p.pos },
      prev: { ...p.pos },
      vel: { x: 0, y: 0 },
      flight: 0,
      state: 'carried',
    };
    sim.bags.push(b);
    sim.interactables.push(bagInteractable(sim, b));
  }
  syncPlayer(sim);
}

export function carried(sim: Sim): Bag | undefined {
  return sim.bags.find((b) => b.state === 'carried');
}

/** Player fields mirror the carried bag so detection and movement can read them cheaply. */
export function syncPlayer(sim: Sim): void {
  const b = carried(sim);
  sim.player.carrying = b ? b.weight : null;
  sim.player.carryValue = b ? b.value : 0;
}

/** Can another loot pickup go into the current bag? Light bags hold up to `T.bags.lightCapacity` cases. */
export function canBag(sim: Sim, weight: BagWeight): string | null {
  const b = carried(sim);
  if (!b) return null;
  if (b.weight === 'light' && weight === 'light' && b.value < T.bags.lightCapacity) return null;
  return '!Hands full: throw (F) or drop the bag at the van';
}

export function throwBag(sim: Sim, aim: Vec2): void {
  const b = carried(sim);
  if (!b) return;
  const p = sim.player;
  const dx = aim.x - p.pos.x;
  const dy = aim.y - p.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const range = Math.min(T.bags[b.weight].throw, Math.max(1, d));
  const t = T.bags.flightTime;
  b.state = 'flying';
  b.pos = { x: p.pos.x + (dx / d) * 0.4, y: p.pos.y + (dy / d) * 0.4 };
  b.prev = { ...b.pos };
  b.vel = { x: ((dx / d) * range) / t, y: ((dy / d) * range) / t };
  b.flight = t;
  syncPlayer(sim);
}

export function updateBags(sim: Sim, dt: number): void {
  for (const b of sim.bags) {
    b.prev.x = b.pos.x;
    b.prev.y = b.pos.y;
    if (b.state === 'carried') {
      b.pos.x = sim.player.pos.x;
      b.pos.y = sim.player.pos.y;
      if (inVanZone(sim, b.pos)) secure(sim, b);
    } else if (b.state === 'flying') {
      const before = { ...b.pos };
      sim.grid.moveCircle(b.pos, 0.2, b.vel.x * dt, b.vel.y * dt);
      // hit a wall: stop dead
      if (Math.hypot(b.pos.x - before.x - b.vel.x * dt, b.pos.y - before.y - b.vel.y * dt) > 0.05) b.flight = 0;
      b.flight -= dt;
      if (b.flight <= 0) {
        b.state = 'ground';
        sim.emitNoise(b.pos.x, b.pos.y, T.bags.landNoise, 'bag');
        if (inVanZone(sim, b.pos)) secure(sim, b);
      }
    }
  }
}

function secure(sim: Sim, b: Bag): void {
  b.state = 'secured';
  sim.secured += b.value;
  sim.events.emit({ type: 'message', text: `Bag secured: $${b.value.toLocaleString()} (${b.contents}). Dot honks.`, tone: 'info' });
  sim.events.emit({ type: 'bark', who: 'dot', line: sim.rng.pick(sim.lineIds('dot.bag')) });
  syncPlayer(sim);
}

function bagInteractable(sim: Sim, b: Bag): Interactable {
  return {
    id: b.id,
    get x() {
      return b.pos.x;
    },
    get y() {
      return b.pos.y;
    },
    offer: () => {
      if (b.state !== 'ground') return null;
      return carried(sim) ? '!Hands full' : 'bag_pickup';
    },
  };
}

export function pickUp(sim: Sim, id: string): void {
  const b = sim.bags.find((q) => q.id === id);
  if (!b || b.state !== 'ground' || carried(sim)) return;
  b.state = 'carried';
  syncPlayer(sim);
}

export function safeInteractable(sim: Sim, s: SafeState): Interactable {
  return {
    id: s.id,
    x: s.x,
    y: s.y,
    offer: () => {
      if (s.looted) return null;
      if (!s.open) return sim.knowsCode ? 'safe_code' : '!Locked. The code is on a sticky note somewhere.';
      if (!sim.player.masked) return '!Mask up first (hold G)';
      return canBag(sim, 'heavy') ?? 'safe_loot';
    },
  };
}

export function noteInteractable(sim: Sim, at: Vec2): Interactable {
  return {
    id: 'code_note',
    x: at.x,
    y: at.y,
    offer: () => (sim.knowsCode ? null : 'read_note'),
  };
}

export function vanInteractable(sim: Sim): Interactable | null {
  const z = sim.level.zones.find((q) => q.type === 'van_drop');
  if (!z) return null;
  return {
    id: 'van',
    x: z.x + z.w / 2,
    y: z.y + 0.3,
    offer: () => (sim.ended ? null : 'leave'),
  };
}
