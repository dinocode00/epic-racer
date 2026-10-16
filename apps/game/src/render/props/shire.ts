import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Frame, SHIRE_MARKS, type Track } from '@epic/sim';
import { DETAIL, MAT, foldedLathe } from '../modelKit.ts';
import * as tex from '../textures.ts';
import type { DressContext, Theme } from '../themes.ts';
import { off, tv } from '../trackMesh.ts';

/**
 * Shire Downs dressing: hobbit holes, the Party Tree, a stone bridge over the brook,
 * the watermill, the ruined watchtower, sheep, hay and bunting.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const HALF = 8; // half road width

// ---------- shared materials (created lazily so textures exist after boot) ----------
let M: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const stone = new THREE.MeshStandardMaterial({ map: tex.stoneBlocks(), roughness: 0.9 });
  const wall = new THREE.MeshStandardMaterial({ map: tex.stoneWall(), roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.8 });
  const thatch = new THREE.MeshStandardMaterial({ map: tex.thatch(), roughness: 1 });
  const turf = new THREE.MeshStandardMaterial({ map: tex.meadow(), roughness: 1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a23a, metalness: 1, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2b3a44,
    metalness: 0.6,
    roughness: 0.15,
    emissive: 0x3a2a10,
    emissiveIntensity: 0.4,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xf2efe6,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  return { stone, wall, wood, thatch, turf, brass, glass, white };
}
const mats = () => (M ??= makeMats());

/** Place an object on a frame: local +z faces `face` (1 = toward the road from the right side). */
function placeAt(o: THREE.Object3D, f: Frame, lateral: number, y: number, faceRoad = true): void {
  const p = off(f, lateral, 0);
  o.position.set(p.x, y, p.z);
  const toRoad = V(-f.right.x, 0, -f.right.z)
    .multiplyScalar(Math.sign(lateral) || 1)
    .normalize();
  if (faceRoad) o.rotation.y = Math.atan2(toRoad.x, toRoad.z);
}

// ---------------------------------------------------------------- hobbit hole

const DOOR_COLORS = [0x2f6b3a, 0xd9a83a, 0x2f5f9a, 0xa83a2f, 0x6a3a8a];

function hobbitHole(i: number): THREE.Group {
  const g = new THREE.Group();
  const m = mats();
  // Curved stone face set into the hill (local +z faces the road).
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 3.2, 28, 1, true, -0.75, 1.5),
    m.stone,
  );
  face.position.set(0, 1.6, -3.2);
  face.material = m.stone;
  g.add(face);
  const faceBack = new THREE.Mesh(
    new THREE.CylinderGeometry(4.0, 4.0, 3.2, 28, 1, true, -0.75, 1.5),
    m.stone,
  );
  faceBack.position.copy(face.position);
  (faceBack.material as THREE.Material).side = THREE.DoubleSide;
  g.add(faceBack);
  // Turf cap over the face.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    m.turf,
  );
  cap.scale.set(5.5, 2.2, 5.5);
  cap.position.set(0, 3.0, -4.2);
  g.add(cap);
  // Round door with a brass knob, in a timber frame.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 10, 32), m.wood);
  ring.position.set(0, 1.12, 1.0);
  g.add(ring);
  const door = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.12, 32),
    MAT.paint(DOOR_COLORS[i % DOOR_COLORS.length]!, 0.6, 0.05),
  );
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 1.12, 0.95);
  g.add(door);
  for (let k = -3; k <= 3; k++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 1.9 - Math.abs(k) * 0.12, 0.02),
      MAT.paint(0x111111, 0.9, 0),
    );
    plank.position.set(k * 0.27, 1.12, 1.02);
    g.add(plank);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), m.brass);
  knob.position.set(0, 1.12, 1.08);
  g.add(knob);
  // Round windows either side.
  for (const s of [-1, 1]) {
    const wf = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 24), m.wood);
    wf.position.set(s * 2.3, 1.5, 0.82 - Math.abs(s) * 0.3);
    wf.rotation.y = -s * 0.5;
    const pane = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), m.glass);
    pane.position.copy(wf.position);
    pane.rotation.y = -s * 0.5;
    g.add(wf, pane);
    for (const r of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.04), m.wood);
      bar.position.copy(wf.position);
      bar.rotation.set(0, -s * 0.5, r);
      g.add(bar);
    }
    // Flower box.
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.25), m.wood);
    box.position.set(s * 2.3, 0.95, 0.95 - Math.abs(s) * 0.3);
    box.rotation.y = -s * 0.5;
    g.add(box);
    for (let k = 0; k < 6; k++) {
      const fl = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 5),
        MAT.paint([0xe8433a, 0xf5c518, 0xf070b0, 0xffffff][(k + i) % 4]!, 0.8, 0),
      );
      fl.position.set(s * 2.3 + (k - 2.5) * 0.14, 1.1, 0.95 - Math.abs(s) * 0.3);
      g.add(fl);
    }
  }
  // Chimney poking out of the turf.
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 12), m.stone);
  chim.position.set(1.6, 5.0, -4.5);
  g.add(chim);
  // Garden gate posts and a path.
  const path = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), MAT.paint(0x9c8a6a, 1, 0));
  path.rotation.x = -Math.PI / 2;
  path.scale.set(0.8, 2.2, 1);
  path.position.set(0, 0.04, 2.6);
  g.add(path);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

