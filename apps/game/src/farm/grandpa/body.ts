import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tube } from '../../render/modelKit.ts';
import {
  G,
  V,
  band,
  canvasTex,
  clamp,
  denim,
  fabricBump,
  leatherBump,
  patch,
  plaid,
  radial,
  rnd,
  smooth,
  smoothSeams,
  stick,
  stitchTex,
  straight,
  vTube,
  white,
  wrinkle,
} from './kit.ts';

/**
 * Grandpa's body and clothes, modelled in world rest-pose metres (standing on y = 0, facing
 * +z, arms hanging). A thin 6 ft 1 in frame in loose clothes: a roomy flannel shirt with
 * dropped shoulders, two flap pockets and the collar open at the neck, worn untucked over baggy blue
 * work jeans worn low on the hips with a belt; tan leather work gloves; brown cowboy boots.
 */

export const J = {
  hip: 0.955,
  thigh: 0.44,
  shin: 0.428,
  ankle: 0.089,
  hipX: 0.094,
  chest: 1.3,
  shoulder: 1.425,
  shoulderX: 0.185,
  upperArm: 0.31,
  forearm: 0.27,
  neck: 1.6,
};

// ---------------------------------------------------------------- materials

export function clothes() {
  const shirtMap = plaid();
  const rep = (t: THREE.Texture, x: number, y: number) => {
    const c = t.clone();
    c.repeat.set(x, y);
    c.needsUpdate = true;
    return c;
  };
  const fb = fabricBump();
  const bumpRep = (x: number, y: number) => rep(fb, x, y);
  const jeanMap = denim();
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const stitch = stitchTex();
  return {
    shirt: std({
      map: rep(shirtMap, 8, 6),
      bumpMap: bumpRep(6, 5),
      bumpScale: 0.6,
      roughness: 0.95,
    }),
    sleeve: std({
      map: rep(shirtMap, 3, 3),
      bumpMap: bumpRep(3, 3),
      bumpScale: 0.6,
      roughness: 0.95,
    }),
    pocket: std({ map: rep(shirtMap, 1, 1), roughness: 0.95, side: THREE.DoubleSide }),
    collar: std({ map: rep(shirtMap, 1.5, 0.4), roughness: 0.95, side: THREE.DoubleSide }),
    placket: std({ map: rep(shirtMap, 0.3, 4.5), roughness: 0.95 }),
    button: new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.35 }),
    jeans: std({
      map: rep(jeanMap, 6, 5),
      bumpMap: bumpRep(6, 5),
      bumpScale: 0.8,
      roughness: 0.95,
    }),
    jeanLeg: std({
      map: rep(jeanMap, 3, 4),
      bumpMap: bumpRep(3, 4),
      bumpScale: 0.8,
      roughness: 0.95,
    }),
    jeanPatch: std({ map: rep(jeanMap, 1, 1), roughness: 0.95, side: THREE.DoubleSide }),
    thread: new THREE.MeshStandardMaterial({
      color: 0xd9a441,
      map: stitch,
      alphaTest: 0.5,
      roughness: 0.8,
      vertexColors: true,
    }),
    shirtThread: new THREE.MeshStandardMaterial({
      color: 0x2a2c48,
      map: stitch,
      alphaTest: 0.5,
      roughness: 0.8,
      vertexColors: true,
    }),
    seamDark: std({ color: 0x24375a, roughness: 0.9 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 0.9, roughness: 0.35 }),
    belt: std({ color: 0x4a2e1b, roughness: 0.55, bumpMap: leatherBump(), bumpScale: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xbfa66c, metalness: 0.95, roughness: 0.3 }),
    skin: std({ color: 0xc98e72, roughness: 0.62, bumpMap: leatherBump(), bumpScale: 0.25 }),
  };
}
export type Clothes = ReturnType<typeof clothes>;

// ---------------------------------------------------------------- neck

