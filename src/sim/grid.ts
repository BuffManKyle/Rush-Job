// Runtime grid: static walls/props from the level plus live door state. Collision, line of sight, nav.
import type { Level, Vec2 } from './level';

export const F_WALL = 1; // full-height wall: blocks movement and sight
export const F_WINDOW = 2; // blocks movement, not sight
export const F_PROP = 4; // solid furniture: blocks movement
export const F_COVER = 8; // low furniture: hides a crouched player
export const F_DOOR = 16;

export interface DoorState {
  id: string;
  cx: number;
  cy: number;
  axis: 'x' | 'y';
  open: boolean;
  locked: boolean;
  /** 0..1 visual swing, eased by the sim so the renderer can just read it */
  swing: number;
  openedByGuard: boolean;
  closeTimer: number;
}

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly flags: Uint8Array;
  readonly doorAt: Int16Array; // index into doors, -1 if none
  doors: DoorState[] = [];

  constructor(level: Level) {
    this.w = level.w;
    this.h = level.h;
    this.flags = new Uint8Array(this.w * this.h);
    this.doorAt = new Int16Array(this.w * this.h).fill(-1);
    for (let i = 0; i < level.walls.length; i++) {
      if (level.walls[i] === 1) this.flags[i] |= F_WALL;
      else if (level.walls[i] === 2) this.flags[i] |= F_WINDOW;
    }
    for (const p of level.props) {
      for (let cy = Math.floor(p.y); cy < Math.ceil(p.y + p.h); cy++)
        for (let cx = Math.floor(p.x); cx < Math.ceil(p.x + p.w); cx++) {
          if (!this.inside(cx, cy)) continue;
          // cell center must be inside the prop rect
          if (cx + 0.5 < p.x || cx + 0.5 > p.x + p.w || cy + 0.5 < p.y || cy + 0.5 > p.y + p.h) continue;
          this.flags[cy * this.w + cx] |= F_PROP | (p.cover ? F_COVER : 0);
        }
    }
  }

  inside(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h;
  }
  idx(cx: number, cy: number): number {
    return cy * this.w + cx;
  }

  addDoor(d: DoorState): void {
    this.doorAt[this.idx(d.cx, d.cy)] = this.doors.length;
    this.flags[this.idx(d.cx, d.cy)] |= F_DOOR;
    this.doors.push(d);
  }
  doorCell(cx: number, cy: number): DoorState | null {
    if (!this.inside(cx, cy)) return null;
    const i = this.doorAt[this.idx(cx, cy)];
    return i < 0 ? null : this.doors[i];
  }

  /** Solid for a moving circle. Out of bounds is solid. */
  solid(cx: number, cy: number): boolean {
    if (!this.inside(cx, cy)) return true;
    const f = this.flags[this.idx(cx, cy)];
    if (f & (F_WALL | F_WINDOW | F_PROP)) return true;
    if (f & F_DOOR) return !this.doors[this.doorAt[this.idx(cx, cy)]].open;
    return false;
  }
  /** Walkable for path planning. Guards can open (and unlock) doors, so doors count as walkable. */
  walkable(cx: number, cy: number): boolean {
    if (!this.inside(cx, cy)) return false;
    return (this.flags[this.idx(cx, cy)] & (F_WALL | F_WINDOW | F_PROP)) === 0;
  }
  blocksSight(cx: number, cy: number): boolean {
    if (!this.inside(cx, cy)) return true;
    const f = this.flags[this.idx(cx, cy)];
    if (f & F_WALL) return true;
    if (f & F_DOOR) return !this.doors[this.doorAt[this.idx(cx, cy)]].open;
    return false;
  }
  isCover(cx: number, cy: number): boolean {
    return this.inside(cx, cy) && (this.flags[this.idx(cx, cy)] & F_COVER) !== 0;
  }

  /**
   * Grid DDA from a to b. Returns the distance along the ray at which sight is blocked (or the full length).
   * `coverNear`: if given, low cover cells within `coverRange` of that point also block (crouched target).
   */
  raycast(ax: number, ay: number, bx: number, by: number, coverNear?: Vec2, coverRange = 1.6): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return 0;
    const ux = dx / len;
    const uy = dy / len;
    let cx = Math.floor(ax);
    let cy = Math.floor(ay);
    const stepX = ux > 0 ? 1 : -1;
    const stepY = uy > 0 ? 1 : -1;
    const tDX = ux !== 0 ? Math.abs(1 / ux) : Infinity;
    const tDY = uy !== 0 ? Math.abs(1 / uy) : Infinity;
    let tX = ux !== 0 ? (ux > 0 ? cx + 1 - ax : ax - cx) * tDX : Infinity;
    let tY = uy !== 0 ? (uy > 0 ? cy + 1 - ay : ay - cy) * tDY : Infinity;
    let t = 0;
    const startCx = cx;
    const startCy = cy;
    for (let guard = 0; guard < 512; guard++) {
      const isStart = cx === startCx && cy === startCy;
      if (!isStart) {
        if (this.blocksSight(cx, cy)) return t;
        if (coverNear && this.isCover(cx, cy) && Math.hypot(cx + 0.5 - coverNear.x, cy + 0.5 - coverNear.y) < coverRange) return t;
      }
      if (tX < tY) {
        t = tX;
        tX += tDX;
        cx += stepX;
      } else {
        t = tY;
        tY += tDY;
        cy += stepY;
      }
      if (t >= len) return len;
    }
    return len;
  }

  canSee(a: Vec2, b: Vec2, coverNear?: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return this.raycast(a.x, a.y, b.x, b.y, coverNear) >= d - 1e-4;
  }

  /** Move a circle by (dx, dy), sliding along solid cells. `passDoors` lets guards walk through door cells. */
  moveCircle(p: Vec2, r: number, dx: number, dy: number, passDoors = false): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * 0.5)));
    for (let s = 0; s < steps; s++) {
      p.x += dx / steps;
      this.resolve(p, r, passDoors);
      p.y += dy / steps;
      this.resolve(p, r, passDoors);
    }
  }

  private resolve(p: Vec2, r: number, passDoors: boolean): void {
    const x0 = Math.floor(p.x - r);
    const x1 = Math.floor(p.x + r);
    const y0 = Math.floor(p.y - r);
    const y1 = Math.floor(p.y + r);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const solid = passDoors ? !this.walkable(cx, cy) : this.solid(cx, cy);
        if (!solid) continue;
        const nx = Math.max(cx, Math.min(p.x, cx + 1));
        const ny = Math.max(cy, Math.min(p.y, cy + 1));
        const ddx = p.x - nx;
        const ddy = p.y - ny;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x += (ddx / d) * (r - d);
          p.y += (ddy / d) * (r - d);
        } else {
          // center inside the box: push out along the shallowest axis
          const left = p.x - cx;
          const right = cx + 1 - p.x;
          const up = p.y - cy;
          const down = cy + 1 - p.y;
          const m = Math.min(left, right, up, down);
          if (m === left) p.x = cx - r;
          else if (m === right) p.x = cx + 1 + r;
          else if (m === up) p.y = cy - r;
          else p.y = cy + 1 + r;
        }
      }
  }

  /** True if a circle of radius r can travel the straight segment (for path smoothing). */
  clearLine(a: Vec2, b: Vec2, r: number): boolean {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(len / 0.2);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      for (const [ox, oy] of [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ])
        if (!this.walkable(Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
    return true;
  }

  /** A* over walkable cells, 8-connected without corner cutting. Returns smoothed world points (excluding start). */
  findPath(from: Vec2, to: Vec2, r = 0.3): Vec2[] | null {
    const sx = Math.floor(from.x);
    const sy = Math.floor(from.y);
    let gx = Math.floor(to.x);
    let gy = Math.floor(to.y);
    if (!this.walkable(gx, gy)) {
      const n = this.nearestWalkable(gx, gy);
      if (!n) return null;
      [gx, gy] = n;
      to = { x: gx + 0.5, y: gy + 0.5 };
    }
    const W = this.w;
    const N = W * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const f = new Float32Array(N);
    const start = sy * W + sx;
    const goal = gy * W + gx;
    const hfun = (i: number) => {
      const dx = Math.abs((i % W) - gx);
      const dy = Math.abs(Math.floor(i / W) - gy);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    g[start] = 0;
    f[start] = hfun(start);
    open.push(start);
    while (open.length) {
      // small maps: linear scan for the best open node is fine
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.walkable(nx, ny)) continue;
          if (ox && oy && (!this.walkable(cx + ox, cy) || !this.walkable(cx, cy + oy))) continue;
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          const ng = g[cur] + (ox && oy ? 1.4142 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            f[ni] = ng + hfun(ni);
            open.push(ni);
          }
        }
    }
    if (start !== goal && came[goal] < 0) return null;
    const cells: Vec2[] = [];
    for (let i = goal; i !== start && i >= 0; i = came[i]) cells.push({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
    cells.reverse();
    if (cells.length) cells[cells.length - 1] = { x: to.x, y: to.y };
    else cells.push({ x: to.x, y: to.y });
    // string-pull
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clearLine(anchor, cells[j], r)) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }

  nearestWalkable(cx: number, cy: number): [number, number] | null {
    for (let rad = 1; rad < 6; rad++)
      for (let oy = -rad; oy <= rad; oy++)
        for (let ox = -rad; ox <= rad; ox++) if (this.walkable(cx + ox, cy + oy)) return [cx + ox, cy + oy];
    return null;
  }
}
