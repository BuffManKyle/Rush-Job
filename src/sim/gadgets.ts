// Gadgets (DESIGN.md "Gadgets" + approach matrix, clever column). The loadout's two slots, their charges,
// and everything a gadget leaves in the world: thrown noisemakers and smoke, the ECM jammer, C4 charges.
// Tools (glass cutter, lockpick kit, body bags) change E interactions; see sim.ts / takedown.ts offers.
import { T } from '../tuning';
import { GADGETS, type GadgetId, type Loadout } from '../data/loadout';
import { hurtPlayer } from './combat';
import type { DoorState } from './grid';
import type { Vec2 } from './level';
import type { SafeState } from './loot';
import type { InputFrame } from './types';
import type { Sim } from './sim';

export interface GadgetSlot {
  id: GadgetId;
  /** Charges left; Infinity for tools you keep (glass cutter, lockpick kit). */
  charges: number;
}

export interface Thrown {
  id: string;
  kind: 'noisemaker' | 'smoke';
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  flight: number; // seconds of flight left
  state: 'flying' | 'active' | 'spent';
  timer: number; // noisemaker: time to next pulse; smoke: time left
  pulses: number;
}

export interface Placed {
  id: string;
  kind: 'ecm' | 'c4';
  pos: Vec2;
  yaw: number;
  until: number; // sim time it stops (ECM) or goes off (C4)
  target: string | null; // C4: door or safe id
  done: boolean;
}

export interface GearState {
  loadout: Loadout;
  slots: GadgetSlot[];
  cooldown: number;
  /** Last number-key use, for the view (gadget in hand) and HUD (flash). */
  lastUse: { slot: number; id: GadgetId; at: number } | null;
  thrown: Thrown[];
  placed: Placed[];
  ecmUntil: number;
}

let seq = 0;

export function createGear(loadout: Loadout): GearState {
  const slots: GadgetSlot[] = [];
  for (const id of loadout.gadgets) {
    if (!id) continue;
    const def = GADGETS[id];
    slots.push({ id, charges: def.charges > 0 ? def.charges : Infinity });
  }
  return { loadout, slots, cooldown: 0, lastUse: null, thrown: [], placed: [], ecmUntil: -1 };
}

export function slotOf(sim: Sim, id: GadgetId): GadgetSlot | undefined {
  return sim.gear.slots.find((s) => s.id === id);
}

/** In a slot with at least one charge left. */
export function hasGadget(sim: Sim, id: GadgetId): boolean {
  const s = slotOf(sim, id);
  return !!s && s.charges > 0;
}

export function spend(sim: Sim, id: GadgetId): void {
  const s = slotOf(sim, id);
  if (s && s.charges !== Infinity) s.charges = Math.max(0, s.charges - 1);
}

/** ECM: cameras are blind and pagers stay quiet. */
export function jammed(sim: Sim): boolean {
  return sim.time < sim.gear.ecmUntil;
}

export function lockpickTime(sim: Sim): number {
  return hasGadget(sim, 'lockpick_kit') ? T.doors.lockpickKitTime : T.doors.lockpickTime;
}

function say(sim: Sim, text: string, tone: 'info' | 'warn' | 'danger' = 'info'): void {
  sim.events.emit({ type: 'message', text, tone });
}

export function updateGadgets(sim: Sim, input: InputFrame, dt: number): void {
  const g = sim.gear;
  g.cooldown = Math.max(0, g.cooldown - dt);
  if (input.gadget1) useSlot(sim, 0, { x: input.aimX, y: input.aimY });
  if (input.gadget2) useSlot(sim, 1, { x: input.aimX, y: input.aimY });

  for (const t of g.thrown) updateThrown(sim, t, dt);
  g.thrown = g.thrown.filter((t) => t.state !== 'spent');
  for (const p of g.placed) {
    if (p.done) continue;
    if (p.kind === 'c4' && sim.time >= p.until) detonate(sim, p);
    if (p.kind === 'ecm' && sim.time >= p.until) {
      p.done = true;
      say(sim, 'ECM jammer is dead. Cameras and pagers are back.', 'warn');
    }
  }
  sim.grid.smokes = g.thrown.filter((t) => t.kind === 'smoke' && t.state === 'active').map((t) => ({ x: t.pos.x, y: t.pos.y, r: T.gadgets.smoke.radius }));
}

