import * as THREE from 'three';
import {
  type TreeGeo,
  treeKit,
  barkDepth,
  barkMaterial,
  leafDepth,
  leafMaterial,
} from '../render/foliage.ts';
import * as tex from '../render/textures.ts';
import { windy } from '../render/wind.ts';
import { bake } from './bake.ts';
import { type BeeSpot, bees } from './bees.ts';
import {
  BERM,
  FARM,
  type Species,
  type XY,
  driveHeight,
  groundHeight,
  inside,
  rampFrame,
  rampHeight,
  rampPoint,
} from './layout.ts';
import {
  CROWNS,
  WOODS,
  appleTree,
  arborvitaeTree,
  cherryTree,
  pearTree,
  scotchGiant,
  spruce,
  xmasTree,
} from './trees.ts';

/** Where the honeybees work: every flower patch and the windfalls in the orchard. */
const SPOTS: BeeSpot[] = [];

/** Bees over the ramp's wildflower mounds, the garden and the wildflower fields. */
function meadowBees(): void {
  for (let i = 0; i < 10; i++) {
    const t = 0.12 + (i / 10) * 0.85;
    const side = i % 2 ? 1 : -1;
    const [x, y] = rampPoint(t, side * (rampFrame(...rampPoint(t, 0)).half + BERM * 0.5));
    SPOTS.push({ x, y: (rampHeight(x, y) ?? groundHeight(x, y)) + 0.2, z: -y, r: 1.0, n: 2 });
  }
  const G = FARM.garden.c;
  SPOTS.push({ x: G[0], y: groundHeight(G[0], G[1]) + 0.4, z: -G[1], r: 1.4, n: 3 });
  for (const poly of [FARM.outside_east_field, FARM.outside_hill]) {
    const xs = poly.map((p) => p[0]),
      ys = poly.map((p) => p[1]);
    for (let placed = 0, tries = 0; placed < 18 && tries < 500; tries++) {
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs));
      const y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
      if (!inside(x, y, poly)) continue;
      SPOTS.push({ x, y: groundHeight(x, y) + 0.35, z: -y, r: 1.5, n: 2 });
      placed++;
    }
  }
}

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

// How the farm's shrubs and low plants move in the breeze (object units: metres here).
const LILAC_WIND = { lean: 0.018, sway: 0.014, speed: 1.6, flutter: 0.025, h0: 0.4 };
const VINE_GREENS = [0x4e8a34, 0x5a9a3c, 0x447d2e];
const LILAC_DEEP = new THREE.Color(0xa77bc9);
const LILAC_PALE = new THREE.Color(0xc9aee0);
const LILAC_LEAF = new THREE.Color(0x56844a);
const LILAC_LEAF_DARK = new THREE.Color(0x44703c);
const LEAF_FLUTTER = { lean: 0.12, sway: 0.12, speed: 2.6, flutter: 0.1, h0: -1 };

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
    this.solid.customDepthMaterial = barkDepth();
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

/** A little lighter or darker, a little warmer or cooler: no two trees quite alike. */
const vary = (amount = 0.1) => {
  const v = 1 - amount + rnd() * amount * 2;
  return new THREE.Color(v * (0.97 + rnd() * 0.06), v, v * (0.96 + rnd() * 0.08));
};

