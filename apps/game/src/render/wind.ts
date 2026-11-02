import * as THREE from 'three';

/**
 * One breeze for a whole scene. A steady push from one direction plus gust bands that roll
 * across the land at about walking-to-jogging speed, so a gust can be seen travelling through
 * the grass, then the trees, then the laundry. The same gust function runs in GLSL (vertex
 * sway) and in TypeScript (windmills, weathervanes, particles), so everything agrees.
 *
 * Positions are in "wind metres": world units times `uWindScale` (a farm built at 1:10 sets
 * 0.1, so its gusts are sized in real metres).
 */
export const windUniforms = {
  uTime: { value: 0 },
  /** Direction the wind blows toward, in world x/z (unit length). */
  uWindDir: { value: new THREE.Vector2(1, 0) },
  /** World units to wind metres. */
  uWindScale: { value: 1 },
  /** Overall strength: 0 calm, 1 a good summer breeze. */
  uWindStrength: { value: 1 },
};

/** Point the breeze (world x/z) and size it to the scene's units. */
export function setWind(dirX: number, dirZ: number, scale = 1, strength = 1): void {
  windUniforms.uWindDir.value.set(dirX, dirZ).normalize();
  windUniforms.uWindScale.value = scale;
  windUniforms.uWindStrength.value = strength;
}

/** Gust strength (0 to about 1) at a point in wind metres (x, z) at time t. */
export function windGust(x: number, z: number, t = windUniforms.uTime.value): number {
  const d = windUniforms.uWindDir.value;
  const a = x * d.x + z * d.y,
    c = -x * d.y + z * d.x;
  const g1 = Math.sin(a * 0.07 - t * 0.42 + Math.sin(c * 0.045 + t * 0.07) * 1.6);
  const g2 = Math.sin(a * 0.031 - t * 0.19 + c * 0.02 + 1.3);
  const g = Math.min(1, Math.max(0, 0.5 + 0.35 * g1 + 0.3 * g2));
  return g * g * windUniforms.uWindStrength.value;
}

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindScale;
uniform float uWindStrength;
float windGust(vec2 p) {
  vec2 d = uWindDir;
  float a = dot(p, d), c = dot(p, vec2(-d.y, d.x));
  float g1 = sin(a * 0.07 - uTime * 0.42 + sin(c * 0.045 + uTime * 0.07) * 1.6);
  float g2 = sin(a * 0.031 - uTime * 0.19 + c * 0.02 + 1.3);
  float g = clamp(0.5 + 0.35 * g1 + 0.3 * g2, 0.0, 1.0);
  return g * g * uWindStrength;
}
`;

export interface WindOptions {
  /** Steady lean downwind, per unit of height above `h0` (object units). */
  lean?: number;
  /** Back-and-forth sway, per unit of height above `h0`. */
  sway?: number;
  /** Sway speed (radians per second). */
  speed?: number;
  /** Small fast flutter along the normal (object units): leaves and petals. */
  flutter?: number;
  /** Height (object units) below which nothing moves: the trunk base or the stem's root. */
  h0?: number;
  /**
   * 'height' bends by height above h0 (plants); 'hang' swings from a top edge at h0 downward
   * like a sheet pinned to a line (laundry).
   */
  mode?: 'height' | 'hang';
}

function windVertex(o: WindOptions): string {
  const f = (n: number) => n.toFixed(4);
  const lean = f(o.lean ?? 0),
    sway = f(o.sway ?? 0),
    speed = f(o.speed ?? 1.3),
    flutter = f(o.flutter ?? 0),
    h0 = f(o.h0 ?? 0);
  const head = `
    #ifdef USE_INSTANCING
      mat4 wM = modelMatrix * instanceMatrix;
    #else
      mat4 wM = modelMatrix;
    #endif
    vec3 wBase = (wM * vec4(0.0, 0.0, 0.0, 1.0)).xyz * uWindScale;
    float wG = windGust(wBase.xz);
    float wPh = wBase.x * 0.37 + wBase.z * 0.29;
    mat3 wT = transpose(mat3(wM));
    vec3 wDir = wT * vec3(uWindDir.x, 0.0, uWindDir.y);
    wDir /= max(length(wDir), 1e-5);
    vec3 wSide = wT * vec3(-uWindDir.y, 0.0, uWindDir.x);
    wSide /= max(length(wSide), 1e-5);
    float wFl = sin(uTime * 7.3 + position.x * 3.1 + position.z * 2.3 + position.y * 1.7 + wPh);
  `;
  if (o.mode === 'hang') {
    // Swing about the top edge (y = h0) toward the wind, plus ripples running down the cloth.
    return (
      head +
      `
    float wHang = max(${h0} - position.y, 0.0);
    float wPush = dot(wDir.xz, vec2(0.0, 1.0));
    float wAng = (${lean} * (0.2 + wG) * wPush + ${sway} * (0.4 + wG) * sin(uTime * ${speed} + wPh + position.x * 1.3))
      * (0.6 + 0.4 * sin(uTime * 2.9 + position.x * 4.0 + wPh));
    transformed.z = position.z + sin(wAng) * wHang + wFl * ${flutter} * (0.3 + wG) * wHang;
    transformed.y = ${h0} - cos(wAng) * wHang;
    `
    );
  }
  return (
    head +
    `
    float wH = max(position.y - ${h0}, 0.0);
    float wSw = sin(uTime * ${speed} + wPh) + 0.35 * sin(uTime * ${speed} * 2.7 + wPh * 1.9);
    transformed += wDir * (${lean} * (0.15 + wG) + ${sway} * wSw * (0.35 + wG)) * wH;
    transformed += wSide * ${sway} * 0.5 * sin(uTime * ${speed} * 0.83 + wPh * 1.7) * (0.35 + wG) * wH;
    transformed += normal * wFl * ${flutter} * (0.3 + wG);
    `
  );
}

/**
 * Make a material move with the breeze (also works for depth materials, so shadows follow).
 * Chains onto any earlier onBeforeCompile patch.
 */
export function addWind(m: THREE.Material, o: WindOptions, key: string): void {
  if (m.userData.wind) return;
  m.userData.wind = key;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey();
  const code = windVertex(o);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWindDir = windUniforms.uWindDir;
    sh.uniforms.uWindScale = windUniforms.uWindScale;
    sh.uniforms.uWindStrength = windUniforms.uWindStrength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code);
  };
  m.customProgramCacheKey = () => prevKey + '|wind-' + key;
}

/** A shadow-casting depth material that moves exactly like `addWind(m, o, key)`. */
export function windDepth(
  o: WindOptions,
  key: string,
  map: THREE.Texture | null = null,
  alphaTest = 0,
): THREE.MeshDepthMaterial {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  addWind(d, o, key);
  return d;
}

/** Give a mesh the moving material and a matching shadow caster. */
export function windy<T extends THREE.Mesh>(mesh: T, o: WindOptions, key: string): T {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) addWind(m, o, key);
  const first = mats[0] as THREE.MeshStandardMaterial;
  mesh.customDepthMaterial = windDepth(o, key, first.alphaTest ? first.map : null, first.alphaTest);
  return mesh;
}
