import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type TreeGeo, treeKit } from '../render/foliage.ts';

/**
 * The farm's tree species, each built to read as itself from its outline and colour first:
 *  - Scotch pine (the giant): a bare orange upper trunk, a few crooked limbs and a flat,
 *    lopsided crown of separate blue-green needle pads.
 *  - Christmas-tree grid: sheared cones in four kinds. Scotch pine is tufty and blue-green;
 *    Douglas fir is dark, soft and pointed; white pine is pale, feathery and tiered; blue
 *    spruce is stiff, spiky and silver-blue.
 *  - Roadside spruces: tall and dark with drooping branch curtains.
 *  - Orchard: apples low and spreading, pears upright, cherries rounded.
 *  - Woods: oaks, maples and ashes so the far tree line isn't one tree repeated.
 * Built in metres at a reference size; the batches scale them to each tree's height.
 */

const { wobble, shade, blob, cards, bark, branch, merge } = treeKit;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const C = (h: number) => new THREE.Color(h);

let seed = 911;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

// ------------------------------------------------------------------ conifers

interface ConeSpec {
  height: number;
  /** Base radius of the lowest tier as a fraction of height. */
  spread: number;
  tiers: number;
  /** How much each tier overlaps the next (1 = touching, 2 = solid sheared cone). */
  overlap: number;
  /** Bare trunk showing under the lowest tier (m). */
  skirt: number;
  /** Rim teeth: count around and depth (fraction of radius). */
  teeth: number;
  jag: number;
  /** Tips droop down (fraction of radius) and flick up at the very edge. */
  droop: number;
  upturn: number;
  /** Lumpy surface (tufts) amplitude and frequency. */
  fluff: number;
  fluffF: number;
  /** Bottom tier to top tier colours. */
  low: number;
  high: number;
  trunk: number;
  /** Needle cards per tier (scaled by radius) and their size (fraction of tier radius). */
  cardN: number;
  cardSize: number;
  /** How far out the cards sit (1 = on the surface). */
  cardOut: number;
  /** Radius profile exponent: 1 straight cone, <1 fuller shoulders, >1 narrow top. */
  shape: number;
}

function coneTier(
  s: ConeSpec,
  r: number,
  h: number,
  y: number,
  col: THREE.Color,
  k: number,
): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(r, h, 18, 5, false);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position!;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const rim = THREE.MathUtils.clamp((-p.y + h / 2) / h, 0, 1);
    const a = Math.atan2(p.z, p.x);
    // Branch tips: a pointed triangle wave round the rim, each tip a different length.
    const u = (a / (Math.PI * 2)) * s.teeth + k * 0.37;
    const tip = 1 - 2 * Math.abs(u - Math.floor(u) - 0.5);
    const len = 0.7 + 0.6 * Math.abs(Math.sin(Math.floor(u) * 12.9898 + k * 78.233));
    const teeth = 1 + rim * s.jag * (tip ** 1.6 * len * 1.4 - 0.45);
    const fl = 1 + s.fluff * wobble(p, s.fluffF / Math.max(r, 0.2), k * 3.1);
    p.x *= teeth * fl;
    p.z *= teeth * fl;
    p.y += -rim * rim * s.droop * r + rim ** 8 * s.upturn * r;
    pos.setXYZ(i, p.x, p.y + y + h / 2, p.z);
  }
  g.computeVertexNormals();
  return shade(g, col, V(0, y + h * 0.6, 0), Math.max(h, r) * 0.9, 0.1);
}

/** Needle cards around a tier's rim and flanks, facing out and a little up. */
function rimCards(
  s: ConeSpec,
  r: number,
  h: number,
  y: number,
  col: THREE.Color,
): THREE.BufferGeometry {
  const n = Math.max(4, Math.round(s.cardN * (0.5 + r)));
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const t = Math.pow(rnd(), 0.7); // more near the rim
    const rr = r * (0.35 + 0.65 * t) * s.cardOut;
    const yy = y + h * (1 - t) * 0.85 - t * t * s.droop * r;
    const dir = V(Math.cos(a), 0.25 + rnd() * 0.5 - s.droop * 0.6, Math.sin(a)).normalize();
    const size = r * s.cardSize * (0.7 + rnd() * 0.6);
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateZ(rnd() * Math.PI * 2);
    q.setFromUnitVectors(V(0, 0, 1), dir);
    g.applyQuaternion(q);
    g.translate(Math.cos(a) * rr, yy, Math.sin(a) * rr);
    const k = 0.8 + 0.3 * t;
    const c = new Float32Array(12);
    for (let v = 0; v < 4; v++) c.set([col.r * k, col.g * k, col.b * k], v * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  }
  return merge(parts);
}

