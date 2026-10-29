import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as tex from './textures.ts';
import { type WindOptions, addWind, windDepth, windUniforms } from './wind.ts';

/**
 * Organic foliage: lumpy, smoothly shaded canopies fringed with alpha-cut leaf cards,
 * layered pines with needle sprays, twisted dead trees, rounded rocks and roadside grass.
 * Everything sways a little in the wind (one shared clock).
 */

export { windUniforms };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A deterministic little noise for displacing shapes (so every tree kind is stable). */
function wobble(p: THREE.Vector3, f: number, seed: number): number {
  return (
    Math.sin(p.x * f + seed) *
      Math.sin(p.y * f * 1.3 + seed * 1.7) *
      Math.sin(p.z * f * 0.9 + seed * 2.3) +
    0.5 * Math.sin(p.x * f * 2.1 - seed) * Math.sin(p.z * f * 1.9 + seed * 0.6)
  );
}

/** Paint every vertex: base colour, darker underneath and inside, lighter on top. */
function shade(
  g: THREE.BufferGeometry,
  base: THREE.Color,
  centre: THREE.Vector3,
  r: number,
  jitter = 0.08,
): THREE.BufferGeometry {
  const pos = g.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const up = THREE.MathUtils.clamp((p.y - centre.y) / r, -1, 1);
    const k = (0.62 + 0.38 * (up * 0.5 + 0.5)) * (1 - jitter + Math.random() * jitter * 2);
    col.set([base.r * k, base.g * k, base.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A smooth, lumpy blob (one canopy clump). */
function blob(c: THREE.Vector3, r: number, base: THREE.Color, seed: number, squash = 0.85) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position!;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = p.clone().normalize();
    p.addScaledVector(n, wobble(p, 1.6 / r, seed) * r * 0.22);
    p.y *= squash;
    pos.setXYZ(i, p.x + c.x, p.y + c.y, p.z + c.z);
  }
  g.computeVertexNormals();
  return shade(g, base, c, r);
}

/** Leaf cards scattered over the surface of a canopy clump, facing outward. */
function cards(
  c: THREE.Vector3,
  r: number,
  n: number,
  size: number,
  base: THREE.Color,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const dir = V(
      Math.random() * 2 - 1,
      Math.random() * 1.6 - 0.5,
      Math.random() * 2 - 1,
    ).normalize();
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateZ(Math.random() * Math.PI * 2);
    q.setFromUnitVectors(V(0, 0, 1), dir);
    g.applyQuaternion(q);
    const at = c.clone().addScaledVector(dir, r * (0.8 + Math.random() * 0.3));
    g.translate(at.x, at.y, at.z);
    const k = 0.75 + 0.35 * (dir.y * 0.5 + 0.5);
    const col = new Float32Array(4 * 3);
    for (let v = 0; v < 4; v++) col.set([base.r * k, base.g * k, base.b * k], v * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

function bark(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  return shade(g.index ? g.toNonIndexed() : g, c, V(0, 2, 0), 4, 0.05);
}

function branch(points: THREE.Vector3[], r: number, hex: number): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, r, 6, false);
  return bark(g, hex);
}

const strip = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes))
    if (!['position', 'normal', 'color', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv)
    out.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(out.attributes.position!.count * 2), 2),
    );
  return out;
};
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(strip))!;

export interface TreeGeo {
  solid: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry | null;
  /** Leaf texture: broadleaf clusters or pine needles. */
  needles?: boolean;
}

