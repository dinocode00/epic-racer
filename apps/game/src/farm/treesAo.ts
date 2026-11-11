import type * as THREE from 'three';
import type { TreeGeo } from '../render/foliage.ts';
import aoData from './treesAo.json';

/**
 * Soft shading for the farm's trees, baked by Blender (tools/blender/trees.py): for every
 * vertex of each tree kind, how much sky it sees with the rest of the tree (and the ground)
 * round it. Leaves deep in a crown and the trunk under it come out darker, the outer shell of
 * the canopy stays bright. Multiplied into the kind's vertex colours once, when it's built.
 *
 * Kinds are matched by build order and vertex count; any that changed keep their old shading
 * until `trees.py` is run again.
 */

interface Part {
  n: number;
  ao: string;
}
const DATA = aoData as { kinds: { solid?: Part; leaves?: Part }[] };

/** How much of the baked occlusion shows (1 = all of it): less on the dense needle trees. */
const STRENGTH = 0.55,
  NEEDLES = 0.38;

function shadeBy(g: THREE.BufferGeometry | null, p: Part | undefined, strength: number): void {
  if (!g || !p) return;
  const col = g.attributes.color;
  if (!col || col.count !== p.n) return;
  const bin = atob(p.ao);
  for (let i = 0; i < col.count; i++) {
    const k = 1 - strength + strength * (bin.charCodeAt(i) / 255);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}

export function applyTreeAo(geo: TreeGeo, index: number): void {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noao')) return;
  const e = DATA.kinds[index];
  if (!e) return;
  const k = geo.needles || !geo.leaves ? NEEDLES : STRENGTH;
  shadeBy(geo.solid, e.solid, k);
  shadeBy(geo.leaves, e.leaves, k);
}
