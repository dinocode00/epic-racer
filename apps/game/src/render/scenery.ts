import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Track } from '@epic/sim';
import * as tex from './textures.ts';

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

export class Terrain {
  private pts: { x: number; z: number; h: number; hw: number }[];
  readonly cx: number;
  readonly cz: number;
  readonly opts: TerrainOpts;

  constructor(track: Track, opts: TerrainOpts = {}) {
    this.opts = opts;
    this.pts = [];
    let sx = 0,
      sz = 0;
    for (let i = 0; i < track.count; i += 2) {
      const f = track.frame(i);
      sx += f.pos.x;
      sz += f.pos.z;
      if (f.up.y < 0.8) continue; // loops and walls don't shape the ground
      const lift = (f.width / 2) * Math.sqrt(Math.max(0, 1 - f.up.y * f.up.y));
      this.pts.push({ x: f.pos.x, z: f.pos.z, h: f.pos.y - lift - 0.25, hw: f.width / 2 });
    }
    this.cx = sx / (track.count / 2);
    this.cz = sz / (track.count / 2);
  }

  /** Distance from (x,z) to the road edge, and the road's height there. */
  nearest(x: number, z: number): { d: number; h: number } {
    let bd = Infinity,
      bh = 0,
      hw = 9;
    for (const p of this.pts) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        bh = p.h;
        hw = p.hw;
      }
    }
    return { d: Math.sqrt(bd) - hw, h: bh };
  }

  height(x: number, z: number): number {
    const { d, h } = this.nearest(x, z);
    return this.heightFrom(x, z, d, h);
  }

  heightFrom(x: number, z: number, d: number, roadH: number): number {
    const o = this.opts;
    const rc = Math.hypot(x - this.cx, z - this.cz);
    const hs = o.hillScale ?? 140;
    const hills = (fbm(x / hs, z / hs) - 0.35) * (6 + smooth(d, 20, 220) * (o.hillAmp ?? 26));
    const ms = o.mountainStart ?? 420;
    const mountains =
      smooth(rc, ms, ms + 480) * (fbm(x / 260 + 7, z / 260) * (o.mountainAmp ?? 220) + 30);
    const wild = hills + mountains;
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
    return h;
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
}

export function buildTerrain(terrain: Terrain, look: TerrainLook = {}): THREE.Mesh {
  const SIZE = 2400,
    N = 420;
  const geo = new THREE.PlaneGeometry(2, 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Warp the grid: ~1.4 m cells around the track, ~16 m cells at the horizon.
  const warp = (u: number) => (SIZE / 2) * (0.25 * u + 0.75 * u * u * u);
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, terrain.cx + warp(pos.getX(i)), 0, terrain.cz + warp(pos.getZ(i)));
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    const { d, h } = terrain.nearest(x, z);
    const y = terrain.heightFrom(x, z, d, h);
    pos.setY(i, y);
    uv.setXY(i, x / 24, z / 24);
    // Colour: dirt shoulder by the road, grass, rock on mountains, snow on peaks.
    const c = new THREE.Color(1, 1, 1);
    const shoulder = 1 - smooth(d, 1, 6);
    const rockT = smooth(y, 40, 90);
    const snowT = smooth(y, 150, 190);
    const tint = 0.85 + fbm(x / 30, z / 30) * 0.3;
    c.setRGB(tint, tint, tint);
    c.lerp(look.shoulder ?? new THREE.Color(1.35, 1.05, 0.7), shoulder * 0.6);
    c.lerp(new THREE.Color(1.05, 1.0, 0.95), rockT);
    c.lerp(new THREE.Color(2.4, 2.4, 2.5), snowT);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const grass = (look.grass ?? tex.grass)();
  const mat = new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function pineGeo(): THREE.BufferGeometry {
  const parts = [
    colored(new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(0, 1, 0), 0x6b4a2e),
  ];
  const greens = [0x2f6b35, 0x37783c, 0x418844];
  for (let k = 0; k < 3; k++) {
    const r = 2.6 - k * 0.65;
    parts.push(
      colored(new THREE.ConeGeometry(r, 3.2, 8).translate(0, 2.6 + k * 1.6, 0), greens[k]!),
    );
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
}

function broadleafGeo(): THREE.BufferGeometry {
  const parts = [
    colored(new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0), 0x6b4a2e),
    colored(new THREE.IcosahedronGeometry(2.6, 1).scale(1, 0.85, 1).translate(0, 4.6, 0), 0x4f9440),
    colored(new THREE.IcosahedronGeometry(1.8, 1).translate(1.4, 4.0, 0.6), 0x5aa548),
    colored(new THREE.IcosahedronGeometry(1.7, 1).translate(-1.2, 4.2, -0.7), 0x46863a),
  ];
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
}

/** Forests and rocks, instanced. */
export function buildFoliage(
  terrain: Terrain,
  opts: { count?: number; pineShare?: number; keepOut?: (x: number, z: number) => boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    flatShading: true,
  });
  const kinds = [pineGeo(), broadleafGeo()];
  const placed: THREE.Matrix4[][] = [[], []];
  const rocks: THREE.Matrix4[] = [];
  let tries = 0;
  const target = opts.count ?? 1400;
  while (placed[0]!.length + placed[1]!.length < target && tries++ < 20000) {
    const ang = tex.rnd() * Math.PI * 2;
    const rad = Math.sqrt(tex.rnd()) * 700;
    const x = terrain.cx + Math.cos(ang) * rad,
      z = terrain.cz + Math.sin(ang) * rad;
    const { d, h } = terrain.nearest(x, z);
    if (d < 7 || opts.keepOut?.(x, z)) continue;
    // Clumps: forests where low-frequency noise is high.
    const forest = fbm(x / 90 + 3, z / 90 - 5);
    if (forest < 0.48 && tex.rnd() > 0.15) continue;
    const y = terrain.heightFrom(x, z, d, h);
    if (y > 80) continue;
    const s = 0.8 + tex.rnd() * 0.7;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y - 0.2, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tex.rnd() * 6.28),
      new THREE.Vector3(s, s * (0.9 + tex.rnd() * 0.3), s),
    );
    const pine = forest > 0.55 && tex.rnd() < (opts.pineShare ?? 1);
    placed[pine ? 0 : 1]!.push(m);
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
  kinds.forEach((geo, k) => {
    const im = new THREE.InstancedMesh(geo, leafMat, placed[k]!.length);
    placed[k]!.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8b8781,
    roughness: 0.95,
    flatShading: true,
  });
  const rim = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, rocks.length);
  rocks.forEach((m, i) => rim.setMatrixAt(i, m));
  rim.castShadow = true;
  g.add(rim);
  return g;
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