export function buildPlants(): THREE.Group {
  const root = new THREE.Group();

  // ---- Christmas trees: an orderly grid, four kinds west to east, random sizes.
  const kinds: Species[] = ['scotch', 'douglas', 'white', 'blue'];
  const xmas = Object.fromEntries(
    kinds.map((k) => [
      k,
      new TreeBatch(
        normalise(() => xmasTree(k)),
        FARM.christmas_trees.filter((t) => t.species === k).length,
        true,
      ),
    ]),
  ) as Record<Species, TreeBatch>;
  for (const t of FARM.christmas_trees)
    xmas[t.species].add(
      t.x,
      t.y,
      t.heightFt * FT * (0.92 + rnd() * 0.16),
      0.94 + rnd() * 0.12,
      vary(0.08),
    );
  for (const k of kinds) root.add(xmas[k].done());

  // ---- Big spruces by the road (10-20 ft over the house), the spruce row, the giant Scotch pine.
  const big = new TreeBatch(normalise(spruce), 30, true);
  for (const p of FARM.big_spruces) big.add(p[0], p[1], 12 + rnd() * 3, 1, vary(0.08));
  for (const p of FARM.spruce_row) big.add(p[0], p[1], 9 + rnd() * 2.5, 0.95, vary(0.08));
  root.add(big.done());
  const giant = new TreeBatch(normalise(scotchGiant), 1);
  giant.add(FARM.big_scotch_pine[0], FARM.big_scotch_pine[1], 19, 1, undefined, 0.3);
  root.add(giant.done());

  // ---- Orchard: trained trees about 13 ft tall; apples hang at about 5 ft.
  const orchKinds = { apple: appleTree, pear: pearTree, cherry: cherryTree } as const;
  type Fruit = keyof typeof orchKinds;
  const norms = {
    apple: normalise(appleTree),
    pear: normalise(pearTree),
    cherry: normalise(cherryTree),
  };
  const orch = Object.fromEntries(
    (Object.keys(orchKinds) as Fruit[]).map((k) => [
      k,
      new TreeBatch(norms[k], FARM.orchard.filter((o) => o[2] === k).length, true),
    ]),
  ) as Record<Fruit, TreeBatch>;
  // How far out from the trunk fruit hangs, to stay inside each kind's crown.
  const REACH: Record<Fruit, [number, number]> = {
    apple: [0.7, 1.4],
    pear: [0.35, 0.8],
    cherry: [0.45, 1.0],
  };
  const fruitGeo = new THREE.SphereGeometry(1, 10, 8);
  const fruit = new THREE.InstancedMesh(
    fruitGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.45 }),
    FARM.orchard.length * 44,
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
    const yaw = rnd() * Math.PI * 2,
      wd = 0.95 + rnd() * 0.1;
    orch[kind].add(x, y, h, wd, vary(0.08), yaw);
    const [col, r] = FRUIT[kind]!;
    const [d0, d1] = REACH[kind];
    const g0 = groundHeight(x, y);
    // Fruit showing on the outside of the leaves, round the sides and lower crown.
    const sc = h / norms[kind].height;
    const crown = CROWNS[kind];
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let i = 0; i < 16; i++) {
      const [cx, cy, cz, cr] = crown.clumps[(rnd() * crown.clumps.length) | 0]!;
      const a = rnd() * Math.PI * 2,
        dy = -0.6 + rnd() * 0.9;
      const k = Math.sqrt(1 - dy * dy);
      const v = new THREE.Vector3(
        (cx + Math.cos(a) * k * cr * 0.95) * sc * wd,
        (cy + dy * cr * 0.95 * crown.squash) * sc,
        (cz + Math.sin(a) * k * cr * 0.95) * sc * wd,
      ).applyQuaternion(rot);
      mtx.makeScale(r, r * 1.05, r).setPosition(x + v.x, g0 - 0.05 + v.y, -y + v.z);
      fruit.setMatrixAt(nf, mtx);
      fruit.setColorAt(nf++, new THREE.Color(col).multiplyScalar(0.85 + rnd() * 0.3));
    }
    for (let i = 0; i < (kind === 'apple' ? 16 : 8); i++) {
      const a = rnd() * Math.PI * 2;
      const d = d0 + rnd() * (d1 - d0);
      const fy = kind === 'apple' ? 5 * FT + (rnd() - 0.4) * 0.6 : 1.8 + rnd() * 1.6;
      mtx
        .makeScale(r, r * 1.05, r)
        .setPosition(x + Math.cos(a) * d, g0 + fy, -(y + Math.sin(a) * d));
      fruit.setMatrixAt(nf, mtx);
      fruit.setColorAt(nf++, new THREE.Color(col).multiplyScalar(0.85 + rnd() * 0.3));
    }
    // Windfalls: some fruit always drops before picking, a few of them going brown.
    const fallen = 5 + ((rnd() * 6) | 0);
    for (let i = 0; i < fallen; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.3 + rnd() * 1.9;
      const fx = x + Math.cos(a) * d,
        fz = y + Math.sin(a) * d;
      mtx
        .makeRotationY(rnd() * 6)
        .scale(new THREE.Vector3(r, r * 0.92, r))
        .setPosition(fx, groundHeight(fx, fz) + r * 0.7, -fz);
      fruit.setMatrixAt(nf, mtx);
      const c = new THREE.Color(col).multiplyScalar(0.7 + rnd() * 0.3);
      if (rnd() < 0.3) c.lerp(new THREE.Color(0x5a3a1c), 0.55);
      fruit.setColorAt(nf++, c);
    }
    SPOTS.push({ x, y: g0 + 0.12, z: -y, r: 1.3, n: 2, fruit: true });
  }
  fruit.count = nf;
  for (const b of Object.values(orch)) root.add(b.done());
  root.add(fruit);

  // ---- Woods beyond the line, and neighbouring farms behind the trees (NE and SW).
  const woods = WOODS.map((make) => new TreeBatch(normalise(make), 60, true));
  const wood = () => woods[(rnd() * woods.length) | 0]!;
  for (const c of FARM.neighbourWoods)
    for (let i = 0; i < 14; i++)
      wood().add(
        c[0] + (rnd() - 0.5) * 22,
        c[1] + (rnd() - 0.5) * 22,
        9 + rnd() * 6,
        0.9 + rnd() * 0.25,
        vary(0.12),
      );
  // A loose band of trees across the road and along the west, prairie between.
  const road = FARM.road as [XY, XY];
  for (let i = 0; i < 60; i++) {
    const t = rnd();
    const px = road[0][0] + (road[1][0] - road[0][0]) * t;
    const py = road[0][1] + (road[1][1] - road[0][1]) * t;
    const out = 16 + rnd() * 50;
    wood().add(px - 0.64 * out, py + 0.77 * out, 8 + rnd() * 7, 0.9 + rnd() * 0.3, vary(0.12));
  }
  for (const w of woods) root.add(w.done());
  root.add(neighbourFarm([FARM.neighbourWoods[0]![0] + 26, FARM.neighbourWoods[0]![1] + 4], 0.3));
  root.add(neighbourFarm([FARM.neighbourWoods[1]![0] - 28, FARM.neighbourWoods[1]![1] - 6], 2.1));

  root.add(arborvitae(), lilacs(), grapes(), garden(), pumpkins());
  meadowBees();
  const hive = bees(SPOTS);
  root.add(hive.mesh);
  root.userData.update = hive.update;
  root.userData.spots = SPOTS;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

