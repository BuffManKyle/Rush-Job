// F1 debug overlay: nav grid, routes, paths, noise radii, AI states and the live detection math.
import * as THREE from 'three';
import { F_COVER, F_DOOR, F_PROP, F_WALL, F_WINDOW } from '../sim/grid';
import type { Sim } from '../sim/sim';

export class DebugOverlay {
  visible = false;
  private panel: HTMLDivElement;
  private group: THREE.Group;
  private paths: THREE.Line[] = [];
  private noiseLines: THREE.LineLoop[] = [];
  private fps = 60;

  constructor(
    hudRoot: HTMLElement,
    parent: THREE.Group,
    private sim: Sim,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'hud-debug';
    this.panel.style.display = 'none';
    hudRoot.appendChild(this.panel);
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.buildStatic();
  }

  private buildStatic(): void {
    const { grid, level } = this.sim;
    // non-walkable cells, colored by reason
    const quad = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const cells: { x: number; z: number; c: number }[] = [];
    for (let z = 0; z < grid.h; z++)
      for (let x = 0; x < grid.w; x++) {
        const f = grid.flags[z * grid.w + x];
        if (f & F_WALL) continue;
        if (f & F_WINDOW) cells.push({ x, z, c: 0x40c0ff });
        else if (f & F_COVER) cells.push({ x, z, c: 0xffa020 });
        else if (f & F_PROP) cells.push({ x, z, c: 0xff4040 });
        else if (f & F_DOOR) cells.push({ x, z, c: 0x40ff80 });
      }
    const im = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }), Math.max(1, cells.length));
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    cells.forEach((q, i) => {
      im.setMatrixAt(i, m.makeTranslation(q.x + 0.5, 0.06, q.z + 0.5));
      im.setColorAt(i, c.setHex(q.c));
    });
    this.group.add(im);
    // grid lines
    const pts: number[] = [];
    for (let x = 0; x <= grid.w; x++) pts.push(x, 0.03, 0, x, 0.03, grid.h);
    for (let z = 0; z <= grid.h; z++) pts.push(0, 0.03, z, grid.w, 0.03, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 })));
    // every route option (active ones bright, inactive dim)
    for (const r of level.routes) {
      const active = Object.values(this.sim.shuffle.routes).includes(r.id);
      const geo = new THREE.BufferGeometry().setFromPoints(r.points.map((p) => new THREE.Vector3(p.x, 0.08, p.y)));
      this.group.add(new THREE.LineLoop(geo, new THREE.LineDashedMaterial({ color: active ? 0x80a0ff : 0x404860, dashSize: 0.3, gapSize: 0.2 })));
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    this.group.visible = this.visible;
  }

  update(dt: number, paused: boolean): void {
    this.fps += (1 / Math.max(1e-3, dt) - this.fps) * 0.05;
    if (!this.visible) return;
    const sim = this.sim;
    // live guard paths
    sim.guards.forEach((g, i) => {
      let line = this.paths[i];
      if (!line) {
        line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x40ff80 }));
        this.group.add(line);
        this.paths[i] = line;
      }
      const pts = [g.pos, ...g.path].map((p) => new THREE.Vector3(p.x, 0.1, p.y));
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    });
    // noise radii as exact circles
    const ns = sim.noises;
    while (this.noiseLines.length < ns.length) {
      const pts = Array.from({ length: 48 }, (_, k) => new THREE.Vector3(Math.cos((k / 48) * Math.PI * 2), 0, Math.sin((k / 48) * Math.PI * 2)));
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffff00 }));
      this.group.add(l);
      this.noiseLines.push(l);
    }
    this.noiseLines.forEach((l, i) => {
      const n = ns[i];
      l.visible = !!n;
      if (n) {
        l.position.set(n.x, 0.12, n.y);
        l.scale.set(n.r, 1, n.r);
      }
    });

    const p = sim.player;
    const f = (v: number) => v.toFixed(2);
    const rows = sim.observers
      .map((o) => {
        const i = o.info;
        const state = o.kind === 'camera' ? (o.locked ? 'locked-on' : 'sweep') : o.state;
        const why = !i.inRange ? 'out of range' : !i.inCone ? 'out of cone' : !i.los ? 'no LOS' : i.fStatus === 0 ? 'sees you, not suspicious' : 'SEES YOU';
        return `<tr><td>${o.label}</td><td>${state}</td><td class="num">${o.suspicion.toFixed(1)}</td><td class="num">${i.rate >= 0 ? '+' : ''}${i.rate.toFixed(1)}/s</td><td class="num">${f(i.dist)} m</td><td>${why}</td><td class="num">${f(i.fDist)}×${f(i.fMove)}×${f(i.fStatus)}×${f(i.fBag)}</td></tr>`;
      })
      .join('');
    this.panel.innerHTML = `
      <div><b>DEBUG</b> · fps ${this.fps.toFixed(0)} · tick ${sim.tick} · t ${sim.time.toFixed(1)} s ${paused ? '· PAUSED' : ''}</div>
      <div>seed ${sim.seed} · routes ${Object.entries(sim.shuffle.routes).map(([k, v]) => `${k}=${v}`).join(', ')} · locked ${sim.shuffle.lockedDoors.join(', ') || 'none'} · code ${sim.shuffle.safeCode} @ ${sim.shuffle.codeNote}</div>
      <div>player (${f(p.pos.x)}, ${f(p.pos.y)}) · ${p.masked ? 'masked' : 'unmasked'} · ${p.inRestricted ? 'restricted' : 'public'} · ${p.crouch ? 'crouch' : p.sprinting ? 'sprint' : 'walk'} · escorts ${p.escorts}</div>
      <table><tr><th>observer</th><th>state</th><th>sus</th><th>rate</th><th>dist</th><th>why</th><th>dist×move×status×bag</th></tr>${rows}</table>
      <div class="dim">fill = 40/s × dist × move × status × bag · drain 15/s after 1.5 s · cells: red solid, orange cover, blue window, green door</div>`;
  }
}
