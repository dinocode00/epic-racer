import * as THREE from 'three';
import { TREES, type TreeGeo, barkMaterial, leafDepth, leafMaterial } from '../render/foliage.ts';
import { FARM, type Species, type XY, groundHeight } from './layout.ts';

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
    const r = 0.55 * Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.62) * (1 - t * 0.55) + 0.02;
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

/** Two mature lilacs at the bottom of the ramp, in bloom. */
function lilacs(): THREE.Group {
  const g = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f7d45, roughness: 0.9 });
  const bloom = new THREE.MeshStandardMaterial({ color: 0xa77bc9, roughness: 0.8 });
  for (const p of FARM.lilacs) {
    const b = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const s = 0.7 + rnd() * 0.5;
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaf);
      o.position.set((rnd() - 0.5) * 1.8, 0.9 + rnd() * 1.6, (rnd() - 0.5) * 1.8);
      b.add(o);
    }
    for (let i = 0; i < 26; i++) {
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), bloom);
      const a = rnd() * Math.PI * 2,
        r = 0.9 + rnd() * 0.6;
      o.position.set(Math.cos(a) * r, 1.4 + rnd() * 1.6, Math.sin(a) * r);
      b.add(o);
    }
    b.position.set(p[0], groundHeight(p[0], p[1]), -p[1]);
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

/** Ribbed pumpkin (and gourds) in rows along the vines, plus a load on one wagon. */
function pumpkins(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 20, 12);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 10);
    pos.setXYZ(i, x * k, y * 0.78, z * k);
  }
  geo.computeVertexNormals();
  const load = FARM.wagons.reduce((n, w) => n + w.load, 0);
  const m = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 0.55 }),
    FARM.pumpkins.length + load,
  );
  const mt = new THREE.Matrix4();
  let n = 0;
  const gourdCols = [0xe8c84a, 0x6f9a3a, 0xf1ead2, 0xd9902a];
  for (const [x, y, r, kind] of FARM.pumpkins) {
    const rr = kind === 'pumpkin' ? 0.13 + (r - 0.55) * 0.3 : 0.07 + (r - 0.35) * 0.2;
    mt.makeRotationY(rnd() * 6)
      .scale(new THREE.Vector3(rr, rr, rr))
      .setPosition(x, groundHeight(x, y) + rr * 0.7, -y);
    m.setMatrixAt(n, mt);
    m.setColorAt(
      n++,
      new THREE.Color(kind === 'pumpkin' ? 0xe0661c : gourdCols[(rnd() * 4) | 0]!).multiplyScalar(
        0.85 + rnd() * 0.3,
      ),
    );
  }
  for (const w of FARM.wagons) {
    const a = (w.angle * Math.PI) / 180;
    for (let i = 0; i < w.load; i++) {
      const lx = -1.8 + rnd() * 3.6,
        lz = (rnd() - 0.5) * 1.6;
      const x = w.c[0] + lx * Math.cos(a) - lz * Math.sin(a);
      const y = w.c[1] + lx * Math.sin(a) + lz * Math.cos(a);
      const rr = 0.15 + rnd() * 0.06;
      mt.makeRotationY(rnd() * 6)
        .scale(new THREE.Vector3(rr, rr, rr))
        .setPosition(x, groundHeight(w.c[0], w.c[1]) + 1.01 + rr * 0.7, -y);
      m.setMatrixAt(n, mt);
      m.setColorAt(n++, new THREE.Color(0xe0661c).multiplyScalar(0.9 + rnd() * 0.2));
    }
  }
  m.count = n;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
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
