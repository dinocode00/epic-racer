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
export interface BakedAo {
  size: number;
  meshes: Entry[];
}
const DATA = aoData as BakedAo;

/** How much of the occlusion also dims direct sunlight (1 would be fully physical: 0). */
const ON_SUN = 0.55;

const atlases = new Map<string, THREE.Texture>();
function texture(image: string): THREE.Texture {
  let atlas = atlases.get(image);
  if (atlas) return atlas;
  atlas = new THREE.TextureLoader().load(image);
  atlas.channel = 1;
  atlas.anisotropy = 8;
  atlases.set(image, atlas);
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
/** How strongly a bake shows: on ambient light, and how much of it also dims the sun. */
export interface AoStrength {
  ambient: number;
  sun: number;
}
const FULL: AoStrength = { ambient: 1, sun: ON_SUN };

function withAo(
  m: THREE.Material,
  copies: Map<THREE.Material, THREE.Material>,
  image: string,
  k: AoStrength,
): THREE.Material {
  let c = copies.get(m);
  if (c) return c;
  const std = m as THREE.MeshStandardMaterial;
  if (!('aoMap' in std)) return m;
  const copy = std.clone();
  // Keep any shader patches the original carries (wind, grime) and its program cache key.
  const prev = std.onBeforeCompile.bind(std);
  const prevKey = std.customProgramCacheKey();
  copy.aoMap = texture(image);
  copy.aoMapIntensity = k.ambient;
  copy.customProgramCacheKey = () => `ao${k.sun}|` + prevKey;
  copy.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    // Three applies the map to ambient light only; dim the direct light by part of it too.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${k.sun.toFixed(2)});
      reflectedLight.directSpecular *= mix(1.0, ambientOcclusion, ${k.sun.toFixed(2)});`,
    );
  };
  copies.set(m, copy);
  return copy;
}

/** Give every baked building mesh its atlas coordinates and an occlusion-mapped material. */
export function applyBuildingAo(group: THREE.Object3D): number {
  return applyBakedAo(group, DATA, aoImage);
}

/**
 * Apply a Blender occlusion bake (tools/blender/buildings.py) to a group built by code: `data`
 * lists its meshes by build order, `image` is the atlas.
 */
export function applyBakedAo(
  group: THREE.Object3D,
  data: BakedAo,
  image: string,
  strength: AoStrength = FULL,
): number {
  // ?noao in the address shows things without it, to compare.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noao')) return 0;
  const byIndex = new Map(data.meshes.map((e) => [e.i, e]));
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
    m.material = withAo(m.material, copies, image, strength);
    done++;
  });
  return done;
}
