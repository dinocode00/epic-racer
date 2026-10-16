import * as THREE from 'three';
import type { Frame, Track, Vec3 } from '@epic/sim';
import * as tex from './textures.ts';

export interface Vert {
  p: Vec3;
  n: Vec3;
  u: number;
}

export const tv = (v: Vec3): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z);
export const off = (f: Frame, lat: number, h: number): Vec3 => ({
  x: f.pos.x + f.right.x * lat + f.up.x * h,
  y: f.pos.y + f.right.y * lat + f.up.y * h,
  z: f.pos.z + f.right.z * lat + f.up.z * h,
});
export const neg = (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, z: -v.z });

/**
 * Sweep a cross-section profile along the track between arc lengths [s0, s1].
 * `vLen` is how many metres one texture repeat covers along the road.
 */
export function sweep(
  track: Track,
  s0: number,
  s1: number,
  step: number,
  vLen: number,
  profile: (f: Frame, s: number) => Vert[],
): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const n = Math.max(1, Math.round((s1 - s0) / step));
  let cols = 0;
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const verts = profile(track.frameAtS(s), s);
    cols = verts.length;
    for (const v of verts) {
      pos.push(v.p.x, v.p.y, v.p.z);
      nor.push(v.n.x, v.n.y, v.n.z);
      uv.push(v.u, s / vLen);
    }
  }
  // Wind each quad so its face normal agrees with the profile's vertex normal.
  const P = (k: number) => new THREE.Vector3(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c,
        b = a + 1,
        d = a + cols,
        e = d + 1;
      const fn = new THREE.Vector3().crossVectors(P(b).sub(P(a)), P(d).sub(P(a)));
      const vn = new THREE.Vector3(nor[a * 3]!, nor[a * 3 + 1]!, nor[a * 3 + 2]!);
      if (fn.dot(vn) >= 0) idx.push(a, b, d, b, e, d);
      else idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Curvature per frame, used to decide where kerbs go. */
function curvature(track: Track, i: number): number {
  const a = track.frame(i - 4).tan,
    b = track.frame(i + 4).tan;
  const d = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(d) / (8 * track.spacing);
}

/** Per-track look of the road and its furniture. */
export interface RoadStyle {
  road: () => THREE.Texture;
  /** Metres of road per texture repeat. */
  roadTile: number;
  roadRoughness: number;
  underside: () => THREE.Texture;
  barrier: {
    map: () => THREE.Texture;
    height: number;
    thickness: number;
    tile: number;
    mirrorRight: boolean;
    bump?: () => THREE.Texture;
  };
  kerbs: boolean;
  gantry: (f: Frame) => THREE.Object3D;
  /** Arc-length ranges that are bridges: no solid embankment underneath. */
  bridges?: [number, number][];
  padColor?: number;
  /** Glowing map for the road surface (lava cracks). */
  roadEmissive?: () => THREE.Texture;
}

export const DEFAULT_ROAD: RoadStyle = {
  road: tex.asphalt,
  roadTile: 14,
  roadRoughness: 0.92,
  underside: tex.concrete,
  barrier: { map: tex.barrier, height: 1.1, thickness: 0.6, tile: 4.4, mirrorRight: true },
  kerbs: true,
  gantry: (f) => gantry(f),
};

/** A track made of several lands: the road style can change along the lap. */
export interface RoadPlan {
  styleAt: (s: number) => RoadStyle;
  /** Arc lengths where the style may change (region starts). */
  boundaries: number[];
  gaps?: [number, number][];
  open?: [number, number][];
}

const matCache = new WeakMap<RoadStyle, Record<string, THREE.Material>>();
function materialsFor(style: RoadStyle): Record<string, THREE.Material> {
  let m = matCache.get(style);
  if (m) return m;
  const road = new THREE.MeshStandardMaterial({
    map: style.road(),
    roughness: style.roadRoughness,
    metalness: 0,
  });
  if (style.roadEmissive) {
    road.emissive = new THREE.Color(0xffffff);
    road.emissiveMap = style.roadEmissive();
    road.emissiveIntensity = 1.4;
  }
  const under = new THREE.MeshStandardMaterial({
    color: 0xd8d6d0,
    roughness: 0.95,
    map: style.underside(),
  });
  const barrier = new THREE.MeshStandardMaterial({ map: style.barrier.map(), roughness: 0.85 });
  m = {
    road,
    under,
    barrier,
    kerb: new THREE.MeshStandardMaterial({ map: tex.kerb(), roughness: 0.7 }),
  };
  matCache.set(style, m);
  return m;
}

export function buildTrackMesh(
  track: Track,
  plan: RoadStyle | RoadPlan = DEFAULT_ROAD,
): THREE.Group {
  const g = new THREE.Group();
  const L = track.length;
  const P: RoadPlan = 'styleAt' in plan ? plan : { styleAt: () => plan, boundaries: [] };
  const inR = (ranges: [number, number][] | undefined, s: number) =>
    (ranges ?? []).some(([a, b]) => s >= a && s <= b);
  // Cut the lap wherever the style, a gap or an open edge starts or ends.
  const cuts = new Set<number>([0, L, ...P.boundaries]);
  for (const [a, b] of [...(P.gaps ?? []), ...(P.open ?? [])]) {
    cuts.add(a);
    cuts.add(b);
  }
  const sorted = [...cuts].filter((c) => c >= 0 && c <= L).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!,
      b = sorted[i + 1]!;
    if (b - a < 0.5) continue;
    const mid = (a + b) / 2;
    if (inR(P.gaps, mid)) continue; // nothing to drive on: fly!
    buildSegment(g, track, a, b, P.styleAt(mid), inR(P.open, mid));
  }
  const style = P.styleAt(0);

  // --- Start line + gantry ---
  const f0 = track.frameAtS(0);
  const checkerMat = new THREE.MeshStandardMaterial({ map: tex.checker(), roughness: 0.6 });
  const line = new THREE.Mesh(
    sweep(track, -1.5, 1.5, 3, 3, (f) => [
      { p: off(f, -f.width / 2, 0.03), n: f.up, u: 0 },
      { p: off(f, f.width / 2, 0.03), n: f.up, u: 1 },
    ]),
    checkerMat,
  );
  line.receiveShadow = true;
  g.add(line);
  g.add(style.gantry(f0));

  // --- Boost pads ---
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x331100,
    emissive: style.padColor ?? 0xffffff,
    emissiveMap: tex.chevrons(),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  for (const s of track.def.boostPads ?? []) {
    const pad = new THREE.Mesh(
      sweep(track, s - 3, s + 3, 1, 6, (f) => [
        { p: off(f, -2.8, 0.04), n: f.up, u: 0 },
        { p: off(f, 2.8, 0.04), n: f.up, u: 1 },
      ]),
      padMat,
    );
    // Map v so the chevrons point forward: v runs 0..1 across the 6 m pad.
    const uvs = pad.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++) uvs.setY(i, (uvs.getY(i) * 6 - (s - 3)) / 6);
    g.add(pad);
  }
  return g;
}

