import * as THREE from 'three';
import type { Track } from '@epic/sim';
import type { FoliageKind, TerrainLook, TerrainOpts } from '../scenery.ts';
import * as tex from '../textures.ts';
import type { Atmosphere, RegionLook, Theme } from '../themes.ts';
import type { RoadStyle } from '../trackMesh.ts';
import { off } from '../trackMesh.ts';
import { shireGantry } from '../props/shire.ts';
import { dressMiddleEarth } from './dress.ts';

/** Middle-earth: ten lands, each with its own sky, road, ground and trees. */

const atmos = (
  a: Partial<Atmosphere> & Pick<Atmosphere, 'skyTop' | 'skyHorizon' | 'fog'>,
): Atmosphere => ({
  fogNear: 200,
  fogFar: 1600,
  sun: 0xfff0d8,
  sunIntensity: 2.8,
  hemiSky: 0xd6e8ff,
  hemiGround: 0x5a7038,
  hemiIntensity: 1.1,
  env: 0.55,
  ...a,
});

const road = (r: Partial<RoadStyle> & Pick<RoadStyle, 'road' | 'barrier'>): RoadStyle => ({
  roadTile: 10,
  roadRoughness: 0.95,
  underside: tex.rock,
  kerbs: false,
  gantry: (f) => shireGantry(f, 'HOBBITON'),
  ...r,
});

const STONE_WALL = {
  map: tex.stoneWall,
  height: 0.85,
  thickness: 0.7,
  tile: 3.4,
  mirrorRight: false,
};
const BALUSTRADE = {
  map: tex.balustrade,
  height: 1.0,
  thickness: 0.4,
  tile: 4,
  mirrorRight: false,
};
const FENCE = { map: tex.fence, height: 1.1, thickness: 0.2, tile: 4.4, mirrorRight: false };
const DARK_ROCK = { map: tex.darkRock, height: 1.3, thickness: 0.9, tile: 4, mirrorRight: false };
const ROCK_WALL = {
  map: () => tex.rock('#6e6a64'),
  height: 1.0,
  thickness: 0.9,
  tile: 4,
  mirrorRight: false,
};

