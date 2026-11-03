import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundHeight } from './layout.ts';
import type { Perch, PerchTag } from './perches.ts';

/**
 * Wisconsin's bright summer songbirds going about the farm: northern cardinals (and their
 * brown-and-red hens), American goldfinches in little bouncing flocks, Baltimore orioles,
 * indigo buntings, scarlet tanagers, rose-breasted grosbeaks, red-winged blackbirds, eastern
 * bluebirds and robins. Each sits a while on a tree top, roof ridge, flower head or the lawn,
 * looks about (robins hop and peck), then flies off to another spot it likes: a few quick wing
 * beats and a glide (goldfinches in their swooping, up-and-down bounds), arcing up over the
 * buildings and big trees in the way, flaring its wings to land.
 *
 * All in farm-local real metres (x east, height, z = -map y). Birds are drawn instanced: one
 * mesh for each look's bodies and one for their wings.
 */

let seed = 24601;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a: number, b: number) => a + rnd() * (b - a);

// ------------------------------------------------------------------ looks

type Part = 'body' | 'head' | 'tail' | 'bill' | 'crest' | 'eye';
interface Look {
  /** Body length, bill to tail tip (m). */
  len: number;
  /** Colour of a body part at a point (in body lengths: x forward, y up, z to the side). */
  paint(part: Part, x: number, y: number, z: number): number;
  /** Wing colour at span u (0 shoulder .. 1 tip) and chord v (0 leading .. 1 trailing edge). */
  wing(u: number, v: number): number;
  crest?: boolean;
  /** Heavy seed-cracker's bill (cardinal, grosbeak) or a fine one. */
  bill: 'heavy' | 'fine';
  eyeRing?: boolean;
}

const HEAD = { x: 0.33, y: 0.1, r: 0.13 };
const inHeadFront = (x: number, y: number) => x > HEAD.x + 0.04 && y < HEAD.y + 0.02;

