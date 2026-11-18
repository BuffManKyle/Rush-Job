// The simulation: fixed 30 Hz, owns all game state. Nothing outside src/sim writes to it.
import { T } from '../tuning';
import { INTERACTIONS } from '../data/interactions';
import { LINES } from '../data/dialogue';
import { describe, emptyInfo, updateSuspicion, angleDiff } from './detection';
import { EventBus } from './events';
import { Grid, type DoorState } from './grid';
import { guardSpotted, investigate, setState, updateGuard } from './guard';
import { civilianSpotted, updateCivilian } from './civilian';
import { bagLoot, canBag, noteInteractable, pickUp, safeInteractable, throwBag, updateBags, vanInteractable, type Bag, type SafeState } from './loot';
import { updateEnemyFire, updatePlayerWeapon, updateShots } from './combat';
import { startHeat, updateHeat, type Cop, type HeatState } from './police';
import { answeredPager, checkBodies, civilianInteractable, guardInteractable, isDown, takeDown, updateDowned, zipTie } from './takedown';
import { inRect, type Level, type Vec2 } from './level';
import { Rng } from './rng';
import type {
  ActiveInteraction,
  AlarmState,
  CaseState,
  Civilian,
  Guard,
  InputFrame,
  Interactable,
  NoiseRing,
  Observer,
  Player,
  SecurityCamera,
} from './types';

const DEG = Math.PI / 180;

export interface ShuffleResult {
  routes: Record<string, string>; // guard -> chosen route id
  lockedDoors: string[];
  codeNote: string | null;
  safeCode: string;
}

export class Sim {
  readonly dt = 1 / T.sim.hz;
  readonly events = new EventBus();
  readonly rng: Rng;
  readonly grid: Grid;
  tick = 0;
  time = 0;
  readonly player: Player;
  readonly guards: Guard[] = [];
  readonly cameras: SecurityCamera[] = [];
  readonly civilians: Civilian[] = [];
  readonly cases: CaseState[] = [];
  readonly interactables: Interactable[] = [];
  noises: NoiseRing[] = [];
  alarm: AlarmState = { tripped: false, cause: '', time: 0 };
  interaction: ActiveInteraction | null = null;
  /** Interactable the player would act on right now, and what it offers (for the HUD prompt). */
  focus: { id: string; offer: string } | null = null;
  secured = 0;
  readonly bags: Bag[] = [];
  readonly safes: SafeState[] = [];
  knowsCode = false;
  readonly cops: Cop[] = [];
  shots: { x1: number; y1: number; x2: number; y2: number; age: number; by: string }[] = [];
  heat: HeatState | null = null;
  endNote = '';
  ended: { how: 'escaped' | 'cuffed'; time: number } | null = null;
  readonly stats = { spotted: false, takedowns: 0, kills: 0, civilianCasualties: 0 };
  pagerCalls = 0;
  /** Observers the player has tagged with Q during casing. */
  readonly marked = new Set<string>();
  readonly shuffle: ShuffleResult;
  private interactLatch = false; // E must be released between completed actions
  private savedProgress = new Map<string, number>();
  private lineCache = new Map<string, string[]>();