export const LOOKS: Record<string, RegionLook> = {
  hobbiton: {
    atmosphere: atmos({
      skyTop: 0x4a8fe0,
      skyHorizon: 0xe4efe6,
      fog: 0xdfe9e0,
      sun: 0xfff0cf,
      sunIntensity: 3.0,
      hemiSky: 0xd6e8ff,
      hemiGround: 0x5a7038,
      hemiIntensity: 1.15,
    }),
    road: road({ road: tex.dirtLane, barrier: STONE_WALL }),
  },
  weathertop: {
    atmosphere: atmos({
      skyTop: 0x7d8ea3,
      skyHorizon: 0xc9cfcf,
      fog: 0xb9c0c0,
      fogNear: 150,
      fogFar: 1200,
      sun: 0xe8ecf0,
      sunIntensity: 2.2,
      hemiSky: 0xb8c4d0,
      hemiGround: 0x4a5238,
      hemiIntensity: 1.0,
      env: 0.4,
    }),
    road: road({ road: tex.dirtLane, barrier: STONE_WALL }),
  },
  rivendell: {
    atmosphere: atmos({
      skyTop: 0x6aa0d8,
      skyHorizon: 0xf3e2c0,
      fog: 0xe9dcc0,
      sun: 0xffe0a8,
      sunIntensity: 3.0,
      hemiSky: 0xffe8c8,
      hemiGround: 0x6a5a38,
    }),
    road: road({ road: () => tex.paving('#ddd6c4'), barrier: BALUSTRADE, roadTile: 8 }),
  },
  moria: {
    atmosphere: atmos({
      skyTop: 0x2a3448,
      skyHorizon: 0x6a7488,
      fog: 0x3a4252,
      fogNear: 100,
      fogFar: 700,
      sun: 0xaab4d0,
      sunIntensity: 1.0,
      hemiSky: 0x7080a0,
      hemiGround: 0x20242a,
      hemiIntensity: 0.7,
      env: 0.25,
    }),
    road: road({ road: tex.dwarvenTiles, barrier: ROCK_WALL, roadTile: 12 }),
  },
  lothlorien: {
    atmosphere: atmos({
      skyTop: 0x8fb0d0,
      skyHorizon: 0xf0ead0,
      fog: 0xe8e2c4,
      fogNear: 120,
      fogFar: 900,
      sun: 0xfff2d0,
      sunIntensity: 2.6,
      hemiSky: 0xfff4d0,
      hemiGround: 0x7a7038,
      hemiIntensity: 1.3,
    }),
    road: road({ road: tex.leafPath, barrier: BALUSTRADE }),
  },
  argonath: {
    atmosphere: atmos({
      skyTop: 0x6f8aa8,
      skyHorizon: 0xcfd8de,
      fog: 0xc4ccd2,
      fogNear: 150,
      fogFar: 1400,
      sun: 0xeef2f5,
      sunIntensity: 2.4,
      hemiSky: 0xc8d4e0,
      hemiGround: 0x4a5040,
    }),
    road: road({ road: () => tex.paving('#a8a49a'), barrier: ROCK_WALL }),
  },
  rohan: {
    atmosphere: atmos({
      skyTop: 0x5b95d8,
      skyHorizon: 0xf1e8cf,
      fog: 0xece2c8,
      fogNear: 250,
      fogFar: 2000,
      sun: 0xfff2d8,
      sunIntensity: 3.2,
      hemiSky: 0xe0ecff,
      hemiGround: 0x8a7a40,
    }),
    road: road({ road: tex.dirtLane, barrier: FENCE }),
  },
  pelennor: {
    atmosphere: atmos({
      skyTop: 0x6a6a78,
      skyHorizon: 0xc8b8a0,
      fog: 0xb8a890,
      fogNear: 150,
      fogFar: 1300,
      sun: 0xffd8a0,
      sunIntensity: 2.6,
      hemiSky: 0xc8c0b0,
      hemiGround: 0x5a4a30,
      env: 0.45,
    }),
    road: road({ road: () => tex.paving('#e8e4da'), barrier: BALUSTRADE, roadTile: 8 }),
  },
  mordor: {
    atmosphere: atmos({
      skyTop: 0x2a0c08,
      skyHorizon: 0x8a3a1a,
      fog: 0x4a1c10,
      fogNear: 40,
      fogFar: 480,
      sun: 0xff7a3a,
      sunIntensity: 2.0,
      hemiSky: 0x8a3a20,
      hemiGround: 0x1a0a08,
      hemiIntensity: 0.8,
      env: 0.2,
    }),
    road: road({
      road: tex.volcanic,
      roadEmissive: tex.volcanicGlow,
      barrier: DARK_ROCK,
      underside: tex.ash,
    }),
  },
  deadMarshes: {
    atmosphere: atmos({
      skyTop: 0x6a7468,
      skyHorizon: 0xb0b8a8,
      fog: 0xa0a898,
      fogNear: 60,
      fogFar: 600,
      sun: 0xd8dccc,
      sunIntensity: 1.6,
      hemiSky: 0xa8b0a0,
      hemiGround: 0x3a3a2a,
      hemiIntensity: 0.9,
      env: 0.3,
    }),
    road: road({ road: tex.boardwalk, barrier: FENCE, underside: tex.mud, roadTile: 6 }),
  },
};

export const UNDERGROUND: Atmosphere = atmos({
  skyTop: 0x000000,
  skyHorizon: 0x05060a,
  fog: 0x07080d,
  fogNear: 25,
  fogFar: 260,
  sun: 0x000000,
  sunIntensity: 0,
  hemiSky: 0x5a6a90,
  hemiGround: 0x2a1c12,
  hemiIntensity: 0.55,
  env: 0.15,
});

// ---------------------------------------------------------------- helpers over track data

export function regionAt(track: Track, s: number): string {
  const regions = track.def.regions ?? [];
  let r = regions[0]?.[0] ?? 'hobbiton';
  for (const [id, rs] of regions) if (s >= rs) r = id;
  return r;
}

/** Region ids with blend weights (smooth across ±70 m of each border). */
export function regionWeights(track: Track, s: number): [string, number][] {
  const regions = track.def.regions ?? [];
  const L = track.length;
  if (s < 0) return [[regionAt(track, 0), 1]];
  const here = regionAt(track, s);
  const W = 70;
  for (let i = 0; i < regions.length; i++) {
    const [id, start] = regions[i]!;
    let d = s - start;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    if (Math.abs(d) < W) {
      const prev = regions[(i - 1 + regions.length) % regions.length]![0];
      const t = (d + W) / (2 * W);
      const k = t * t * (3 - 2 * t);
      return [
        [prev, 1 - k],
        [id, k],
      ];
    }
  }
  return [[here, 1]];
}

const mark = (track: Track, name: string) => track.def.marks?.[name] ?? 0;
const gapAfter = (track: Track, s: number): [number, number] =>
  (track.def.gaps ?? []).find(([a]) => a > s) ?? [s, s + 10];
