import * as THREE from 'three';
import { TREES, type TreeGeo, barkMaterial, leafDepth, leafMaterial } from '../render/foliage.ts';
import { FARM, type Species, type XY, driveHeight, groundHeight } from './layout.ts';

/**
 * Everything that grows on the farm, in real metres: the Christmas tree grid (four kinds,
 * random sizes), the trained orchard with apples hanging at about 5 ft, grape trellises, the
 * garden, lilacs in bloom, the arborvitae row, the big spruces, the giant Scotch pine,
 * pumpkins and gourds, and the woods and neighbouring farms beyond the property line.
 */

let seed = 77;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const FT = 0.3048;

interface Normalised {
  geo: TreeGeo;
  height: number;
}
function normalise(make: () => TreeGeo): Normalised {
  const geo = make();
  const b = new THREE.Box3().setFromBufferAttribute(
    geo.solid.attributes.position as THREE.BufferAttribute,
  );
  if (geo.leaves)
    b.union(
      new THREE.Box3().setFromBufferAttribute(
        geo.leaves.attributes.position as THREE.BufferAttribute,
      ),
    );
  return { geo, height: b.max.y };
}

/** One instanced tree kind: bark + leaves meshes sharing the same transforms. */
class TreeBatch {
  readonly group = new THREE.Group();
  private solid: THREE.InstancedMesh;
  private leaves: THREE.InstancedMesh | null;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private t: Normalised,
    count: number,
    private tintSolid = false,
  ) {
    this.solid = new THREE.InstancedMesh(t.geo.solid, barkMaterial(), count);
    this.solid.castShadow = this.solid.receiveShadow = true;
    this.group.add(this.solid);
    this.leaves = null;
    if (t.geo.leaves) {
      const lm = new THREE.InstancedMesh(t.geo.leaves, leafMaterial(t.geo.needles), count);
      lm.customDepthMaterial = leafDepth(t.geo.needles);
      lm.castShadow = lm.receiveShadow = true;
      this.leaves = lm;
      this.group.add(lm);
    }
  }

  add(
    x: number,
    y: number,
    height: number,
    width = 1,
    tint?: THREE.Color,
    yaw = rnd() * Math.PI * 2,
  ): void {
    const s = height / this.t.height;
    this.q.setFromAxisAngle(this.up, yaw);
    this.m.compose(
      new THREE.Vector3(x, groundHeight(x, y) - 0.05, -y),
      this.q,
      new THREE.Vector3(s * width, s, s * width),
    );
    this.solid.setMatrixAt(this.n, this.m);
    if (this.leaves) {
      this.leaves.setMatrixAt(this.n, this.m);
      if (tint) this.leaves.setColorAt(this.n, tint);
    }
    // Pines carry most of their green in the solid layered body, so tint that too.
    if (tint && this.tintSolid) this.solid.setColorAt(this.n, tint);
    this.n++;
  }

  done(): THREE.Group {
    this.solid.count = this.n;
    if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    if (this.leaves) {
      this.leaves.count = this.n;
      if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    }
    return this.group;
  }
}

const TINT: Record<Species, [number, number, number]> = {
  scotch: [1.45, 1.38, 0.5],
  douglas: [0.55, 0.75, 0.6],
  white: [0.95, 1.25, 1.2],
  blue: [1.05, 1.35, 2.1],
};
const WIDTH: Record<Species, number> = { scotch: 1.05, douglas: 0.95, white: 1.12, blue: 0.9 };