// ---------------------------------------------------------------- Party Tree, tents, bunting

function partyTree(): THREE.Group {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({
    color: 0x5a4330,
    roughness: 1,
    bumpMap: tex.coatBump(),
    bumpScale: 3,
  });
  const trunk = new THREE.Mesh(
    foldedLathe(
      [
        [2.2, 0],
        [1.5, 1.5],
        [1.3, 6],
        [1.5, 9],
      ],
      9,
      0.18,
      24,
    ),
    bark,
  );
  g.add(trunk);
  // Big limbs.
  const limbs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([
      V(0, 7.5, 0),
      V(Math.cos(a) * 4, 10, Math.sin(a) * 4),
      V(Math.cos(a) * 9, 12 + (i % 3), Math.sin(a) * 9),
    ]);
    limbs.push(new THREE.TubeGeometry(c, 10, 0.6 - (i % 2) * 0.15, 8));
  }
  g.add(new THREE.Mesh(mergeGeometries(limbs)!, bark));
  // Canopy: many leafy clumps.
  const leaves = new THREE.MeshStandardMaterial({
    color: 0x4f8f3a,
    roughness: 0.9,
    flatShading: true,
  });
  const clumps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = tex.rnd() * Math.PI * 2,
      r = tex.rnd() * 11;
    clumps.push(
      new THREE.IcosahedronGeometry(3 + tex.rnd() * 2.5, 1).translate(
        Math.cos(a) * r,
        13 + tex.rnd() * 5 - r * 0.25,
        Math.sin(a) * r,
      ),
    );
  }
  g.add(new THREE.Mesh(mergeGeometries(clumps)!, leaves));
  // Paper lanterns hanging under the canopy.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2,
      r = 6 + (i % 3) * 2;
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      MAT.glow([0xffb347, 0xff6a4a, 0xfff27a][i % 3]!, 1.4),
    );
    lantern.position.set(Math.cos(a) * r, 9.5 + (i % 2), Math.sin(a) * r);
    g.add(lantern);
  }
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function tent(color: number): THREE.Group {
  const g = new THREE.Group();
  const stripe = tex.decal(
    (x, w, h) => {
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? '#f2efe6' : `#${color.toString(16).padStart(6, '0')}`;
        x.fillRect((i * w) / 8, 0, w / 8, h);
      }
    },
    128,
    32,
  );
  const cloth = new THREE.MeshStandardMaterial({
    map: stripe,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2.4, 24, 1, true), cloth);
  wall.position.y = 1.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 24, 1, true), cloth);
  roof.position.y = 3.7;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), mats().wood);
  pole.position.y = 3;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), MAT.paint(color, 0.8, 0));
  flag.position.set(0.4, 5.8, 0);
  (flag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(wall, roof, pole, flag);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

/** A sagging line of triangular flags between two points. */
function bunting(a: THREE.Vector3, b: THREE.Vector3, sag = 1.2): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(
    a,
    a
      .clone()
      .lerp(b, 0.5)
      .add(V(0, -sag * 2, 0)),
    b,
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 4), MAT.paint(0xeeeeee, 0.9, 0)));
  const n = Math.max(4, Math.round(a.distanceTo(b) / 1.1));
  const tri = new THREE.BufferGeometry().setFromPoints([
    V(-0.3, 0, 0),
    V(0.3, 0, 0),
    V(0, -0.6, 0),
  ]);
  tri.computeVertexNormals();
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    const t = curve.getTangent(i / n);
    const flag = new THREE.Mesh(
      tri,
      new THREE.MeshStandardMaterial({
        color: [0xe8433a, 0xf5c518, 0x2f7de1, 0x3fbf5f, 0xffffff][i % 5],
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    flag.position.copy(p);
    flag.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
    g.add(flag);
  }
  return g;
}

// ---------------------------------------------------------------- start arch

export function shireGantry(f: Frame): THREE.Group {
  const g = new THREE.Group();
  const m = mats();
  const hw = f.width / 2 + 1.4;
  const H = 7;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, H, 10), m.wood);
    post.position.copy(tv(off(f, hw * s, H / 2)));
    post.castShadow = true;
    g.add(post);
  }
  // Curved timber arch.
  const arch = new THREE.CatmullRomCurve3([
    tv(off(f, -hw, H - 0.3)),
    tv(off(f, 0, H + 1.8)),
    tv(off(f, hw, H - 0.3)),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(arch, 24, 0.3, 8), m.wood));
  // Hanging sign.
  const signTex = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#6b4a2e';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#3a2614';
      x.lineWidth = 8;
      x.strokeRect(4, 4, w - 8, h - 8);
      x.fillStyle = '#f5e2b0';
      x.font = 'bold 58px Georgia, serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('SHIRE DOWNS', w / 2, h / 2 + 2);
    },
    512,
    96,
  );
  const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.7, 0.2), [
    m.wood,
    m.wood,
    m.wood,
    m.wood,
    new THREE.MeshStandardMaterial({ map: signTex }),
    new THREE.MeshStandardMaterial({ map: signTex }),
  ]);
  sign.position.copy(tv(off(f, 0, H - 1.3)));
  sign.rotation.y = Math.atan2(-f.tan.x, -f.tan.z);
  sign.castShadow = true;
  g.add(sign);
  g.add(bunting(tv(off(f, -hw, H - 0.6)), tv(off(f, hw, H - 0.6)), 0.6));
  return g;
}

