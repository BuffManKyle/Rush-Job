// Loads the Blender-built kit and stand-in characters (see ASSETS.md "Contract with the game code").
// Everything is optional: if a file or a piece is missing, the renderer falls back to graybox boxes.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import kitUrl from '../../assets/models/kit.glb?url';
import propsUrl from '../../assets/models/props.glb?url';
import glintUrl from '../../assets/models/glint.glb?url';
import gearUrl from '../../assets/models/gear.glb?url';
import playerUrl from '../../assets/models/char_player.glb?url';
import guardUrl from '../../assets/models/char_guard.glb?url';
import civilianUrl from '../../assets/models/char_civilian.glb?url';

export type CharKind = 'player' | 'guard' | 'civilian';

export interface CharInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  meshes: THREE.Mesh[];
  /** Attach points by role (hand_L, hand_R, spine, ...) resolved to this clone's bones. */
  bones: Record<string, THREE.Object3D>;
}

/** Arm chain (upper arm, forearm, hand) for a hand bone, by node name. */
function armChain(scene: THREE.Object3D, hand: string): string[] {
  const h = scene.getObjectByName(hand);
  if (!h) return [];
  const out = [h.name];
  if (h.parent) out.push(h.parent.name);
  if (h.parent?.parent) out.push(h.parent.parent.name);
  return out;
}

function attachMap(scene: THREE.Object3D): Record<string, string> {
  let map: Record<string, string> = { hand_L: 'hand_L', hand_R: 'hand_R', spine: 'spine' };
  scene.traverse((o) => {
    const raw = o.userData.rj_attach;
    if (!raw) return;
    try {
      map = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      /* keep defaults */
    }
  });
  return map;
}

/**
 * A copy of `base` with the given bones held still in `pose`'s first frame (arms down, holding a bag),
 * so the legs keep the walk/run cadence while the bag arm hangs.
 */
function holdArms(base: THREE.AnimationClip, pose: THREE.AnimationClip, bones: string[], tag: string): THREE.AnimationClip {
  const held = new Set(bones);
  const tracks = base.tracks.filter((t) => !held.has(t.name.split('.')[0])).map((t) => t.clone());
  for (const b of bones) {
    const src = pose.tracks.find((t) => t.name === `${b}.quaternion`);
    if (src) tracks.push(new THREE.QuaternionKeyframeTrack(src.name, [0], Array.from(src.values.slice(0, 4))));
  }
  return new THREE.AnimationClip(`${base.name}@${tag}`, base.duration, tracks);
}

export class Kit {
  private pieces = new Map<string, THREE.Object3D>();
  private chars = new Map<CharKind, GLTF>();
  private clipCache = new Map<CharKind, THREE.AnimationClip[]>();
  private attachCache = new Map<CharKind, Record<string, string>>();

  /** All clips for a character kind, plus "@L" / "@LR" variants with one or both arms holding a bag. */
  private clipsFor(kind: CharKind, g: GLTF): THREE.AnimationClip[] {
    let clips = this.clipCache.get(kind);
    if (clips) return clips;
    const map = attachMap(g.scene);
    this.attachCache.set(kind, map);
    clips = g.animations.map((c) => {
      const k = c.clone();
      k.name = c.name.replace(/\.\d+$/, '');
      return k;
    });
    const pose = clips.find((c) => c.name === 'idle');
    const L = armChain(g.scene, map.hand_L);
    const R = armChain(g.scene, map.hand_R);
    if (pose && L.length && R.length) {
      const extra: THREE.AnimationClip[] = [];
      for (const c of clips) {
        if (!['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'interact'].includes(c.name)) continue;
        extra.push(holdArms(c, pose, L, 'L'), holdArms(c, pose, [...L, ...R], 'LR'));
      }
      clips = [...clips, ...extra];
    }
    this.clipCache.set(kind, clips);
    return clips;
  }

  addLibrary(gltf: GLTF): void {
    for (const child of gltf.scene.children) this.pieces.set(child.name, child);
  }
  addChar(kind: CharKind, gltf: GLTF): void {
    this.chars.set(kind, gltf);
  }

  has(name: string): boolean {
    return this.pieces.has(name);
  }

  /** The piece's node (shared; don't mutate). */
  piece(name: string): THREE.Object3D | null {
    return this.pieces.get(name) ?? null;
  }

  /** A deep clone of a piece, safe to move and animate. Materials stay shared. */
  clone(name: string): THREE.Object3D | null {
    const p = this.pieces.get(name);
    if (!p) return null;
    const c = p.clone(true);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }

  /**
   * Every mesh under a piece with its transform relative to the piece root, for instancing.
   * Children named in `skip` are left out (e.g. a door leaf that animates separately).
   */
  meshesOf(name: string, skip: string[] = []): { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] {
    const p = this.pieces.get(name);
    if (!p) return [];
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
    const rootInv = new THREE.Matrix4();
    p.updateMatrixWorld(true);
    rootInv.copy(p.matrixWorld).invert();
    p.traverse((o) => {
      if (skip.includes(o.name)) return;
      let hidden = false;
      for (let q: THREE.Object3D | null = o; q && q !== p; q = q.parent) if (skip.includes(q.name)) hidden = true;
      const m = o as THREE.Mesh;
      if (!m.isMesh || hidden) return;
      out.push({ geometry: m.geometry, material: m.material, local: new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld) });
    });
    return out;
  }

  /** A character with its own skeleton, mixer and named clips. Faces +Z (glTF front). */
  character(kind: CharKind): CharInstance | null {
    const g = this.chars.get(kind);
    if (!g) return null;
    const root = SkeletonUtils.clone(g.scene);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false; // skinned bounds don't follow the animation
        meshes.push(m);
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of this.clipsFor(kind, g)) if (!actions.has(clip.name)) actions.set(clip.name, mixer.clipAction(clip));
    const bones: Record<string, THREE.Object3D> = {};
    for (const [role, name] of Object.entries(this.attachCache.get(kind) ?? {})) {
      const b = root.getObjectByName(name);
      if (b) bones[role] = b;
    }
    return { root, mixer, actions, current: '', meshes, bones };
  }
}

export async function loadKit(onProgress?: (done: number, total: number) => void): Promise<Kit | null> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const kit = new Kit();
  const libs = [kitUrl, propsUrl, glintUrl, gearUrl];
  const chars: [CharKind, string][] = [
    ['player', playerUrl],
    ['guard', guardUrl],
    ['civilian', civilianUrl],
  ];
  const total = libs.length + chars.length;
  let done = 0;
  const tick = () => onProgress?.(++done, total);
  try {
    await Promise.all([
      ...libs.map((u) =>
        loader.loadAsync(u).then((g) => {
          kit.addLibrary(g);
          tick();
        }),
      ),
      ...chars.map(([k, u]) =>
        loader.loadAsync(u).then((g) => {
          kit.addChar(k, g);
          tick();
        }),
      ),
    ]);
    return kit;
  } catch (e) {
    console.warn('[kit] failed to load, using graybox', e);
    return null;
  }
}

/** Crossfade a character to a clip by name (no-op if already playing or missing). */
export function play(c: CharInstance, name: string, fade = 0.2): void {
  if (c.current === name) return;
  const next = c.actions.get(name) ?? c.actions.get(name.split('@')[0]) ?? c.actions.get('idle');
  if (!next) return;
  const prev = c.actions.get(c.current);
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (prev && prev !== next) prev.fadeOut(fade);
  c.current = name;
}