const LOOKS = {
  cardinal: {
    len: 0.22,
    bill: 'heavy',
    crest: true,
    paint: (p, x, y) =>
      p === 'bill'
        ? 0xf2622e
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' && inHeadFront(x, y)
            ? 0x141010
            : p === 'tail'
              ? 0x9e1219
              : p === 'body' && y > 0.03
                ? 0xb8141d
                : 0xdc1f2a,
    wing: (u) => (u > 0.72 ? 0x8a0f17 : 0xac141c),
  },
  cardinalHen: {
    len: 0.21,
    bill: 'heavy',
    crest: true,
    paint: (p, x, y) =>
      p === 'bill'
        ? 0xf07a40
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' && inHeadFront(x, y)
            ? 0x5a4436
            : p === 'crest'
              ? 0xb44a32
              : p === 'tail'
                ? 0xa8402e
                : y > 0.02
                  ? 0xa48b68
                  : 0xcdb08a,
    wing: (u, v) => (v < 0.35 ? 0xb24a30 : u > 0.7 ? 0x7a5a40 : 0x9a6a48),
  },
  goldfinch: {
    len: 0.12,
    bill: 'fine',
    paint: (p, x, y) =>
      p === 'bill'
        ? 0xf2a868
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' && y > HEAD.y + 0.05 && x > HEAD.x - 0.02
            ? 0x111111
            : p === 'tail'
              ? 0x161616
              : p === 'body' && x < -0.22 && y < 0.02
                ? 0xf6f2e4
                : 0xffd612,
    wing: (u, v) =>
      (u > 0.12 && u < 0.3 && v > 0.15) || v > 0.86 ? 0xf2efe6 : u < 0.12 ? 0xf2d020 : 0x121212,
  },
  goldfinchHen: {
    len: 0.12,
    bill: 'fine',
    paint: (p, _x, y) =>
      p === 'bill'
        ? 0xd8a878
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'tail'
            ? 0x2c2c26
            : y > 0.02
              ? 0xb4ac52
              : 0xdcd690,
    wing: (u, v) => ((u > 0.12 && u < 0.3 && v > 0.15) || v > 0.86 ? 0xd8d0b0 : 0x2c2a24),
  },
  oriole: {
    len: 0.2,
    bill: 'fine',
    paint: (p, x, y, z) =>
      p === 'bill'
        ? 0x7a8a96
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' || p === 'crest'
            ? 0x101010
            : p === 'tail'
              ? Math.abs(z) > 0.045
                ? 0xff7e14
                : 0x111111
              : y > 0.04 && x > -0.22
                ? 0x121212
                : 0xff7a10,
    wing: (u, v) =>
      u < 0.16 && v < 0.45
        ? 0xff8a1c
        : (u > 0.18 && u < 0.36 && v > 0.25 && v < 0.5) || v > 0.88
          ? 0xf4f2ea
          : 0x111111,
  },
  bunting: {
    len: 0.13,
    bill: 'fine',
    paint: (p, _x, y) =>
      p === 'bill'
        ? 0x8a96a8
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head'
            ? 0x2b70f4
            : p === 'tail'
              ? 0x173a8e
              : y > 0.03
                ? 0x1b55cc
                : 0x2266e4,
    wing: (u, v) => (v > 0.8 ? 0x2a5ad0 : u > 0.65 ? 0x132f78 : 0x1a3f9a),
  },
  tanager: {
    len: 0.17,
    bill: 'fine',
    paint: (p) =>
      p === 'bill' ? 0xbab294 : p === 'eye' ? 0x0a0a0a : p === 'tail' ? 0x101010 : 0xea1230,
    wing: () => 0x0f0f0f,
  },
  grosbeak: {
    len: 0.19,
    bill: 'heavy',
    paint: (p, x, y, z) =>
      p === 'bill'
        ? 0xf2ecda
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' || p === 'crest'
            ? 0x111111
            : p === 'tail'
              ? Math.abs(z) > 0.05 && x < -0.5
                ? 0xf2f0ea
                : 0x121212
              : x > 0.05 && y < 0.03 && y > -0.16 && Math.abs(z) < (x - 0.02) * 0.9
                ? 0xdc1c4c
                : y > 0.03
                  ? 0x131313
                  : 0xf6f4ef,
    wing: (u, v) =>
      (u > 0.22 && u < 0.42 && v < 0.6) || (u > 0.1 && u < 0.2 && v > 0.3) ? 0xf4f2ec : 0x111111,
  },
  redwing: {
    len: 0.21,
    bill: 'fine',
    paint: (p) => (p === 'eye' ? 0x050505 : 0x121214),
    wing: (u, v) => (u < 0.26 && v < 0.32 ? 0xe2201a : u < 0.26 && v < 0.42 ? 0xf2d248 : 0x111113),
  },
  bluebird: {
    len: 0.17,
    bill: 'fine',
    paint: (p, x, y) =>
      p === 'bill'
        ? 0x1a1a1a
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head' && !(x > HEAD.x && y < HEAD.y - 0.05)
            ? 0x2f6fd8
            : p === 'tail'
              ? 0x2a62c8
              : p === 'body' && y > 0.03
                ? 0x2f6fd8
                : p === 'body' && y < -0.06 && x < 0.05
                  ? 0xf2efe8
                  : 0xc8642c,
    wing: (u) => (u > 0.7 ? 0x24529e : 0x2f6fd8),
  },
  robin: {
    len: 0.25,
    bill: 'fine',
    eyeRing: true,
    paint: (p, x, y) =>
      p === 'bill'
        ? 0xe8b020
        : p === 'eye'
          ? 0x0a0a0a
          : p === 'head'
            ? 0x2a2a2c
            : p === 'tail'
              ? 0x2e2e30
              : p === 'body' && x < -0.25 && y < 0
                ? 0xf2efe8
                : y > 0.04
                  ? 0x5c5650
                  : 0xc8501e,
    wing: (u) => (u > 0.7 ? 0x3c3834 : 0x4e4842),
  },
} satisfies Record<string, Look>;
type LookId = keyof typeof LOOKS;

