// The store's own defences and the quiet tools against them (DESIGN.md approach matrix):
// - Intimidate (V): masked shout; civilians in earshot and sight drop and cower (then zip-tie them).
// - Panic button: a civilian who sees you masked runs to the nearest guard OR panic button. Pressed = alarm.
// - Breaker: kill the power (hold E). Cameras go dark and the panic button dies; the desk sends a guard
//   to flip it back, so it's a window, not a fix.
import { T } from '../tuning';
import { investigate } from './guard';
import { isDown } from './takedown';
import type { Vec2 } from './level';
import type { Civilian, Interactable, InputFrame } from './types';
import type { Sim } from './sim';

export interface PanicButton {
  id: string;
  pos: Vec2;
}

export interface SecurityState {
  panicButtons: PanicButton[];
  breaker: Vec2 | null;
  powerOn: boolean;
  powerCutAt: number;
  /** The guard sent to reset the breaker, once the desk gets round to it. */
  breakerGuard: string | null;
  dispatchIn: number; // seconds until the desk sends someone (Infinity = nobody pending)
  resetting: number; // seconds the guard has been at the breaker
  shoutCd: number;
  /** Civilian id -> seconds spent pressing a panic button. */
  pressing: Map<string, number>;
}

export function createSecurity(sim: Sim): SecurityState {
  const m = sim.level.markers;
  const br = m.find((q) => q.type === 'breaker');
  return {
    panicButtons: m.filter((q) => q.type === 'panic_button').map((q) => ({ id: q.id, pos: { x: q.x, y: q.y } })),
    breaker: br ? { x: br.x, y: br.y } : null,
    powerOn: true,
    powerCutAt: -1,
    breakerGuard: null,
    dispatchIn: Infinity,
    resetting: 0,
    shoutCd: 0,
    pressing: new Map(),
  };
}

export function breakerInteractable(sim: Sim): Interactable | null {
  const b = sim.security.breaker;
  if (!b) return null;
  return { id: 'breaker', x: b.x, y: b.y, offer: () => (sim.security.powerOn && !sim.alarm.tripped ? 'breaker' : null) };
}

/** Cameras see nothing while the power is out. */
export function powerOut(sim: Sim): boolean {
  return !sim.security.powerOn;
}

export function cutPower(sim: Sim): void {
  const s = sim.security;
  s.powerOn = false;
  s.powerCutAt = sim.time;
  for (const c of sim.cameras) {
    c.suspicion = 0;
    c.sees = false;
    c.locked = false;
    if (!c.dead) c.deskTimer = 0;
  }
  sim.emitNoise(s.breaker!.x, s.breaker!.y, 3, 'breaker');
  sim.events.emit({ type: 'bark', who: 'desk', line: 'desk.power.01' });
  s.dispatchIn = T.power.dispatchDelay;
  s.resetting = 0;
  sim.events.emit({ type: 'message', text: `Power's out: cameras dark, panic button dead. The desk will send someone in about ${T.power.dispatchDelay} s.`, tone: 'info' });
}

