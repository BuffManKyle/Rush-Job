// Payout receipt and rating (DESIGN.md "Payout and ratings"). Pure function of sim state.
import { T } from '../tuning';
import type { Sim } from './sim';

export interface ReceiptLine {
  label: string;
  amount: number;
}

export interface Payout {
  lines: ReceiptLine[];
  total: number;
  rating: 'Ghost' | 'Professional' | 'Pacifist' | 'Loud' | 'Bloodbath' | 'Cuffed';
  ratingNote: string;
}

export function computePayout(sim: Sim): Payout {
  const P = T.payout;
  const take = sim.secured;
  const lines: ReceiptLine[] = [{ label: 'Take (bags in the van)', amount: take }];
  const clean = !sim.alarm.tripped;
  if (clean && take > 0) lines.push({ label: 'Clean job bonus (+25%)', amount: Math.round(take * P.cleanBonus) });
  const gross = lines.reduce((a, l) => a + l.amount, 0);
  lines.push({ label: "Dot's cut (10%)", amount: -Math.round(gross * P.dotCut) });
  if (sim.stats.civilianCasualties) lines.push({ label: 'Cleanup', amount: -P.cleanupPerCivilian * sim.stats.civilianCasualties });
  if (sim.ended?.how === 'cuffed') lines.push({ label: 'Bail', amount: -P.bail });
  const total = lines.reduce((a, l) => a + l.amount, 0);

  let rating: Payout['rating'];
  let ratingNote: string;
  if (sim.ended?.how === 'cuffed') {
    rating = 'Cuffed';
    ratingNote = 'Dot left with what was already in the van.';
  } else if (sim.stats.civilianCasualties) {
    rating = 'Bloodbath';
    ratingNote = 'The Accountant is not angry. Just disappointed.';
  } else if (!sim.stats.spotted && sim.stats.takedowns === 0) {
    rating = 'Ghost';
    ratingNote = 'Never spotted, nobody touched. Unlocks mask: "The Rumor".';
  } else if (clean) {
    rating = 'Professional';
    ratingNote = 'No alarm. Unlocks mask: "The Suit".';
  } else if (sim.stats.kills === 0) {
    rating = 'Pacifist';
    ratingNote = 'Loud, but nobody died. Unlocks mask: "Conscientious Objector".';
  } else {
    rating = 'Loud';
    ratingNote = 'Out with the bags. Unlocks mask: "The Headline".';
  }
  return { lines, total, rating, ratingNote };
}