/** A thin old man's neck: Adam's apple, the two cords, loose creased skin. Chest-local. */
export function neck(m: Clothes): THREE.Mesh {
  const base = J.chest;
  const g = vTube(
    1.47 - base,
    1.68 - base,
    [
      [1.47 - base, 0.056, 0.058, 0.0],
      [1.52 - base, 0.056, 0.056, 0.004],
      [1.58 - base, 0.054, 0.055, 0.01],
      [1.63 - base, 0.054, 0.056, 0.016],
      [1.68 - base, 0.05, 0.058, 0.022],
    ],
    40,
    400,
  );
  wrinkle(
    g,
    (_x, y, _z, a) => {
      const wy = y + base;
      let d = 0.0065 * G(a, wy, 0, 1.585, 0.25, 0.013); // Adam's apple
      for (const s of [-1, 1]) {
        // Cords from behind the ears down to the collarbone notch.
        const t = clamp((1.66 - wy) / 0.16, 0, 1);
        const ca = s * (1.2 - t * 0.85);
        d += 0.0035 * Math.exp(-(((a - ca) / 0.16) ** 2)) * smooth(1.48, 1.52, wy);
      }
      d -= 0.003 * G(a, wy, 0, 1.495, 0.35, 0.012); // the notch
      // A few soft creases across the throat.
      for (const cy of [1.545, 1.6, 1.635]) d -= 0.0011 * G(a, wy, 0, cy, 1.2, 0.0035);
      return d;
    },
    30,
    0,
    0,
  );
  const mesh = new THREE.Mesh(g, m.skin);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- shirt

/**
 * Drives the cloth: time, how much he is walking (0..1), the breeze (0..1) and his gait phase
 * (radians, two steps per cycle), so the folds pulse with his steps.
 */
export const cloth = {
  uClothT: { value: 0 },
  uClothWalk: { value: 0 },
  uClothGust: { value: 0 },
  uClothPhase: { value: 0 },
};

const CLOTH_HEAD = /* glsl */ `
uniform float uClothT, uClothWalk, uClothGust, uClothPhase;
float cs(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
`;

/**
 * The shirt on his body, in the shirt's rest frame (world heights): loose cloth everywhere
 * below the shoulders breathes and ripples, a little in the breeze and more with each step;
 * the untucked tails trail and lift behind him as he walks and billow in the gusts.
 */
const TORSO_GLSL = /* glsl */ `
{
  vec3 p = position;
  float fa = atan(p.x, p.z);
  vec2 rd = p.xz / max(length(p.xz), 1e-4);
  // Ripples over the whole shirt below the yoke.
  float loose = cs(1.47, 1.28, p.y);
  float wv = sin(uClothT * 3.7 + p.y * 24.0 + fa * 3.0) * 0.5
    + sin(uClothT * 6.1 - p.y * 37.0 + fa * 5.0 + 1.3) * 0.25
    + sin(uClothPhase * 2.0 + p.y * 10.0 + fa) * 0.45 * uClothWalk;
  float amp = loose * (0.001 + 0.0025 * uClothGust + 0.003 * uClothWalk);
  vec3 d = vec3(rd.x, 0.0, rd.y) * amp * wv;
  d.y += amp * 0.25 * sin(uClothPhase * 2.0 + fa * 2.0 + p.y * 6.0) * uClothWalk;
  // The tails.
  float w = cs(1.02, 0.8, p.y);
  w *= w;
  float back = 0.5 - 0.5 * cos(fa);
  float rip = sin(uClothT * 5.3 + p.y * 22.0 + fa * 2.0) * 0.6
    + sin(uClothT * 8.7 + fa * 6.0 - p.y * 30.0) * 0.4;
  float amt = w * (0.004 + 0.012 * uClothGust + 0.032 * uClothWalk * back);
  d.z -= amt * back * (1.0 + 0.5 * rip);
  d.z += amt * (1.0 - back) * 0.35 * rip;
  d.y += amt * back * 0.45 * (1.0 + 0.4 * rip);
  d.x += amt * 0.5 * rip * sin(fa);
  transformed += d;
}
`;

const cs = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** The same motion as TORSO_GLSL, for small rigid parts (buttons) that ride on the shirt. */
function torsoMotion(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const T = cloth.uClothT.value,
    Wk = cloth.uClothWalk.value,
    Gu = cloth.uClothGust.value,
    Ph = cloth.uClothPhase.value;
  const fa = Math.atan2(p.x, p.z);
  const r = Math.max(Math.hypot(p.x, p.z), 1e-4);
  const loose = cs(1.47, 1.28, p.y);
  const wv =
    Math.sin(T * 3.7 + p.y * 24 + fa * 3) * 0.5 +
    Math.sin(T * 6.1 - p.y * 37 + fa * 5 + 1.3) * 0.25 +
    Math.sin(Ph * 2 + p.y * 10 + fa) * 0.45 * Wk;
  const amp = loose * (0.001 + 0.0025 * Gu + 0.003 * Wk);
  out.set((p.x / r) * amp * wv, 0, (p.z / r) * amp * wv);
  out.y += amp * 0.25 * Math.sin(Ph * 2 + fa * 2 + p.y * 6) * Wk;
  let w = cs(1.02, 0.8, p.y);
  w *= w;
  const back = 0.5 - 0.5 * Math.cos(fa);
  const rip =
    Math.sin(T * 5.3 + p.y * 22 + fa * 2) * 0.6 + Math.sin(T * 8.7 + fa * 6 - p.y * 30) * 0.4;
  const amt = w * (0.004 + 0.012 * Gu + 0.032 * Wk * back);
  out.z += -amt * back * (1 + 0.5 * rip) + amt * (1 - back) * 0.35 * rip;
  out.y += amt * back * 0.45 * (1 + 0.4 * rip);
  out.x += amt * 0.5 * rip * Math.sin(fa);
  return out;
}

/** Patch a material's vertex shader with a block of cloth motion. */
function clothPatch(mat: THREE.Material, code: string, key: string): void {
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, cloth);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + CLOTH_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + code);
  };
  mat.customProgramCacheKey = () => prevKey + '|cloth-' + key;
}

/**
 * A copy of a material for one part of a sleeve or trouser leg (in its own joint frame, the
 * limb hanging down -y): the cloth ripples round the limb, held still above y0..y1 and
 * below y2..y3 where it meets the next part, livelier the more he walks.
 */
function limbCloth(
  base: THREE.MeshStandardMaterial,
  key: string,
  o: {
    y0: number;
    y1: number;
    y2?: number;
    y3?: number;
    a0: number;
    aw: number;
    ag: number;
    seed: number;
  },
): THREE.MeshStandardMaterial {
  const m = base.clone();
  const f = (n: number) => n.toFixed(4);
  const pinBelow = o.y2 === undefined ? '1.0' : `cs(${f(o.y3!)}, ${f(o.y2)}, p.y)`;
  clothPatch(
    m,
    /* glsl */ `
    {
      vec3 p = position;
      float fa = atan(p.x, p.z);
      vec2 rd = p.xz / max(length(p.xz), 1e-4);
      float w = cs(${f(o.y0)}, ${f(o.y1)}, p.y) * ${pinBelow};
      float wv = sin(uClothT * 4.3 + p.y * 30.0 + fa * 2.0 + ${f(o.seed)}) * 0.5
        + sin(uClothT * 7.1 - p.y * 47.0 + fa * 4.0 + ${f(o.seed * 1.7)}) * 0.25
        + sin(uClothPhase + p.y * 14.0 + fa + ${f(o.seed)}) * 0.5 * uClothWalk;
      float amp = w * (${f(o.a0)} + ${f(o.aw)} * uClothWalk + ${f(o.ag)} * uClothGust);
      transformed.xz += rd * amp * wv;
    }`,
    key,
  );
  return m;
}

