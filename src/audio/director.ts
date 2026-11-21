// Turns the sim into sound. Listens to sim events and reads sim state every frame; never writes either.
// Sound ids are the ones in the vault's Audio/00 Sound list.md (and assets/audio/manifest.json).
import { T } from '../tuning';
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import type { Vec2 } from '../sim/level';
import type { AudioEngine, PlayOpts, Voice } from './engine';
import { Music } from './music';

const FLOOR_SURFACE: Record<string, string> = {
  floor_showroom: 'showroom',
  floor_back: 'lino',
  floor_lino: 'lino',
  floor_concrete: 'concrete',
  floor_back_concrete: 'concrete',
  floor_sidewalk: 'sidewalk',
  floor_asphalt: 'asphalt',
  floor_marble: 'marble',
  floor_wood: 'wood',
  floor_carpet: 'carpet',
};
const OUTDOOR = new Set(['sidewalk', 'asphalt']);

/** Room ambience per surface, per heist. */
function ambienceFor(heist: string, surface: string): string {
  if (heist === 'glint') return surface === 'showroom' ? 'amb.glint.showroom' : OUTDOOR.has(surface) ? 'amb.glint.alley' : 'amb.glint.back';
  return OUTDOOR.has(surface) ? 'amb.loud.street' : `amb.${heist}.lobby`;
}

const HEAR = 22; // m: beyond this, world sounds are silent

export class AudioDirector {
  readonly music: Music;
  private sim: Sim | null = null;
  private off: (() => void) | null = null;
  private heist = 'glint';
  private loops = new Map<string, Voice>(); // keyed loops the director keeps alive
  private throttle = new Map<string, number>();
  private stepDist = 0;
  private guardStep = new Map<string, number>();
  private prevMask = 0;
  private maskVoice: Voice | null = null;
  private reloading = false;
  private bagState = new Map<string, string>();
  private thrownState = new Map<string, string>();
  private placedSeen = new Set<string>();
  private c4Beep = new Map<string, number>();
  private ecmWarned = new Set<string>();
  private camLocked = new Set<string>();
  private reporting = new Map<string, { v: Voice | null; last: number }>();
  private lockpickQuarter = 0;
  private lastUseAt = -1;
  private honkedLeaving = false;
  private ambience = new Map<string, Voice>();
  private ambTarget = '';
  private scene: 'board' | 'job' | 'payout' = 'board';