function conifer(s: ConeSpec): TreeGeo {
  const H = s.height;
  const solid = [
    bark(
      new THREE.CylinderGeometry(H * 0.012, H * 0.03, H * 0.9, 7).translate(0, H * 0.45, 0),
      s.trunk,
    ),
  ];
  const leaves: THREE.BufferGeometry[] = [];
  const lo = C(s.low),
    hi = C(s.high);
  const crown = H - s.skirt;
  const step = crown / s.tiers;
  for (let k = 0; k < s.tiers; k++) {
    const t = k / Math.max(1, s.tiers - 1);
    const base = s.skirt + k * step * 0.96;
    const th = Math.min(step * s.overlap, H - base);
    // Radius shrinks toward the top along the profile curve.
    const r = Math.max(0.08, s.spread * H * Math.pow(1 - (base - s.skirt) / crown, s.shape));
    const col = lo.clone().lerp(hi, t);
    solid.push(coneTier(s, r, th, base, col, k + 1));
    leaves.push(rimCards(s, r, th, base, col.clone().multiplyScalar(1.05)));
  }
  // The leader: a thin spike of new growth at the very top.
  solid.push(
    shade(
      new THREE.ConeGeometry(H * 0.012, H * 0.07, 5).translate(0, H * 1.005, 0),
      hi.clone().multiplyScalar(1.1),
      V(0, H, 0),
      1,
    ),
  );
  return { solid: merge(solid), leaves: merge(leaves), needles: true };
}

const XMAS: Record<'scotch' | 'douglas' | 'white' | 'blue', ConeSpec> = {
  // Sheared Scotch pine: full and broad, a lumpy, tufted surface of long twisted needles,
  // blue-green with a yellowish cast at the tips.
  scotch: {
    height: 3,
    spread: 0.42,
    tiers: 8,
    overlap: 2.1,
    skirt: 0.12,
    teeth: 9,
    jag: 0.16,
    droop: 0.02,
    upturn: 0.05,
    fluff: 0.28,
    fluffF: 6,
    low: 0x355f45,
    high: 0x6c8b4c,
    trunk: 0x7a4a2c,
    cardN: 15,
    cardSize: 0.62,
    cardOut: 1.12,
    shape: 0.85,
  },
  // Douglas fir: dark, soft and dense, a narrower cone with a sharp top and soft drooping tips.
  douglas: {
    height: 3,
    spread: 0.3,
    tiers: 9,
    overlap: 1.7,
    skirt: 0.1,
    teeth: 12,
    jag: 0.24,
    droop: 0.18,
    upturn: 0.04,
    fluff: 0.06,
    fluffF: 6,
    low: 0x1f4a2a,
    high: 0x2f6236,
    trunk: 0x5a3c28,
    cardN: 14,
    cardSize: 0.48,
    cardOut: 1.08,
    shape: 1.05,
  },
  // White pine: pale, soft and feathery, layered whorls with daylight between them, long
  // needles fringing out past the body.
  white: {
    height: 3,
    spread: 0.38,
    tiers: 5,
    overlap: 1.1,
    skirt: 0.14,
    teeth: 8,
    jag: 0.32,
    droop: 0.05,
    upturn: 0.08,
    fluff: 0.16,
    fluffF: 3,
    low: 0x3f6f58,
    high: 0x6b9a7c,
    trunk: 0x5e5248,
    cardN: 20,
    cardSize: 0.78,
    cardOut: 1.2,
    shape: 0.95,
  },
  // Blue spruce: stiff and symmetric, sharp tiers with spiky rims flicking up, silver-blue.
  blue: {
    height: 3,
    spread: 0.33,
    tiers: 10,
    overlap: 1.45,
    skirt: 0.08,
    teeth: 18,
    jag: 0.32,
    droop: 0.06,
    upturn: 0.3,
    fluff: 0.02,
    fluffF: 8,
    low: 0x55777a,
    high: 0x95b1b0,
    trunk: 0x5a4636,
    cardN: 9,
    cardSize: 0.34,
    cardOut: 1.06,
    shape: 1.0,
  },
};

