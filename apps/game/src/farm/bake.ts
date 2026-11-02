import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bake a group of small meshes into one mesh per material bucket: each part's material
 * colour becomes vertex colour, its transform is applied, and the geometry is merged. Far
 * fewer draw calls, and a merged bush or vine row sways as one in the breeze (every vertex
 * shares the same origin).
 */
export function bake(
  root: THREE.Object3D,
  buckets: { from: THREE.Material[]; to: THREE.Material }[],
): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = buckets.map(() => [] as THREE.BufferGeometry[]);
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const i = buckets.findIndex((b) => b.from.includes(mesh.material as THREE.Material));
    if (i < 0) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    const c = (mesh.material as THREE.MeshStandardMaterial).color;
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) col.set([c.r, c.g, c.b], v * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts[i]!.push(g);
  });
  return buckets.map((b, i) => {
    const merged = mergeGeometries(parts[i]!)!;
    const mesh = new THREE.Mesh(merged, b.to);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
}