/** Colour every vertex of a part from the look (positions in body lengths). */
function painted(g: THREE.BufferGeometry, look: Look, part: Part): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes))
    if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position!;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.setHex(look.paint(part, p.getX(i), p.getY(i), p.getZ(i)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g : g.setIndex(Array.from({ length: p.count }, (_, i) => i));
}

/** The body (one merged mesh), built in body lengths then scaled: nose +x, up +y. */
function bodyGeometry(look: Look): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // A plump teardrop body: fuller at the breast, tapering to the tail.
  const body = new THREE.SphereGeometry(1, 14, 10);
  const p = body.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const taper = x < 0 ? 1 + x * 0.35 : 1;
    p.setXYZ(i, x * 0.3 + 0.02, y * 0.15 * taper - 0.01 + (x < 0 ? x * 0.02 : 0), z * 0.15 * taper);
  }
  body.computeVertexNormals();
  parts.push(painted(body, look, 'body'));
  const head = new THREE.SphereGeometry(HEAD.r, 12, 8).translate(HEAD.x, HEAD.y, 0);
  parts.push(painted(head, look, 'head'));
  // Bill: a cone pointing forward; a seed-eater's is short and deep.
  const heavy = look.bill === 'heavy';
  const bill = new THREE.ConeGeometry(heavy ? 0.055 : 0.03, heavy ? 0.1 : 0.12, 8)
    .rotateZ(-Math.PI / 2)
    .scale(1, heavy ? 1.1 : 0.8, heavy ? 0.9 : 0.8)
    .translate(HEAD.x + HEAD.r + (heavy ? 0.035 : 0.045), HEAD.y - 0.015, 0);
  parts.push(painted(bill, look, 'bill'));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.024, 6, 4).translate(
      HEAD.x + 0.06,
      HEAD.y + 0.035,
      s * 0.1,
    );
    parts.push(painted(eye, look, 'eye'));
    if (look.eyeRing) {
      const ring = new THREE.TorusGeometry(0.03, 0.008, 4, 10).translate(
        HEAD.x + 0.055,
        HEAD.y + 0.035,
        s * 0.105,
      );
      parts.push(painted(ring, { ...look, paint: () => 0xf2f2ee }, 'eye'));
    }
  }
  if ('crest' in look && look.crest) {
    const crest = new THREE.ConeGeometry(0.06, 0.17, 7)
      .rotateZ(0.95)
      .translate(HEAD.x - 0.07, HEAD.y + 0.14, 0);
    parts.push(painted(crest, look, 'crest'));
  }
  // Tail: a long flat fan, slightly spread, tilted a touch up.
  const tail = new THREE.BufferGeometry();
  const tp: number[] = [],
    ti: number[] = [];
  const N = 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = 0.04 + t * 0.07;
    tp.push(-0.24 - t * 0.42, 0.01 + t * 0.04, -w, -0.24 - t * 0.42, 0.01 + t * 0.04, w);
  }
  for (let i = 0; i < N; i++) ti.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  tail.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tail.setIndex(ti);
  tail.computeVertexNormals();
  parts.push(painted(tail, look, 'tail'));
  const g = mergeGeometries(parts)!;
  return g.scale(look.len, look.len, look.len);
}

/**
 * One wing, spreading out along +z from the shoulder at the origin (body lengths, then scaled):
 * a rounded leading edge, the primaries swept back to a point, coloured by span and chord.
 */
function wingGeometry(look: Look): THREE.BufferGeometry {
  const NU = 7,
    NV = 3;
  const pos: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    // Leading edge bows forward then sweeps back; the trailing edge closes in to the tip.
    const lead = { x: 0.1 - 0.32 * u * u, z: 0.66 * u };
    const chord = 0.24 * (1 - u * 0.75) + 0.05;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      pos.push(
        lead.x - chord * v - 0.05 * u * v,
        0.015 * Math.sin(Math.PI * v) * (1 - u),
        lead.z + v * 0.04 * u,
      );
      c.setHex(look.wing(u, v));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j,
        b = a + 1,
        d = a + NV + 1,
        e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.scale(look.len, look.len, look.len);
}

// ------------------------------------------------------------------ species and behaviour

interface Species {
  looks: [LookId, number][];
  /** How many, and in flocks of how many (the first of each flock leads). */
  count: number;
  flock: number;
  /** Cruising speed (m/s), wingbeats per second. */
  speed: number;
  beat: number;
  /** Goldfinches bound: flap up, fold and swoop down. */
  bounding?: boolean;
  /** Where it likes to be, and how much. */
  likes: Partial<Record<PerchTag, number>>;
  /** Seconds it stays put. */
  sit: [number, number];
}