/** Mature arborvitae, about 11 ft: full, dense columns that nearly meet along the row. */
function arborvitae(): THREE.Group {
  const b = new TreeBatch(normalise(arborvitaeTree), FARM.arborvitae.length, true);
  for (const p of FARM.arborvitae)
    b.add(p[0], p[1], 11 * FT * (0.94 + rnd() * 0.12), 1, vary(0.07));
  return b.done();
}

/**
 * Two mature lilacs at the bottom of the ramp, growing out of its grassy sides: a dome of
 * overlapping leaf clumps with purple panicles set into the foliage, not floating off it.
 */
function lilacs(): THREE.Group {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.95 });
  const stem = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 5), bark);
    o.position.copy(a).addScaledVector(d, 0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return o;
  };
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
  const bushLeaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const bushBloom = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const bushBark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const lilacCards = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tex.leafCluster(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.85,
  });
  for (const p of FARM.lilacs) {
    const b = new THREE.Group();
    const florets: THREE.BufferGeometry[] = [];
    const clumps: { c: THREE.Vector3; r: number }[] = [];
    // Clumps on a dome so the outside reads as one rounded bush.
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2,
        e = 0.15 + rnd() * 1.2;
      const r = 0.55 + rnd() * 0.35;
      const c = new THREE.Vector3(
        Math.cos(a) * Math.cos(e) * 1.25,
        1.8 + Math.sin(e) * 1.3,
        Math.sin(a) * Math.cos(e) * 1.25,
      );
      clumps.push({ c, r });
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 3 ? leaf : leafDark);
      o.position.copy(c);
      o.scale.set(1, 0.85, 1);
      b.add(o);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), leafDark);
    core.position.set(0, 2.15, 0);
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
      // Florets: a spray of small purple cards round each panicle.
      const pc = o.position.clone().addScaledVector(dir, 0.12 * o.scale.x);
      florets.push(
        treeKit.cards(pc, 0.13 * o.scale.x, 7, 0.16, rnd() < 0.35 ? LILAC_PALE : LILAC_DEEP),
      );
    }
    // A fringe of leaf cards over every clump so the outline is leafy, not smooth.
    for (const k of clumps)
      florets.push(
        treeKit.cards(k.c, k.r * 1.02, 14, 0.36, rnd() < 0.4 ? LILAC_LEAF_DARK : LILAC_LEAF),
      );
    // No single trunk: a clump of thin woody stems rising from the ground and fanning out,
    // forking once on the way up into the leaves.
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2,
        a2 = a + (rnd() - 0.5) * 0.8;
      const base = new THREE.Vector3(Math.cos(a) * rnd() * 0.35, 0.05, Math.sin(a) * rnd() * 0.35);
      const reach = 0.35 + rnd() * 0.35;
      const mid = new THREE.Vector3(Math.cos(a) * reach, 0.75 + rnd() * 0.35, Math.sin(a) * reach);
      const r0 = 0.025 + rnd() * 0.022;
      b.add(stem(base, mid, r0, r0 * 0.8));
      for (const da of [-0.35, 0.35]) {
        const tr = reach + 0.3 + rnd() * 0.45;
        const tip = new THREE.Vector3(
          Math.cos(a2 + da) * tr,
          1.55 + rnd() * 0.45,
          Math.sin(a2 + da) * tr,
        );
        b.add(stem(mid, tip, r0 * 0.75, r0 * 0.45));
      }
    }
    // One mesh each for leaves, blooms and stems, all sharing the bush's origin so the whole
    // bush leans and sways together in the breeze.
    const baked = bake(b, [
      { from: [leaf, leafDark], to: bushLeaf },
      { from: [bloom, bloomPale], to: bushBloom },
      { from: [bark], to: bushBark },
    ]);
    const bush = new THREE.Group();
    for (const mesh of baked) bush.add(windy(mesh, LILAC_WIND, 'lilac'));
    const cardMesh = new THREE.Mesh(treeKit.merge(florets), lilacCards);
    cardMesh.castShadow = cardMesh.receiveShadow = true;
    bush.add(windy(cardMesh, LILAC_WIND, 'lilac'));
    bush.position.set(p[0], driveHeight(p[0], p[1]) - 0.15, -p[1]);
    SPOTS.push({ x: p[0], y: bush.position.y + 2.6, z: -p[1], r: 2.0, n: 7 });
    bush.rotation.y = rnd() * 6;
    g.add(bush);
  }
  return g;
}