// ---------------------------------------------------------------- bridge, brook, mill

/** The brook crosses the track at the middle of the bridge straight. */
let brookCache: { track: Track; pts: [number, number][] } | null = null;
export function brookPath(track: Track): [number, number][] {
  if (brookCache?.track === track) return brookCache.pts;
  const s = (SHIRE_MARKS.bridgeStart! + SHIRE_MARKS.bridgeEnd!) / 2;
  const f = track.frameAtS(s);
  const ctrl: THREE.Vector3[] = [];
  for (let k = -12; k <= 12; k++) {
    const d = k * 28;
    // Meander, but run straight under the bridge.
    const wob = Math.abs(k) < 1 ? 0 : Math.sin(k * 0.7) * 12 + Math.sin(k * 0.23) * 20;
    ctrl.push(
      V(f.pos.x + f.right.x * d + f.tan.x * wob, 0, f.pos.z + f.right.z * d + f.tan.z * wob),
    );
  }
  const curve = new THREE.CatmullRomCurve3(ctrl);
  const n = Math.round(curve.getLength() / 4);
  const pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z] as [number, number]);
  brookCache = { track, pts };
  return pts;
}
export const bridgeS = () => (SHIRE_MARKS.bridgeStart! + SHIRE_MARKS.bridgeEnd!) / 2;
const BROOK = { width: 12, depth: 5.5 };