const inTunnel = (track: Track, s: number) =>
  (track.def.tunnels ?? []).some(([a, b]) => s >= a && s <= b);

/** A straight cut across the track at arc length s (for gorges and rivers). */
function crossing(track: Track, s: number, half: number): [number, number][] {
  const f = track.frameAtS(s);
  const pts: [number, number][] = [];
  for (let k = -6; k <= 6; k++) {
    const d = (k / 6) * half;
    const wob = Math.sin(k * 0.9) * 10;
    pts.push([
      f.pos.x + f.right.x * d + f.tan.x * wob * (k === 0 ? 0 : 1),
      f.pos.z + f.right.z * d + f.tan.z * wob * (k === 0 ? 0 : 1),
    ]);
  }
  return pts;
}

export interface Features {
  rivendellGorge: [number, number][];
  anduin: [number, number][];
  lavaRiver: [number, number][];
  moriaLine: [number, number][];
  /** The halls' centre line, gate to gate. */
  hallLine: [number, number][];
  /** Roads leading up to both gates (kept open, no mountain). */
  gateApproaches: [number, number][][];
  doom: { x: number; z: number };
  durinLake: [number, number][];
  minasMountain: { x: number; z: number };
  edorasHill: { x: number; z: number };
  weathertopKnoll: { x: number; z: number };
  bagEndHill: { x: number; z: number };
}

const featureCache = new WeakMap<Track, Features>();
export function features(track: Track): Features {
  const hit = featureCache.get(track);
  if (hit) return hit;
  const midGap = (after: string) => {
    const [a, b] = gapAfter(track, mark(track, after));
    return (a + b) / 2;
  };
  // The mountain sits over the halls only, not the approaches: skip the gate ends.
  const moriaLine: [number, number][] = [];
  for (const [a, b] of track.def.tunnels ?? [])
    for (let s = a + 70; s <= b - 70; s += 10) {
      const p = track.frameAtS(s).pos;
      moriaLine.push([p.x, p.z]);
    }
  const at = (name: string, lat: number, ahead = 0) => {
    const p = off(track.frameAtS(mark(track, name) + ahead), lat, 0);
    return { x: p.x, z: p.z };
  };
  const f: Features = {
    rivendellGorge: crossing(track, mark(track, 'rivendellBridge') + 70, 260),
    anduin: crossing(track, midGap('anduinJump'), 420),
    lavaRiver: crossing(track, midGap('lavaJump'), 300),
    moriaLine,
    hallLine: (() => {
      const out: [number, number][] = [];
      for (const [a, b] of track.def.tunnels ?? [])
        for (let s = a; s <= b; s += 6) {
          const p = track.frameAtS(s).pos;
          out.push([p.x, p.z]);
        }
      return out;
    })(),
    gateApproaches: (track.def.tunnels ?? []).flatMap(([a, b]) => [
      [0, 20, 40, 60, 80, 100].map((d) => {
        const p = track.frameAtS(a - d).pos;
        return [p.x, p.z] as [number, number];
      }),
      [0, 20, 40, 60, 80, 100].map((d) => {
        const p = track.frameAtS(b + d).pos;
        return [p.x, p.z] as [number, number];
      }),
    ]),
    doom: at('mountDoom', -260, 40),
    durinLake: [0, 25, 50, 70].map((a) => {
      const p = at('doorsOfDurin', -38, a - 15);
      return [p.x, p.z] as [number, number];
    }),
    minasMountain: at('greatGate', 230, 40),
    edorasHill: at('edoras', -95, 40),
    weathertopKnoll: at('weathertopSummit', 20, 10),
    bagEndHill: at('bagEnd', 33, 18),
  };
  featureCache.set(track, f);
  return f;
}

/** Distance to a polyline, but only where the foot of the perpendicular lies between its ends. */
/** Distance to a densely sampled polyline, or Infinity beyond either end of it. */
function distInside(x: number, z: number, pts: [number, number][]): number {
  let k = 0,
    bd = Infinity;
  pts.forEach(([px, pz], i) => {
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) {
      bd = d;
      k = i;
    }
  });
  const n = pts.length;
  const beyond = (a: number, b: number) => {
    const [ax, az] = pts[a]!,
      [bx, bz] = pts[b]!;
    return (x - ax) * (bx - ax) + (z - az) * (bz - az) < 0;
  };
  if (k === 0 && n > 1 && beyond(0, 1)) return Infinity;
  if (k === n - 1 && n > 1 && beyond(n - 1, n - 2)) return Infinity;
  return bd;
}