function buildSegment(
  g: THREE.Group,
  track: Track,
  s0: number,
  s1: number,
  style: RoadStyle,
  open: boolean,
): void {
  const step = 1.5;
  const M = materialsFor(style);
  const onBridge = (s: number) => open || (style.bridges ?? []).some(([a, b]) => s >= a && s <= b);
  const B = style.barrier;

  // --- Road surface (top) ---
  const road = new THREE.Mesh(
    sweep(track, s0, s1, step, style.roadTile, (f) => {
      const out: Vert[] = [];
      const SUB = 8;
      for (let k = 0; k <= SUB; k++) {
        const t = k / SUB;
        out.push({ p: off(f, (t - 0.5) * f.width, 0), n: f.up, u: t });
      }
      return out;
    }),
    M.road,
  );
  road.receiveShadow = true;
  g.add(road);

  // --- Underside and embankment skirts (a thin deck on bridges and open edges) ---
  const edge = open ? 0.3 : B.thickness;
  const top = open ? 0 : B.height;
  const under = new THREE.Mesh(
    sweep(track, s0, s1, step, 10, (f, s) => {
      const hw = f.width / 2 + edge;
      const ground = f.up.y > 0.75 && !onBridge(s);
      const depth = ground ? 7 : 0.8;
      const down = ground ? { x: 0, y: -1, z: 0 } : neg(f.up);
      const L0 = off(f, -hw, top),
        R0 = off(f, hw, top);
      const Ld = { x: L0.x + down.x * depth, y: L0.y + down.y * depth, z: L0.z + down.z * depth };
      const Rd = { x: R0.x + down.x * depth, y: R0.y + down.y * depth, z: R0.z + down.z * depth };
      return [
        { p: L0, n: neg(f.right), u: 0 },
        { p: Ld, n: neg(f.right), u: 0.5 },
        { p: Ld, n: neg(f.up), u: 0.5 },
        { p: Rd, n: neg(f.up), u: 1.5 },
        { p: Rd, n: f.right, u: 1.5 },
        { p: R0, n: f.right, u: 2 },
      ];
    }),
    M.under,
  );
  under.receiveShadow = true;
  g.add(under);
  if (open) {
    // A narrow lip so the open edge reads, but no wall.
    for (const side of [-1, 1]) {
      g.add(
        new THREE.Mesh(
          sweep(track, s0, s1, step, B.tile, (f) => [
            { p: off(f, (f.width / 2) * side, 0), n: f.up, u: 0.1 },
            { p: off(f, (f.width / 2 + 0.3) * side, 0.12), n: f.up, u: 0.2 },
          ]),
          M.barrier,
        ),
      );
    }
    return;
  }

  // --- Barriers on both edges ---
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      sweep(track, s0, s1, step, B.tile, (f) => {
        const a = (f.width / 2) * side,
          b = (f.width / 2 + B.thickness) * side;
        const inward = side > 0 ? neg(f.right) : f.right;
        const outward = neg(inward);
        return [
          { p: off(f, a, 0), n: inward, u: 0.0 },
          { p: off(f, a, B.height), n: inward, u: 1.0 },
          { p: off(f, a, B.height), n: f.up, u: 0.99 },
          { p: off(f, b, B.height), n: f.up, u: 0.99 },
          { p: off(f, b, B.height), n: outward, u: 1.0 },
          { p: off(f, b, -0.5), n: outward, u: 0.0 },
        ];
      }),
      M.barrier,
    );
    // Barrier texture: u is vertical here, v runs along the road, so rotate it.
    const uvs = wall.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i),
        v = uvs.getY(i);
      // Flip the right-hand wall so its lettering isn't mirrored.
      uvs.setXY(i, side > 0 && B.mirrorRight ? -v : v, u);
    }
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  // --- Kerbs on corners ---
  if (!style.kerbs) return;
  const inCorner = (i: number) => curvature(track, i) > 0.006;
  let start = -1;
  const ranges: [number, number][] = [];
  const i0 = Math.floor(s0 / track.spacing),
    i1 = Math.ceil(s1 / track.spacing);
  for (let i = i0; i <= i1; i++) {
    const c = i < i1 && inCorner(i);
    if (c && start < 0) start = i;
    if (!c && start >= 0) {
      if (i - start > 6) ranges.push([start * track.spacing, i * track.spacing]);
      start = -1;
    }
  }
  for (const [a, b] of ranges) {
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        sweep(track, a, b, 1, 4, (f) => {
          const o = (f.width / 2) * side,
            i = (f.width / 2 - 1.2) * side;
          return [
            { p: off(f, i, 0.02), n: f.up, u: 0 },
            { p: off(f, (o + i) / 2, 0.09), n: f.up, u: 0.5 },
            { p: off(f, o, 0.04), n: f.up, u: 1 },
          ];
        }),
        M.kerb,
      );
      kerb.receiveShadow = true;
      g.add(kerb);
    }
  }
}