/** Number key: use the gadget in a slot. */
export function useSlot(sim: Sim, slot: number, aim: Vec2): void {
  const g = sim.gear;
  const p = sim.player;
  const s = g.slots[slot];
  if (!s || sim.ended || p.frozen > 0 || sim.interaction) return;
  const def = GADGETS[s.id];
  if (def.use === 'tool') {
    say(sim, `${def.name}: ${def.how}`);
    return;
  }
  if (T.gadgets.requireMask && !p.masked) return say(sim, 'Mask up first (hold G).', 'warn');
  if (g.cooldown > 0) return;
  if (s.charges <= 0) return say(sim, `${def.name}: none left.`, 'warn');
  let ok = false;
  switch (s.id) {
    case 'noisemaker':
    case 'smoke':
      ok = throwGadget(sim, s.id === 'smoke' ? 'smoke' : 'noisemaker', aim);
      break;
    case 'ecm_jammer':
      ok = placeEcm(sim);
      break;
    case 'medkit':
      ok = useMedkit(sim);
      break;
    case 'c4':
      ok = plantC4(sim);
      break;
  }
  if (!ok) return;
  spend(sim, s.id);
  g.cooldown = T.gadgets.useCooldown;
  g.lastUse = { slot, id: s.id, at: sim.time };
}

function throwGadget(sim: Sim, kind: Thrown['kind'], aim: Vec2): boolean {
  const p = sim.player;
  let dx = aim.x - p.pos.x;
  let dy = aim.y - p.pos.y;
  let d = Math.hypot(dx, dy);
  if (d < 0.5) {
    // cursor on top of you: lob it along your facing
    dx = Math.cos(p.yaw);
    dy = Math.sin(p.yaw);
    d = 1;
    aim = { x: p.pos.x + dx * 3, y: p.pos.y + dy * 3 };
  }
  const range = Math.min(T.gadgets.throwRange, Math.hypot(aim.x - p.pos.x, aim.y - p.pos.y));
  const ux = dx / d;
  const uy = dy / d;
  const ft = T.gadgets.throwFlightTime;
  const start = { x: p.pos.x + ux * 0.4, y: p.pos.y + uy * 0.4 };
  p.yaw = Math.atan2(uy, ux); // turn to throw
  sim.gear.thrown.push({
    id: `${kind}_${++seq}`,
    kind,
    pos: start,
    prev: { ...start },
    vel: { x: (ux * range) / ft, y: (uy * range) / ft },
    flight: ft,
    state: 'flying',
    timer: kind === 'noisemaker' ? T.gadgets.noisemaker.armTime : T.gadgets.smoke.duration,
    pulses: kind === 'noisemaker' ? T.gadgets.noisemaker.pulses : 0,
  });
  return true;
}

function updateThrown(sim: Sim, t: Thrown, dt: number): void {
  t.prev.x = t.pos.x;
  t.prev.y = t.pos.y;
  if (t.state === 'flying') {
    const before = { ...t.pos };
    sim.grid.moveCircle(t.pos, 0.12, t.vel.x * dt, t.vel.y * dt);
    // hit a wall: drop there
    if (Math.hypot(t.pos.x - before.x - t.vel.x * dt, t.pos.y - before.y - t.vel.y * dt) > 0.05) t.flight = 0;
    t.flight -= dt;
    if (t.flight <= 0) {
      t.state = 'active';
      if (t.kind === 'smoke') say(sim, `Smoke: nobody sees through it for ${T.gadgets.smoke.duration} s.`);
    }
    return;
  }
  if (t.state !== 'active') return;
  t.timer -= dt;
  if (t.kind === 'noisemaker') {
    if (t.timer <= 0 && t.pulses > 0) {
      sim.emitNoise(t.pos.x, t.pos.y, T.gadgets.noisemaker.radius, 'noisemaker');
      t.pulses--;
      t.timer = T.gadgets.noisemaker.pulseInterval;
    }
    // it stays on the floor (the view keeps drawing it) once it's done buzzing
  } else if (t.timer <= 0) t.state = 'spent';
}

