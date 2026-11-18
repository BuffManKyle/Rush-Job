// Graybox world view. Reads sim state each frame; never writes it.
// Sim (x, y) maps to three.js (x, 0, y): +z is south, toward the top-down camera.
import * as THREE from 'three';
import { T } from '../tuning';
import { F_COVER, F_PROP, F_WALL, F_WINDOW } from '../sim/grid';
import type { Sim } from '../sim/sim';
import type { Observer } from '../sim/types';
import type { GameCamera } from './camera/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export const PALETTE = {
  bg: 0x0d1424,
  floor: {
    floor_showroom: 0x24585c,
    floor_back: 0x4a4d58,
    floor_sidewalk: 0x6c6e78,
    floor_asphalt: 0x22252f,
  } as Record<string, number>,
  wall: 0xd8cdb8,
  wallTop: 0x2a3048,
  windowSill: 0xb9ae98,
  glass: 0x8fd8e8,
  door: 0x8a5a3a,
  doorLocked: 0x6b3e2a,
  player: 0xe8e2d0,
  playerMask: 0x111111,
  guard: 0x2f4d8f,
  cap: 0x1b2a4f,
  camera: 0x333842,
  amber: 0xf0a020,
  teal: 0x2fd0c0,
  gold: 0xf2c94c,
  coneIdle: 0xcfe8ff,
  coneLook: 0xf5d547,
  coneInvestigate: 0xf08a24,
  coneReport: 0xff2a2a, // red = danger only
  noise: 0xffffff,
};

const PROP_STYLE: Record<string, { h: number; color: number }> = {
  counter: { h: 1.0, color: 0x6b5340 },
  case: { h: 1.0, color: 0x3a4b5c },
  desk: { h: 0.75, color: 0x5a4636 },
  security_desk: { h: 0.8, color: 0x3c3f48 },
  safe: { h: 1.3, color: 0x55606b },
  van: { h: 2.2, color: 0xd0d4da },
};

interface Cutable {
  mesh: THREE.InstancedMesh;
  cells: { x: number; z: number; full: number; base: number; cur: number }[];
}

interface ObserverView {
  root: THREE.Group;
  cone: THREE.Mesh;
  coneGeo: THREE.BufferGeometry;
  coneMat: THREE.MeshBasicMaterial;
}

