// The street block around a heist (owner: rj-street): neighbour buildings, street furniture, parked
// cars and road paint from the Tiled `decor` layer (see tools/level/glint_street.py for the format),
// plus far-side curbs, the street running on past the map edges, and soft light pools under
// streetlights and lit shop windows. View only: collision for solid decor comes from the sim, which
// reads decor rectangles as ordinary props.
//
// Draw calls: everything static is merged into one mesh per material (about 40 draws for ~120
// objects). The buildings across the street are their own merged group, squashed to a stub while
// the player is on the far side of the road, the same way the cutaway sinks walls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import glintTmj from '../../levels/glint.tmj?raw';
import { T } from '../tuning';
import type { Sim } from '../sim/sim';
import type { Kit } from './kit';

const SOURCES = [glintTmj];

interface TProp {
  name: string;
  value: unknown;
}
interface TObj {
  name: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  polyline?: { x: number; y: number }[];
  properties?: TProp[];
}
interface Decor {
  piece: string;
  x: number;
  z: number;
  rot: number;
  far: boolean; // across the street (cut away when the player is over there)
}

/** Decor placements for this level, read from the raw map whose title matches. */
function decorFor(sim: Sim): Decor[] {
  for (const raw of SOURCES) {
    const map = JSON.parse(raw) as { tilewidth: number; properties?: TProp[]; layers: { name: string; objects?: TObj[] }[] };
    const title = map.properties?.find((p) => p.name === 'title')?.value;
    if (title !== sim.level.title) continue;
    const px = map.tilewidth;
    const out: Decor[] = [];
    const roadSouth = streetRows(sim).south;
    for (const l of map.layers) {
      if (l.name !== 'decor') continue;
      for (const o of l.objects ?? []) {
        const p: Record<string, unknown> = {};
        for (const q of o.properties ?? []) p[q.name] = q.value;
        const piece = String(p.piece ?? '');
        const rot = (Number(p.rot ?? 0) * Math.PI) / 180;
        if (!piece) continue;
        if (o.polyline) {
          const step = Number(p.step ?? 1);
          for (let i = 0; i + 1 < o.polyline.length; i++) {
            const a = o.polyline[i];
            const b = o.polyline[i + 1];
            const ax = (o.x + a.x) / px;
            const az = (o.y + a.y) / px;
            const len = Math.hypot(b.x - a.x, b.y - a.y) / px;
            const dx = (b.x - a.x) / px / len;
            const dz = (b.y - a.y) / px / len;
            for (let s = step / 2; s < len; s += step) out.push({ piece, x: ax + dx * s, z: az + dz * s, rot, far: false });
          }
        } else if (o.point) {
          out.push({ piece, x: o.x / px, z: o.y / px, rot, far: false });
        } else {
          const x = (o.x + o.width / 2) / px;
          const z = (o.y + o.height / 2) / px;
          out.push({ piece, x, z, rot, far: piece.startsWith('bldg_') && o.y / px >= roadSouth });
        }
      }
    }
    return out;
  }
  return [];
}

/** First and last asphalt rows (the road), found from the floor tiles. */
function streetRows(sim: Sim): { north: number; south: number } {
  const { level } = sim;
  let north = -1;
  let south = -1;
  for (let z = 0; z < level.h; z++) {
    let n = 0;
    for (let x = 0; x < level.w; x++) if (level.floor[z * level.w + x] === 'floor_asphalt') n++;
    if (n > level.w / 2) {
      if (north < 0) north = z;
      south = z + 1;
    }
  }
  return { north, south };
}

