import * as THREE from 'three';
import { DETAIL, MAT, foldedLathe, tube } from '../modelKit.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as tex from '../textures.ts';
import type { DressContext } from '../themes.ts';
import { off, tv } from '../trackMesh.ts';
import { features } from './theme.ts';

/** Weathertop, Rivendell, Lothlórien, the Argonath, Rohan and the Dead Marshes. */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Hook = (t: number, dt: number) => void;

export function dressLands(ctx: DressContext): Hook {
  const hooks: Hook[] = [
    weathertop(ctx),
    rivendell(ctx),
    lorien(ctx),
    argonath(ctx),
    rohan(ctx),
    marshes(ctx),
  ];
  return (t, dt) => hooks.forEach((h) => h(t, dt));
}

const at = (ctx: DressContext, s: number, lat: number) => {
  const p = off(ctx.track.frameAtS(s), lat, 0);
  return V(p.x, ctx.terrain.height(p.x, p.z), p.z);
};
const facingRoad = (ctx: DressContext, s: number, lat: number) => {
  const f = ctx.track.frameAtS(s);
  const to = V(-f.right.x, 0, -f.right.z).multiplyScalar(Math.sign(lat) || 1);
  return Math.atan2(to.x, to.z);
};

// ---------------------------------------------------------------- Weathertop

function weathertop(ctx: DressContext): Hook {
  const F = features(ctx.track);
  const { x, z } = F.weathertopKnoll;
  const y0 = ctx.terrain.height(x, z);
  const r = amonSul((dx, dz) => ctx.terrain.height(x + dx, z + dz) - y0);
  r.position.set(x, y0, z);
  ctx.scene.add(r);
  return () => {};
}

/**
 * The watchtower of Amon Sûl: a ring of broken pillars and arches around a cracked floor,
 * one tall shard of the old tower wall still standing.
 */