export const xmasTree = (kind: keyof typeof XMAS): TreeGeo => conifer(XMAS[kind]);

/** Tall roadside spruce: dark, narrow, with branches sweeping down into hanging curtains. */
export function spruce(): TreeGeo {
  return conifer({
    height: 13,
    spread: 0.3,
    tiers: 14,
    overlap: 1.8,
    skirt: 0.5,
    teeth: 10,
    jag: 0.3,
    droop: 0.35,
    upturn: 0.1,
    fluff: 0.12,
    fluffF: 3,
    low: 0x1d3f26,
    high: 0x2d5a33,
    trunk: 0x4f3a2a,
    cardN: 14,
    cardSize: 0.45,
    cardOut: 1.08,
    shape: 1.0,
  });
}

/** Arborvitae, about 11 ft: a dense, rounded column of soft, flat sprays. */
export function arborvitaeTree(): TreeGeo {
  return conifer({
    height: 3.35,
    spread: 0.3,
    tiers: 9,
    overlap: 2.6,
    skirt: 0.05,
    teeth: 7,
    jag: 0.12,
    droop: 0.0,
    upturn: 0.0,
    fluff: 0.26,
    fluffF: 5,
    low: 0x2c5a2a,
    high: 0x4b7f3a,
    trunk: 0x5a4030,
    cardN: 16,
    cardSize: 0.6,
    cardOut: 1.08,
    shape: 0.55,
  });
}

/**
 * The giant Scotch pine: grey, plated bark low down turning bare orange-red up the trunk, a
 * slight crook, a few stubs of old dead limbs, and big crooked limbs carrying a flat-topped,
 * lopsided crown of separate blue-green needle pads.
 */
export function scotchGiant(): TreeGeo {
  const grey = 0x6d5d50,
    orange = 0xb8693a,
    limbCol = 0x9c5a34;
  const trunkPts = [V(0, 0, 0), V(0.1, 4, 0.05), V(-0.05, 8, 0.2), V(0.25, 12.5, 0.1)];
  const top = [V(0.25, 12.5, 0.1), V(0.4, 15.5, -0.15), V(0.3, 18.2, -0.3)];
  const solid = [
    bark(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts.slice(0, 3)), 10, 0.5, 9),
      grey,
    ),
    bark(new THREE.CylinderGeometry(0.52, 0.75, 0.8, 9).translate(0, 0.25, 0), grey),
    bark(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts.slice(2)), 8, 0.36, 8), orange),
    bark(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 8, 0.24, 7), orange),
  ];
  // Stubs of old lower limbs, long since shaded out.
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2,
      y = 3.5 + i * 1.1;
    solid.push(
      branch(
        [V(0, y, 0), V(Math.cos(a) * 0.6, y + 0.15, Math.sin(a) * 0.6)],
        0.05,
        i < 3 ? 0x4b4038 : 0x7a5038,
      ),
    );
  }
  const leaves: THREE.BufferGeometry[] = [];
  const pad = (c: THREE.Vector3, r: number, k: number) => {
    const cols = [0x2f5a46, 0x3a6a52, 0x45745a];
    solid.push(blob(c, r, C(cols[Math.abs(k) % 3]!), 40 + k, 0.34));
    leaves.push(cards(c, r * 0.95, Math.round(r * 16), 1.2, C(cols[(Math.abs(k) + 1) % 3]!)));
  };
  // Limbs: angled up out of the orange trunk, levelling out, each ending in needle pads.
  // The crown leans to one side and is flat on top.
  // Limbs: angled up out of the orange trunk, levelling out, carrying flat plates of needles
  // along their outer half. The crown is broad, open, lopsided and flat on top.
  const limbs: [number, number, number, number][] = [
    // angle, height on trunk, reach, rise
    [0.3, 8.6, 6.6, 2.4],
    [1.5, 9.3, 5.4, 2.8],
    [2.6, 9.9, 6.2, 2.6],
    [3.8, 10.6, 5.8, 2.9],
    [5.0, 11.3, 6.0, 2.6],
    [0.9, 12.2, 5.0, 2.8],
    [2.1, 12.9, 4.6, 2.6],
    [4.4, 13.6, 4.8, 2.5],
    [5.6, 14.4, 4.0, 2.3],
    [3.2, 15.2, 3.4, 2.0],
    [1.2, 15.9, 2.8, 1.6],
  ];
  limbs.forEach(([a, y, reach, rise], k) => {
    const dx = Math.cos(a),
      dz = Math.sin(a);
    const at = (t: number, up = 0) =>
      V(dx * reach * t + 0.3, y + rise * Math.sin(t * Math.PI * 0.5) + up, dz * reach * t);
    solid.push(
      branch(
        [V(0.2, y, 0.1), at(0.35, (rnd() - 0.5) * 0.4), at(0.7, (rnd() - 0.5) * 0.5), at(1)],
        0.2 - k * 0.011,
        limbCol,
      ),
    );
    // Plates of needles along the outer limb, and a side shoot carrying its own.
    pad(at(1, 0.2), 2.2 - k * 0.06, k);
    pad(at(0.72, 0.35), 1.7, k + 1);
    if (reach > 4) pad(at(0.48, 0.45), 1.3, k + 2);
    const sa = a + (k % 2 ? 0.8 : -0.8);
    const side = at(0.65);
    solid.push(
      branch(
        [side, side.clone().add(V(Math.cos(sa) * 1.8, 0.6, Math.sin(sa) * 1.8))],
        0.07,
        limbCol,
      ),
    );
    pad(side.clone().add(V(Math.cos(sa) * 2.0, 0.8, Math.sin(sa) * 2.0)), 1.5, k + 3);
  });
  // The flat top.
  for (const [x, yy, z, r] of [
    [0.4, 18.0, -0.2, 2.3],
    [2.4, 17.6, 1.6, 2.0],
    [-1.8, 17.5, -1.4, 1.9],
    [-0.6, 17.8, 2.0, 1.7],
    [1.8, 17.4, -2.0, 1.7],
  ] as const)
    pad(V(x, yy, z), r, Math.round(x * 3 + z));
  return { solid: merge(solid), leaves: merge(leaves), needles: true };
}

