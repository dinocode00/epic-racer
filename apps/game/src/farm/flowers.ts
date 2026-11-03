import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { windy } from '../render/wind.ts';
import { addPerch } from './perches.ts';

/**
 * Flowers that grow on a Wisconsin farm in summer, modelled as plants rather than blobs: every
 * petal is its own curved, tapered blade, heads have their discs and cones, clusters are built
 * from five-petalled florets, and stems carry their leaves. All in real metres, y up.
 *
 * Garden and bed flowers: black-eyed Susan, purple coneflower, bee balm, garden phlox, orange
 * daylily, petunia, marigold, geranium, zinnia, sunflower. Meadow and roadside: Queen Anne's
 * lace, chicory, butterfly weed, goldenrod. Vegetables for the garden: lettuce and tomatoes.
 *
 * Each kind is built a few times over (so no two clumps match) and drawn instanced: a whole bed
 * of one kind is a single draw.
 */

export type FlowerKind =
  | 'susan'
  | 'coneflower'
  | 'beebalm'
  | 'bergamot'
  | 'phloxPink'
  | 'phloxWhite'
  | 'phloxMagenta'
  | 'daylily'
  | 'petuniaPurple'
  | 'petuniaPink'
  | 'petuniaWhite'
  | 'petuniaRed'
  | 'marigold'
  | 'marigoldYellow'
  | 'geraniumRed'
  | 'geraniumPink'
  | 'zinniaMagenta'
  | 'zinniaOrange'
  | 'zinniaRed'
  | 'zinniaYellow'
  | 'sunflower'
  | 'queenAnne'
  | 'chicory'
  | 'milkweedOrange'
  | 'goldenrod'
  | 'lettuce'
  | 'tomato';

let seed = 90210;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a: number, b: number) => a + rnd() * (b - a);

const C = (h: number) => new THREE.Color(h);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// ------------------------------------------------------------------ building blocks