const SPECIES: Species[] = [
  {
    looks: [
      ['cardinal', 1],
      ['cardinalHen', 1],
    ],
    count: 6,
    flock: 2,
    speed: 8,
    beat: 11,
    likes: { arbor: 4, lilac: 3, spruce: 3, xmas: 2, orchard: 1, lawn: 1.5, roof: 0.5 },
    sit: [5, 14],
  },
  {
    looks: [
      ['goldfinch', 3],
      ['goldfinchHen', 1],
    ],
    count: 12,
    flock: 4,
    speed: 9,
    beat: 14,
    bounding: true,
    likes: { flower: 6, xmas: 2, orchard: 1, field: 2, lilac: 1 },
    sit: [4, 10],
  },
  {
    looks: [['oriole', 1]],
    count: 4,
    flock: 1,
    speed: 9,
    beat: 11,
    likes: { orchard: 5, spruce: 2, pine: 1, lilac: 1, roof: 0.5 },
    sit: [5, 12],
  },
  {
    looks: [['bunting', 1]],
    count: 4,
    flock: 1,
    speed: 8.5,
    beat: 13,
    likes: { xmas: 5, field: 1.5, post: 1, flower: 1 },
    sit: [6, 15],
  },
  {
    looks: [['tanager', 1]],
    count: 3,
    flock: 1,
    speed: 9,
    beat: 11,
    likes: { spruce: 4, pine: 3, orchard: 2 },
    sit: [6, 14],
  },
  {
    looks: [['grosbeak', 1]],
    count: 3,
    flock: 1,
    speed: 8.5,
    beat: 11,
    likes: { orchard: 4, lilac: 2, spruce: 1.5, arbor: 1 },
    sit: [5, 12],
  },
  {
    looks: [['redwing', 1]],
    count: 6,
    flock: 3,
    speed: 10,
    beat: 10,
    likes: { field: 5, post: 2, xmas: 1, roof: 1 },
    sit: [4, 11],
  },
  {
    looks: [['bluebird', 1]],
    count: 3,
    flock: 1,
    speed: 9,
    beat: 12,
    likes: { post: 3, roof: 2, lawn: 2, orchard: 1 },
    sit: [5, 12],
  },
  {
    looks: [['robin', 1]],
    count: 5,
    flock: 1,
    speed: 9.5,
    beat: 9,
    likes: { lawn: 6, orchard: 2, roof: 1, spruce: 1 },
    sit: [6, 14],
  },
];

/** Something to fly over: a circle on the map (farm-local x, z) and how high it stands. */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  top: number;
}

interface Bird {
  sp: Species;
  look: LookId;
  slot: number;
  leader: Bird | null;
  followers: Bird[];
  perch: Perch;
  /** Where on its perch it sits (ground perches scatter birds round the spot). */
  at: THREE.Vector3;
  heading: number;
  state: 'sit' | 'fly';
  until: number;
  // flight
  from: THREE.Vector3;
  to: THREE.Vector3;
  lift: number;
  bow: number;
  t0: number;
  dur: number;
  dist: number;
  /** Turns its head about / hops / pecks while sitting. */
  look2: number;
  nextFidget: number;
  peck: number;
  hop: number;
  phase: number;
}

const MAX_DRAW = 140;

