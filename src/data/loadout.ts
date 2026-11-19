// Loadout as data (DESIGN.md "Gear, guns & progression"): 1 weapon + 2 gadget slots + armor.
// Gadget behaviour lives in sim/gadgets.ts; numbers live in tuning.ts (T.gadgets, T.armor).
import { T } from '../tuning';

export type WeaponId = 'pistol_silenced' | 'tranq_pistol' | 'smg_compact' | 'shotgun_pump' | 'stun_baton';
export type ArmorId = 'suit' | 'light_vest' | 'heavy_vest';
export type GadgetId = 'noisemaker' | 'glass_cutter' | 'body_bags' | 'ecm_jammer' | 'medkit' | 'lockpick_kit' | 'smoke' | 'c4' | 'keycard_cloner';

/**
 * How a gadget is used:
 * - throw: press its number key to throw it toward the cursor
 * - place: press its number key to set it down at your feet
 * - self: press its number key to use it on yourself
 * - tool: changes an E interaction (glass cutter on cases, lockpick kit on doors, body bags on bodies)
 */
export type GadgetUse = 'throw' | 'place' | 'self' | 'tool';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  /** Charges per job; 0 = unlimited (a tool you keep). */
  charges: number;
  use: GadgetUse;
  unlock: number; // cash price at the shop (not enforced yet: everything is unlocked for testing)
  answers: string; // which approach-matrix rows it opens, shown in the picker
  how: string; // one line on how to use it, shown in the picker
  model: string; // piece name in assets/models/gear.glb, held in hand_R
  /** Not usable at this job (shown greyed out in the picker). */
  unavailable?: string;
}

export const GADGETS: Record<GadgetId, GadgetDef> = {
  noisemaker: {
    id: 'noisemaker',
    name: 'Noisemaker',
    charges: T.gadgets.noisemaker.charges,
    use: 'throw',
    unlock: 10000,
    answers: 'Guard: pull him off his route',
    how: 'Press its key to throw it at the cursor. Guards within earshot walk over to look.',
    model: 'noisemaker',
  },
  glass_cutter: {
    id: 'glass_cutter',
    name: 'Glass cutter',
    charges: 0,
    use: 'tool',
    unlock: 15000,
    answers: 'Display case: open it silently',
    how: `Hold E on a display case: a quiet ${T.gadgets.glassCutter.time} s cut instead of a ${T.noise.smashGlass} m smash. After the alarm you smash for speed.`,
    model: 'glass_cutter',
  },
  body_bags: {
    id: 'body_bags',
    name: 'Body bags',
    charges: T.gadgets.bodyBag.charges,
    use: 'tool',
    unlock: 20000,
    answers: 'Bodies: nobody finds them',
    how: `Hold E on a downed, tied or shot guard (or a shot civilian): ${T.gadgets.bodyBag.time} s. Bagged bodies don't raise the alarm and don't wake up. Answer the pager first.`,
    model: 'body_bag_folded',
  },
  ecm_jammer: {
    id: 'ecm_jammer',
    name: 'ECM jammer',
    charges: T.gadgets.ecm.charges,
    use: 'place',
    unlock: 35000,
    answers: 'Cameras and pagers: off for a while',
    how: `Press its key to set it down. Every camera goes blind and pagers stay quiet for ${T.gadgets.ecm.duration} s.`,
    model: 'ecm_jammer',
  },
  medkit: {
    id: 'medkit',
    name: 'Medkit',
    charges: T.gadgets.medkit.charges,
    use: 'self',
    unlock: 20000,
    answers: 'Loud phase: one full heal',
    how: 'Press its key to heal to full.',
    model: 'medkit',
  },
  lockpick_kit: {
    id: 'lockpick_kit',
    name: 'Lockpick kit',
    charges: 0,
    use: 'tool',
    unlock: 0,
    answers: 'Locked door: pick it in half the time',
    how: `Lockpicking takes ${T.doors.lockpickKitTime} s instead of ${T.doors.lockpickTime} s.`,
    model: 'lockpick_kit',
  },
  smoke: {
    id: 'smoke',
    name: 'Smoke grenade',
    charges: T.gadgets.smoke.charges,
    use: 'throw',
    unlock: 30000,
    answers: 'Loud phase: break line of sight',
    how: `Press its key to throw it at the cursor. Nobody sees or shoots through the cloud for ${T.gadgets.smoke.duration} s.`,
    model: 'smoke_grenade',
  },
  c4: {
    id: 'c4',
    name: 'C4',
    charges: T.gadgets.c4.charges,
    use: 'place',
    unlock: 60000,
    answers: 'Locked door or safe: blow it open (alarm)',
    how: `Press its key next to a locked door or the safe to plant it. It blows ${T.gadgets.c4.fuse} s later and trips the alarm.`,
    model: 'c4',
  },
  keycard_cloner: {
    id: 'keycard_cloner',
    name: 'Keycard cloner',
    charges: 0,
    use: 'tool',
    unlock: 45000,
    answers: 'Keycard doors: copy a card from its holder',
    how: 'Stand near the keycard holder for 3 s.',
    model: 'keycard_cloner',
    unavailable: 'No keycards at Glint & Sons (the Bank has them)',
  },
};

