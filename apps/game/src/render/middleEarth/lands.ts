import * as THREE from 'three';
import { DETAIL, MAT, foldedLathe, tube } from '../modelKit.ts';
import { ruins } from '../props/shire.ts';
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
  const r = ruins();
  r.scale.setScalar(0.85);
  r.position.set(
    F.weathertopKnoll.x,
    ctx.terrain.height(F.weathertopKnoll.x, F.weathertopKnoll.z) - 0.4,
    F.weathertopKnoll.z,
  );
  ctx.scene.add(r);
  return () => {};
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
  const spots: [number, number, number][] = [
    [-25, -42, 10],
    [10, -55, 30],
    [60, 46, 18],
    [120, -40, 6],
    [170, 38, 0],
    [200, -45, -4],
  ];
  for (const [ds, lat, up] of spots) {
    const p = at(ctx, s0 + ds, lat);
    const pv = pavilion();
    pv.position.copy(p).add(V(0, up * 0.2, 0));
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

/** One of the Pillars of the Kings: 45 m, left hand raised in warning, axe in the right. */
function king(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: tex.rock('#8a877e'), roughness: 1 });
  const S = 1;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 14), stone);
  plinth.position.y = 5;
  g.add(plinth);
  const robe = new THREE.Mesh(
    foldedLathe(
      [
        [6.5, 10],
        [5.6, 18],
        [4.6, 28],
        [5.2, 33],
        [3, 36],
      ],
      14,
      0.07,
      32,
    ),
    stone,
  );
  g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.6 * S, 18, 14), stone);
  head.position.y = 39;
  head.scale.set(0.9, 1.15, 1);
  g.add(head);
  // Crowned helm with cheek guards.
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 3.4, 18, 1, true), stone);
  helm.position.y = 40.8;
  const crest = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.5, 18), stone);
  crest.position.y = 44.6;
  g.add(helm, crest);
  for (let k = 0; k < 5; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 6), stone);
    const a = Math.PI * 0.2 + (k / 4) * Math.PI * 0.6;
    spike.position.set(Math.cos(a) * 2.4, 43.5, -Math.sin(a) * 2.4);
    g.add(spike);
  }
  // Left arm raised high, palm out.
  g.add(
    new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([
          V(-4, 33, 0),
          V(-6.5, 38, -1.5),
          V(-7, 46, -2.5),
          V(-7, 51, -3),
        ]),
        [
          { t: 0, w: 1.7, h: 1.7 },
          { t: 0.5, w: 1.3, h: 1.3 },
          { t: 1, w: 1.1, h: 1.1 },
        ],
        16,
        10,
        V(0, 0, -1),
      ),
      stone,
    ),
  );
  const palm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.8), stone);
  palm.position.set(-7, 53, -3.2);
  g.add(palm);
  // Right arm down, holding the great axe.
  g.add(
    new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([V(4, 33, 0), V(6, 27, -1), V(6.4, 21, -2)]),
        [
          { t: 0, w: 1.6, h: 1.6 },
          { t: 1, w: 1.1, h: 1.1 },
        ],
        12,
        10,
        V(0, 0, -1),
      ),
      stone,
    ),
  );
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 8), stone);
  haft.position.set(6.4, 21, -2.4);
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.8, 16, 1, false, 0, Math.PI),
    stone,
  );
  blade.rotation.z = Math.PI / 2;
  blade.position.set(6.4, 33, -2.4);
  g.add(haft, blade);
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
  for (const side of [-1, 1]) {
    const k = king();
    const p = tv(off(f, side * 34, 0));
    k.position.set(p.x, ctx.terrain.height(p.x, p.z) - 22, p.z);
    // Face upriver (toward the racers' approach), left hand raised.
    k.rotation.y = Math.atan2(-f.tan.x, -f.tan.z) + Math.PI;
    if (side > 0) k.scale.x = -1;
    scene.add(k);
  }
  // The Anduin in its gorge.
  const pts = F.anduin.map(([x, z]) => V(x, ctx.terrain.height(x, z) + 3, z));
  const river = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 18, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a7a8a, roughness: 0.08, metalness: 0.4 }),
  );
  river.scale.y = 0.1;
  river.position.y = pts[Math.floor(pts.length / 2)]!.y * 0.9;
  scene.add(river);
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
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 26), wood);
  body.position.y = 3;
  const roofGeo = new THREE.CylinderGeometry(0.01, 10, 7, 4, 1).rotateY(Math.PI / 4);
  roofGeo.scale(0.95, 1, 2.0);
  const roof = new THREE.Mesh(roofGeo, MAT.paint(0xd4a23a, 0.35, 0.8));
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
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 8), wood);
    walls.position.y = 1.5;
    const rf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 5.5, 4, 4, 1).rotateY(Math.PI / 4).scale(0.8, 1, 1.1),
      thatch,
    );
    rf.position.y = 5;
    house.add(walls, rf);
    house.position.set(x, terrain.height(x, z) - 0.3, z);
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
  for (let s = s0 - 30; s < L + 10; s += 14) {
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
      face.position.set(p.x + 2, f.pos.y - 0.75, p.z);
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
