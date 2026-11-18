// Takedowns, zip ties, pagers and bodies (DESIGN.md "Pagers", approach matrix "Guard").
import { T } from '../tuning';
import { angleDiff, look } from './detection';
import { setState } from './guard';
import { civilianSpotted } from './civilian';
import type { Civilian, Guard, Interactable, Observer } from './types';
import type { Sim } from './sim';

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
      if (g.state === 'tied') return g.pagerRinging > 0 ? 'answer_pager' : null;
      if (g.state === 'down') {
        if (g.pagerRinging > 0) return 'answer_pager';
        return p.zipTies > 0 ? 'zip_tie' : '!Out of zip ties';
      }
      if (!p.masked || g.state === 'alert') return null;
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
      if (!sim.player.masked || c.state !== 'cower') return null;
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
    if (!g.pagerDone && !sim.alarm.tripped) {
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
    if (g.state === 'down' && g.downTime >= T.takedown.downedWakeTime && !sim.alarm.tripped) {
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
    ...sim.guards.filter(isDown).map((g) => ({ id: g.id, pos: g.pos, label: `${g.label} ${g.state === 'tied' ? 'zip-tied' : 'out cold'}` })),
    ...sim.civilians.filter((c) => c.state === 'tied').map((c) => ({ id: c.id, pos: c.pos, label: `a zip-tied ${c.label.toLowerCase()}` })),
  ];
  if (!bodies.length) return;
  for (const o of sim.observers) {
    if (!canObserve(o)) continue;
    for (const b of bodies) {
      if (b.id === o.id) continue;
      if (!look(sim.grid, o, { pos: b.pos, crouch: false } as never, scratch)) continue;
      foundBody(sim, o, b.label);
      break;
    }
  }
  // look() overwrote the per-observer info scratch only; real detection info is untouched
}

const scratch = { inRange: false, inCone: false, los: false, dist: 0, fDist: 0, fMove: 0, fStatus: 0, fBag: 1, rate: 0 };

function canObserve(o: Observer): boolean {
  if (o.kind === 'guard') return !isDown(o) && o.state !== 'report' && o.state !== 'alert';
  if (o.kind === 'civilian') return o.state === 'wander' || o.state === 'look';
  return o.deskTimer <= 0;
}

function foundBody(sim: Sim, o: Observer, what: string): void {
  if (o.kind === 'guard') {
    sim.events.emit({ type: 'bark', who: o.id, line: sim.rng.pick(sim.lineIds('guard.body')) });
    setState(o, 'report');
    o.suspicion = 100;
    o.reportTimer = T.guard.reportTime;
    o.reportReason = `${o.label} found ${what} and called it in`;
  } else if (o.kind === 'camera') {
    o.deskTimer = T.camera.deskAlarmTime;
    o.deskReason = `${o.label} showed the security desk ${what}`;
    o.suspicion = 100;
    sim.events.emit({ type: 'bark', who: 'desk', line: 'desk.camera.01' });
  } else {
    o.lastKnown = { ...sim.player.pos };
    o.suspicion = 100;
    civilianSpotted(sim, o);
  }
}
