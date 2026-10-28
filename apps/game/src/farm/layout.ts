import RAW from './farmLayout.json';

/**
 * Grandparents' Farm: the locked blueprint (docs/farm), exported by
 * tools/farm-blueprint/export_game.py. All map data is in real-world metres with x east and
 * y north. The game builds the farm at FARM_SCALE so racers are miniatures: at 1:10 a kart
 * is RC-car sized and the barn is the size of a stadium.
 */
export const FARM_SCALE = 10;

export type XY = [number, number];
export interface RectDef {
  c: XY;
  w: number;
  h: number;
  angle?: number;
}
export interface FarmLayout {
  farmGridDeg: number;
  boundary: XY[];
  terrain: {
    southDrop: number;
    westDrop: number;
    houseRise: number;
    yTop: number;
    yLow: number;
    yBarn: number;
    yHouse: number;
    westA: XY;
    westN: XY;
    westL: number;
  };
  neighbourWoods: XY[];
  outside_hill: XY[];
  outside_east_field: XY[];
  road: XY[];
  ditch: XY[][];
  lane: XY[];
  pumpkin_patch: XY[];
  pumpkins: [number, number, number, 'pumpkin' | 'gourd'][];
  paths: { name: string; width: number; pts: XY[] }[];
  christmas_block: XY[];
  christmas_trees: { x: number; y: number; species: Species; heightFt: number }[];
  gravel: XY[];
  mailbox: XY;
  orchard: [number, number, 'apple' | 'pear' | 'cherry'][];
  grape_rows: [XY, XY][];
  garden: RectDef;
  big_scotch_pine: XY;
  big_spruces: XY[];
  arborvitae: XY[];
  spruce_row: XY[];
  ramp: XY[];
  grass_patches: XY[][];
  lilacs: XY[];
  well: XY;
  sandbox: RectDef;
  house: {
    main: RectDef;
    wing: RectDef;
    porch: RectDef;
    steps: RectDef;
    chimney: XY;
    bench: XY;
    front_door: XY;
    porch_door: XY;
    angle: number;
  };
  /** Concrete pad off the front door, the sidewalk to the porch, grandpa's grill. */
  house_pad: RectDef;
  house_walk: { pts: XY[]; width: number };
  grill: XY;
  barn: RectDef;
  wooden_garage: RectDef;
  red_garage: RectDef;
  corn_crib: XY;
  shed: RectDef;
  greenhouse: RectDef;
  wagons: { c: XY; angle: number; load: number }[];
  playhouse: RectDef;
  windmill: XY;
  stove: XY;
  clothes_lines: [XY, XY];
}
export type Species = 'scotch' | 'douglas' | 'white' | 'blue';

export const FARM = RAW as unknown as FarmLayout;

/** Centre of the property in map metres; the scene puts it at the world origin. */
export const CENTRE: XY = [50, 100];

/** Map metres (x east, y north) to farm-local scene coordinates (x east, z south). */
export const lx = (p: XY): number => p[0];
export const lz = (p: XY): number => -p[1];

/** Unit vectors of the farm grid: U along the barn ("farm north"), V to its ramp side. */
const g = (FARM.farmGridDeg * Math.PI) / 180;
export const U: XY = [Math.cos(g), Math.sin(g)];
export const V: XY = [-Math.sin(g), Math.cos(g)];
export const add = (p: XY, q: XY, k = 1): XY => [p[0] + q[0] * k, p[1] + q[1] * k];

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * Ground height in metres relative to the barnyard, from the owner's description: the land
 * falls ~20 ft south to the pumpkin patch (gentle, then steeper), ~15 ft west to the road
 * corner, rises ~3 ft toward the farmhouse, and a hill of wildflowers rises past the south line.
 */
export function groundHeight(x: number, y: number): number {
  const T = FARM.terrain;
  const t = clamp01((T.yTop - y) / (T.yTop - T.yLow));
  const south = -T.southDrop * smooth(t ** 1.7);
  const d = (x - T.westA[0]) * T.westN[0] + (y - T.westA[1]) * T.westN[1];
  const fade = clamp01((y - T.yTop) / Math.max(T.westA[1] - T.yTop, 1));
  const west = -T.westDrop * smooth(d / T.westL) * fade;
  const rise = T.houseRise * smooth((y - T.yBarn) / (T.yHouse - T.yBarn));
  // Rising hill of grass and wildflowers beyond the south line.
  const hill = y < -2 ? 9 * (1 - Math.exp((y + 2) / 28)) : 0;
  // A light ditch along the country road.
  const ditch = ditchDepth(x, y);
  return south + west + rise + hill - ditch;
}

function ditchDepth(x: number, y: number): number {
  let best = 0;
  for (const [a, b] of FARM.ditch) {
    const d = distToSeg(x, y, a, b);
    if (d < 1.6) best = Math.max(best, 0.35 * (1 - d / 1.6));
  }
  return best;
}

export function distToSeg(x: number, y: number, a: XY, b: XY): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

export function inside(x: number, y: number, poly: XY[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** Barn ramp: an asphalt wedge from the ground up 8 ft to the barn's upper doors. */
export const RAMP_RISE = 2.44;
export function rampHeight(x: number, y: number): number | null {
  const [w0, w1, o1, o0] = FARM.ramp; // wall edge (w0,w1), outer edge (o1,o0)
  if (!inside(x, y, [w0!, w1!, o1!, o0!])) return null;
  // Fraction of the way from the outer edge (0) to the barn wall (1).
  const wall = mid(w0!, w1!);
  const outer = mid(o0!, o1!);
  const ax = wall[0] - outer[0],
    ay = wall[1] - outer[1];
  const t = clamp01(((x - outer[0]) * ax + (y - outer[1]) * ay) / (ax * ax + ay * ay));
  const base = groundHeight(outer[0], outer[1]);
  return base + (groundHeight(wall[0], wall[1]) + RAMP_RISE - base) * t;
}
export const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Height a kart drives on: the ground, or the ramp where it is. */
export function driveHeight(x: number, y: number): number {
  return rampHeight(x, y) ?? groundHeight(x, y);
}

/** Catmull-Rom through points (open), for paths drawn smooth like the blueprint. */
export function smoothLine(pts: XY[], per = 8): XY[] {
  const out: XY[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!,
      p1 = pts[i]!,
      p2 = pts[i + 1]!,
      p3 = pts[Math.min(n - 1, i + 2)]!;
    for (let k = 0; k < per; k++) {
      const t = k / per,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]!);
  return out;
}

/** Same, closed. */
export function smoothRing(pts: XY[], per = 6): XY[] {
  const out: XY[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!,
      p1 = pts[i]!,
      p2 = pts[(i + 1) % n]!,
      p3 = pts[(i + 2) % n]!;
    for (let k = 0; k < per; k++) {
      const t = k / per,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