/** Keep only what every part shares (position, normal, colour), indexed, so parts merge. */
function tidy(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes))
    if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.index) {
    const n = g.attributes.position!.count;
    g.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Colour every vertex, or by height (`c1` at the top of the part's bounding box). */
function paint(g: THREE.BufferGeometry, c0: THREE.Color, c1 = c0): THREE.BufferGeometry {
  const p = g.attributes.position!;
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y,
    y1 = g.boundingBox!.max.y;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = y1 > y0 ? (p.getY(i) - y0) / (y1 - y0) : 0;
    c.copy(c0).lerp(c1, t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return tidy(g);
}

interface StripOpts {
  segL?: number;
  segW?: number;
  /** Edges curl up (positive) across the width. */
  cup?: number;
  /** The tip curls down by this much (m) at the end, quadratically. */
  droop?: number;
  /** Width along the length (0 base to 1 tip), 0..1. */
  profile?: (t: number) => number;
  /** Colour along the length: base, middle and tip. */
  c0: THREE.Color;
  c1?: THREE.Color;
  c2?: THREE.Color;
}

/** A petal or leaf: a tapered blade from the origin out along +x, lying flat (normal +y). */
function strip(len: number, wid: number, o: StripOpts): THREE.BufferGeometry {
  const segL = o.segL ?? 4,
    segW = o.segW ?? 2;
  const prof =
    o.profile ??
    ((t: number) => Math.pow(Math.sin(Math.PI * Math.min(0.98, 0.1 + t * 0.88)), 0.65));
  const pos: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const c1 = o.c1 ?? o.c0,
    c2 = o.c2 ?? c1;
  const c = new THREE.Color();
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const w = wid * prof(t);
    if (t < 0.5) c.copy(o.c0).lerp(c1, t * 2);
    else c.copy(c1).lerp(c2, t * 2 - 1);
    for (let j = 0; j <= segW; j++) {
      const s = (j / segW) * 2 - 1;
      pos.push(t * len, -(o.droop ?? 0) * t * t + (o.cup ?? 0) * s * s * w, (s * w) / 2);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segL; i++)
    for (let j = 0; j < segW; j++) {
      const a = i * (segW + 1) + j,
        b = a + 1,
        d = a + segW + 1,
        e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Turn a blade that points along +x: `tilt` up out of the flat, then `yaw` round the y axis. */
function aim(g: THREE.BufferGeometry, yaw: number, tilt: number, roll = 0): THREE.BufferGeometry {
  g.rotateX(roll);
  g.rotateZ(tilt);
  g.rotateY(yaw);
  return g;
}

/** Point a part built facing +y along `dir`, and move it to `at`. */
function orient(g: THREE.BufferGeometry, dir: THREE.Vector3, at: THREE.Vector3, spin = 0) {
  g.rotateY(spin);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(at.x, at.y, at.z);
  return g;
}

/** A stem through the points (a thin tube), green. */
function stem(pts: THREE.Vector3[], r: number, col = C(0x4a7a2c)): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  return paint(new THREE.TubeGeometry(curve, Math.max(2, pts.length * 2), r, 4, false), col);
}

/** A leaf from `at` heading out along `dir` (horizontal-ish), drooping, green. */
function leaf(
  at: THREE.Vector3,
  yaw: number,
  len: number,
  wid: number,
  lift = 0.5,
  dark = C(0x3c6e2a),
  light = C(0x5f9a3c),
): THREE.BufferGeometry {
  const g = strip(len, wid, { c0: dark, c1: light, c2: dark, cup: 0.25, droop: len * 0.35 });
  aim(g, yaw, lift);
  return g.translate(at.x, at.y, at.z);
}

/** A domed disc (seed head) of radius r and height h, facing +y. */
function disc(r: number, h: number, c0: THREE.Color, c1: THREE.Color, seg = 10) {
  const g = new THREE.SphereGeometry(1, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(r, h, r);
  return paint(g, c0, c1);
}

/** A ring of `n` petals round a centre of radius r0, facing +y. */
function ring(
  n: number,
  r0: number,
  len: number,
  wid: number,
  tilt: number,
  o: StripOpts,
  jitter = 0.15,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * jitter;
    const g = strip(len * rr(0.88, 1.08), wid, o);
    g.translate(r0, 0, 0);
    aim(g, a, tilt + (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.3);
    out.push(g);
  }
  return out;
}

/** A small five-petalled floret (phlox, geranium, milkweed...), facing +y. */
function floret(r: number, col: THREE.Color, eye: THREE.Color, n = 5): THREE.BufferGeometry[] {
  return ring(n, r * 0.15, r, r * 0.95, 0.15, {
    c0: eye,
    c1: col,
    c2: col,
    segL: 2,
    segW: 1,
    profile: (t) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(0.95, 0.25 + t * 0.7)),
  });
}

/** Points scattered over a dome (radius r, flattened by `flat`), with their outward normals. */
function dome(n: number, r: number, flat: number, cap = 1): [THREE.Vector3, THREE.Vector3][] {
  const out: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963 + rnd() * 0.3;
    const e = Math.acos(1 - (cap * (i + 0.5)) / n);
    const nrm = V(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a));
    out.push([V(nrm.x * r, nrm.y * r * flat, nrm.z * r), nrm]);
  }
  return out;
}

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(tidy))!;

// ------------------------------------------------------------------ the plants

const GREEN = C(0x467a2c),
  LEAF_D = C(0x335f24),
  LEAF_L = C(0x5c9638);

/** A branching clump: `heads` stems rising from the root, each ending in a head at its tip. */
function clump(
  heads: number,
  hgt: [number, number],
  spread: number,
  head: (at: THREE.Vector3, dir: THREE.Vector3) => THREE.BufferGeometry[],
  leaves: { n: number; len: number; wid: number } = { n: 3, len: 0.07, wid: 0.018 },
  stemR = 0.0035,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < heads; i++) {
    const a = (i / heads) * Math.PI * 2 + rnd();
    const h = rr(hgt[0], hgt[1]);
    const out = spread * rr(0.3, 1);
    const top = V(Math.cos(a) * out, h, Math.sin(a) * out);
    const mid = V(top.x * 0.35 + rr(-0.01, 0.01), h * 0.5, top.z * 0.35 + rr(-0.01, 0.01));
    parts.push(stem([V(0, 0, 0), mid, top], stemR));
    for (let k = 0; k < leaves.n; k++) {
      const t = 0.15 + (k / leaves.n) * 0.6;
      const at = V(top.x * t * 0.6, h * t, top.z * t * 0.6);
      parts.push(leaf(at, rnd() * 6.28, leaves.len * rr(0.8, 1.2), leaves.wid, rr(0.2, 0.7)));
    }
    const dir = V(top.x * 1.5, 1, top.z * 1.5).normalize();
    parts.push(...head(top, dir));
  }
  // A few leaves at the base.
  for (let k = 0; k < 4; k++)
    parts.push(leaf(V(0, 0.01, 0), rnd() * 6.28, leaves.len * 1.3, leaves.wid * 1.3, 0.35));
  return merge(parts);
}