/** The roomy flannel shirt body, tucked in and bloused over the belt. Spine-local (y - hip). */
export function shirt(m: Clothes): THREE.Group {
  const g = new THREE.Group();
  const vSkin = m.skin.clone();
  for (const mat of [m.shirt, m.placket, m.shirtThread, m.pocket, m.collar, vSkin])
    clothPatch(mat, TORSO_GLSL, 'torso');
  m.shirt.side = THREE.DoubleSide;
  // Buttons are rigid: they ride the same motion from their rest positions each frame.
  const riders: { o: THREE.Object3D; rest: THREE.Vector3 }[] = [];
  const ride = (o: THREE.Object3D | null) => {
    if (o) riders.push({ o, rest: o.position.clone() });
    return o;
  };
  const dv = new THREE.Vector3();
  g.userData.update = () => {
    for (const r of riders) r.o.position.copy(r.rest).add(torsoMotion(r.rest, dv));
  };
  const H = J.hip;
  const body = vTube(
    0.82,
    1.55,
    [
      [0.82, 0.204, 0.153, 0.006],
      [0.88, 0.202, 0.15, 0.008],
      [0.95, 0.199, 0.146, 0.01],
      [1.05, 0.197, 0.141, 0.011],
      [1.15, 0.198, 0.138, 0.011],
      [1.25, 0.202, 0.135, 0.01],
      [1.32, 0.21, 0.13, 0.007],
      [1.38, 0.227, 0.122, 0.003],
      [1.425, 0.243, 0.108, -0.002],
      [1.455, 0.232, 0.098, -0.004],
      [1.48, 0.192, 0.086, -0.003],
      [1.505, 0.132, 0.074, 0.0],
      [1.53, 0.075, 0.066, 0.004],
      [1.55, 0.064, 0.062, 0.006],
    ],
    72,
    280,
  );
  // Worn untucked: a curved shirttail hem, longer at the front and back than at the sides.
  {
    const p = body.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.95) continue;
      const a = Math.atan2(p.getX(i), p.getZ(i));
      const hem = 0.795 + 0.065 * Math.abs(Math.sin(a)) ** 1.4;
      p.setY(i, hem + ((y - 0.82) / (0.95 - 0.82)) * (0.95 - hem));
    }
  }
  // Loose cloth hanging off the shoulders and chest: long soft folds down to the hem, folds
  // pulling from the armpits, a little slack across the small of the back.
  wrinkle(body, (_x, y, _z, a) => {
    let d = 0;
    const hang = smooth(1.3, 0.95, y);
    d += 0.008 * hang * Math.sin(a * 6 + Math.sin(y * 7) * 0.7 + 0.6);
    d += 0.003 * hang * Math.sin(a * 11 + y * 22);
    d += 0.004 * smooth(0.92, 0.8, y) * Math.sin(a * 9 + 1.3);
    for (const s of [-1, 1]) {
      const ang = a - s * 1.25;
      const fold = Math.exp(-((ang / 0.55) ** 2)) * G(y, 0, 1.33, 0, 0.07, 1);
      d += 0.0035 * fold * Math.sin((ang * 0.9 + (y - 1.33) * 14 * s) * 6);
    }
    d += 0.003 * G(a, y, Math.PI, 1.06, 0.6, 0.05) * Math.sin(y * 160);
    return d;
  });
  const torso = new THREE.Mesh(body, m.shirt);
  torso.castShadow = torso.receiveShadow = true;
  g.add(torso);
  const add = (o: THREE.Object3D | null) => o && g.add(o);
  // Button placket down the front, and its buttons (the top one left undone).
  add(
    patch(torso, 2, 60, (u, v) => straight(-0.017 + u * 0.034, 0.81 + v * 0.66), 0.0016, m.placket),
  );
  for (const s of [-1, 1])
    add(
      band(
        torso,
        50,
        (t) => straight(s * 0.0175, 0.81 + t * 0.66),
        0.0016,
        0.0019,
        m.shirtThread,
        0.006,
      ),
    );
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0022, 14), m.button);
    b.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(b);
    add(ride(stick(torso, straight(0, 1.4 - i * 0.087), holder, 0.0032)));
  }
  // The collar open at the neck: a V of skin, and the collar points lying on the chest.
  add(
    patch(
      torso,
      48,
      40,
      (u, v) => straight(-0.042 + u * 0.084, 1.44 + v * 0.11),
      0.0012,
      vSkin,
      (u, v) => Math.abs(u - 0.5) * 2 < 0.25 + 0.75 * v,
    ),
  );
  for (const s of [-1, 1]) {
    // Collar leaf: from the back of the neck, round the side and down to a point on the chest.
    const pts: THREE.Vector3[] = [],
      outer: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20; // 0 at the back of the neck, 1 at the collar point
      const a = s * (Math.PI - t * (Math.PI - 0.32));
      const y = 1.545 - t * 0.03 - smooth(0.75, 1, t) * 0.05;
      const r = 1 + smooth(0.6, 1, t) * 0.25;
      pts.push(V(Math.sin(a) * 0.069 * r, y, Math.cos(a) * 0.066 * r + 0.006));
      const w = 0.028 + smooth(0.7, 1, t) * 0.02;
      const ao = a + s * smooth(0.75, 1, t) * 0.15;
      outer.push(
        V(
          Math.sin(ao) * (0.069 * r + w * 0.9),
          y - w * 0.75,
          Math.cos(ao) * (0.066 * r + w * 0.9) + 0.006,
        ),
      );
    }
    // The point itself.
    outer[outer.length - 1] = V(s * 0.048, 1.43, 0.11);
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    pts.forEach((p, i) => {
      const o = outer[i]!;
      pos.push(p.x, p.y, p.z, o.x, o.y, o.z);
      uv.push(i / 20, 0, i / 20, 1);
      if (i) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k + 1, k - 2, k + 1, k);
      }
    });
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    const leaf = new THREE.Mesh(white(cg), m.collar);
    leaf.castShadow = true;
    g.add(leaf);
  }
  // Collar stand round the back of the neck.
  {
    const lathe = new THREE.LatheGeometry(
      [new THREE.Vector2(0.066, 1.512), new THREE.Vector2(0.064, 1.548)],
      40,
      0.6,
      Math.PI * 2 - 1.2,
    );
    lathe.rotateY(Math.PI);
    lathe.scale(1.02, 1, 0.98);
    lathe.translate(0, 0, 0.006);
    const stand = new THREE.Mesh(white(lathe), m.collar);
    g.add(stand);
  }
  // Chest pockets with pointed flaps and a button each.
  for (const s of [-1, 1]) {
    const cx = s * 0.084;
    add(
      patch(
        torso,
        10,
        12,
        (u, v) => straight(cx - 0.058 + u * 0.116, 1.245 + v * 0.13),
        0.0022,
        m.pocket,
        (u, v) => v > 0.12 * (1 - Math.abs(u - 0.5) * 2) - 0.02,
      ),
    );
    add(
      band(
        torso,
        30,
        (t) => straight(cx - 0.055 + t * 0.11, 1.258),
        0.0016,
        0.0035,
        m.shirtThread,
        0.006,
      ),
    );
    add(
      patch(
        torso,
        10,
        5,
        (u, v) => straight(cx - 0.06 + u * 0.12, 1.33 + v * 0.05),
        0.0045,
        m.pocket,
        (u, v) => v > 0.55 * (1 - Math.abs(u - 0.5) * 2),
      ),
    );
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.002, 12), m.button);
    b.rotation.x = Math.PI / 2;
    const h = new THREE.Group();
    h.add(b);
    add(ride(stick(torso, straight(cx, 1.345), h, 0.0065)));
  }
  // Yoke seam across the back, side seams, shoulder seams.
  add(
    band(
      torso,
      60,
      (t) => radial(Math.PI - 1.4 + t * 2.8, 1.39),
      0.0018,
      0.0012,
      m.shirtThread,
      0.006,
    ),
  );
  for (const s of [-1, 1])
    add(
      band(
        torso,
        40,
        (t) => radial(s * Math.PI * 0.5, 0.87 + t * 0.47),
        0.0016,
        0.0012,
        m.shirtThread,
        0.006,
      ),
    );
  g.position.y = -H;
  return g;
}