export function buildPlants(): THREE.Group {
  const root = new THREE.Group();
  const pine = normalise(TREES.pine);
  const broad = normalise(TREES.broad);

  // ---- Christmas trees: an orderly grid, four kinds west to east, random sizes.
  const xmas = new TreeBatch(pine, FARM.christmas_trees.length, true);
  for (const t of FARM.christmas_trees) {
    const v = 0.9 + rnd() * 0.2;
    const c = TINT[t.species];
    xmas.add(
      t.x,
      t.y,
      t.heightFt * FT * (0.92 + rnd() * 0.16),
      WIDTH[t.species] * 0.9,
      new THREE.Color(c[0] * v, c[1] * v, c[2] * v),
    );
  }
  root.add(xmas.done());

  // ---- Big spruces by the road (10-20 ft over the house), the spruce row, the giant Scotch pine.
  const big = new TreeBatch(pine, 30, true);
  for (const p of FARM.big_spruces)
    big.add(p[0], p[1], 12 + rnd() * 3, 1.05, new THREE.Color(0.66, 0.84, 0.74));
  for (const p of FARM.spruce_row)
    big.add(p[0], p[1], 9 + rnd() * 2.5, 0.95, new THREE.Color(0.66, 0.84, 0.74));
  big.add(
    FARM.big_scotch_pine[0],
    FARM.big_scotch_pine[1],
    19,
    1.55,
    new THREE.Color(1.15, 1.12, 0.66),
    0.3,
  );
  root.add(big.done());

  // ---- Orchard: trained trees about 13 ft tall; apples hang at about 5 ft.
  const orch = new TreeBatch(broad, FARM.orchard.length);
  const fruitGeo = new THREE.SphereGeometry(1, 10, 8);
  const fruit = new THREE.InstancedMesh(
    fruitGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.45 }),
    FARM.orchard.length * 26,
  );
  fruit.castShadow = true;
  let nf = 0;
  const mtx = new THREE.Matrix4();
  const FRUIT: Record<string, [number, number]> = {
    apple: [0xc4302a, 0.045],
    pear: [0xbfcf4e, 0.05],
    cherry: [0x7a0f22, 0.022],
  };
  for (const [x, y, kind] of FARM.orchard) {
    const h = kind === 'apple' ? 13 * FT : kind === 'pear' ? 15 * FT : 12 * FT;
    orch.add(
      x,
      y,
      h,
      kind === 'apple' ? 1.35 : 1.05,
      kind === 'apple' ? undefined : new THREE.Color(0.9, 1.0, 0.85),
    );
    const [col, r] = FRUIT[kind]!;
    const g0 = groundHeight(x, y);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.7 + rnd() * 1.1;
      const fy = kind === 'apple' ? 5 * FT + (rnd() - 0.4) * 0.6 : 1.8 + rnd() * 1.6;
      mtx
        .makeScale(r, r * 1.05, r)
        .setPosition(x + Math.cos(a) * d, g0 + fy, -(y + Math.sin(a) * d));
      fruit.setMatrixAt(nf, mtx);
      fruit.setColorAt(nf++, new THREE.Color(col).multiplyScalar(0.85 + rnd() * 0.3));
    }
  }
  fruit.count = nf;
  root.add(orch.done(), fruit);

  // ---- Woods beyond the line, and neighbouring farms behind the trees (NE and SW).
  const woods = new TreeBatch(broad, 160);
  for (const c of FARM.neighbourWoods)
    for (let i = 0; i < 14; i++)
      woods.add(c[0] + (rnd() - 0.5) * 22, c[1] + (rnd() - 0.5) * 22, 9 + rnd() * 6, 1.3);
  // A loose band of trees across the road and along the west, prairie between.
  const road = FARM.road as [XY, XY];
  for (let i = 0; i < 60; i++) {
    const t = rnd();
    const px = road[0][0] + (road[1][0] - road[0][0]) * t;
    const py = road[0][1] + (road[1][1] - road[0][1]) * t;
    const out = 16 + rnd() * 50;
    woods.add(px - 0.64 * out, py + 0.77 * out, 8 + rnd() * 7, 1.2 + rnd() * 0.4);
  }
  root.add(woods.done());
  root.add(neighbourFarm([FARM.neighbourWoods[0]![0] + 26, FARM.neighbourWoods[0]![1] + 4], 0.3));
  root.add(neighbourFarm([FARM.neighbourWoods[1]![0] - 28, FARM.neighbourWoods[1]![1] - 6], 2.1));

  root.add(arborvitae(), lilacs(), grapes(), garden(), pumpkins());
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