/** A daisy head: rays round a disc, built facing +y then pointed along `dir` at `at`. */
function daisy(
  at: THREE.Vector3,
  dir: THREE.Vector3,
  o: {
    n: number;
    len: number;
    wid: number;
    tilt: number;
    droop: number;
    petal: [THREE.Color, THREE.Color, THREE.Color];
    discR: number;
    discH: number;
    disc: [THREE.Color, THREE.Color];
    rows?: number;
    cone?: boolean;
  },
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rows = o.rows ?? 1;
  for (let k = 0; k < rows; k++) {
    const sc = 1 - k * 0.22;
    parts.push(
      ...ring(o.n - k * 2, o.discR * 0.8, o.len * sc, o.wid, o.tilt + k * 0.35, {
        c0: o.petal[0],
        c1: o.petal[1],
        c2: o.petal[2],
        droop: o.droop * sc,
        cup: 0.12,
      }).map((g) => g.translate(0, k * 0.002, 0)),
    );
  }
  if (o.cone) {
    // A raised, spiky cone (coneflower): a cone of florets over a short collar.
    const cone = new THREE.ConeGeometry(o.discR, o.discH, 12, 3);
    cone.translate(0, o.discH / 2, 0);
    const p = cone.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      // Rounded top, bristly surface.
      const y = p.getY(i) / o.discH;
      const k = 1 + 0.18 * Math.sin(i * 12.9898) + 0.25 * (1 - y);
      p.setXYZ(i, p.getX(i) * k, Math.min(p.getY(i), o.discH * 0.92), p.getZ(i) * k);
    }
    cone.computeVertexNormals();
    parts.push(paint(cone, o.disc[0], o.disc[1]));
  } else parts.push(disc(o.discR, o.discH, o.disc[0], o.disc[1]));
  // Green bracts behind the head.
  parts.push(
    ...ring(8, o.discR * 0.5, o.discR * 1.2, o.discR * 0.6, -0.5, { c0: GREEN, c1: LEAF_L }),
  );
  const spin = rnd() * 6.28;
  return parts.map((g) => orient(g, dir, at, spin));
}

const susanHead = (at: THREE.Vector3, dir: THREE.Vector3) =>
  daisy(at, dir, {
    n: 13,
    len: 0.032,
    wid: 0.011,
    tilt: 0.05,
    droop: 0.008,
    petal: [C(0xd9890a), C(0xf6b512), C(0xffc93b)],
    discR: 0.009,
    discH: 0.011,
    disc: [C(0x2a1408), C(0x4a2610)],
  });

