import * as THREE from 'three';
import { TERRAIN_UV_GLSL, heightTexture, terrainUniforms } from './grass.ts';
import { FARM_SCALE } from './layout.ts';

/**
 * Weathering for buildings: walls darken toward the ground where rain splashes dirt up and
 * grass keeps them damp, with blotchy unevenness so the bottom edge isn't a ruler line, and a
 * faint large-scale mottling over everything so painted surfaces aren't perfectly clean.
 * Works from the terrain height texture, so it follows the ground as it slopes along a wall.
 */

const uniforms = {
  /** World units to farm metres, and the farm group's world offset. */
  uFarmScale: { value: 1 / FARM_SCALE },
  uFarmPos: { value: new THREE.Vector3() },
};

/** Tell the grime where the farm group sits in the world. */
export function setGrimeFrame(farm: THREE.Object3D): void {
  uniforms.uFarmPos.value.copy(farm.position);
}

const NOISE = /* glsl */ `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x),
             mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
`;

/**
 * Add grime to a material: `band` is how high (m) splash dirt reaches, `amount` how dark it
 * gets (0..1), `mottle` the strength of the overall unevenness.
 */
export function addGrime(m: THREE.Material, band = 0.6, amount = 0.35, mottle = 0.08): void {
  if (m.userData.grime) return;
  m.userData.grime = true;
  terrainUniforms.uTerrain.value ??= heightTexture();
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  const f = (n: number) => n.toFixed(3);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, uniforms, terrainUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vGrimeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vGrimeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrimeW;
        uniform float uFarmScale;
        uniform vec3 uFarmPos;
        uniform sampler2D uTerrain;
        ${TERRAIN_UV_GLSL}
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 fp = (vGrimeW - uFarmPos) * uFarmScale;
          float ground = terrainHeight(uTerrain, fp.xz);
          float h = fp.y - ground;
          float n = gNoise(fp.xz * 3.1 + fp.y * 1.7) * 0.6 + gNoise(fp.xz * 9.0 - fp.y * 4.0) * 0.4;
          float reach = ${f(band)} * (0.55 + 0.9 * n);
          float dirt = (1.0 - smoothstep(0.0, reach, h)) * step(-0.5, h);
          float mott = gNoise(fp.xz * 0.6 + fp.y * 0.9) - 0.5;
          diffuseColor.rgb *= (1.0 - ${f(amount)} * dirt) * (1.0 + ${f(mottle)} * mott);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.2) * length(diffuseColor.rgb), dirt * ${f(amount * 0.5)});
        }`,
      );
  };
  m.customProgramCacheKey = () => prevKey + `|grime-${band}-${amount}-${mottle}`;
}