// ---------------------------------------------------------------- sleeves and gloves

/** One loose sleeve (shoulder-local, hanging down -y) with its cuff and the glove. */
export function arm(m: Clothes, side: number) {
  const L1 = J.upperArm,
    L2 = J.forearm;
  const shoulder = new THREE.Group();
  const upper = vTube(
    -L1 - 0.01,
    0.01,
    [
      [0.01, 0.052, 0.058, 0],
      [-0.05, 0.066, 0.069, 0],
      [-0.08, 0.067, 0.068, 0],
      [-0.2, 0.063, 0.063, 0],
      [-L1 - 0.01, 0.06, 0.06, 0],
    ],
    32,
    300,
  );
  wrinkle(upper, (_x, y, _z, a) => {
    // Twisting folds hanging from the shoulder; creases inside the elbow.
    let d = 0.0028 * Math.sin(a * 3 + y * 28) * smooth(0.0, -0.06, y);
    d +=
      0.004 * Math.exp(-(((a - Math.PI) / 0.9) ** 2)) * Math.sin(y * 260) * smooth(-0.22, -0.28, y);
    return d;
  });
  const sleeveUp = limbCloth(m.sleeve, 'sleeve-up' + side, {
    y0: -0.02,
    y1: -0.1,
    y2: -0.24,
    y3: -0.3,
    a0: 0.0012,
    aw: 0.003,
    ag: 0.002,
    seed: side * 2.1,
  });
  const um = new THREE.Mesh(upper, sleeveUp);
  shoulder.add(um);
  const elbow = new THREE.Group();
  elbow.position.y = -L1;
  shoulder.add(elbow);
  elbow.add(new THREE.Mesh(white(new THREE.SphereGeometry(0.06, 20, 14)), m.sleeve));
  const fore = vTube(
    -L2 + 0.045,
    0.01,
    [
      [0.01, 0.06, 0.06, 0],
      [-0.12, 0.058, 0.057, 0],
      [-0.19, 0.059, 0.058, 0],
      [-L2 + 0.065, 0.06, 0.058, 0.002],
      [-L2 + 0.045, 0.05, 0.048, 0.001],
    ],
    32,
    300,
  );
  // Cloth bunching above the cuff.
  wrinkle(fore, (_x, y, _z, a) => {
    const bunch = smooth(-0.14, -0.2, y);
    return (
      0.004 * bunch * Math.sin(y * 220 + Math.sin(a * 2) * 2.2) + 0.002 * Math.sin(a * 5 + y * 40)
    );
  });
  const sleeveLow = limbCloth(m.sleeve, 'sleeve-low' + side, {
    y0: -0.02,
    y1: -0.07,
    y2: -0.18,
    y3: -0.215,
    a0: 0.0012,
    aw: 0.003,
    ag: 0.002,
    seed: side * 3.7 + 1,
  });
  elbow.add(new THREE.Mesh(fore, sleeveLow));
  // Buttoned cuff over the glove's cuff.
  const cuff = vTube(-L2 + 0.002, -L2 + 0.055, [
    [-L2 + 0.002, 0.047, 0.044, 0],
    [-L2 + 0.055, 0.049, 0.046, 0],
  ]);
  const cm = new THREE.Mesh(white(cuff), m.sleeve);
  elbow.add(cm);
  const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.002, 12), m.button);
  cb.rotation.z = Math.PI / 2;
  cb.position.set(side * 0.049, -L2 + 0.03, -0.01);
  elbow.add(cb);
  const wrist = new THREE.Group();
  wrist.position.y = -L2;
  elbow.add(wrist);
  const hand = glove(side);
  // Palms in toward the legs, backs of the hands out.
  hand.rotation.y = (side * Math.PI) / 2;
  wrist.add(hand);
  shoulder.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { shoulder, elbow, wrist, hand };
}

