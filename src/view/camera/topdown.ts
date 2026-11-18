// Angled top-down follow camera: ~55° down, slight lead along the player's facing, wheel zoom between "close" and "planning".
import * as THREE from 'three';
import { T } from '../../tuning';
import type { GameCamera, ScreenPoint } from './types';

export class TopDownCamera implements GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly wantsCutaway = true;
  private focus = new THREE.Vector3();
  private distance: number = T.view.zoomDefault;
  private targetDistance: number = T.view.zoomDefault;
  private width = 1;
  private height = 1;
  private readonly offsetDir: THREE.Vector3;
  private initialized = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(T.view.fov, 1, 0.5, 200);
    const pitch = THREE.MathUtils.degToRad(T.view.pitch);
    // camera sits south (+z) of and above its focus, looking north-down
    this.offsetDir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  }

  follow(target: THREE.Vector3, aim: THREE.Vector3 | null, dt: number): void {
    const want = target.clone();
    if (aim) {
      // `aim` is a point ahead of the player; lead toward it
      const lead = aim.clone().sub(target).setY(0);
      if (lead.length() > T.view.facingLead) lead.setLength(T.view.facingLead);
      want.add(lead);
    }
    if (!this.initialized) {
      this.focus.copy(want);
      this.initialized = true;
    }
    const k = 1 - Math.exp(-T.view.followLerp * dt);
    this.focus.lerp(want, k);
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-10 * dt));
    this.camera.position.copy(this.focus).addScaledVector(this.offsetDir, this.distance);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }

  aimRay(ndcX: number, ndcY: number): THREE.Ray {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return rc.ray.clone();
  }

  worldToScreen(p: THREE.Vector3): ScreenPoint {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }

  screenAxes() {
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const up = new THREE.Vector2(fwd.x, fwd.z);
    if (up.lengthSq() < 1e-6) up.set(0, -1);
    up.normalize();
    return { up: { x: up.x, z: up.y }, right: { x: -up.y, z: up.x } };
  }

  zoom(steps: number): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + steps * 1.5, T.view.zoomClose, T.view.zoomPlanning);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
