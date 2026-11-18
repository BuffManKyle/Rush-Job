// DOM HUD. Reads sim state and listens to sim events; never writes to the sim.
import * as THREE from 'three';
import { T } from '../tuning';
import { line } from '../data/dialogue';
import { INTERACTIONS } from '../data/interactions';
import type { SimEvent } from '../sim/events';
import type { Sim } from '../sim/sim';
import type { GameCamera } from './camera/types';
import { WorldView } from './renderer';
import { computePayout } from '../sim/payout';
import { HEAT_NAMES } from '../sim/police';

const SPEAKERS: Record<string, string> = { accountant: 'The Accountant', desk: 'Security desk', dispatcher: 'The Dispatcher', player: 'You', dot: 'Dot' };
const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

interface Bubble {
  who: string;
  el: HTMLDivElement;
  ttl: number;
}

export class Hud {
  private root: HTMLElement;
  private status: HTMLDivElement;
  private prompt: HTMLDivElement;
  private ring: HTMLDivElement;
  private ringArc: SVGCircleElement;
  private ringLabel: HTMLDivElement;
  private meters = new Map<string, { el: HTMLDivElement; fill: HTMLDivElement; icon: HTMLDivElement }>();
  private bubbles: Bubble[] = [];
  private subtitle: HTMLDivElement;
  private subtitleTtl = 0;
  private toast: HTMLDivElement;
  private toastTtl = 0;
  private banner: HTMLDivElement;
  private fade: HTMLDivElement;
  private hurt: HTMLDivElement;
  private vitals: HTMLDivElement;
  readonly pause: HTMLDivElement;
  private unsub: () => void;

  constructor(
    parent: HTMLElement,
    private sim: Sim,
  ) {
    parent.innerHTML = '';
    this.root = el('div', 'hud-root', parent);
    this.status = el('div', 'hud-status', this.root);
    this.prompt = el('div', 'hud-prompt', this.root);
    this.ring = el('div', 'hud-ring', this.root);
    this.ring.innerHTML = `<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${RING_R}" class="bg"/><circle cx="28" cy="28" r="${RING_R}" class="fg" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg><div class="lbl"></div>`;
    this.ringArc = this.ring.querySelector('.fg')!;
    this.ringLabel = this.ring.querySelector('.lbl')!;
    this.subtitle = el('div', 'hud-subtitle', this.root);
    this.toast = el('div', 'hud-toast', this.root);
    this.banner = el('div', 'hud-banner', this.root);
    this.fade = el('div', 'hud-fade', this.root);
    this.hurt = el('div', 'hud-hurt', this.root);
    this.vitals = el('div', 'hud-vitals', this.root);
    this.pause = el('div', 'hud-pause hidden', this.root);
    el('div', 'hud-help', this.root, 'WASD move · Shift sprint · C crouch · E interact (hold) · G mask up (hold) · Q mark · F throw bag · Click or Space shoot · R reload · Wheel zoom · F1 debug · Esc pause');
    this.unsub = sim.events.on((e) => this.onEvent(e));
  }

