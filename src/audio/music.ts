// Music: single loops (job board, payout) and each heist's three synced stems (Audio/01 Music.md).
// Stealth, loud and tension start at the same AudioContext time and loop on exact bar lengths, so
// the alarm can crossfade to the loud stem on the next beat and land in time.
import type { AudioEngine, Voice } from './engine';

export class Music {
  private single: { id: string; v: Voice } | null = null;
  private stems: { heist: string; start: number; beat: number; stealth: Voice; loud: Voice; tension: Voice | null } | null = null;
  private tensionOn = false;
  private loudOn = false;

  constructor(private readonly a: AudioEngine) {}

  /** A plain loop (board, payout, payout.cuffed). Crossfades from whatever is playing. */
  async loop(id: string, fade = 1.0, delay = 0): Promise<void> {
    if (this.single?.id === id && !this.stems) return;
    await this.a.preload([id]);
    this.stopStems(fade);
    const old = this.single;
    this.single = null;
    old?.v.stop(fade);
    const v = this.a.play(id, { loop: true, fadeIn: fade, at: this.a.now + delay });
    if (v) this.single = { id, v };
  }

  stopAll(fade = 1.0): void {
    this.single?.v.stop(fade);
    this.single = null;
    this.stopStems(fade);
  }

  /** Start a heist's stems in sync: stealth audible, loud and tension silent. */
  async startStems(heist: string): Promise<void> {
    const ids = [`mus.${heist}.stealth`, `mus.${heist}.loud`, `mus.${heist}.tension`, `mus.sting.alarm_${heist}`];
    await this.a.preload(ids);
    if (this.stems?.heist === heist) return;
    this.single?.v.stop(1.0);
    this.single = null;
    this.stopStems(0.5);
    const e = this.a.entry(`mus.${heist}.stealth`);
    if (!e?.bpm) return;
    const start = this.a.now + 0.12;
    const stealth = this.a.play(`mus.${heist}.stealth`, { loop: true, at: start, fadeIn: 1.5 });
    const loud = this.a.play(`mus.${heist}.loud`, { loop: true, at: start, gain: 0 });
    // the tension loop is 8 bars; the stems' bar counts are multiples of 8, so it stays in phase
    const tension = this.a.play(`mus.${heist}.tension`, { loop: true, at: start, gain: 0 });
    if (!stealth || !loud) return;
    this.stems = { heist, start, beat: 60 / e.bpm, stealth, loud, tension };
    this.tensionOn = false;
    this.loudOn = false;
  }

  get stemsPlaying(): boolean {
    return !!this.stems;
  }

  /** Next beat on the stems' grid, at least `min` seconds away. */
  private nextBeat(min = 0.03): number {
    const s = this.stems!;
    const t = this.a.now + min;
    return s.start + Math.ceil((t - s.start) / s.beat) * s.beat;
  }

  setTension(on: boolean): void {
    const s = this.stems;
    if (!s || !s.tension || this.loudOn || on === this.tensionOn) return;
    this.tensionOn = on;
    const bar = s.beat * 4;
    const g = s.tension.gainNode.gain;
    const t = this.nextBeat();
    g.cancelScheduledValues(this.a.now);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? 0.9 : 0, t + (on ? bar : bar * 2));
  }

  /** The alarm: brass hit and the loud stem, on the next beat. */
  alarm(): void {
    const s = this.stems;
    if (!s || this.loudOn) return;
    this.loudOn = true;
    const t = this.nextBeat(0.05);
    this.a.play(`mus.sting.alarm_${s.heist}`, { bus: 'music', at: t, gain: 1.1 });
    for (const [v, to] of [
      [s.loud, 1],
      [s.stealth, 0],
      [s.tension, 0],
    ] as [Voice | null, number][]) {
      if (!v) continue;
      const g = v.gainNode.gain;
      g.cancelScheduledValues(this.a.now);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + 0.5);
    }
  }

  private stopStems(fade: number): void {
    if (!this.stems) return;
    for (const v of [this.stems.stealth, this.stems.loud, this.stems.tension]) v?.stop(fade);
    this.stems = null;
  }
}
