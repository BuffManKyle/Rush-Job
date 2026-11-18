// Detection, exactly per DESIGN.md "Systems spec > Detection":
// fill = 40/s × distance (1.0 within 4 m → 0.25 at the cone's edge) × movement (crouch 0.5, walk 1.0, sprint 1.5)
//        × status (masked 2.0, unmasked in a restricted area 1.0, unmasked in public 0) × carrying a bag 1.5
// drain = 15/s after 1.5 s out of sight. Thresholds 30 / 60 / 100.
import { T } from '../tuning';
import type { Grid } from './grid';
import type { DetectionInfo, Observer, Player } from './types';

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function statusMultiplier(p: Player): number {
  const s = T.detection.status;
  if (p.masked) return p.inRestricted ? s.maskedRestricted : s.maskedPublic;
  return p.inRestricted ? s.unmaskedRestricted * (p.casingBonus ? T.detection.suitCasingMultiplier : 1) : s.unmaskedPublic;
}

export function moveMultiplier(p: Player): number {
  const m = T.detection.move;
  if (p.crouch) return m.crouch;
  if (p.sprinting && p.moving) return m.sprint;
  return m.walk;
}

export function distanceMultiplier(dist: number, range: number): number {
  const near = T.detection.nearDistance;
  if (dist <= near) return 1;
  const t = Math.min(1, (dist - near) / Math.max(1e-3, range - near));
  return 1 + (T.detection.farMultiplier - 1) * t;
}

/** Can this observer see the player right now (geometry only)? Fills `info`. */
export function look(grid: Grid, o: Observer, p: Player, info: DetectionInfo): boolean {
  const dx = p.pos.x - o.pos.x;
  const dy = p.pos.y - o.pos.y;
  const dist = Math.hypot(dx, dy);
  info.dist = dist;
  info.inRange = dist <= o.range;
  info.inCone = info.inRange && Math.abs(angleDiff(o.yaw, Math.atan2(dy, dx))) <= o.cone / 2;
  info.los = info.inCone && grid.canSee(o.pos, p.pos, p.crouch && T.detection.crouchedBehindCover ? p.pos : undefined);
  return info.los;
}

/** Advance one observer's suspicion meter. Returns true if it just crossed 100. */
export function updateSuspicion(grid: Grid, o: Observer, p: Player, dt: number): boolean {
  const info = o.info;
  const visible = look(grid, o, p, info);
  info.fDist = distanceMultiplier(info.dist, o.range);
  info.fMove = moveMultiplier(p);
  info.fStatus = statusMultiplier(p);
  info.fBag = p.carrying ? T.detection.carryingBag : 1;
  const fill = visible ? T.detection.fillRate * info.fDist * info.fMove * info.fStatus * info.fBag : 0;
  const before = o.suspicion;
  o.sees = fill > 0;
  if (o.sees) {
    o.sinceSeen = 0;
    o.lastKnown = { x: p.pos.x, y: p.pos.y };
    o.suspicion = Math.min(100, o.suspicion + fill * dt);
    info.rate = fill;
  } else {
    o.sinceSeen += dt;
    if (o.sinceSeen >= T.detection.drainDelay && o.suspicion < 100) {
      o.suspicion = Math.max(0, o.suspicion - T.detection.drainRate * dt);
      info.rate = o.suspicion > 0 ? -T.detection.drainRate : 0;
    } else info.rate = 0;
  }
  if (o.suspicion <= 0) o.peak = 0;
  else if (o.suspicion >= T.detection.report) o.peak = 100;
  else if (o.suspicion >= T.detection.investigate && o.peak < 60) o.peak = 60;
  else if (o.suspicion >= T.detection.look && o.peak < 30) o.peak = 30;
  return before < 100 && o.suspicion >= 100;
}

export function emptyInfo(): DetectionInfo {
  return { inRange: false, inCone: false, los: false, dist: 0, fDist: 0, fMove: 0, fStatus: 0, fBag: 1, rate: 0 };
}

/** Plain-language explanation of what an observer saw, for alarm causes. */
export function describe(o: Observer, p: Player): string {
  const what = p.masked ? 'masked' : 'in a staff area';
  const how = p.crouch ? 'crouched' : p.sprinting && p.moving ? 'sprinting' : 'walking';
  const bag = p.carrying ? ', carrying a bag' : '';
  return `${o.label} saw you ${what}, ${how}${bag}, ${o.info.dist.toFixed(1)} m away`;
}