// ------------------------------------------------------------------ broadleaf

interface BroadSpec {
  trunkH: number;
  trunkR: number;
  trunk: number;
  /** Crown clumps: [x, y, z, r] in metres. */
  clumps: [number, number, number, number][];
  leaves: number[];
  squash: number;
  /** Main limbs from the trunk top to each of the first n clumps. */
  limbs: number;
  lean?: number;
}

function broadleaf(s: BroadSpec, sd: number): TreeGeo {
  const lean = s.lean ?? 0;
  const top = V(lean, s.trunkH, lean * 0.4);
  const solid = [
    bark(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([V(0, 0, 0), V(lean * 0.3, s.trunkH * 0.5, 0), top]),
        8,
        s.trunkR,
        8,
      ),
      s.trunk,
    ),
    bark(
      new THREE.CylinderGeometry(s.trunkR * 1.1, s.trunkR * 1.6, 0.5, 8).translate(0, 0.2, 0),
      s.trunk,
    ),
  ];
  const cols = s.leaves.map(C);
  const leaves: THREE.BufferGeometry[] = [];
  s.clumps.forEach(([x, y, z, r], i) => {
    const c = V(x, y, z);
    if (i < s.limbs)
      solid.push(
        branch(
          [
            top,
            top
              .clone()
              .lerp(c, 0.5)
              .add(V(0, 0.3, 0)),
            c.clone().multiplyScalar(0.85),
          ],
          s.trunkR * 0.55,
          s.trunk,
        ),
      );
    solid.push(blob(c, r * 0.9, cols[i % cols.length]!, sd + i, s.squash));
    leaves.push(cards(c, r, Math.round(r * 15), r * 0.75, cols[(i + 1) % cols.length]!));
  });
  return { solid: merge(solid), leaves: merge(leaves) };
}