export interface WeaponDef {
  id: WeaponId;
  name: string;
  unlock: number;
  model: string;
  unavailable?: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol_silenced: { id: 'pistol_silenced', name: 'Pocket pistol (silenced)', unlock: 0, model: 'pistol_silenced' },
  tranq_pistol: { id: 'tranq_pistol', name: 'Tranq pistol', unlock: 25000, model: 'tranq_pistol', unavailable: 'Not built yet' },
  smg_compact: { id: 'smg_compact', name: 'Compact SMG', unlock: 40000, model: 'smg_compact', unavailable: 'Not built yet' },
  shotgun_pump: { id: 'shotgun_pump', name: 'Pump shotgun', unlock: 75000, model: 'shotgun_pump', unavailable: 'Not built yet' },
  stun_baton: { id: 'stun_baton', name: 'Stun baton', unlock: 15000, model: 'stun_baton', unavailable: 'Not built yet' },
};

export interface ArmorDef {
  id: ArmorId;
  name: string;
  unlock: number;
  blurb: string;
}

export const ARMORS: Record<ArmorId, ArmorDef> = {
  suit: { id: 'suit', name: 'Tailored suit', unlock: 0, blurb: 'No armor. You look like a customer: casing suspicion builds 20% slower.' },
  light_vest: { id: 'light_vest', name: 'Light vest', unlock: 30000, blurb: `+${T.armor.light_vest.armor} armor, no speed cost.` },
  heavy_vest: { id: 'heavy_vest', name: 'Heavy vest', unlock: 70000, blurb: `+${T.armor.heavy_vest.armor} armor, ${Math.round((1 - T.armor.heavy_vest.speed) * 100)}% slower, and it shows under the suit (no casing bonus).` },
};

export type MaskId = 'plain' | 'rumor' | 'suit' | 'objector' | 'headline';

export interface MaskDef {
  id: MaskId;
  name: string;
  /** Rating that unlocks it (DESIGN.md "Payout and ratings"); null = you start with it. */
  unlock: string | null;
  blurb: string;
  tint: number; // multiplies the RJ_Mask texture
  emissive: number;
}

/** Masks are cosmetic: they reward replaying a job a different way. Tints stand in until rj-assets makes real masks. */
export const MASKS: Record<MaskId, MaskDef> = {
  plain: { id: 'plain', name: 'The Regular', unlock: null, blurb: 'Off the rack. Says nothing, which is the point.', tint: 0xffffff, emissive: 0x000000 },
  rumor: { id: 'rumor', name: 'The Rumor', unlock: 'Ghost', blurb: 'For the job nobody can prove happened.', tint: 0x9aa4b8, emissive: 0x0b1020 },
  suit: { id: 'suit', name: 'The Suit', unlock: 'Professional', blurb: 'No alarm, no fuss, no tie out of place.', tint: 0x2fd0c0, emissive: 0x022a26 },
  objector: { id: 'objector', name: 'Conscientious Objector', unlock: 'Pacifist', blurb: 'Loud, sure. Nobody died, though.', tint: 0xf5d547, emissive: 0x2a2200 },
  headline: { id: 'headline', name: 'The Headline', unlock: 'Loud', blurb: 'Front page, above the fold.', tint: 0xf08a24, emissive: 0x2a1000 },
};

export interface Loadout {
  weapon: WeaponId;
  gadgets: [GadgetId | null, GadgetId | null];
  armor: ArmorId;
  mask: MaskId;
}

export const DEFAULT_LOADOUT: Loadout = { weapon: 'pistol_silenced', gadgets: ['lockpick_kit', 'noisemaker'], armor: 'suit', mask: 'plain' };

/** Everything is unlocked while testing; the shop and job board come later. */
export const UNLOCK_ALL = true;

/** Sanitize a loadout read from storage or a URL (unknown ids fall back to the default). */
export function cleanLoadout(raw: unknown): Loadout {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LOADOUT, gadgets: [...DEFAULT_LOADOUT.gadgets] };
  const r = (raw ?? {}) as Partial<Loadout>;
  const g = Array.isArray(r.gadgets) ? r.gadgets : [];
  const ok = (id: unknown): GadgetId | null => (typeof id === 'string' && id in GADGETS && !GADGETS[id as GadgetId].unavailable ? (id as GadgetId) : null);
  const g0 = ok(g[0]);
  const g1 = ok(g[1]);
  return {
    weapon: typeof r.weapon === 'string' && r.weapon in WEAPONS && !WEAPONS[r.weapon as WeaponId].unavailable ? (r.weapon as WeaponId) : DEFAULT_LOADOUT.weapon,
    gadgets: [g0, g1 === g0 ? null : g1],
    armor: typeof r.armor === 'string' && r.armor in ARMORS ? (r.armor as ArmorId) : DEFAULT_LOADOUT.armor,
    mask: typeof r.mask === 'string' && r.mask in MASKS ? (r.mask as MaskId) : DEFAULT_LOADOUT.mask,
  };
}
