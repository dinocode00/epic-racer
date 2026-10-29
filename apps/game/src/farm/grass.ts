import * as THREE from 'three';
import { WIND_GLSL, windUniforms } from '../render/wind.ts';
import { meshHeight } from './ground.ts';
import { FARM, type RectDef, type XY, smoothLine, smoothRing } from './layout.ts';

/**
 * Living grass, the way most good-looking outdoor games do it: a fixed set of grass tufts
 * that always surrounds the camera (each tuft wraps around to the far side as the camera
 * moves), stood on the terrain from a height texture, coloured from the painted ground
 * underneath so it blends in, thinned by a mask (no grass on gravel, concrete, soil or under
 * buildings), shrinking away at the edge of the patch, and bending in the breeze with a light
 * sheen where a gust presses it over.
 *
 * Three layers: short mowed lawn right around the camera; tall wild grass with seed heads in
 * the fields and ditches out to a wider radius; and late-summer wildflowers among it.
 */

// Painted ground area (real metres), matching ground.ts.
const X0 = -80,
  X1 = 190,
  Y0 = -90,
  Y1 = 262;

let seed = 2024;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** Height of the terrain on a 1 m grid (the terrain mesh is 2.5 m cells, so this is ample). */
export function heightTexture(): THREE.DataTexture {
  const nx = X1 - X0 + 1,
    ny = Y1 - Y0 + 1;
  const d = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) d[j * nx + i] = meshHeight(X0 + i, Y0 + j);
  // Full precision (half floats are off by millimetres, enough to bury a gravel stone), read
  // with exact texel fetches and blended in the shader (terrainHeight) so no float filtering
  // support is needed.
  const t = new THREE.DataTexture(d, nx, ny, THREE.RedFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Where each layer grows: red = mowed lawn, green = tall wild grass, blue = wildflowers. */
function maskTexture(): THREE.CanvasTexture {
  const PPM = 2;
  const c = document.createElement('canvas');
  c.width = (X1 - X0) * PPM;
  c.height = (Y1 - Y0) * PPM;
  const x = c.getContext('2d')!;
  const P = (p: XY): [number, number] => [(p[0] - X0) * PPM, (Y1 - p[1]) * PPM];
  const path = (pts: XY[], close = true) => {
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p))));
    if (close) x.closePath();
  };
  const rect = (r: RectDef, angle = r.angle ?? 0, grow = 0) => {
    const a = (angle * Math.PI) / 180;
    const u: XY = [Math.cos(a), Math.sin(a)],
      v: XY = [-Math.sin(a), Math.cos(a)];
    const k = (su: number, sv: number): XY => [
      r.c[0] + (u[0] * su * (r.w + grow)) / 2 + (v[0] * sv * (r.h + grow)) / 2,
      r.c[1] + (u[1] * su * (r.w + grow)) / 2 + (v[1] * sv * (r.h + grow)) / 2,
    ];
    path([k(-1, -1), k(1, -1), k(1, 1), k(-1, 1)]);
  };
  // Outside the line: wild grass with flowers scattered through it.
  x.fillStyle = 'rgb(0,255,150)';
  x.fillRect(0, 0, c.width, c.height);
  // The property: mowed lawn.
  x.fillStyle = 'rgb(255,0,0)';
  path(FARM.boundary);
  x.fill();
  // Ditches along the road stay long and weedy.
  x.lineCap = 'round';
  x.strokeStyle = 'rgb(0,230,90)';
  x.lineWidth = 1.6 * PPM;
  for (const d of FARM.ditch) {
    path(d, false);
    x.stroke();
  }
  // Nothing grows on gravel, soil, concrete, the road or the lane, or under buildings.
  x.fillStyle = 'rgb(0,0,0)';
  x.strokeStyle = 'rgb(0,0,0)';
  for (const g of [smoothRing(FARM.gravel, 6), smoothRing(FARM.gravel_apron, 6)]) {
    path(g);
    x.fill();
  }
  // ...except the grass patches beside the ramp.
  x.fillStyle = 'rgb(255,0,0)';
  for (const p of FARM.grass_patches) {
    path(p);
    x.fill();
  }
  x.fillStyle = 'rgb(0,0,0)';
  path(FARM.pumpkin_patch);
  x.fill();
  path(FARM.ramp);
  x.fill();
  x.lineWidth = 6.6 * PPM;
  path(FARM.road, false);
  x.stroke();
  x.lineWidth = 4.4 * PPM;
  path(FARM.lane, false);
  x.stroke();
  x.lineWidth = FARM.house_walk.width * PPM;
  x.lineCap = 'square';
  path(FARM.house_walk.pts, false);
  x.stroke();
  const H = FARM.house;
  for (const r of [H.main, H.wing, H.porch, H.steps]) {
    rect(r, H.angle, 0.3);
    x.fill();
  }
  for (const r of [
    FARM.house_pad,
    FARM.barn,
    FARM.wooden_garage,
    FARM.red_garage,
    FARM.shed,
    FARM.greenhouse,
    FARM.playhouse,
    FARM.sandbox,
    FARM.garden,
  ]) {
    rect(r, r.angle ?? 50, 0.3);
    x.fill();
  }
  for (const [p, s] of [
    [FARM.corn_crib, 3.2],
    [FARM.well, 2.8],
    [FARM.windmill, 3.4],
    [FARM.stove, 2.4],
  ] as [XY, number][]) {
    rect({ c: p, w: s, h: s }, 0);
    x.fill();
  }
  // Mowed paths through the wild fields.
  x.lineCap = 'round';
  x.strokeStyle = 'rgb(255,0,0)';
  for (const p of FARM.paths) {
    x.lineWidth = p.width * PPM;
    path(smoothLine(p.pts, 10), false);
    x.stroke();
  }
  // Soft edges so layers fade into each other rather than stopping on a line.
  x.filter = 'blur(1px)';
  x.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Where loose gravel lies: the yard, driveway, barn apron and lane (red channel). */