/** Trained apple: short, crooked trunk and a wide, low, spreading crown. */
const APPLE: BroadSpec = {
  trunkH: 1.3,
  trunkR: 0.17,
  trunk: 0x5a4434,
  lean: 0.2,
  limbs: 4,
  squash: 0.7,
  leaves: [0x4a8a3a, 0x3d7a33, 0x56984a],
  clumps: [
    [1.5, 2.4, 0.3, 1.3],
    [-1.4, 2.5, -0.4, 1.25],
    [0.2, 2.6, 1.5, 1.2],
    [-0.2, 2.4, -1.5, 1.2],
    [0.1, 3.2, 0, 1.4],
    [1.0, 3.0, -1.0, 0.9],
    [-1.0, 3.0, 1.0, 0.9],
  ],
};
export const appleTree = (): TreeGeo => broadleaf(APPLE, 5);

/** Pear: upright and pyramid-shaped, taller than wide. */
const PEAR: BroadSpec = {
  trunkH: 1.8,
  trunkR: 0.15,
  trunk: 0x4d3c30,
  limbs: 3,
  squash: 1.05,
  leaves: [0x3f7f3a, 0x4b8c40, 0x356f33],
  clumps: [
    [0.6, 2.6, 0.2, 1.0],
    [-0.6, 2.7, -0.3, 1.0],
    [0, 2.8, 0.7, 0.95],
    [0, 3.6, 0, 1.0],
    [0.2, 4.4, -0.1, 0.8],
    [0, 5.0, 0.1, 0.55],
  ],
};
export const pearTree = (): TreeGeo => broadleaf(PEAR, 11);

/** Cherry: reddish banded bark and a rounded crown. */
const CHERRY: BroadSpec = {
  trunkH: 1.5,
  trunkR: 0.14,
  trunk: 0x6a3a30,
  limbs: 3,
  squash: 0.85,
  leaves: [0x4e8f3c, 0x5c9c48, 0x437f36],
  clumps: [
    [0.9, 2.5, 0.2, 1.05],
    [-0.8, 2.6, -0.3, 1.05],
    [0.1, 2.7, 0.9, 1.0],
    [0, 3.4, -0.2, 1.15],
  ],
};
export const cherryTree = (): TreeGeo => broadleaf(CHERRY, 17);

/** Crown clumps of the orchard trees, so fruit can hang on the outside of the leaves. */
export const CROWNS = { apple: APPLE, pear: PEAR, cherry: CHERRY };

/** Woods: a broad oak, a tall rounded maple and an open, airy ash. */
export const WOODS: (() => TreeGeo)[] = [
  () =>
    broadleaf(
      {
        trunkH: 3.2,
        trunkR: 0.45,
        trunk: 0x4f4034,
        limbs: 5,
        squash: 0.7,
        leaves: [0x3c6f30, 0x4a7f38, 0x335f2a],
        clumps: [
          [2.6, 5.4, 0.5, 2.4],
          [-2.4, 5.6, -0.8, 2.3],
          [0.4, 5.8, 2.5, 2.2],
          [-0.3, 5.5, -2.6, 2.2],
          [0, 7.2, 0, 2.6],
          [1.8, 6.8, -1.6, 1.7],
        ],
      },
      21,
    ),
  () =>
    broadleaf(
      {
        trunkH: 3.6,
        trunkR: 0.33,
        trunk: 0x5d5148,
        limbs: 3,
        squash: 0.95,
        leaves: [0x4f9040, 0x5ca04a, 0x44803a],
        clumps: [
          [1.4, 5.6, 0.3, 2.0],
          [-1.3, 5.8, -0.4, 2.0],
          [0.1, 6.2, 1.4, 1.9],
          [0, 7.6, -0.2, 2.2],
          [0.2, 9.0, 0, 1.5],
        ],
      },
      27,
    ),
  () =>
    broadleaf(
      {
        trunkH: 4.5,
        trunkR: 0.28,
        trunk: 0x6b6258,
        limbs: 5,
        squash: 0.8,
        leaves: [0x5b9a4a, 0x6aa852, 0x4e8c40],
        clumps: [
          [2.0, 6.6, 0.6, 1.4],
          [-1.9, 7.0, -0.5, 1.5],
          [0.5, 7.4, 2.0, 1.3],
          [-0.4, 7.2, -1.9, 1.3],
          [0.2, 8.6, 0, 1.6],
        ],
      },
      33,
    ),
];
