import * as THREE from 'three';
import { allTextures } from './textures.ts';

/**
 * Two looks share one scene:
 *  - modern: full resolution, soft shadows, tone mapping, filtered textures (default)
 *  - retro:  PS1 filter: 240-line buffer, vertex wobble, nearest textures, dithering
 */
export type LookName = 'modern' | 'retro';

export const psxUniforms = {
  uSnap: { value: 0 },
  uSnapRes: { value: new THREE.Vector2(320, 240) },
};

const SNAP = /* glsl */ `
  if (uSnap > 0.5) {
    vec4 snapped = gl_Position;
    snapped.xyz /= snapped.w;
    vec2 grid = uSnapRes * 0.5;
    snapped.xy = floor(snapped.xy * grid + 0.5) / grid;
    snapped.xyz *= snapped.w;
    gl_Position = snapped;
  }
`;

/** Inject the PS1 vertex snap into any built-in material. Harmless when uSnap = 0. */
export function patchMaterial(m: THREE.Material): void {
  if (m.userData.psx) return;
  m.userData.psx = true;
  // Chain onto any existing shader patch (e.g. terrain splatting) and keep cache keys apart.
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.customProgramCacheKey = () => 'psx|' + prevKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uSnap = psxUniforms.uSnap;
    shader.uniforms.uSnapRes = psxUniforms.uSnapRes;
    shader.vertexShader =
      'uniform float uSnap;\nuniform vec2 uSnapRes;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n' + SNAP,
      );
  };
}

export function patchScene(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach(patchMaterial);
  });
}

export function applyTextureLook(look: LookName): void {
  for (const t of allTextures()) {
    const retro = look === 'retro';
    t.magFilter = retro ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = retro ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    t.anisotropy = retro ? 1 : 8;
    t.needsUpdate = true;
  }
}