/**
 * Tan leather work glove, wrist at the origin, fingers hanging down -y, back of the hand +z,
 * thumb toward the front of the body. Relaxed: fingers curled a little, thumb tucked in.
 */
function glove(side: number): THREE.Group {
  const g = new THREE.Group();
  const grain = leatherBump();
  const leather = new THREE.MeshStandardMaterial({
    color: 0xc79a62,
    roughness: 0.82,
    bumpMap: grain,
    bumpScale: 0.6,
    vertexColors: true,
  });
  const cuffLeather = new THREE.MeshStandardMaterial({
    color: 0xa97c48,
    roughness: 0.85,
    bumpMap: grain,
    bumpScale: 0.6,
    vertexColors: true,
  });
  const seam = new THREE.MeshStandardMaterial({ color: 0x6d4a26, roughness: 0.9 });
  /** Darker with dirt and wear toward the fingertips and across the palm. */
  const wear = (geo: THREE.BufferGeometry, y0 = 0) => {
    const p = geo.attributes.position!;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + y0,
        z = p.getZ(i);
      let k = 1 - 0.18 * smooth(-0.12, -0.19, y) - 0.12 * smooth(0, -0.012, z);
      k *= 0.94 + rnd() * 0.08;
      c.set([k, k * 0.98, k * 0.95], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return smoothSeams(geo);
  };
  // Short cuff, gathered at the wrist.
  const cuff = vTube(-0.012, 0.045, [
    [0.045, 0.046, 0.041, 0],
    [0.01, 0.043, 0.036, 0],
    [-0.012, 0.04, 0.03, 0],
  ]);
  wrinkle(cuff, (_x, y, _z, a) => 0.0012 * Math.sin(a * 16) * smooth(-0.005, 0.01, y), 10);
  g.add(new THREE.Mesh(cuff, cuffLeather));
  // Back and palm.
  const palm = vTube(-0.1, -0.005, [
    [-0.005, 0.041, 0.027, 0],
    [-0.04, 0.046, 0.025, 0],
    [-0.078, 0.047, 0.021, 0.001],
    [-0.1, 0.044, 0.018, 0.002],
  ]);
  g.add(new THREE.Mesh(wear(palm), leather));
  // The seam down the back of the hand, stitched in darker thread.
  for (const x of [-0.012, 0.012]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.07, 0.0015), seam);
    s.position.set(x, -0.058, 0.026);
    g.add(s);
  }
  // Knuckles and the four fingers, each bent at two joints.
  const fingers = [
    { x: -0.0285, len: 0.82 },
    { x: -0.0095, len: 0.95 },
    { x: 0.0095, len: 1.0 },
    { x: 0.0285, len: 0.94 },
  ];
  const thumbSide = -side;
  fingers.forEach((f, i) => {
    // Little finger on the side away from the thumb.
    const fx = f.x * thumbSide * -1;
    const k = new THREE.Mesh(white(new THREE.SphereGeometry(0.0105, 12, 10)), leather);
    k.scale.set(1, 0.8, 0.9);
    k.position.set(fx, -0.097, 0.009);
    g.add(k);
    const b1 = 0.38 + i * 0.05,
      b2 = 0.62 + i * 0.05;
    const L1 = 0.046 * f.len,
      L2 = 0.04 * f.len;
    const p0 = V(fx, -0.099, 0.002);
    const d1 = V(0, -Math.cos(b1), -Math.sin(b1));
    const p1 = p0.clone().addScaledVector(d1, L1);
    const d2 = V(0, -Math.cos(b1 + b2), -Math.sin(b1 + b2));
    const p2 = p1.clone().addScaledVector(d2, L2);
    const curve = new THREE.CatmullRomCurve3([
      p0,
      p0.clone().addScaledVector(d1, L1 * 0.5),
      p1,
      p1.clone().addScaledVector(d2, L2 * 0.5),
      p2,
    ]);
    const r = 0.0098 - i * 0.0002;
    const geo = tube(
      curve,
      [
        { t: 0, w: r, h: r * 0.92 },
        { t: 0.45, w: r * 0.93, h: r * 0.88 },
        { t: 0.5, w: r * 1.02, h: r * 0.95 },
        { t: 0.56, w: r * 0.92, h: r * 0.86 },
        { t: 0.95, w: r * 0.86, h: r * 0.82 },
        { t: 1, w: r * 0.6, h: r * 0.55 },
      ],
      24,
      12,
      V(0, 0, 1),
    );
    g.add(new THREE.Mesh(wear(geo), leather));
    const tip = new THREE.Mesh(wear(new THREE.SphereGeometry(r * 0.86, 12, 10), -0.17), leather);
    tip.position.copy(p2);
    g.add(tip);
  });
  // Thumb, from the heel of the hand, tucked toward the index finger.
  {
    const tx = thumbSide * 0.034;
    const curve = new THREE.CatmullRomCurve3([
      V(tx * 0.8, -0.03, -0.006),
      V(tx * 1.1, -0.06, -0.014),
      V(tx * 0.95, -0.088, -0.022),
      V(tx * 0.6, -0.106, -0.026),
    ]);
    const geo = tube(
      curve,
      [
        { t: 0, w: 0.015, h: 0.012 },
        { t: 0.5, w: 0.0115, h: 0.0105 },
        { t: 1, w: 0.0095, h: 0.009 },
      ],
      20,
      12,
      V(0, 0, 1),
    );
    g.add(new THREE.Mesh(wear(geo), leather));
    const tip = new THREE.Mesh(white(new THREE.SphereGeometry(0.0092, 12, 10)), leather);
    tip.position.copy(curve.getPoint(1));
    g.add(tip);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// ---------------------------------------------------------------- jeans

/** Seat and waist of the jeans, worn low and baggy, with the belt. Hips-local (y - hip). */
export function jeansTop(m: Clothes): THREE.Group {
  const g = new THREE.Group();
  const seat = vTube(
    0.76,
    0.935,
    [
      [0.76, 0.112, 0.08, -0.016],
      [0.79, 0.15, 0.106, -0.014],
      [0.84, 0.168, 0.116, -0.01],
      [0.88, 0.171, 0.117, -0.006],
      [0.935, 0.163, 0.11, 0.0],
    ],
    64,
    300,
  );
  // The belt cinches a too-big waist: gathers round the waistband, slack folds below.
  wrinkle(seat, (_x, y, _z, a) => {
    let d = 0.0022 * Math.sin(a * 24) * smooth(0.89, 0.92, y);
    d += 0.003 * Math.sin(a * 6 + y * 50) * (1 - smooth(0.84, 0.9, y));
    // Whiskers: creases fanning out from the crotch across the front of the hips.
    for (const s of [-1, 1])
      d -=
        0.0018 *
        Math.exp(-(((a - s * 0.45) / 0.3) ** 2)) *
        Math.max(0, Math.sin((y - 0.78) * 260 - s * a * 6)) *
        smooth(0.77, 0.8, y) *
        (1 - smooth(0.86, 0.9, y));
    return d;
  });
  const seatMesh = new THREE.Mesh(seat, m.jeans);
  g.add(seatMesh);
  const add = (o: THREE.Object3D | null) => o && g.add(o);
  // Waistband with its top stitching.
  add(
    band(
      seatMesh,
      90,
      (t) => radial(-Math.PI + t * Math.PI * 2, 0.932),
      0.003,
      0.0012,
      m.thread,
      0.005,
    ),
  );
  // Front pockets: curved openings with stitching and copper rivets at the corners.
  for (const s of [-1, 1]) {
    const curve = (t: number) => {
      const a = s * (0.55 + t * 0.6);
      const y = 0.928 - Math.sin(t * Math.PI * 0.5) * 0.075;
      return radial(a, y);
    };
    add(band(seatMesh, 30, curve, 0.0035, 0.0006, m.seamDark));
    add(
      band(
        seatMesh,
        30,
        (t) => {
          const r = curve(t);
          r.from.y -= 0.006;
          return r;
        },
        0.0016,
        0.0012,
        m.thread,
        0.005,
      ),
    );
    for (const t of [0.02, 0.98]) {
      const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.002, 10), m.copper);
      rv.rotation.x = Math.PI / 2;
      const h = new THREE.Group();
      h.add(rv);
      add(stick(seatMesh, curve(t), h, 0.0012));
    }
  }
  // Watch pocket on the right front.
  add(
    patch(
      seatMesh,
      6,
      5,
      (u, v) => radial(-0.95 + u * 0.28, 0.882 + v * 0.04),
      0.0015,
      m.jeanPatch,
    ),
  );
  // The fly, stitched in a J.
  add(
    band(
      seatMesh,
      30,
      (t) => {
        const y = 0.93 - t * 0.12;
        const x = 0.016 - smooth(0.75, 1, t) * 0.016;
        return straight(x, y);
      },
      0.0016,
      0.0012,
      m.thread,
      0.005,
    ),
  );
  // Back pockets: patches with double stitching and the arcs across them.
  for (const s of [-1, 1]) {
    const cx = s * 0.075;
    const shape = (u: number, v: number) => v > 0.18 * (1 - Math.abs(u - 0.5) * 2);
    add(
      patch(
        seatMesh,
        10,
        12,
        (u, v) => straight(cx - 0.06 + u * 0.12, 0.775 + v * 0.13, -1),
        0.0018,
        m.jeanPatch,
        shape,
      ),
    );
    for (const k of [0.006, 0.011])
      add(
        band(
          seatMesh,
          40,
          (t) => {
            const u = t;
            const v = 0.18 * (1 - Math.abs(u - 0.5) * 2);
            return straight(cx - 0.06 + k + u * (0.12 - 2 * k), 0.775 + v * 0.13 + k, -1);
          },
          0.0014,
          0.0028,
          m.thread,
          0.005,
        ),
      );
    add(
      band(
        seatMesh,
        30,
        (t) => straight(cx - 0.05 + t * 0.1, 0.84 + Math.sin(t * Math.PI) * 0.012, -1),
        0.0014,
        0.0028,
        m.thread,
        0.005,
      ),
    );
  }
  // The belt, its loops, the buckle and the tail end.
  const belt = vTube(
    0.899,
    0.935,
    [
      [0.899, 0.171, 0.118, 0],
      [0.935, 0.167, 0.114, 0],
    ],
    64,
    200,
  );
  g.add(new THREE.Mesh(white(belt), m.belt));
  for (const a of [0.42, 1.15, 1.95, Math.PI, -1.95, -1.15, -0.42]) {
    const loop = new THREE.Mesh(white(new THREE.BoxGeometry(0.013, 0.046, 0.004)), m.jeans);
    const h = new THREE.Group();
    h.add(loop);
    const r = radial(a, 0.917);
    const hit = stick(seatMesh, r, h, 0.0062);
    if (hit) g.add(hit);
  }
  {
    const buckle = new THREE.Group();
    const bar = (w: number, hgt: number, x: number, y: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.004), m.brass);
      b.position.set(x, y, 0);
      buckle.add(b);
    };
    bar(0.05, 0.005, 0, 0.0195);
    bar(0.05, 0.005, 0, -0.0195);
    bar(0.005, 0.044, -0.0225, 0);
    bar(0.005, 0.044, 0.0225, 0);
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), m.brass);
    prong.position.set(-0.008, 0, 0.002);
    buckle.add(prong);
    const tip = new THREE.Mesh(white(new THREE.BoxGeometry(0.06, 0.033, 0.004)), m.belt);
    tip.position.set(0.03, 0, -0.002);
    buckle.add(tip);
    const h = stick(seatMesh, straight(0.0, 0.917), buckle, 0.009);
    if (h) g.add(h);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  // Worn low: the whole waist and seat hang a few centimetres below his hips, baggy.
  g.position.y = -J.hip - 0.035;
  g.scale.set(0.98, 1, 1.0);
  return g;
}