/** Mature arborvitae, about 11 ft: narrow, dense columns. */
function arborvitae(): THREE.InstancedMesh {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = 0.78 * Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.62) * (1 - t * 0.55) + 0.02;
    prof.push(new THREE.Vector2(r, t * 11 * FT));
  }
  prof.push(new THREE.Vector2(0, 11 * FT));
  const g = new THREE.LatheGeometry(prof, 12);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.06 * Math.sin(pos.getY(i) * 9 + Math.atan2(pos.getZ(i), pos.getX(i)) * 5);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new THREE.InstancedMesh(
    g,
    new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.95 }),
    FARM.arborvitae.length,
  );
  const mt = new THREE.Matrix4();
  FARM.arborvitae.forEach((p, i) => {
    mt.makeScale(1, 0.94 + rnd() * 0.12, 1).setPosition(
      p[0],
      groundHeight(p[0], p[1]) - 0.05,
      -p[1],
    );
    m.setMatrixAt(i, mt);
    m.setColorAt(i, new THREE.Color().setHSL(0.31, 0.38, 0.27 + rnd() * 0.05));
  });
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Two mature lilacs at the bottom of the ramp, growing out of its grassy sides: a dome of
 * overlapping leaf clumps with purple panicles set into the foliage, not floating off it.
 */
function lilacs(): THREE.Group {
  const g = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f7d45, roughness: 0.9 });
  const leafDark = new THREE.MeshStandardMaterial({ color: 0x3f6a38, roughness: 0.92 });
  const bloom = new THREE.MeshStandardMaterial({ color: 0xa77bc9, roughness: 0.8 });
  const bloomPale = new THREE.MeshStandardMaterial({ color: 0xc4a3dd, roughness: 0.8 });
  // A panicle: a soft, slightly tapered cluster rather than a hard cone.
  const panicle = new THREE.IcosahedronGeometry(1, 1);
  {
    const pp = panicle.attributes.position!;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      const k = 1 - 0.35 * Math.max(0, y);
      pp.setXYZ(i, pp.getX(i) * 0.16 * k, 0.1 + y * 0.24, pp.getZ(i) * 0.16 * k);
    }
    panicle.computeVertexNormals();
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const p of FARM.lilacs) {
    const b = new THREE.Group();
    const clumps: { c: THREE.Vector3; r: number }[] = [];
    // Clumps on a dome so the outside reads as one rounded bush.
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2,
        e = 0.15 + rnd() * 1.2;
      const r = 0.55 + rnd() * 0.35;
      const c = new THREE.Vector3(
        Math.cos(a) * Math.cos(e) * 1.25,
        1.25 + Math.sin(e) * 1.35,
        Math.sin(a) * Math.cos(e) * 1.25,
      );
      clumps.push({ c, r });
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 3 ? leaf : leafDark);
      o.position.copy(c);
      o.scale.set(1, 0.85, 1);
      b.add(o);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), leafDark);
    core.position.set(0, 1.5, 0);
    core.scale.set(1, 0.9, 1);
    b.add(core);
    // Panicles sit in the clumps on their outward, upper faces, half buried in the leaves.
    for (let i = 0; i < 48; i++) {
      const k = clumps[(rnd() * clumps.length) | 0]!;
      const dir = new THREE.Vector3(k.c.x, 0, k.c.z).normalize();
      dir.y = 0.9 + rnd() * 1.2;
      dir.normalize();
      const o = new THREE.Mesh(panicle, rnd() < 0.35 ? bloomPale : bloom);
      o.position.copy(k.c).addScaledVector(dir, k.r * 0.62);
      o.quaternion.setFromUnitVectors(up, dir);
      o.scale.setScalar(0.8 + rnd() * 0.45);
      b.add(o);
    }
    b.position.set(p[0], driveHeight(p[0], p[1]) - 0.15, -p[1]);
    b.rotation.y = rnd() * 6;
    g.add(b);
  }
  return g;
}

/** Four grape rows on posts and wire, heavy with leaves and purple clusters. */
function grapes(): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const vine = new THREE.MeshStandardMaterial({ color: 0x4e8a34, roughness: 0.9 });
  const grape = new THREE.MeshStandardMaterial({ color: 0x4a2a5e, roughness: 0.5 });
  for (const [a, b] of FARM.grape_rows) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const row = new THREE.Group();
    for (let s = 0; s <= L + 0.01; s += 3)
      row.add(
        new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), post).translateX(s).translateY(0.9),
      );
    for (let s = 0.4; s < L - 0.4; s += 0.55) {
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + rnd() * 0.12, 0), vine);
      o.position.set(s, 1.35 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.25);
      o.scale.set(1, 0.9, 0.7);
      row.add(o);
      if (rnd() < 0.5) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), grape);
        c.rotation.x = Math.PI;
        c.position.set(s + 0.1, 1.0, (rnd() - 0.5) * 0.5);
        row.add(c);
      }
    }
    row.position.set(a[0], groundHeight(a[0], a[1]), -a[1]);
    row.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.add(row);
  }
  return g;
}