function bridgeArch(track: Track): THREE.Group {
  const g = new THREE.Group();
  const s0 = bridgeS();
  const f = track.frameAtS(s0);
  const L = 50;
  // Side elevation: a slab with three round arches, extruded across the road.
  const shape = new THREE.Shape();
  const D = 7; // depth of the arch springs below the deck
  shape.moveTo(-L / 2, 0);
  shape.lineTo(L / 2, 0);
  shape.lineTo(L / 2, -D);
  for (const [cx, r] of [
    [15, 3],
    [0, 4.6],
    [-15, 3],
  ] as const) {
    shape.lineTo(cx + r, -D);
    shape.absarc(cx, -D, r, 0, Math.PI, false);
  }
  shape.lineTo(-L / 2, -D);
  shape.closePath();
  const width = f.width + 1.4;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geo.translate(0, -0.05, -width / 2);
  // Map stone texture by world-ish coordinates.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  const mesh = new THREE.Mesh(geo, mats().stone);
  // Shape x runs along the road; extrude z across it.
  mesh.position.copy(tv(f.pos));
  // Right-handed basis: x along the road, y up, z across it (tan x up = right).
  const along = V(f.tan.x, 0, f.tan.z).normalize();
  const across = new THREE.Vector3().crossVectors(along, V(0, 1, 0));
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, V(0, 1, 0), across));
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function brookWater(track: Track, ctx: DressContext): THREE.Mesh {
  const pts = brookPath(track);
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const level = track.frameAtS(bridgeS()).pos.y - BROOK.depth + 1.4;
  let acc = 0;
  pts.forEach(([x, z], i) => {
    const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)]!;
    const [px, pz] = pts[Math.max(i - 1, 0)]!;
    const dx = nx - px,
      dz = nz - pz;
    const l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l,
      sz = dx / l;
    if (i > 0) acc += Math.hypot(x - pts[i - 1]![0], z - pts[i - 1]![1]);
    // Follow the land downstream but never above the bridge level.
    const ground = ctx.terrain.height(x, z);
    const y = Math.min(level, ground + 1.0);
    for (const s of [-1, 1]) {
      pos.push(x + sx * s * BROOK.width * 0.55, y, z + sz * s * BROOK.width * 0.55);
      uv.push(s > 0 ? 1 : 0, acc / 12);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const map = tex.water();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      map,
      color: 0x9fd0e6,
      roughness: 0.08,
      metalness: 0.3,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    }),
  );
  m.receiveShadow = true;
  m.userData.flow = map;
  return m;
}

function watermill(): { group: THREE.Group; wheel: THREE.Object3D } {
  const g = new THREE.Group();
  const m = mats();
  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), m.stone);
  base.position.y = 2;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 7), MAT.paint(0xe8dcc0, 0.95, 0));
  upper.position.y = 5.5;
  for (let k = -2; k <= 2; k++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 7.1), m.wood);
    beam.position.set(k * 2.2, 5.5, 0);
    g.add(beam);
  }
  const roofGeo = new THREE.CylinderGeometry(0.01, 6, 4.5, 4, 1).rotateY(Math.PI / 4);
  roofGeo.scale(1.15, 1, 0.95);
  const roof = new THREE.Mesh(roofGeo, m.thatch);
  roof.position.y = 9.2;
  g.add(base, upper, roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), MAT.paint(0x5a3a22, 0.8, 0));
  door.position.set(-2, 1.2, 3.55);
  g.add(door);
  // Wheel on the brook side (+x).
  const wheel = new THREE.Group();
  wheel.position.set(5.4, 3.2, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 32), m.wood);
  rim.rotation.y = Math.PI / 2;
  const rim2 = rim.clone();
  rim.position.x = -0.6;
  rim2.position.x = 0.6;
  wheel.add(rim, rim2);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.9), m.wood);
    paddle.position.set(0, Math.cos(a) * 3.2, Math.sin(a) * 3.2);
    paddle.rotation.x = a;
    wheel.add(paddle);
    if (k % 2 === 0) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.4, 0.12), m.wood);
      spoke.rotation.x = a;
      wheel.add(spoke);
    }
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.8, 10), m.wood);
  axle.rotation.z = Math.PI / 2;
  wheel.add(axle);
  g.add(wheel);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return { group: g, wheel };
}

// ---------------------------------------------------------------- watchtower ruins

export function towerCentre(track: Track): THREE.Vector3 {
  const arc = (42 * 110 * Math.PI) / 180;
  const f = track.frameAtS(SHIRE_MARKS.towerTurn! + arc / 2);
  return tv(off(f, 42, 0));
}

