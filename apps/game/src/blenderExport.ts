import * as THREE from 'three';
import { buildBuildings } from './farm/buildings.ts';
import { buildGrandpa } from './farm/grandpa.ts';
import { groundHeight } from './farm/layout.ts';
import { buildMower } from './farm/mower.ts';
import { TREE_KINDS, buildPlants } from './farm/plants.ts';
import { lowOf } from './farm/grandpa/kit.ts';

/**
 * Dev-only: hands the code-built characters to Blender (tools/blender/export.cjs reads
 * `window.__export`). Grandpa is posed at rest (every joint straight, as he was modelled), and
 * each body mesh is listed in build order with its rest-pose world positions and triangles,
 * plus the joint it hangs from. The head is left out: it moves as one piece with the neck.
 */

const JOINTS = ['hips', 'spine', 'chest', 'neck'].concat(
  ...['R', 'L'].map((s) =>
    ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].map((j) => `${j}.${s}`),
  ),
);

function grandpaRest() {
  const gp = buildGrandpa();
  const g = gp.group;
  const byName = new Map<string, THREE.Object3D>();
  g.traverse((o) => JOINTS.includes(o.name) && byName.set(o.name, o));
  for (const o of byName.values()) o.rotation.set(0, 0, 0);
  byName.get('hips')!.position.set(0, 0.955, 0);
  g.updateMatrixWorld(true);
  const head = byName.get('neck')!.children.find((c) => !JOINTS.includes(c.name));
  const joints = JOINTS.map((name) => {
    const o = byName.get(name)!;
    let p = o.parent;
    while (p && !JOINTS.includes(p.name)) p = p.parent;
    return { name, parent: p?.name ?? null, world: o.matrixWorld.elements.slice() };
  });
  const meshes: {
    i: number;
    joint: string;
    lo: boolean;
    radius: number;
    pos: number[];
    tri: number[];
  }[] = [];
  let i = 0;
  const tmp = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const index = i++;
    let p: THREE.Object3D | null = m;
    while (p && p !== head && !JOINTS.includes(p.name)) p = p.parent;
    if (!p || p === head) return;
    for (const [geo, lo] of [
      [m.geometry, false],
      [lowOf(m.geometry), true],
    ] as const) {
      if (!geo) continue;
      const a = geo.attributes.position!;
      const pos: number[] = [];
      for (let k = 0; k < a.count; k++) {
        tmp.fromBufferAttribute(a, k).applyMatrix4(m.matrixWorld);
        pos.push(+tmp.x.toFixed(5), +tmp.y.toFixed(5), +tmp.z.toFixed(5));
      }
      const tri = geo.index ? Array.from(geo.index.array) : [...Array(a.count).keys()];
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      meshes.push({ i: index, joint: p.name, lo, radius: geo.boundingSphere!.radius, pos, tri });
    }
  });
  return { joints, meshes, total: i };
}

/**
 * The farm's buildings, one entry per building (each top-level object of the buildings
 * group): every mesh in build order with its world-space positions, normals and triangles.
 * Instanced meshes are counted but not exported.
 */
function meshesOf(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const tmp = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const out: { b: number; i: number; pos: number[]; nrm: number[]; tri: number[] }[] = [];
  let i = 0;
  root.children.forEach((top, bi) => {
    top.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const index = i++;
      if ((m as THREE.InstancedMesh).isInstancedMesh || !m.visible) return;
      const geo = m.geometry;
      const a = geo.attributes.position!;
      const n = geo.attributes.normal;
      nm.getNormalMatrix(m.matrixWorld);
      const pos: number[] = [],
        nrm: number[] = [];
      for (let k = 0; k < a.count; k++) {
        tmp.fromBufferAttribute(a, k).applyMatrix4(m.matrixWorld);
        pos.push(+tmp.x.toFixed(4), +tmp.y.toFixed(4), +tmp.z.toFixed(4));
        if (n) {
          tmp.fromBufferAttribute(n, k).applyMatrix3(nm).normalize();
          nrm.push(+tmp.x.toFixed(3), +tmp.y.toFixed(3), +tmp.z.toFixed(3));
        }
      }
      const tri = geo.index ? Array.from(geo.index.array) : [...Array(a.count).keys()];
      out.push({ b: bi, i: index, pos, nrm, tri });
    });
  });
  return { out, total: i };
}

function buildings() {
  const b = buildBuildings();
  const { out, total: i } = meshesOf(b.group);
  // The ground around them (an occluder for the bake): heights on a 1 m grid over their extent
  // plus a margin, in world metres (world = map x, height, -map y).
  const box = new THREE.Box3().setFromObject(b.group);
  const x0 = Math.floor(box.min.x) - 6,
    x1 = Math.ceil(box.max.x) + 6,
    z0 = Math.floor(box.min.z) - 6,
    z1 = Math.ceil(box.max.z) + 6;
  const heights: number[] = [];
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) heights.push(+groundHeight(x, -z).toFixed(3));
  const ground = { x0, z0, nx: x1 - x0 + 1, nz: z1 - z0 + 1, heights };
  return { meshes: out, total: i, ground, names: b.group.children.map((c) => c.name || c.type) };
}

/** Grandpa's lawn tractor on level ground (y = 0), every mesh in build order. */
function mower() {
  const m = buildMower();
  const { out, total } = meshesOf(m.group);
  const heights = new Array(41 * 41).fill(0);
  return { meshes: out, total, ground: { x0: -20, z0: -20, nx: 41, nz: 41, heights } };
}

/** Every tree kind the farm uses, at its reference size: trunk and branches, and leaves. */
function trees() {
  buildPlants();
  const part = (g: THREE.BufferGeometry | null) => {
    if (!g) return null;
    const a = g.attributes.position!;
    const pos: number[] = [];
    for (let k = 0; k < a.count * 3; k++) pos.push(+a.array[k]!.toFixed(4));
    const tri = g.index ? Array.from(g.index.array) : [...Array(a.count).keys()];
    return { pos, tri };
  };
  return { kinds: TREE_KINDS.map((t) => ({ solid: part(t.solid), leaves: part(t.leaves) })) };
}

const what = new URLSearchParams(location.search).get('what') ?? 'grandpa';
(window as unknown as { __export: unknown }).__export =
  what === 'buildings'
    ? { buildings: buildings() }
    : what === 'mower'
      ? { mower: mower() }
      : what === 'trees'
        ? { trees: trees() }
        : { grandpa: grandpaRest() };