function broadTree(leaf: number[], trunk = 0x5e4330, seed = 1): TreeGeo {
  const cols = leaf.map((h) => new THREE.Color(h));
  const solid = [
    bark(new THREE.CylinderGeometry(0.2, 0.42, 3.6, 9).translate(0, 1.8, 0), trunk),
    branch([V(0, 2.6, 0), V(0.8, 3.4, 0.2), V(1.4, 4.0, 0.5)], 0.12, trunk),
    branch([V(0, 2.9, 0), V(-0.7, 3.7, -0.3), V(-1.2, 4.3, -0.6)], 0.11, trunk),
    branch([V(0, 3.1, 0), V(0.1, 4.0, 0.9), V(0.2, 4.4, 1.3)], 0.1, trunk),
  ];
  const clumps: [THREE.Vector3, number][] = [
    [V(0, 4.9, 0), 2.2],
    [V(1.4, 4.4, 0.6), 1.6],
    [V(-1.3, 4.6, -0.6), 1.7],
    [V(0.3, 6.0, -0.2), 1.5],
    [V(-0.4, 4.3, 1.3), 1.4],
  ];
  const leaves: THREE.BufferGeometry[] = [];
  clumps.forEach(([c, r], i) => {
    solid.push(blob(c, r * 0.92, cols[i % cols.length]!, seed + i));
    leaves.push(cards(c, r, Math.round(r * 16), 1.5, cols[(i + 1) % cols.length]!));
  });
  return { solid: merge(solid), leaves: merge(leaves) };
}

function pineTree(): TreeGeo {
  const trunk = 0x553a26;
  const greens = [0x24502c, 0x2c5d33, 0x336a3a, 0x3b7541].map((h) => new THREE.Color(h));
  const solid = [bark(new THREE.CylinderGeometry(0.14, 0.34, 8, 8).translate(0, 4, 0), trunk)];
  const leaves: THREE.BufferGeometry[] = [];
  const tiers = 6;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const r = 2.7 - t * 2.1;
    const y = 1.7 + k * 1.15;
    let g: THREE.BufferGeometry = new THREE.ConeGeometry(r, 2.1, 14, 3, true);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position!;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const rim = THREE.MathUtils.clamp((-p.y + 1.05) / 2.1, 0, 1); // 1 at the bottom rim
      const a = Math.atan2(p.z, p.x);
      // Jagged, drooping branch tips around the rim.
      const tip = 1 + rim * (0.18 * Math.sin(a * 7 + k) + 0.1 * Math.sin(a * 13 + k * 2));
      p.x *= tip;
      p.z *= tip;
      p.y -= rim * rim * 0.35;
      pos.setXYZ(i, p.x, p.y + y + 1.05, p.z);
    }
    g.computeVertexNormals();
    solid.push(shade(g, greens[k % greens.length]!, V(0, y + 1, 0), 1.6));
    leaves.push(
      cards(
        V(0, y + 0.3, 0),
        r * 0.85,
        Math.round(8 + r * 7),
        1.25,
        greens[(k + 2) % greens.length]!,
      ),
    );
  }
  return { solid: merge(solid), leaves: merge(leaves), needles: true };
}

function mallornTree(): TreeGeo {
  const silver = 0xc8ccd2;
  const gold = [0xe2c04a, 0xd4b23a, 0xf0d468, 0xc9a332].map((h) => new THREE.Color(h));
  const solid = [bark(new THREE.CylinderGeometry(0.85, 1.6, 26, 14).translate(0, 13, 0), silver)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    solid.push(
      branch(
        [
          V(0, 19 + i, 0),
          V(Math.cos(a) * 3, 22 + i, Math.sin(a) * 3),
          V(Math.cos(a) * 5, 24 + i * 0.6, Math.sin(a) * 5),
        ],
        0.35,
        silver,
      ),
    );
  }
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = i === 6 ? V(0, 29, 0) : V(Math.cos(a) * 4.6, 24 + (i % 2) * 3, Math.sin(a) * 4.6);
    const r = i === 6 ? 4.6 : 3.8;
    solid.push(blob(c, r, gold[i % gold.length]!, 10 + i, 0.6));
    leaves.push(cards(c, r, 26, 2.6, gold[(i + 1) % gold.length]!));
  }
  return { solid: merge(solid), leaves: merge(leaves) };
}

function deadTree(): TreeGeo {
  const c = 0x2e2622;
  const solid = [bark(new THREE.CylinderGeometry(0.12, 0.42, 4.4, 8).translate(0, 2.2, 0), c)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i;
    const y = 2.2 + i * 0.45;
    const d = 1.2 + (i % 2) * 0.6;
    solid.push(
      branch(
        [
          V(0, y, 0),
          V(Math.cos(a) * d * 0.5, y + 0.7, Math.sin(a) * d * 0.5),
          V(Math.cos(a + 0.3) * d, y + 1.5, Math.sin(a + 0.3) * d),
          V(Math.cos(a + 0.5) * d * 1.3, y + 1.8, Math.sin(a + 0.5) * d * 1.3),
        ],
        0.07,
        c,
      ),
    );
  }
  return { solid: merge(solid), leaves: null };
}

