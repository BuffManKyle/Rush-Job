// Takedowns, zip ties, pagers and bodies (DESIGN.md "Pagers", approach matrix "Guard").
import { T } from '../tuning';
import { angleDiff, look } from './detection';
import { setState, startReport } from './guard';
import { camerasBlind, deskAlert } from './cameras';
import { civilianSpotted } from './civilian';
import type { Civilian, Guard, Interactable, Observer } from './types';
import type { Sim } from './sim';
import { hasGadget, jammed } from './gadgets';

const DEG = Math.PI / 180;

export const isDown = (g: Guard) => g.state === 'down' || g.state === 'tied';

/** Is the player behind this guard (outside a wide arc around where he faces)? */
function behind(sim: Sim, g: Guard): boolean {
  const p = sim.player.pos;
  const toPlayer = Math.atan2(p.y - g.pos.y, p.x - g.pos.x);
  return Math.abs(angleDiff(g.yaw, toPlayer)) > T.takedown.behindAngle * DEG;
}

export function guardInteractable(sim: Sim, g: Guard): Interactable {
  return {
    id: g.id,
    get x() {
      return g.pos.x;
    },
    get y() {
      return g.pos.y;
    },
    offer: () => {
      const p = sim.player;
      if (g.pagerRinging > 0 && !g.dead) return 'answer_pager'; // a bagged guard's pager still rings
      if (g.bagged) return null;
      const bag = hasGadget(sim, 'body_bags') && p.masked ? (p.bagCount >= 2 ? '!Both hands full' : 'body_bag') : null;
      if (g.dead) return bag;
      if (g.state === 'tied') return bag;
      if (g.state === 'down') {
        if (p.bagCount >= 2) return '!Both hands full';
        // tie first; a body bag also works on an untied guard once you're out of ties
        return p.zipTies > 0 ? 'zip_tie' : (bag ?? '!Out of zip ties');
      }
      if (!p.masked || g.state === 'alert' || p.bagCount >= 2) return null;
      // a guard on the radio can be stopped from any side; otherwise it has to be from behind
      if (g.state === 'report' || behind(sim, g)) return 'takedown';
      return null;
    },
  };
}

export function civilianInteractable(sim: Sim, c: Civilian): Interactable {
  return {
    id: c.id,
    get x() {
      return c.pos.x;
    },
    get y() {
      return c.pos.y;
    },
    offer: () => {
      if (c.state === 'dead' && !c.bagged && sim.player.masked && hasGadget(sim, 'body_bags')) return sim.player.bagCount >= 2 ? '!Both hands full' : 'body_bag';
      if (!sim.player.masked || c.state !== 'cower') return null;
      if (sim.player.bagCount >= 2) return '!Both hands full';
      return sim.player.zipTies > 0 ? 'zip_tie' : '!Out of zip ties';
    },
  };
}

export function takeDown(sim: Sim, g: Guard): void {
  setState(g, 'down');
  g.suspicion = 0;
  g.sees = false;
  g.downTime = 0;
  g.pagerDelay = g.pagerDone ? 0 : T.pager.delay;
  g.pagerRinging = 0;
  sim.events.emit({ type: 'bark', who: g.id, line: 'guard.down.01' });
}

export function zipTie(sim: Sim, target: Guard | Civilian): void {
  sim.player.zipTies--;
  if (target.kind === 'guard') {
    target.state = 'tied';
    sim.events.emit({ type: 'bark', who: target.id, line: 'guard.tied.01' });
  } else {
    target.state = 'tied';
    target.stateTime = 0;
    target.suspicion = 0;
  }
  sim.events.emit({ type: 'message', text: `Zip-tied. ${sim.player.zipTies} left.`, tone: 'info' });
}

export function answeredPager(sim: Sim, g: Guard): void {
  sim.pagerCalls++;
  g.pagerRinging = 0;
  g.pagerDone = true;
  if (sim.pagerCalls > T.pager.maxCalls) {
    sim.events.emit({ type: 'bark', who: 'dispatcher', line: 'dispatcher.done.01' });
    sim.tripAlarm(`The Dispatcher stopped buying it on pager call ${sim.pagerCalls}`);
    return;
  }
  sim.events.emit({ type: 'bark', who: 'player', line: sim.rng.pick(sim.lineIds('player.cover')) });
  sim.events.emit({ type: 'message', text: `Pager answered (${sim.pagerCalls}/${T.pager.maxCalls} before the Dispatcher gets suspicious).`, tone: 'info' });
}