function placeEcm(sim: Sim): boolean {
  const p = sim.player;
  const at = sim.facingPoint(0.5);
  const g = sim.gear;
  g.ecmUntil = sim.time + T.gadgets.ecm.duration;
  g.placed.push({ id: `ecm_${++seq}`, kind: 'ecm', pos: at, yaw: p.yaw, until: g.ecmUntil, target: null, done: false });
  for (const c of sim.cameras) {
    if (c.dead) continue;
    // blind from now on (cameras.ts skips jammed cameras); what the desk already queued is security.ts's business
    c.suspicion = 0;
    c.sees = false;
    c.locked = false;
  }
  say(sim, `ECM up: cameras blind and pagers quiet for ${T.gadgets.ecm.duration} s.`);
  return true;
}

function useMedkit(sim: Sim): boolean {
  const p = sim.player;
  if (p.hp >= T.health.hp && p.armor >= p.armorMax) {
    say(sim, "You're fine. Save it.", 'warn');
    return false;
  }
  p.hp = T.health.hp;
  p.armor = p.armorMax;
  say(sim, 'Patched up: full health.');
  return true;
}

/** C4 goes on the locked door or closed safe you're next to. */
function plantC4(sim: Sim): boolean {
  const p = sim.player;
  const reach = T.player.interactReach + 0.5;
  let best: { id: string; pos: Vec2; d: number } | null = null;
  const consider = (id: string, pos: Vec2) => {
    const d = Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y);
    if (d <= reach && (!best || d < best.d)) best = { id, pos, d };
  };
  for (const d of sim.grid.doors) if (d.locked && !d.open) consider(d.id, { x: d.cx + 0.5, y: d.cy + 0.5 });
  for (const s of sim.safes) if (!s.open) consider(s.id, { x: s.x, y: s.y });
  if (sim.gear.placed.some((q) => q.kind === 'c4' && !q.done && q.target === (best as { id: string } | null)?.id)) return false;
  if (!best) {
    say(sim, 'C4 goes on a locked door or the safe. Get next to one.', 'warn');
    return false;
  }
  const b = best as { id: string; pos: Vec2 };
  const at = { x: (b.pos.x + p.pos.x) / 2, y: (b.pos.y + p.pos.y) / 2 };
  sim.gear.placed.push({ id: `c4_${++seq}`, kind: 'c4', pos: at, yaw: p.yaw, until: sim.time + T.gadgets.c4.fuse, target: b.id, done: false });
  say(sim, `C4 planted. ${T.gadgets.c4.fuse} seconds. Back off.`, 'danger');
  return true;
}

function detonate(sim: Sim, c: Placed): void {
  c.done = true;
  const door = sim.grid.doors.find((d) => d.id === c.target) as DoorState | undefined;
  const safe = sim.safes.find((s) => s.id === c.target) as SafeState | undefined;
  if (door) {
    door.locked = false;
    sim.setDoor(door, true);
  }
  if (safe) safe.open = true;
  sim.emitNoise(c.pos.x, c.pos.y, T.noise.c4, 'c4');
  const p = sim.player;
  if (Math.hypot(p.pos.x - c.pos.x, p.pos.y - c.pos.y) < T.gadgets.c4.blastRadius) hurtPlayer(sim, T.gadgets.c4.blastDamage);
  sim.events.emit({ type: 'bark', who: 'accountant', line: 'accountant.c4.01' });
  sim.tripAlarm(`C4 went off at the ${(door?.id ?? safe?.id ?? 'wall').replace(/_/g, ' ')}. The whole block heard it`);
}
