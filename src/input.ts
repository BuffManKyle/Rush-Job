// Keyboard + mouse -> InputFrame. This is the only gameplay-facing code that touches the camera:
// it turns screen-relative WASD and the mouse cursor into world-space intent.
import * as THREE from 'three';
import type { InputFrame } from './sim/types';
import type { GameCamera } from './view/camera/types';

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouse = new THREE.Vector2(0, 0); // NDC
  private crouchToggle = false;
  private mouseDown = false;
  private rightDown = false;
  wheel = 0;
  aimWorld = new THREE.Vector3();

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['F1', 'Tab', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code === 'KeyC' && !e.repeat) this.crouchToggle = !this.crouchToggle;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = this.rightDown = false;
    });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }
  /** True once per key press. */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }
  clearPressed(): void {
    this.pressed.clear();
  }
  resetCrouch(): void {
    this.crouchToggle = false;
  }

  frame(cam: GameCamera, playerHeight = 0): InputFrame {
    const ax = cam.screenAxes();
    let sx = 0;
    let sy = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) sy += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) sy -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) sx += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) sx -= 1;
    const l = Math.hypot(sx, sy) || 1;
    sx /= l;
    sy /= l;
    const ray = cam.aimRay(this.mouse.x, this.mouse.y);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -playerHeight);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (hit) this.aimWorld.copy(hit);
    const sprint = this.down.has('ShiftLeft') || this.down.has('ShiftRight');
    if (sprint && (sx || sy)) this.crouchToggle = false; // sprinting stands you up
    return {
      moveX: ax.right.x * sx + ax.up.x * sy,
      moveY: ax.right.z * sx + ax.up.z * sy,
      aimX: this.aimWorld.x,
      aimY: this.aimWorld.z,
      sprint,
      crouch: this.crouchToggle,
      interact: this.down.has('KeyE'),
      mask: this.down.has('KeyG'),
      mark: this.consume('KeyQ'),
      throw: this.consume('KeyF'),
      fire: this.mouseDown || this.down.has('Space'),
      reload: this.consume('KeyR'),
      aim: this.rightDown,
      gadget1: this.consume('Digit1') || this.consume('Numpad1'),
      gadget2: this.consume('Digit2') || this.consume('Numpad2'),
      shout: this.consume('KeyV'),
    };
  }
}