/** One leg of the jeans (hip-local, down -y) with knee and ankle joints and the boot. */
export function leg(m: Clothes, side: number) {
  const hip = new THREE.Group();
  const T = J.thigh,
    S = J.shin;
  const thigh = vTube(
    -T - 0.01,
    -0.06,
    [
      [-0.06, 0.096, 0.1, -0.006],
      [-0.15, 0.09, 0.093, 0],
      [-T + 0.04, 0.082, 0.085, 0],
      [-T - 0.01, 0.081, 0.084, 0],
    ],
    40,
    260,
  );
  wrinkle(thigh, (_x, y, _z, a) => {
    // Loose denim: long soft folds, creases behind the knee.
    let d = 0.003 * Math.sin(a * 4 + y * 12 + side);
    d +=
      0.0035 *
      Math.exp(-(((Math.abs(a) - Math.PI) / 0.7) ** 2)) *
      Math.sin(y * 210) *
      smooth(-T + 0.09, -T + 0.02, y);
    return d;
  });
  const thighCloth = {
    y0: -0.08,
    y1: -0.15,
    y2: -0.36,
    y3: -0.42,
    a0: 0.0008,
    aw: 0.0028,
    ag: 0.0012,
  };
  const thighMat = limbCloth(m.jeanLeg, 'thigh' + side, { ...thighCloth, seed: side * 1.3 });
  const thighThread = limbCloth(m.thread, 'thigh-thread' + side, {
    ...thighCloth,
    seed: side * 1.3,
  });
  const tm = new THREE.Mesh(thigh, thighMat);
  hip.add(tm);
  // Outer seam with its stitching.
  hip.add(
    band(
      tm,
      40,
      (t) => radial(side * Math.PI * 0.5, -0.07 - t * (T - 0.09)),
      0.0022,
      0.0008,
      thighThread,
      0.005,
    )!,
  );
  const knee = new THREE.Group();
  knee.position.y = -T;
  hip.add(knee);
  knee.add(new THREE.Mesh(white(new THREE.SphereGeometry(0.082, 24, 16)), m.jeanLeg));
  const shinG = vTube(
    -S - 0.04,
    0.01,
    [
      [0.01, 0.081, 0.084, 0],
      [-0.15, 0.078, 0.08, 0],
      [-S + 0.09, 0.08, 0.082, 0.002],
      [-S + 0.01, 0.086, 0.09, 0.008],
      [-S - 0.04, 0.089, 0.095, 0.012],
    ],
    40,
    300,
  );
  // The legs are long enough to stack up in folds over the boots.
  wrinkle(shinG, (_x, y, _z, a) => {
    let d = 0.0025 * Math.sin(a * 3 + y * 9 - side);
    const stack = smooth(-S + 0.13, -S + 0.02, y);
    d +=
      stack *
      (0.0032 * Math.sin(y * 140 + Math.sin(a * 2 + side) * 2.6) +
        0.0018 * Math.sin(y * 230 - a * 3 + side));
    d += 0.003 * Math.exp(-((a / 0.8) ** 2)) * Math.sin(y * 120) * G(y, 0, -0.03, 0, 0.05, 1);
    return d;
  });
  // The lower legs swing and the loose denim flaps round the boots, most at the hem.
  const shinCloth = { y0: -0.04, y1: -0.12, a0: 0.001, aw: 0.0042, ag: 0.0016 };
  const shinMat = limbCloth(m.jeanLeg, 'shin' + side, { ...shinCloth, seed: side * 2.9 + 2 });
  const shinThread = limbCloth(m.thread, 'shin-thread' + side, {
    ...shinCloth,
    seed: side * 2.9 + 2,
  });
  const sm = new THREE.Mesh(shinG, shinMat);
  knee.add(sm);
  knee.add(
    band(
      sm,
      40,
      (t) => radial(side * Math.PI * 0.5, -0.01 - t * (S - 0.02)),
      0.0022,
      0.0008,
      shinThread,
      0.005,
    )!,
  );
  // Hem: a turned edge.
  const hem = vTube(-S - 0.045, -S - 0.028, [
    [-S - 0.045, 0.092, 0.099, 0.013],
    [-S - 0.028, 0.091, 0.098, 0.012],
  ]);
  knee.add(new THREE.Mesh(white(hem), shinMat));
  const ankle = new THREE.Group();
  ankle.position.y = -S;
  knee.add(ankle);
  ankle.add(boot());
  hip.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { hip, knee, ankle };
}

