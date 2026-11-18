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
}

let game: Game;
let paused = false;
let debugOn = false;

function start(seed: number): void {
  if (game) {
    game.view.dispose();
    game.hud.dispose();
  }
  const sim = new Sim(level, seed);
  const view = new WorldView(app, sim);
  const hud = new Hud(hudEl, sim);
  const debug = new DebugOverlay(hudEl.firstElementChild as HTMLElement, view.debugGroup, sim);
  if (debugOn) debug.toggle();
  const cam = new TopDownCamera();
  game = { sim, view, hud, debug, cam };
  input.resetCrouch();
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
  resize();
  setPaused(false);
  // expose for console debugging / automated play-tests (read-only by convention)
  (window as unknown as { rj: unknown }).rj = { sim, cam, THREE, start, test };
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
  const { sim, debug, cam } = game;

  if (input.consume('Escape')) setPaused(!paused);
  if (input.consume('F1')) {
    debugOn = !debugOn;
    debug.toggle();
  }
  if (paused) {
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
  cam.follow(pp, input.aimWorld, dt);
  view.update(alpha, dt, cam, true);
  hud.update(dt, alpha, cam);
  debug.update(dt, paused);
  view.render(cam);
}

/** Automated play-test hook: `rj.test.manual = true`, then `rj.test.run(30, { moveY: -1 })` steps 1 s with that input. */
const test = {
  manual: false,
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

start(seedFromUrl());
requestAnimationFrame(frame);
