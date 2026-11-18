// Hold-to-interact (E), as data. Each verb has a duration, a noise radius and interrupt rules.
// Adding an action = a row here + an effect case in sim/interact.ts.
import { T } from '../tuning';

export type InterruptRule =
  | 'release' // letting go of E cancels
  | 'move' // walking away / moving cancels
  | 'seen'; // being at full suspicion of any observer cancels

export interface InteractionDef {
  id: string;
  label: string;
  time: number; // seconds of holding
  noise: number; // radius emitted when the action starts (0 = silent)
  noiseContinuous?: boolean; // re-emit every second while held
  noiseOnComplete?: number; // radius emitted when it finishes (e.g. smashed glass)
  interrupt: InterruptRule[];
  keepProgress?: boolean; // progress survives a cancel (resume later)
  requiresMask?: boolean;
}

export const INTERACTIONS: Record<string, InteractionDef> = {
  door_open: { id: 'door_open', label: 'Open', time: T.doors.openTime, noise: 0, interrupt: ['release'] },
  door_close: { id: 'door_close', label: 'Close', time: T.doors.openTime, noise: 0, interrupt: ['release'] },
  lockpick: { id: 'lockpick', label: 'Pick lock', time: T.doors.lockpickTime, noise: 0, interrupt: ['release', 'move'], keepProgress: true },
  case_smash: { id: 'case_smash', label: 'Smash case', time: 0.6, noise: 0, noiseOnComplete: T.noise.smashGlass, interrupt: ['release'], requiresMask: true },
  takedown: { id: 'takedown', label: 'Take down', time: T.takedown.time, noise: 0, interrupt: ['release'], requiresMask: true },
  zip_tie: { id: 'zip_tie', label: 'Zip-tie', time: T.takedown.zipTieTime, noise: 0, interrupt: ['release', 'move'], requiresMask: true },
  answer_pager: { id: 'answer_pager', label: 'Answer pager', time: T.pager.answerTime, noise: 0, interrupt: ['release', 'move'], requiresMask: true },
  bag_pickup: { id: 'bag_pickup', label: 'Pick up bag', time: 0.3, noise: 0, interrupt: ['release'] },
  read_note: { id: 'read_note', label: 'Read sticky note', time: 1, noise: 0, interrupt: ['release'] },
  safe_code: { id: 'safe_code', label: 'Enter safe code', time: 3, noise: 0, interrupt: ['release', 'move'] },
  safe_loot: { id: 'safe_loot', label: 'Bag the gold', time: 2, noise: 0, interrupt: ['release', 'move'], requiresMask: true },
  leave: { id: 'leave', label: 'Get in the van and go', time: 1, noise: 0, interrupt: ['release', 'move'] },
  bag_loot: { id: 'bag_loot', label: 'Bag loot', time: 1.5, noise: 0, interrupt: ['release', 'move'], requiresMask: true },
};
