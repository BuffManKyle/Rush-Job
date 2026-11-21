// Cameras and the security desk (Nov 21 rework, Kyle's play-test notes):
// - A camera never calls the police. When its meter fills it alerts the security room.
//   Operator at the monitors → he radios a guard to check the spot (and keeps guiding him while the camera has you).
//   Nobody there → the desk alarm buzzes. The next guard to come near the room, a routine check, or (after a while)
//   an automatic page sends someone to read the board, and he goes to where the camera last saw you.
// - A dead camera (shot out, or its wire cut) is noticed only by someone watching the monitors at that moment,
//   someone who sits down at the desk later, or a guard who walks past it. Then a guard goes to look. Not the cops.
// - The police come only when a guard confirms: sees you masked, finds a body, gets shot at (guard.ts, takedown.ts).
import { T } from '../tuning';
import { angleDiff } from './detection';
import { busy, investigate } from './guard';
import { isDown } from './takedown';
import { jammed } from './gadgets';
import { looped, powerOut } from './security';
import type { Vec2 } from './level';
import type { Guard, SecurityCamera } from './types';
import type { Sim } from './sim';

const DEG = Math.PI / 180;

export type AlertKind = 'masked' | 'trespass' | 'body';

export interface DeskAlert {
  at: Vec2;
  cam: string; // camera label
  kind: AlertKind;
  since: number;
}

export interface RadioCall {
  at: Vec2;
  camId: string;
  cam: string;
  kind: AlertKind | 'dark';
  t: number;
  by: string; // guard id at the monitors
}

/** Cameras see nothing: ECM, power cut, or the feed is looped. */
export function camerasBlind(sim: Sim): boolean {
  return jammed(sim) || powerOut(sim) || looped(sim);
}

