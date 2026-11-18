// Gear view: the weapon or gadget in the player's hand, thrown and placed gadgets, body bags, smoke,
// the panic button and the breaker. Reads sim state; never writes it. Models come from gear.glb
// (ASSETS.md "Gear"); every piece has a primitive fallback so the graybox build still shows them.
import * as THREE from 'three';
import { T } from '../tuning';
import { GADGETS, WEAPONS } from '../data/loadout';
import { INTERACTION_TOOL } from '../data/interactions';
import { powerOut } from '../sim/security';
import type { Sim } from '../sim/sim';
import type { Kit } from './kit';
import type { WorldView } from './renderer';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Held items: origin is the right palm, business end +Z (ASSETS.md). This is the one fixed rotation that
 * lines the item's +Z up with the rig's hand forward. Tunable live from the console: `rj.gear.handRot`.
 */
export const HAND = {
  rot: new THREE.Euler(Math.PI / 2, 0, 0),
  offset: new THREE.Vector3(0, 0.0, 0),
};

export class GearView {
  private group = new THREE.Group();
  private held: THREE.Object3D | null = null;
  private heldName = '';
  private heldCache = new Map<string, THREE.Object3D>();
  private items = new Map<string, THREE.Object3D>();
  private smokes = new Map<string, THREE.Object3D>();
  private bodyBags = new Map<string, THREE.Object3D>();
  private panic = new Map<string, THREE.Mesh>();
  private breaker: THREE.Group | null = null;
  private lights: { light: THREE.Light; base: number }[] = [];
  private smokeMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 });
  readonly handRot = HAND.rot;
  readonly handOffset = HAND.offset;

  constructor(
    private view: WorldView,
    private sim: Sim,
    private kit: Kit | null,
  ) {
    view.scene.add(this.group);
    view.scene.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && !(l as THREE.PointLight).isPointLight) this.lights.push({ light: l, base: l.intensity });
    });
    for (const b of sim.security.panicButtons) {
      // red is for danger: the panic button is exactly that
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0x660000 }));
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.26), new THREE.MeshStandardMaterial({ color: 0x2a2d36 }));
      base.position.y = -0.05;
      m.add(base);
      m.position.set(b.pos.x, 1.06, b.pos.y);
      this.group.add(m);
      this.panic.set(b.id, m);
    }
    const br = sim.security.breaker;
    if (br) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.14), new THREE.MeshStandardMaterial({ color: 0x5b6270, metalness: 0.4, roughness: 0.6 }));
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), new THREE.MeshStandardMaterial({ color: 0xf5d547 }));
      lever.position.set(0, 0.08, 0.1);
      lever.name = 'lever';
      g.add(box, lever);
      g.position.set(br.x, 1.4, br.y - 0.1);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.group.add(g);
      this.breaker = g;
    }
  }

  /** A clone of a gear.glb piece, or a primitive stand-in. */
  private model(name: string): THREE.Object3D {
    const k = this.kit?.clone(name);
    if (k) return k;
    const colors: Record<string, number> = { noisemaker: 0x2fd0c0, smoke_grenade: 0x8a93a8, ecm_jammer: 0x2a3048, c4: 0xc9b98a, medkit: 0xe8e2d0, body_bag: 0x1c1f26 };
    const size: Record<string, [number, number, number]> = { body_bag: [1.7, 0.35, 0.6], ecm_jammer: [0.35, 0.18, 0.25], c4: [0.3, 0.12, 0.2] };
    const [x, y, z] = size[name] ?? [0.14, 0.14, 0.22];
    const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshStandardMaterial({ color: colors[name] ?? 0x30343e }));
    m.geometry.translate(0, y / 2, 0);
    m.castShadow = true;
    return m;
  }

  /** What the player holds in the right hand right now (piece name), or ''. */
  private wantHeld(): string {
    const sim = this.sim;
    const p = sim.player;
    if (sim.ended) return '';
    const act = sim.interaction;
    if (act) {
      if (act.defId === 'zip_tie') return 'zip_ties';
      const tool = INTERACTION_TOOL[act.defId];
      if (tool && sim.gear.slots.some((s) => s.id === tool)) return GADGETS[tool as keyof typeof GADGETS].model;
      return '';
    }
    const u = sim.gear.lastUse;
    if (u && sim.time - u.at < T.gadgets.heldShowTime) return GADGETS[u.id].model;
    if (!p.masked || p.bagCount >= 2) return '';
    return WEAPONS[sim.loadout.weapon].model;
  }

  private updateHeld(): void {
    const want = this.wantHeld();
    const hand = this.view.playerChar?.bones.hand_R ?? null;
    if (want !== this.heldName) {
      if (this.held) this.held.removeFromParent();
      this.held = null;
      this.heldName = want;
      if (want) {
        let m = this.heldCache.get(want);
        if (!m) {
          const piece = this.model(want);
          // placed/thrown items carry from their _grip socket: shift so the grip sits in the palm
          const grip = piece.getObjectByName(`${want}_grip`);
          m = new THREE.Group();
          m.add(piece);
          if (grip) piece.position.copy(grip.position).negate();
          this.heldCache.set(want, m);
        }
        this.held = m;
        if (hand) hand.add(m);
        else this.view.playerRoot.add(m);
      }
    }
    if (!this.held) return;
    if (hand) {
      // undo the bone's world scale (rigs exported at 0.01 etc.) so gear keeps its authored size
      const ws = hand.getWorldScale(new THREE.Vector3());
      const rs = this.view.playerRoot.getWorldScale(new THREE.Vector3());
      this.held.scale.setScalar(rs.x / Math.max(1e-6, ws.x));
      this.held.rotation.copy(HAND.rot);
      this.held.position.copy(HAND.offset).multiplyScalar(this.held.scale.x);
    } else {
      // graybox: in front of the body at hand height, pointing along the facing (+X in actor space)
      this.held.position.set(0.32, 0.95, 0.18);
      this.held.rotation.set(0, Math.PI / 2, 0);
      this.held.scale.setScalar(1);
    }
  }

  update(alpha: number, dt: number): void {
    const sim = this.sim;
    const now = performance.now() / 1000;
    this.updateHeld();

    // thrown: arc in flight, then lie where they land; smoke grows a cloud
    const seen = new Set<string>();
    for (const t of sim.gear.thrown) {
      seen.add(t.id);
      let m = this.items.get(t.id);
      if (!m) {
        m = this.model(t.kind === 'smoke' ? 'smoke_grenade' : 'noisemaker');
        this.group.add(m);
        this.items.set(t.id, m);
      }
      const x = lerp(t.prev.x, t.pos.x, alpha);
      const z = lerp(t.prev.y, t.pos.y, alpha);
      const k = t.state === 'flying' ? 1 - t.flight / T.gadgets.throwFlightTime : 1;
      m.position.set(x, Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * 1.6, z);
      if (t.state === 'flying') m.rotation.x += dt * 12;
      else m.rotation.x = 0;
      // noisemaker buzzes: a little hop on each pulse
      if (t.kind === 'noisemaker' && t.state === 'active' && t.pulses > 0) m.position.y = Math.abs(Math.sin(now * 30)) * 0.03;
      if (t.kind === 'smoke') {
        let c = this.smokes.get(t.id);
        if (t.state === 'active') {
          if (!c) {
            c = new THREE.Group();
            for (let i = 0; i < 9; i++) {
              const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.smokeMat);
              const a = (i / 9) * Math.PI * 2;
              const r = i === 0 ? 0 : 0.55;
              puff.position.set(Math.cos(a) * r, 0.45 + (i % 3) * 0.2, Math.sin(a) * r);
              puff.scale.set(0.55, 0.45, 0.55);
              c.add(puff);
            }
            c.renderOrder = 5;
            this.group.add(c);
            this.smokes.set(t.id, c);
          }
          const grow = Math.min(1, (T.gadgets.smoke.duration - t.timer) / 0.8);
          const fade = Math.min(1, t.timer / 1.5);
          const R = T.gadgets.smoke.radius * grow;
          c.position.set(t.pos.x, 0, t.pos.y);
          c.scale.set(R, Math.max(0.3, R * 0.9), R);
          c.rotation.y += dt * 0.2;
          this.smokeMat.opacity = 0.6 * fade;
        }
      }
    }
    for (const [id, m] of this.items) {
      if (!seen.has(id) && !sim.gear.placed.some((p) => p.id === id)) {
        m.removeFromParent();
        this.items.delete(id);
        this.smokes.get(id)?.removeFromParent();
        this.smokes.delete(id);
      }
    }

    // placed: ECM (LED on while jamming), C4 (timer blinks faster as it counts down)
    for (const p of sim.gear.placed) {
      let m = this.items.get(p.id);
      if (!m) {
        m = this.model(p.kind === 'ecm' ? 'ecm_jammer' : 'c4');
        m.position.set(p.pos.x, 0, p.pos.y);
        m.rotation.y = -p.yaw + Math.PI / 2;
        this.group.add(m);
        this.items.set(p.id, m);
      }
      if (p.kind === 'c4') {
        if (p.done) m.visible = false;
        const timer = m.getObjectByName('c4_timer');
        const left = Math.max(0, p.until - sim.time);
        if (timer) timer.visible = Math.sin(now * (6 + (T.gadgets.c4.fuse - left) * 6)) > 0;
      } else {
        const led = m.getObjectByName('ecm_jammer_led');
        if (led) led.visible = !p.done && Math.sin(now * 8) > -0.3;
      }
    }

    // body bags where bagged bodies lie
    for (const w of sim.walkers()) {
      if (!w.bagged) continue;
      let m = this.bodyBags.get(w.id);
      if (!m) {
        m = this.model('body_bag');
        m.position.set(w.pos.x, 0, w.pos.y);
        m.rotation.y = -w.yaw;
        this.group.add(m);
        this.bodyBags.set(w.id, m);
      }
    }

    // panic buttons go dark with the power; the breaker lever drops
    const out = powerOut(sim);
    for (const m of this.panic.values()) (m.material as THREE.MeshStandardMaterial).emissive.setHex(out ? 0x000000 : 0x660000);
    const lever = this.breaker?.getObjectByName('lever');
    if (lever) lever.rotation.x = out ? Math.PI * 0.8 : 0;
    // lights down with the power (the renderer sets intensities each frame; we scale after it)
    for (const l of this.lights) {
      if (out) l.light.intensity = Math.min(l.light.intensity, l.base * 0.45);
      else if ((l.light as THREE.DirectionalLight).isDirectionalLight) l.light.intensity = l.base;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.held?.removeFromParent();
  }
}
