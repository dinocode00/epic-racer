import * as THREE from 'three';
import { lowOf } from './kit.ts';
import skinData from './skin.json';

/**
 * Grandpa's skin: per-vertex bone weights worked out by Blender (tools/blender/grandpa.py) for
 * the meshes the code builds. Each weighted mesh becomes a SkinnedMesh on his joint groups, so
 * his clothes bend smoothly across the joints while the rig code poses him exactly as before.
 *
 * Meshes are matched by build order and checked by vertex count; any that don't match (the
 * model changed since the weights were made) stay rigid, so nothing breaks, it just bends
 * less until `grandpa.py` is run again.
 */

interface Packed {
  n: number;
  bones: string;
  weights: string;
}
const DATA = skinData as { bones: string[]; meshes: Record<string, { hi?: Packed; lo?: Packed }> };

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function addWeights(geo: THREE.BufferGeometry, p: Packed | undefined, rigidBone: number): boolean {
  if (geo.attributes.skinIndex) return true;
  const n = geo.attributes.position!.count;
  if (p && p.n !== n) return false;
  const idx = p ? bytes(p.bones) : new Uint8Array(n * 4).fill(rigidBone);
  const w = new Float32Array(n * 4);
  if (p) {
    const q = bytes(p.weights);
    for (let i = 0; i < q.length; i++) w[i] = q[i]! / 255;
  } else for (let i = 0; i < n; i++) w[i * 4] = 1;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(idx), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  return true;
}

/** Turn his weighted meshes into skinned ones. Call once, on a fresh build at rest. */
export function applySkin(group: THREE.Group): void {
  const joints = new Map<string, THREE.Object3D>();
  group.traverse((o) => DATA.bones.includes(o.name) && joints.set(o.name, o));
  if (joints.size !== DATA.bones.length) return;
  group.updateMatrixWorld(true);
  const bones = DATA.bones.map((n) => joints.get(n)!) as unknown as THREE.Bone[];
  const skeleton = new THREE.Skeleton(bones);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
  let skinned = 0;
  meshes.forEach((m, i) => {
    const entry = DATA.meshes[String(i)];
    if (!entry) return;
    // The joint it hangs from: its rigid fallback (the coarse copy may have no weights).
    let owner: THREE.Object3D | null = m.parent;
    while (owner && !DATA.bones.includes(owner.name)) owner = owner.parent;
    const rigid = owner ? DATA.bones.indexOf(owner.name) : 0;
    if (!addWeights(m.geometry, entry.hi, rigid)) return;
    const lo = lowOf(m.geometry);
    if (lo && !addWeights(lo, entry.lo, rigid)) return;
    const s = new THREE.SkinnedMesh(m.geometry, m.material);
    s.name = m.name;
    s.castShadow = m.castShadow;
    s.receiveShadow = m.receiveShadow;
    s.renderOrder = m.renderOrder;
    s.visible = m.visible;
    s.frustumCulled = false;
    s.position.copy(m.position);
    s.quaternion.copy(m.quaternion);
    s.scale.copy(m.scale);
    s.userData = m.userData;
    const parent = m.parent!;
    parent.children[parent.children.indexOf(m)] = s;
    s.parent = parent;
    m.parent = null;
    s.updateMatrixWorld(true);
    s.bind(skeleton, s.matrixWorld);
    skinned++;
  });
  group.userData.skinned = skinned;
}

/** After copying him: point each copied skinned mesh at the copy's own joints. */
export function rebindSkin(copy: THREE.Object3D, mp: <T extends THREE.Object3D>(o: T) => T): void {
  const done = new Map<THREE.Skeleton, THREE.Skeleton>();
  copy.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (!s.isSkinnedMesh) return;
    const src = s.skeleton;
    if (!done.has(src))
      done.set(
        src,
        new THREE.Skeleton(
          src.bones.map((b) => mp(b)),
          src.boneInverses,
        ),
      );
    s.bind(done.get(src)!, s.bindMatrix);
  });
}
