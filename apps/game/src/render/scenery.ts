import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Track } from '@epic/sim';
import * as tex from './textures.ts';
import {
  TREES,
  barkDepth,
  barkMaterial,
  grassMaterial,
  leafDepth,
  leafMaterial,
  rockGeo,
  tuftGeo,
  uprightNormals,
} from './foliage.ts';

// ---------- noise ----------
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x),
    zi = Math.floor(z);
  const xf = x - xi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf),
    v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi),
    b = hash(xi + 1, zi),
    c = hash(xi, zi + 1),
    d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number): number {
  let s = 0,
    a = 1,
    f = 1,
    n = 0;
  for (let o = 0; o < 5; o++) {
    s += vnoise(x * f, z * f) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
const smooth = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Height field for the land around a track. Flat-ish and matching the road near the
 * track, rolling hills further out, mountains on the horizon.
 */
export interface TerrainOpts {
  /** Hill height far from the road. */
  hillAmp?: number;
  /** Horizontal size of hills (m). */
  hillScale?: number;
  /** Distance from the track centre where mountains begin. */
  mountainStart?: number;
  mountainAmp?: number;
  /** Channels cut into the ground (brooks, ravines), as polylines in x/z. */
  carves?: { pts: [number, number][]; width: number; depth: number }[];
  /** Rounded mounds (hobbit hills, the watchtower hill). */
  mounds?: { x: number; z: number; r: number; h: number }[];
  /** Road sections that must not shape the ground (jumps, tunnels). */
  exclude?: (s: number) => boolean;
  /**
   * Replace the natural land shape. Gets the position, the arc length of the nearest
   * road point (-1 if none nearby), distance to the road edge and the default shape.
   */
  wild?: (x: number, z: number, s: number, d: number, base: number) => number;
  /** Last word on the height (after road blending, mounds and carves). */
  post?: (x: number, z: number, h: number) => number;
}

function distToPolyline(x: number, z: number, pts: [number, number][]): number {
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

interface RoadPt {
  x: number;
  z: number;
  h: number;
  hw: number;
  s: number;
}

const CELL = 24;
const MAX_R = 420;

/**
 * Height field for the land around a track. Matches the road near the track, rolls
 * into hills further out, mountains on the horizon. Nearest-road queries use a
 * spatial hash so big tracks stay fast.
 */
export class Terrain {
  private grid = new Map<number, RoadPt[]>();
  readonly cx: number;
  readonly cz: number;
  /** Bounds of the track in x/z. */
  readonly min: { x: number; z: number };
  readonly max: { x: number; z: number };
  readonly opts: TerrainOpts;

  constructor(track: Track, opts: TerrainOpts = {}) {
    this.opts = opts;
    let sx = 0,
      sz = 0,
      n = 0;
    this.min = { x: Infinity, z: Infinity };
    this.max = { x: -Infinity, z: -Infinity };
    for (let i = 0; i < track.count; i += 2) {
      const f = track.frame(i);
      const s = i * track.spacing;
      sx += f.pos.x;
      sz += f.pos.z;
      n++;
      this.min.x = Math.min(this.min.x, f.pos.x);
      this.min.z = Math.min(this.min.z, f.pos.z);
      this.max.x = Math.max(this.max.x, f.pos.x);
      this.max.z = Math.max(this.max.z, f.pos.z);
      if (f.up.y < 0.8) continue; // loops and walls don't shape the ground
      if (opts.exclude?.(s)) continue;
      const lift = (f.width / 2) * Math.sqrt(Math.max(0, 1 - f.up.y * f.up.y));
      const p = { x: f.pos.x, z: f.pos.z, h: f.pos.y - lift - 0.25, hw: f.width / 2, s };
      const key = this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      const list = this.grid.get(key);
      if (list) list.push(p);
      else this.grid.set(key, [p]);
    }
    this.cx = sx / n;
    this.cz = sz / n;
  }

  private key(i: number, j: number): number {
    return (i + 4096) * 8192 + (j + 4096);
  }

  /** Distance from (x,z) to the road edge, the road's height there, and its arc length. */
  nearest(x: number, z: number): { d: number; h: number; s: number } {
    const ci = Math.floor(x / CELL),
      cj = Math.floor(z / CELL);
    let bd = Infinity;
    let best: RoadPt | null = null;
    for (let r = 0; r * CELL <= MAX_R; r++) {
      // Once the ring is further away than the best hit, stop.
      if (best && (r - 1) * CELL > Math.sqrt(bd)) break;
      for (let i = ci - r; i <= ci + r; i++)
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          const list = this.grid.get(this.key(i, j));
          if (!list) continue;
          for (const p of list) {
            const d = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
        }
    }
    if (!best) return { d: MAX_R, h: 0, s: -1 };
    return { d: Math.sqrt(bd) - best.hw, h: best.h, s: best.s };
  }

  height(x: number, z: number): number {
    const { d, h, s } = this.nearest(x, z);
    return this.heightFrom(x, z, d, h, s);
  }

  heightFrom(x: number, z: number, d: number, roadH: number, s = -1): number {
    const o = this.opts;
    const rc = Math.hypot(x - this.cx, z - this.cz);
    const hs = o.hillScale ?? 140;
    const hills = (fbm(x / hs, z / hs) - 0.35) * (6 + smooth(d, 20, 220) * (o.hillAmp ?? 26));
    const ms = o.mountainStart ?? 420;
    const mountains =
      smooth(rc, ms, ms + 480) * (fbm(x / 260 + 7, z / 260) * (o.mountainAmp ?? 220) + 30);
    let wild = hills + mountains;
    if (o.wild) wild = o.wild(x, z, s, d, wild);
    const near = 1 - smooth(d, 3, 45);
    let h = roadH * near + Math.max(wild, roadH - 6) * (1 - near);
    // Mounds sit on top of the blended land so they keep their full height by the road.
    for (const m of o.mounds ?? []) {
      const r = Math.hypot(x - m.x, z - m.z) / m.r;
      if (r < 1) h += m.h * (0.5 + 0.5 * Math.cos(Math.PI * r));
    }
    for (const c of o.carves ?? []) {
      const dc = distToPolyline(x, z, c.pts);
      h -= c.depth * (1 - smooth(dc, c.width * 0.5, c.width * 1.8));
    }
    return o.post ? o.post(x, z, h) : h;
  }
}

export function buildSky(
  top = 0x3d7fd6,
  horizon = 0xcfe6f7,
  sun = new THREE.Vector3(0.35, 0.82, -0.3),
): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      sunDir: { value: sun.clone().normalize() },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

export interface TerrainLook {
  grass?: () => THREE.Texture;
  /** Tint of the worn shoulder beside the road. */
  shoulder?: THREE.Color;
  /**
   * Multi-land painting: return a tint and weights for four ground layers
   * (layer textures given in `layers`) at a point.
   */
  paint?: (
    x: number,
    z: number,
    y: number,
    slope: number,
    s: number,
    d: number,
  ) => { tint: [number, number, number]; splat: [number, number, number, number] };
  layers?: [() => THREE.Texture, () => THREE.Texture, () => THREE.Texture, () => THREE.Texture];
}

/**
 * Material that blends four ground textures by a per-vertex `splat` weight, sampled in
 * world space. Rock is projected from three sides (no stretching on cliffs), the main
 * layers are mixed with a rotated second sample and broad light/dark patches so the
 * tiling doesn't show.
 */
function splatMaterial(layers: THREE.Texture[]): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: layers[0], vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.map1 = { value: layers[1] };
    sh.uniforms.map2 = { value: layers[2] };
    sh.uniforms.map3 = { value: layers[3] };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNor;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSplat = splat;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNor = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D map1; uniform sampler2D map2; uniform sampler2D map3;
        varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWNor;
        vec4 twoScale(sampler2D t, vec2 uv) {
          // A second, rotated and rescaled sample hides the repeat.
          vec2 r = vec2(uv.x * 0.8 - uv.y * 0.6, uv.x * 0.6 + uv.y * 0.8) * 0.41;
          return mix(texture2D(t, uv), texture2D(t, r), 0.45);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 wuv = vWPos.xz / 24.0;
        vec3 an = pow(abs(normalize(vWNor)), vec3(4.0));
        an /= (an.x + an.y + an.z);
        vec4 rockT = texture2D(map1, vWPos.zy / 18.0) * an.x
          + texture2D(map1, vWPos.xz / 18.0) * an.y
          + texture2D(map1, vWPos.xy / 18.0) * an.z;
        vec4 sampledDiffuseColor = twoScale(map, wuv) * vSplat.x + rockT * vSplat.y
          + twoScale(map2, wuv) * vSplat.z + twoScale(map3, wuv * 1.3) * vSplat.w;
        float macro = 0.8 + 0.42 * dot(texture2D(map, vWPos.xz / 460.0 + 0.37).rgb, vec3(0.333));
        diffuseColor *= vec4(sampledDiffuseColor.rgb * macro, 1.0);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-splat-2';
  return mat;
}

/** One terrain mesh over a grid of x/z positions. */
function terrainMesh(
  terrain: Terrain,
  look: TerrainLook,
  xs: number[],
  zs: number[],
  sink?: (x: number, z: number) => number,
): THREE.Mesh {
  const nx = xs.length,
    nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const col = new Float32Array(nx * nz * 3);
  const spl = look.paint ? new Float32Array(nx * nz * 4) : null;
  const sAt = new Float32Array(nx * nz);
  const dAt = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i]!,
        z = zs[j]!;
      const { d, h, s } = terrain.nearest(x, z);
      const y = terrain.heightFrom(x, z, d, h, s) - (sink?.(x, z) ?? 0);
      pos.set([x, y, z], k * 3);
      uv.set([x / 24, z / 24], k * 2);
      sAt[k] = s;
      dAt[k] = d;
    }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        c = a + nx,
        e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(nx * nz > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : idx);
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let k = 0; k < nx * nz; k++) {
    const x = pos[k * 3]!,
      y = pos[k * 3 + 1]!,
      z = pos[k * 3 + 2]!;
    const slope = 1 - nor.getY(k);
    const d = dAt[k]!;
    if (look.paint && spl) {
      const p = look.paint(x, z, y, slope, sAt[k]!, d);
      col.set(p.tint, k * 3);
      const sum = p.splat[0] + p.splat[1] + p.splat[2] + p.splat[3] || 1;
      spl.set(
        p.splat.map((w) => w / sum),
        k * 4,
      );
      continue;
    }
    // Colour: dirt shoulder by the road, grass, rock on mountains, snow on peaks.
    const c = new THREE.Color(1, 1, 1);
    const shoulder = 1 - smooth(d, 1, 6);
    const tint = 0.85 + fbm(x / 30, z / 30) * 0.3;
    c.setRGB(tint, tint, tint);
    c.lerp(look.shoulder ?? new THREE.Color(1.35, 1.05, 0.7), shoulder * 0.6);
    c.lerp(new THREE.Color(1.05, 1.0, 0.95), smooth(y, 40, 90));
    c.lerp(new THREE.Color(2.4, 2.4, 2.5), smooth(y, 150, 190));
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  let mat: THREE.MeshStandardMaterial;
  if (spl && look.layers) {
    geo.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    mat = splatMaterial(look.layers.map((f) => f()));
  } else {
    mat = new THREE.MeshStandardMaterial({
      map: (look.grass ?? tex.grass)(),
      vertexColors: true,
      roughness: 1,
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Terrain = a fine grid (~3-4 m) over the play area plus a coarse ring out to the
 * horizon. Inside the fine area the coarse ring sinks out of sight.
 */
export function buildTerrain(terrain: Terrain, look: TerrainLook = {}): THREE.Group {
  const g = new THREE.Group();
  const margin = 320;
  const x0 = terrain.min.x - margin,
    x1 = terrain.max.x + margin,
    z0 = terrain.min.z - margin,
    z1 = terrain.max.z + margin;
  const span = Math.max(x1 - x0, z1 - z0);
  const cell = Math.max(3, span / 480);
  const range = (a: number, b: number, step: number) => {
    const out: number[] = [];
    const n = Math.ceil((b - a) / step);
    for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
    return out;
  };
  g.add(terrainMesh(terrain, look, range(x0, x1, cell), range(z0, z1, cell)));
  // Coarse ring to the horizon.
  const R = 5000;
  const coarse = range(-R, R, 50).map((v) => v + terrain.cx);
  const coarseZ = range(-R, R, 50).map((v) => v + terrain.cz);
  const inside = (x: number, z: number) => x > x0 + 60 && x < x1 - 60 && z > z0 + 60 && z < z1 - 60;
  g.add(terrainMesh(terrain, look, coarse, coarseZ, (x, z) => (inside(x, z) ? 40 : 0)));
  return g;
}

export type FoliageKind = 'pine' | 'broad' | 'autumn' | 'mallorn' | 'dead';

/** Forests and rocks, instanced: organic canopies with leaf cards, swaying in the wind. */
export function buildFoliage(
  terrain: Terrain,
  opts: {
    count?: number;
    pineShare?: number;
    keepOut?: (x: number, z: number) => boolean;
    /** Multi-land tracks choose the tree kind (or none) per spot. */
    kindAt?: (x: number, z: number, s: number) => FoliageKind | null;
  } = {},
): THREE.Group {
  const g = new THREE.Group();
  const KINDS: FoliageKind[] = ['pine', 'broad', 'autumn', 'mallorn', 'dead'];
  const placed: Record<FoliageKind, THREE.Matrix4[]> = {
    pine: [],
    broad: [],
    autumn: [],
    mallorn: [],
    dead: [],
  };
  const rocks: THREE.Matrix4[] = [];
  let tries = 0,
    count = 0;
  const target = opts.count ?? 1400;
  const rx = (terrain.max.x - terrain.min.x) / 2 + 300,
    rz = (terrain.max.z - terrain.min.z) / 2 + 300;
  const mx = (terrain.max.x + terrain.min.x) / 2,
    mz = (terrain.max.z + terrain.min.z) / 2;
  while (count < target && tries++ < target * 16) {
    const x = mx + (tex.rnd() * 2 - 1) * rx,
      z = mz + (tex.rnd() * 2 - 1) * rz;
    const { d, h, s: ns } = terrain.nearest(x, z);
    if (d < 7 || opts.keepOut?.(x, z)) continue;
    // Clumps: forests where low-frequency noise is high.
    const forest = fbm(x / 90 + 3, z / 90 - 5);
    let kind: FoliageKind | null;
    if (opts.kindAt) {
      kind = opts.kindAt(x, z, ns);
      if (!kind) continue;
      if (kind !== 'mallorn' && forest < 0.45 && tex.rnd() > 0.2) continue;
    } else {
      if (forest < 0.48 && tex.rnd() > 0.15) continue;
      kind = forest > 0.55 && tex.rnd() < (opts.pineShare ?? 1) ? 'pine' : 'broad';
    }
    const y = terrain.heightFrom(x, z, d, h, ns);
    if (y > 80) continue;
    const sc = 0.8 + tex.rnd() * 0.7;
    placed[kind].push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - 0.2, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tex.rnd() * 6.28),
        new THREE.Vector3(sc, sc * (0.9 + tex.rnd() * 0.3), sc),
      ),
    );
    count++;
    if (tex.rnd() < 0.12 && d > 4) {
      const rs = 0.6 + tex.rnd() * 1.8;
      rocks.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x + 4, terrain.height(x + 4, z) - 0.3, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(tex.rnd(), tex.rnd() * 6, tex.rnd())),
          new THREE.Vector3(rs, rs * 0.7, rs),
        ),
      );
    }
  }
  const barkMat = barkMaterial();
  const tint = new THREE.Color();
  for (const k of KINDS) {
    const list = placed[k];
    if (!list.length) continue;
    const geo = TREES[k]();
    const solid = new THREE.InstancedMesh(geo.solid, barkMat, list.length);
    solid.customDepthMaterial = barkDepth();
    const meshes: THREE.InstancedMesh[] = [solid];
    if (geo.leaves) {
      const lm = new THREE.InstancedMesh(geo.leaves, leafMaterial(geo.needles), list.length);
      lm.customDepthMaterial = leafDepth(geo.needles);
      meshes.push(lm);
    }
    list.forEach((m, i) => {
      // Each tree a little lighter or darker, a little warmer or cooler.
      const l = 0.82 + tex.rnd() * 0.3;
      tint.setRGB(l * (0.96 + tex.rnd() * 0.08), l, l * (0.94 + tex.rnd() * 0.1));
      for (const im of meshes) {
        im.setMatrixAt(i, m);
        im.setColorAt(i, tint);
      }
    });
    for (const im of meshes) {
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ map: tex.rock('#8b8781'), roughness: 0.95 });
  const rim = new THREE.InstancedMesh(rockGeo(), rockMat, rocks.length);
  rocks.forEach((m, i) => rim.setMatrixAt(i, m));
  rim.castShadow = true;
  rim.receiveShadow = true;
  g.add(rim);
  return g;
}

