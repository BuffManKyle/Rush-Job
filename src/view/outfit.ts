// Dress a character for a loadout: the mask (masks.glb on the Head bone), weapon in the right hand, gadgets on
// the belt, vest on the chest. Used by the loadout screen (and the mask in game). Vests are primitives until rj-assets makes real ones.
import * as THREE from 'three';
import { GADGETS, MASKS, WEAPONS, type Loadout } from '../data/loadout';
import type { CharInstance, Kit } from './kit';
import { HAND } from './gear';

/** Belt positions in character-root space (the root faces +Z, so the character's right hip is -X). */
export const BELT: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.24, 0.9, 0.06), new THREE.Vector3(0.24, 0.9, 0.06)];
// player rig (chibi): hips 0.86 m, neck 1.30 m, so the chest centre is about 1.1 m
export const CHEST = new THREE.Vector3(0, 1.1, 0.14);

/** Piece name in masks.glb for each loadout mask (rj-assets, ASSETS.md "Masks"). */
const MASK_PIECE: Record<Loadout['mask'], string> = { plain: 'mask_regular', rumor: 'mask_rumor', suit: 'mask_suit', objector: 'mask_objector', headline: 'mask_headline' };

/**
 * Put the loadout's mask on the character's head. Real masks come from masks.glb, in the character's
 * model space; the skeleton's bind inverse for Head moves one into the bone. The built-in RJ_Mask mesh
 * is hidden so it doesn't peek through. Without the model, falls back to tinting RJ_Mask.
 * Returns the worn mask object (null on the fallback).
 */
export function wearMask(ch: CharInstance, kit: Kit | null, mask: Loadout['mask']): THREE.Object3D | null {
  ch.root.getObjectByName('rj_worn_mask')?.removeFromParent();
  const head = ch.root.getObjectByName('Head');
  const skinned = ch.meshes.find((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh | undefined;
  const piece = kit?.clone(MASK_PIECE[mask]);
  const idx = head && skinned ? skinned.skeleton.bones.indexOf(head as THREE.Bone) : -1;
  if (!piece || !head || !skinned || idx < 0) {
    tintMask(ch, mask);
    return null;
  }
  piece.applyMatrix4(skinned.skeleton.boneInverses[idx]);
  piece.name = 'rj_worn_mask';
  piece.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  head.add(piece);
  for (const m of ch.meshes) if ((m.material as THREE.Material).name.startsWith('RJ_Mask')) m.visible = false;
  return piece;
}

/** Fallback when masks.glb is missing: tint the built-in RJ_Mask material. */
export function tintMask(ch: CharInstance, mask: Loadout['mask']): void {
  const def = MASKS[mask];
  for (const m of ch.meshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat.name.startsWith('RJ_Mask')) continue;
    if (!mat.userData.own) {
      m.material = mat.clone();
      (m.material as THREE.MeshStandardMaterial).userData.own = true;
    }
    const own = m.material as THREE.MeshStandardMaterial;
    own.color.setHex(def.tint);
    own.emissive.setHex(def.emissive);
  }
}

function vest(kind: Loadout['armor']): THREE.Object3D | null {
  if (kind === 'suit') return null;
  const heavy = kind === 'heavy_vest';
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: heavy ? 0x2a3040 : 0x1d2433, roughness: 0.85 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x0f131c, roughness: 0.9 });
  const w = heavy ? 0.5 : 0.45;
  const d = heavy ? 0.36 : 0.31;
  const h = heavy ? 0.4 : 0.34;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell);
  g.add(body);
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, d * 0.9), strap);
    s.position.set(sx * (w / 2 - 0.07), h / 2 + 0.06, 0);
    g.add(s);
  }
  if (heavy) {
    // plate pouches and a collar: reads as "this one stops rifles"
    for (const sx of [-1, 0, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.05), shell);
      p.position.set(sx * 0.14, -h / 2 + 0.08, d / 2 + 0.02);
      g.add(p);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.6, metalness: 0.3 }));
    plate.position.set(0, 0.05, d / 2 + 0.01);
    g.add(plate);
  } else {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.02), strap);
    panel.position.set(0, 0.04, d / 2 + 0.005);
    g.add(panel);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

function gearModel(kit: Kit | null, name: string): THREE.Object3D {
  const k = kit?.clone(name);
  if (k) return k;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x2fd0c0 }));
  m.castShadow = true;
  return m;
}

/** Everything `dress` added, so it can be swapped out cleanly. */
export interface Outfit {
  weapon: THREE.Object3D | null;
  belt: (THREE.Object3D | null)[];
  vest: THREE.Object3D | null;
}

export function undress(o: Outfit | null): void {
  if (!o) return;
  o.weapon?.removeFromParent();
  o.belt.forEach((b) => b?.removeFromParent());
  o.vest?.removeFromParent();
}

export function dress(ch: CharInstance, kit: Kit | null, l: Loadout): Outfit {
  wearMask(ch, kit, l.mask);
  const out: Outfit = { weapon: null, belt: [null, null], vest: null };

  const hand = ch.bones.hand_R;
  if (hand) {
    const w = gearModel(kit, WEAPONS[l.weapon].model);
    hand.add(w);
    hand.updateWorldMatrix(true, false);
    const ws = hand.getWorldScale(new THREE.Vector3()).x;
    const rs = ch.root.getWorldScale(new THREE.Vector3()).x;
    w.scale.setScalar(rs / Math.max(1e-6, ws));
    w.rotation.copy(HAND.rot);
    out.weapon = w;
  }

  l.gadgets.forEach((id, i) => {
    if (!id) return;
    const m = gearModel(kit, GADGETS[id].model);
    // hang it off the belt: fit the piece into about 22 cm so a body bag and a noisemaker both read
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    const k = 0.22 / Math.max(0.05, size.x, size.y, size.z);
    m.scale.setScalar(Math.min(1, k));
    const holder = new THREE.Group();
    holder.add(m);
    holder.position.copy(BELT[i]);
    holder.rotation.y = i === 0 ? -0.5 : 0.5;
    ch.root.add(holder);
    out.belt[i] = holder;
  });

  const v = vest(l.armor);
  if (v) {
    v.position.set(0, CHEST.y, -0.02);
    ch.root.add(v);
    out.vest = v;
  }
  return out;
}