function gantry(f: Frame): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2c2f36,
    roughness: 0.45,
    metalness: 0.7,
  });
  const hw = f.width / 2 + 1.6;
  const H = 8;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), steel);
    leg.position.copy(tv(off(f, hw * side, H / 2)));
    leg.castShadow = true;
    g.add(leg);
  }
  const bannerTex = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#14131c';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < w / 16; i++) {
        x.fillStyle = i % 2 ? '#f4f4f4' : '#111';
        x.fillRect(i * 16, 0, 16, 10);
        x.fillStyle = i % 2 ? '#111' : '#f4f4f4';
        x.fillRect(i * 16, h - 10, 16, 10);
      }
      x.fillStyle = '#ffd23f';
      x.font = 'bold 64px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('EPIC RACER', w / 2, h / 2 + 4);
    },
    512,
    96,
  );
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.9, 1.8, 0.6), [
    steel,
    steel,
    steel,
    steel,
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5 }),
  ]);
  banner.position.copy(tv(off(f, 0, H - 0.6)));
  // Face down the track.
  const m = new THREE.Matrix4().makeBasis(tv(f.right), tv(f.up), tv(neg(f.tan)));
  banner.quaternion.setFromRotationMatrix(m);
  banner.castShadow = true;
  g.add(banner);
  return g;
}
