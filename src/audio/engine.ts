// Web Audio engine: buses, ducking, buffer loading and voices. Knows nothing about the sim.
// Sound ids and files come from assets/audio/manifest.json, written by tools/audio/build.py.
import manifestJson from '../../assets/audio/manifest.json';

interface ManifestEntry {
  files: string[];
  loop: boolean;
  bpm?: number;
  bars?: number;
  loopSeconds?: number;
}
const MANIFEST = manifestJson as unknown as Record<string, ManifestEntry>;

// Every built file, as a URL Vite serves or bundles. Nothing is fetched until a sound is loaded.
const URLS = import.meta.glob('../../assets/audio/{sfx,cue,ui,amb,music}/**/*.ogg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const urlFor = (rel: string): string | undefined => URLS[`../../assets/audio/${rel}`];

export type Bus = 'cue' | 'voice' | 'sfx' | 'amb' | 'music';

/** Bus levels. Gameplay information beats atmosphere (DESIGN.md "Sound & voice"). */
const BUS_GAIN: Record<Bus, number> = { cue: 0.9, voice: 1.0, sfx: 0.8, amb: 0.45, music: 0.55 };
const DUCK = { cue: 0.35, voice: 0.5 }; // music gain multiplier while a cue / voice line plays

export interface PlayOpts {
  bus?: Bus;
  gain?: number;
  rate?: number; // playback rate (pitch)
  jitter?: number; // random +-rate, for variety on repeated sounds
  pan?: number; // -1..1
  at?: number; // AudioContext time to start (default now)
  offset?: number; // seconds into the buffer
  loop?: boolean;
  fadeIn?: number;
}

export class Voice {
  constructor(
    readonly src: AudioBufferSourceNode,
    readonly gainNode: GainNode,
    readonly panNode: StereoPannerNode,
    private readonly ctx: AudioContext,
  ) {}
  ended = false;
  setGain(g: number, ramp = 0.08): void {
    this.gainNode.gain.setTargetAtTime(g, this.ctx.currentTime, ramp / 3);
  }
  setPan(p: number): void {
    this.panNode.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), this.ctx.currentTime, 0.03);
  }
  stop(fade = 0.05): void {
    if (this.ended) return;
    this.ended = true;
    const t = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(t);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, t);
    this.gainNode.gain.linearRampToValueAtTime(0, t + fade);
    try {
      this.src.stop(t + fade + 0.01);
    } catch {
      /* already stopped */
    }
  }
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly buses = {} as Record<Bus, GainNode>;
  private readonly musicDuck: GainNode;
  private readonly musicFilter: BiquadFilterNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastVariant = new Map<string, number>();
  private ducks = { cue: 0, voice: 0 };
  private muted = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicDuck = this.ctx.createGain();
    this.musicDuck.connect(this.musicFilter).connect(this.master);
    for (const b of Object.keys(BUS_GAIN) as Bus[]) {
      const g = this.ctx.createGain();
      g.gain.value = BUS_GAIN[b];
      g.connect(b === 'music' ? this.musicDuck : this.master);
      this.buses[b] = g;
    }
    // Browsers start audio suspended until the first click or key press.
    const unlock = () => {
      if (this.ctx.state !== 'running') void this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true });
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  has(id: string): boolean {
    return !!MANIFEST[id];
  }

  entry(id: string): ManifestEntry | undefined {
    return MANIFEST[id];
  }

  /** Load every file of these sounds (and keep them). */
  preload(ids: string[]): Promise<unknown> {
    return Promise.all(ids.flatMap((id) => (MANIFEST[id]?.files ?? []).map((f) => this.load(f))));
  }

  /** All sound ids with a prefix, e.g. 'sfx.' */
  ids(prefix = ''): string[] {
    return Object.keys(MANIFEST).filter((k) => k.startsWith(prefix));
  }

  private load(rel: string): Promise<AudioBuffer | null> {
    let p = this.loading.get(rel);
    if (!p) {
      const url = urlFor(rel);
      p = url
        ? fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => this.ctx.decodeAudioData(b))
            .then((buf) => {
              this.buffers.set(rel, buf);
              return buf;
            })
            .catch((e) => {
              console.warn('audio: failed to load', rel, e);
              return null;
            })
        : Promise.resolve(null);
      this.loading.set(rel, p);
    }
    return p;
  }

  /** A loaded buffer for this sound: a random variation, never the same one twice in a row. */
  private pick(id: string, variant?: number): AudioBuffer | null {
    const files = MANIFEST[id]?.files;
    if (!files?.length) return null;
    let i = variant ?? Math.floor(Math.random() * files.length);
    if (variant === undefined && files.length > 1 && i === this.lastVariant.get(id)) i = (i + 1) % files.length;
    this.lastVariant.set(id, i);
    const buf = this.buffers.get(files[i]);
    if (!buf) void this.load(files[i]); // not loaded yet: load it for next time, skip this one
    return buf ?? null;
  }

  duration(id: string): number {
    const f = MANIFEST[id]?.files[0];
    return (f && this.buffers.get(f)?.duration) || 0;
  }

  play(id: string, o: PlayOpts = {}, variant?: number): Voice | null {
    const buf = this.pick(id, variant);
    if (!buf) return null;
    const bus = o.bus ?? busFor(id);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = o.loop ?? false;
    const rate = (o.rate ?? 1) * (1 + (o.jitter ? (Math.random() * 2 - 1) * o.jitter : 0));
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    const at = Math.max(this.ctx.currentTime, o.at ?? 0);
    const target = o.gain ?? 1;
    if (o.fadeIn) {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(target, at + o.fadeIn);
    } else g.gain.value = target;
    src.connect(g).connect(pan).connect(this.buses[bus]);
    src.start(at, o.offset ?? 0);
    const v = new Voice(src, g, pan, this.ctx);
    if (bus === 'cue' || bus === 'voice') this.duck(bus, at, src.loop ? 0 : buf.duration / rate);
    src.onended = () => (v.ended = true);
    return v;
  }

  /** Music ducks under cues and voice; a loop ducks only while it's playing (see director). */
  private duck(bus: 'cue' | 'voice', at: number, length: number): void {
    if (length <= 0) return;
    this.ducks[bus]++;
    this.applyDuck(at);
    setTimeout(() => {
      this.ducks[bus]--;
      this.applyDuck(this.ctx.currentTime);
    }, (at - this.ctx.currentTime + length) * 1000);
  }

  private applyDuck(at: number): void {
    const m = (this.ducks.cue > 0 ? DUCK.cue : 1) * (this.ducks.voice > 0 ? DUCK.voice : 1);
    this.musicDuck.gain.setTargetAtTime(m, at, m < 1 ? 0.03 : 0.15);
  }

  /** Pause: music goes muffled and quieter, the world keeps its own sounds (the sim is frozen anyway). */
  setPaused(p: boolean): void {
    this.musicFilter.frequency.setTargetAtTime(p ? 800 : 20000, this.ctx.currentTime, 0.1);
    this.buses.sfx.gain.setTargetAtTime(p ? 0 : BUS_GAIN.sfx, this.ctx.currentTime, 0.05);
    this.buses.cue.gain.setTargetAtTime(p ? 0 : BUS_GAIN.cue, this.ctx.currentTime, 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}

export function busFor(id: string): Bus {
  if (id.startsWith('mus.')) return 'music';
  if (id.startsWith('amb.')) return 'amb';
  if (id.startsWith('cue.')) return 'cue';
  return 'sfx';
}