const KINDS: Record<FlowerKind, () => THREE.BufferGeometry> = {
  // Black-eyed Susan: golden rays round a dark brown dome, on bristly branched stems.
  susan: () => clump(Math.round(rr(4, 7)), [0.42, 0.66], 0.12, susanHead),

  // Purple coneflower: mauve rays hanging down off a tall, spiky orange-brown cone.
  coneflower: () =>
    clump(Math.round(rr(3, 5)), [0.6, 0.85], 0.1, (at, dir) =>
      daisy(at, dir, {
        n: 14,
        len: 0.042,
        wid: 0.012,
        tilt: -0.35,
        droop: 0.014,
        petal: [C(0xa8457f), C(0xc8609e), C(0xd98ab8)],
        discR: 0.013,
        discH: 0.022,
        disc: [C(0xa8501c), C(0x6a2a0c)],
        cone: true,
      }),
    ),

  // Bee balm (red) and wild bergamot (lavender): shaggy heads of thin tubular florets.
  beebalm: () => monarda(C(0xc81a34), C(0xe8344a)),
  bergamot: () => monarda(C(0x9f78c4), C(0xc4a6e0)),

  phloxPink: () => phlox(C(0xf07ab8), C(0xc8287a)),
  phloxWhite: () => phlox(C(0xf6f2f4), C(0xe06aa0)),
  phloxMagenta: () => phlox(C(0xc0287a), C(0xf2d2e4)),

  daylily: daylily,

  petuniaPurple: () => petunia(C(0x7a22a8), C(0x3c0c5a)),
  petuniaPink: () => petunia(C(0xf06aac), C(0xb02a72)),
  petuniaWhite: () => petunia(C(0xf7f5f2), C(0xe8e09a)),
  petuniaRed: () => petunia(C(0xd01c34), C(0x7a0a1a)),

  marigold: () => marigold(C(0xe66a08), C(0xf6a01c)),
  marigoldYellow: () => marigold(C(0xf0b010), C(0xffd84a)),

  geraniumRed: () => geranium(C(0xe01c2c)),
  geraniumPink: () => geranium(C(0xf0607a)),

  zinniaMagenta: () => zinnia(C(0xc81a6e)),
  zinniaOrange: () => zinnia(C(0xf26a14)),
  zinniaRed: () => zinnia(C(0xd41a24)),
  zinniaYellow: () => zinnia(C(0xf4c21c)),

  sunflower,

  // Queen Anne's lace: a flat lacy white umbrella of tiny florets with one dark floret at the heart.
  queenAnne: () =>
    clump(
      Math.round(rr(2, 4)),
      [0.6, 0.85],
      0.12,
      (at, dir) => {
        const parts: THREE.BufferGeometry[] = [];
        for (const [p] of dome(46, 0.045, 0.12, 0.9))
          parts.push(
            ...floret(0.005, C(0xfbfaf4), C(0xe4e2c8), 5).map((g) => g.translate(p.x, p.y, p.z)),
          );
        parts.push(disc(0.004, 0.003, C(0x3a1a2a), C(0x5a2a3a)).translate(0, 0.004, 0));
        // The spokes of the umbrella.
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          parts.push(
            stem([V(0, -0.03, 0), V(Math.cos(a) * 0.035, -0.002, Math.sin(a) * 0.035)], 0.0012),
          );
        }
        return parts.map((g) => orient(g, V(dir.x * 0.3, 1, dir.z * 0.3), at));
      },
      { n: 2, len: 0.09, wid: 0.03 },
    ),

  // Chicory: stiff, sparse stems with sky-blue, square-tipped daisies hugging them.
  chicory: () =>
    clump(Math.round(rr(4, 6)), [0.45, 0.75], 0.18, (at, dir) =>
      daisy(at, V(dir.x * 3, 0.6, dir.z * 3), {
        n: 15,
        len: 0.018,
        wid: 0.007,
        tilt: 0.08,
        droop: 0.002,
        petal: [C(0x6f8fe0), C(0x86a6f0), C(0x9ab6f6)],
        discR: 0.004,
        discH: 0.003,
        disc: [C(0x5a6ad0), C(0x8090e8)],
      }),
    ),

  // Butterfly weed: flat-topped clusters of bright orange florets.
  milkweedOrange: () =>
    clump(
      Math.round(rr(4, 6)),
      [0.35, 0.5],
      0.12,
      (at, dir) => {
        const parts: THREE.BufferGeometry[] = [];
        for (const [p, nrm] of dome(22, 0.032, 0.35, 0.8))
          parts.push(...floret(0.006, C(0xf26a10), C(0xf8a020), 5).map((g) => orient(g, nrm, p)));
        return parts.map((g) => orient(g, V(dir.x * 0.4, 1, dir.z * 0.4), at));
      },
      { n: 5, len: 0.06, wid: 0.01 },
    ),

  goldenrod,
  lettuce,
  tomato,
};

/** Bee balm / bergamot: a pompom of curving tubular florets round a dark button, on square stems. */
function monarda(c0: THREE.Color, c1: THREE.Color): THREE.BufferGeometry {
  return clump(
    Math.round(rr(3, 5)),
    [0.6, 0.85],
    0.1,
    (at, dir) => {
      const parts: THREE.BufferGeometry[] = [disc(0.012, 0.012, C(0x4a3a30), C(0x6a5040))];
      for (const [, nrm] of dome(26, 1, 1, 0.75)) {
        const yaw = Math.atan2(nrm.z, nrm.x);
        const tilt = Math.asin(Math.min(1, nrm.y));
        const g = strip(0.026, 0.004, {
          c0,
          c1,
          c2: c1,
          droop: -0.006,
          segL: 3,
          segW: 1,
          profile: (t) => 0.7 + 0.3 * t,
        });
        g.translate(0.008, 0, 0);
        parts.push(aim(g, -yaw, tilt * 0.9));
      }
      // Leafy bracts under the head.
      parts.push(...ring(6, 0.008, 0.02, 0.012, -0.3, { c0: LEAF_D, c1: C(0x7a6a8a) }));
      return parts.map((g) => orient(g, dir, at));
    },
    { n: 4, len: 0.06, wid: 0.022 },
    0.004,
  );
}