function gravelMask(): THREE.CanvasTexture {
  const PPM = 2;
  const c = document.createElement('canvas');
  c.width = (X1 - X0) * PPM;
  c.height = (Y1 - Y0) * PPM;
  const x = c.getContext('2d')!;
  const P = (p: XY): [number, number] => [(p[0] - X0) * PPM, (Y1 - p[1]) * PPM];
  const path = (pts: XY[], close = true) => {
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p))));
    if (close) x.closePath();
  };
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#f00';
  for (const g of [smoothRing(FARM.gravel, 6), smoothRing(FARM.gravel_apron, 6)]) {
    path(g);
    x.fill();
  }
  x.fillStyle = '#000';
  for (const p of FARM.grass_patches) {
    path(p);
    x.fill();
  }
  x.strokeStyle = '#f00';
  x.lineWidth = 3.6 * PPM;
  path(FARM.lane, false);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// ------------------------------------------------------------------ geometry

/** A loose stone: a squashed, lumpy little rock (about unit size). */
function pebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + rnd() * 0.5;
    p.setXYZ(i, p.getX(i) * k, Math.max(0, p.getY(i) + 0.25) * 0.9, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('position', p);
  ig.setAttribute('normal', g.attributes.normal!);
  ig.setAttribute('aTip', new THREE.Float32BufferAttribute(new Array(p.count).fill(0.85), 1));
  return ig;
}

