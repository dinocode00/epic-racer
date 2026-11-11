import * as THREE from 'three';
import { buildGrandpa } from './farm/grandpa.ts';
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

(window as unknown as { __export: unknown }).__export = { grandpa: grandpaRest() };