/** Radial falloff texture for additive light pools. */
function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StreetView {
  private far = new THREE.Group();
  private farCut = 1;
  private farZ = Infinity; // the far row's buildings start at this z
  readonly decorCount: number;

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
    private kit: Kit,
  ) {
    const decor = decorFor(sim);
    this.decorCount = decor.length;
    const near: Decor[] = [];
    const far: Decor[] = [];
    for (const d of decor) (d.far ? far : near).push(d);
    this.farZ = Math.min(...far.map((d) => d.z - 6), Infinity);
    near.push(...this.offMapFloors(), ...this.farCurbs());
    const g = new THREE.Group();
    g.name = 'street';
    this.merge(near, g, true);
    this.merge(far, this.far, true);
    scene.add(g, this.far);
    this.ground();
    this.pools(decor);
  }

  /** One mesh per material for all of `list`. */
  private merge(list: Decor[], into: THREE.Group, shadows: boolean): void {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const missing = new Set<string>();
    for (const d of list) {
      const parts = this.kit.meshesOf(d.piece);
      if (!parts.length) {
        missing.add(d.piece);
        continue;
      }
      m.compose(new THREE.Vector3(d.x, 0, d.z), q.setFromAxisAngle(up, d.rot), one);
      for (const p of parts) {
        const mat = Array.isArray(p.material) ? p.material[0] : p.material;
        const geo = p.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, p.local));
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!byMat.has(mat)) byMat.set(mat, []);
        byMat.get(mat)!.push(geo);
      }
    }
    if (missing.size) console.warn('[street] pieces not in the kit:', [...missing].join(', '));
    // Flat-coloured, opaque, non-emissive materials (most of the palette) collapse into one
    // vertex-coloured material, so the whole street is a dozen draws instead of ~60.
    const flat = new THREE.MeshStandardMaterial({ name: 'RJ_StreetFlat', vertexColors: true, roughness: 0.75, metalness: 0.05 });
    const paint = new THREE.MeshStandardMaterial({ name: 'RJ_PaintFlat', vertexColors: true, roughness: 0.8 });
    for (const [mat, geos] of [...byMat]) {
      const s = mat as THREE.MeshStandardMaterial;
      if (!s.isMeshStandardMaterial || s.map || s.transparent || s.emissive.getHex() !== 0) continue;
      const to = mat.name.startsWith('RJ_Paint') ? paint : flat;
      for (const geo of geos) {
        const n = geo.attributes.position.count;
        const c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) c.set([s.color.r, s.color.g, s.color.b], i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      byMat.delete(mat);
      if (!byMat.has(to)) byMat.set(to, []);
      byMat.get(to)!.push(...geos);
    }
    for (const [mat, geos] of byMat) {
      // a material can come from pieces with and without UVs: make the attribute sets match
      const textured = !!(mat as THREE.MeshStandardMaterial).map;
      for (const geo of geos) {
        if (!textured) geo.deleteAttribute('uv');
        else if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
      }
      const merged = mergeGeometries(geos, false);
      if (!merged) console.warn('[street] could not merge', mat.name);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      if (mat.name.startsWith('RJ_Paint')) {
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -2;
        mat.polygonOffsetUnits = -2;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows && !mat.name.startsWith('RJ_Paint') && !mat.transparent;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = into === this.far; // static unless it's the cut row
      mesh.updateMatrix();
      into.add(mesh);
    }
  }

  /** Curbs on the far sidewalk (asphalt to the north): the kit curb turned 180 degrees. */
  private farCurbs(): Decor[] {
    const { level } = this.sim;
    const out: Decor[] = [];
    for (let z = 1; z < level.h; z++)
      for (let x = 0; x < level.w; x++)
        if (level.floor[z * level.w + x] === 'floor_sidewalk' && level.floor[(z - 1) * level.w + x] === 'floor_asphalt')
          out.push({ piece: 'curb', x: x + 0.5, z: z + 0.5, rot: Math.PI, far: false });
    return out;
  }

  /** The street keeps going past both map edges: copy the edge columns' floors 30 m outward. */
  private offMapFloors(): Decor[] {
    const { level } = this.sim;
    const out: Decor[] = [];
    const reach = 30;
    for (const [edge, dir] of [
      [0, -1],
      [level.w - 1, 1],
    ] as const) {
      for (let z = 0; z < level.h; z++) {
        const f = level.floor[z * level.w + edge];
        if (f !== 'floor_sidewalk' && f !== 'floor_asphalt') continue;
        const north = z > 0 ? level.floor[(z - 1) * level.w + edge] : '';
        const south = z + 1 < level.h ? level.floor[(z + 1) * level.w + edge] : '';
        for (let k = 1; k <= reach; k++) {
          const x = edge + dir * k + 0.5;
          out.push({ piece: f, x, z: z + 0.5, rot: 0, far: false });
          if (f === 'floor_sidewalk' && south === 'floor_asphalt') out.push({ piece: 'curb', x, z: z + 0.5, rot: 0, far: false });
          if (f === 'floor_sidewalk' && north === 'floor_asphalt') out.push({ piece: 'curb', x, z: z + 0.5, rot: Math.PI, far: false });
        }
      }
    }
    return out;
  }

  /** A dark ground under everything, so nothing shows the void between buildings at the edges. */
  private ground(): void {
    const { level } = this.sim;
    const geo = new THREE.PlaneGeometry(level.w + 140, level.h + 120).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 1 }));
    mesh.position.set(level.w / 2, -0.03, level.h / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /**
   * Fake light: additive sodium pools on the ground under each streetlight and in front of lit shop
   * windows. One instanced draw; no real lights.
   */
  private pools(decor: Decor[]): void {
    const spots: { x: number; z: number; sx: number; sz: number; k: number }[] = [];
    for (const d of decor) {
      const c = Math.cos(d.rot);
      const s = Math.sin(d.rot);
      if (d.piece === 'streetlight') {
        // lamp head is 1.6 m in front (+Z) of the pole
        spots.push({ x: d.x + s * 1.6, z: d.z + c * 1.6, sx: 8, sz: 8, k: 0.32 });
      } else if (d.piece.startsWith('bldg_') && !d.piece.startsWith('bldg_rear')) {
        const cells = (this.kit.piece(d.piece)?.userData.rj_cells as number[] | undefined) ?? [4, 4];
        const out = cells[1] / 2 + 1.4;
        spots.push({ x: d.x + s * out, z: d.z + c * out, sx: cells[0] * 1.05, sz: 3.0, k: 0.16 });
      }
    }
    // the shop's own storefront windows
    const { level, grid } = this.sim;
    const front = grid.doors.find((dd) => dd.id === 'front_door');
    if (front)
      for (let x = 0; x < level.w; x++)
        if (level.walls[front.cy * level.w + x] === 2) spots.push({ x: x + 0.5, z: front.cy + 2.2, sx: 2.4, sz: 3.0, k: 0.14 });
    if (!spots.length) return;
    const mat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: 0xffa04a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    spots.forEach((p, i) => {
      im.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 0.03, p.z), new THREE.Quaternion(), new THREE.Vector3(p.sx, 1, p.sz)));
      im.setColorAt(i, col.setScalar(p.k));
    });
    im.renderOrder = 1;
    im.frustumCulled = false;
    this.scene.add(im);
  }

  update(pp: THREE.Vector3, dt: number, cutaway: boolean): void {
    // squash the far row while the player is close enough in front of it to be hidden
    const want = cutaway && pp.z > this.farZ - T.view.cutDepth ? T.view.wallStub / 4.5 : 1;
    const k = 1 - Math.exp(-8 * dt);
    if (Math.abs(this.farCut - want) < 0.002) return;
    this.farCut += (want - this.farCut) * k;
    this.far.scale.y = Math.max(0.02, this.farCut);
  }
}