/** The small vegetable and flower garden beside the grapes. */
function garden(): THREE.Group {
  const G = FARM.garden;
  const g = new THREE.Group();
  const cols = [0xe04848, 0xf2c230, 0xffffff, 0xc060d0, 0x4f9a35, 0x4f9a35, 0x3e8a2c];
  for (let i = 0; i < 46; i++) {
    const c = cols[i % cols.length]!;
    const o = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.1 + rnd() * 0.12, 0),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
    );
    o.position.set((rnd() - 0.5) * G.h, 0.15 + rnd() * 0.3, (rnd() - 0.5) * G.w);
    g.add(o);
  }
  g.position.set(G.c[0], groundHeight(G.c[0], G.c[1]), -G.c[1]);
  g.rotation.y = ((G.angle ?? 0) * Math.PI) / 180;
  return g;
}

/** Ribbed pumpkin body of unit radius: `flat` squashes it, `ribs` and `depth` set the lobes. */
function pumpkinGeo(flat: number, ribs: number, depth: number, warts = 0): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 22, 14);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    let k = 1 + depth * Math.cos(Math.atan2(z, x) * ribs);
    if (warts) k += warts * Math.max(0, Math.sin(x * 23) * Math.sin(y * 19) * Math.sin(z * 21));
    // Pinch in at the stem and the blossom end like a real pumpkin.
    const pinch = 1 - 0.18 * Math.abs(y) ** 6;
    pos.setXYZ(i, x * k * pinch, y * flat, z * k * pinch);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * The pumpkin patch: a mix of field pumpkins, flat red Cinderellas, tall jack-o-lanterns,
 * white ghosts, warty greens and tans, gourds, and a few prize giants dwarfing the rest.
 */