/** Garden phlox: tall stems topped with domed panicles of flat five-petalled florets. */
function phlox(col: THREE.Color, eye: THREE.Color): THREE.BufferGeometry {
  return clump(
    Math.round(rr(4, 6)),
    [0.6, 0.85],
    0.1,
    (at, dir) => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [p, nrm] of dome(30, 0.045, 0.75, 0.85))
        parts.push(
          ...floret(0.009, col.clone().multiplyScalar(rr(0.92, 1.05)), eye).map((g) =>
            orient(g, nrm, p),
          ),
        );
      return parts.map((g) => orient(g, V(dir.x * 0.3, 1, dir.z * 0.3), at));
    },
    { n: 5, len: 0.08, wid: 0.016 },
  );
}

/** Orange daylily ("ditch lily"): a fountain of strap leaves and tall scapes of open trumpets. */
function daylily(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const g = strip(rr(0.42, 0.6), 0.022, {
      c0: C(0x3c6a28),
      c1: C(0x4e8a32),
      c2: C(0x5a9a3a),
      cup: 0.3,
      droop: rr(0.16, 0.28),
      segL: 6,
      profile: (t) => 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85)),
    });
    parts.push(aim(g, rnd() * 6.28, rr(0.9, 1.25)));
  }
  const scapes = Math.round(rr(2, 4));
  for (let s = 0; s < scapes; s++) {
    const a = rnd() * 6.28,
      h = rr(0.6, 0.85);
    const top = V(Math.cos(a) * 0.08, h, Math.sin(a) * 0.08);
    parts.push(stem([V(0, 0, 0), V(top.x * 0.4, h * 0.6, top.z * 0.4), top], 0.004));
    const blooms = Math.round(rr(1, 3));
    for (let b = 0; b < blooms; b++) {
      const ba = a + (b - 1) * 1.4 + rr(-0.3, 0.3);
      const dir = V(Math.cos(ba), rr(0.5, 1), Math.sin(ba)).normalize();
      const at = top.clone().add(V(Math.cos(ba) * 0.025, -0.01 * b, Math.sin(ba) * 0.025));
      parts.push(stem([top, at], 0.0025));
      const fl: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) {
        const inner = k % 2 === 0;
        const g = strip(inner ? 0.07 : 0.066, inner ? 0.028 : 0.02, {
          c0: C(0xf2b42a),
          c1: C(0xf07818),
          c2: C(0xe25e12),
          cup: 0.25,
          droop: 0.028,
          segL: 5,
        });
        fl.push(aim(g, (k / 6) * Math.PI * 2 + (inner ? 0 : 0.5), 0.95, 0));
      }
      // Stamens.
      for (let k = 0; k < 6; k++)
        fl.push(
          stem(
            [V(0, 0, 0), V(Math.cos(k) * 0.012, 0.04, Math.sin(k) * 0.012)],
            0.0008,
            C(0xf8d050),
          ),
        );
      parts.push(...fl.map((g) => orient(g, dir, at)));
    }
    // A couple of buds.
    for (let b = 0; b < 2; b++) {
      const bud = new THREE.SphereGeometry(0.008, 6, 4).scale(1, 3.2, 1).translate(0, 0.02, 0);
      parts.push(
        orient(paint(bud, C(0x6a8a2a), C(0xd08a30)), V(rr(-0.5, 0.5), 1, rr(-0.5, 0.5)), top),
      );
    }
  }
  return merge(parts);
}

/** Petunias: a low leafy mound covered in wide five-lobed trumpets facing up and out. */
function petunia(col: THREE.Color, throat: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++)
    parts.push(leaf(V(0, rr(0.02, 0.1), 0), rnd() * 6.28, rr(0.06, 0.09), 0.035, rr(0.1, 0.6)));
  const n = Math.round(rr(7, 11));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28,
      out = rr(0.03, 0.12);
    const at = V(Math.cos(a) * out, rr(0.1, 0.17), Math.sin(a) * out);
    const dir = V(Math.cos(a) * out * 6, 1, Math.sin(a) * out * 6).normalize();
    const fl = ring(
      5,
      0.004,
      0.03,
      0.032,
      0.65,
      {
        c0: throat,
        c1: col,
        c2: col.clone().multiplyScalar(1.06),
        droop: 0.012,
        cup: 0.05,
        segL: 4,
      },
      0.05,
    );
    fl.push(disc(0.005, 0.004, C(0xf2e27a), C(0xf2e27a)));
    parts.push(...fl.map((g) => orient(g, dir, at)));
  }
  return merge(parts);
}