export function updateDowned(sim: Sim, dt: number): void {
  for (const g of sim.guards) {
    if (!isDown(g)) continue;
    g.downTime += dt;
    if (!g.pagerDone && !sim.alarm.tripped && !jammed(sim)) {
      if (g.pagerDelay > 0) {
        g.pagerDelay -= dt;
        if (g.pagerDelay <= 0) {
          g.pagerRinging = 0.0001;
          sim.events.emit({ type: 'bark', who: 'dispatcher', line: 'dispatcher.call.01' });
        }
      } else if (g.pagerRinging > 0) {
        const answering = sim.interaction?.targetId === g.id && sim.interaction.defId === 'answer_pager';
        if (!answering) g.pagerRinging += dt;
        if (g.pagerRinging >= T.pager.timeout) {
          g.pagerRinging = 0;
          g.pagerDone = true;
          sim.events.emit({ type: 'bark', who: 'dispatcher', line: 'dispatcher.hangup.01' });
          sim.tripAlarm(`Nobody answered ${g.label}'s pager`);
        }
      }
    }
    if (g.state === 'down' && !g.dead && !g.bagged && g.downTime >= T.takedown.downedWakeTime && !sim.alarm.tripped) {
      sim.events.emit({ type: 'bark', who: g.id, line: 'guard.wake.01' });
      setState(g, 'report');
      g.reportTimer = T.guard.reportTime;
      g.reportReason = `${g.label} woke up (nobody zip-tied him) and called it in`;
    }
  }
}

/** Anyone who sees a downed or tied guard, or a tied civilian, raises it. */
export function checkBodies(sim: Sim): void {
  if (sim.alarm.tripped) return;
  const bodies = [
    ...sim.guards.filter((g) => isDown(g) && !g.bagged).map((g) => ({ id: g.id, pos: g.pos, label: `${g.label} ${g.dead ? 'shot' : g.state === 'tied' ? 'zip-tied' : 'out cold'}` })),
    ...sim.civilians
      .filter((c) => c.state === 'tied' || (c.state === 'dead' && !c.bagged))
      .map((c) => ({ id: c.id, pos: c.pos, label: c.state === 'dead' ? `a shot ${c.label.toLowerCase()}` : `a zip-tied ${c.label.toLowerCase()}` })),
  ];
  if (!bodies.length) return;
  for (const o of sim.observers) {
    if (!canObserve(sim, o)) continue;
    for (const b of bodies) {
      if (b.id === o.id) continue;
      if (!look(sim.grid, o, { pos: b.pos, crouch: false } as never, scratch)) continue;
      foundBody(sim, o, b.label, b.id, b.pos);
      break;
    }
  }
  // look() overwrote the per-observer info scratch only; real detection info is untouched
}

const scratch = { inRange: false, inCone: false, los: false, dist: 0, fDist: 0, fMove: 0, fStatus: 0, fBag: 1, rate: 0 };

function canObserve(sim: Sim, o: Observer): boolean {
  if (o.kind === 'guard') return !isDown(o) && o.state !== 'report' && o.state !== 'alert';
  if (o.kind === 'civilian') return o.state === 'wander' || o.state === 'look';
  return !o.dead && !camerasBlind(sim);
}

/** Bodies a camera has already shown the desk (each one is reported once). */
const onCamera = new WeakMap<Sim, Set<string>>();

function foundBody(sim: Sim, o: Observer, what: string, id: string, pos: { x: number; y: number }): void {
  if (o.kind === 'guard') {
    o.lastKnown = { ...pos };
    startReport(sim, o, `${o.label} found ${what} and called it in`, 'guard.body');
  } else if (o.kind === 'camera') {
    // a camera can't confirm anything: it shows the desk, and a guard is sent to look
    let seen = onCamera.get(sim);
    if (!seen) onCamera.set(sim, (seen = new Set()));
    if (seen.has(id)) return;
    seen.add(id);
    deskAlert(sim, o, pos, 'body');
  } else {
    o.lastKnown = { ...sim.player.pos };
    o.suspicion = 100;
    civilianSpotted(sim, o);
  }
}

/** Zip the body into a bag: nobody finds it and he doesn't wake up. */
export function bodyBag(sim: Sim, target: Guard | Civilian): void {
  target.bagged = true;
  sim.events.emit({ type: 'message', text: 'Bagged. Nobody finds the body now.', tone: 'info' });
}