export class WorldView {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly debugGroup = new THREE.Group();
  private cutables: Cutable[] = [];
  private player!: THREE.Group;
  private playerHead!: THREE.Mesh;
  private observers = new Map<string, ObserverView>();
  private doors = new Map<string, THREE.Group>();
  private cases = new Map<string, { glass: THREE.Mesh; loot: THREE.Mesh }>();
  private noiseRings: THREE.Mesh[] = [];
  private noiseMat = new THREE.MeshBasicMaterial({ color: PALETTE.noise, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  private ringGeo = new THREE.RingGeometry(0.94, 1, 64);
  private alarmLight: THREE.PointLight;
  private key: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private tmpM = new THREE.Matrix4();

  constructor(
    container: HTMLElement,
    private sim: Sim,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(PALETTE.bg);

    const L = sim.level;
    this.hemi = new THREE.HemisphereLight(0x9ab8d0, 0x141b33, 1.4);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffd6a8, 2.2);
    this.key.position.set(L.w * 0.3, 22, L.h * 0.9);
    this.key.target.position.set(L.w / 2, 0, L.h / 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const s = Math.max(L.w, L.h) * 0.75;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    this.key.shadow.bias = -0.0005;
    this.scene.add(this.key, this.key.target);
    this.alarmLight = new THREE.PointLight(0xff2020, 0, 40, 1.2);
    this.alarmLight.position.set(L.w / 2, 6, L.h / 2);
    this.scene.add(this.alarmLight);

    this.buildLevel();
    this.buildActors();
    this.scene.add(this.debugGroup);
  }

  private buildLevel(): void {
    const { level, grid } = this.sim;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0); // pivot at the base, so scale.y = height

    // Floors
    const floorCells: { x: number; z: number; c: number }[] = [];
    for (let z = 0; z < level.h; z++)
      for (let x = 0; x < level.w; x++) {
        const name = level.floor[z * level.w + x];
        if (name) floorCells.push({ x, z, c: PALETTE.floor[name] ?? 0x555555 });
      }
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const floor = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ roughness: 0.9 }), floorCells.length);
    const col = new THREE.Color();
    floorCells.forEach((f, i) => {
      // faint checker so movement reads on flat color
      const k = (f.x + f.z) % 2 ? 1.0 : 0.93;
      floor.setMatrixAt(i, this.tmpM.makeTranslation(f.x + 0.5, 0, f.z + 0.5));
      floor.setColorAt(i, col.setHex(f.c).multiplyScalar(k));
    });
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Walls, window sills and door lintels: cutaway-able instanced boxes
    const walls: Cutable['cells'] = [];
    const sills: Cutable['cells'] = [];
    const lintels: Cutable['cells'] = [];
    const glass: { x: number; z: number }[] = [];
    for (let z = 0; z < level.h; z++)
      for (let x = 0; x < level.w; x++) {
        const f = grid.flags[z * level.w + x];
        if (f & F_WALL) walls.push({ x, z, full: T.view.wallHeight, base: 0, cur: T.view.wallHeight });
        else if (f & F_WINDOW) {
          sills.push({ x, z, full: 0.9, base: 0, cur: 0.9 });
          lintels.push({ x, z, full: T.view.wallHeight - 2.3, base: 2.3, cur: T.view.wallHeight - 2.3 });
          glass.push({ x, z });
        }
      }
    for (const d of grid.doors) lintels.push({ x: d.cx, z: d.cy, full: T.view.wallHeight - T.doors.height, base: T.doors.height, cur: T.view.wallHeight - T.doors.height });

    const mk = (cells: Cutable['cells'], color: number) => {
      const m = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), Math.max(1, cells.length));
      m.count = cells.length;
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const c: Cutable = { mesh: m, cells };
      this.cutables.push(c);
      this.writeCutable(c);
      return c;
    };
    mk(walls, PALETTE.wall);
    mk(sills, PALETTE.windowSill);
    mk(lintels, PALETTE.wall);

    const glassMat = new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false });
    for (const g of glass) {
      const horiz = grid.flags[g.z * level.w + g.x - 1] & (F_WALL | F_WINDOW) || grid.flags[g.z * level.w + g.x + 1] & (F_WALL | F_WINDOW);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1 : 0.06, 1.4, horiz ? 0.06 : 1), glassMat);
      pane.position.set(g.x + 0.5, 0.9 + 0.7, g.z + 0.5);
      this.scene.add(pane);
    }

    // Props
    for (const p of level.props) {
      const st = PROP_STYLE[p.type] ?? { h: 1, color: 0x777777 };
      const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.7 }));
      const inset = p.type === 'case' ? 0.12 : 0.04;
      m.scale.set(p.w - inset * 2, p.type === 'case' ? 0.75 : st.h, p.h - inset * 2);
      m.position.set(p.x + p.w / 2, 0, p.y + p.h / 2);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      if (p.type === 'case') {
        const glassM = new THREE.Mesh(new THREE.BoxGeometry(p.w - 0.24, 0.35, p.h - 0.24), new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.35, roughness: 0.05 }));
        glassM.position.set(p.x + p.w / 2, 0.75 + 0.175, p.y + p.h / 2);
        const loot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.6, roughness: 0.3, emissive: 0x332200 }));
        loot.position.set(p.x + p.w / 2, 0.79, p.y + p.h / 2);
        this.scene.add(glassM, loot);
        this.cases.set(p.id, { glass: glassM, loot });
      }
      if (p.type === 'van') {
        const stripe = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: PALETTE.teal }));
        stripe.scale.set(p.w + 0.02, 0.3, p.h * 0.6);
        stripe.position.set(p.x + p.w / 2, 1.1, p.y + p.h / 2);
        this.scene.add(stripe);
      }
    }

    // Zones: amber hatched trim for restricted, teal outline for the van drop
    const hatch = this.hatchTexture();
    for (const z of level.zones) {
      if (z.type === 'restricted') this.addTrim(z, 0.22, new THREE.MeshBasicMaterial({ map: hatch, transparent: true, depthWrite: false }));
      if (z.type === 'van_drop') this.addTrim(z, 0.12, new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.8, depthWrite: false }));
    }

    // Safe-code sticky note (shuffled)
    const note = level.markers.find((m) => m.id === this.sim.shuffle.codeNote);
    if (note) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      const onProp = grid.flags[Math.floor(note.y) * level.w + Math.floor(note.x)] & (F_PROP | F_COVER);
      n.position.set(note.x, onProp ? 0.81 : 0.02, note.y);
      this.scene.add(n);
    }

    // Doors: hinged leaf
    for (const d of grid.doors) {
      const pivot = new THREE.Group();
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, T.doors.height - 0.02, 0.07), new THREE.MeshStandardMaterial({ color: d.locked ? PALETTE.doorLocked : PALETTE.door }));
      leaf.position.set(0.46, T.doors.height / 2, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
      if (d.axis === 'x') {
        pivot.position.set(d.cx + 0.04, 0, d.cy + 0.5);
      } else {
        pivot.position.set(d.cx + 0.5, 0, d.cy + 0.04);
        pivot.rotation.y = -Math.PI / 2;
      }
      pivot.userData.baseYaw = pivot.rotation.y;
      this.scene.add(pivot);
      this.doors.set(d.id, pivot);
    }
  }

  private addTrim(z: { x: number; y: number; w: number; h: number }, wdt: number, mat: THREE.Material): void {
    const y = 0.012;
    const strips: [number, number, number, number][] = [
      [z.x + z.w / 2, z.y + wdt / 2, z.w, wdt],
      [z.x + z.w / 2, z.y + z.h - wdt / 2, z.w, wdt],
      [z.x + wdt / 2, z.y + z.h / 2, wdt, z.h],
      [z.x + z.w - wdt / 2, z.y + z.h / 2, wdt, z.h],
    ];
    for (const [cx, cz, w, h] of strips) {
      const geo = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
      // world-scaled UVs so stripes stay even
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 3, uv.getY(i) * h * 3);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, y, cz);
      this.scene.add(m);
    }
  }

  private hatchTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1a1408';
    g.fillRect(0, 0, 32, 32);
    g.strokeStyle = '#f0a020';
    g.lineWidth = 7;
    for (let i = -32; i < 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 32);
      g.lineTo(i + 32, 0);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildActors(): void {
    this.player = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.15, 16), new THREE.MeshStandardMaterial({ color: 0x2b2d36 }));
    body.position.y = 0.6;
    this.playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: PALETTE.player }));
    this.playerHead.position.y = 1.4;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: PALETTE.teal, emissive: 0x0a3a36 }));
    nose.position.set(0.3, 1.15, 0);
    for (const m of [body, this.playerHead, nose]) {
      m.castShadow = true;
      this.player.add(m);
    }
    // ground ring so the player always reads
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.8 }));
    ring.position.y = 0.02;
    this.player.add(ring);
    this.scene.add(this.player);

    for (const o of this.sim.observers) {
      const root = new THREE.Group();
      if (o.kind === 'guard') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.25, 16), new THREE.MeshStandardMaterial({ color: PALETTE.guard }));
        body.position.y = 0.63;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd9b48f }));
        head.position.y = 1.47;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16), new THREE.MeshStandardMaterial({ color: PALETTE.cap }));
        cap.position.y = 1.64;
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: PALETTE.cap }));
        brim.position.set(0.25, 1.6, 0);
        for (const m of [body, head, cap, brim]) {
          m.castShadow = true;
          root.add(m);
        }
      } else {
        const cam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: PALETTE.camera }));
        cam.position.set(0.15, 2.6, 0);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
        lens.position.set(0.36, 2.6, 0);
        root.add(cam, lens);
      }
      this.scene.add(root);
      const n = T.view.coneRays;
      const coneGeo = new THREE.BufferGeometry();
      coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 2) * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(0, i + 2, i + 1);
      coneGeo.setIndex(idx);
      const coneMat = new THREE.MeshBasicMaterial({ color: PALETTE.coneIdle, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.frustumCulled = false;
      cone.renderOrder = 2;
      this.scene.add(cone);
      this.observers.set(o.id, { root, cone, coneGeo, coneMat });
    }
  }

  /** Interpolated world position of a sim entity (alpha = fraction into the next tick). */
  static lerpPos(e: { pos: { x: number; y: number }; prev: { x: number; y: number } }, alpha: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(lerp(e.prev.x, e.pos.x, alpha), y, lerp(e.prev.y, e.pos.y, alpha));
  }

  update(alpha: number, dt: number, cam: GameCamera, showCones: boolean): void {
    const sim = this.sim;
    const p = sim.player;
    const pp = WorldView.lerpPos(p, alpha);
    this.player.position.copy(pp);
    this.player.rotation.y = -lerpAngle(p.prevYaw, p.yaw, alpha);
    this.player.scale.y = p.crouch ? 0.72 : 1;
    (this.playerHead.material as THREE.MeshStandardMaterial).color.setHex(p.masked ? PALETTE.playerMask : PALETTE.player);

    for (const o of sim.observers) {
      const v = this.observers.get(o.id)!;
      const pos = WorldView.lerpPos(o, alpha);
      v.root.position.copy(pos);
      const yaw = lerpAngle(o.prevYaw, o.yaw, alpha);
      v.root.rotation.y = -yaw;
      this.updateCone(o, v, pos, yaw, showCones);
    }

    for (const d of sim.grid.doors) {
      const g = this.doors.get(d.id)!;
      g.rotation.y = g.userData.baseYaw + d.swing * (Math.PI / 2) * 0.95;
    }
    for (const c of sim.cases) {
      const v = this.cases.get(c.id)!;
      v.glass.visible = !c.smashed;
      v.loot.visible = !c.looted;
    }

    this.updateNoise();
    if (cam.wantsCutaway) this.updateCutaway(pp, dt);

    const alarm = sim.alarm.tripped;
    this.alarmLight.intensity = alarm ? 30 + 30 * Math.sin(performance.now() / 120) : 0;
    this.hemi.intensity = alarm ? 0.9 : 1.4;
  }

  private updateCone(o: Observer, v: ObserverView, pos: THREE.Vector3, yaw: number, show: boolean): void {
    v.cone.visible = show;
    if (!show) return;
    const grid = this.sim.grid;
    const n = T.view.coneRays;
    const arr = v.coneGeo.attributes.position.array as Float32Array;
    const h = 0.04 + (o.kind === 'camera' ? 0.01 : 0);
    arr[0] = pos.x;
    arr[1] = h;
    arr[2] = pos.z;
    for (let i = 0; i <= n; i++) {
      const a = yaw - o.cone / 2 + (o.cone * i) / n;
      const ex = pos.x + Math.cos(a) * o.range;
      const ez = pos.z + Math.sin(a) * o.range;
      const d = grid.raycast(pos.x, pos.z, ex, ez);
      arr[(i + 1) * 3] = pos.x + Math.cos(a) * d;
      arr[(i + 1) * 3 + 1] = h;
      arr[(i + 1) * 3 + 2] = pos.z + Math.sin(a) * d;
    }
    v.coneGeo.attributes.position.needsUpdate = true;
    v.coneGeo.computeBoundingSphere();
    const s = o.suspicion;
    const c = s >= 100 ? PALETTE.coneReport : s >= 60 ? PALETTE.coneInvestigate : s >= 30 ? PALETTE.coneLook : PALETTE.coneIdle;
    v.coneMat.color.setHex(c);
    v.coneMat.opacity = s >= 100 ? 0.32 : s > 0 ? 0.2 + s * 0.001 : 0.13;
  }

  private updateNoise(): void {
    const ns = this.sim.noises;
    while (this.noiseRings.length < ns.length) {
      const m = new THREE.Mesh(this.ringGeo, this.noiseMat.clone());
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      this.noiseRings.push(m);
    }
    this.noiseRings.forEach((m, i) => {
      const n = ns[i];
      m.visible = !!n;
      if (!n) return;
      const t = Math.min(1, n.age / 0.6);
      const r = Math.max(0.1, n.r * (0.3 + 0.7 * Math.sqrt(t)));
      m.scale.set(r, r, 1);
      m.position.set(n.x, 0.05, n.y);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - n.age / 1.2);
    });
  }

  /** Walls between the camera and the player sink to a stub so the room reads like a diorama. */
  private updateCutaway(pp: THREE.Vector3, dt: number): void {
    const k = 1 - Math.exp(-10 * dt);
    for (const c of this.cutables) {
      let dirty = false;
      for (const cell of c.cells) {
        const cx = cell.x + 0.5;
        const cz = cell.z + 0.5;
        const ahead = cz - pp.z; // positive = between player and camera
        const cut = ahead > -0.6 && ahead < T.view.cutDepth && Math.abs(cx - pp.x) < T.view.cutRadius;
        const stub = cell.base > 0 ? 0 : Math.min(cell.full, T.view.wallStub);
        const want = cut ? stub : cell.full;
        if (Math.abs(cell.cur - want) > 0.005) {
          cell.cur += (want - cell.cur) * k;
          dirty = true;
        }
      }
      if (dirty) this.writeCutable(c);
    }
  }

  private writeCutable(c: Cutable): void {
    c.cells.forEach((cell, i) => {
      const h = Math.max(0.001, cell.cur);
      this.tmpM.makeScale(1, h, 1).setPosition(cell.x + 0.5, cell.base, cell.z + 0.5);
      c.mesh.setMatrixAt(i, this.tmpM);
    });
    c.mesh.instanceMatrix.needsUpdate = true;
  }

  render(cam: GameCamera): void {
    this.renderer.render(this.scene, cam.camera);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