/**
 * Tufts of grass along both sides of the road wherever the ground is grassy, tinted to
 * match the land. They sway and shrink away in the distance.
 */
export function buildGrass(
  terrain: Terrain,
  track: Track,
  look?: TerrainLook,
  max = 42000,
): THREE.InstancedMesh {
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const gaps = track.def.gaps ?? [];
  const tunnels = track.def.tunnels ?? [];
  const skip = (s: number) =>
    gaps.some(([a, b]) => s > a - 4 && s < b + 4) ||
    tunnels.some(([a, b]) => s > a - 20 && s < b + 20);
  // The meadow texture's own green, so tufts melt into the ground.
  const base = new THREE.Color('#6fae40');
  for (let pass = 0; pass < 5 && mats.length < max; pass++)
    for (let s = tex.rnd() * 2; s < track.length && mats.length < max; s += 0.8) {
      if (skip(s)) continue;
      const f = track.frameAtS(s);
      for (const side of [-1, 1]) {
        const out = 1.2 + Math.pow(tex.rnd(), 2.2) * 28;
        const lat = side * (f.width / 2 + out);
        const p = track.pointAt(s, lat, 0);
        const { d, h, s: ns } = terrain.nearest(p.x, p.z);
        if (d < 1.2) continue;
        const y = terrain.heightFrom(p.x, p.z, d, h, ns);
        let c = base.clone();
        if (look?.paint) {
          const pt = look.paint(p.x, p.z, y, 0, ns, d);
          const grassy = pt.splat[0] / (pt.splat[0] + pt.splat[1] + pt.splat[2] + pt.splat[3] || 1);
          if (tex.rnd() > grassy * 1.15 - 0.1) continue;
          c = new THREE.Color(base.r * pt.tint[0], base.g * pt.tint[1], base.b * pt.tint[2]);
        }
        const k = 0.8 + tex.rnd() * 0.4;
        cols.push(c.multiplyScalar(k));
        const sc = 0.7 + tex.rnd() * 0.7;
        mats.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, y - 0.05, p.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tex.rnd() * 6.28),
            new THREE.Vector3(sc, sc * (0.8 + tex.rnd() * 0.5), sc),
          ),
        );
      }
    }
  const im = new THREE.InstancedMesh(
    uprightNormals(tuftGeo()),
    grassMaterial(),
    Math.max(1, mats.length),
  );
  // Shuffle the draw order so drawing only the first part (lower quality) thins the grass
  // evenly along the whole track instead of dropping whole stretches.
  const order = mats.map((_, i) => i);
  let seed = 12345;
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  order.forEach((src, i) => {
    im.setMatrixAt(i, mats[src]!);
    im.setColorAt(i, cols[src]!);
  });
  im.count = mats.length;
  im.userData.fullCount = mats.length;
  im.receiveShadow = true;
  im.frustumCulled = false;
  return im;
}