function distTo(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!,
      [bx, bz] = pts[i + 1]!;
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function noise(x: number, z: number): number {
  return (
    Math.sin(x * 0.013 + Math.sin(z * 0.009) * 2) * 0.5 +
    Math.sin(z * 0.011 + Math.sin(x * 0.017) * 1.7) * 0.5
  );
}
function ridged(x: number, z: number): number {
  let s = 0,
    a = 1,
    f = 1;
  for (let i = 0; i < 4; i++) {
    s += a * (1 - Math.abs(noise(x * f, z * f)));
    a *= 0.5;
    f *= 2.1;
  }
  return s / 1.875;
}

/** Natural land shape per region (before the road flattens its surroundings). */
function regionWild(id: string, x: number, z: number, d: number): number {
  const far = smooth(d, 120, 600);
  const roll = (amp: number, scale: number) =>
    noise((x / scale) * 70, (z / scale) * 70) * amp * smooth(d, 10, 160);
  switch (id) {
    case 'hobbiton':
      return roll(10, 110) + far * 70 * ridged(x, z);
    case 'weathertop':
      return roll(14, 120) + far * 90 * ridged(x, z);
    case 'rivendell':
      return roll(22, 120) + far * 160 * ridged(x * 1.3, z * 1.3);
    case 'moria':
      return roll(20, 120) + 60 + far * 200 * ridged(x, z);
    case 'lothlorien':
      return roll(6, 160) + far * 60 * ridged(x, z);
    case 'argonath':
      return roll(26, 100) + far * 150 * ridged(x * 1.2, z);
    case 'rohan':
      return roll(8, 260) + far * 80 * ridged(x, z);
    case 'pelennor':
      return roll(3, 200) + far * 100 * ridged(x, z);
    case 'mordor':
      return roll(10, 90) + far * 220 * ridged(x * 1.6, z * 1.6);
    case 'deadMarshes':
      return roll(2, 120) - 1.5 + far * 50 * ridged(x, z);
    default:
      return 0;
  }
}

function terrainOpts(track: Track): TerrainOpts {
  const F = features(track);
  return {
    mountainStart: 99999,
    exclude: (s) =>
      inTunnel(track, s) || (track.def.gaps ?? []).some(([a, b]) => s >= a - 2 && s <= b + 2),
    wild: (x, z, s, d) => {
      let h = 0;
      for (const [id, w] of regionWeights(track, s)) h += w * regionWild(id, x, z, d);
      // The Misty Mountains over Moria, kept back from the roads up to both gates.
      const dm = F.moriaLine.length ? distTo(x, z, F.moriaLine) : 1e9;
      if (dm < 520) {
        const open = Math.min(...F.gateApproaches.map((ap) => distTo(x, z, ap)));
        const mountain =
          (60 + 190 * (0.55 + 0.45 * ridged(x, z))) *
          (1 - smooth(dm, 90, 500)) *
          smooth(open, 25, 140) *
          // Outside Moria the range stands back, so Lórien and Rivendell stay open.
          (regionAt(track, s) === 'moria' ? 1 : smooth(d, 120, 420));
        h = Math.max(h, mountain);
      }
      // Mount Doom: a lone cone with a crater.
      const rd = Math.hypot(x - F.doom.x, z - F.doom.z);
      if (rd < 230)
        h = Math.max(h, 190 * Math.pow(1 - rd / 230, 1.3) - (rd < 22 ? 30 * (1 - rd / 22) : 0));
      // Mindolluin behind Minas Tirith.
      const rm = Math.hypot(x - F.minasMountain.x, z - F.minasMountain.z);
      if (rm < 260) h = Math.max(h, 170 * Math.pow(1 - rm / 260, 1.1));
      return h;
    },
    // Solid rock above Moria's halls, so no hillside pokes into them.
    post: (x, z, h) =>
      F.hallLine.length && distInside(x, z, F.hallLine) < 50 ? Math.max(h, 55) : h,
    mounds: [
      { x: F.edorasHill.x, z: F.edorasHill.z, r: 60, h: 24 },
      { x: F.weathertopKnoll.x, z: F.weathertopKnoll.z, r: 11, h: 9 },
      { x: F.bagEndHill.x, z: F.bagEndHill.z, r: 19, h: 14 },
    ],
    carves: [
      { pts: F.rivendellGorge, width: 28, depth: 48 },
      { pts: F.anduin, width: 40, depth: 18 },
      { pts: F.lavaRiver, width: 18, depth: 9 },
      { pts: F.durinLake, width: 36, depth: 9 },
    ],
  };
}

type Paint = { tint: [number, number, number]; splat: [number, number, number, number] };
const PAINT: Record<string, Paint> = {
  hobbiton: { tint: [1, 1, 1], splat: [1, 0, 0, 0] },
  weathertop: { tint: [0.85, 0.9, 0.75], splat: [0.75, 0.25, 0, 0] },
  rivendell: { tint: [1.08, 1.02, 0.8], splat: [0.85, 0.15, 0, 0] },
  moria: { tint: [0.7, 0.78, 0.7], splat: [0.35, 0.65, 0, 0] },
  lothlorien: { tint: [1.15, 1.08, 0.72], splat: [0.95, 0.05, 0, 0] },
  argonath: { tint: [0.9, 0.95, 0.85], splat: [0.6, 0.4, 0, 0] },
  rohan: { tint: [1.5, 1.18, 0.55], splat: [0.92, 0, 0, 0.08] },
  pelennor: { tint: [1.25, 1.05, 0.7], splat: [0.6, 0.05, 0.05, 0.3] },
  mordor: { tint: [1, 0.9, 0.88], splat: [0, 0.25, 0.75, 0] },
  deadMarshes: { tint: [0.62, 0.68, 0.52], splat: [0.35, 0, 0, 0.65] },
};

function terrainPaint(track: Track): TerrainLook {
  return {
    layers: [tex.meadow, () => tex.rock(), tex.ash, tex.mud],
    paint: (x, z, y, slope, s, d) => {
      const tint: [number, number, number] = [0, 0, 0];
      const splat: [number, number, number, number] = [0, 0, 0, 0];
      for (const [id, w] of regionWeights(track, s)) {
        const p = PAINT[id] ?? PAINT.hobbiton!;
        for (let i = 0; i < 3; i++) tint[i]! += p.tint[i]! * w;
        for (let i = 0; i < 4; i++) splat[i]! += p.splat[i]! * w;
      }
      // Steep slopes and high ground turn to rock; snow on the highest peaks.
      const rockT = Math.max(smooth(slope, 0.25, 0.5), smooth(y, 90, 140));
      splat[0] *= 1 - rockT;
      splat[3] *= 1 - rockT;
      splat[1] += rockT;
      const snow = smooth(y, 170, 220);
      for (let i = 0; i < 3; i++) tint[i] = tint[i]! * (1 - snow) + 2.4 * snow;
      // A worn shoulder by the road.
      const shoulder = 1 - smooth(d, 1, 6);
      splat[3] += shoulder * 0.5;
      const v = 0.88 + noise(x * 3, z * 3) * 0.12;
      return { tint: [tint[0] * v, tint[1] * v, tint[2] * v], splat };
    },
  };
}

function foliageAt(track: Track) {
  return (x: number, z: number, s: number): FoliageKind | null => {
    void x;
    void z;
    const id = regionAt(track, s);
    const r = tex.rnd();
    switch (id) {
      case 'hobbiton':
        return 'broad';
      case 'weathertop':
        return r < 0.5 ? 'pine' : r < 0.7 ? 'dead' : null;
      case 'rivendell':
        return r < 0.65 ? 'autumn' : 'pine';
      case 'moria':
        return r < 0.4 ? 'pine' : null;
      case 'lothlorien':
        return 'mallorn';
      case 'argonath':
        return r < 0.5 ? 'pine' : null;
      case 'rohan':
        return r < 0.06 ? 'broad' : null;
      case 'pelennor':
        return r < 0.04 ? 'broad' : null;
      case 'mordor':
        return r < 0.12 ? 'dead' : null;
      case 'deadMarshes':
        return r < 0.45 ? 'dead' : null;
      default:
        return null;
    }
  };
}

export const MIDDLE_EARTH_THEME: Theme = {
  sky: { top: 0x4a8fe0, horizon: 0xe4efe6 },
  fog: { color: 0xdfe9e0, near: 200, far: 1600 },
  sunDir: new THREE.Vector3(0.55, 0.7, -0.2).normalize(),
  sunColor: 0xfff0cf,
  sunIntensity: 3.0,
  hemi: { sky: 0xd6e8ff, ground: 0x5a7038, intensity: 1.15 },
  terrain: terrainOpts,
  terrainLook: {},
  terrainPaint,
  road: () => LOOKS.hobbiton!.road,
  foliage: { count: 2600, pineShare: 0.3 },
  foliageAt: (track) => foliageAt(track),
  grandstand: false,
  clouds: true,
  regions: { looks: LOOKS, underground: UNDERGROUND },
  dress: dressMiddleEarth,
};