/** A tuft of curved, tapering blades. y runs 0 (root) to 1 (tip); x/z within about ±0.5. */
function tuftGeometry(blades: number, segs: number, spread: number, seedHead = false) {
  const pos: number[] = [],
    idx: number[] = [],
    tipT: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * spread;
    const ox = Math.cos(a) * r,
      oz = Math.sin(a) * r;
    const lean = 0.15 + rnd() * 0.35;
    const face = rnd() * Math.PI;
    const h = 0.65 + rnd() * 0.35;
    const w = 0.06 + rnd() * 0.04;
    const fx = Math.cos(face) * w,
      fz = Math.sin(face) * w;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const curve = lean * t * t;
      const cx = ox + Math.cos(a) * curve,
        cz = oz + Math.sin(a) * curve;
      const taper = 1 - t * 0.92;
      pos.push(cx - fx * taper, t * h, cz - fz * taper, cx + fx * taper, t * h, cz + fz * taper);
      tipT.push(t * h, t * h);
    }
    for (let s = 0; s < segs; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    if (seedHead && rnd() < 0.5) {
      // A thin seed head on its own stalk, nodding at the top.
      const sb = pos.length / 3;
      const hh = 1.05 + rnd() * 0.25;
      const sx = ox + Math.cos(a) * lean * 0.6,
        sz = oz + Math.sin(a) * lean * 0.6;
      const hw = 0.035;
      pos.push(
        sx - fx * 0.3,
        0,
        sz - fz * 0.3,
        sx + fx * 0.3,
        0,
        sz + fz * 0.3,
        sx - hw * 0.4,
        hh * 0.78,
        sz,
        sx + hw * 0.4,
        hh * 0.78,
        sz,
        sx - hw,
        hh * 0.9,
        sz,
        sx + hw,
        hh * 0.9,
        sz,
        sx,
        hh,
        sz,
        sx,
        hh,
        sz,
      );
      tipT.push(0, 0, hh * 0.78, hh * 0.78, hh * 0.95, hh * 0.95, hh * 1.1, hh * 1.1);
      for (let s = 0; s < 3; s++) {
        const i = sb + s * 2;
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      pos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tipT, 1));
  g.setIndex(idx);
  return g;
}