  dispose(): void {
    this.unsub();
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'bark': {
        const text = line(e.line);
        if (this.sim.walkers().some((w) => w.id === e.who)) this.say(e.who, text);
        else this.sub(`${SPEAKERS[e.who] ?? e.who}: ${text}`);
        break;
      }
      case 'message':
        this.toast.textContent = e.text;
        this.toast.dataset.tone = e.tone ?? 'info';
        this.toastTtl = 4;
        break;
      case 'playerHit':
        this.hitFlash = 0.35;
        break;
      case 'interactCancel':
        if (e.why === 'moved') this.flashPrompt('Interrupted: you moved');
        break;
    }
  }

  private flashPrompt(t: string): void {
    this.toast.textContent = t;
    this.toast.dataset.tone = 'warn';
    this.toastTtl = 1.5;
  }

  private say(who: string, text: string): void {
    const old = this.bubbles.find((b) => b.who === who);
    if (old) {
      old.el.remove();
      this.bubbles = this.bubbles.filter((b) => b !== old);
    }
    const b = el('div', 'hud-bubble', this.root, text.replace('[placeholder] ', ''));
    this.bubbles.push({ who, el: b, ttl: 3 });
  }

  private sub(text: string): void {
    this.subtitle.textContent = text.replace('[placeholder] ', '');
    this.subtitleTtl = 4;
  }

  update(dt: number, alpha: number, cam: GameCamera): void {
    const sim = this.sim;
    const p = sim.player;

    // status line
    const mode = p.masked ? '<b class="masked">MASKED</b>' : '<b>UNMASKED</b> · casing';
    const area = p.inRestricted ? '<span class="restricted">STAFF ONLY</span>' : '<span>public</span>';
    const move = p.crouch ? 'crouched' : p.sprinting && p.moving ? 'sprinting' : p.moving ? 'walking' : 'still';
    const bag = p.carrying ? ` · bag $${p.carryValue.toLocaleString()}` : '';
    const ties = p.masked ? ` · zip ties ${p.zipTies}` : '';
    const take = sim.secured ? ` · secured $${sim.secured.toLocaleString()}` : '';
    this.status.innerHTML = `<div class="title">${sim.level.title}</div>${mode} · ${area} · ${move}${ties}${bag}${take}`;

    // interact prompt + ring
    const f = sim.focus;
    const it = f ? sim.interactables.find((i) => i.id === f.id) : null;
    let promptText = '';
    if (!p.masked && p.maskProgress > 0) promptText = 'Masking up...';
    else if (f && it) {
      if (f.offer.startsWith('!')) promptText = f.offer.slice(1);
      else promptText = `<kbd>E</kbd> ${INTERACTIONS[f.offer]?.label ?? f.offer}`;
    } else if (!p.masked) promptText = '<span class="dim">Hold <kbd>G</kbd> to mask up</span>';
    this.prompt.innerHTML = promptText;

    const act = sim.interaction;
    const ringAt = act && it ? new THREE.Vector3(it.x, 1.2, it.y) : p.maskProgress > 0 ? WorldView.lerpPos(p, alpha, 2.0) : null;
    const frac = act ? act.progress / act.time : p.maskProgress;
    if (ringAt) {
      const s = cam.worldToScreen(ringAt);
      this.ring.style.display = 'block';
      this.ring.style.transform = `translate(${s.x - 28}px, ${s.y - 28}px)`;
      this.ringArc.setAttribute('stroke-dashoffset', String(RING_C * (1 - Math.min(1, frac))));
      const remaining = act ? Math.max(0, act.time - act.progress) : (1 - p.maskProgress) * T.player.maskTime;
      this.ringLabel.textContent = remaining.toFixed(1);
    } else this.ring.style.display = 'none';

    // suspicion meters over each observer
    for (const o of sim.observers) {
      let m = this.meters.get(o.id);
      if (!m) {
        const wrap = el('div', 'hud-meter', this.root);
        const icon = el('div', 'icon', wrap);
        const bar = el('div', 'bar', wrap);
        const fill = el('div', 'fill', bar);
        m = { el: wrap, fill, icon };
        this.meters.set(o.id, m);
      }
      const show = o.suspicion > 0.5 && !sim.alarm.tripped;
      m.el.style.display = show ? 'flex' : 'none';
      if (!show) continue;
      const head = WorldView.lerpPos(o, alpha, o.kind === 'camera' ? 3.0 : 2.15);
      const s = cam.worldToScreen(head);
      m.el.style.transform = `translate(${s.x - 24}px, ${s.y - 30}px)`;
      const v = o.suspicion;
      m.fill.style.width = `${v}%`;
      const lvl = v >= 100 ? 'report' : v >= 60 ? 'investigate' : v >= 30 ? 'look' : 'low';
      m.el.dataset.level = lvl;
      m.el.dataset.rising = o.sees ? '1' : '0';
      const rep = this.countdown(o.id);
      m.icon.textContent = v >= 100 ? (rep !== null ? `! ${rep.toFixed(1)}` : '!') : v >= 30 ? '?' : '';
    }

    // speech bubbles track their guard
    for (const b of this.bubbles) {
      b.ttl -= dt;
      const g = sim.walkers().find((q) => q.id === b.who);
      if (!g) continue;
      const s = cam.worldToScreen(WorldView.lerpPos(g, alpha, 2.6));
      b.el.style.transform = `translate(${s.x}px, ${s.y - 34}px) translateX(-50%)`;
      b.el.style.opacity = String(Math.min(1, b.ttl * 2));
    }
    this.bubbles = this.bubbles.filter((b) => (b.ttl > 0 ? true : (b.el.remove(), false)));

    this.subtitleTtl -= dt;
    this.subtitle.style.opacity = this.subtitleTtl > 0 ? '1' : '0';
    this.toastTtl -= dt;
    this.toast.style.opacity = this.toastTtl > 0 ? '1' : '0';

    // banner: alarm, or someone about to raise it
    if (sim.alarm.tripped && sim.heat) {
      const h = sim.heat;
      const fresh = sim.time - sim.alarm.time < 6;
      this.banner.className = `hud-banner ${fresh ? 'alarm' : 'heat'}`;
      const next = h.level < 4 ? `Heat ${h.level + 1} in <b>${Math.max(0, h.nextAt - sim.time).toFixed(0)} s</b>` : `Dot leaves in <b>${Math.max(0, h.vanLeavesAt - sim.time).toFixed(0)} s</b>`;
      const cuff = h.arrest > 0 ? `<div class="cuff">CUFFING <span style="width:${(h.arrest * 100).toFixed(0)}%"></span></div>` : '';
      this.banner.innerHTML = fresh
        ? `<div class="big">ALARM</div><div>${sim.alarm.cause}.</div><div class="dim">Grab what you can and get it to the van.</div>`
        : `<div><b class="heat-level">HEAT ${h.level} · ${HEAT_NAMES[h.level]}</b> · ${next} · secured $${sim.secured.toLocaleString()}</div>${cuff}`;
    } else {
      const o = sim.observers.find((q) => this.countdown(q.id) !== null);
      const pager = sim.guards.find((g) => g.pagerRinging > 0);
      if (pager) {
        this.banner.className = 'hud-banner warn';
        this.banner.innerHTML = `<div>${pager.label}'s pager is ringing. Hold <kbd>E</kbd> on him to answer: alarm in <b>${Math.max(0, T.pager.timeout - pager.pagerRinging).toFixed(1)} s</b></div>`;
      } else if (o) {
        const t = this.countdown(o.id)!;
        const what = o.kind === 'camera' ? `Security desk saw you on the ${o.label.toLowerCase()}` : `${o.label} is radioing it in`;
        this.banner.className = 'hud-banner warn';
        this.banner.innerHTML = `<div>${what}: alarm in <b>${t.toFixed(1)} s</b></div>`;
      } else this.banner.className = 'hud-banner';
    }

    // escort fade
    const fz = p.frozen;
    const half = T.casing.escortFadeTime / 2;
    this.fade.style.opacity = fz > 0 ? String(1 - Math.abs(fz - half) / half) : '0';

    // health + ammo (guns come out with the mask)
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.vitals.style.display = p.masked ? 'block' : 'none';
    if (p.masked) {
      const hpPct = (p.hp / T.health.hp) * 100;
      const armor = p.armorMax > 0 ? `<div class="bar armor"><span style="width:${(p.armor / p.armorMax) * 100}%"></span></div>` : '';
      const ammo = p.reloadTimer > 0 ? 'RELOADING' : `${p.mag} / ${p.reserve}`;
      this.vitals.innerHTML = `${armor}<div class="bar hp ${hpPct < 35 ? 'low' : ''}"><span style="width:${hpPct}%"></span></div><div class="ammo">Pocket pistol (silenced) · <b>${ammo}</b>${p.mag === 0 && p.reloadTimer <= 0 ? ' · <kbd>R</kbd>' : ''}</div>`;
    }
    this.hurt.style.opacity = String(Math.min(0.6, this.hitFlash * 2 + (p.masked && p.hp < 35 ? 0.15 : 0)));
    document.body.classList.toggle('armed', p.masked && !sim.ended);
  }

  /** Seconds until this observer raises the alarm, or null if it isn't trying to. */
  private countdown(id: string): number | null {
    const g = this.sim.guards.find((q) => q.id === id);
    if (g) return g.state === 'report' ? Math.max(0, g.reportTimer) : null;
    const c = this.sim.cameras.find((q) => q.id === id);
    return c && c.deskTimer > 0 ? c.deskTimer : null;
  }

  private payoutShown = false;
  private hitFlash = 0;
  showPayout(onRestart: (newSeed: boolean) => void): void {
    if (this.payoutShown) return;
    this.payoutShown = true;
    const pay = computePayout(this.sim);
    const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString()}`;
    const rows = pay.lines.map((l) => `<div class="row"><span>${l.label}</span><span>${money(l.amount)}</span></div>`).join('');
    this.pause.classList.remove('hidden');
    this.pause.innerHTML = `
      <div class="panel receipt">
        <div class="dim">THE ACCOUNTANT · ITEMIZED · ${this.sim.endNote}</div>
        <h1>${this.sim.level.title}</h1>
        ${rows}
        <div class="row total"><span>Total</span><span>${money(pay.total)}</span></div>
        <div class="rating">${pay.rating}</div>
        <p class="dim">${pay.ratingNote}</p>
        <p class="dim">Seed <code>${this.sim.seed}</code> · ${this.sim.time.toFixed(0)} s</p>
        <div class="buttons">
          <button data-a="same">Run it again (R)</button>
          <button data-a="new">New seed (N)</button>
        </div>
      </div>`;
    // typewriter: reveal rows one at a time
    this.pause.querySelectorAll<HTMLElement>('.row, .rating').forEach((r, i) => {
      r.style.opacity = '0';
      setTimeout(() => (r.style.opacity = '1'), 250 + i * 350);
    });
    this.pause.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onRestart(b.dataset.a === 'new')));
  }

  showPause(show: boolean, seed: number, onRestart: (newSeed: boolean) => void, onResume: () => void): void {
    this.pause.classList.toggle('hidden', !show);
    if (!show) return;
    this.pause.innerHTML = `
      <div class="panel">
        <h1>Paused</h1>
        <div class="seed">Seed <code>${seed}</code></div>
        <p class="dim">Share the seed to replay this exact run: add <code>?seed=${seed}</code> to the URL.</p>
        <div class="buttons">
          <button data-a="resume">Resume (Esc)</button>
          <button data-a="same">Restart, same seed (R)</button>
          <button data-a="new">New seed (N)</button>
        </div>
        <p class="dim">WASD move (screen-relative) · Shift sprint (noise 4 m) · C crouch · E hold to interact · G hold to mask up · Q mark guard/camera under cursor · Wheel zoom · F1 debug</p>
      </div>`;
    this.pause.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'resume') onResume();
        else onRestart(a === 'new');
      }),
    );
  }
}