function pumpkins(): THREE.Group {
  const g = new THREE.Group();
  type Style = { geo: THREE.BufferGeometry; flat: number; at: THREE.Matrix4[]; col: THREE.Color[] };
  const style = (flat: number, ribs: number, depth: number, warts = 0): Style => ({
    geo: pumpkinGeo(flat, ribs, depth, warts),
    flat,
    at: [],
    col: [],
  });
  const S = {
    field: style(0.8, 10, 0.07),
    cinderella: style(0.55, 12, 0.11),
    tall: style(1.05, 9, 0.06),
    warty: style(0.78, 10, 0.06, 0.09),
    giant: style(0.72, 14, 0.1),
    gourd: style(0.85, 6, 0.04),
  };
  const stems: THREE.Matrix4[] = [];
  const put = (s: Style, x: number, y: number, base: number, r: number, c: number, v = 0.15) => {
    const yaw = rnd() * 6;
    const tilt = (rnd() - 0.5) * 0.25;
    const m = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationZ(tilt))
      .scale(new THREE.Vector3(r, r, r))
      .setPosition(x, base + r * s.flat * 0.88, -y);
    s.at.push(m);
    s.col.push(new THREE.Color(c).multiplyScalar(1 - v + rnd() * v * 2));
    if (s !== S.gourd) {
      const sr = 0.012 + r * 0.06;
      stems.push(
        new THREE.Matrix4()
          .makeRotationY(yaw)
          .multiply(new THREE.Matrix4().makeRotationZ(tilt + (rnd() - 0.5) * 0.5))
          .scale(new THREE.Vector3(sr, 0.03 + r * 0.22, sr))
          .setPosition(x, base + r * s.flat * 1.7, -y),
      );
    }
  };
  // Prize giants, spread across the patch; the plain pumpkins around them make room.
  const giants: XY[] = [];
  for (const [x, y, , kind] of FARM.pumpkins) {
    if (kind !== 'pumpkin' || rnd() > 0.2) continue;
    if (giants.every((q) => Math.hypot(q[0] - x, q[1] - y) > 14)) giants.push([x, y]);
    if (giants.length >= 6) break;
  }
  const giantR = giants.map(() => 0.55 + rnd() * 0.3);
  giants.forEach(([x, y], i) => {
    put(
      S.giant,
      x,
      y,
      groundHeight(x, y) - 0.06,
      giantR[i]!,
      rnd() < 0.6 ? 0xe2741f : 0xeb8f2e,
      0.08,
    );
  });
  const gourdCols = [0xe8c84a, 0x6f9a3a, 0xf1ead2, 0xd9902a];
  for (const [x, y, r, kind] of FARM.pumpkins) {
    if (giants.some((q, i) => Math.hypot(q[0] - x, q[1] - y) < giantR[i]! + 0.7)) continue;
    const h = groundHeight(x, y) - 0.02;
    if (kind === 'gourd') {
      put(S.gourd, x, y, h, 0.07 + (r - 0.35) * 0.2, gourdCols[(rnd() * 4) | 0]!);
      continue;
    }
    // Sizes run from little pie pumpkins to big carvers.
    const rr = (0.1 + (r - 0.55) * 0.3) * (0.7 + rnd() * rnd() * 1.6);
    const roll = rnd();
    if (roll < 0.5) put(S.field, x, y, h, rr, 0xe0661c);
    else if (roll < 0.64) put(S.cinderella, x, y, h, rr * 1.15, 0xc8441a);
    else if (roll < 0.76) put(S.tall, x, y, h, rr * 0.9, 0xe8781e);
    else if (roll < 0.86) put(S.field, x, y, h, rr, 0xeeeadc, 0.05);
    else if (roll < 0.93) put(S.warty, x, y, h, rr, 0x5f7f3a);
    else put(S.cinderella, x, y, h, rr * 1.1, 0xd8b98a, 0.08);
  }
  for (const w of FARM.wagons) {
    const a = (w.angle * Math.PI) / 180;
    for (let i = 0; i < w.load; i++) {
      const lx = -1.8 + rnd() * 3.6,
        lz = (rnd() - 0.5) * 1.6;
      const x = w.c[0] + lx * Math.cos(a) - lz * Math.sin(a);
      const y = w.c[1] + lx * Math.sin(a) + lz * Math.cos(a);
      const base = groundHeight(w.c[0], w.c[1]) + 1.01;
      const rr = 0.13 + rnd() * 0.08;
      if (rnd() < 0.8) put(S.field, x, y, base, rr, 0xe0661c, 0.1);
      else put(S.field, x, y, base, rr, 0xeeeadc, 0.05);
    }
  }
  const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  for (const s of Object.values(S)) {
    if (!s.at.length) continue;
    const m = new THREE.InstancedMesh(s.geo, skin, s.at.length);
    s.at.forEach((mt, i) => {
      m.setMatrixAt(i, mt);
      m.setColorAt(i, s.col[i]!);
    });
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const stemGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6);
  const sm = new THREE.InstancedMesh(
    stemGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b6a3a, roughness: 0.9 }),
    stems.length,
  );
  stems.forEach((mt, i) => sm.setMatrixAt(i, mt));
  sm.castShadow = true;
  g.add(sm);
  return g;
}

/** A neighbouring farmhouse and barn glimpsed behind the trees. */
function neighbourFarm(c: XY, angle: number): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8e3a30, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 7), white);
  house.position.set(0, 3, 0);
  const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.2, 3.2, 4, 1), roof);
  hr.rotation.y = Math.PI / 4;
  hr.scale.set(1.25, 1, 0.95);
  hr.position.set(0, 7.6, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 11), red);
  b.position.set(16, 4, 6);
  const br = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 9, 5, 4, 1), roof);
  br.rotation.y = Math.PI / 4;
  br.scale.set(1.45, 1, 0.9);
  br.position.set(16, 10.5, 6);
  g.add(house, hr, b, br);
  g.position.set(c[0], groundHeight(c[0], c[1]), -c[1]);
  g.rotation.y = angle;
  return g;
}
