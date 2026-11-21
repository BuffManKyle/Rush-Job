// The store's property: guards work inside it and never follow anything out into the public street.
// Tiled: rect objects of type `property` (any layer). Without any, the building's own floor counts
// (every cell that isn't sidewalk, asphalt or void).
import { T } from '../tuning';
import { inRect, type Rect, type Vec2 } from './level';
import type { Sim } from './sim';

const PUBLIC_FLOORS = new Set(['', 'floor_sidewalk', 'floor_asphalt']);

export function propertyRects(sim: Sim): Rect[] {
  const cached = (sim as unknown as { _property?: Rect[] })._property;
  if (cached) return cached;
  let rects: Rect[] = sim.level.zones.filter((z) => z.type === 'property');
  if (!rects.length) {
    // fallback: bounding box of the building's floor
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const { w, h, floor } = sim.level;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const f = floor[y * w + x];
        if (PUBLIC_FLOORS.has(f)) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      }
    rects = x0 < x1 ? [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }] : [{ x: 0, y: 0, w, h }];
  }
  (sim as unknown as { _property?: Rect[] })._property = rects;
  return rects;
}

export function onProperty(sim: Sim, p: Vec2): boolean {
  return propertyRects(sim).some((r) => inRect(p, r));
}

/**
 * The point a guard walks to for something at `p`: `p` itself on the property, otherwise the nearest
 * walkable spot just inside the property edge. Null if there's nowhere sensible.
 */
export function clampToProperty(sim: Sim, p: Vec2): Vec2 | null {
  if (onProperty(sim, p)) return { x: p.x, y: p.y };
  const inset = T.security.propertyInset;
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (const r of propertyRects(sim)) {
    const q = {
      x: Math.max(r.x + inset, Math.min(r.x + r.w - inset, p.x)),
      y: Math.max(r.y + inset, Math.min(r.y + r.h - inset, p.y)),
    };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (!best) return null;
  // the clamped point may be inside a wall: take the nearest walkable cell on the property
  const g = sim.grid;
  const cx = Math.floor(best.x);
  const cy = Math.floor(best.y);
  if (g.walkable(cx, cy) && !g.solid(cx, cy)) return best;
  let found: Vec2 | null = null;
  let fd = Infinity;
  for (let rad = 1; rad <= 4 && !found; rad++)
    for (let oy = -rad; oy <= rad; oy++)
      for (let ox = -rad; ox <= rad; ox++) {
        const x = cx + ox;
        const y = cy + oy;
        const c = { x: x + 0.5, y: y + 0.5 };
        if (!g.walkable(x, y) || g.solid(x, y) || !onProperty(sim, c)) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < fd) {
          fd = d;
          found = c;
        }
      }
  return found;
}
