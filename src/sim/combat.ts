// Combat (DESIGN.md "The alarm and the loud scramble" + "Weapons"): mouse aim, click to fire, R to reload,
// limited ammo, HP + regenerating armor, cuffed at 0 HP. Shooting buys space, not victory.
import { T } from '../tuning';
import { angleDiff } from './detection';
import { look, emptyInfo } from './detection';
import { civilianSpotted } from './civilian';
import { setState, startReport } from './guard';
import { cameraWentDark } from './cameras';
import { isDown } from './takedown';
import type { Vec2 } from './level';
import type { Cop } from './police';
import type { Civilian, Guard, SecurityCamera } from './types';
import type { Sim } from './sim';

type Target = { kind: 'guard'; o: Guard } | { kind: 'civilian'; o: Civilian } | { kind: 'cop'; o: Cop } | { kind: 'camera'; o: SecurityCamera };

/** First thing a ray from `from` toward `dir` hits, up to `range` or the first wall. */
function trace(sim: Sim, from: Vec2, dir: Vec2, range: number): { t: number; hit: Target | null } {
  const wall = sim.grid.raycast(from.x, from.y, from.x + dir.x * range, from.y + dir.y * range);
  let best: Target | null = null;
  let bt = wall;
  const test = (pos: Vec2, r: number, tgt: Target) => {
    // ray-circle
    const ox = pos.x - from.x;
    const oy = pos.y - from.y;
    const along = ox * dir.x + oy * dir.y;
    if (along <= 0 || along > bt) return;
    const perp2 = ox * ox + oy * oy - along * along;
    if (perp2 > r * r) return;
    const t = along - Math.sqrt(r * r - perp2);
    if (t < bt) {
      bt = t;
      best = tgt;
    }
  };
  for (const g of sim.guards) if (!g.dead) test(g.pos, isDown(g) ? 0.35 : T.guard.radius + 0.1, { kind: 'guard', o: g });
  for (const c of sim.civilians) if (c.state !== 'dead') test(c.pos, T.civilian.radius + 0.1, { kind: 'civilian', o: c });
  for (const c of sim.cops) if (!c.down) test(c.pos, 0.4, { kind: 'cop', o: c });
  for (const c of sim.cameras) if (!c.dead) test(c.pos, 0.35, { kind: 'camera', o: c });
  return { t: bt, hit: best };
}

/**
 * Aim assist: snap to the live, visible target closest to `dir` within `arcDeg` (total), so a shot
 * in someone's general direction hits them even when the cursor trails a running target.
 * Falls back to `dir` itself.
 */
function assistedAim(sim: Sim, dir: number, arcDeg: number): number {
  const p = sim.player;
  const W = T.weapon;
  const arc = (arcDeg * Math.PI) / 360;
  let best = dir;
  let bestScore = Infinity;
  const consider = (pos: Vec2, priority: number) => {
    const d = Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y);
    if (d > W.range || d < 0.2) return;
    const a = Math.atan2(pos.y - p.pos.y, pos.x - p.pos.x);
    const off = Math.abs(angleDiff(dir, a));
    if (off > arc || !sim.grid.canSee(p.pos, pos)) return;
    const score = off * 4 + d * 0.1 + priority;
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  };
  // threats first, then guards, cameras, and civilians last (never preferred over a threat)
  for (const c of sim.cops) if (!c.down) consider(c.pos, 0);
  // civilians are never auto-targeted: hitting one has to be a real mistake
  for (const g of sim.guards) if (!isDown(g)) consider(g.pos, 0);
  for (const c of sim.cameras) if (!c.dead) consider(c.pos, 1);
  return best;
}