/** French marigolds: a bushy mound of fine leaves and dense, ruffled pompom heads. */
function marigold(c0: THREE.Color, c1: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++)
    parts.push(
      leaf(
        V(rr(-0.03, 0.03), rr(0.02, 0.16), rr(-0.03, 0.03)),
        rnd() * 6.28,
        0.05,
        0.012,
        rr(0.2, 0.9),
        C(0x2e5a22),
        C(0x447a2c),
      ),
    );
  const n = Math.round(rr(4, 7));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28,
      out = rr(0.02, 0.09);
    const at = V(Math.cos(a) * out, rr(0.17, 0.25), Math.sin(a) * out);
    const fl: THREE.BufferGeometry[] = [];
    // Rings of short frilly petals, rising steeper toward the middle.
    [
      [14, 0.022, 0.15],
      [12, 0.018, 0.6],
      [10, 0.014, 1.0],
      [7, 0.01, 1.3],
    ].forEach(([cnt, len, tilt], k) =>
      fl.push(
        ...ring(
          cnt!,
          0.004,
          len!,
          0.012,
          tilt!,
          {
            c0: c0.clone().multiplyScalar(0.8),
            c1: k % 2 ? c1 : c0,
            c2: k % 2 ? c0 : c1,
            cup: 0.3,
            segL: 2,
            segW: 2,
          },
          0.4,
        ).map((g) => g.translate(0, k * 0.003, 0)),
      ),
    );
    parts.push(...fl.map((g) => orient(g, V(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)), at)));
    parts.push(stem([V(at.x * 0.5, 0.05, at.z * 0.5), at], 0.002));
  }
  return merge(parts);
}

/** Zonal geraniums: round scalloped leaves with a dark band, under balls of five-petalled florets. */
function geranium(col: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.CircleGeometry(rr(0.035, 0.05), 14);
    const p = g.attributes.position!;
    const cols = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k),
        y = p.getY(k);
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const sc = 1 + 0.08 * Math.cos(a * 7);
      p.setXYZ(k, x * sc, y * sc, -r * r * 4);
      const band = Math.abs(r / 0.045 - 0.6) < 0.12;
      const c = band ? C(0x3a4a1e) : C(0x4c8a34).lerp(C(0x6aa448), r / 0.05);
      cols.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const a = rnd() * 6.28;
    g.rotateX(-Math.PI / 2 + rr(-0.3, 0.3));
    g.translate(Math.cos(a) * rr(0.03, 0.09), rr(0.08, 0.2), Math.sin(a) * rr(0.03, 0.09));
    parts.push(g);
  }
  const n = Math.round(rr(2, 4));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28;
    const at = V(Math.cos(a) * 0.05, rr(0.3, 0.38), Math.sin(a) * 0.05);
    parts.push(stem([V(at.x * 0.3, 0.1, at.z * 0.3), at], 0.003));
    for (const [p, nrm] of dome(18, 0.03, 0.9, 1.4))
      parts.push(
        ...floret(
          0.012,
          col.clone().multiplyScalar(rr(0.9, 1.05)),
          col.clone().multiplyScalar(1.1),
        ).map((g) => orient(g, nrm, p.clone().add(at))),
      );
  }
  return merge(parts);
}

/** Zinnias: big, layered heads of broad petals round a small yellow-ringed centre. */
function zinnia(col: THREE.Color): THREE.BufferGeometry {
  return clump(
    Math.round(rr(3, 5)),
    [0.45, 0.68],
    0.1,
    (at, dir) =>
      daisy(at, dir, {
        n: 16,
        len: 0.034,
        wid: 0.018,
        tilt: 0.1,
        droop: 0.004,
        rows: 3,
        petal: [col.clone().multiplyScalar(0.8), col, col.clone().multiplyScalar(1.08)],
        discR: 0.008,
        discH: 0.007,
        disc: [C(0x4a2a10), C(0xf0c030)],
      }),
    { n: 4, len: 0.07, wid: 0.025 },
    0.004,
  );
}