  constructor(
    readonly level: Level,
    readonly seed: number,
  ) {
    this.rng = new Rng(seed).fork('sim');
    this.grid = new Grid(level);
    const shuf = new Rng(seed).fork('shuffle');

    // Doors (shuffle: lockChance)
    const lockedDoors: string[] = [];
    for (const d of level.doors) {
      const locked = d.lockChance > 0 ? shuf.chance(d.lockChance) : d.locked;
      if (locked) lockedDoors.push(d.id);
      this.grid.addDoor({ id: d.id, cx: d.cx, cy: d.cy, axis: d.axis, open: d.open && !locked, locked, swing: d.open && !locked ? 1 : 0, openedByGuard: false, closeTimer: 0 });
    }

    // Guards: one per distinct route `guard` value, route option picked by the shuffle
    const byGuard = new Map<string, typeof level.routes>();
    for (const r of level.routes) byGuard.set(r.guard, [...(byGuard.get(r.guard) ?? []), r]);
    const routes: Record<string, string> = {};
    for (const [name, opts] of [...byGuard.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const r = shuf.pick(opts);
      routes[name] = r.id;
      const start = r.points[0];
      const second = r.points[1] ?? start;
      const yaw = Math.atan2(second.y - start.y, second.x - start.x);
      this.guards.push({
        kind: 'guard',
        id: `guard_${name}`,
        label: `Guard ${name}`,
        pos: { ...start },
        prev: { ...start },
        yaw,
        prevYaw: yaw,
        cone: T.guard.cone * DEG,
        range: T.guard.range,
        suspicion: 0,
        peak: 0,
        sinceSeen: 99,
        sees: false,
        lastKnown: null,
        info: emptyInfo(),
        routeId: r.id,
        route: r.points,
        routeIdx: 1 % r.points.length,
        routeWait: r.wait,
        state: 'patrol',
        stateTime: 0,
        path: [],
        pathGoal: null,
        repathTimer: 0,
        waitTimer: 0,
        target: null,
        searchYaw: 0,
        reportTimer: 0,
        barkTimer: 0,
        idleBarkTimer: shuf.range(6, 20),
        lookHold: 0,
        moving: false,
        reportReason: '',
        pagerDelay: 0,
        pagerRinging: 0,
        pagerDone: false,
        downTime: 0,
        hp: T.guard.hp,
        dead: false,
        fireCd: 1,
      });
    }

    for (const c of level.cameras) {
      const label = c.id.replace(/^cam_/, '').replace(/_/g, ' ');
      this.cameras.push({
        kind: 'camera',
        id: c.id,
        label: `${label[0].toUpperCase()}${label.slice(1)} camera`,
        pos: { x: c.x, y: c.y },
        prev: { x: c.x, y: c.y },
        yaw: c.yaw,
        prevYaw: c.yaw,
        cone: T.camera.cone * DEG,
        range: T.camera.range,
        suspicion: 0,
        peak: 0,
        sinceSeen: 99,
        sees: false,
        lastKnown: null,
        info: emptyInfo(),
        baseYaw: c.yaw,
        sweep: c.sweep,
        period: c.period,
        phase: shuf.range(0, Math.PI * 2),
        locked: false,
        deskTimer: 0,
        deskReason: '',
        dead: false,
        dispatched: false,
      });
    }

    for (const c of level.civilians) {
      const yaw = shuf.range(-Math.PI, Math.PI);
      const label = c.role === 'staff' ? 'Clerk' : `Customer ${c.id.replace(/\D+/g, '') || ''}`.trim();
      this.civilians.push({
        kind: 'civilian',
        id: c.id,
        label,
        pos: { x: c.x, y: c.y },
        prev: { x: c.x, y: c.y },
        yaw,
        prevYaw: yaw,
        cone: T.civilian.cone * DEG,
        range: T.civilian.range,
        suspicion: 0,
        peak: 0,
        sinceSeen: 99,
        sees: false,
        lastKnown: null,
        info: emptyInfo(),
        role: c.role,
        wanderZone: c.wander,
        state: 'wander',
        stateTime: 0,
        path: [],
        goal: null,
        idleTimer: shuf.range(0.5, 4),
        fleeTo: null,
        moving: false,
      });
    }

    const notes = level.markers.filter((m) => m.group === 'safe_code');
    const note = notes.length ? shuf.pick(notes) : null;
    const safeCode = String(1000 + shuf.int(9000));
    this.shuffle = { routes, lockedDoors, codeNote: note?.id ?? null, safeCode };

    const ps = level.spawns.player_start;
    this.player = {
      pos: { ...ps },
      prev: { ...ps },
      vel: { x: 0, y: 0 },
      yaw: -Math.PI / 2,
      prevYaw: -Math.PI / 2,
      crouch: false,
      sprinting: false,
      moving: false,
      masked: false,
      maskProgress: 0,
      carrying: null,
      carryValue: 0,
      inRestricted: false,
      escorts: 0,
      zipTies: T.takedown.zipTies,
      hp: T.health.hp,
      armor: T.health.armor,
      armorMax: T.health.armor,
      lastHit: -99,
      mag: T.weapon.mag,
      reserve: T.weapon.reserve,
      reloadTimer: 0,
      fireCd: 0,
      aiming: false,
      frozen: 0,
      noiseTimer: 0,
    };

    for (const d of this.grid.doors) this.interactables.push(this.doorInteractable(d));
    for (const g of this.guards) this.interactables.push(guardInteractable(this, g));
    for (const p of level.props.filter((q) => q.type === 'safe')) {
      const sf: SafeState = { id: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2, value: p.value, open: false, looted: false };
      this.safes.push(sf);
      this.interactables.push(safeInteractable(this, sf));
    }
    if (note) this.interactables.push(noteInteractable(this, note));
    const van = vanInteractable(this);
    if (van) this.interactables.push(van);
    for (const c of this.civilians) this.interactables.push(civilianInteractable(this, c));
    for (const p of level.props.filter((q) => q.type === 'case')) {
      const c: CaseState = { id: p.id, x: p.x + p.w / 2, y: p.y + p.h / 2, value: p.value, smashed: false, looted: false };
      this.cases.push(c);
      this.interactables.push({
        id: c.id,
        x: c.x,
        y: c.y,
        offer: () => {
          if (c.looted) return null;
          if (!c.smashed) return this.player.masked ? 'case_smash' : '!Mask up first (hold G)';
          return canBag(this, 'light') ?? 'bag_loot';
        },
      });
    }
  }

  get observers(): Observer[] {
    return [...this.guards, ...this.cameras, ...this.civilians];
  }

  lineIds(prefix: string): string[] {
    let ids = this.lineCache.get(prefix);
    if (!ids) {
      ids = Object.keys(LINES).filter((k) => k.startsWith(prefix + '.'));
      this.lineCache.set(prefix, ids);
    }
    return ids;
  }

  private doorInteractable(d: DoorState): Interactable {
    return {
      id: d.id,
      x: d.cx + 0.5,
      y: d.cy + 0.5,
      offer: () => {
        if (d.open) return this.cellOccupied(d.cx, d.cy) ? null : 'door_close';
        if (d.locked) return 'lockpick';
        return 'door_open';
      },
    };
  }

  private cellOccupied(cx: number, cy: number): boolean {
    const near = (p: Vec2, r: number) => p.x + r > cx && p.x - r < cx + 1 && p.y + r > cy && p.y - r < cy + 1;
    return near(this.player.pos, T.player.radius) || this.walkers().some((g) => near(g.pos, T.guard.radius));
  }

  emitNoise(x: number, y: number, r: number, source: string): void {
    this.noises.push({ x, y, r, age: 0, source });
    this.events.emit({ type: 'noise', x, y, r, source });
    for (const g of this.guards) {
      if (Math.hypot(g.pos.x - x, g.pos.y - y) <= r * T.guard.hearingMultiplier) investigate(this, g, { x, y }, 'noise');
    }
  }

  endJob(how: 'escaped' | 'cuffed', note: string): void {
    if (this.ended) return;
    this.ended = { how, time: this.time };
    this.endNote = note;
    this.interaction = null;
    this.events.emit({ type: 'jobEnded', how });
  }

  tripAlarm(cause: string): void {
    if (this.alarm.tripped) return;
    this.stats.spotted = true;
    this.alarm = { tripped: true, cause, time: this.time };
    this.events.emit({ type: 'alarm', cause });
    this.events.emit({ type: 'bark', who: 'accountant', line: 'accountant.alarm.01' });
    for (const g of this.guards) if (!isDown(g)) setState(g, 'alert');
    startHeat(this);
  }

  escort(g: Guard): void {
    const p = this.player;
    p.escorts++;
    p.frozen = T.casing.escortFadeTime;
    this.interaction = null;
    for (const o of this.observers) {
      o.suspicion = 0;
      o.peak = 0;
      o.lastKnown = null;
      o.sees = false;
    }
    this.events.emit({ type: 'bark', who: g.id, line: this.rng.pick(this.lineIds('guard.escort')) });
    this.events.emit({ type: 'escorted', who: g.id });
    this.events.emit({ type: 'message', text: `${g.label} walked you back to the lobby. Next time it gets called in.`, tone: 'warn' });
    setState(g, 'return');
  }

  step(input: InputFrame): void {
    const dt = this.dt;
    if (this.ended) return;
    this.tick++;
    this.time += dt;
    const p = this.player;
    p.prev.x = p.pos.x;
    p.prev.y = p.pos.y;
    p.prevYaw = p.yaw;
    for (const o of this.observers) {
      o.prev.x = o.pos.x;
      o.prev.y = o.pos.y;
      o.prevYaw = o.yaw;
    }

    if (input.mark) this.mark(input.aimX, input.aimY);
    if (input.throw && !this.interaction && this.player.frozen <= 0) throwBag(this, this.facingPoint(T.bags[this.player.carrying ?? 'light'].throw));
    updateBags(this, dt);
    updateShots(this, dt);
    this.updatePlayer(input, dt);
    this.updateInteraction(input, dt);
    updatePlayerWeapon(this, input.fire, input.reload, dt, this.player.aiming ? { x: input.aimX, y: input.aimY } : null);
    this.updateDoors(dt);

    // Detection first, then AI reacts to the new meter values.
    for (const o of this.observers) {
      if (this.alarm.tripped || p.frozen > 0 || (o.kind === 'guard' && isDown(o)) || (o.kind === 'civilian' && (o.state === 'tied' || o.state === 'dead')) || (o.kind === 'camera' && o.dead)) {
        o.sees = false;
        if (o.kind !== 'camera' && o.suspicion < 100) o.suspicion = 0;
        continue;
      }
      if (o.kind === 'guard' && (o.state === 'report' || o.state === 'alert')) {
        updateSuspicion(this.grid, o, p, dt);
        o.suspicion = 100;
        continue;
      }
      const crossed = updateSuspicion(this.grid, o, p, dt);
      if (crossed) {
        this.stats.spotted = true;
        if (o.kind === 'guard') guardSpotted(this, o, describe(o, p));
        else if (o.kind === 'civilian') civilianSpotted(this, o);
        else this.cameraSpotted(o);
      }
    }
    for (const g of this.guards) updateGuard(this, g, dt);
    for (const c of this.cameras) this.updateCamera(c, dt);
    for (const c of this.civilians) updateCivilian(this, c, dt);
    updateDowned(this, dt);
    updateHeat(this, dt);
    updateEnemyFire(this, dt);
    checkBodies(this);
    this.separate();

    for (const n of this.noises) n.age += dt;
    this.noises = this.noises.filter((n) => n.age < 1.2);
  }

  private updatePlayer(input: InputFrame, dt: number): void {
    const p = this.player;
    p.inRestricted = this.level.zones.some((z) => z.type === 'restricted' && inRect(p.pos, z));

    if (p.frozen > 0) {
      const before = p.frozen;
      p.frozen -= dt;
      // teleport at the midpoint of the fade
      if (before > T.casing.escortFadeTime / 2 && p.frozen <= T.casing.escortFadeTime / 2) {
        const l = this.level.spawns.lobby_spawn;
        p.pos.x = p.prev.x = l.x;
        p.pos.y = p.prev.y = l.y;
        for (const o of this.observers) {
          o.suspicion = 0;
          o.peak = 0;
          o.sinceSeen = 99;
        }
      }
      p.vel.x = p.vel.y = 0;
      p.moving = false;
      return;
    }

    // Mask up: hold G
    if (!p.masked) {
      if (input.mask) {
        p.maskProgress += dt / T.player.maskTime;
        if (p.maskProgress >= 1) {
          p.masked = true;
          p.maskProgress = 0;
          this.events.emit({ type: 'maskedUp' });
          this.events.emit({ type: 'bark', who: 'accountant', line: 'accountant.mask.01' });
        }
      } else p.maskProgress = 0;
    }

    p.crouch = input.crouch;
    const bag = p.carrying ? T.bags[p.carrying] : null;
    const canSprint = !p.crouch && (!bag || bag.sprint);
    p.sprinting = input.sprint && canSprint;
    let speed: number = p.crouch ? T.player.crouchSpeed : p.sprinting ? T.player.sprintSpeed : T.player.walkSpeed;
    if (bag) speed *= bag.speed;
    if (p.maskProgress > 0) speed = Math.min(speed, T.player.crouchSpeed);
    p.aiming = input.aim && p.masked;
    if (p.aiming) speed = Math.min(speed, T.player.aimSpeed);

    let mx = input.moveX;
    let my = input.moveY;
    if (this.interaction) mx = my = 0; // busy: hands on the job
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const tx = mx * speed;
    const ty = my * speed;
    const a = T.player.accel * dt;
    p.vel.x += Math.max(-a, Math.min(a, tx - p.vel.x));
    p.vel.y += Math.max(-a, Math.min(a, ty - p.vel.y));
    this.grid.moveCircle(p.pos, T.player.radius, p.vel.x * dt, p.vel.y * dt);
    const actual = Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y) / dt;
    p.moving = actual > 0.3;
    if (!p.moving) p.sprinting = false;

    // face where you're walking; while aiming (right mouse, masked), face the cursor instead
    const aimDist = Math.hypot(input.aimX - p.pos.x, input.aimY - p.pos.y);
    if (p.aiming && aimDist > 0.3) {
      const want = Math.atan2(input.aimY - p.pos.y, input.aimX - p.pos.x);
      const d = angleDiff(p.yaw, want);
      const max = T.player.aimTurnRate * DEG * dt;
      p.yaw += Math.max(-max, Math.min(max, d));
    } else if (Math.hypot(mx, my) > 0.1) {
      const want = Math.atan2(my, mx);
      const d = angleDiff(p.yaw, want);
      const max = T.player.turnRate * DEG * dt;
      p.yaw += Math.max(-max, Math.min(max, d));
    }

    // footsteps when sprinting
    p.noiseTimer -= dt;
    if (p.sprinting && p.moving && p.noiseTimer <= 0) {
      this.emitNoise(p.pos.x, p.pos.y, T.noise.sprint, 'sprint');
      p.noiseTimer = T.player.sprintNoiseInterval;
    }

  }