// ---------------------------------------------------------------- boots

/** Brown cowboy boot, ankle at the origin: pointed toe with fancy stitching, riding heel. */
function boot(): THREE.Group {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.x = 0.056; // pitched toe-down on the heel so heel and sole both meet the ground
  outer.add(g);
  const grain = leatherBump();
  const vamp = canvasTex(256, 256, (x) => {
    x.fillStyle = '#6e4529';
    x.fillRect(0, 0, 256, 256);
    // Worn, lighter creases across the toe box; darker polish at the toe.
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(30,15,5,0.35)');
    gr.addColorStop(0.5, 'rgba(30,15,5,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    // Decorative toe stitching (top of the foot is u = 0.25).
    x.strokeStyle = 'rgba(230,200,150,0.75)';
    x.lineWidth = 1.6;
    x.setLineDash([4, 3]);
    for (const off of [0, 8]) {
      x.beginPath();
      for (let i = 0; i <= 40; i++) {
        const v = 0.45 + (i / 40) * 0.4;
        const u = 0.25 + Math.sin(v * 22) * 0.03 + (off ? 0.035 : -0.035) * (1 - (v - 0.45) * 1.6);
        const p: [number, number] = [u * 256, (1 - v) * 256];
        i ? x.lineTo(...p) : x.moveTo(...p);
      }
      x.stroke();
    }
    x.setLineDash([]);
    for (let i = 0; i < 20; i++) {
      x.strokeStyle = 'rgba(150,110,80,0.3)';
      x.beginPath();
      const v = 0.35 + rnd() * 0.15;
      x.moveTo(0.12 * 256, (1 - v) * 256);
      x.lineTo(0.38 * 256, (1 - v - 0.01) * 256);
      x.stroke();
    }
  });
  const leather = new THREE.MeshStandardMaterial({
    map: vamp,
    roughness: 0.45,
    bumpMap: grain,
    bumpScale: 0.4,
  });
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x6b4428,
    roughness: 0.5,
    bumpMap: grain,
    bumpScale: 0.4,
  });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8 });
  const welt = new THREE.MeshStandardMaterial({ color: 0x3d2a1b, roughness: 0.7 });
  g.add(
    new THREE.Mesh(
      // Only the bottom of the shaft: the rest is hidden under the jeans, and a tall shaft
      // would push through the hem as the foot tips.
      vTube(
        -0.02,
        0.07,
        [
          [-0.02, 0.048, 0.056],
          [0.07, 0.046, 0.05],
        ],
        24,
      ),
      shaftMat,
    ),
  );
  const foot = new THREE.CatmullRomCurve3([
    V(0, -0.02, -0.07),
    V(0, -0.03, 0.0),
    V(0, -0.045, 0.1),
    V(0, -0.052, 0.17),
    V(0, -0.05, 0.215),
  ]);
  g.add(
    new THREE.Mesh(
      tube(
        foot,
        [
          { t: 0, w: 0.04, h: 0.05 },
          { t: 0.28, w: 0.045, h: 0.045 },
          { t: 0.55, w: 0.043, h: 0.03 },
          { t: 0.8, w: 0.025, h: 0.018 },
          { t: 0.95, w: 0.008, h: 0.01 },
          { t: 1, w: 0.002, h: 0.004 },
        ],
        40,
        24,
      ),
      leather,
    ),
  );
  // Sole tapering to the toe, a stitched welt round its edge, and the stacked riding heel.
  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.04, -0.085);
  soleShape.lineTo(0.04, -0.085);
  soleShape.quadraticCurveTo(0.05, 0.08, 0.004, 0.225);
  soleShape.lineTo(-0.004, 0.225);
  soleShape.quadraticCurveTo(-0.05, 0.08, -0.04, -0.085);
  const sg = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.01,
    bevelEnabled: false,
    curveSegments: 16,
  });
  sg.rotateX(Math.PI / 2);
  const so = new THREE.Mesh(sg, sole);
  so.position.y = -0.066;
  g.add(so);
  const wg = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.004,
    bevelEnabled: false,
    curveSegments: 16,
  });
  wg.rotateX(Math.PI / 2);
  wg.scale(1.04, 1, 1.01);
  const we = new THREE.Mesh(wg, welt);
  we.position.y = -0.053;
  g.add(we);
  // A low stacked leather heel: two layers.
  for (let i = 0; i < 2; i++) {
    const layer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 - i * 0.001, 0.029 - i * 0.001, 0.011, 16),
      i % 2 ? sole : welt,
    );
    layer.scale.set(1.15, 1, 1.1);
    layer.position.set(0, -0.075 - i * 0.011, -0.05 - i * 0.001);
    layer.rotation.x = 0.05;
    g.add(layer);
  }
  outer.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return outer;
}

export { mergeGeometries };
