// Seeded RNG (mulberry32). Every shuffle and every random choice in the sim goes through one of these,
// so a run is fully reproducible from its seed.
export class Rng {
  private s: number;
  constructor(readonly seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<X>(xs: readonly X[]): X {
    return xs[this.int(xs.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Independent child stream, so adding a roll in one system doesn't reshuffle another. */
  fork(label: string): Rng {
    let h = this.seed ^ 0x9e3779b9;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
    return new Rng(h >>> 0);
  }
}

export function seedFromUrl(): number {
  const p = new URLSearchParams(location.search).get('seed');
  if (p && /^\d+$/.test(p)) return Number(p) >>> 0;
  return (Math.random() * 1e9) >>> 0;
}