function ruins(): THREE.Group {
  const g = new THREE.Group();
  const m = mats();
  const blocks: THREE.BufferGeometry[] = [];
  const R = 11;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    if (i % 5 === 3) continue; // gaps in the ring
    const h = 1.5 + ((i * 7) % 5) * 1.3 + (i % 4 === 0 ? 4 : 0);
    const b = new THREE.BoxGeometry(2.4, h, 1.6);
    b.rotateY(-a);
    b.translate(Math.cos(a) * R, h / 2 - 0.3, Math.sin(a) * R);
    blocks.push(b);
  }
  // Fallen stones.
  for (let i = 0; i < 12; i++) {
    const a = tex.rnd() * Math.PI * 2,
      r = R + (tex.rnd() - 0.3) * 8;
    const b = new THREE.BoxGeometry(1 + tex.rnd(), 0.7 + tex.rnd() * 0.5, 0.8 + tex.rnd());
    b.rotateY(tex.rnd() * 3);
    b.rotateZ((tex.rnd() - 0.5) * 0.6);
    b.translate(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    blocks.push(b);
  }
  // A broken arch.
  const arch = new THREE.TorusGeometry(2.4, 0.6, 6, 12, Math.PI * 0.75);
  arch.translate(R - 0.5, 6.6, 0);
  blocks.push(arch.toNonIndexed());
  const mesh = new THREE.Mesh(
    mergeGeometries(blocks.map((b) => (b.index ? b.toNonIndexed() : b)))!,
    m.stone,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

// ---------------------------------------------------------------- farm life

function sheep(): THREE.Group {
  const g = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 1, flatShading: true });
  const dark = MAT.paint(0x26221f, 0.9, 0);
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), wool);
  body.scale.set(0.85, 0.75, 1.15);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), dark);
  head.scale.set(0.8, 0.9, 1.2);
  head.position.set(0, 1.15, -0.95);
  g.add(body, head);
  for (const [x, z] of [
    [-0.3, -0.5],
    [0.3, -0.5],
    [-0.3, 0.5],
    [0.3, 0.5],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 6), dark);
    leg.position.set(x, 0.3, z);
    g.add(leg);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

function hayBale(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 20), mats().thatch);
  m.rotation.z = Math.PI / 2;
  m.position.y = 0.8;
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- theme

const villageSpots = (track: Track) => {
  const out: { s: number; lat: number }[] = [];
  const a = SHIRE_MARKS.villageStart!,
    b = SHIRE_MARKS.villageEnd!;
  let i = 0;
  for (let s = a + 6; s < b - 4; s += 24) {
    out.push({ s, lat: (i % 2 ? 1 : -1) * (HALF + 5.5) });
    i++;
  }
  void track;
  return out;
};

const partySpot = (track: Track) => tv(off(track.frameAtS(45), 40, 0));
const millSpot = (track: Track) => {
  const pts = brookPath(track);
  const i = Math.round(pts.length * 0.62);
  const [x, z] = pts[i]!;
  const [x2, z2] = pts[i + 1]!;
  const d = V(x2 - x, 0, z2 - z).normalize();
  return { pos: V(x, 0, z).add(V(-d.z, 0, d.x).multiplyScalar(13)), dir: d };
};