/** A wildflower: a short stem and a flat, star-shaped head (coloured per instance). */
function flowerGeometry() {
  const pos: number[] = [0, 0, 0, 0.02, 0, 0, 0, 0.8, 0, 0.02, 0.8, 0];
  const tip: number[] = [0, 0, 0.8, 0.8];
  const idx: number[] = [0, 1, 2, 1, 3, 2];
  const petals = 7;
  const c = pos.length / 3;
  pos.push(0, 0.82, 0);
  tip.push(1.2);
  for (let i = 0; i <= petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.08 : 0.2;
    pos.push(Math.cos(a) * r, 0.8 + (i % 2 ? 0.01 : -0.02), Math.sin(a) * r);
    tip.push(1.2);
  }
  for (let i = 0; i < petals * 2; i++) idx.push(c, c + 1 + i + 1, c + 1 + i);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      pos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ material

interface Layer {
  /** Size of the square patch around the camera (m) and how many tufts fill it. */
  tile: number;
  count: number;
  /** Which mask channel (0 r, 1 g, 2 b) and the size range (m). */
  channel: number;
  height: [number, number];
  width: number;
  /** Bend in the breeze (fraction of height). */
  bend: number;
  /** Colour from the ground (1) or from the instance (0, flowers). */
  groundTint: number;
  /** Lighten toward the tip. */
  tipLight: number;
  /** A different mask texture (default: the grass mask). */
  mask?: THREE.Texture;
  /** Raise (+) or sink (-) the base relative to the ground, in metres. */
  lift?: number;
}

/** The terrain height (1 m grid) for shaders that need to know where the ground is. */
export const terrainUniforms = {
  uTerrain: { value: null as THREE.Texture | null },
};

/** GLSL: terrain height (m) at a farm-local (x, z) point, from the 1 m height texture. */
export const TERRAIN_UV_GLSL = /* glsl */ `
float terrainHeight(sampler2D t, vec2 p) {
  vec2 q = clamp(vec2(p.x, -p.y) - vec2(${X0.toFixed(1)}, ${Y0.toFixed(1)}), vec2(0.0),
    vec2(${(X1 - X0 - 1).toFixed(1)}, ${(Y1 - Y0 - 1).toFixed(1)}));
  ivec2 i = ivec2(floor(q));
  vec2 f = q - vec2(i);
  float a = texelFetch(t, i, 0).r, b = texelFetch(t, i + ivec2(1, 0), 0).r;
  float c = texelFetch(t, i + ivec2(0, 1), 0).r, d = texelFetch(t, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const shared = {
  uCenter: { value: new THREE.Vector2() },
  /** Something pressing the grass flat: farm-local x, z, radius (m), strength. */
  uPush: { value: new THREE.Vector4(0, 0, 0.35, 0) },
  uHeight: { value: null as THREE.Texture | null },
  uMask: { value: null as THREE.Texture | null },
  uGround: { value: null as THREE.Texture | null },
};

function grassMaterial(L: Layer): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide });
  const f = (n: number) => n.toFixed(4);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, L.mask ? { uMask: { value: L.mask } } : {}, {
      uTime: windUniforms.uTime,
      uWindDir: windUniforms.uWindDir,
      uWindScale: windUniforms.uWindScale,
      uWindStrength: windUniforms.uWindStrength,
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WIND_GLSL}
        uniform vec2 uCenter;
        uniform vec4 uPush;
        uniform sampler2D uHeight, uMask, uGround;
        attribute vec4 aSeed;
        attribute vec3 aColor;
        attribute float aTip;
        varying vec3 vGrass;
        ${TERRAIN_UV_GLSL}
        vec2 farmUv(vec2 p) {
          return vec2((p.x - ${f(X0)}) / ${f(X1 - X0)}, (-p.y - ${f(Y0)}) / ${f(Y1 - Y0)});
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `
        // Wrap this tuft's slot in the tile to the copy nearest the camera.
        float T = ${f(L.tile)};
        vec2 p = aSeed.xy + T * floor((uCenter - aSeed.xy) / T + 0.5);
        vec2 uv = farmUv(p);
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float dens = texture2D(uMask, uv)[${L.channel}] * inside;
        float d = length(p - uCenter) / (T * 0.5);
        float keep = step(aSeed.z, dens) * (1.0 - smoothstep(0.55, 0.98, d));
        float hgt = mix(${f(L.height[0])}, ${f(L.height[1])}, aSeed.w) * keep;
        float a = aSeed.z * 61.0 + aSeed.w * 17.0;
        float ca = cos(a), sa = sin(a);
        vec3 transformed = vec3(
          (position.x * ca - position.z * sa) * ${f(L.width)} * keep,
          position.y * hgt,
          (position.x * sa + position.z * ca) * ${f(L.width)} * keep);
        // The breeze presses the tips over and they spring back.
        vec3 wp = (modelMatrix * vec4(p.x, 0.0, p.y, 1.0)).xyz * uWindScale;
        float g = windGust(wp.xz);
        float ph = wp.x * 0.9 + wp.z * 0.7;
        float bend = ${f(L.bend)} * (0.25 + 0.75 * g + 0.25 * sin(uTime * 2.3 + ph) * (0.4 + g));
        float tt = aTip * aTip;
        transformed.xz += uWindDir * bend * tt * hgt;
        transformed.x += sin(uTime * 3.7 + ph * 2.0) * 0.06 * tt * hgt * (0.3 + g);
        transformed.y -= bend * bend * tt * hgt * 0.45;
        // Pressed down and out of the way under and around a kart.
        vec2 away = p - uPush.xy;
        float pd = length(away);
        float push = (1.0 - smoothstep(uPush.z * 0.4, uPush.z, pd)) * uPush.w * step(0.001, ${f(L.bend)});
        transformed.xz += away / max(pd, 0.01) * push * tt * hgt * 0.9;
        transformed.y -= push * tt * hgt * 0.55;
        transformed += vec3(p.x, terrainHeight(uHeight, p) + ${f(L.lift ?? -0.01)}, p.y);
        vec3 ground = texture2D(uGround, uv).rgb;
        vec3 base = mix(aColor, ground * 1.08, ${f(L.groundTint)});
        // Flowers: a green stem under the coloured head.
        if (${f(L.groundTint)} < 0.5 && aTip < 0.85) base = vec3(0.22, 0.36, 0.13);
        float k = mix(0.6, 1.0 + ${f(L.tipLight)}, clamp(aTip, 0.0, 1.0));
        vGrass = base * k * (1.0 + 0.3 * g * tt);
        `,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= vGrass;',
      );
  };
  m.customProgramCacheKey = () => `farm-grass-${L.channel}-${L.tile}-${L.mask ? 'm' : ''}`;
  return m;
}

function layer(geo: THREE.InstancedBufferGeometry, L: Layer, colors?: THREE.Color[]): THREE.Mesh {
  const seedA = new Float32Array(L.count * 4);
  const col = new Float32Array(L.count * 3);
  for (let i = 0; i < L.count; i++) {
    seedA.set([rnd() * L.tile, rnd() * L.tile, rnd() * 0.98, rnd()], i * 4);
    const c = colors ? colors[(rnd() * colors.length) | 0]! : new THREE.Color(1, 1, 1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedA, 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = L.count;
  const mesh = new THREE.Mesh(geo, grassMaterial(L));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.fullCount = L.count;
  return mesh;
}

export interface Grass {
  group: THREE.Group;
  /** Follow the camera: its position in the farm's own (real metre) frame. */
  update(localCamera: THREE.Vector3): void;
  /** Flatten the grass round a point (farm frame), or stop with null. */
  press(local: THREE.Vector3 | null): void;
}

export function buildGrass(groundMap: THREE.Texture): Grass {
  shared.uHeight.value = terrainUniforms.uTerrain.value ??= heightTexture();
  shared.uMask.value = maskTexture();
  shared.uGround.value = groundMap;
  const group = new THREE.Group();
  group.name = 'grass';
  // Mowed lawn: short, dense, right around the camera.
  group.add(
    layer(tuftGeometry(6, 2, 0.35), {
      tile: 16,
      count: 26000,
      channel: 0,
      height: [0.045, 0.09],
      width: 0.09,
      bend: 0.35,
      groundTint: 1,
      tipLight: 0.25,
    }),
  );
  // Tall wild grass with seed heads, out to a wider radius.
  group.add(
    layer(tuftGeometry(7, 3, 0.4, true), {
      tile: 60,
      count: 22000,
      channel: 1,
      height: [0.35, 0.8],
      width: 0.35,
      bend: 0.5,
      groundTint: 1,
      tipLight: 0.35,
    }),
  );
  // Loose gravel stones on the yard and lane, right around the camera.
  group.add(
    layer(
      pebbleGeometry(),
      {
        tile: 10,
        count: 14000,
        channel: 0,
        height: [0.012, 0.03],
        width: 0.035,
        bend: 0,
        groundTint: 0.55,
        tipLight: 0.15,
        mask: gravelMask(),
      },
      [0xb8ab95, 0x9c948a, 0xd2c4a8, 0x8a8178, 0xc9b896, 0xe0d6c4].map((h) => new THREE.Color(h)),
    ),
  );
  // Wildflowers among it: Queen Anne's lace, chicory, black-eyed Susans, goldenrod.
  group.add(
    layer(
      flowerGeometry(),
      {
        tile: 60,
        count: 5000,
        channel: 2,
        height: [0.35, 0.7],
        width: 0.5,
        bend: 0.4,
        groundTint: 0,
        tipLight: 0.1,
      },
      [0xf4f1e6, 0xf4f1e6, 0x7d9be0, 0xf0b020, 0xe8c23a].map((h) => new THREE.Color(h)),
    ),
  );
  return {
    group,
    update(cam) {
      shared.uCenter.value.set(cam.x, cam.z);
    },
    press(p) {
      if (p) shared.uPush.value.set(p.x, p.z, 0.35, 1);
      else shared.uPush.value.w = 0;
    },
  };
}