function amonSul(rise: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: tex.rock('#8e8a80'), roughness: 1 });
  const parts: THREE.BufferGeometry[] = [];
  const R = 7,
    N = 14;
  const height = (i: number) =>
    [7.5, 6.8, 7.5, 4.2, 7.5, 7.5, 2.4, 7.5, 6.1, 7.5, 7.5, 3.3, 7.5, 5][i]!;
  const pillarAt = (i: number) => {
    const a = (i / N) * Math.PI * 2;
    return { a, x: Math.cos(a) * R, z: Math.sin(a) * R };
  };
  for (let i = 0; i < N; i++) {
    const { a, x, z } = pillarAt(i);
    // Footings run deep so no pillar floats on the slope of the crown.
    const y = rise(x, z) - 4;
    const h = height(i) + 2.5;
    parts.push(new THREE.BoxGeometry(0.9, h + 4, 1.1).rotateY(-a).translate(x, y + (h + 4) / 2, z));
    parts.push(new THREE.BoxGeometry(1.5, 0.5, 1.7).rotateY(-a).translate(x, y + 4.2, z)); // plinth
    // Arch to the next pillar when both still stand tall.
    const j = (i + 1) % N;
    if (height(i) > 7 && height(j) > 7) {
      const q = pillarAt(j);
      const chord = Math.hypot(q.x - x, q.z - z);
      const arch = new THREE.TorusGeometry(chord / 2, 0.55, 6, 14, Math.PI)
        .scale(1, 0.8, 1.6)
        .rotateY(-Math.atan2(q.z - z, q.x - x))
        .translate((x + q.x) / 2, y + 4 + h, (z + q.z) / 2);
      parts.push(arch);
    }
  }
  // Cracked floor slabs and the last shard of the tower wall.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.3,
      rr = 2 + (k % 3) * 1.8;
    const x = Math.cos(a) * rr,
      z = Math.sin(a) * rr;
    parts.push(
      new THREE.BoxGeometry(2.6, 1.2, 2.2)
        .rotateY(a)
        .rotateZ((k % 2 ? 1 : -1) * 0.06)
        .translate(x, rise(x, z) - 0.35, z),
    );
  }
  parts.push(
    new THREE.BoxGeometry(3.5, 13, 1.4).rotateY(0.6).translate(-2, rise(-2, -2.5) + 4, -2.5),
  );
  // Fallen blocks down the slope.
  for (let k = 0; k < 16; k++) {
    const a = tex.rnd() * Math.PI * 2,
      rr = R + 1 + tex.rnd() * 3.5;
    const x = Math.cos(a) * rr,
      z = Math.sin(a) * rr;
    parts.push(
      new THREE.BoxGeometry(1 + tex.rnd() * 1.4, 0.7 + tex.rnd() * 0.6, 0.9 + tex.rnd())
        .rotateY(tex.rnd() * 3)
        .rotateZ((tex.rnd() - 0.5) * 0.7)
        .translate(x, rise(x, z) + 0.2, z),
    );
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!,
    stone,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

// ---------------------------------------------------------------- Rivendell

function pavilion(): THREE.Group {
  const g = new THREE.Group();
  const marble = MAT.paint(0xf2ede0, 0.5, 0.05);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 1, 24), marble);
  floor.position.y = 0.5;
  g.add(floor);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7, 10), marble);
    col.position.set(Math.cos(a) * 6.2, 4.5, Math.sin(a) * 6.2);
    g.add(col);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.3, 0.4, 8, 32), marble);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 8.1;
  g.add(ring);
  // Leaf-pointed dome.
  const dome = new THREE.Mesh(
    foldedLathe(
      [
        [6.6, 0],
        [6, 1.6],
        [4.4, 3.2],
        [2.2, 4.4],
        [0.6, 5.2],
        [0, 6],
      ],
      10,
      0.05,
      40,
    ),
    MAT.paint(0xd9c48a, 0.4, 0.3),
  );
  dome.position.y = 8.3;
  g.add(dome);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function rivendell(ctx: DressContext): Hook {
  const { track, scene } = ctx;
  const m = track.def.marks ?? {};
  const s0 = m.rivendellBridge ?? 1096;
  // Pavilions on the gorge rims either side of the bridge, and one at each end.
  const spots: [number, number][] = [
    [-30, -26],
    [-12, 30],
    [160, -28],
    [178, 27],
    [-50, 24],
    [205, -30],
  ];
  for (const [ds, lat] of spots) {
    const p = at(ctx, s0 + ds, lat);
    const pv = pavilion();
    pv.scale.setScalar(1.35);
    pv.position.copy(p).add(V(0, -0.5, 0));
    scene.add(pv);
  }
  // Waterfalls pouring into the gorge on both sides of the bridge.
  const fallTex = tex.water();
  fallTex.repeat.set(1, 3);
  const fallMat = new THREE.MeshBasicMaterial({
    map: fallTex,
    color: 0xeaf6ff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fm = track.frameAtS(s0 + 70);
  for (const [side, dz] of [
    [-1, -20],
    [1, 25],
    [-1, 40],
  ] as const) {
    const top = tv(off(fm, side * 50, 25)).addScaledVector(tv(fm.tan), dz);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 70), fallMat);
    fall.position.copy(top).add(V(0, -35, 0));
    fall.lookAt(fall.position.clone().add(tv(fm.right).multiplyScalar(-side)));
    scene.add(fall);
  }
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 400),
    new THREE.MeshStandardMaterial({ color: 0x8fc6d8, roughness: 0.1, metalness: 0.3 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = Math.atan2(fm.right.x, fm.right.z);
  river.position.copy(tv(fm.pos)).add(V(0, -44, 0));
  scene.add(river);
  return (_t, dt) => {
    fallTex.offset.y += dt * 1.2;
  };
}

// ---------------------------------------------------------------- Lothlórien

function lorien(ctx: DressContext): Hook {
  const { track, scene } = ctx;
  const haz = (track.def.hazards ?? []).filter((h) => h.kind === 'mallorn');
  const wood = MAT.paint(0xd8d0c0, 0.6, 0.1);
  for (const h of haz) {
    const p = tv(off(track.frameAtS(h.s), h.lat, 0));
    const flet = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.5, 6, 24), wood);
    flet.rotation.x = Math.PI / 2;
    flet.position.copy(p).add(V(0, 18, 0));
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.4, 24, 1, true), wood);
    deck.position.copy(flet.position);
    scene.add(flet, deck);
  }
  // Pale blue elven lanterns along the path.
  const m = track.def.marks ?? {};
  for (let s = (m.mallorns ?? 2150) - 40; s < (m.argonath ?? 2514) - 20; s += 18) {
    for (const side of [-1, 1]) {
      const p = tv(off(track.frameAtS(s), side * 9.5, 0));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), wood);
      post.position.copy(p).add(V(0, 1.2, 0));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), MAT.glow(0xcfe6ff, 3));
      lamp.position.copy(p).add(V(0, 2.5, 0));
      scene.add(post, lamp);
    }
  }
  return () => {};
}

// ---------------------------------------------------------------- the Argonath

