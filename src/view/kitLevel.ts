// Builds the level from Blender kit pieces (ASSETS.md "Tiled → kit mapping") and keeps the
// stateful bits (doors, cases, safe, cameras, bags) in sync with the sim. Read-only on the sim.
import * as THREE from 'three';
import { T } from '../tuning';
import { F_COVER, F_PROP, F_WALL, F_WINDOW } from '../sim/grid';
import type { Sim } from '../sim/sim';
import type { Kit } from './kit';

const HALF_PI = Math.PI / 2;

interface CutCell {
  x: number;
  z: number;
  rot: number;
  full: number; // natural height of the piece
  cur: number;
}

interface CutSet {
  parts: { im: THREE.InstancedMesh; local: THREE.Matrix4 }[];
  cells: CutCell[];
}

interface CutObject {
  obj: THREE.Object3D;
  x: number;
  z: number;
  cur: number;
}

export class KitLevel {
  private sets: CutSet[] = [];
  private cutObjects: CutObject[] = [];
  private doors = new Map<string, { group: THREE.Object3D; leaf: THREE.Object3D | null; cut: CutObject }>();
  private cases = new Map<string, { intact: THREE.Object3D; smashed: THREE.Object3D | null; tall: boolean }>();
  private safes = new Map<string, { door: THREE.Object3D | null; loot: THREE.Object3D | null }>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
    private kit: Kit,
  ) {
    this.buildGrid();
    this.buildDoors();
    this.buildProps();
  }

  /** Graybox stays for anything the kit doesn't cover. */
  static covers(kit: Kit): boolean {
    return ['wall_full_int', 'wall_full_ext', 'floor_showroom', 'doorway_full_int', 'window_full_ext'].every((n) => kit.has(n));
  }

  private isBuildingFloor(name: string): boolean {
    return name === 'floor_showroom' || name === 'floor_back';
  }

  /** A wall is exterior if it touches anything that isn't building floor or wall. */
  private exterior(x: number, z: number): boolean {
    const { level, grid } = this.sim;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!grid.inside(nx, nz)) return true;
      const i = nz * level.w + nx;
      if (grid.flags[i] & (F_WALL | F_WINDOW)) continue;
      if (grid.doorCell(nx, nz)) continue;
      if (!this.isBuildingFloor(level.floor[i])) return true;
    }
    return false;
  }

  /** 0 if the wall run goes east-west through this cell, 90° if north-south. */
  private runRot(x: number, z: number): number {
    const g = this.sim.grid;
    const solid = (cx: number, cz: number) => g.inside(cx, cz) && (g.flags[cz * g.w + cx] & (F_WALL | F_WINDOW)) !== 0;
    return solid(x - 1, z) || solid(x + 1, z) ? 0 : HALF_PI;
  }

  private addSet(piece: string, cells: CutCell[], skip: string[] = []): void {
    if (!cells.length) return;
    const parts = this.kit.meshesOf(piece, skip).map(({ geometry, material, local }) => {
      const im = new THREE.InstancedMesh(geometry, material, cells.length);
      im.castShadow = true;
      im.receiveShadow = true;
      this.scene.add(im);
      return { im, local };
    });
    const set = { parts, cells };
    this.sets.push(set);
    this.writeSet(set);
  }

  private writeSet(set: CutSet): void {
    set.cells.forEach((c, i) => {
      this.q.setFromAxisAngle(this.up, c.rot);
      this.m.compose(this.v.set(c.x + 0.5, 0, c.z + 0.5), this.q, this.s.set(1, Math.max(0.001, c.cur / c.full), 1));
      for (const p of set.parts) p.im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(this.m, p.local));
    });
    for (const p of set.parts) p.im.instanceMatrix.needsUpdate = true;
  }

  private buildGrid(): void {
    const { level, grid } = this.sim;
    const H = T.view.wallHeight;
    const floors = new Map<string, CutCell[]>();
    const curbs: CutCell[] = [];
    const walls = { wall_full_int: [] as CutCell[], wall_full_ext: [] as CutCell[], window_full_ext: [] as CutCell[], window_full_int: [] as CutCell[], window_shop_full: [] as CutCell[] };
    const front = grid.doors.find((d) => d.id === 'front_door');
    for (let z = 0; z < level.h; z++)
      for (let x = 0; x < level.w; x++) {
        const i = z * level.w + x;
        const f = grid.flags[i];
        const fl = level.floor[i];
        if (fl) {
          const piece = fl === 'floor_back' ? 'floor_lino' : this.kit.has(fl) ? fl : 'floor_concrete';
          if (!floors.has(piece)) floors.set(piece, []);
          floors.get(piece)!.push({ x, z, rot: 0, full: 1, cur: 1 });
          if (fl === 'floor_sidewalk' && level.floor[(z + 1) * level.w + x] === 'floor_asphalt') curbs.push({ x, z, rot: 0, full: 1, cur: 1 });
        }
        if (f & F_WALL) {
          (this.exterior(x, z) ? walls.wall_full_ext : walls.wall_full_int).push({ x, z, rot: 0, full: H, cur: H });
        } else if (f & F_WINDOW) {
          const shop = front && z === front.cy;
          const piece = shop ? 'window_shop_full' : this.exterior(x, z) ? 'window_full_ext' : 'window_full_int';
          walls[piece].push({ x, z, rot: this.runRot(x, z), full: H, cur: H });
        }
      }
    for (const [piece, cells] of floors) this.addSet(piece, cells);
    this.addSet('curb', curbs);
    for (const [piece, cells] of Object.entries(walls)) this.addSet(piece, cells);

    // Restricted trim: hatched strips along the inside edges of each zone (skipping walls)
    const trims: CutCell[] = [];
    for (const zn of level.zones.filter((q) => q.type === 'restricted')) {
      const x0 = Math.round(zn.x);
      const z0 = Math.round(zn.y);
      const x1 = Math.round(zn.x + zn.w) - 1;
      const z1 = Math.round(zn.y + zn.h) - 1;
      const add = (x: number, z: number, rot: number) => {
        if (!grid.inside(x, z) || grid.flags[z * grid.w + x] & (F_WALL | F_WINDOW)) return;
        trims.push({ x, z, rot, full: 1, cur: 1 });
      };
      for (let x = x0; x <= x1; x++) {
        add(x, z1, 0);
        add(x, z0, Math.PI);
      }
      for (let z = z0; z <= z1; z++) {
        add(x0, z, -HALF_PI);
        add(x1, z, HALF_PI);
      }
    }
    this.addSet('trim_restricted', trims);
  }

  private buildDoors(): void {
    const H = T.view.wallHeight;
    const frames = { doorway_full_int: [] as CutCell[], doorway_full_ext: [] as CutCell[] };
    for (const d of this.sim.grid.doors) {
      const rot = d.axis === 'x' ? 0 : HALF_PI;
      const ext = d.id === 'front_door' || d.id === 'back_door';
      frames[ext ? 'doorway_full_ext' : 'doorway_full_int'].push({ x: d.cx, z: d.cy, rot, full: H, cur: H });
      const kind = d.id === 'front_door' ? 'door_glass' : ['safe_room_door', 'closet_door', 'back_door'].includes(d.id) ? 'door_metal' : 'door_wood';
      const g = this.kit.clone(kind);
      if (!g) continue;
      g.position.set(d.cx + 0.5, 0, d.cy + 0.5);
      g.rotation.y = rot;
      this.scene.add(g);
      const cut = { obj: g, x: d.cx, z: d.cy, cur: 1 };
      this.cutObjects.push(cut);
      this.doors.set(d.id, { group: g, leaf: g.getObjectByName(`${kind}_leaf`) ?? null, cut });
    }
    for (const [piece, cells] of Object.entries(frames)) this.addSet(piece, cells);

    // shop sign over the front door, on the street side
    const front = this.sim.grid.doors.find((d) => d.id === 'front_door');
    const sign = front ? this.kit.clone('sign_glint') : null;
    if (front && sign) {
      sign.position.set(front.cx + 0.5, 0, front.cy + 0.5);
      this.scene.add(sign);
      this.cutObjects.push({ obj: sign, x: front.cx, z: front.cy, cur: 1 });
    }
  }

  private place(name: string, x: number, z: number, rot = 0, y = 0): THREE.Object3D | null {
    const o = this.kit.clone(name);
    if (!o) return null;
    o.position.set(x, y, z);
    o.rotation.y = rot;
    this.scene.add(o);
    return o;
  }

  private buildProps(): void {
    const { level, grid } = this.sim;
    const wallAt = (x: number, z: number) => !grid.inside(x, z) || (grid.flags[z * grid.w + x] & (F_WALL | F_WINDOW)) !== 0;
    for (const p of level.props) {
      const cx = p.x + p.w / 2;
      const cz = p.y + p.h / 2;
      switch (p.type) {
        case 'counter': {
          const n = Math.round(p.w);
          for (let i = 0; i < n; i++) {
            const piece = i === Math.floor(n / 2) ? 'counter_register' : i % 3 === 1 ? 'counter_glass' : 'counter';
            this.place(piece, p.x + i + 0.5, cz);
          }
          this.place('counter_end', p.x + 0.5, cz, Math.PI);
          this.place('counter_end', p.x + n - 0.5, cz, 0);
          break;
        }
        case 'case': {
          const x = Math.floor(p.x);
          const z = Math.floor(p.y);
          // against a wall: the tall case, back to the wall
          let rot: number | null = null;
          if (wallAt(x, z - 1)) rot = 0;
          else if (wallAt(x - 1, z)) rot = HALF_PI;
          else if (wallAt(x + 1, z)) rot = -HALF_PI;
          else if (wallAt(x, z + 1)) rot = Math.PI;
          if (rot !== null && this.kit.has('display_case_tall')) {
            const o = this.place('display_case_tall', cx, cz, rot)!;
            this.cases.set(p.id, { intact: o, smashed: null, tall: true });
          } else {
            const intact = this.place('display_case', cx, cz);
            const smashed = this.place('display_case_smashed', cx, cz);
            if (intact) this.cases.set(p.id, { intact, smashed, tall: false });
          }
          break;
        }
        case 'desk':
          this.place('desk_office', cx, cz);
          this.place('office_chair', cx, cz - 0.9);
          break;
        case 'security_desk':
          this.place('security_desk', cx, cz);
          this.place('office_chair', cx, cz + 0.9, Math.PI);
          break;
        case 'safe': {
          const o = this.place('safe', cx, cz);
          if (o) this.safes.set(p.id, { door: o.getObjectByName('safe_door') ?? null, loot: o.getObjectByName('safe_loot') ?? null });
          break;
        }
        case 'van':
          this.place('van', cx, cz);
          break;
      }
    }
    const note = level.markers.find((m) => m.id === this.sim.shuffle.codeNote);
    if (note) {
      const onProp = grid.flags[Math.floor(note.y) * level.w + Math.floor(note.x)] & (F_PROP | F_COVER);
      this.place('sticky_note', note.x, note.y, 0.3, onProp ? 0.78 : 0);
    }
  }

  /** Security camera model for an observer root (lens +X at rotation 0, same as the sim yaw). */
  cameraModel(): THREE.Object3D | null {
    return this.kit.clone('security_camera');
  }

  bagModel(weight: 'light' | 'medium' | 'heavy'): THREE.Object3D | null {
    return this.kit.clone(`bag_${weight}`);
  }

  update(pp: THREE.Vector3, dt: number, cutaway: boolean): void {
    const sim = this.sim;
    // cutaway: same region rule as the graybox
    const k = 1 - Math.exp(-10 * dt);
    const isCut = (x: number, z: number) => {
      const ahead = z + 0.5 - pp.z;
      return cutaway && ahead > -0.6 && ahead < T.view.cutDepth && Math.abs(x + 0.5 - pp.x) < T.view.cutRadius;
    };
    for (const set of this.sets) {
      if (set.cells[0]?.full === 1) continue; // floors and trim never cut
      let dirty = false;
      for (const c of set.cells) {
        const want = isCut(c.x, c.z) ? T.view.wallStub : c.full;
        if (Math.abs(c.cur - want) > 0.005) {
          c.cur += (want - c.cur) * k;
          dirty = true;
        }
      }
      if (dirty) this.writeSet(set);
    }
    for (const o of this.cutObjects) {
      const want = isCut(o.x, o.z) ? T.view.wallStub / T.view.wallHeight : 1;
      o.cur += (want - o.cur) * k;
      o.obj.scale.y = Math.max(0.001, o.cur);
    }

    for (const d of sim.grid.doors) {
      const v = this.doors.get(d.id);
      if (v?.leaf) v.leaf.rotation.y = d.swing * HALF_PI * 0.95;
    }
    for (const c of sim.cases) {
      const v = this.cases.get(c.id);
      if (!v) continue;
      if (v.tall) {
        const glass = v.intact.getObjectByName('display_case_tall_glass');
        const jewels = v.intact.getObjectByName('display_case_tall_jewels');
        if (glass) glass.visible = !c.smashed;
        if (jewels) jewels.visible = !c.looted;
      } else {
        v.intact.visible = !c.smashed;
        if (v.smashed) {
          v.smashed.visible = c.smashed;
          const jewels = v.smashed.getObjectByName('display_case_smashed_jewels');
          if (jewels) jewels.visible = !c.looted;
        }
      }
    }
    for (const sf of sim.safes) {
      const v = this.safes.get(sf.id);
      if (!v) continue;
      if (v.door) v.door.rotation.y += ((sf.open ? -HALF_PI * 1.1 : 0) - v.door.rotation.y) * k;
      if (v.loot) v.loot.visible = !sf.looted;
    }
  }
}