/** Sunflowers: a tall thick stalk, big heart leaves, a heavy head turned to the east (+x). */
function sunflower(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = rr(1.6, 2.1);
  const top = V(0.04, h, rr(-0.03, 0.03));
  parts.push(stem([V(0, 0, 0), V(0.01, h * 0.5, 0), V(0.03, h * 0.9, 0), top], 0.013));
  for (let i = 0; i < 9; i++) {
    const y = 0.25 + (i / 9) * (h - 0.4);
    parts.push(leaf(V(0.01, y, 0), i * 2.4, rr(0.18, 0.26) * (1 - i * 0.05), 0.15, rr(0.2, 0.5)));
  }
  const dir = V(1, rr(-0.1, 0.3), rr(-0.2, 0.2)).normalize();
  const head = daisy(V(0, 0, 0), UP, {
    n: 30,
    len: 0.075,
    wid: 0.024,
    tilt: 0.05,
    droop: 0.012,
    rows: 2,
    petal: [C(0xe89a0a), C(0xf6c014), C(0xffd23a)],
    discR: 0.085,
    discH: 0.015,
    disc: [C(0x2a160a), C(0x4a2c10)],
  });
  // The green back of the head.
  head.push(disc(0.09, 0.03, C(0x4a7a2a), C(0x4a7a2a)).rotateX(Math.PI));
  parts.push(...head.map((g) => orient(g, dir, top.clone().add(dir.clone().multiplyScalar(0.03)))));
  return merge(parts);
}

/** Goldenrod: arching plumes of tiny yellow florets along the tops of the branches. */
function goldenrod(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stems = Math.round(rr(3, 5));
  for (let s = 0; s < stems; s++) {
    const a = rnd() * 6.28,
      h = rr(0.7, 1.0);
    const top = V(Math.cos(a) * 0.08, h, Math.sin(a) * 0.08);
    parts.push(stem([V(0, 0, 0), V(top.x * 0.4, h * 0.6, top.z * 0.4), top], 0.003));
    for (let k = 0; k < 8; k++)
      parts.push(
        leaf(V(top.x * (k / 10), (h * k) / 10, top.z * (k / 10)), rnd() * 6.28, 0.08, 0.012, 0.6),
      );
    for (let b = 0; b < 7; b++) {
      const ba = a + rr(-1.4, 1.4);
      const from = V(top.x, h - 0.02 - b * 0.025, top.z);
      const len = 0.09 - b * 0.006;
      const tip = from.clone().add(V(Math.cos(ba) * len, 0.02, Math.sin(ba) * len));
      const sag = from
        .clone()
        .lerp(tip, 0.5)
        .add(V(0, 0.025, 0));
      parts.push(stem([from, sag, tip], 0.0012));
      const curve = new THREE.QuadraticBezierCurve3(from, sag, tip);
      for (let k = 0; k < 9; k++) {
        const p = curve.getPoint(0.2 + (k / 9) * 0.8);
        const g = new THREE.IcosahedronGeometry(0.0045, 0);
        g.translate(p.x, p.y + 0.003, p.z);
        parts.push(paint(g, C(0xe0b818), C(0xf6d43a)));
      }
    }
  }
  return merge(parts);
}

/** Leaf lettuce: a loose rosette of broad, ruffled, light green leaves. */
function lettuce(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const g = strip(rr(0.08, 0.13), rr(0.06, 0.09), {
      c0: C(0xbfe08a),
      c1: C(0x7ab84a),
      c2: C(0x5a9a34),
      cup: 0.55,
      droop: 0.02,
      segL: 4,
      segW: 4,
    });
    const p = g.attributes.position!;
    for (let k = 0; k < p.count; k++)
      p.setY(k, p.getY(k) + Math.sin(p.getZ(k) * 220 + k) * 0.004 * (p.getX(k) / 0.1));
    g.computeVertexNormals();
    parts.push(aim(g, i * 2.4, 0.4 + (1 - i / 14) * 0.8));
  }
  return merge(parts);
}

