// Progress between jobs: cash earned and ratings won (DESIGN.md "Gear, guns & progression").
// Lives in this browser's localStorage; every read and write survives storage being unavailable.
// The cash shop doesn't spend it yet (everything is unlocked for testing).
const KEY = 'rj.progress';

export interface Progress {
  cash: number;
  jobs: number;
  ratings: string[]; // every rating ever earned (masks unlock from these)
}

export function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.cash === 'number') return { cash: raw.cash, jobs: raw.jobs ?? 0, ratings: Array.isArray(raw.ratings) ? raw.ratings : [] };
  } catch {
    /* fall through */
  }
  return { cash: 0, jobs: 0, ratings: [] };
}

function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private window: progress just won't stick */
  }
}

/** Bank a finished job's payout (can be negative: bail and cleanup come out of savings, floored at $0). */
export function bankJob(total: number, rating: string): Progress {
  const p = loadProgress();
  p.cash = Math.max(0, p.cash + total);
  p.jobs++;
  if (!p.ratings.includes(rating)) p.ratings.push(rating);
  save(p);
  return p;
}
