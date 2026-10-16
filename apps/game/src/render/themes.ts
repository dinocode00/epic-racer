import * as THREE from 'three';
import type { Track } from '@epic/sim';
import type { FoliageKind, Terrain, TerrainLook, TerrainOpts } from './scenery.ts';
import { DEFAULT_ROAD, type RoadStyle } from './trackMesh.ts';

/** Sky, fog and light for one land. Blended as racers travel between lands. */
export interface Atmosphere {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Strength of sky reflections on paint and chrome. */
  env: number;
}

/** One land of a multi-land track. */
export interface RegionLook {
  atmosphere: Atmosphere;
  road: RoadStyle;
}

/** Everything that makes one track look like itself. */
export interface Theme {
  sky: { top: number; horizon: number };
  fog: { color: number; near: number; far: number };
  sunDir: THREE.Vector3;
  sunColor: number;
  sunIntensity: number;
  hemi: { sky: number; ground: number; intensity: number };
  terrain: (track: Track) => TerrainOpts;
  terrainLook: TerrainLook;
  road: (track: Track) => RoadStyle;
  foliage: { count: number; pineShare: number };
  /** Areas where trees must not grow (props, water). */
  keepOut?: (track: Track) => (x: number, z: number) => boolean;
  grandstand: boolean;
  clouds: boolean;
  /** Multi-land tracks: a look per region id, plus the underground atmosphere. */
  regions?: { looks: Record<string, RegionLook>; underground: Atmosphere };
  terrainPaint?: (track: Track) => TerrainLook;
  foliageAt?: (
    track: Track,
    terrain: Terrain,
  ) => (x: number, z: number, s: number) => FoliageKind | null;
  /** Add track-specific props. Returns a per-frame animation hook, if any. */
  dress?: (ctx: DressContext) => ((t: number, dt: number) => void) | void;
}

export interface DressContext {
  scene: THREE.Group;
  track: Track;
  terrain: Terrain;
}

export const PROVING_THEME: Theme = {
  sky: { top: 0x3d7fd6, horizon: 0xcfe6f7 },
  fog: { color: 0xcfe6f7, near: 260, far: 2200 },
  sunDir: new THREE.Vector3(0.35, 0.82, -0.3).normalize(),
  sunColor: 0xfff0d8,
  sunIntensity: 2.8,
  hemi: { sky: 0xcfe3ff, ground: 0x4d5e33, intensity: 1.1 },
  terrain: () => ({}),
  terrainLook: {},
  road: () => DEFAULT_ROAD,
  foliage: { count: 1400, pineShare: 1 },
  grandstand: true,
  clouds: true,
};
