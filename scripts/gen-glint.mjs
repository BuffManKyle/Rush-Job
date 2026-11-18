// One-off bootstrap: writes levels/glint.tmj (+ levels/tiles.png) from the ASCII plan below.
// After the first run, levels/glint.tmj is the source of truth: edit it in Tiled, not here.
// Re-running this OVERWRITES the map. Usage: node scripts/gen-glint.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'levels', 'glint.tmj');
if (fs.existsSync(out) && !process.argv.includes('--force')) {
  console.error('levels/glint.tmj exists; pass --force to overwrite');
  process.exit(1);
}

// Legend: # wall, W window, D door (back floor), . showroom, , back-of-house, _ sidewalk/alley, a asphalt
const rows = [];
const R = (s) => rows.push(s);
const WALLROW = (doors) => {
  let s = '';
  for (let x = 0; x < 26; x++) s += doors.includes(x) ? 'D' : '#';
  return s + '______#';
};
R('#################################'); // y0
for (let y = 1; y <= 6; y++) R('#,,,,,,,,#,,,,#,,,,,,,,,,#______#'); // office | closet | safe room | alley
R(WALLROW([5, 11, 19])); // y7
R('#,,,,,,,,,,,,,,,,,,,,,,,,D______#'); // y8 back hall + back door
R('#,,,,,,,,,,,,,,,,,,,,,,,,#______#'); // y9
R(WALLROW([13])); // y10 staff door
for (let y = 11; y <= 18; y++) R('#........................#______#'); // showroom
R('###WWWWWWWW##D##WWWWWWWW##______#'); // y19 storefront
R('_________________________________'); // y20 sidewalk
R('_________________________________'); // y21
R('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); // y22 street
R('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
R('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const W = 33;
const H = rows.length;
rows.forEach((r, i) => {
  if (r.length !== W) throw new Error(`row ${i} is ${r.length} wide`);
});

// Tile ids (gid = id + 1). The game reads `kind` from tile properties, not gids.
const TILES = [
  { id: 0, name: 'floor_showroom', kind: 'floor', color: [38, 92, 96] },
  { id: 1, name: 'floor_back', kind: 'floor', color: [92, 92, 100] },
  { id: 2, name: 'floor_sidewalk', kind: 'floor', color: [140, 140, 150] },
  { id: 3, name: 'floor_asphalt', kind: 'floor', color: [40, 42, 52] },
  { id: 4, name: 'wall', kind: 'wall', color: [210, 200, 180] },
  { id: 5, name: 'window', kind: 'window', color: [120, 200, 220] },
];
const floorOf = { '.': 1, ',': 2, D: 2, _: 3, a: 4, '#': 2, W: 1 };
const wallOf = { '#': 5, W: 6 };
const floor = [];
const walls = [];
const doors = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = rows[y][x];
    floor.push(floorOf[c] ?? 0);
    walls.push(wallOf[c] ?? 0);
    if (c === 'D') doors.push([x, y]);
  }

let oid = 1;
const T = 32;
const prop = (name, value) => {
  const type = typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value;
  return { name, type, value };
};
const base = (type, name, x, y) => ({ id: oid++, name, type, x: x * T, y: y * T, rotation: 0, visible: true });
const rect = (type, name, x, y, w, h, props = []) => ({ ...base(type, name, x, y), width: w * T, height: h * T, properties: props });
const point = (type, name, x, y, props = []) => ({ ...base(type, name, x, y), width: 0, height: 0, point: true, properties: props });
const poly = (type, name, pts, props = []) => ({
  ...base(type, name, pts[0][0], pts[0][1]),
  width: 0,
  height: 0,
  polyline: pts.map(([x, y]) => ({ x: (x - pts[0][0]) * T, y: (y - pts[0][1]) * T })),
  properties: props,
});

const doorNames = { '5,7': 'office_door', '11,7': 'closet_door', '19,7': 'safe_room_door', '25,8': 'back_door', '13,10': 'staff_door', '13,19': 'front_door' };
const doorObjs = doors.map(([x, y]) => {
  const n = doorNames[`${x},${y}`] ?? 'door';
  const props = [];
  if (n === 'safe_room_door') props.push(prop('locked', true));
  if (n === 'back_door') props.push(prop('lockChance', 0.5));
  if (n === 'front_door') props.push(prop('open', true));
  return rect('door', n, x, y, 1, 1, props);
});

const props = [
  rect('counter', 'counter', 8, 13, 9, 1, [prop('cover', true)]),
  ...[[2, 12], [2, 14], [24, 12], [24, 14], [5, 16], [6, 16], [20, 16], [21, 16]].map(([x, y], i) =>
    rect('case', `case_${i + 1}`, x, y, 1, 1, [prop('cover', true), prop('value', 3000 + ((i * 3) % 4) * 1000)]),
  ),
  rect('desk', 'office_desk', 3, 3, 3, 1, [prop('cover', true)]),
  rect('security_desk', 'security_desk', 10, 2, 2, 1, [prop('cover', true)]),
  rect('safe', 'safe', 23, 2, 1, 1, [prop('value', 15000)]),
  rect('van', 'van', 27, 1, 4, 4, []),
];
const zones = [
  rect('restricted', 'back_of_house', 1, 1, 24, 10),
  rect('restricted', 'behind_counter', 8, 11, 10, 2),
  rect('van_drop', 'van_drop', 27, 5, 4, 2),
  rect('lobby', 'lobby', 9, 15, 9, 3),
];
const spawns = [point('player_start', 'player_start', 13.5, 21.5), point('lobby_spawn', 'lobby_spawn', 13.5, 16.5)];
const routes = [
  poly('route', 'A', [[3.5, 17.5], [22.5, 17.5], [22.5, 14.8], [18, 14.8], [17.6, 11.5], [7.5, 11.5], [3.5, 15.5]], [prop('guard', 'A'), prop('wait', 1.5)]),
  poly('route', 'B1_hall', [[2.5, 8.5], [24, 8.5], [24, 9.3], [2.5, 9.3]], [prop('guard', 'B'), prop('wait', 2.0)]),
  poly('route', 'B2_office_safe', [[5.5, 3.5], [5.5, 8.8], [19.5, 8.8], [21, 3.5], [19.5, 8.8], [5.5, 8.8]], [prop('guard', 'B'), prop('wait', 2.0)]),
  poly('route', 'B3_counter_check', [[12, 4.5], [12, 8.8], [13.5, 11.6], [16.5, 11.6], [13.5, 9], [3, 8.8], [6, 4.5]], [prop('guard', 'B'), prop('wait', 1.5)]),
];
// yaw: degrees, Tiled screen space (0 = east/+x, 90 = south/+y). sweep: total arc. period: seconds per full back-and-forth.
const cameras = [
  point('camera', 'cam_showroom', 24.3, 11.3, [prop('yaw', 140), prop('sweep', 70), prop('period', 7)]),
  point('camera', 'cam_hall', 1.3, 8.2, [prop('yaw', 10), prop('sweep', 30), prop('period', 6)]),
  point('camera', 'cam_alley', 31.5, 13.5, [prop('yaw', 225), prop('sweep', 50), prop('period', 6)]),
];
const shuffle = [
  point('code_note', 'note_office', 4.5, 3.5, [prop('group', 'safe_code')]),
  point('code_note', 'note_closet', 13.2, 2.5, [prop('group', 'safe_code')]),
  point('code_note', 'note_counter', 15.5, 11.5, [prop('group', 'safe_code')]),
];

let lid = 1;
const tileLayer = (name, data) => ({ id: lid++, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data });
const objLayer = (name, objects) => ({ id: lid++, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects });

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  compressionlevel: -1,
  properties: [prop('title', 'Glint & Sons Jewelers'), prop('heist', 'glint')],
  tilesets: [
    {
      firstgid: 1,
      name: 'rushjob_graybox',
      tilewidth: T,
      tileheight: T,
      tilecount: TILES.length,
      columns: TILES.length,
      image: 'tiles.png',
      imagewidth: T * TILES.length,
      imageheight: T,
      margin: 0,
      spacing: 0,
      tiles: TILES.map((t) => ({ id: t.id, properties: [prop('kind', t.kind), prop('name', t.name)] })),
    },
  ],
  layers: [
    tileLayer('floor', floor),
    tileLayer('walls', walls),
    objLayer('doors', doorObjs),
    objLayer('props', props),
    objLayer('zones', zones),
    objLayer('spawns', spawns),
    objLayer('routes', routes),
    objLayer('cameras', cameras),
    objLayer('shuffle', shuffle),
  ],
};
map.nextlayerid = lid;
map.nextobjectid = oid;
fs.writeFileSync(out, JSON.stringify(map, null, 1));

// Tiny PNG tileset so the map opens in Tiled with colored tiles.
function png(w, h, rgba) {
  const crcT = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const iw = T * TILES.length;
const buf = Buffer.alloc(iw * T * 4);
for (let y = 0; y < T; y++)
  for (let x = 0; x < iw; x++) {
    const t = TILES[Math.floor(x / T)];
    const edge = x % T === 0 || y === 0;
    const [r, g, b] = t.color.map((v) => (edge ? v * 0.7 : v) | 0);
    buf.set([r, g, b, 255], (y * iw + x) * 4);
  }
fs.writeFileSync(path.join(root, 'levels', 'tiles.png'), png(iw, T, buf));
console.log(`wrote ${out} (${W}x${H}, ${oid - 1} objects)`);