/** Grandstand alongside the start straight, on the outside of the first corner. */
export function buildGrandstand(track: Track): THREE.Group {
  const g = new THREE.Group();
  const f = track.frameAtS(track.length - 70);
  const crowdMat = new THREE.MeshStandardMaterial({ map: tex.crowd(), roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.5, metalness: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xd8292b,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const LEN = 90,
    TIERS = 9;
  for (let t = 0; t < TIERS; t++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.9, 1.4), [
      steel,
      steel,
      steel,
      steel,
      crowdMat,
      steel,
    ]);
    box.position.set(0, 0.45 + t * 0.9, -t * 1.4);
    box.castShadow = box.receiveShadow = true;
    g.add(box);
  }
  (crowdMat.map as THREE.Texture).repeat.set(LEN / 14, 0.14);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 4, 15), roofMat);
  roof.rotation.x = -Math.PI / 2 + 0.25;
  roof.position.set(0, TIERS * 0.9 + 4.5, -6);
  roof.castShadow = true;
  g.add(roof);
  for (let i = -2; i <= 2; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, TIERS * 0.9 + 5, 8), steel);
    post.position.set((i * LEN) / 4.4, (TIERS * 0.9 + 5) / 2, -TIERS * 1.4 - 0.4);
    post.castShadow = true;
    g.add(post);
  }
  // Place on the left (outside) of the straight, facing the road.
  const side = -1;
  const p = new THREE.Vector3(f.pos.x, f.pos.y, f.pos.z).addScaledVector(
    new THREE.Vector3(f.right.x, f.right.y, f.right.z),
    side * (f.width / 2 + 5),
  );
  g.position.copy(p).setY(f.pos.y - 0.4);
  // Local x runs along the road, +z faces the road (= track right, since we're on the left).
  const forward = new THREE.Vector3(f.tan.x, 0, f.tan.z).normalize();
  const facing = new THREE.Vector3(f.right.x, 0, f.right.z).normalize();
  g.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(forward, new THREE.Vector3(0, 1, 0), facing),
  );
  return g;
}

export function buildClouds(terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    emissive: 0xc9d6e6,
    emissiveIntensity: 0.55,
    fog: false,
  });
  const parts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 26; c++) {
    const ang = tex.rnd() * Math.PI * 2,
      rad = 500 + tex.rnd() * 900;
    const cx = terrain.cx + Math.cos(ang) * rad,
      cz = terrain.cz + Math.sin(ang) * rad,
      cy = 220 + tex.rnd() * 160;
    for (let k = 0; k < 6; k++) {
      const r = 20 + tex.rnd() * 26;
      parts.push(
        new THREE.IcosahedronGeometry(r, 3)
          .scale(1.6, 0.6, 1)
          .translate(
            cx + (tex.rnd() - 0.5) * 90,
            cy + (tex.rnd() - 0.5) * 12,
            cz + (tex.rnd() - 0.5) * 50,
          ),
      );
    }
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!,
    mat,
  );
  g.add(mesh);
  return g;
}