/** Four grape rows on posts and wire, heavy with leaves and purple clusters. */
function grapes(): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const vineBody = barkMaterial();
  const vineLeaves = leafMaterial(false);
  const grape = new THREE.MeshStandardMaterial({ roughness: 0.35 });
  const berry = new THREE.IcosahedronGeometry(1, 1);
  const purples = [0x4a2a5e, 0x5b2d73, 0x3d2050, 0x6a3a82];
  for (const [a, b] of FARM.grape_rows) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const row = new THREE.Group();
    for (let s = 0; s <= L + 0.01; s += 3)
      row.add(
        new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), post).translateX(s).translateY(0.9),
      );
    // Leafy along the wires: soft, shaded clumps fringed with leaf cards, like the trees.
    const body: THREE.BufferGeometry[] = [],
      fringe: THREE.BufferGeometry[] = [];
    for (let s = 0.3; s < L - 0.3; s += 0.2 + rnd() * 0.2) {
      const c = new THREE.Vector3(s, 1.36 + (rnd() - 0.5) * 0.36, (rnd() - 0.5) * 0.22);
      const r = 0.2 + rnd() * 0.2;
      const col = new THREE.Color(VINE_GREENS[(rnd() * VINE_GREENS.length) | 0]!);
      body.push(treeKit.blob(c, r * 0.8, col, (rnd() * 100) | 0, 0.85));
      fringe.push(treeKit.cards(c, r * 1.15, 9, 0.38, col.clone().multiplyScalar(1.12)));
      // Shoots trailing down off the wire.
      if (rnd() < 0.35)
        fringe.push(
          treeKit.cards(c.clone().add(new THREE.Vector3(0, -0.32, 0)), 0.14, 4, 0.3, col),
        );
    }
    const bodyGeo = treeKit.merge(body).scale(1, 1, 0.72);
    const fringeGeo = treeKit.merge(fringe).scale(1, 1, 0.72);
    const bm = new THREE.Mesh(bodyGeo, vineBody);
    bm.customDepthMaterial = barkDepth();
    const fm = new THREE.Mesh(fringeGeo, vineLeaves);
    fm.customDepthMaterial = leafDepth(false);
    row.add(bm, fm);
    // Bunches of round purple grapes hanging below the leaves on both sides of the row: each
    // a tapering heap of small berries, widest at the top.
    const at: THREE.Matrix4[] = [],
      cols: THREE.Color[] = [];
    for (let s = 0.3; s < L - 0.3; s += 0.24) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.25) continue;
        const cx = s + (rnd() - 0.5) * 0.15,
          cz = side * (0.28 + rnd() * 0.1),
          top = 1.12 + (rnd() - 0.5) * 0.12;
        const col = new THREE.Color(purples[(rnd() * purples.length) | 0]!);
        for (let i = 0; i < 22; i++) {
          const d = rnd();
          const spread = 0.07 * (1 - d * 0.75);
          const a = rnd() * Math.PI * 2;
          const r = 0.022 + rnd() * 0.006;
          at.push(
            new THREE.Matrix4()
              .makeScale(r, r, r)
              .setPosition(
                cx + Math.cos(a) * spread * Math.sqrt(rnd()),
                top - d * 0.2,
                cz + Math.sin(a) * spread * Math.sqrt(rnd()),
              ),
          );
          cols.push(col.clone().multiplyScalar(0.8 + rnd() * 0.4));
        }
      }
    }
    const bunch = new THREE.InstancedMesh(berry, grape, at.length);
    at.forEach((m, i) => {
      bunch.setMatrixAt(i, m);
      bunch.setColorAt(i, cols[i]!);
    });
    bunch.castShadow = true;
    row.add(bunch);
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
 * A crookneck gourd of unit bulb radius lying on its side: a round bulb whose neck tapers away
 * and curls up toward the stem. `curl` is how far the neck bends, `len` how long it runs.
 */