/**
 * One of the Pillars of the Kings (≈60 m with plinth), facing +z: left hand raised palm-out
 * in warning, the right gripping a great axe. Both kings are carved alike.
 */
function king(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: tex.rock('#8a877e'), roughness: 1 });
  stone.map!.repeat.set(2, 3);
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, stone);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // Weathered plinth rising out of the river.
  add(new THREE.BoxGeometry(17, 14, 15), 0, 7);
  add(new THREE.BoxGeometry(15, 2, 13), 0, 15);
  // Robed body (folds), belt, chest.
  add(
    foldedLathe(
      [
        [6.8, 16],
        [6.0, 24],
        [5.2, 31],
        [5.0, 34],
        [5.8, 40],
        [5.4, 44],
        [3.2, 46.5],
      ],
      14,
      0.08,
      32,
    ),
  );
  add(new THREE.CylinderGeometry(5.3, 5.3, 1.2, 24), 0, 33.2);
  // Shoulders.
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(2.6, 14, 10), sx * 5.2, 44.2);
  // Head: face, beard, crowned helm with cheek guards.
  const head = add(new THREE.SphereGeometry(2.7, 18, 14), 0, 49.5, 0.2);
  head.scale.set(0.9, 1.15, 1);
  add(new THREE.ConeGeometry(2.0, 4.2, 12), 0, 46.6, 1.4).rotation.x = Math.PI;
  add(new THREE.BoxGeometry(1.0, 1.6, 0.9), 0, 49.6, 2.6); // nose
  add(new THREE.BoxGeometry(3.6, 0.5, 0.8), 0, 50.5, 2.4); // brow
  add(new THREE.CylinderGeometry(2.8, 3.0, 3.8, 18, 1, true), 0, 51.6);
  add(new THREE.ConeGeometry(2.8, 5.5, 18), 0, 56.1);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.6, 3.4, 2.6), sx * 2.6, 49.4, 0.8);
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * 0.15 + (k / 6) * Math.PI * 0.7;
    const spike = add(
      new THREE.ConeGeometry(0.45, 3.0, 6),
      Math.cos(a) * 2.7,
      54.4,
      Math.sin(a) * 2.7,
    );
    spike.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
  }
  // Left arm (+x when facing +z) raised up and forward, palm out toward travellers.
  add(
    tube(
      new THREE.CatmullRomCurve3([
        V(5.4, 44, 0),
        V(7.4, 48, 1.8),
        V(8.2, 54, 3.2),
        V(8.4, 59, 3.8),
      ]),
      [
        { t: 0, w: 2.3, h: 2.3 },
        { t: 0.45, w: 1.8, h: 1.8 },
        { t: 1, w: 1.3, h: 1.3 },
      ],
      16,
      10,
      V(0, 0, 1),
    ),
  );
  add(new THREE.BoxGeometry(3.0, 3.6, 0.9), 8.4, 61.2, 3.9);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.6, 2.4, 0.7), 7.3 + k * 0.72, 64.2, 3.9);
  add(new THREE.BoxGeometry(0.7, 2.0, 0.7), 10.3, 60.8, 3.9).rotation.z = -0.7; // thumb
  // Right arm (-x) at the side, fist forward around the axe haft.
  add(
    tube(
      new THREE.CatmullRomCurve3([V(-5.4, 44, 0), V(-7, 38, 0.8), V(-7.2, 32, 3.2)]),
      [
        { t: 0, w: 2.3, h: 2.3 },
        { t: 1, w: 1.5, h: 1.5 },
      ],
      12,
      10,
      V(0, 0, 1),
    ),
  );
  add(new THREE.SphereGeometry(1.4, 10, 8), -7.2, 31.5, 3.6);
  add(new THREE.CylinderGeometry(0.55, 0.55, 30, 8), -7.2, 31, 3.8);
  // Crescent axe head near the top of the haft.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -1.2);
  bladeShape.quadraticCurveTo(3.5, -3.5, 4.6, -4.2);
  bladeShape.quadraticCurveTo(3.4, 0, 4.6, 4.2);
  bladeShape.quadraticCurveTo(3.5, 3.5, 0, 1.2);
  bladeShape.closePath();
  const blade = add(
    new THREE.ExtrudeGeometry(bladeShape, { depth: 0.6, bevelEnabled: false }).translate(
      0,
      0,
      -0.3,
    ),
    -7.2,
    43,
    3.8,
  );
  blade.rotation.y = Math.PI / 2;
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function argonath(ctx: DressContext): Hook {
  const { track, scene } = ctx;
  const F = features(track);
  const [g0, g1] = (track.def.gaps ?? []).find(([a]) => a > (track.def.marks?.anduinJump ?? 0)) ?? [
    0, 0,
  ];
  const mid = (g0 + g1) / 2;
  const f = track.frameAtS(mid);
  // The Anduin in its gorge.
  const pts = F.anduin.map(([x, z]) => V(x, ctx.terrain.height(x, z) + 3, z));
  const water = pts[Math.floor(pts.length / 2)]!.y;
  const river = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 18, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a7a8a, roughness: 0.08, metalness: 0.4 }),
  );
  river.scale.y = 0.1;
  river.position.y = water * 0.9;
  scene.add(river);
  // The kings stand in the river either side of the jump, facing the racers' approach.
  for (const side of [-1, 1]) {
    const k = king();
    const p = tv(off(f, side * 27, 0));
    k.position.set(p.x, water - 4, p.z);
    k.rotation.y = Math.atan2(-f.tan.x, -f.tan.z);
    scene.add(k);
  }
  return () => {};
}