export function updatePlayerWeapon(sim: Sim, fire: boolean, reload: boolean, dt: number, aimAt: Vec2 | null): void {
  const p = sim.player;
  const W = T.weapon;
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      const n = Math.min(W.mag - p.mag, p.reserve);
      p.mag += n;
      p.reserve -= n;
    }
  }
  // armor regenerates after a few seconds without being hit
  if (sim.time - p.lastHit > T.health.armorRegenDelay) p.armor = Math.min(p.armorMax, p.armor + T.health.armorRegenRate * dt);

  if (!p.masked || sim.interaction || p.frozen > 0) return;
  if (p.bagCount >= 2) {
    if (fire && p.fireCd <= 0) {
      sim.events.emit({ type: 'message', text: 'Both hands full. Throw a bag (F) to shoot.', tone: 'warn' });
      p.fireCd = 1;
    }
    return;
  }
  if (reload && p.reloadTimer <= 0 && p.mag < W.mag && p.reserve > 0) {
    p.reloadTimer = W.reloadTime;
    sim.events.emit({ type: 'message', text: 'Reloading...', tone: 'info' });
    return;
  }
  if (!fire || p.fireCd > 0 || p.reloadTimer > 0) return;
  if (p.mag <= 0) {
    if (p.reserve > 0) p.reloadTimer = W.reloadTime;
    else sim.events.emit({ type: 'message', text: 'Out of ammo.', tone: 'warn' });
    return;
  }
  p.mag--;
  p.fireCd = W.fireInterval;
  // aiming (right mouse): exactly at the cursor; hip fire: along the facing with assist
  const base = aimAt
    ? assistedAim(sim, Math.atan2(aimAt.y - p.pos.y, aimAt.x - p.pos.x), W.aimAssistArc)
    : assistedAim(sim, p.yaw, W.assistArc);
  p.yaw = base; // turn to the target you shot at
  const spread = ((W.spread * Math.PI) / 180) * (p.moving ? 2 : 1) * (aimAt ? 0.5 : 1) * (sim.rng.next() - 0.5);
  const a = base + spread;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const from = { x: p.pos.x + dir.x * 0.35, y: p.pos.y + dir.y * 0.35 };
  const { t, hit } = trace(sim, from, dir, W.range);
  sim.events.emit({ type: 'shot', by: 'player', x1: from.x, y1: from.y, x2: from.x + dir.x * t, y2: from.y + dir.y * t, hit: !!hit });
  sim.shots.push({ x1: from.x, y1: from.y, x2: from.x + dir.x * t, y2: from.y + dir.y * t, age: 0, by: 'player' });
  heardShot(sim, p.pos, W.noise);
  if (hit) damage(sim, hit, W.damage, dir);
}

const seen = emptyInfo();

/**
 * A shot (Nov 21 rework): anyone who SEES you fire it confirms it (guards radio it in, civilians panic).
 * Anyone who only HEARS it comes to look: the guard climbs the ladder (investigate → search) instead of radioing.
 */
function heardShot(sim: Sim, at: Vec2, r: number): void {
  sim.emitNoise(at.x, at.y, r, 'shot'); // hearing guards investigate (guard.ts hearNoise)
  if (sim.alarm.tripped) return;
  const p = sim.player;
  for (const g of sim.guards) {
    if (isDown(g) || g.state === 'report' || g.state === 'alert') continue;
    if (!look(sim.grid, g, p, seen)) continue;
    g.lastKnown = { ...p.pos };
    startReport(sim, g, `${g.label} saw you fire a shot and called it in`);
  }
  for (const c of sim.civilians) {
    if (c.state !== 'wander' && c.state !== 'look') continue;
    const d = Math.hypot(c.pos.x - at.x, c.pos.y - at.y);
    if (look(sim.grid, c, p, seen)) {
      c.lastKnown = { ...at };
      c.suspicion = 100;
      civilianSpotted(sim, c);
    } else if (d <= r) {
      // heard something: turn and look
      c.lastKnown = { ...at };
      c.suspicion = Math.max(c.suspicion, T.detection.look + 5);
    }
  }
}