/** A staked tomato plant with ripe and green fruit. */
function tomato(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(
    paint(new THREE.CylinderGeometry(0.008, 0.01, 0.9, 5).translate(0, 0.45, 0), C(0x8a6a44)),
  );
  for (let i = 0; i < 40; i++) {
    const y = rr(0.1, 0.8);
    parts.push(
      leaf(
        V(rr(-0.04, 0.04), y, rr(-0.04, 0.04)),
        rnd() * 6.28,
        rr(0.08, 0.12),
        0.04,
        rr(-0.2, 0.4),
        C(0x2e5e24),
        C(0x4a8a30),
      ),
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28,
      r = rr(0.04, 0.1);
    const g = new THREE.SphereGeometry(rr(0.018, 0.028), 8, 6).scale(1, 0.85, 1);
    g.translate(Math.cos(a) * r, rr(0.2, 0.65), Math.sin(a) * r);
    parts.push(paint(g, rnd() < 0.65 ? C(0xd8281c) : C(0x7aa83a)));
  }
  return merge(parts);
}

// ------------------------------------------------------------------ fields of them

const VARIANTS = 3;
const cache = new Map<string, THREE.BufferGeometry>();
function geometry(kind: FlowerKind, v: number): THREE.BufferGeometry {
  const key = `${kind}#${v}`;
  let g = cache.get(key);
  if (!g) {
    g = KINDS[kind]();
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}

/** The highest point of a plant (where a bird would sit on it). */
const tops = new WeakMap<THREE.BufferGeometry, THREE.Vector3>();
function topOf(g: THREE.BufferGeometry): THREE.Vector3 {
  let t = tops.get(g);
  if (!t) {
    const p = g.attributes.position!;
    let best = 0;
    for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(best)) best = i;
    t = V(p.getX(best), p.getY(best), p.getZ(best));
    tops.set(g, t);
  }
  return t;
}

let material: THREE.MeshStandardMaterial | null = null;
const PERCHABLE = new Set<FlowerKind>([
  'sunflower',
  'coneflower',
  'susan',
  'goldenrod',
  'bergamot',
]);
const FLOWER_WIND = { lean: 0.03, sway: 0.05, speed: 2.2, flutter: 0.0025, h0: 0.02 };

/**
 * Where flowers must not grow (map metres, x east, y north): the racetrack sets this so no
 * flower stands in the road.
 */
let keepOut: ((x: number, y: number) => boolean) | null = null;
export function setFlowerKeepOut(f: ((x: number, y: number) => boolean) | null): void {
  keepOut = f;
}
/** Is this map point (x east, y north) kept clear for the racetrack? */
export const keptClear = (x: number, y: number): boolean => keepOut?.(x, y) ?? false;

/**
 * A planting of flowers. `add` in the field's own coordinates (y up); the field builds one
 * instanced mesh per kind and variant. `mapped` (default on) says the coordinates are the farm's
 * (x east, z = -map y), so the racetrack's keep-out applies.
 */
export class FlowerField {
  private items = new Map<string, THREE.Matrix4[]>();
  private tints = new Map<string, THREE.Color[]>();
  constructor(private mapped = true) {}

  add(kind: FlowerKind, x: number, y: number, z: number, scale = 1, yaw = rnd() * 6.28): boolean {
    if (this.mapped && keepOut?.(x, -z)) return false;
    const key = `${kind}#${(rnd() * VARIANTS) | 0}`;
    const list = this.items.get(key) ?? [];
    const m = new THREE.Matrix4().compose(
      V(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(UP, yaw),
      V(scale, scale * rr(0.92, 1.08), scale),
    );
    list.push(m);
    this.items.set(key, list);
    // Goldfinches ride the taller flower heads: a perch on the plant's highest head.
    if (this.mapped && PERCHABLE.has(kind) && rnd() < 0.35) {
      const p = topOf(geometry(kind, Number(key.split('#')[1])))
        .clone()
        .applyMatrix4(m);
      addPerch(p.x, p.y - 0.01, p.z, 'flower');
    }
    const t = this.tints.get(key) ?? [];
    t.push(new THREE.Color().setScalar(rr(0.9, 1.08)));
    this.tints.set(key, t);
    return true;
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'flowers';
    material ??= new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    for (const [key, list] of this.items) {
      const [kind, v] = key.split('#') as [FlowerKind, string];
      const m = new THREE.InstancedMesh(geometry(kind, Number(v)), material, list.length);
      list.forEach((x, i) => {
        m.setMatrixAt(i, x);
        m.setColorAt(i, this.tints.get(key)![i]!);
      });
      m.computeBoundingSphere();
      m.receiveShadow = true;
      m.castShadow = kind === 'sunflower' || kind === 'daylily' || kind === 'tomato';
      g.add(windy(m, FLOWER_WIND, 'flowers'));
    }
    return g;
  }
}

/** Pick from weighted kinds. */
export function pick<T>(mix: [T, number][]): T {
  const total = mix.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [k, w] of mix) if ((r -= w) <= 0) return k;
  return mix[mix.length - 1]![0];
}

export const flowerRnd = rnd;