  constructor(private readonly a: AudioEngine) {
    this.music = new Music(a);
    // UI: every button click and hover in menus and on the HUD
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement)?.closest?.('button, [role=button], .clickable')) this.ui('ui.click');
    });
    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement)?.closest?.('button, [role=button], .clickable');
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) this.ui('ui.hover', 0.35);
    });
    void a.preload([...a.ids('ui.'), 'mus.board', 'mus.payout', 'mus.payout.cuffed', 'mus.sting.escaped', 'mus.sting.cuffed', 'mus.sting.mask_up', 'mus.sting.unlock']);
  }

  /** The loadout screen is the job board. */
  board(): void {
    this.scene = 'board';
    this.stopWorld();
    void this.music.loop('mus.board', 1.5);
  }

  attach(sim: Sim): void {
    this.detach();
    this.sim = sim;
    this.scene = 'job';
    this.heist = /bank/i.test(sim.level.title) ? 'bank' : /gallery|vandermeer/i.test(sim.level.title) ? 'gallery' : 'glint';
    this.off = sim.events.on((e) => this.onEvent(e));
    // casing is ambience only; the stems start at mask up (Audio/01 Music.md)
    this.music.stopAll(1.5);
    void this.a.preload([...this.a.ids('sfx.'), ...this.a.ids('cue.'), ...this.a.ids(`amb.${this.heist}.`), ...this.a.ids('amb.siren'), 'amb.loud.street', 'amb.van.idle', 'amb.police.radio']);
    void this.a.preload([`mus.${this.heist}.stealth`, `mus.${this.heist}.loud`, `mus.${this.heist}.tension`, `mus.sting.alarm_${this.heist}`]);
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.sim = null;
    this.stopWorld();
    this.reset();
  }

  private reset(): void {
    this.stepDist = 0;
    this.guardStep.clear();
    this.prevMask = 0;
    this.reloading = false;
    this.bagState.clear();
    this.thrownState.clear();
    this.placedSeen.clear();
    this.c4Beep.clear();
    this.ecmWarned.clear();
    this.camLocked.clear();
    this.reporting.clear();
    this.lockpickQuarter = 0;
    this.lastUseAt = -1;
    this.honkedLeaving = false;
    this.ambTarget = '';
  }

  private stopWorld(): void {
    for (const v of this.loops.values()) v.stop(0.3);
    this.loops.clear();
    for (const v of this.ambience.values()) v.stop(0.8);
    this.ambience.clear();
    this.maskVoice?.stop(0.1);
    this.maskVoice = null;
    for (const r of this.reporting.values()) r.v?.stop(0.05);
  }

  setPaused(p: boolean): void {
    this.a.setPaused(p);
  }

  toggleMute(): boolean {
    return this.a.toggleMute();
  }

  // ---------- helpers ----------

  /** Gain and pan for a sound at a world position, heard from the player. */
  private where(p: Vec2 | { x: number; y: number }, range = HEAR): { gain: number; pan: number } {
    const me = this.sim!.player.pos;
    const dx = p.x - me.x;
    const d = Math.hypot(dx, p.y - me.y);
    const g = Math.max(0, 1 - d / range);
    return { gain: g * g, pan: Math.max(-0.8, Math.min(0.8, dx / 10)) };
  }

  private at(id: string, p: Vec2 | { x: number; y: number }, o: PlayOpts = {}, range = HEAR): Voice | null {
    const w = this.where(p, range);
    if (w.gain < 0.01) return null;
    return this.a.play(id, { jitter: 0.04, ...o, gain: (o.gain ?? 1) * w.gain, pan: w.pan });
  }

  private me(id: string, o: PlayOpts = {}): Voice | null {
    return this.a.play(id, { jitter: 0.03, ...o });
  }

  private ui(id: string, gain = 0.6): void {
    if (this.once(id, 0.05)) this.a.play(id, { bus: 'sfx', gain });
  }

  /** True at most once per `sec` for this key. */
  private once(key: string, sec: number): boolean {
    const now = this.a.now;
    if ((this.throttle.get(key) ?? -1e9) + sec > now) return false;
    this.throttle.set(key, now);
    return true;
  }

  /** Keep a keyed loop running at a gain (0 stops it). */
  private hold(key: string, id: string, gain: number, pan = 0, fade = 0.15): void {
    let v = this.loops.get(key);
    if (gain <= 0.005) {
      if (v) {
        v.stop(fade);
        this.loops.delete(key);
      }
      return;
    }
    if (!v || v.ended) {
      v = this.a.play(id, { loop: true, gain: 0, pan }) ?? undefined;
      if (!v) return;
      this.loops.set(key, v);
    }
    v.setGain(gain, fade);
    v.setPan(pan);
  }

  private posOf(id: string): Vec2 | null {
    const s = this.sim!;
    const it = s.interactables.find((i) => i.id === id);
    if (it) return { x: it.x, y: it.y };
    const o = s.observers.find((x) => x.id === id);
    if (o) return o.pos;
    const d = s.level.doors.find((x) => x.id === id);
    if (d) return { x: d.cx + 0.5, y: d.cy + 0.5 };
    return null;
  }

  private surfaceAt(p: Vec2): string {
    const L = this.sim!.level;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const name = cx >= 0 && cy >= 0 && cx < L.w && cy < L.h ? L.floor[cy * L.w + cx] : '';
    return FLOOR_SURFACE[name] ?? 'concrete';
  }

  // ---------- events ----------

  private onEvent(e: SimEvent): void {
    const s = this.sim;
    if (!s) return;
    switch (e.type) {
      case 'maskedUp':
        this.maskVoice?.stop(0.05);
        this.maskVoice = null;
        this.me('sfx.player.mask_snap');
        this.a.play('mus.sting.mask_up', { bus: 'music', gain: 1 });
        void this.music.startStems(this.heist);
        break;
      case 'alarm':
        this.music.alarm();
        this.a.play('cue.detect.spotted', { gain: 0.8 });
        break;
      case 'suspicion': {
        const o = s.observers.find((x) => x.id === e.who);
        if (!this.once(`sus:${e.who}:${e.level}`, 2)) break;
        const id = e.level === 'look' ? 'cue.detect.look' : e.level === 'investigate' ? 'cue.detect.investigate' : 'cue.detect.spotted';
        // cues are information: never quieter than half, even across the map
        const w = o ? this.where(o.pos, 30) : { gain: 1, pan: 0 };
        this.a.play(id, { gain: Math.max(0.5, w.gain), pan: w.pan * 0.5 });
        break;
      }
      case 'reporting': {
        const r = this.reporting.get(e.who);
        if (!r) {
          // the cue is 3 s long and ends when the window does
          const left = Math.max(0, e.time);
          const v = this.a.play('cue.detect.reporting', { offset: Math.max(0, 3 - left), gain: 0.9 });
          this.reporting.set(e.who, { v, last: this.a.now });
          this.me('sfx.radio.squelch_in', { gain: 0.6 });
        } else r.last = this.a.now;
        break;
      }
      case 'escorted':
        this.a.play('cue.escorted');
        break;
      case 'shot':
        this.onShot(e);
        break;
      case 'blocked':
        this.at('sfx.impact.shield', { x: e.x, y: e.y });
        break;
      case 'playerHit':
        this.me(s.player.armor > 0 ? 'sfx.player.armor_hit' : 'sfx.player.hit', { gain: 0.9 });
        break;
      case 'heat':
        this.a.play('cue.heat.up', { gain: 0.9 }, Math.max(0, Math.min(3, e.level - 1)));
        if (e.level >= 1) this.at('sfx.police.arrive', this.frontDoor(), { gain: 0.9 }, 40);
        if (e.level >= 2) this.at('sfx.bullhorn.open', this.frontDoor(), { gain: 0.7 }, 40);
        if (e.level === 4) this.at('sfx.van.honk_long', this.vanPos(), {}, 40);
        break;
      case 'jobEnded':
        this.endJob(e.how);
        break;
      case 'interactStart':
        this.onInteract(e.def, e.id, 'start');
        break;
      case 'interactDone':
        this.onInteract(e.def, e.id, 'done');
        break;
      case 'interactCancel':
        this.onInteract(e.def, e.id, 'cancel');
        break;
      case 'door': {
        const d = s.level.doors.find((x) => x.id === e.id);
        if (!d) break;
        const id = e.id.toLowerCase();
        const mat = /front|glass|shop/.test(id) ? 'glass' : /safe|closet|back|metal|security|vault/.test(id) ? 'metal' : 'wood';
        this.at(`sfx.door.${mat}_${e.open ? 'open' : 'close'}`, { x: d.cx + 0.5, y: d.cy + 0.5 }, { gain: 0.8 });
        break;
      }
      case 'noise':
        if (e.source === 'c4') this.at('sfx.c4.blast', e, { gain: 1, jitter: 0 }, 80);
        else if (e.source === 'shout') this.me('sfx.player.intimidate');
        break;
      case 'bark':
        if (e.line.startsWith('guard.body')) this.a.play('cue.body.found');
        else if (e.line.startsWith('guard.giveup')) {
          const g = s.guards.find((x) => x.id === e.who);
          if (g && this.where(g.pos, 30).gain > 0) this.a.play('cue.detect.lost', { gain: 0.6 });
        }
        break;
      case 'message':
        if (e.text === 'Out of ammo.') this.me('sfx.gun.dryfire');
        else if (e.text.startsWith('Marked ')) this.ui('ui.mark', 0.7);
        else if (e.text.startsWith('Unmarked ')) this.ui('ui.unmark', 0.6);
        else if (e.tone === 'danger') this.ui('ui.message.danger', 0.7);
        else if (e.tone === 'warn') this.ui('ui.message.warn', 0.5);
        else if (this.once('msg-info', 0.4)) this.ui('ui.message.info', 0.35);
        break;
    }
  }

  private onShot(e: Extract<SimEvent, { type: 'shot' }>): void {
    const s = this.sim!;
    const end = { x: e.x2, y: e.y2 };
    if (e.by === 'player') {
      const w = s.gear.loadout.weapon;
      const id = w === 'tranq_pistol' ? 'sfx.tranq.shot' : w === 'smg_compact' ? 'sfx.smg.shot' : w === 'shotgun_pump' ? 'sfx.shotgun.shot' : 'sfx.pistol.shot';
      this.me(id, { gain: 1, jitter: 0.05 });
      if (w === 'shotgun_pump') this.me('sfx.shotgun.pump', { at: this.a.now + 0.35 });
      else this.me('sfx.gun.casing', { gain: 0.35, at: this.a.now + 0.35 + Math.random() * 0.15 });
      if (s.player.mag === 3) this.ui('ui.ammo.low', 0.6);
      if (!e.hit) this.at('sfx.impact.wall', end, { gain: 0.7 });
      else {
        const cam = s.cameras.find((c) => Math.hypot(c.pos.x - e.x2, c.pos.y - e.y2) < 1.2);
        this.at(cam ? 'sfx.impact.camera' : 'sfx.impact.body', end, { gain: 0.8 });
      }
      return;
    }
    const cop = s.cops.find((c) => c.id === e.by);
    const id = cop ? (cop.kind === 'tactical' ? 'sfx.tactical.shot' : 'sfx.cop.shot') : 'sfx.guard.shot';
    this.at(id, { x: e.x1, y: e.y1 }, { gain: 1, jitter: 0.05 }, 45);
    if (!e.hit) {
      // a miss that passes close to the player: you're under fire, even off-screen
      const p = s.player.pos;
      const vx = e.x2 - e.x1;
      const vy = e.y2 - e.y1;
      const len = Math.hypot(vx, vy) || 1;
      const t = Math.max(0, Math.min(len, ((p.x - e.x1) * vx + (p.y - e.y1) * vy) / len));
      const d = Math.hypot(e.x1 + (vx / len) * t - p.x, e.y1 + (vy / len) * t - p.y);
      if (d < 1.8) this.me('cue.bullet.whiz', { gain: 0.8 });
      else this.at('sfx.impact.wall', end, { gain: 0.6 });
    }
  }

  private onInteract(def: string, id: string, phase: 'start' | 'done' | 'cancel'): void {
    const p = this.posOf(id) ?? this.sim!.player.pos;
    const stop = (key: string) => this.hold(key, '', 0);
    if (phase === 'cancel') {
      stop('lockpick');
      stop('cutter');
      this.ui('ui.interact.cancel', 0.5);
      return;
    }
    if (phase === 'start') {
      switch (def) {
        case 'lockpick':
          this.lockpickQuarter = 0;
          this.hold('lockpick', 'sfx.lockpick.loop', 0.7);
          break;
        case 'case_cut':
          this.hold('cutter', 'sfx.glasscutter.loop', 0.7);
          break;
        case 'zip_tie':
          this.me('sfx.ziptie.zip', { gain: 0.8 });
          break;
        case 'answer_pager':
          this.me('sfx.pager.pickup');
          break;
        case 'bag_loot':
          this.me('sfx.bag.stuff_jewelry', { gain: 0.8 });
          break;
        case 'safe_loot':
          this.me('sfx.bag.stuff_gold', { gain: 0.8 });
          break;
        case 'safe_code':
          for (let i = 0; i < 4; i++) this.me('sfx.keypad.beep', { at: this.a.now + 0.3 + i * 0.6, gain: 0.6 });
          break;
        case 'body_bag':
          this.me('sfx.bodybag.zip', { gain: 0.8 });
          break;
        case 'read_note':
        case 'takedown':
        case 'bag_pickup':
        case 'case_smash':
        case 'door_open':
        case 'door_close':
        case 'leave':
        case 'breaker':
          break;
        default:
          this.ui('ui.interact.start', 0.4);
      }
      return;
    }
    // done
    switch (def) {
      case 'lockpick':
        stop('lockpick');
        this.me('sfx.lockpick.open');
        break;
      case 'case_cut':
        stop('cutter');
        this.at('sfx.glasscutter.pop', p);
        break;
      case 'case_smash':
        this.at('sfx.case.smash', p, { gain: 1 });
        break;
      case 'takedown':
        this.me('sfx.takedown.grab', { gain: 0.7 });
        break;
      case 'read_note':
        this.me('sfx.note.peel');
        break;
      case 'safe_code':
        this.at('sfx.safe.unlock', p);
        this.at('sfx.safe.door_open', p, { at: this.a.now + 0.9 });
        break;
      case 'bag_pickup':
        this.me('sfx.bag.pickup', { gain: 0.8 });
        break;
      case 'answer_pager':
        this.me('sfx.pager.hangup');
        break;
      case 'breaker':
        this.at('sfx.breaker.off', p, { gain: 1 }, 40);
        break;
      case 'leave':
        this.at('sfx.van.door', this.vanPos());
        break;
    }
    if (!['door_open', 'door_close', 'bag_pickup'].includes(def)) this.ui('ui.interact.done', 0.35);
  }

  private endJob(how: 'escaped' | 'cuffed'): void {
    this.scene = 'payout';
    this.stopWorld();
    if (how === 'escaped') {
      this.me('sfx.van.drive_off', { gain: 0.9 });
      this.music.stopAll(1.2);
      this.a.play('mus.sting.escaped', { bus: 'music', at: this.a.now + 0.6 });
      void this.music.loop('mus.payout', 1.0, 0.6 + Math.max(2, this.a.duration('mus.sting.escaped') - 0.5));
    } else {
      this.me('sfx.player.cuffed');
      this.music.stopAll(0.4);
      this.a.play('mus.sting.cuffed', { bus: 'music', at: this.a.now + 0.3 });
      void this.music.loop('mus.payout.cuffed', 1.0, 0.3 + Math.max(2, this.a.duration('mus.sting.cuffed') - 0.3));
    }
  }

  private frontDoor(): Vec2 {
    const d = this.sim!.level.doors.find((x) => /front/i.test(x.id));
    return d ? { x: d.cx + 0.5, y: d.cy + 2 } : this.sim!.player.pos;
  }

  private vanPos(): Vec2 {
    const z = this.sim!.level.zones.find((x) => x.type === 'van_drop');
    return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : this.sim!.player.pos;
  }

  // ---------- every frame ----------

  update(dt: number): void {
    const s = this.sim;
    if (!s || this.scene !== 'job' || s.ended) return;
    const p = s.player;

    // footsteps: one per stride, on the floor under you
    if (p.moving) {
      this.stepDist += Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y);
      const stride = p.sprinting ? 1.05 : p.crouch ? 0.55 : 0.75;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        const gain = p.sprinting ? 0.75 : p.crouch ? 0.16 : 0.38;
        this.me(`sfx.step.${this.surfaceAt(p.pos)}`, { gain, jitter: 0.06 });
      }
    } else this.stepDist = 0.5;

    // guards' footsteps: information, so louder than yours, and heavier (pitched down)
    for (const g of s.guards) {
      if (!g.moving || g.state === 'down' || g.state === 'tied' || g.dead) continue;
      const d = (this.guardStep.get(g.id) ?? 0) + Math.hypot(g.pos.x - g.prev.x, g.pos.y - g.prev.y);
      const fast = g.state === 'alert' || g.state === 'investigate';
      if (d >= (fast ? 1.1 : 0.8)) {
        this.guardStep.set(g.id, 0);
        this.at(`sfx.step.${this.surfaceAt(g.pos)}`, g.pos, { gain: fast ? 0.9 : 0.6, rate: 0.88, jitter: 0.05 }, 14);
        if (fast) this.at('sfx.step.boots_gear', g.pos, { gain: 0.25, rate: 1.0 }, 10);
      } else this.guardStep.set(g.id, d);
    }

    // mask up: the pull while G is held
    if (!p.masked && p.maskProgress > 0 && this.prevMask === 0) this.maskVoice = this.me('sfx.player.mask_pull', { jitter: 0 });
    if (!p.masked && p.maskProgress === 0 && this.prevMask > 0) {
      this.maskVoice?.stop(0.08);
      this.maskVoice = null;
    }
    this.prevMask = p.maskProgress;

    // reload
    if (p.reloadTimer > 0 && !this.reloading) this.me('sfx.pistol.reload', { jitter: 0 });
    this.reloading = p.reloadTimer > 0;

    // lockpick pins at 25/50/75%
    const it = s.interaction;
    if (it?.defId === 'lockpick') {
      const q = Math.floor((it.progress / it.time) * 4);
      if (q > this.lockpickQuarter && q < 4) this.me('sfx.lockpick.pin', { gain: 0.7 });
      this.lockpickQuarter = q;
    }

    // pagers: the loudest cue in stealth, never quieter than half across the map
    let ring: { g: (typeof s.guards)[number]; urgent: boolean } | null = null;
    for (const g of s.guards) {
      const answering = it?.defId === 'answer_pager' && it.targetId === g.id;
      if (g.pagerRinging > 0 && !g.pagerDone && !answering) ring = { g, urgent: g.pagerRinging > T.pager.timeout - 3 };
    }
    if (ring) {
      const w = this.where(ring.g.pos, 30);
      // the last 3 s before it trips the alarm: swap to the urgent ring
      this.hold(ring.urgent ? 'pager' : 'pager-u', '', 0, 0, 0.02);
      this.hold(ring.urgent ? 'pager-u' : 'pager', ring.urgent ? 'cue.pager.ring_urgent' : 'cue.pager.ring', Math.max(0.5, w.gain), w.pan * 0.6, 0.05);
    } else {
      this.hold('pager', '', 0, 0, 0.05);
      this.hold('pager-u', '', 0, 0, 0.05);
    }

    // reporting cue stops if the report is interrupted
    for (const [who, r] of this.reporting) {
      if (this.a.now - r.last > 0.3) {
        if (!s.alarm.tripped) r.v?.stop(0.05);
        this.reporting.delete(who);
      }
    }

    // detection: a quiet rising tone while someone is filling up on you
    let fill = 0;
    let tense = false;
    for (const o of s.observers) {
      if (o.sees && o.info.rate > 0) fill = Math.max(fill, o.suspicion);
      if (o.suspicion >= 60 || (o.kind === 'guard' && (o.state === 'investigate' || o.state === 'search'))) tense = true;
    }
    this.hold('meter', 'cue.detect.meter', fill > 10 && !s.alarm.tripped ? 0.08 + (fill / 100) * 0.35 : 0, 0, 0.2);
    this.music.setTension(tense && p.masked && !s.alarm.tripped);

    // cameras: servo whir near a live camera, a blip when one locks on
    let near: { d: number; c: (typeof s.cameras)[number] } | null = null;
    for (const c of s.cameras) {
      if (c.dead) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.y - p.pos.y);
      if (!near || d < near.d) near = { d, c };
      if (c.locked && !this.camLocked.has(c.id)) {
        this.camLocked.add(c.id);
        this.at('cue.camera.lock', c.pos, { gain: 1 }, 30);
      } else if (!c.locked) this.camLocked.delete(c.id);
    }
    const sw = near ? this.where(near.c.pos, 7) : { gain: 0, pan: 0 };
    this.hold('servo', 'sfx.camera.servo', sw.gain * 0.5, sw.pan);

    // bags: thrown, landed, secured (Dot honks)
    for (const b of s.bags) {
      const was = this.bagState.get(b.id);
      if (was !== b.state) {
        if (b.state === 'flying') this.me('sfx.bag.throw', { gain: 0.7 });
        if (was === 'flying' && b.state === 'ground') this.at(b.weight === 'light' ? 'sfx.bag.land_light' : 'sfx.bag.land_heavy', b.pos, { gain: 0.8 });
        if (b.state === 'secured' && was) {
          this.at('sfx.van.bag_drop', this.vanPos(), { gain: 0.9 });
          this.at('sfx.van.honk', this.vanPos(), { gain: 0.8, at: this.a.now + 0.35, jitter: 0 }, 40);
        }
        this.bagState.set(b.id, b.state);
      }
    }

    // gadgets
    const gear = s.gear;
    for (const t of gear.thrown) {
      const was = this.thrownState.get(t.id);
      if (was === t.state) continue;
      this.thrownState.set(t.id, t.state);
      if (!was) this.me(t.kind === 'smoke' ? 'sfx.smoke.throw' : 'sfx.noisemaker.throw', { gain: 0.8 });
      if (t.state === 'active') this.at(t.kind === 'smoke' ? 'sfx.smoke.hiss' : 'sfx.noisemaker.loop', t.pos, { gain: 1 });
    }
    for (const pl of gear.placed) {
      if (!this.placedSeen.has(pl.id)) {
        this.placedSeen.add(pl.id);
        if (pl.kind === 'c4') this.at('sfx.c4.place', pl.pos);
        else this.me('sfx.ecm.on');
      }
      if (pl.kind === 'ecm') {
        const left = pl.until - s.time;
        this.hold(`ecm:${pl.id}`, 'sfx.ecm.loop', left > 0 && !pl.done ? 0.35 : 0);
        if (left > 0 && left < 3 && !this.ecmWarned.has(pl.id)) {
          this.ecmWarned.add(pl.id);
          this.a.play('cue.ecm.ending');
        }
      }
      if (pl.kind === 'c4' && !pl.done) {
        // the timer beep, closer and closer together as the fuse burns down
        const left = pl.until - s.time;
        const gap = Math.max(0.09, Math.min(1, left / 5));
        const last = this.c4Beep.get(pl.id) ?? -1e9;
        if (s.time - last >= gap) {
          this.c4Beep.set(pl.id, s.time);
          this.at('cue.c4.beep', pl.pos, { jitter: 0, gain: 0.9 }, 30);
        }
      }
    }
    if (gear.lastUse && gear.lastUse.at !== this.lastUseAt) {
      this.lastUseAt = gear.lastUse.at;
      if (gear.lastUse.id === 'medkit') this.me('sfx.player.medkit');
    }

    // health
    this.hold('lowhp', 'cue.player.low_hp', p.hp > 0 && p.hp < 30 ? 0.25 + (1 - p.hp / 30) * 0.4 : 0, 0, 0.3);

    // the alarm, sirens and police by heat level
    const heat = s.alarm.tripped ? (s.heat?.level ?? 0) : -1;
    if (s.alarm.tripped) {
      const since = s.time - s.alarm.time;
      const bell = this.heist === 'bank' ? 'sfx.alarm.klaxon' : this.heist === 'gallery' ? 'sfx.alarm.gallery' : 'sfx.alarm.bell';
      this.hold('alarm', bell, since < 6 ? 0.55 : 0.2, 0, 1.5);
      this.hold('siren-far', 'amb.siren.far', heat === 0 ? 0.6 : 0, 0, 2);
      this.hold('siren-near', 'amb.siren.near', heat === 1 || heat === 2 ? 0.55 : 0, 0, 2);
      this.hold('siren-swarm', 'amb.siren.swarm', heat >= 3 ? 0.6 : 0, 0, 2);
      this.hold('police-radio', 'amb.police.radio', heat >= 1 ? 0.25 : 0, 0, 2);
      if (s.heat && !this.honkedLeaving && s.heat.vanLeavesAt - s.time < 10) {
        this.honkedLeaving = true;
        this.at('sfx.van.honk_long', this.vanPos(), {}, 40);
      }
    }

    // ambience by the floor you stand on, plus the van idling nearby
    const surface = this.surfaceAt(p.pos);
    const amb = ambienceFor(this.heist, surface);
    if (amb !== this.ambTarget) {
      const cur = this.ambience.get(amb);
      const v = cur && !cur.ended ? cur : this.a.play(amb, { loop: true, fadeIn: 1.0 });
      if (v) {
        // only switch once the new bed is actually playing (its file may still be loading)
        this.ambTarget = amb;
        this.ambience.set(amb, v);
        v.setGain(1, 1.0);
        for (const [id, o] of this.ambience) if (id !== amb) o.setGain(0, 1.0);
      }
    }
    const loud = s.alarm.tripped && OUTDOOR.has(surface);
    this.hold('street-loud', 'amb.loud.street', loud ? 0.6 : 0, 0, 1);
    const van = this.where(this.vanPos(), 12);
    this.hold('van', 'amb.van.idle', van.gain * 0.6, van.pan, 0.3);
    void dt;
  }
}
