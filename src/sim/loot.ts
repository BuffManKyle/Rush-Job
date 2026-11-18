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
  /** Order picked up; the first carried bag goes in the left hand, the second in the right. */
  carriedAt: number;
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

/** Put loot into a light bag the player already carries (if it has room), or into a new bag in a free hand. */
export function bagLoot(sim: Sim, weight: BagWeight, value: number, contents: string): void {
  const p = sim.player;
  const cur = weight === 'light' ? carriedBags(sim).find((b) => b.weight === 'light' && b.value < T.bags.lightCapacity) : undefined;
  if (cur) {
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
      carriedAt: sim.tick,
    };
    sim.bags.push(b);
    sim.interactables.push(bagInteractable(sim, b));
  }
  syncPlayer(sim);
}

/** Bags in hand, in pickup order (left hand first). */
export function carriedBags(sim: Sim): Bag[] {
  return sim.bags.filter((b) => b.state === 'carried').sort((a, b) => a.carriedAt - b.carriedAt);
}

/** The bag F throws: the last one picked up. */
export function carried(sim: Sim): Bag | undefined {
  const bs = carriedBags(sim);
  return bs[bs.length - 1];
}

const ORDER: BagWeight[] = ['light', 'medium', 'heavy'];

/** Player fields mirror the carried bags so detection and movement can read them cheaply. */
export function syncPlayer(sim: Sim): void {
  const bs = carriedBags(sim);
  const p = sim.player;
  p.bagCount = bs.length;
  // movement follows the heaviest bag in hand
  p.carrying = bs.length ? bs.reduce((w, b) => (ORDER.indexOf(b.weight) > ORDER.indexOf(w) ? b.weight : w), bs[0].weight) : null;
  p.carryValue = bs.reduce((a, b) => a + b.value, 0);
}

/** Can another loot pickup be bagged? A light bag with room takes more jewelry; otherwise you need a free hand. */
export function canBag(sim: Sim, weight: BagWeight): string | null {
  const bs = carriedBags(sim);
  if (weight === 'light' && bs.some((b) => b.weight === 'light' && b.value < T.bags.lightCapacity)) return null;
  if (bs.length < T.bags.maxCarried) return null;
  return '!Both hands full: throw a bag (F) or drop them at the van';
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
      return carriedBags(sim).length >= T.bags.maxCarried ? '!Both hands full' : 'bag_pickup';
    },
  };
}

export function pickUp(sim: Sim, id: string): void {
  const b = sim.bags.find((q) => q.id === id);
  if (!b || b.state !== 'ground' || carriedBags(sim).length >= T.bags.maxCarried) return;
  b.state = 'carried';
  b.carriedAt = sim.tick;
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