  private pickFocus(): { it: Interactable; offer: string } | null {
    const p = this.player;
    let best: { it: Interactable; offer: string } | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      // distance to the 1×1 cell's edge, not its center
      const dx = Math.max(Math.abs(it.x - p.pos.x) - 0.5, 0);
      const dy = Math.max(Math.abs(it.y - p.pos.y) - 0.5, 0);
      const d = Math.hypot(dx, dy);
      if (d > T.player.interactReach - T.player.radius) continue;
      const offer = it.offer();
      if (!offer) continue;
      const facing = Math.cos(angleDiff(p.yaw, Math.atan2(it.y - p.pos.y, it.x - p.pos.x)));
      const score = d - facing * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = { it, offer };
      }
    }
    return best;
  }

  private updateInteraction(input: InputFrame, dt: number): void {
    const p = this.player;
    if (!input.interact) this.interactLatch = false;
    const cur = this.interaction;
    if (cur) {
      const def = INTERACTIONS[cur.defId];
      const moving = Math.hypot(input.moveX, input.moveY) > 0.2;
      const it = this.interactables.find((i) => i.id === cur.targetId);
      let why = '';
      if (!input.interact && def.interrupt.includes('release')) why = 'released';
      else if (moving && def.interrupt.includes('move')) why = 'moved';
      else if (def.interrupt.includes('seen') && this.observers.some((o) => o.suspicion >= 100)) why = 'seen';
      else if (!it || it.offer() !== cur.defId) why = 'gone';
      else if (p.frozen > 0) why = 'escorted';
      if (why) {
        if (def.keepProgress) this.savedProgress.set(`${cur.targetId}:${cur.defId}`, cur.progress);
        if (cur.defId === 'answer_pager' && why !== 'gone') {
          this.events.emit({ type: 'bark', who: 'dispatcher', line: 'dispatcher.hangup.01' });
          this.tripAlarm('You hung up on the Dispatcher mid-call');
        }
        this.events.emit({ type: 'interactCancel', id: cur.targetId, def: cur.defId, why });
        this.interaction = null;
      } else {
        cur.progress += dt;
        if (def.noiseContinuous && def.noise > 0) {
          cur.noiseTimer -= dt;
          if (cur.noiseTimer <= 0) {
            this.emitNoise(it!.x, it!.y, def.noise, def.id);
            cur.noiseTimer = 1;
          }
        }
        if (cur.progress >= cur.time) {
          this.interaction = null;
          this.interactLatch = true;
          this.savedProgress.delete(`${cur.targetId}:${cur.defId}`);
          this.complete(cur.targetId, cur.defId);
          if (def.noiseOnComplete) this.emitNoise(it!.x, it!.y, def.noiseOnComplete, def.id);
          this.events.emit({ type: 'interactDone', id: cur.targetId, def: cur.defId });
        }
      }
    }

    const f = p.frozen > 0 ? null : this.pickFocus();
    this.focus = this.interaction ? { id: this.interaction.targetId, offer: this.interaction.defId } : f ? { id: f.it.id, offer: f.offer } : null;

    if (!this.interaction && f && input.interact && !this.interactLatch && !f.offer.startsWith('!')) {
      const def = INTERACTIONS[f.offer];
      if (!def) return;
      if (def.requiresMask && !p.masked) return;
      const time = def.id === 'lockpick' ? T.doors.lockpickTime : def.time;
      this.interaction = {
        targetId: f.it.id,
        defId: def.id,
        progress: this.savedProgress.get(`${f.it.id}:${def.id}`) ?? 0,
        time,
        noiseTimer: 0,
      };
      if (def.noise > 0) this.emitNoise(f.it.x, f.it.y, def.noise, def.id);
      this.events.emit({ type: 'interactStart', id: f.it.id, def: def.id });
    }
  }

  private complete(targetId: string, defId: string): void {
    const door = this.grid.doors.find((d) => d.id === targetId);
    const kase = this.cases.find((c) => c.id === targetId);
    switch (defId) {
      case 'door_open':
        if (door) this.setDoor(door, true);
        break;
      case 'door_close':
        if (door) this.setDoor(door, false);
        break;
      case 'lockpick':
        if (door) {
          door.locked = false;
          this.setDoor(door, true);
        }
        break;
      case 'case_smash':
        if (kase) kase.smashed = true;
        break;
      case 'takedown': {
        const g = this.guards.find((q) => q.id === targetId);
        if (g) {
          takeDown(this, g);
          this.stats.takedowns++;
        }
        break;
      }
      case 'zip_tie': {
        const t = this.walkers().find((q) => q.id === targetId);
        if (t) zipTie(this, t);
        break;
      }
      case 'answer_pager': {
        const g = this.guards.find((q) => q.id === targetId);
        if (g) answeredPager(this, g);
        break;
      }
      case 'bag_loot':
        if (kase) {
          kase.looted = true;
          bagLoot(this, 'light', kase.value, 'jewelry');
          this.events.emit({ type: 'message', text: `Bagged $${kase.value.toLocaleString()} in jewelry. Get it to the van.`, tone: 'info' });
        }
        break;
      case 'bag_pickup':
        pickUp(this, targetId);
        break;
      case 'read_note':
        this.knowsCode = true;
        this.events.emit({ type: 'message', text: `Safe code: ${this.shuffle.safeCode}`, tone: 'info' });
        this.events.emit({ type: 'bark', who: 'accountant', line: 'accountant.note.01' });
        break;
      case 'safe_code': {
        const sf = this.safes.find((q) => q.id === targetId);
        if (sf) sf.open = true;
        break;
      }
      case 'safe_loot': {
        const sf = this.safes.find((q) => q.id === targetId);
        if (sf) {
          sf.looted = true;
          bagLoot(this, 'heavy', sf.value, 'gold');
          this.events.emit({ type: 'message', text: `Gold: $${sf.value.toLocaleString()}. Heavy bag: slow, no sprinting.`, tone: 'info' });
        }
        break;
      }
      case 'leave':
        this.endJob('escaped', 'Out in the van');
        break;
    }
  }

  setDoor(d: DoorState, open: boolean, byGuard = false): void {
    if (d.open === open) return;
    d.open = open;
    d.openedByGuard = open && byGuard;
    d.closeTimer = T.guard.doorCloseDelay;
    this.events.emit({ type: 'door', id: d.id, open });
  }

  private updateDoors(dt: number): void {
    for (const d of this.grid.doors) {
      const cx = d.cx + 0.5;
      const cy = d.cy + 0.5;
      if (!d.open) {
        // guards open doors in front of them (they have keys)
        for (const g of this.walkers()) {
          if (!g.path.length && !(g.kind === 'guard' && g.state === 'alert')) continue;
          if (Math.hypot(g.pos.x - cx, g.pos.y - cy) < 1.05) this.setDoor(d, true, true);
        }
      } else if (d.openedByGuard) {
        const someoneNear =
          Math.hypot(this.player.pos.x - cx, this.player.pos.y - cy) < 1.3 || this.walkers().some((g) => Math.hypot(g.pos.x - cx, g.pos.y - cy) < 1.3);
        if (someoneNear) d.closeTimer = T.guard.doorCloseDelay;
        else {
          d.closeTimer -= dt;
          if (d.closeTimer <= 0 && !this.cellOccupied(d.cx, d.cy)) this.setDoor(d, false);
        }
      }
      d.swing += Math.max(-dt * 4, Math.min(dt * 4, (d.open ? 1 : 0) - d.swing));
    }
  }

  private updateCamera(c: SecurityCamera, dt: number): void {
    if (c.dead) {
      if (c.deskTimer > 0) {
        c.deskTimer -= dt;
        if (c.deskTimer <= 0) this.tripAlarm(c.deskReason);
      }
      return;
    }
    c.phase += ((Math.PI * 2) / c.period) * dt;
    const max = T.camera.trackSpeed * DEG * dt;
    if (c.sees && c.suspicion > 0) {
      c.locked = true;
      const want = Math.atan2(this.player.pos.y - c.pos.y, this.player.pos.x - c.pos.x);
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
    if (c.suspicion < T.detection.look) c.dispatched = false;
    if (c.deskTimer > 0) {
      c.deskTimer -= dt;
      this.events.emit({ type: 'reporting', who: c.id, time: Math.max(0, c.deskTimer) });
      if (c.deskTimer <= 0) {
        this.events.emit({ type: 'bark', who: 'desk', line: 'desk.alarm.01' });
        this.tripAlarm(c.deskReason || `${c.label} saw you masked, and the security desk raised the alarm`);
      }
    }
  }

  private cameraSpotted(c: SecurityCamera): void {
    const p = this.player;
    if (p.masked) {
      if (c.deskTimer <= 0) {
        c.deskTimer = T.camera.deskAlarmTime;
        this.events.emit({ type: 'bark', who: 'desk', line: 'desk.camera.01' });
        this.events.emit({ type: 'suspicion', who: c.id, level: 'report' });
      }
      return;
    }
    // Unmasked trespasser on camera: the desk sends the nearest guard to check.
    if (c.dispatched) return;
    c.dispatched = true;
    c.suspicion = T.detection.investigate;
    const at = c.lastKnown ?? p.pos;
    let best: Guard | null = null;
    for (const g of this.guards) if (!best || Math.hypot(g.pos.x - at.x, g.pos.y - at.y) < Math.hypot(best.pos.x - at.x, best.pos.y - at.y)) best = g;
    if (best) {
      investigate(this, best, at, 'dispatch');
      this.events.emit({ type: 'bark', who: 'desk', line: 'desk.camera.01' });
      this.events.emit({ type: 'message', text: `${c.label} spotted you in a staff area. The desk sent ${best.label} to check.`, tone: 'warn' });
    }
  }

  /** Q: tag the observer nearest the cursor (within 2 m). Marking needs line of sight from the player. */
  private mark(ax: number, ay: number): void {
    let best: Observer | null = null;
    let bd = 2;
    for (const o of this.observers) {
      const d = Math.hypot(o.pos.x - ax, o.pos.y - ay);
      if (d < bd && this.grid.canSee(this.player.pos, o.pos)) {
        bd = d;
        best = o;
      }
    }
    if (!best) return;
    if (this.marked.has(best.id)) {
      this.marked.delete(best.id);
      this.events.emit({ type: 'message', text: `Unmarked ${best.label}`, tone: 'info' });
    } else {
      this.marked.add(best.id);
      this.events.emit({ type: 'message', text: `Marked ${best.label}`, tone: 'info' });
    }
  }

  /** The point `dist` meters ahead of the player along their facing. */
  facingPoint(dist: number): Vec2 {
    const p = this.player;
    return { x: p.pos.x + Math.cos(p.yaw) * dist, y: p.pos.y + Math.sin(p.yaw) * dist };
  }

  /** Everyone who walks around and opens doors. */
  walkers(): (Guard | Civilian)[] {
    return [...this.guards, ...this.civilians];
  }

  /** Keep the player from walking through guards. */
  private separate(): void {
    const p = this.player;
    const min = T.player.radius + T.guard.radius;
    for (const g of this.walkers()) {
      if (g.kind === 'guard' && isDown(g)) continue;
      const dx = p.pos.x - g.pos.x;
      const dy = p.pos.y - g.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 1e-4) {
        this.grid.moveCircle(p.pos, T.player.radius, (dx / d) * (min - d), (dy / d) * (min - d));
      }
    }
  }
}
