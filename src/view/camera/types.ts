import type * as THREE from 'three';

export interface ScreenPoint {
  x: number; // CSS pixels
  y: number;
  visible: boolean;
}

/**
 * The one camera interface (DESIGN.md "Camera", rule 3). A first-person camera is a new file implementing this.
 * Gameplay never reads the camera: only the input layer (aimRay, screenAxes) and the view (worldToScreen) do.
 */
export interface GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Track a world-space target; `aim` is a world-space point to lead toward (the player's facing), or null. */
  follow(target: THREE.Vector3, aim: THREE.Vector3 | null, dt: number): void;
  /** World-space ray through a point in normalized device coordinates (-1..1). */
  aimRay(ndcX: number, ndcY: number): THREE.Ray;
  worldToScreen(p: THREE.Vector3): ScreenPoint;
  /** Ground-plane unit vectors (x, z) for screen-right and screen-up, so WASD can be screen-relative. */
  screenAxes(): { right: { x: number; z: number }; up: { x: number; z: number } };
  zoom(steps: number): void;
  resize(width: number, height: number): void;
  /** True if walls should be cut away (top-down only). */
  readonly wantsCutaway: boolean;
}