export const SHIRE_THEME: Theme = {
  sky: { top: 0x4a8fe0, horizon: 0xe4efe6 },
  fog: { color: 0xdfe9e0, near: 220, far: 1900 },
  sunDir: new THREE.Vector3(0.55, 0.7, -0.2).normalize(),
  sunColor: 0xfff0cf,
  sunIntensity: 3.0,
  hemi: { sky: 0xd6e8ff, ground: 0x5a7038, intensity: 1.15 },
  terrain: (track) => {
    const villageMounds = villageSpots(track).map(({ s, lat }) => {
      const f = track.frameAtS(s);
      const p = off(f, lat + Math.sign(lat) * 9, 0);
      return { x: p.x, z: p.z, r: 13, h: 6 };
    });
    const tc = towerCentre(track);
    return {
      hillAmp: 34,
      hillScale: 110,
      mountainStart: 520,
      mountainAmp: 260,
      carves: [{ pts: brookPath(track), ...BROOK }],
      mounds: [...villageMounds, { x: tc.x, z: tc.z, r: 32, h: 9 }],
    };
  },
  terrainLook: { grass: tex.meadow, shoulder: new THREE.Color(1.15, 1.0, 0.75) },
  road: () => ({
    road: tex.dirtLane,
    roadTile: 10,
    roadRoughness: 1,
    underside: tex.dirt,
    barrier: { map: tex.stoneWall, height: 0.85, thickness: 0.7, tile: 3.4, mirrorRight: false },
    kerbs: false,
    gantry: shireGantry,
    bridges: [[bridgeS() - 25, bridgeS() + 25]],
    padColor: 0x9fe07a,
  }),
  foliage: { count: 1500, pineShare: 0.15 },
  keepOut: (track) => {
    const brook = brookPath(track);
    const tc = towerCentre(track);
    const party = partySpot(track);
    const mill = millSpot(track).pos;
    const holes = villageSpots(track).map(({ s, lat }) => tv(off(track.frameAtS(s), lat, 0)));
    return (x, z) => {
      const p = V(x, 0, z);
      if (Math.hypot(x - tc.x, z - tc.z) < 22) return true;
      if (p.distanceTo(V(party.x, 0, party.z)) < 30) return true;
      if (p.distanceTo(V(mill.x, 0, mill.z)) < 14) return true;
      if (holes.some((h) => p.distanceTo(V(h.x, 0, h.z)) < 9)) return true;
      return brook.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 14);
    };
  },
  grandstand: false,
  clouds: true,
  dress: (ctx) => {
    const { scene, track, terrain } = ctx;
    // Hobbit holes along the village lane.
    villageSpots(track).forEach(({ s, lat }, i) => {
      const f = track.frameAtS(s);
      const hole = hobbitHole(i);
      hole.scale.setScalar(1.25);
      placeAt(hole, f, lat, f.pos.y - 0.25);
      scene.add(hole);
    });
    // Party Tree, tents and bunting on the village green.
    const pt = partySpot(track);
    const tree = partyTree();
    tree.position.set(pt.x, terrain.height(pt.x, pt.z) - 0.3, pt.z);
    scene.add(tree);
    [0xe8433a, 0x2f7de1, 0x3fbf5f].forEach((c, i) => {
      const f = track.frameAtS(15 + i * 28);
      const t = tent(c);
      const p = off(f, -(HALF + 20 + (i % 2) * 6), 0);
      t.position.set(p.x, terrain.height(p.x, p.z) - 0.2, p.z);
      scene.add(t);
    });
    for (let s = -40; s < 100; s += 14) {
      const f = track.frameAtS(s);
      for (const side of [-1, 1]) {
        const a = tv(off(f, side * (HALF + 1.6), 4.2));
        const b = tv(off(track.frameAtS(s + 14), side * (HALF + 1.6), 4.2));
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6), mats().wood);
        pole.position.copy(a).add(V(0, -2.2, 0));
        scene.add(pole, bunting(a, b, 0.5));
      }
    }
    // Bridge, brook and mill.
    scene.add(bridgeArch(track));
    const water = brookWater(track, ctx);
    scene.add(water);
    const ms = millSpot(track);
    const mill = watermill();
    mill.group.position.set(ms.pos.x, terrain.height(ms.pos.x, ms.pos.z) - 0.5, ms.pos.z);
    mill.group.rotation.y = Math.atan2(ms.dir.x, ms.dir.z) + Math.PI / 2;
    scene.add(mill.group);
    // Watchtower ruins on their hill.
    const tc = towerCentre(track);
    const r = ruins();
    r.position.set(tc.x, terrain.height(tc.x, tc.z) - 0.2, tc.z);
    scene.add(r);
    // Sheep and hay in the fields outside the closing curve.
    for (let i = 0; i < 26; i++) {
      const f = track.frameAtS(SHIRE_MARKS.closing! + 40 + i * 9);
      const p = off(f, -(HALF + 14 + ((i * 37) % 60)), 0);
      const sh = i % 5 === 0 ? hayBale() : sheep();
      sh.position.set(
        p.x,
        terrain.height(p.x, p.z) - 0.1 + (sh instanceof THREE.Mesh ? sh.position.y : 0),
        p.z,
      );
      sh.rotation.y = i * 1.7;
      scene.add(sh);
    }
    void DETAIL;
    return (t: number, dt: number) => {
      mill.wheel.rotation.x -= dt * 0.8;
      (water.userData.flow as THREE.Texture).offset.y -= dt * 0.08;
      void t;
    };
  },
};