function damage(sim: Sim, t: Target, dmg: number, dir: Vec2): void {
  switch (t.kind) {
    case 'guard': {
      const g = t.o;
      g.hp -= dmg;
      if (g.hp <= 0) {
        g.dead = true;
        g.pagerDone = true; // a shot guard doesn't get a pager call; his body still raises the alarm
        setState(g, 'down');
        sim.stats.kills++;
        sim.events.emit({ type: 'message', text: `${g.label} is down.`, tone: 'warn' });
      } else if (g.state !== 'alert' && g.state !== 'report' && !isDown(g)) {
        // shot and still standing: he calls it in
        g.lastKnown = { ...sim.player.pos };
        startReport(sim, g, `${g.label} was shot and called it in`);
      }
      break;
    }
    case 'civilian': {
      const c = t.o;
      c.state = 'dead';
      c.path = [];
      sim.stats.civilianCasualties++;
      sim.stats.kills++;
      sim.events.emit({ type: 'message', text: 'A civilian is down. Cleanup fee: $5,000.', tone: 'danger' });
      break;
    }
    case 'cop': {
      const c = t.o;
      // shields stop shots from the front
      if (c.kind === 'shield' && Math.abs(angleDiff(c.yaw, Math.atan2(-dir.y, -dir.x))) < T.heat.shieldArc / 2) {
        sim.events.emit({ type: 'blocked', x: c.pos.x, y: c.pos.y });
        return;
      }
      c.hp -= dmg;
      if (c.hp <= 0) {
        c.down = true;
        sim.stats.kills++;
      }
      break;
    }
    case 'camera': {
      // shooting a camera trips nothing by itself: only someone watching the monitors (or walking past) notices
      cameraWentDark(sim, t.o, 'shot');
      break;
    }
  }
}

/** Cops and alerted guards shoot at the player when they can see them. */
export function updateEnemyFire(sim: Sim, dt: number): void {
  if (!sim.alarm.tripped || sim.ended) return;
  const p = sim.player;
  const shooters: { id: string; pos: Vec2; fireCd: number; set: (v: number) => void; dmg: number }[] = [];
  for (const g of sim.guards) if (g.state === 'alert' && !isDown(g)) shooters.push({ id: g.id, pos: g.pos, fireCd: g.fireCd, set: (v) => (g.fireCd = v), dmg: T.enemyFire.guardDamage });
  for (const c of sim.cops) if (!c.down) shooters.push({ id: c.id, pos: c.pos, fireCd: c.fireCd, set: (v) => (c.fireCd = v), dmg: c.kind === 'tactical' ? T.enemyFire.tacticalDamage : T.enemyFire.copDamage });
  const E = T.enemyFire;
  for (const s of shooters) {
    const cd = s.fireCd - dt;
    s.set(cd);
    if (cd > 0) continue;
    const d = Math.hypot(p.pos.x - s.pos.x, p.pos.y - s.pos.y);
    if (d > E.range || !sim.grid.canSee(s.pos, p.pos, p.crouch ? p.pos : undefined)) {
      s.set(0.3);
      continue;
    }
    s.set(sim.rng.range(E.intervalMin, E.intervalMax));
    let chance = E.hitBase - d * E.hitFalloff;
    if (p.sprinting && p.moving) chance -= E.sprintPenalty;
    chance = Math.max(E.hitMin, Math.min(E.hitBase, chance));
    const hit = sim.rng.chance(chance);
    const miss = hit ? 0 : sim.rng.range(-0.7, 0.7);
    sim.shots.push({ x1: s.pos.x, y1: s.pos.y, x2: p.pos.x + miss, y2: p.pos.y + miss, age: 0, by: s.id });
    sim.events.emit({ type: 'shot', by: s.id, x1: s.pos.x, y1: s.pos.y, x2: p.pos.x, y2: p.pos.y, hit });
    if (hit) hurtPlayer(sim, s.dmg);
  }
}

export function hurtPlayer(sim: Sim, dmg: number): void {
  const p = sim.player;
  p.lastHit = sim.time;
  const absorbed = Math.min(p.armor, dmg);
  p.armor -= absorbed;
  p.hp -= dmg - absorbed;
  sim.events.emit({ type: 'playerHit', hp: p.hp });
  if (p.hp <= 0) {
    p.hp = 0;
    sim.endJob('cuffed', 'Shot down and cuffed');
  }
}

export function updateShots(sim: Sim, dt: number): void {
  for (const s of sim.shots) s.age += dt;
  sim.shots = sim.shots.filter((s) => s.age < 0.15);
}
