import * as THREE from 'three';
import aoData from './buildingsAo.json';
import aoImage from './buildingsAo.jpg?inline';

/**
 * Soft shadows for the farm's buildings, baked by Blender (tools/blender/buildings.py): one
 * grey atlas of how much sky each point can see, and for each building mesh the second set of
 * texture coordinates into it. Applied as each material's ambient-occlusion map, plus a share
 * of it on the direct light, so corners, eaves, reveals and the foot of every wall darken
 * softly in the sun too.
 *
 * Meshes are matched by build order and vertex count; any that changed since the bake keep
 * their old look until `buildings.py` is run again.
 */

interface Entry {
  i: number;
  n: number;
  uv: string;
  corners?: boolean;
}
const DATA = aoData as { size: number; meshes: Entry[] };

/** How much of the occlusion also dims direct sunlight (1 would be fully physical: 0). */
const ON_SUN = 0.55;

let atlas: THREE.Texture | null = null;
function texture(): THREE.Texture {
  if (atlas) return atlas;
  atlas = new THREE.TextureLoader().load(aoImage);
  atlas.channel = 1;
  atlas.anisotropy = 8;
  return atlas;
}

function coords(b64: string): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) / 65535;
  return out;
}

/** The same material with the atlas on it, sharing everything else (one copy per original). */
function withAo(m: THREE.Material, copies: Map<THREE.Material, THREE.Material>): THREE.Material {
  let c = copies.get(m);
  if (c) return c;
  const std = m as THREE.MeshStandardMaterial;
  if (!('aoMap' in std)) return m;
  const copy = std.clone();
  // Keep any shader patches the original carries (wind, grime) and its program cache key.
  const prev = std.onBeforeCompile.bind(std);
  const prevKey = std.customProgramCacheKey();
  copy.aoMap = texture();
  copy.aoMapIntensity = 1;
  copy.customProgramCacheKey = () => 'ao|' + prevKey;
  copy.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    // Three applies the map to ambient light only; dim the direct light by part of it too.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${ON_SUN.toFixed(2)});
      reflectedLight.directSpecular *= mix(1.0, ambientOcclusion, ${ON_SUN.toFixed(2)});`,
    );
  };
  copies.set(m, copy);
  return copy;
}

/** Give every baked building mesh its atlas coordinates and an occlusion-mapped material. */
export function applyBuildingAo(group: THREE.Object3D): number {
  // ?noao in the address shows the buildings without it, to compare.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noao')) return 0;
  const byIndex = new Map(DATA.meshes.map((e) => [e.i, e]));
  const copies = new Map<THREE.Material, THREE.Material>();
  const used = new Set<THREE.BufferGeometry>();
  let i = 0,
    done = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const e = byIndex.get(i++);
    if (!e || Array.isArray(m.material)) return;
    let g = m.geometry;
    if (g.attributes.position!.count !== e.n) return;
    const uv = coords(e.uv);
    if (e.corners) {
      g = g.index ? g.toNonIndexed() : g.clone();
      if (g.attributes.position!.count * 2 !== uv.length) return;
    } else if (used.has(g) || g.attributes.uv1) {
      g = g.clone(); // shared with another building: each needs its own place in the atlas
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    used.add(g);
    m.geometry = g;
    m.material = withAo(m.material, copies);
    done++;
  });
  return done;
}
