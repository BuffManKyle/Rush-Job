// Boot + fixed-step loop. The sim ticks at 30 Hz; the view interpolates between ticks and only reads.
import * as THREE from 'three';
import glintTmj from '../levels/glint.tmj?raw';
import { T } from './tuning';
import { Input } from './input';
import { loadTiled } from './sim/level';
import { seedFromUrl } from './sim/rng';
import { Sim } from './sim/sim';
import { NO_INPUT, type InputFrame } from './sim/types';
import { TopDownCamera } from './view/camera/topdown';
import type { GameCamera } from './view/camera/types';
import { DebugOverlay } from './view/debug';
import { Hud } from './view/hud';
import { WorldView } from './view/renderer';
import { loadKit, type Kit } from './view/kit';
import { GearView } from './view/gear';
import { GearHud } from './view/gearHud';
import { pickLoadout, savedLoadout } from './view/loadoutPicker';
import { cleanLoadout, type Loadout } from './data/loadout';

const app = document.getElementById('app')!;
const hudEl = document.getElementById('hud')!;
const level = loadTiled(glintTmj);
const input = new Input(app);

interface Game {
  sim: Sim;
  view: WorldView;
  hud: Hud;
  debug: DebugOverlay;
  cam: GameCamera;
  gear: GearView;
  gearHud: GearHud;
}

let loadout: Loadout = savedLoadout();
let picking = false;

/** Open the loadout picker (boot, or L on the pause/payout screen), then start with the pick. */
function kitUp(seed: number): void {
  if (picking) return;
  picking = true;
  pickLoadout(level.title).then((l) => {
    picking = false;
    loadout = l;
    start(seed);
    input.clearPressed();
  });
}

let game: Game;
let paused = false;
let debugOn = false;

function start(seed: number): void {
  if (game) {
    game.view.dispose();
    game.hud.dispose();
    game.gear.dispose();
    game.gearHud.dispose();
  }
  const sim = new Sim(level, seed, loadout);
  const view = new WorldView(app, sim, kit);
  const hud = new Hud(hudEl, sim);
  const debug = new DebugOverlay(hudEl.firstElementChild as HTMLElement, view.debugGroup, sim);
  if (debugOn) debug.toggle();
  const cam = new TopDownCamera();
  const gear = new GearView(view, sim, kit);
  const gearHud = new GearHud(hudEl.firstElementChild as HTMLElement, sim);
  game = { sim, view, hud, debug, cam, gear, gearHud };
  input.resetCrouch();
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
  resize();
  setPaused(false);
  // expose for console debugging / automated play-tests (read-only by convention)
  (window as unknown as { rj: unknown }).rj = { sim, cam, view, gear, loadout, THREE, start, test, kitUp };
}

function setPaused(p: boolean): void {
  paused = p;
  game.hud.showPause(
    p,
    game.sim.seed,
    (fresh) => start(fresh ? (Math.random() * 1e9) >>> 0 : game.sim.seed),
    () => setPaused(false),
  );
}

function resize(): void {
  if (!game) return; // the boot loadout picker is up
  const w = window.innerWidth;
  const h = window.innerHeight;
  game.view.resize(w, h);
  game.cam.resize(w, h);
}
window.addEventListener('resize', resize);

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const { sim, debug, cam, hud } = game;

  if (sim.ended) {
    hud.showPayout((fresh) => start(fresh ? (Math.random() * 1e9) >>> 0 : sim.seed));
    if (input.consume('KeyR')) return start(sim.seed);
    if (input.consume('KeyN')) return start((Math.random() * 1e9) >>> 0);
    if (input.consume('KeyL')) return kitUp(sim.seed);
  } else if (input.consume('Escape')) setPaused(!paused);
  if (input.consume('F1')) {
    debugOn = !debugOn;
    debug.toggle();
  }
  if (picking) {
    input.clearPressed();
    return;
  }
  if (paused) {
    if (input.consume('KeyL')) return kitUp(sim.seed);
    if (input.consume('KeyR')) return start(sim.seed);
    if (input.consume('KeyN')) return start((Math.random() * 1e9) >>> 0);
  }
  if (input.wheel) {
    cam.zoom(input.wheel);
    input.wheel = 0;
  }

  if (!paused && !test.manual) {
    acc += dt;
    let steps = 0;
    while (acc >= sim.dt && steps < T.sim.maxStepsPerFrame) {
      sim.step(input.frame(cam));
      sim.events.flush();
      acc -= sim.dt;
      steps++;
    }
    if (steps === T.sim.maxStepsPerFrame) acc = 0;
  } else {
    sim.events.flush();
  }
  input.clearPressed();
  draw(paused || test.manual ? 1 : acc / sim.dt, dt);
}

function draw(alpha: number, dt: number): void {
  const { sim, view, hud, debug, cam } = game;
  const pp = WorldView.lerpPos(sim.player, alpha, 1);
  // lead toward the cursor while aiming, otherwise along the facing
  const ahead = sim.player.aiming ? { x: input.aimWorld.x, y: input.aimWorld.z } : sim.facingPoint(T.view.facingLead);
  cam.follow(pp, new THREE.Vector3(ahead.x, 1, ahead.y), dt);
  view.update(alpha, dt, cam, true);
  game.gear.update(alpha, dt);
  hud.update(dt, alpha, cam);
  game.gearHud.update();
  debug.update(dt, paused);
  view.render(cam);
}

/** Automated play-test hook: `rj.test.manual = true`, then `rj.test.run(30, { moveY: -1 })` steps 1 s with that input. */
const test = {
  manual: false,
  /** Restart the same seed with a different loadout, e.g. `rj.test.kit({ gadgets: ['noisemaker', 'smoke'] })`. */
  kit(l: Partial<Loadout>): void {
    loadout = cleanLoadout({ ...loadout, ...l });
    start(game.sim.seed);
  },
  run(ticks: number, inp: Partial<InputFrame> = {}): void {
    const sim = game.sim;
    for (let i = 0; i < ticks; i++) {
      const p = sim.player.pos;
      const mx = inp.moveX ?? 0;
      const my = inp.moveY ?? 0;
      sim.step({ ...NO_INPUT, aimX: p.x + (mx || 0), aimY: p.y + (my || -1), ...inp });
      sim.events.flush();
      game.hud.update(sim.dt, 1, game.cam);
    }
    for (let i = 0; i < 20; i++) draw(1, sim.dt);
  },
};

// Boot: the kit is ~1 MB of GLBs. Show a plain loading line, then start. If it fails, the graybox runs.
let kit: Kit | null = null;
const loading = document.createElement('div');
loading.className = 'boot-loading';
loading.textContent = 'Casing the joint...';
document.body.appendChild(loading);
const params = new URLSearchParams(location.search);
(params.has('graybox') ? Promise.resolve(null) : loadKit((d, t) => (loading.textContent = `Casing the joint... ${Math.round((d / t) * 100)}%`))).then((k) => {
  kit = k;
  loading.remove();
  // kit up first (skip with ?nopick: uses the last loadout)
  const go = (l: Loadout) => {
    loadout = l;
    start(seedFromUrl());
    requestAnimationFrame(frame);
  };
  if (params.has('nopick')) go(loadout);
  else pickLoadout(level.title).then(go);
});
