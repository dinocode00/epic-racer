import * as THREE from 'three';
import { FARM_PIECES, type Track } from '@epic/sim';
import {
  type Atmosphere,
  PROVING_THEME,
  type RaceEnvironment,
  type Theme,
} from '../render/themes.ts';
import { FarmScene } from './farmScene.ts';
import { grassCuts } from './grass.ts';
import { meshHeight } from './ground.ts';
import { FARM, type XY } from './layout.ts';
import DRAFT from './racetrackDraft.json';
import { type Frame, type GlassMarks, buildGlass } from './trackLook.ts';

/**
 * Racing at Grandpa's Farm: the farm scene (everything the explorer shows, grandpa on his rounds
 * included) with the racetrack built in smoky glass along exactly the line the karts drive.
 * Where the road runs along the ground the grass is mowed away under it, the pumpkins are
 * cleared off the pumpkin-patch road and the Christmas trees standing in the forest road are
 * trimmed up so you can see between the trunks. Inside the barn the light goes dark.
 */

const S = 10; // FARM_SCALE

function farmEnvironment(track: Track, renderer: THREE.WebGLRenderer): RaceEnvironment {
  const kindAt = (s: number) => FARM_PIECES.find((p) => s >= p.s0 && s < p.s1)?.kind ?? 'road';
  // The track in the farm's real metres (map x, height, -map y).
  const F: Frame[] = [];
  const toFarm = (v: { x: number; y: number; z: number }) =>
    new THREE.Vector3(v.x / S + 50, v.y / S, v.z / S - 100);
  const n = track.count;
  for (let i = 0; i <= n; i += 2) {
    const f = track.frame(i % n);
    F.push({
      p: toFarm(f.pos),
      t: new THREE.Vector3(f.tan.x, f.tan.y, f.tan.z),
      up: new THREE.Vector3(f.up.x, f.up.y, f.up.z),
      w: f.width / S,
      kind: kindAt(Math.min(i, n - 1) * track.spacing),
      s: i * track.spacing,
    });
  }

  // Keep the ground clear under the road: mow the grass where it runs along the ground; clear
  // pumpkins and trim the trees anywhere near it.
  grassCuts.length = 0;
  const near: { pts: XY[]; width: number }[] = [];
  let low: XY[] = [],
    any: XY[] = [];
  let w = 1.6;
  const flush = () => {
    if (low.length > 1) grassCuts.push({ pts: low, width: w + 1.0 });
    if (any.length > 1) near.push({ pts: any, width: w });
    low = [];
    any = [];
  };
  for (const f of F) {
    const above = f.p.y - meshHeight(f.p.x, -f.p.z);
    if (f.kind === 'air' || above > 3) {
      flush();
      continue;
    }
    if (Math.abs(f.w - w) > 0.5) flush();
    w = f.w;
    any.push([f.p.x, -f.p.z]);
    if (above < 1.5) low.push([f.p.x, -f.p.z]);
    else if (low.length) {
      if (low.length > 1) grassCuts.push({ pts: low, width: w + 1.0 });
      low = [];
    }
  }
  flush();
  // A coarse grid of the road's centre points, for "is this near the road?".
  const CELL = 3;
  const grid = new Map<string, { x: number; y: number; r: number }[]>();
  for (const st of near)
    for (const [x, y] of st.pts) {
      const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      const list = grid.get(k) ?? [];
      list.push({ x, y, r: st.width / 2 });
      grid.set(k, list);
    }
  const onRoad = (x: number, y: number, pad: number) => {
    const cx = Math.floor(x / CELL),
      cy = Math.floor(y / CELL);
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++)
        for (const q of grid.get(`${cx + i},${cy + j}`) ?? [])
          if (Math.hypot(q.x - x, q.y - y) < q.r + pad) return true;
    return false;
  };
  FARM.pumpkins = FARM.pumpkins.filter(([x, y]) => !onRoad(x, y, 0.4));
  // Trees cut for the race (the run-up to the big forest jump and its landing).
  const cut = new Set(
    (DRAFT as unknown as { cleared: [number, number][] }).cleared.map(([x, y]) => `${x},${y}`),
  );
  FARM.christmas_trees = FARM.christmas_trees.filter((t) => !cut.has(`${t.x},${t.y}`));
  for (const t of FARM.christmas_trees) if (onRoad(t.x, t.y, 0.6)) t.trimmed = true;

  const farm = new FarmScene(renderer);
  const marks: GlassMarks['marks'] = [{ kind: 'start', s: 0 }];
  // The pads exactly where (and as wide as) they work.
  for (const p of track.def.pads ??
    (track.def.boostPads ?? []).map((s) => ({ s, lat: 0, width: 6 })))
    marks.push({ kind: 'pad', s: p.s, lat: p.lat / S, width: p.width / S });
  for (const k of track.def.kickers ?? [])
    marks.push({ kind: k.pop > 20 ? 'bigjump' : 'jump', s: k.s });
  const glass = buildGlass(F, { marks, postEvery: 6 }, 'smoky');
  farm.addToFarm(glass.group);

  const day: Atmosphere = {
    skyTop: 0x3f86d9,
    skyHorizon: 0xd9ebf6,
    fog: 0xd6e6ee,
    fogNear: 2400,
    fogFar: 14000,
    sun: 0xfff1d6,
    sunIntensity: 2.9,
    hemiSky: 0xd6e8ff,
    hemiGround: 0x5a6b3a,
    hemiIntensity: 1.15,
    env: 0.55,
  };
  // In the barn: near dark, a warm glow off the cracks.
  const barn: Atmosphere = {
    ...day,
    fog: 0x0b0806,
    fogNear: 60,
    fogFar: 520,
    sun: 0xffd9a0,
    sunIntensity: 0.12,
    hemiSky: 0x6b5236,
    hemiGround: 0x120c08,
    hemiIntensity: 0.22,
    env: 0.05,
  };
  return {
    scene: farm.scene,
    sun: farm.sun,
    hemi: farm.hemi,
    groundHeight: (x, z) => farm.heightAt(x, z),
    update: (dt, camera) => {
      if (camera) farm.update(dt, camera);
    },
    focusSun: (p, half) => farm.focusSun(p, half),
    day,
    dark: { atmosphere: barn, ranges: track.def.tunnels ?? [] },
  };
}

export const FARM_THEME: Theme = {
  ...PROVING_THEME,
  grandstand: false,
  clouds: false,
  environment: farmEnvironment,
};