export type TreeKind = 'pine' | 'broad' | 'autumn' | 'mallorn' | 'dead';
export const TREES: Record<TreeKind, () => TreeGeo> = {
  pine: pineTree,
  broad: () => broadTree([0x4a8c3c, 0x55a046, 0x3f7d36, 0x5fa84c]),
  autumn: () => broadTree([0xd98a30, 0xe3a23a, 0xcf7a2c, 0xd99a36], 0x4f3626, 7),
  mallorn: mallornTree,
  dead: deadTree,
};

/** Rounded, lumpy boulder. */
export function rockGeo(): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.multiplyScalar(1 + wobble(p, 2.2, 3) * 0.22);
    pos.setXYZ(i, p.x, p.y, p.z);
    uv.set([Math.atan2(p.z, p.x) / Math.PI + 1, p.y * 0.5 + 0.5], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ materials

/** Trees bend away from the breeze and sway, more the higher up; leaf cards also flutter. */
const treeWind = (amount: number, flutter: number): WindOptions => ({
  lean: amount * 1.4,
  sway: amount,
  flutter,
  h0: 1.2,
});
const BARK_WIND = treeWind(0.012, 0);
const LEAF_WIND = treeWind(0.014, 0.05);

let leafMap: THREE.Texture | null = null;
let needleMap: THREE.Texture | null = null;
let grassMap: THREE.Texture | null = null;

export function barkMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  addWind(m, BARK_WIND, 'solid');
  return m;
}

/** Shadow caster for tree bodies that sways with them. */
export function barkDepth(): THREE.MeshDepthMaterial {
  return windDepth(BARK_WIND, 'solid');
}

export function leafMaterial(needles = false): THREE.MeshStandardMaterial {
  const map = needles ? (needleMap ??= tex.needleCluster()) : (leafMap ??= tex.leafCluster());
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.85,
  });
  addWind(m, LEAF_WIND, needles ? 'needles' : 'leaves');
  return m;
}

export function leafDepth(needles = false): THREE.MeshDepthMaterial {
  const map = needles ? (needleMap ??= tex.needleCluster()) : (leafMap ??= tex.leafCluster());
  return windDepth(LEAF_WIND, needles ? 'needles' : 'leaves', map, 0.45);
}

// ------------------------------------------------------------------ grass

/** One grass tuft: three crossed, alpha-cut cards, dark at the root, light at the tips. */
export function tuftGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(1.7, 0.6).translate(0, 0.29, 0);
    g.rotateY((i / 3) * Math.PI);
    const pos = g.attributes.position!;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = pos.getY(v) > 0.3 ? 1.15 : 0.72;
      col.set([k, k, k], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // A real back face (not DoubleSide), so the up-facing normals aren't flipped dark.
    parts.push(g, g.clone().rotateY(Math.PI));
  }
  return mergeGeometries(parts)!;
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: (grassMap ??= tex.grassBlades()),
    alphaTest: 0.5,
    roughness: 1,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        // Shrink away in the distance: no shimmer, less to draw.
        float fade = 1.0 - smoothstep(70.0, 120.0, distance(cameraPosition, ip));
        transformed *= fade;
        float tip = max(position.y, 0.0);
        transformed.x += sin(uTime * 2.1 + ip.x * 0.3 + ip.z * 0.2) * 0.12 * tip;
        transformed.z += cos(uTime * 1.7 + ip.z * 0.3) * 0.08 * tip;`,
      );
  };
  m.customProgramCacheKey = () => 'grass';
  return m;
}

/** Normals pointing up for the whole tuft, so it shades like the ground it grows from. */
export function uprightNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.normal!;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** The pieces the tree builders use, for scenes that model their own species. */
export const treeKit = { wobble, shade, blob, cards, bark, branch, merge };
