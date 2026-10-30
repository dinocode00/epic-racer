import * as THREE from 'three';
import { windUniforms } from '../render/wind.ts';

/**
 * A summer sky with fair-weather cumulus drifting on the breeze, and the shadows of those same
 * clouds sliding over the farm. Sky and shadows sample one cloud field on a layer about a
 * kilometre up, so a shadow on the ground sits under (sun-ward of) its cloud.
 *
 * Positions are in wind metres (world units times uWindScale), like the breeze.
 */

const CLOUD_BASE = 1100;

export const cloudUniforms = {
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  /** Cloud cover: 0 clear, 1 overcast. */
  uCover: { value: 0.42 },
};

const CLOUD_GLSL = /* glsl */ `
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1, 0)), u.x),
             mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), u.x), u.y);
}
float cFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * cNoise(p); p = r * p * 2.03 + 3.1; a *= 0.5; }
  return v;
}
/** Cloud density (0..1) at a point on the cloud layer (metres). */
float cloudField(vec2 q, float t, vec2 wind) {
  q -= wind * t * 7.0;
  float n = cFbm(q / 520.0) + 0.25 * cFbm(q / 140.0 + 7.0);
  float edge = 0.85 - uCover * 0.45;
  return smoothstep(edge, edge + 0.08, n);
}
`;

/** The sky dome (follows the camera). */
export function farmSky(top: number, horizon: number, sun: THREE.Vector3): THREE.Mesh {
  cloudUniforms.uSun.value.copy(sun).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      uCam: { value: new THREE.Vector3() },
      uTime: windUniforms.uTime,
      uWindDir: windUniforms.uWindDir,
      uWindScale: windUniforms.uWindScale,
      ...cloudUniforms,
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 uSun; uniform vec3 uCam;
      uniform float uTime; uniform vec2 uWindDir; uniform float uWindScale; uniform float uCover;
      varying vec3 vDir;
      ${CLOUD_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        if (d.y > 0.01) {
          vec3 cam = uCam * uWindScale;
          vec2 q = cam.xz + d.xz / d.y * (${CLOUD_BASE.toFixed(1)} - cam.y);
          float dens = cloudField(q, uTime, uWindDir);
          // Lit tops toward the sun, grey flat bottoms, thinning into the haze at the horizon.
          float lit = 1.0 - cloudField(q + uSun.xz * 140.0, uTime, uWindDir);
          vec3 cc = mix(vec3(0.72, 0.75, 0.8), vec3(1.0, 0.99, 0.96), 0.45 + 0.55 * lit);
          cc += vec3(1.0, 0.9, 0.75) * pow(s, 8.0) * 0.35 * (1.0 - dens);
          float fade = smoothstep(0.02, 0.2, d.y);
          c = mix(c, cc, dens * fade * 0.95);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.onBeforeRender = (_r, _s, camera) => {
    mat.uniforms.uCam!.value.copy(camera.position);
  };
  return sky;
}

/**
 * Let the clouds shade a material: the sun's direct light dims under a cloud's shadow (the
 * sky light stays), so shadows drift over roofs, trees and fields alike.
 */
export function addCloudShadow(m: THREE.Material): void {
  if (m.userData.clouds || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
  m.userData.clouds = true;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, cloudUniforms, {
      uTime: windUniforms.uTime,
      uWindDir: windUniforms.uWindDir,
      uWindScale: windUniforms.uWindScale,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vCloudW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vCloudW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    const fDecl = /uniform float uTime;/.test(sh.fragmentShader)
      ? ''
      : 'uniform float uTime;\nuniform vec2 uWindDir;\nuniform float uWindScale;\n';
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCloudW;
        uniform vec3 uSun;
        uniform float uCover;
        ${fDecl}
        ${CLOUD_GLSL}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 wp = vCloudW * uWindScale;
          vec2 q = wp.xz + uSun.xz / max(uSun.y, 0.2) * (${CLOUD_BASE.toFixed(1)} - wp.y);
          float shade = 1.0 - 0.55 * cloudField(q, uTime, uWindDir);
          reflectedLight.directDiffuse *= shade;
          reflectedLight.directSpecular *= shade;
        }`,
      );
  };
  m.customProgramCacheKey = () => prevKey + '|clouds';
}