// ---------------------------------------------------------------- Rohan: Edoras

function rohan(ctx: DressContext): Hook {
  const { scene, terrain } = ctx;
  const F = features(ctx.track);
  const c = V(F.edorasHill.x, terrain.height(F.edorasHill.x, F.edorasHill.z), F.edorasHill.z);
  const thatch = new THREE.MeshStandardMaterial({ map: tex.thatch(), roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.85 });
  // Meduseld, the golden hall.
  const hall = new THREE.Group();
  // Walls run well below the hilltop so the long hall never floats where the hill falls away.
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 26), wood);
  body.position.y = -1;
  const stone = new THREE.MeshStandardMaterial({ map: tex.rock('#9a958a'), roughness: 1 });
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 34), stone);
  terrace.position.y = -4.6;
  hall.add(terrace);
  // Steep gabled roof running the length of the hall.
  const gable = new THREE.Shape();
  gable.moveTo(-8, 0);
  gable.lineTo(0, 7.5);
  gable.lineTo(8, 0);
  gable.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(gable, { depth: 28, bevelEnabled: false }).translate(
    0,
    -3.5,
    -14,
  );
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe0b040,
    roughness: 0.4,
    metalness: 0.35,
    emissive: 0x3a2806,
  });
  const roof = new THREE.Mesh(roofGeo, gold);
  // Gilded crossed gable horns at both ends.
  for (const e of [-1, 1])
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), gold);
      horn.position.set(sx * 1.1, 14.3, e * 13.8);
      horn.rotation.z = sx * 0.6;
      hall.add(horn);
    }
  roof.position.y = 9.5;
  hall.add(body, roof);
  hall.position.copy(c).add(V(0, -0.5, 0));
  scene.add(hall);
  // Houses spiralling down the hill and a palisade.
  for (let k = 0; k < 16; k++) {
    const a = k * 0.9;
    const r = 18 + (k % 4) * 9;
    const x = c.x + Math.cos(a) * r,
      z = c.z + Math.sin(a) * r;
    const house = new THREE.Group();
    // Tall walls sunk into the slope so no corner floats.
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 8), wood);
    walls.position.y = 0;
    const rf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 5.5, 4, 4, 1).rotateY(Math.PI / 4).scale(0.8, 1, 1.1),
      thatch,
    );
    rf.position.y = 5;
    house.add(walls, rf);
    const ground = Math.min(
      ...[-5, 5].flatMap((dx) => [-5, 5].map((dz) => terrain.height(x + dx, z + dz))),
    );
    house.position.set(x, ground, z);
    house.rotation.y = -a;
    scene.add(house);
  }
  const stakes: THREE.Matrix4[] = [];
  for (let k = 0; k < 140; k++) {
    const a = (k / 140) * Math.PI * 2;
    const x = c.x + Math.cos(a) * 56,
      z = c.z + Math.sin(a) * 56;
    stakes.push(new THREE.Matrix4().makeTranslation(x, terrain.height(x, z) + 2.5, z));
  }
  const pim = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.4, 0.4, 6, 6),
    wood,
    stakes.length,
  );
  stakes.forEach((m, i) => pim.setMatrixAt(i, m));
  scene.add(pim);
  // Banners of the white horse on green.
  const horseBanner = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#2f5a2a';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#f2efe6';
      x.beginPath();
      x.moveTo(w * 0.25, h * 0.7);
      x.quadraticCurveTo(w * 0.35, h * 0.4, w * 0.55, h * 0.45);
      x.lineTo(w * 0.72, h * 0.3);
      x.lineTo(w * 0.7, h * 0.42);
      x.quadraticCurveTo(w * 0.8, h * 0.6, w * 0.65, h * 0.72);
      x.closePath();
      x.fill();
    },
    128,
    256,
  );
  const m = ctx.track.def.marks ?? {};
  for (let i = 0; i < 6; i++) {
    const s = (m.edoras ?? 2812) + i * 25;
    for (const side of [-1, 1]) {
      const p = tv(off(ctx.track.frameAtS(s), side * 10, 0));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), wood);
      pole.position.copy(p).add(V(0, 3.5, 0));
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2.8),
        new THREE.MeshStandardMaterial({ map: horseBanner, side: THREE.DoubleSide }),
      );
      flag.position.copy(p).add(V(0, 5.4, 0));
      flag.rotation.y = facingRoad(ctx, s, side) + Math.PI / 2;
      scene.add(pole, flag);
    }
  }
  return () => {};
}