/** The desk sends the nearest standing guard to flip the breaker back. */
function dispatchToBreaker(sim: Sim): void {
  const s = sim.security;
  let best = null as null | (typeof sim.guards)[number];
  for (const g of sim.guards) {
    if (isDown(g) || g.state === 'report' || g.state === 'alert') continue;
    if (!best || dist(g.pos, s.breaker!) < dist(best.pos, s.breaker!)) best = g;
  }
  if (best) {
    investigate(sim, best, s.breaker!, 'dispatch');
    s.breakerGuard = best.id;
    sim.events.emit({ type: 'message', text: `${best.label} is on his way to the breaker.`, tone: 'warn' });
  } else sim.events.emit({ type: 'message', text: "Nobody's left to fix the breaker.", tone: 'info' });
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function updateSecurity(sim: Sim, input: InputFrame, dt: number): void {
  const s = sim.security;
  s.shoutCd = Math.max(0, s.shoutCd - dt);
  if (input.shout) shout(sim);

  if (!s.powerOn && s.dispatchIn !== Infinity) {
    s.dispatchIn -= dt;
    if (s.dispatchIn <= 0) {
      s.dispatchIn = Infinity;
      dispatchToBreaker(sim);
    }
  }
  // the dispatched guard reaches the breaker and flips it back on
  if (!s.powerOn && s.breakerGuard && s.breaker) {
    const g = sim.guards.find((q) => q.id === s.breakerGuard);
    if (!g || isDown(g) || g.state === 'alert' || g.state === 'report') s.breakerGuard = null;
    else if (dist(g.pos, s.breaker) < 1.3 && (s.resetting += dt) >= T.power.resetTime) {
      s.powerOn = true;
      s.breakerGuard = null;
      sim.events.emit({ type: 'bark', who: g.id, line: 'guard.breaker.01' });
      sim.events.emit({ type: 'message', text: `${g.label} flipped the breaker back on. Cameras are live.`, tone: 'warn' });
    } else if (g.state !== 'investigate' && g.state !== 'search') investigate(sim, g, s.breaker, 'dispatch');
  }
}

/** V: masked shout. Civilians who can see you (or are close) drop and cower; guards in earshot come to look. */
export function shout(sim: Sim): void {
  const s = sim.security;
  const p = sim.player;
  if (!p.masked || sim.ended || p.frozen > 0 || s.shoutCd > 0) return;
  s.shoutCd = T.intimidate.cooldown;
  sim.events.emit({ type: 'bark', who: 'player', line: sim.rng.pick(sim.lineIds('player.shout')) });
  let n = 0;
  for (const c of sim.civilians) {
    if (c.state === 'tied' || c.state === 'dead') continue;
    const d = dist(c.pos, p.pos);
    if (d > T.intimidate.radius || !sim.grid.canSee(p.pos, c.pos)) continue;
    cower(sim, c, sim.alarm.tripped ? Infinity : T.intimidate.cowerTime + sim.rng.range(0, T.intimidate.cowerJitter));
    n++;
  }
  sim.emitNoise(p.pos.x, p.pos.y, T.intimidate.noise, 'shout');
  if (n) sim.events.emit({ type: 'message', text: `${n} down on the floor. Zip-tie them (E) before they get brave (${T.intimidate.cowerTime} s).`, tone: 'info' });
}

export function cower(sim: Sim, c: Civilian, time: number): void {
  if (c.state !== 'cower') sim.events.emit({ type: 'bark', who: c.id, line: sim.rng.pick(sim.lineIds('civ.cower')) });
  c.state = 'cower';
  c.stateTime = 0;
  c.path = [];
  c.goal = null;
  c.fleeTo = null;
  c.suspicion = 0;
  c.sees = false;
  c.cowerTime = time;
  sim.security.pressing.delete(c.id);
}

/** The panic button a fleeing civilian would run to, if it's closer than any guard. */
export function nearestPanic(sim: Sim, from: Vec2, guardDist: number): PanicButton | null {
  if (!sim.security.powerOn) return null;
  let best: PanicButton | null = null;
  let bd = guardDist;
  for (const b of sim.security.panicButtons) {
    const d = dist(from, b.pos);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** A fleeing civilian at the panic button. Returns true once it's pressed. */
export function pressPanic(sim: Sim, c: Civilian, b: PanicButton, dt: number): boolean {
  const s = sim.security;
  if (!s.powerOn) {
    // dead button: they give up and hide
    cower(sim, c, Infinity);
    return false;
  }
  const t = (s.pressing.get(c.id) ?? 0) + dt;
  s.pressing.set(c.id, t);
  if (t < T.panic.pressTime) return false;
  s.pressing.delete(c.id);
  sim.events.emit({ type: 'bark', who: c.id, line: 'civ.panic.01' });
  const who = c.role === 'staff' ? 'The clerk' : 'A customer';
  sim.tripAlarm(`${who} hit the panic button`);
  return true;
}
