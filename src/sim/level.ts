// Tiled (.tmj) loader. 1 tile = 1 m. Sim space: x east, y south (same as Tiled); the renderer maps y -> three.js z.
// Tile kinds come from tileset tile properties (`kind` = floor | wall | window), so gids can change freely in Tiled.

export interface Vec2 {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WallKind = 0 | 1 | 2; // none, wall, window

export interface DoorDef {
  id: string;
  cx: number;
  cy: number;
  locked: boolean;
  lockChance: number; // shuffle: chance this door starts locked (overrides `locked` when > 0)
  open: boolean;
  /** 'x' = door spans along x (walls left/right of it), so you pass through it moving along y. */
  axis: 'x' | 'y';
}
export interface PropDef extends Rect {
  id: string;
  type: string;
  cover: boolean;
  value: number;
}
export interface ZoneDef extends Rect {
  id: string;
  type: string;
}
export interface RouteDef {
  id: string;
  guard: string;
  wait: number;
  points: Vec2[];
}
export interface CameraDef extends Vec2 {
  id: string;
  yaw: number; // radians, sim space
  sweep: number; // radians, full arc
  period: number;
}
export interface CivilianDef extends Vec2 {
  id: string;
  role: 'customer' | 'staff';
  wander: string; // zone id they mill around in
}
export interface MarkerDef extends Vec2 {
  id: string;
  type: string;
  group: string;
}

export interface Level {
  title: string;
  w: number;
  h: number;
  floor: string[]; // tile name per cell ('' = void)
  walls: Uint8Array; // WallKind per cell
  doors: DoorDef[];
  props: PropDef[];
  zones: ZoneDef[];
  spawns: Record<string, Vec2>;
  routes: RouteDef[];
  cameras: CameraDef[];
  markers: MarkerDef[];
  civilians: CivilianDef[];
}

/* Minimal Tiled JSON shapes we read. */
interface TProp {
  name: string;
  type?: string;
  value: unknown;
}
interface TObj {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  polyline?: Vec2[];
  polygon?: Vec2[];
  properties?: TProp[];
}
interface TLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup' | string;
  data?: number[];
  objects?: TObj[];
  layers?: TLayer[];
}
interface TTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TProp[] }[];
  source?: string;
}
interface TMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TLayer[];
  tilesets: TTileset[];
  properties?: TProp[];
}

const FLIP_MASK = 0x1fffffff; // strip Tiled's flip flags from gids

function props(list: TProp[] | undefined): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const p of list ?? []) o[p.name] = p.value;
  return o;
}
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

export function loadTiled(json: string): Level {
  const map = JSON.parse(json) as TMap;
  const { width: w, height: h } = map;
  const tw = map.tilewidth;
  const th = map.tileheight;

  // gid -> {kind, name}
  const tileInfo = new Map<number, { kind: string; name: string }>();
  for (const ts of map.tilesets) {
    if (ts.source) throw new Error(`External tileset ${ts.source} not supported yet; embed it in the map (Tiled: Embed Tileset).`);
    for (const t of ts.tiles ?? []) {
      const p = props(t.properties);
      tileInfo.set(ts.firstgid + t.id, { kind: str(p.kind, 'floor'), name: str(p.name, `tile${t.id}`) });
    }
  }

  const layers: TLayer[] = [];
  const flatten = (ls: TLayer[]) => ls.forEach((l) => (l.type === 'group' ? flatten(l.layers ?? []) : layers.push(l)));
  flatten(map.layers);

  const floor: string[] = new Array(w * h).fill('');
  const walls = new Uint8Array(w * h);
  for (const l of layers) {
    if (l.type !== 'tilelayer' || !l.data) continue;
    l.data.forEach((raw, i) => {
      const gid = raw & FLIP_MASK;
      if (!gid) return;
      const info = tileInfo.get(gid) ?? { kind: 'floor', name: `gid${gid}` };
      if (info.kind === 'wall') walls[i] = 1;
      else if (info.kind === 'window') walls[i] = 2;
      else floor[i] = info.name;
    });
  }

  const level: Level = {
    title: str(props(map.properties).title, 'Untitled'),
    w,
    h,
    floor,
    walls,
    doors: [],
    props: [],
    zones: [],
    spawns: {},
    routes: [],
    cameras: [],
    markers: [],
    civilians: [],
  };

  const isWall = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= w || cy >= h || walls[cy * w + cx] !== 0;
  const used = new Set<string>();
  const uid = (base: string, oid: number) => {
    let id = base || `obj${oid}`;
    if (used.has(id)) id = `${id}#${oid}`;
    used.add(id);
    return id;
  };

  for (const l of layers) {
    if (l.type !== 'objectgroup') continue;
    for (const o of l.objects ?? []) {
      const type = o.type || o.class || '';
      const p = props(o.properties);
      const r: Rect = { x: o.x / tw, y: o.y / th, w: o.width / tw, h: o.height / th };
      const id = uid(o.name, o.id);
      switch (type) {
        case 'door': {
          const cx = Math.floor(r.x + r.w / 2);
          const cy = Math.floor(r.y + r.h / 2);
          const axis = isWall(cx - 1, cy) || isWall(cx + 1, cy) ? 'x' : 'y';
          level.doors.push({ id, cx, cy, axis, locked: bool(p.locked, false), lockChance: num(p.lockChance, 0), open: bool(p.open, false) });
          break;
        }
        case 'restricted':
        case 'van_drop':
        case 'lobby':
        case 'wander':
          level.zones.push({ id, type, ...r });
          break;
        case 'player_start':
        case 'lobby_spawn':
          level.spawns[type] = { x: r.x, y: r.y };
          break;
        case 'route': {
          const pts = (o.polyline ?? o.polygon ?? []).map((q) => ({ x: (o.x + q.x) / tw, y: (o.y + q.y) / th }));
          level.routes.push({ id, guard: str(p.guard, id), wait: num(p.wait, 1), points: pts });
          break;
        }
        case 'camera':
          level.cameras.push({
            id,
            x: r.x,
            y: r.y,
            yaw: (num(p.yaw, 90) * Math.PI) / 180,
            sweep: (num(p.sweep, 60) * Math.PI) / 180,
            period: num(p.period, 6),
          });
          break;
        case 'civilian':
          level.civilians.push({ id, x: r.x, y: r.y, role: p.role === 'staff' ? 'staff' : 'customer', wander: str(p.wander, '') });
          break;
        case 'code_note':
          level.markers.push({ id, type, group: str(p.group, ''), x: r.x, y: r.y });
          break;
        default:
          if (o.point) level.markers.push({ id, type, group: str(p.group, ''), x: r.x, y: r.y });
          else level.props.push({ id, type, cover: bool(p.cover, false), value: num(p.value, 0), ...r });
      }
    }
  }
  if (!level.spawns.player_start) level.spawns.player_start = { x: w / 2, y: h / 2 };
  if (!level.spawns.lobby_spawn) level.spawns.lobby_spawn = level.spawns.player_start;
  return level;
}

export function inRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}