/** The guard watching the monitors right now (seated operator, or a guard reading the board), if any. */
export function watcherAtDesk(sim: Sim): Guard | null {
  const seat = sim.security.seat;
  if (!seat) return null;
  for (const g of sim.guards) {
    if (busy(g) || Math.hypot(g.pos.x - seat.x, g.pos.y - seat.y) > T.security.deskRadius) continue;
    const seated = g.state === 'patrol' && g.role === 'operator' && g.routeIdx === 0 && g.waitTimer > 0;
    const reading = g.state === 'search' && g.errand === 'desk';
    if (seated || reading) return g;
  }
  return null;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Nearest guard free to check something (patrol guards first; the operator only if nobody else is up). */
function freeGuard(sim: Sim, at: Vec2, exclude: Guard | null): Guard | null {
  let best: Guard | null = null;
  for (const pass of ['patrol', 'operator'] as const) {
    for (const g of sim.guards) {
      if (g === exclude || g.role !== pass || busy(g)) continue;
      if (g.state === 'investigate' && g.errand === 'desk') continue;
      if (!best || dist(g.pos, at) < dist(best.pos, at)) best = g;
    }
    if (best) return best;
  }
  return exclude && !busy(exclude) ? exclude : null;
}

function say(sim: Sim, text: string, tone: 'info' | 'warn' = 'warn'): void {
  sim.events.emit({ type: 'message', text, tone });
}

const what = (k: AlertKind | 'dark', cam: string) =>
  k === 'masked' ? `you masked on the ${cam}` : k === 'body' ? `a body on the ${cam}` : k === 'dark' ? `the ${cam} go dark` : `someone in a staff area on the ${cam}`;

/** A camera's meter filled (or it saw a body): tell the security room. */
export function deskAlert(sim: Sim, c: SecurityCamera, at: Vec2, kind: AlertKind): void {
  const s = sim.security;
  c.sinceAlert = 0;
  const cam = c.label.toLowerCase();
  const watcher = watcherAtDesk(sim);
  if (watcher) {
    // a guard already sent for this camera just gets the new position
    const guided = s.guided.get(c.id);
    const g = guided ? sim.guards.find((q) => q.id === guided) : null;
    if (g && g.state === 'investigate' && !g.errand) {
      investigate(sim, g, at, 'dispatch');
      return;
    }
    const pending = s.radio.find((r) => r.camId === c.id);
    if (pending) {
      pending.at = { ...at };
      return;
    }
    s.radio.push({ at: { ...at }, camId: c.id, cam, kind, t: T.security.radioDelay, by: watcher.id });
    sim.events.emit({ type: 'bark', who: 'desk', line: 'desk.camera.01' });
    say(sim, `${watcher.label} saw ${what(kind, cam)} and is getting on the radio.`);
    return;
  }
  const fresh = !s.buzzer;
  s.buzzer = { at: { ...at }, cam, kind, since: fresh ? sim.time : s.buzzer!.since };
  if (fresh) say(sim, `The ${cam} caught ${kind === 'body' ? 'a body' : 'you'}. Nobody's at the monitors, so it's buzzing in the security room.`);
}

/** Someone sent to the desk (or the operator sitting back down) reads the board. Returns true if he has a new job. */
export function deskCheck(sim: Sim, g: Guard): boolean {
  const s = sim.security;
  if (sim.alarm.tripped) return false;
  const seated = g.role === 'operator' && g.state === 'patrol';
  const dark = looped(sim) ? [] : sim.cameras.filter((c) => c.dead && !c.deadNoticed);
  for (const c of dark) c.deadNoticed = true;
  if (dark.length) raiseWary(sim, `${g.label} saw the ${dark[0].label.toLowerCase()} is dark on the monitors.`);
  const b = s.buzzer;
  s.buzzer = null;
  if (seated) {
    // he stays in the chair and radios someone
    if (b) s.radio.push({ at: b.at, camId: '', cam: b.cam, kind: b.kind, t: T.security.radioDelay, by: g.id });
    if (dark.length) s.radio.push({ at: dark[0].pos, camId: dark[0].id, cam: dark[0].label.toLowerCase(), kind: 'dark', t: T.security.radioDelay, by: g.id });
    return false;
  }
  if (b) {
    investigate(sim, g, b.at, 'dispatch');
    say(sim, `${g.label} checked the monitors and is heading to where the ${b.cam} saw ${b.kind === 'body' ? 'the body' : 'you'}.`);
    return true;
  }
  if (dark.length) {
    investigate(sim, g, dark[0].pos, 'dispatch');
    return true;
  }
  return false;
}

/** Each confirmed "something's off" (a dead camera found) makes every guard a little sharper. Max 2 levels. */
export function raiseWary(sim: Sim, why: string): void {
  const s = sim.security;
  const before = s.wary;
  s.wary = Math.min(2, s.wary + 1);
  for (const g of sim.guards) g.range = T.guard.range * (1 + s.wary * T.security.waryRange);
  say(sim, s.wary > before ? `${why} Guards are on edge (${s.wary}/2): they see further and search longer.` : why);
}

/** A camera stopped working (shot or wire cut). Only someone watching right now notices. */
export function cameraWentDark(sim: Sim, c: SecurityCamera, how: 'shot' | 'cut'): void {
  c.dead = true;
  c.cutWire = c.cutWire || how === 'cut';
  c.suspicion = 0;
  c.sees = false;
  c.locked = false;
  c.deskTimer = 0;
  if (sim.alarm.tripped) return;
  const watcher = looped(sim) ? null : watcherAtDesk(sim);
  if (watcher) {
    sim.security.darkNotice.push({ camId: c.id, t: T.security.noticeDarkTime });
    say(sim, `${c.label} is out, and ${watcher.label} is at the monitors. He'll notice.`);
  } else say(sim, `${c.label} is out. Nobody's watching the monitors right now.`, 'info');
}

/** A guard walking past a dead camera notices it. */
export function guardSeesDeadCameras(sim: Sim, g: Guard): void {
  if (sim.alarm.tripped || busy(g)) return;
  for (const c of sim.cameras) {
    if (!c.dead || c.deadNoticed) continue;
    const d = dist(g.pos, c.pos);
    if (d > T.security.passNoticeRange) continue;
    if (Math.abs(angleDiff(g.yaw, Math.atan2(c.pos.y - g.pos.y, c.pos.x - g.pos.x))) > g.cone / 2) continue;
    if (!sim.grid.canSee(g.pos, c.pos)) continue;
    c.deadNoticed = true;
    investigate(sim, g, c.pos, 'saw');
    raiseWary(sim, `${g.label} noticed the ${c.label.toLowerCase()} is ${c.cutWire ? 'dead' : 'shot out'}.`);
    return;
  }
}

/** Sweep, lock on, and re-alert the desk while it keeps seeing you. */
export function updateCamera(sim: Sim, c: SecurityCamera, dt: number): void {
  c.sinceAlert += dt;
  // blind (ECM, power, looped feed) or dead: still; nothing gets reported
  if (c.dead || jammed(sim) || powerOut(sim)) return;
  c.phase += ((Math.PI * 2) / c.period) * dt;
  const max = T.camera.trackSpeed * DEG * dt;
  if (c.sees && c.suspicion > 0) {
    c.locked = true;
    const want = Math.atan2(sim.player.pos.y - c.pos.y, sim.player.pos.x - c.pos.x);
    // stay within the mount's arc
    const off = Math.max(-c.sweep / 2 - 0.2, Math.min(c.sweep / 2 + 0.2, angleDiff(c.baseYaw, want)));
    c.yaw += Math.max(-max, Math.min(max, angleDiff(c.yaw, c.baseYaw + off)));
  } else {
    if (c.suspicion <= 0) c.locked = false;
    if (!c.locked) {
      const want = c.baseYaw + (Math.sin(c.phase) * c.sweep) / 2;
      c.yaw += Math.max(-max, Math.min(max, angleDiff(c.yaw, want)));
    }
  }
  // still has you at 100: keep the desk posted
  if (!sim.alarm.tripped && c.sees && c.suspicion >= 100 && c.sinceAlert >= T.camera.realertTime && c.lastKnown) deskAlert(sim, c, c.lastKnown, sim.player.masked ? 'masked' : 'trespass');
}

/** Meter reached 100. */
export function cameraSpotted(sim: Sim, c: SecurityCamera): void {
  if (sim.alarm.tripped) return;
  sim.events.emit({ type: 'suspicion', who: c.id, level: 'investigate' });
  deskAlert(sim, c, c.lastKnown ?? sim.player.pos, sim.player.masked ? 'masked' : 'trespass');
}

/** Radio calls, the buzzer, dark-camera notices and routine desk checks. Runs once per tick. */
export function updateDesk(sim: Sim, dt: number): void {
  const s = sim.security;
  if (sim.alarm.tripped) {
    s.radio = [];
    s.buzzer = null;
    return;
  }
  const watcher = watcherAtDesk(sim);

  // the operator's radio calls
  for (const r of s.radio) r.t -= dt;
  for (const r of s.radio.filter((q) => q.t <= 0)) {
    const by = sim.guards.find((q) => q.id === r.by);
    if (!by || isDown(by) || busy(by)) continue; // taken out mid-call: nobody hears it
    const g = freeGuard(sim, r.at, by);
    if (!g) continue;
    investigate(sim, g, r.at, 'dispatch');
    if (r.camId && r.kind !== 'dark') s.guided.set(r.camId, g.id);
    sim.events.emit({ type: 'bark', who: by.id, line: 'guard.radio.01' });
    say(sim, g === by ? `${by.label} left the monitors to check ${what(r.kind, r.cam)} himself.` : `${by.label} radioed ${g.label} to check ${r.kind === 'dark' ? `the ${r.cam}` : `where the ${r.cam} saw ${r.kind === 'body' ? 'the body' : 'you'}`}.`);
  }
  s.radio = s.radio.filter((q) => q.t > 0);

  // dark cameras the seated operator saw go out
  for (const n of s.darkNotice) n.t -= dt;
  for (const n of s.darkNotice.filter((q) => q.t <= 0)) {
    const c = sim.cameras.find((q) => q.id === n.camId);
    if (!c || c.deadNoticed || !watcher || looped(sim)) continue;
    c.deadNoticed = true;
    raiseWary(sim, `${watcher.label} saw the ${c.label.toLowerCase()} go dark.`);
    s.radio.push({ at: { ...c.pos }, camId: c.id, cam: c.label.toLowerCase(), kind: 'dark', t: 0, by: watcher.id });
  }
  s.darkNotice = s.darkNotice.filter((q) => q.t > 0);

  const seat = s.seat;
  if (!seat) return;
  const heading = sim.guards.some((g) => g.errand === 'desk' && !busy(g));

  // the desk alarm is buzzing: whoever hears it comes, or the system pages the nearest guard
  if (s.buzzer && !watcher && !heading) {
    let g: Guard | null = null;
    for (const q of sim.guards) {
      if (busy(q) || (q.state !== 'patrol' && q.state !== 'return' && q.state !== 'look')) continue;
      if (dist(q.pos, seat) <= T.security.buzzerHearRadius) g = q;
    }
    if (g) {
      investigate(sim, g, seat, 'dispatch', 'desk');
      say(sim, `${g.label} heard the desk alarm and is going to check the monitors.`);
    } else if (sim.time - s.buzzer.since >= T.security.buzzerAutoDispatch) {
      g = freeGuard(sim, seat, null);
      if (g) {
        investigate(sim, g, seat, 'dispatch', 'desk');
        say(sim, `The desk alarm paged ${g.label}. He's going to check the monitors.`);
      }
    }
  }

  // nobody at the monitors: now and then a patrol guard drops in for a routine camera check
  if (!watcher && !heading) {
    s.routineIn -= dt;
    if (s.routineIn <= 0) {
      s.routineIn = sim.rng.range(T.security.routineCheck[0], T.security.routineCheck[1]);
      const free = sim.guards.filter((g) => g.role === 'patrol' && g.state === 'patrol');
      if (free.length) {
        const g = sim.rng.pick(free);
        investigate(sim, g, seat, 'dispatch', 'desk');
        say(sim, `${g.label} is dropping by the security room for a routine camera check.`, 'info');
      }
    }
  } else s.routineIn = Math.max(s.routineIn, T.security.routineCheck[0] * 0.5);
}