export function buildSongbirds(perches: Perch[], obstacles: Obstacle[]) {
  const group = new THREE.Group();
  group.name = 'songbirds';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const birds: Bird[] = [];
  const counts = new Map<LookId, number>();
  const usable = perches.filter((p) => p.y > -50);
  const free = (p: Perch) => p.ground || !p.busy;

  const startPerch = (sp: Species): Perch => {
    const ok = usable.filter((p) => (sp.likes[p.tag] ?? 0) > 0 && free(p));
    return ok[(rnd() * ok.length) | 0] ?? usable[(rnd() * usable.length) | 0]!;
  };
  const spotOn = (p: Perch, out: THREE.Vector3): THREE.Vector3 => {
    if (!p.ground) return out.set(p.x, p.y, p.z);
    const a = rnd() * 6.28,
      r = rnd() * 1.6;
    const x = p.x + Math.cos(a) * r,
      z = p.z + Math.sin(a) * r;
    // Field birds cling to the tops of the tall grass; lawn birds stand on the mown grass.
    return out.set(x, groundHeight(x, -z) + (p.tag === 'field' ? 0.45 : 0.01), z);
  };

  for (const sp of SPECIES) {
    for (let i = 0; i < sp.count; i += sp.flock) {
      let leader: Bird | null = null;
      for (let k = 0; k < sp.flock && i + k < sp.count; k++) {
        const total = sp.looks.reduce((a, [, w]) => a + w, 0);
        let r = rnd() * total;
        let look = sp.looks[0]![0];
        // A cardinal pair is a cock and a hen.
        if (sp.flock === 2 && sp.looks.length === 2) look = sp.looks[k]![0];
        else
          for (const [l, w] of sp.looks)
            if ((r -= w) <= 0) {
              look = l;
              break;
            }
        const perch = leader ? nearPerch(leader.perch, sp) : startPerch(sp);
        if (!perch.ground) perch.busy = true;
        const b: Bird = {
          sp,
          look,
          slot: counts.get(look) ?? 0,
          leader,
          followers: [],
          perch,
          at: spotOn(perch, new THREE.Vector3()),
          heading: rnd() * 6.28,
          state: 'sit',
          until: rr(1, sp.sit[1]),
          from: new THREE.Vector3(),
          to: new THREE.Vector3(),
          lift: 0,
          bow: 0,
          t0: 0,
          dur: 1,
          dist: 1,
          look2: 0,
          nextFidget: rr(0.5, 2),
          peck: 0,
          hop: 0,
          phase: rnd() * 10,
        };
        counts.set(look, b.slot + 1);
        if (leader) leader.followers.push(b);
        else leader = b;
        birds.push(b);
      }
    }
  }

  /** A free perch the bird likes within a short hop of `p` (for followers of a flock). */
  function nearPerch(p: Perch, sp: Species): Perch {
    let best: Perch | null = null,
      bd = Infinity;
    for (const q of usable) {
      if (q === p && !q.ground) continue;
      if (!free(q) || !(sp.likes[q.tag] ?? 0)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y) * 0.5;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best && bd < 14 ? best : p.ground ? p : (best ?? p);
  }

  /** Somewhere new to go: a liked, free perch, nearer ones more likely. */
  function choose(b: Bird): Perch {
    let total = 0;
    const opts: [Perch, number][] = [];
    for (const q of usable) {
      if (q === b.perch || !free(q)) continue;
      const like = b.sp.likes[q.tag] ?? 0;
      if (!like) continue;
      const d = Math.hypot(q.x - b.at.x, q.z - b.at.z);
      if (d < 4 || d > 95) continue;
      const w = like * Math.exp(-d / 32);
      opts.push([q, w]);
      total += w;
    }
    let r = rnd() * total;
    for (const [q, w] of opts) if ((r -= w) <= 0) return q;
    return b.perch;
  }

  /** How high the arc must rise to clear everything between a and b. */
  function clearance(a: THREE.Vector3, b: THREE.Vector3): number {
    let need = 0.6 + a.distanceTo(b) * 0.12;
    for (const o of obstacles) {
      for (let k = 1; k < 10; k++) {
        const u = k / 10;
        const x = a.x + (b.x - a.x) * u,
          z = a.z + (b.z - a.z) * u;
        if (Math.hypot(x - o.x, z - o.z) > o.r) continue;
        const base = a.y + (b.y - a.y) * u;
        need = Math.max(need, (o.top + 1.2 - base) / (4 * u * (1 - u)));
      }
    }
    return Math.min(need, 30);
  }

  function takeOff(b: Bird, to: Perch, t: number): void {
    if (!b.perch.ground) b.perch.busy = false;
    b.perch = to;
    if (!to.ground) to.busy = true;
    b.from.copy(b.at);
    spotOn(to, b.to);
    b.dist = b.from.distanceTo(b.to);
    b.lift = clearance(b.from, b.to);
    b.bow = rr(-0.18, 0.18) * b.dist;
    b.dur = (b.dist + b.lift * 1.2) / (b.sp.speed * rr(0.9, 1.1)) + 0.3;
    b.t0 = t;
    b.state = 'fly';
    // The rest of the flock goes too, one after another.
    b.followers.forEach((f, i) => {
      if (f.state === 'fly') return;
      f.state = 'sit';
      f.until = t + 0.15 + i * rr(0.15, 0.5);
      f.nextFidget = -1; // marks: follow when the time comes
    });
  }

  const pathAt = (b: Bird, s: number, out: THREE.Vector3): THREE.Vector3 => {
    const dx = b.to.x - b.from.x,
      dz = b.to.z - b.from.z;
    const L = Math.hypot(dx, dz) || 1;
    // Drop off the perch a little, climb over what's in the way, flare up into the landing.
    const arc = 4 * s * (1 - s) * b.lift;
    const side = Math.sin(Math.PI * s) * b.bow;
    out.set(
      b.from.x + dx * s + (-dz / L) * side,
      b.from.y +
        (b.to.y - b.from.y) * s +
        arc -
        Math.sin(Math.PI * Math.min(1, s * 4)) * 0.25 * (1 - s),
      b.from.z + dz * s + (dx / L) * side,
    );
    if (b.sp.bounding) out.y += Math.sin(s * b.dist * 1.6) * 0.3 * Math.min(1, 6 * s * (1 - s));
    return out;
  };
  const ease = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return 0.7 * c + 0.3 * c * c * (3 - 2 * c);
  };

  // ---------------------------------------------------------------- instanced drawing

  const meshes = new Map<LookId, { body: THREE.InstancedMesh; wing: THREE.InstancedMesh }>();
  for (const [look, n] of counts) {
    const L = LOOKS[look] as Look;
    const body = new THREE.InstancedMesh(bodyGeometry(L), material, n);
    const wing = new THREE.InstancedMesh(wingGeometry(L), material, n * 2);
    for (const m of [body, wing]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
    }
    meshes.set(look, { body, wing });
  }

  const P = new THREE.Vector3(),
    P2 = new THREE.Vector3(),
    fwd = new THREE.Vector3(),
    Q = new THREE.Quaternion(),
    qa = new THREE.Quaternion(),
    M = new THREE.Matrix4(),
    W = new THREE.Matrix4(),
    S = new THREE.Vector3(),
    E = new THREE.Euler(0, 0, 0, 'YZX'),
    ZERO = new THREE.Matrix4().makeScale(0, 0, 0),
    X = new THREE.Vector3(1, 0, 0),
    Y = new THREE.Vector3(0, 1, 0),
    qf = new THREE.Quaternion(),
    MIRROR = new THREE.Vector3();
  let last = -1;

  function update(t: number, cam: THREE.Vector3): void {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    for (const b of birds) {
      // ---- deciding
      if (b.state === 'sit' && t >= b.until) {
        if (b.leader && b.nextFidget === -1) {
          // Following the flock to where the leader went.
          const near = nearPerch(b.leader.perch, b.sp);
          takeOff(b, near, t);
        } else if (!b.leader) {
          const to = choose(b);
          if (to !== b.perch) takeOff(b, to, t);
          b.until = t + rr(b.sp.sit[0], b.sp.sit[1]);
        } else b.until = t + 5; // followers wait for their leader
      }
      let flap = 0,
        fold = 1,
        pitch = 0,
        bank = 0;
      if (b.state === 'fly') {
        const s = (t - b.t0) / b.dur;
        if (s >= 1) {
          b.state = 'sit';
          b.at.copy(b.to);
          b.until = b.leader ? t + 9999 : t + rr(b.sp.sit[0], b.sp.sit[1]);
          if (b.leader) b.nextFidget = t + rr(0.5, 2);
          b.look2 = 0;
        } else {
          const e = ease(s);
          pathAt(b, e, P);
          pathAt(b, Math.min(1, e + 0.02), P2);
          fwd.subVectors(P2, P);
          const hz = Math.hypot(fwd.x, fwd.z);
          if (hz > 1e-4) {
            const h = Math.atan2(-fwd.z, fwd.x);
            let dh = h - b.heading;
            dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            b.heading += dh;
            bank = THREE.MathUtils.clamp((-dh / Math.max(dt, 1e-3)) * 0.08, -0.7, 0.7);
          }
          pitch = Math.atan2(fwd.y, Math.max(hz, 1e-4)) * 0.8;
          b.at.copy(P);
          fold = s < 0.06 ? 1 - s / 0.06 : s > 0.93 ? 0 : 0;
          const beat = Math.sin((t + b.phase) * b.sp.beat * Math.PI * 2);
          if (b.sp.bounding) {
            // Flap in bursts on the climb, wings shut on the swoop.
            const climbing = Math.cos(s * b.dist * 1.6) > -0.2;
            flap = climbing ? beat * 0.9 : 0;
            fold = climbing ? fold : 0.85;
          } else {
            // Flap, flap, glide.
            const g = Math.sin((t + b.phase) * 1.7);
            flap = g > -0.35 || s < 0.25 ? beat * 0.85 : 0.15;
          }
          // Flare to land: wings up and spread, body pitched up.
          if (s > 0.85) {
            const k = (s - 0.85) / 0.15;
            flap = THREE.MathUtils.lerp(flap, 0.9 + beat * 0.3, k);
            fold = 0;
            pitch += 0.7 * k;
          }
        }
      } else {
        // ---- sitting: look about now and then; on the ground, hop and peck.
        if (b.nextFidget >= 0 && t > b.nextFidget) {
          b.nextFidget = t + rr(0.6, 2.5);
          b.look2 = rr(-0.9, 0.9);
          if (b.perch.ground && rnd() < 0.5) b.peck = 0.4;
          else if (b.perch.ground && b.perch.tag === 'lawn' && rnd() < 0.5) b.hop = 0.25;
        }
        if (b.peck > 0) {
          b.peck = Math.max(0, b.peck - dt);
          pitch = -0.7 * Math.sin((b.peck / 0.4) * Math.PI);
        } else pitch = b.perch.ground ? 0.05 : 0.22;
        if (b.hop > 0) {
          b.hop = Math.max(0, b.hop - dt);
          const step = (0.12 * dt) / 0.25;
          b.at.x += Math.cos(b.heading) * step;
          b.at.z -= Math.sin(b.heading) * step;
          b.at.y = groundHeight(b.at.x, -b.at.z) + 0.01 + Math.sin((b.hop / 0.25) * Math.PI) * 0.05;
        }
        flap = 0;
        fold = 1;
      }

      // ---- drawing
      const m = meshes.get(b.look)!;
      const d2 = (b.at.x - cam.x) ** 2 + (b.at.y - cam.y) ** 2 + (b.at.z - cam.z) ** 2;
      if (d2 > MAX_DRAW * MAX_DRAW) {
        m.body.setMatrixAt(b.slot, ZERO);
        m.wing.setMatrixAt(b.slot * 2, ZERO);
        m.wing.setMatrixAt(b.slot * 2 + 1, ZERO);
        continue;
      }
      E.set(-bank, b.heading + (b.state === 'sit' ? b.look2 * 0.5 : 0), pitch);
      Q.setFromEuler(E);
      // The bird sits on its feet: lift the body above the perch point.
      const sitLift = b.state === 'sit' ? (LOOKS[b.look] as Look).len * 0.13 : 0;
      M.compose(P.set(b.at.x, b.at.y + sitLift, b.at.z), Q, S.set(1, 1, 1));
      m.body.setMatrixAt(b.slot, M);
      const len = (LOOKS[b.look] as Look).len;
      for (const side of [1, -1]) {
        // Wing: from the shoulder, beating when open. Shut, it swings back until its swept tip
        // points at the tail, then rolls down to hang flat against the flank.
        const up = flap * 1.1 + 0.1;
        const roll = (1 - fold) * up + fold * 1.35;
        qa.setFromAxisAngle(X, -side * roll);
        qf.setFromAxisAngle(Y, -side * fold * Math.PI * 0.37);
        qa.multiply(qf);
        W.compose(
          S.set(
            len * (0.06 - 0.02 * fold),
            len * (0.06 + 0.05 * fold),
            side * len * (0.1 + 0.05 * fold),
          ),
          qa,
          MIRROR.set(1, 1, side),
        );
        m.wing.setMatrixAt(b.slot * 2 + (side > 0 ? 0 : 1), W.premultiply(M));
      }
    }
    for (const { body, wing } of meshes.values()) {
      body.instanceMatrix.needsUpdate = true;
      wing.instanceMatrix.needsUpdate = true;
    }
  }

  /** Where each bird is (farm-local), what it is and what it's doing: for tests and screenshots. */
  const list = () =>
    birds.map((b) => ({ look: b.look, at: b.at.clone(), state: b.state, perch: b.perch.tag }));
  return { group, update, list, count: birds.length };
}