// ---------------------------------------------------------------- the Dead Marshes

function marshes(ctx: DressContext): Hook {
  const { track, scene } = ctx;
  const m = track.def.marks ?? {};
  const s0 = m.deadMarshes ?? 4243;
  const L = track.length;
  const water = new THREE.MeshStandardMaterial({
    color: 0x3a463a,
    roughness: 0.05,
    metalness: 0.5,
    transparent: true,
    opacity: 0.85,
  });
  const candles: THREE.Mesh[] = [];
  const faceTex = tex.decal((x, w, h) => {
    x.fillStyle = 'rgba(0,0,0,0)';
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(200,215,200,0.55)';
    x.beginPath();
    x.ellipse(w / 2, h / 2, w * 0.32, h * 0.42, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(30,40,30,0.8)';
    for (const dx of [-0.12, 0.12]) {
      x.beginPath();
      x.ellipse(w / 2 + dx * w, h * 0.42, w * 0.06, h * 0.05, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.beginPath();
    x.ellipse(w / 2, h * 0.66, w * 0.08, h * 0.04, 0, 0, Math.PI * 2);
    x.fill();
  });
  // Pools stop where Hobbiton's party field takes over again before the grid.
  const s1 = (track.def.regions ?? []).find(([id, rs]) => id === 'hobbiton' && rs > s0)?.[1] ?? L;
  for (let s = s0 - 30; s < s1 - 5; s += 14) {
    for (const side of [-1, 1]) {
      const f = track.frameAtS(s);
      const p = tv(off(f, side * (16 + ((s * 7) % 12)), 0));
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9 + ((s * 3) % 6), 18), water);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(p.x, f.pos.y - 0.6, p.z);
      scene.add(pool);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.8),
        new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }),
      );
      face.rotation.x = -Math.PI / 2;
      face.position.set(p.x + 2, f.pos.y - 0.55, p.z); // pale faces just under the surface sheen
      scene.add(face);
      const candle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), MAT.glow(0xbfffd0, 2.5));
      candle.position.set(p.x - 2, f.pos.y + 0.2, p.z + 1);
      scene.add(candle);
      candles.push(candle);
    }
  }
  // Gollum, crouched on a rock by the causeway.
  {
    const p = at(ctx, s0 + 30, 11);
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), MAT.paint(0x4a4a40, 1, 0));
    rock.position.y = 0.6;
    const skin = MAT.paint(0xb8b090, 0.6, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), skin);
    body.scale.set(0.8, 0.9, 1.1);
    body.position.y = 2.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), skin);
    head.position.set(0, 2.5, -0.3);
    const eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), MAT.glow(0x9ad0ff, 1.5));
      e.position.set(s * 0.12, 2.56, -0.55);
      return e;
    });
    g.add(rock, body, head, ...eyes);
    for (const s of [-1, 1]) {
      g.add(
        new THREE.Mesh(
          tube(
            new THREE.CatmullRomCurve3([
              V(s * 0.25, 2.2, -0.1),
              V(s * 0.5, 1.7, -0.4),
              V(s * 0.35, 1.5, -0.6),
            ]),
            [
              { t: 0, w: 0.07, h: 0.07 },
              { t: 1, w: 0.05, h: 0.05 },
            ],
            8,
            6,
            V(0, 0, -1),
          ),
          skin,
        ),
      );
    }
    g.position.copy(p);
    g.rotation.y = facingRoad(ctx, s0 + 30, 11);
    scene.add(g);
  }
  void DETAIL;
  return (t) => candles.forEach((c, i) => (c.position.y += Math.sin(t * 2 + i) * 0.003));
}