function hornGeo(len: number, curl: number): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const r = 0.17 + 0.83 * Math.exp(-(((t - 0.2) / 0.21) ** 2)) * Math.min(1, t * 7);
    prof.push(new THREE.Vector2(Math.max(0.12, r), t * len));
  }
  prof.push(new THREE.Vector2(0.1, len), new THREE.Vector2(0, len));
  const geo = new THREE.LatheGeometry(prof, 14);
  const pos = geo.attributes.position!;
  const k = curl / (len * 0.72) ** 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + k * Math.max(0, y - len * 0.28) ** 2);
  }
  // Lay it down: the neck runs along -x, rising a little, and curls up.
  const tilt = Math.PI / 2 - 0.18;
  geo.rotateZ(tilt);
  const by = len * 0.2;
  geo.translate(by * Math.sin(tilt), -by * Math.cos(tilt), 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pumpkin vines through the whole patch: runners wandering out from every pumpkin and between
 * them, thick with broad lobed leaves and yellow trumpet flowers.
 */
function pumpkinVines(): THREE.Group {
  const g = new THREE.Group();
  const patch = FARM.pumpkin_patch;
  const segs: THREE.Matrix4[] = [],
    leaves: THREE.Matrix4[] = [],
    flowers: THREE.Matrix4[] = [];
  const e = new THREE.Euler(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3();
  const mat = (
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy: number,
    sz: number,
  ) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      q.setFromEuler(e.set(rx, ry, rz, 'YXZ')),
      one.set(sx, sy, sz),
    );
  const grow = (x: number, y: number, heading: number, n: number) => {
    for (let i = 0; i < n; i++) {
      heading += (rnd() - 0.5) * 0.7;
      const step = 0.32;
      const nx = x + Math.cos(heading) * step,
        ny = y + Math.sin(heading) * step;
      if (!inside(nx, ny, patch)) return;
      const h = groundHeight((x + nx) / 2, (y + ny) / 2);
      segs.push(
        mat((x + nx) / 2, h + 0.03, -(y + ny) / 2, 0, heading, 0, step + 0.04, 0.025, 0.025),
      );
      x = nx;
      y = ny;
      if (rnd() < 0.8) {
        const side = rnd() < 0.5 ? -1 : 1;
        const lx = x + Math.cos(heading + side * 1.4) * 0.12,
          ly = y + Math.sin(heading + side * 1.4) * 0.12;
        const s = 0.13 + rnd() * 0.09;
        leaves.push(
          mat(
            lx,
            groundHeight(lx, ly) + 0.06 + rnd() * 0.16,
            -ly,
            (rnd() - 0.5) * 0.7,
            rnd() * 6.3,
            (rnd() - 0.5) * 0.7,
            s,
            s,
            s,
          ),
        );
      }
      if (rnd() < 0.11) {
        const s = 0.8 + rnd() * 0.5;
        if (rnd() < 0.12) SPOTS.push({ x, y: groundHeight(x, y) + 0.3, z: -y, r: 0.5, n: 1 });
        flowers.push(
          mat(
            x,
            groundHeight(x, y) + 0.12 + rnd() * 0.12,
            -y,
            (rnd() - 0.5) * 0.6,
            rnd() * 6.3,
            (rnd() - 0.5) * 0.6,
            s,
            s,
            s,
          ),
        );
      }
    }
  };
  for (const [x, y] of FARM.pumpkins) {
    const a = rnd() < 0.5 ? 0 : Math.PI;
    grow(x, y, a + (rnd() - 0.5) * 0.8, 9 + ((rnd() * 9) | 0));
    grow(x, y, a + Math.PI + (rnd() - 0.5) * 0.8, 6 + ((rnd() * 8) | 0));
    if (rnd() < 0.5) grow(x, y, rnd() * 6.3, 5 + ((rnd() * 6) | 0));
  }
  // Extra runners filling the gaps between the rows.
  const xs = patch.map((p) => p[0]),
    ys = patch.map((p) => p[1]);
  for (let placed = 0, tries = 0; placed < 260 && tries < 4000; tries++) {
    const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs));
    const y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
    if (!inside(x, y, patch)) continue;
    grow(x, y, rnd() * 6.3, 10 + ((rnd() * 10) | 0));
    placed++;
  }
  const inst = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    at: THREE.Matrix4[],
    col?: () => THREE.Color,
  ) => {
    const im = new THREE.InstancedMesh(geo, m, at.length);
    at.forEach((mt, i) => {
      im.setMatrixAt(i, mt);
      if (col) im.setColorAt(i, col());
    });
    im.receiveShadow = true;
    return im;
  };
  g.add(
    inst(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x5b8a30, roughness: 0.9 }),
      segs,
    ),
  );
  // A broad five-lobed leaf, cupped a little.
  const leafShape = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 0.75 + 0.25 * Math.cos(a * 5) ** 2 - 0.25 * Math.max(0, Math.cos(a)) ** 12;
    const px = Math.cos(a) * r,
      pz = Math.sin(a) * r;
    i ? leafShape.lineTo(px, pz) : leafShape.moveTo(px, pz);
  }
  const leafGeo = new THREE.ShapeGeometry(leafShape, 3);
  leafGeo.rotateX(Math.PI / 2);
  const lp = leafGeo.attributes.position!;
  for (let i = 0; i < lp.count; i++) {
    const d = Math.hypot(lp.getX(i), lp.getZ(i));
    lp.setY(i, 0.18 * d * d);
  }
  leafGeo.computeVertexNormals();
  const leaf = inst(
    leafGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
    leaves,
    () => new THREE.Color().setHSL(0.26 + rnd() * 0.04, 0.5, 0.26 + rnd() * 0.1),
  );
  leaf.castShadow = true;
  g.add(windy(leaf, LEAF_FLUTTER, 'pumpkin-leaf'));
  // Yellow trumpet flowers, open to the sky.
  const fl = new THREE.ConeGeometry(0.05, 0.1, 7, 1, true);
  fl.rotateX(Math.PI);
  g.add(
    inst(
      fl,
      new THREE.MeshStandardMaterial({
        color: 0xf5c02a,
        roughness: 0.6,
        side: THREE.DoubleSide,
        emissive: 0x3a2a00,
      }),
      flowers,
    ),
  );
  return g;
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
    gourd: { geo: hornGeo(3.0, 1.4), flat: 1, at: [], col: [] } as Style,
    gooseneck: { geo: hornGeo(4.2, 2.4), flat: 1, at: [], col: [] } as Style,
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
    if (s !== S.gourd && s !== S.gooseneck) {
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
      const gr = 0.08 + (r - 0.35) * 0.25;
      put(rnd() < 0.7 ? S.gourd : S.gooseneck, x, y, h, gr, gourdCols[(rnd() * 4) | 0]!);
      continue;
    }
    // Sizes run from little pie pumpkins to big carvers.
    const rr = (0.13 + (r - 0.55) * 0.4) * (0.7 + rnd() * rnd() * 1.6);
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
    const deck = groundHeight(w.c[0], w.c[1]) + 1.01;
    const at = (lx: number, lz: number): XY => [
      w.c[0] + lx * Math.cos(a) - lz * Math.sin(a),
      w.c[1] + lx * Math.sin(a) + lz * Math.cos(a),
    ];
    const one = (lx: number, lz: number, base: number, rr: number) => {
      const [x, y] = at(lx, lz);
      if (rnd() < 0.82) put(S.field, x, y, base, rr, 0xe0661c, 0.1);
      else put(S.field, x, y, base, rr, 0xeeeadc, 0.05);
    };
    if (w.load >= 20) {
      // A big load stacked up in layers, each one nested into the gaps of the one below.
      const layers: [number, number, number, number][] = [
        // [columns, rows, spacing, height above the deck]
        [7, 3, 0.6, 0],
        [6, 2, 0.6, 0.3],
        [4, 1, 0.6, 0.56],
      ];
      for (const [nc, nr, sp, lift] of layers)
        for (let i = 0; i < nc; i++)
          for (let j = 0; j < nr; j++)
            one(
              (i - (nc - 1) / 2) * sp + (rnd() - 0.5) * 0.08,
              (j - (nr - 1) / 2) * 0.58 + (rnd() - 0.5) * 0.08,
              deck + lift,
              0.19 + rnd() * 0.05,
            );
    } else
      for (let i = 0; i < w.load; i++)
        one(-1.8 + rnd() * 3.6, (rnd() - 0.5) * 1.6, deck, 0.16 + rnd() * 0.08);
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
  g.add(pumpkinVines());
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
