// Dress a character for a loadout: the mask (masks.glb on the Head bone), weapon in the right hand, gadgets on
// the belt, vest on the chest. Used by the loadout screen (and the mask in game). Vests come from vests.glb (primitive boxes if it's missing).
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
  const piece = wearOnBone(ch, kit, MASK_PIECE[mask], 'Head', 'rj_worn_mask');
  if (!piece) {
    tintMask(ch, mask);
    return null;
  }
  for (const m of ch.meshes) if ((m.material as THREE.Material).name.startsWith('RJ_Mask')) m.visible = false;
  return piece;
}

/**
 * Attach a piece authored in char_player model space (rest pose, feet at 0, +Z forward) to a bone:
 * the skeleton's bind inverse for that bone moves it into bone space (ASSETS.md "Masks" / "Vests").
 */
function wearOnBone(ch: CharInstance, kit: Kit | null, pieceName: string, boneName: string, tag: string): THREE.Object3D | null {
  const bone = ch.root.getObjectByName(boneName);
  const skinned = ch.meshes.find((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh | undefined;
  const piece = kit?.clone(pieceName);
  const idx = bone && skinned ? skinned.skeleton.bones.indexOf(bone as THREE.Bone) : -1;
  if (!piece || !bone || !skinned || idx < 0) return null;
  piece.applyMatrix4(skinned.skeleton.boneInverses[idx]);
  piece.name = tag;
  piece.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  bone.add(piece);
  return piece;
}

const VEST_MATERIAL: Record<Loadout['armor'], string | null> = { suit: null, light_vest: 'RJ_Vest_light', heavy_vest: 'RJ_Vest_heavy' };

/**
 * Put the loadout's vest on. The vests are skinned into char_player.glb (materials RJ_Vest_light*,
 * RJ_Vest_heavy*, so they bend with the torso): hide every RJ_Vest_ mesh, then show the worn one.
 * On an older rig without them, falls back to primitive boxes. Returns the visible parts (empty for the suit).
 */
export function wearVest(ch: CharInstance, armor: Loadout['armor']): THREE.Object3D[] {
  ch.root.getObjectByName('rj_worn_vest')?.removeFromParent();
  const prefix = VEST_MATERIAL[armor];
  const parts: THREE.Object3D[] = [];
  let skinned = false;
  for (const m of ch.meshes) {
    const name = (m.material as THREE.Material).name;
    if (!name.startsWith('RJ_Vest_')) continue;
    skinned = true;
    m.visible = !!prefix && name.startsWith(prefix);
    if (m.visible) parts.push(m);
  }
  if (!prefix || skinned) return parts;
  const v = vest(armor);
  if (!v) return parts;
  v.name = 'rj_worn_vest';
  v.position.set(0, CHEST.y, -0.02);
  ch.root.add(v);
  return [v];
}

/**
 * Close a hand around what it holds: char_player has blend shapes `fist_R` / `fist_L` (no finger bones),
 * and each skinned primitive carries its own dictionary, so set it on every mesh that has it.
 */
export function setFist(ch: CharInstance, side: 'R' | 'L', on: boolean): void {
  const key = `fist_${side}`;
  for (const m of ch.meshes) {
    const i = m.morphTargetDictionary?.[key];
    if (i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = on ? 1 : 0;
  }
}

/**
 * Hold an item in the right hand. char_player has a measured `hand_R_grip` node (palm origin, world scale 1,
 * ASSETS.md "Gear") and every held piece in gear.glb uses the same convention, so it goes on with an identity
 * transform. Rigs without the grip fall back to the hand bone plus a fitted rotation.
 */
export function holdInHand(ch: CharInstance, item: THREE.Object3D): void {
  const grip = ch.root.getObjectByName('hand_R_grip');
  if (grip) {
    grip.add(item);
    item.position.set(0, 0, 0);
    item.rotation.set(0, 0, 0);
    item.scale.setScalar(1);
    return;
  }
  const hand = ch.bones.hand_R;
  if (!hand) return;
  hand.add(item);
  hand.updateWorldMatrix(true, false);
  const ws = hand.getWorldScale(new THREE.Vector3()).x;
  const rs = ch.root.getWorldScale(new THREE.Vector3()).x;
  item.scale.setScalar(rs / Math.max(1e-6, ws));
  item.rotation.copy(HAND.rot);
  item.position.set(0, 0, 0);
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

/** Fallback vest: primitive boxes. */
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
  vest: THREE.Object3D[];
}

export function undress(o: Outfit | null): void {
  if (!o) return;
  o.weapon?.removeFromParent();
  o.belt.forEach((b) => b?.removeFromParent());
  // skinned vest meshes belong to the character: wearVest just toggles them; only a fallback box gets removed
  for (const v of o.vest) if (v.name === 'rj_worn_vest') v.removeFromParent();
}

export function dress(ch: CharInstance, kit: Kit | null, l: Loadout): Outfit {
  wearMask(ch, kit, l.mask);
  const out: Outfit = { weapon: null, belt: [null, null], vest: [] };

  const w = gearModel(kit, WEAPONS[l.weapon].model);
  holdInHand(ch, w);
  out.weapon = w.parent ? w : null;
  setFist(ch, 'R', !!out.weapon);

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

  out.vest = wearVest(ch, l.armor);
  return out;
}
