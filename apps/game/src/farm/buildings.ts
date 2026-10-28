import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as tex from '../render/textures.ts';
import { FARM, RAMP_RISE, type RectDef, type XY, groundHeight, mid } from './layout.ts';

/**
 * Farm buildings and yard objects, modelled in real metres from the blueprint and the
 * owner's descriptions (and, for the farmhouse, a photo). Each builder works in a local frame
 * where +x runs along the farm grid's "north" (the barn's length) and -z faces "west" (the
 * barn's ramp side); `place` turns that frame to the map angle and sets it on the ground.
 */

const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- materials

let M: ReturnType<typeof makeMats> | null = null;
const mats = () => (M ??= makeMats());

function canvasTex(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D) => void,
  tile: number,
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.repeat.set(1 / tile, 1 / tile); // UVs are in metres
  return t;
}

function makeMats() {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  // White horizontal lap siding (farmhouse).
  const siding = canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#f1f0ea';
      x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = '#d3d2cb';
        x.fillRect(0, i * 32 + 28, 256, 4);
        x.fillStyle = '#fbfaf5';
        x.fillRect(0, i * 32, 256, 3);
      }
    },
    2,
  );
  // Barn-red vertical boards with battens.
  const boards = canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#a5312a';
      x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = 'rgba(70,10,8,0.45)';
        x.fillRect(i * 32, 0, 4, 256);
        x.fillStyle = 'rgba(255,200,190,0.08)';
        x.fillRect(i * 32 + 6, 0, 20, 256);
      }
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(60,0,0,0.12)' : 'rgba(255,220,210,0.06)';
        x.fillRect(Math.random() * 256, Math.random() * 256, 1, 6 + Math.random() * 14);
      }
    },
    2,
  );
  // Dark charcoal asphalt shingles.
  const shingle = canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#2e3033';
      x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 12; r++) {
        const off = r % 2 ? 16 : 0;
        for (let c = -1; c < 9; c++) {
          const v = 38 + ((Math.random() * 18) | 0);
          x.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
          x.fillRect(c * 32 + off + 1, r * 21.3 + 1, 30, 19);
        }
        x.fillStyle = '#1f2123';
        x.fillRect(0, r * 21.3, 256, 2);
      }
    },
    1.6,
  );
  const stoneMap = tex.stoneWall();
  stoneMap.repeat.set(1 / 2.2, 1 / 2.2);
  const asphaltMap = canvasTex(
    128,
    128,
    (x) => {
      x.fillStyle = '#2f3033';
      x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2600; i++) {
        const v = 34 + ((Math.random() * 30) | 0);
        x.fillStyle = `rgb(${v},${v},${v + 2})`;
        x.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
      }
    },
    1.5,
  );
  const planks = tex.planks();
  planks.repeat.set(1 / 1.6, 1 / 1.6);
  return {
    siding: std({ map: siding, roughness: 0.75 }),
    boards: std({ map: boards, roughness: 0.85 }),
    shingle: std({ map: shingle, roughness: 0.95 }),
    stone: std({ map: stoneMap, roughness: 0.95 }),
    asphalt: std({ map: asphaltMap, roughness: 0.9 }),
    wood: std({ map: planks, roughness: 0.85 }),
    trimWhite: std({ color: 0xf6f4ee, roughness: 0.6 }),
    trimBlue: std({ color: 0x7d95ab, roughness: 0.6 }),
    red: std({ color: 0xa5312a, roughness: 0.8 }),
    glass: std({ color: 0x24323c, metalness: 0.5, roughness: 0.15, envMapIntensity: 1.2 }),
    plexi: std({
      color: 0xe8f6ff,
      roughness: 0.08,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    alu: std({ color: 0xcfd4d8, metalness: 0.85, roughness: 0.32 }),
    galv: std({ color: 0xb6bdc2, metalness: 0.8, roughness: 0.42 }),
    rust: std({ color: 0x8a4a22, metalness: 0.3, roughness: 0.95 }),
    black: std({ color: 0x1c1d1f, roughness: 0.7 }),
    brick: std({ color: 0xc7a46c, roughness: 0.9 }),
    concrete: std({ color: 0xc9c6bd, roughness: 0.95 }),
    carpet: std({ color: 0x232426, roughness: 1 }),
    blueCover: std({ color: 0x3f7fd0, roughness: 0.5 }),
    sand: std({ color: 0xe0cc95, roughness: 1 }),
    corn: std({ color: 0xe2b437, roughness: 0.8 }),
    tree: std({ color: 0x2f6b3d, roughness: 0.9, side: THREE.DoubleSide }),
    star: std({ color: 0xffffff, roughness: 0.6, emissive: 0x333333 }),
    orange: std({ color: 0xe0661c, roughness: 0.6 }),
    water: std({ color: 0x1b2a2e, roughness: 0.1, metalness: 0.2 }),
  };
}

// ---------------------------------------------------------------- helpers

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};

/** Metre-based UVs on a box so tiled textures keep their real size. */
function boxM(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv!;
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)),
      ny = Math.abs(nor.getY(i));
    const px = pos.getX(i),
      py = pos.getY(i),
      pz = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, px, pz);
    else if (nx > 0.5) uv.setXY(i, pz, py);
    else uv.setXY(i, px, py);
  }
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/** A gable wall body along x: length L, width W, walls to `eave`, gable peak at `ridge`. */
function gableBody(
  L: number,
  W: number,
  y0: number,
  eave: number,
  ridge: number,
  m: THREE.Material,
) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, y0);
  s.lineTo(W / 2, y0);
  s.lineTo(W / 2, eave);
  s.lineTo(0, ridge);
  s.lineTo(-W / 2, eave);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  // Shape lies in x/y with depth along +z: turn so depth runs along x.
  g.translate(0, 0, -L / 2);
  g.rotateY(Math.PI / 2);
  // Metre UVs: caps use the shape coords; sides use (along, up).
  const uv = g.attributes.uv!,
    pos = g.attributes.position!,
    nor = g.attributes.normal!;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return new THREE.Mesh(g, m);
}

/** Two roof slabs over a gable body (ridge along x), with overhangs. */
function gableRoof(
  L: number,
  W: number,
  eave: number,
  ridge: number,
  m: THREE.Material,
  over = 0.45,
  t = 0.16,
) {
  const g = new THREE.Group();
  const run = W / 2 + over;
  const slope = Math.atan2(ridge - eave, W / 2);
  const len = run / Math.cos(slope);
  for (const s of [-1, 1]) {
    const slab = boxM(L + over * 2, t, len, m);
    slab.rotation.x = s * slope;
    slab.position.set(
      0,
      ridge - (Math.sin(slope) * len) / 2 + t / 2,
      (s * Math.cos(slope) * len) / 2,
    );
    g.add(slab);
  }
  return g;
}

/** Shed roof along x falling from height hHigh at x0 to hLow at x1. */
function shedRoof(
  x0: number,
  x1: number,
  W: number,
  hHigh: number,
  hLow: number,
  m: THREE.Material,
  over = 0.4,
) {
  const run = Math.abs(x1 - x0) + over;
  const ang = Math.atan2(hHigh - hLow, Math.abs(x1 - x0));
  const len = run / Math.cos(ang);
  const slab = boxM(len, 0.16, W + over * 2, m);
  const dir = Math.sign(x1 - x0);
  slab.rotation.z = -dir * ang;
  slab.position.set(
    x0 + (dir * len * Math.cos(ang)) / 2,
    (hHigh + hLow) / 2 + 0.1 - (over * Math.sin(ang)) / 2,
    0,
  );
  return slab;
}

/** Window with trim on a wall: wall normal along +z of the returned group. */
function windowAt(w: number, h: number, trim: THREE.Material, panes = 1) {
  const g = new THREE.Group();
  const m = mats();
  g.add(box(w + 0.22, h + 0.22, 0.08, trim, 0, 0, 0.02));
  const pw = w / panes;
  for (let i = 0; i < panes; i++) {
    g.add(box(pw - 0.08, h - 0.08, 0.1, m.glass, -w / 2 + pw * (i + 0.5), 0, 0.03));
  }
  g.add(box(w, 0.05, 0.12, trim, 0, 0, 0.05)); // meeting rail
  return g;
}

/** Put a local-frame group on the map: centre, grid angle, sitting on the ground (+lift). */
function place(o: THREE.Object3D, c: XY, angleDeg: number, lift = 0): THREE.Object3D {
  o.position.set(c[0], groundHeight(c[0], c[1]) + lift, -c[1]);
  o.rotation.y = rad(angleDeg);
  return o;
}

function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}

function shadow(o: THREE.Object3D, cast = true) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
  return o;
}

// ---------------------------------------------------------------- farmhouse

/**
 * From the owner's photo: an L-shaped two-storey house. Main block with its ridge along the
 * grid, a steep front gable (octagon vent) toward the road, a one-storey porch in the corner,
 * white siding, slate-blue trim, dark shingles, buff brick chimney, fieldstone foundation.
 * Front door on the south end up concrete steps with black outdoor carpet and railings.
 */
function farmhouse(): THREE.Group {
  const H = FARM.house;
  const m = mats();
  const g = new THREE.Group();
  const base = 0.75,
    eave = 6.4,
    ridge = 9.3;
  const L = H.main.w,
    W = H.main.h;
  g.add(boxM(L + 0.25, base + 1.2, W + 0.25, m.stone, 0, base / 2 - 0.6, 0));
  g.add(gableBody(L, W, base, eave, ridge, m.siding));
  g.add(gableRoof(L, W, eave, ridge, m.shingle, 0.4));
  // Front gable wing toward the road (-z), ridge across the main one, steeper.
  const wl = H.wing.w,
    wd = H.wing.h + W / 2; // runs back into the main block
  const wing = new THREE.Group();
  const wRidge = 9.9;
  wing.add(
    boxM(wl + 0.25, base + 1.2, H.wing.h + 0.25, m.stone, 0, base / 2 - 0.6, -W / 2 - H.wing.h / 2),
  );
  const body = gableBody(wd, wl, base, eave, wRidge, m.siding);
  body.rotation.y = Math.PI / 2;
  body.position.z = -wd / 2;
  wing.add(body);
  const wroof = gableRoof(wd + 0.3, wl, eave, wRidge, m.shingle, 0.45);
  wroof.rotation.y = Math.PI / 2;
  wroof.position.z = -wd / 2 - 0.15;
  wing.add(wroof);
  // Octagonal gable vent and a paired window upstairs, triple window downstairs.
  const vent = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), m.trimWhite);
  vent.position.set(0, 8.4, -wd - 0.02);
  vent.rotation.y = Math.PI;
  wing.add(vent);
  for (const [x, y, w, h, n] of [
    [0, 4.9, 1.9, 1.5, 2],
    [0, 2.2, 2.6, 1.5, 3],
  ] as const) {
    const win = windowAt(w, h, m.trimBlue, n);
    win.position.set(x, y, -wd - 0.02);
    win.rotation.y = Math.PI;
    wing.add(win);
  }
  // Blue rake trim on the front gable.
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3((s * wl) / 2 + s * 0.3, eave - 0.2, -wd - 0.08);
    const b = new THREE.Vector3(0, wRidge + 0.15, -wd - 0.08);
    wing.add(strut(a, b, 0.12, m.trimBlue));
  }
  wing.position.x = H.wing.c ? local(H.wing.c, H.main.c, H.angle)[0] : 2.2;
  g.add(wing);
  // Porch: raised floor, white posts and railing, lattice skirt, shed roof.
  const [px, pz] = local(H.porch.c, H.main.c, H.angle);
  const pw = H.porch.w,
    pd = H.porch.h;
  const porch = new THREE.Group();
  porch.add(boxM(pw, 0.12, pd, m.wood, 0, 0.95, 0));
  porch.add(box(pw, 0.85, pd - 0.1, m.trimWhite, 0, 0.45, 0.05)); // lattice skirt (white)
  for (const x of [-pw / 2 + 0.12, 0, pw / 2 - 0.12])
    porch.add(box(0.16, 2.5, 0.16, m.trimWhite, x, 2.2, -pd / 2 + 0.12));
  porch.add(box(pw, 0.08, 0.08, m.trimWhite, 0, 1.9, -pd / 2 + 0.12));
  for (let x = -pw / 2 + 0.3; x < pw / 2 - 0.2; x += 0.2)
    porch.add(box(0.04, 0.85, 0.04, m.trimWhite, x, 1.45, -pd / 2 + 0.12));
  porch.add(shedRoofZ(pw, pd, 3.75, 3.35, m.shingle));
  const pDoor = box(0.95, 2.1, 0.08, m.trimWhite, 0.4, 2.05, pd / 2 - 0.02);
  porch.add(pDoor);
  porch.position.set(px, 0, pz);
  g.add(porch);
  // Concrete pad ~15 ft out from the front door (the steps sit on it), a sidewalk round to the
  // west porch, and grandpa's simple kettle grill on the pad in front of the steps.
  const [padX, padZ] = local(FARM.house_pad.c, H.main.c, H.angle);
  g.add(boxM(FARM.house_pad.w, 0.7, FARM.house_pad.h, m.concrete, padX, -0.27, padZ));
  const walk = FARM.house_walk.pts.map((p) => local(p, H.main.c, H.angle));
  for (let i = 0; i < walk.length - 1; i++) {
    const [ax, az] = walk[i]!,
      [bx, bz] = walk[i + 1]!;
    const seg = boxM(
      Math.hypot(bx - ax, bz - az) + FARM.house_walk.width,
      0.6,
      FARM.house_walk.width,
      m.concrete,
      (ax + bx) / 2,
      -0.24,
      (az + bz) / 2,
    );
    seg.rotation.y = -Math.atan2(bz - az, bx - ax);
    g.add(seg);
  }
  const [grx, grz] = local(FARM.grill, H.main.c, H.angle);
  g.add(kettleGrill().translateX(grx).translateY(0.08).translateZ(grz));
  // Front steps on the south end (-x): concrete with black outdoor carpet, railings both sides.
  const [sx, sz] = local(H.steps.c, H.main.c, H.angle);
  const steps = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const depth = H.steps.w - i * 0.35;
    steps.add(
      box(
        depth,
        0.24,
        H.steps.h,
        m.concrete,
        -H.steps.w / 2 + depth / 2 + i * 0.35 - 0.1,
        0.12 + i * 0.24,
        0,
      ),
    );
    steps.add(
      box(
        depth,
        0.02,
        H.steps.h - 0.3,
        m.carpet,
        -H.steps.w / 2 + depth / 2 + i * 0.35 - 0.1,
        0.25 + i * 0.24,
        0,
      ),
    );
  }
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(-H.steps.w / 2 - 0.1, 1.0, (s * H.steps.h) / 2);
    const b = new THREE.Vector3(H.steps.w / 2, 1.9, (s * H.steps.h) / 2);
    steps.add(strut(a, b, 0.04, m.black));
    steps.add(box(0.05, 1.0, 0.05, m.black, -H.steps.w / 2 - 0.1, 0.5, (s * H.steps.h) / 2));
  }
  steps.position.set(sx + 0.2, 0, sz);
  g.add(steps);
  // Front door slightly left of the steps' centre (seen from the steps), white bench to its right.
  const sill = 0.96; // top of the front steps
  g.add(box(0.08, 2.1, 1.0, m.trimWhite, -L / 2 - 0.02, sill + 1.05, -0.3));
  g.add(box(0.06, 2.3, 1.2, m.trimBlue, -L / 2 - 0.0, sill + 1.05, -0.3));
  const [bx, bz] = local(H.bench, H.main.c, H.angle);
  const bench = new THREE.Group();
  bench.add(box(0.45, 0.05, 1.2, m.trimWhite, 0, 0.45, 0));
  bench.add(box(0.05, 0.5, 1.2, m.trimWhite, 0.2, 0.75, 0));
  for (const z of [-0.55, 0.55]) bench.add(box(0.4, 0.45, 0.05, m.trimWhite, 0, 0.22, z));
  bench.position.set(bx + 0.2, sill, bz);
  g.add(bench);
  // Chimney at the ridge.
  const [cx, cz] = local(H.chimney, H.main.c, H.angle);
  g.add(boxM(0.75, 3.0, 0.75, m.brick, cx, ridge + 0.6, cz));
  // Windows round the main block (skipping where the wing and porch stand).
  const wins: [number, number, number, number][] = [
    // [x, z, facing (0 = +z, 1 = -z, 2 = +x, 3 = -x), y]
    [-3, W / 2, 0, 2.4],
    [0, W / 2, 0, 2.4],
    [3, W / 2, 0, 2.4],
    [-3, W / 2, 0, 5.0],
    [0, W / 2, 0, 5.0],
    [3, W / 2, 0, 5.0],
    [-3.6, -W / 2, 1, 5.0],
    [L / 2, -1.6, 2, 2.4],
    [L / 2, 1.6, 2, 2.4],
    [L / 2, -1.6, 2, 5.0],
    [L / 2, 1.6, 2, 5.0],
    [-L / 2, 1.8, 3, 5.0],
    [-L / 2, -1.8, 3, 5.0],
  ];
  for (const [x, z, f, y] of wins) {
    const w = windowAt(0.95, 1.5, m.trimBlue, 1);
    w.position.set(x, y, z);
    w.rotation.y = [0, Math.PI, Math.PI / 2, -Math.PI / 2][f]!;
    g.add(w);
  }
  // Slate-blue corner boards.
  for (const [x, z] of [
    [L / 2, W / 2],
    [-L / 2, W / 2],
    [L / 2, -W / 2],
    [-L / 2, -W / 2],
  ] as const)
    g.add(box(0.18, eave - base, 0.18, m.trimBlue, x, (eave + base) / 2, z));
  return g;
}

/** A simple black kettle grill on three legs. */
function kettleGrill(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    m.black,
  );
  bowl.position.y = 0.78;
  const lid = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    m.black,
  );
  lid.scale.y = 0.8;
  lid.position.y = 0.8;
  g.add(bowl, lid, box(0.06, 0.06, 0.06, m.galv, 0, 1.06, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(
      strut(
        new THREE.Vector3(Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12),
        new THREE.Vector3(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32),
        0.015,
        m.galv,
      ),
    );
  }
  return g;
}

/** Shed roof falling toward -z (the porch's open side). */
function shedRoofZ(w: number, d: number, hHigh: number, hLow: number, m: THREE.Material) {
  const ang = Math.atan2(hHigh - hLow, d);
  const len = (d + 0.35) / Math.cos(ang);
  const s = boxM(w + 0.3, 0.14, len, m);
  s.rotation.x = -ang;
  s.position.set(0, (hHigh + hLow) / 2, -0.17);
  return s;
}

/** A map point in a building's local frame (x along the grid, z = -V). */
function local(p: XY, c: XY, angleDeg: number): [number, number] {
  const a = rad(angleDeg);
  const dx = p[0] - c[0],
    dy = p[1] - c[1];
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  const across = -dx * Math.sin(a) + dy * Math.cos(a); // +V
  return [along, -across];
}

// ---------------------------------------------------------------- barn

/**
 * The large red bank barn: rounded fieldstone foundation ~8 ft, red walls with white trim,
 * black shingle gable roof whose west slope carries a huge painted Christmas tree with a white
 * star, two tractor-size sliding doors at the top of the ramp, and on the south end one giant
 * sliding door with a walk-through door and a netless basketball hoop. The wooden garage is
 * attached at the north end with a roof falling north and its door to the west.
 */
function barn(): THREE.Group {
  const B = FARM.barn;
  const m = mats();
  const g = new THREE.Group();
  const L = B.w,
    W = B.h,
    st = RAMP_RISE,
    eave = st + 5.0,
    ridge = eave + 5.4;
  g.add(boxM(L, st + 1.5, W, m.stone, 0, (st - 1.5) / 2, 0));
  g.add(gableBody(L, W, st, eave, ridge, m.boards));
  g.add(gableRoof(L, W, eave, ridge, m.shingle, 0.55, 0.2));
  // Painted tree on the west (-z) slope: base at the eave, star at the ridge.
  const slope = Math.atan2(ridge - eave, W / 2);
  const len = W / 2 / Math.cos(slope);
  const tri = new THREE.Shape();
  tri.moveTo(-4.4, 0);
  tri.lineTo(4.4, 0);
  tri.lineTo(0, len * 0.93);
  tri.closePath();
  const tree = new THREE.Mesh(new THREE.ShapeGeometry(tri), m.tree);
  const trunk = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), mats().wood);
  trunk.position.set(0, -0.2, 0);
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.75, 5), m.star);
  star.position.set(0, len * 0.93, 0.01);
  const mural = new THREE.Group();
  mural.add(tree, trunk, star);
  // Lie the mural on the west slope: its +y runs up-slope toward the ridge.
  mural.rotation.order = 'YXZ';
  mural.rotation.y = Math.PI;
  mural.rotation.x = -(Math.PI / 2 - slope);
  mural.position.set(0, eave + 0.3, -W / 2 - 0.02);
  g.add(mural);
  // White trim: corner boards, eave lines, rakes.
  for (const [x, z] of [
    [L / 2, W / 2],
    [-L / 2, W / 2],
    [L / 2, -W / 2],
    [-L / 2, -W / 2],
  ] as const)
    g.add(box(0.22, eave - st, 0.22, m.trimWhite, x, (eave + st) / 2, z));
  for (const z of [W / 2, -W / 2]) g.add(box(L, 0.22, 0.24, m.trimWhite, 0, eave - 0.1, z));
  for (const x of [L / 2 + 0.05, -L / 2 - 0.05])
    for (const s of [-1, 1])
      g.add(
        strut(
          new THREE.Vector3(x, eave, (s * W) / 2),
          new THREE.Vector3(x, ridge, 0),
          0.12,
          m.trimWhite,
        ),
      );
  // Upper floor: two big sliding doors at the top of the ramp (west wall), on a track.
  for (const s of [-1, 1]) {
    const door = new THREE.Group();
    door.add(boxM(3.7, 4.1, 0.14, m.boards, 0, 0, 0));
    door.add(
      box(3.7, 0.18, 0.2, m.trimWhite, 0, 1.96, 0),
      box(3.7, 0.18, 0.2, m.trimWhite, 0, -1.96, 0),
    );
    door.add(
      box(0.18, 4.1, 0.2, m.trimWhite, 1.76, 0, 0),
      box(0.18, 4.1, 0.2, m.trimWhite, -1.76, 0, 0),
    );
    for (const d of [-1, 1]) {
      const x = strut(
        new THREE.Vector3(-1.7, -1.9 * d, 0.1),
        new THREE.Vector3(1.7, 1.9 * d, 0.1),
        0.08,
        m.trimWhite,
      );
      door.add(x);
    }
    door.position.set(s * 1.9, st + 2.1, -W / 2 - 0.12);
    g.add(door);
  }
  g.add(box(9.5, 0.14, 0.2, m.black, 0, st + 4.3, -W / 2 - 0.2));
  // South end (-x): giant sliding door in the stone level with a walk-through door and the hoop.
  const sd = new THREE.Group();
  sd.add(boxM(0.16, 2.3, 3.6, m.boards, 0, 0, 0));
  sd.add(
    box(0.22, 0.16, 3.6, m.trimWhite, 0, 1.08, 0),
    box(0.22, 0.16, 3.6, m.trimWhite, 0, -1.08, 0),
  );
  sd.add(
    strut(
      new THREE.Vector3(-0.1, -1.0, -1.7),
      new THREE.Vector3(-0.1, 1.0, 1.7),
      0.06,
      m.trimWhite,
    ),
  );
  sd.add(
    strut(
      new THREE.Vector3(-0.1, 1.0, -1.7),
      new THREE.Vector3(-0.1, -1.0, 1.7),
      0.06,
      m.trimWhite,
    ),
  );
  sd.add(
    box(0.2, 2.0, 0.95, m.boards, -0.05, -0.12, -1.1),
    box(0.22, 2.0, 0.08, m.trimWhite, -0.06, -0.12, -1.6),
  );
  sd.position.set(-L / 2 - 0.1, 1.17, 0.4);
  g.add(sd);
  const hoop = new THREE.Group();
  hoop.add(box(0.06, 0.9, 1.25, m.trimWhite, 0, 0, 0));
  hoop.add(box(0.07, 0.36, 0.48, m.orange, -0.01, -0.18, 0));
  hoop.add(box(0.07, 0.3, 0.4, m.trimWhite, -0.02, -0.18, 0));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20), m.orange);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-0.3, -0.38, 0);
  hoop.add(rim);
  hoop.position.set(-L / 2 - 0.25, 2.75, 0.4);
  g.add(hoop);
  // Wooden garage on the north end: red, roof falling north, door facing west.
  const G = FARM.wooden_garage;
  const [gx] = local(G.c, B.c, B.angle ?? 50);
  const gar = new THREE.Group();
  const gl = G.w,
    gw = G.h;
  gar.add(boxM(gl, 0.6, gw, m.stone, 0, -0.1, 0));
  const walls = boxM(gl, 6.2, gw, m.boards, 0, 3.1, 0);
  gar.add(walls);
  gar.add(shedRoof(-gl / 2, gl / 2, gw, 6.6, 4.4, m.shingle));
  const gd = new THREE.Group();
  gd.add(
    boxM(3.4, 3.2, 0.14, m.boards),
    box(3.5, 0.16, 0.2, m.trimWhite, 0, 1.6, 0),
    box(0.16, 3.2, 0.2, m.trimWhite, 1.7, 0, 0),
    box(0.16, 3.2, 0.2, m.trimWhite, -1.7, 0, 0),
  );
  gd.position.set(0, 1.6, -gw / 2 - 0.08);
  gar.add(gd);
  for (const [x, z] of [
    [gl / 2, gw / 2],
    [gl / 2, -gw / 2],
  ] as const)
    gar.add(box(0.2, 4.6, 0.2, m.trimWhite, x, 2.3, z));
  gar.position.x = gx;
  // The garage cuts off the barn's north wall to the 6.2 m mark (walls already overlap there).
  gar.position.y = 0;
  g.add(gar);
  return g;
}

// ---------------------------------------------------------------- smaller buildings

function redGarage(): THREE.Group {
  const R = FARM.red_garage;
  const m = mats();
  const g = new THREE.Group();
  const L = R.w,
    W = R.h,
    eave = 3.0,
    ridge = 5.3;
  g.add(boxM(L, 0.8, W, m.concrete, 0, -0.3, 0));
  g.add(gableBody(L, W, 0, eave, ridge, m.boards));
  g.add(gableRoof(L, W, eave, ridge, m.shingle, 0.4));
  for (const [x, z] of [
    [L / 2, W / 2],
    [-L / 2, W / 2],
    [L / 2, -W / 2],
    [-L / 2, -W / 2],
  ] as const)
    g.add(box(0.18, eave, 0.18, m.trimWhite, x, eave / 2, z));
  // Big door on the north end (+x).
  const d = new THREE.Group();
  d.add(
    boxM(0.14, 2.6, 4.6, m.boards),
    box(0.2, 0.16, 4.8, m.trimWhite, 0, 1.3, 0),
    box(0.2, 2.6, 0.16, m.trimWhite, 0, 0, 2.35),
    box(0.2, 2.6, 0.16, m.trimWhite, 0, 0, -2.35),
  );
  d.add(
    strut(
      new THREE.Vector3(0.08, -1.2, -2.2),
      new THREE.Vector3(0.08, 1.2, 2.2),
      0.05,
      m.trimWhite,
    ),
  );
  d.add(
    strut(
      new THREE.Vector3(0.08, 1.2, -2.2),
      new THREE.Vector3(0.08, -1.2, 2.2),
      0.05,
      m.trimWhite,
    ),
  );
  d.position.set(L / 2 + 0.08, 1.3, 0);
  g.add(d);
  // Rooster weather vane on the ridge.
  const vane = new THREE.Group();
  vane.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.5, 0), 0.03, m.black));
  for (const a of [0, Math.PI / 2]) {
    const arm = box(1.1, 0.03, 0.03, m.black, 0, 0.9, 0);
    arm.rotation.y = a;
    vane.add(arm);
  }
  const rooster = new THREE.Mesh(roosterGeo(), m.black);
  rooster.position.y = 1.45;
  rooster.name = 'rooster';
  vane.add(rooster);
  vane.position.set(0, ridge + 0.1, 0);
  g.add(vane);
  g.userData.rooster = rooster;
  return g;
}

function roosterGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const P: [number, number][] = [
    [-0.55, 0.05],
    [-0.25, 0.0],
    [0.15, 0.02],
    [0.32, 0.18],
    [0.38, 0.42],
    [0.46, 0.5],
    [0.36, 0.56],
    [0.3, 0.66],
    [0.22, 0.6],
    [0.2, 0.44],
    [0.05, 0.3],
    [-0.2, 0.32],
    [-0.4, 0.62],
    [-0.62, 0.66],
    [-0.5, 0.4],
    [-0.66, 0.36],
    [-0.52, 0.2],
  ];
  P.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.translate(0, 0, -0.015);
  return g;
}

function smallGable(
  R: RectDef,
  eave: number,
  ridge: number,
  walls: THREE.Material,
  roof: THREE.Material,
) {
  const m = mats();
  const g = new THREE.Group();
  g.add(gableBody(R.w, R.h, 0, eave, ridge, walls));
  g.add(gableRoof(R.w, R.h, eave, ridge, roof, 0.3, 0.12));
  for (const [x, z] of [
    [R.w / 2, R.h / 2],
    [-R.w / 2, R.h / 2],
    [R.w / 2, -R.h / 2],
    [-R.w / 2, -R.h / 2],
  ] as const)
    g.add(box(0.12, eave, 0.12, m.trimWhite, x, eave / 2, z));
  return g;
}

function shed(): THREE.Group {
  const S = FARM.shed;
  const m = mats();
  const g = smallGable(S, 2.5, 3.7, m.boards, m.shingle);
  const d = new THREE.Group();
  d.add(
    boxM(1.2, 2.0, 0.1, m.boards),
    box(1.4, 0.12, 0.14, m.trimWhite, 0, 1.0, 0),
    box(0.12, 2.0, 0.14, m.trimWhite, 0.65, 0, 0),
    box(0.12, 2.0, 0.14, m.trimWhite, -0.65, 0, 0),
  );
  d.position.set(0, 1.0, S.h / 2 + 0.06);
  g.add(d);
  return g;
}

function greenhouse(): THREE.Group {
  const R = FARM.greenhouse;
  const m = mats();
  const g = new THREE.Group();
  const eave = 1.9,
    ridge = 2.6;
  g.add(boxM(R.w, 0.25, R.h, m.concrete, 0, 0.05, 0));
  g.add(gableBody(R.w, R.h, 0.18, eave, ridge, m.plexi));
  const roof = gableRoof(R.w, R.h, eave, ridge, m.plexi, 0.05, 0.03);
  g.add(roof);
  // Aluminum frame.
  const f = (a: THREE.Vector3, b: THREE.Vector3) => g.add(strut(a, b, 0.03, m.alu));
  for (const x of [-R.w / 2, -R.w / 6, R.w / 6, R.w / 2]) {
    for (const s of [-1, 1]) {
      f(new THREE.Vector3(x, 0.18, (s * R.h) / 2), new THREE.Vector3(x, eave, (s * R.h) / 2));
      f(new THREE.Vector3(x, eave, (s * R.h) / 2), new THREE.Vector3(x, ridge, 0));
    }
  }
  for (const s of [-1, 1])
    f(
      new THREE.Vector3(-R.w / 2, eave, (s * R.h) / 2),
      new THREE.Vector3(R.w / 2, eave, (s * R.h) / 2),
    );
  f(new THREE.Vector3(-R.w / 2, ridge, 0), new THREE.Vector3(R.w / 2, ridge, 0));
  // A few pots and seedlings inside.
  for (let i = 0; i < 8; i++) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 8), m.rust);
    pot.position.set(-1.2 + i * 0.34, 0.3, 0.5 - (i % 2) * 0.9);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mats().tree);
    leaf.position.set(pot.position.x, 0.5, pot.position.z);
    g.add(pot, leaf);
  }
  return g;
}

function playhouse(): THREE.Group {
  const P = FARM.playhouse;
  const m = mats();
  const g = smallGable(P, 1.8, 2.85, m.boards, m.shingle);
  // Front (-z, toward the house): door between two windows; one window on each side.
  const front = -P.h / 2 - 0.03;
  g.add(
    box(0.62, 1.3, 0.06, m.boards, 0, 0.65, front),
    box(0.74, 0.08, 0.08, m.trimWhite, 0, 1.33, front),
  );
  for (const x of [-0.8, 0.8]) {
    const w = windowAt(0.42, 0.42, m.trimWhite);
    w.position.set(x, 1.1, front);
    w.rotation.y = Math.PI;
    g.add(w);
  }
  for (const s of [-1, 1]) {
    const w = windowAt(0.42, 0.42, m.trimWhite);
    w.position.set((s * P.w) / 2 + s * 0.03, 1.1, 0);
    w.rotation.y = (s * Math.PI) / 2;
    g.add(w);
  }
  return g;
}

/** Round wire-mesh corn crib, 8 ft tall, half full of yellow ears, metal cone cap. */
function cornCrib(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const r = 1.4,
    h = 2.44;
  const mesh = canvasTex(
    128,
    128,
    (x) => {
      x.clearRect(0, 0, 128, 128);
      x.strokeStyle = '#c8ccd0';
      x.lineWidth = 3;
      for (let i = 0; i <= 128; i += 16) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, 128);
        x.moveTo(0, i);
        x.lineTo(128, i);
        x.stroke();
      }
    },
    1,
  );
  mesh.repeat.set(10, 3);
  const wire = new THREE.MeshStandardMaterial({
    map: mesh,
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    metalness: 0.6,
    roughness: 0.5,
  });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), wire).translateY(h / 2));
  const corn = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r - 0.05, h / 2, 28), cornMat());
  corn.position.y = h / 4;
  g.add(corn);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r + 0.15, 0.9, 28), m.galv);
  cap.position.y = h + 0.45;
  g.add(cap);
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(r + 0.2, r + 0.25, 0.25, 28), m.concrete).translateY(
      0.05,
    ),
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(box(0.06, h, 0.06, m.galv, Math.cos(a) * r, h / 2, Math.sin(a) * r));
  }
  return g;
}

let cornM: THREE.MeshStandardMaterial | null = null;
function cornMat() {
  if (cornM) return cornM;
  const t = canvasTex(
    128,
    128,
    (x) => {
      x.fillStyle = '#d9a72a';
      x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) {
        x.fillStyle = ['#f0c43a', '#e6b432', '#c8901f', '#f5d25a'][i % 4]!;
        x.save();
        x.translate(Math.random() * 128, Math.random() * 128);
        x.rotate(Math.random() * Math.PI);
        x.fillRect(-10, -3, 20, 6);
        x.restore();
      }
    },
    0.6,
  );
  cornM = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return cornM;
}

/** Tall aluminum water-pumping windmill, ~15 ft over the house, still turning. */
function windmill(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const H = 14.2,
    b = 1.6,
    t = 0.32;
  const corner = (y: number, sx: number, sz: number) => {
    const k = y / H;
    const r = b + (t - b) * k;
    return new THREE.Vector3(sx * r, y, sz * r);
  };
  const C: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  for (const [sx, sz] of C) g.add(strut(corner(0, sx, sz), corner(H, sx, sz), 0.06, m.galv));
  for (let y = 1.6; y < H; y += 2.2) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = C[i]!,
        [bx, bz] = C[(i + 1) % 4]!;
      g.add(strut(corner(y, ax, az), corner(y, bx, bz), 0.035, m.galv));
      g.add(strut(corner(y, ax, az), corner(Math.min(H, y + 2.2), bx, bz), 0.025, m.galv));
    }
  }
  // Head: wheel of blades on a hub, and the tail vane.
  const head = new THREE.Group();
  head.position.y = H + 0.4;
  head.add(box(0.5, 0.4, 0.5, m.alu));
  const wheel = new THREE.Group();
  const blades = 18;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const blade = box(0.32, 1.25, 0.02, m.alu, 0, 1.15, 0);
    const arm = new THREE.Group();
    blade.rotation.y = 0.45;
    arm.add(blade);
    arm.rotation.z = a;
    wheel.add(arm);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.03, 4, 36), m.alu);
  wheel.add(ring, new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 4, 24), m.alu));
  wheel.position.z = -0.45;
  head.add(wheel);
  head.add(box(0.08, 0.08, 2.6, m.alu, 0, 0, 1.3));
  head.add(box(0.03, 1.1, 1.4, m.alu, 0, 0.1, 2.7));
  head.rotation.y = 0.9;
  g.add(head);
  g.userData.wheel = wheel;
  return g;
}

/** Remains of an old fieldstone well: an open ring 8 ft across, 3 ft high, 1 ft thick. */
function well(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const prof = [
    new THREE.Vector2(0.92, -0.3),
    new THREE.Vector2(1.22, -0.3),
    new THREE.Vector2(1.22, 0.91),
    new THREE.Vector2(0.92, 0.91),
    new THREE.Vector2(0.92, -0.3),
  ];
  const ring = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), m.stone);
  g.add(ring);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.92, 24), m.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.05;
  g.add(water);
  return g;
}

function sandbox(): THREE.Group {
  const S = FARM.sandbox;
  const m = mats();
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(boxM(S.w, 0.3, 0.06, m.wood, 0, 0.15, (s * S.h) / 2));
    g.add(boxM(0.06, 0.3, S.h, m.wood, (s * S.w) / 2, 0.15, 0));
  }
  g.add(box(S.w - 0.1, 0.1, S.h - 0.1, m.sand, 0, 0.12, 0));
  const cover = box(S.w * 0.7, 0.02, S.h + 0.02, m.blueCover, S.w * 0.15, 0.31, 0);
  cover.rotation.z = 0.02;
  g.add(cover);
  return g;
}

/** Two sets of T-posts with three lines, and a little washing hanging out. */
function clothesLines(): THREE.Group {
  const m = mats();
  const [a, b] = FARM.clothes_lines;
  const g = new THREE.Group();
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const x of [0, L]) {
    g.add(box(0.08, 2.2, 0.08, m.galv, x, 1.1, 0));
    g.add(box(0.06, 0.06, 1.7, m.galv, x, 2.15, 0));
  }
  const cloth = [0xffffff, 0x6a9ad8, 0xe8d8a8, 0xd85a5a, 0xffffff];
  for (const z of [-0.7, 0, 0.7]) {
    g.add(strut(new THREE.Vector3(0, 2.15, z), new THREE.Vector3(L, 2.15, z), 0.008, m.black));
  }
  for (let i = 0; i < 6; i++) {
    const w = 0.5 + (i % 3) * 0.3;
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.7 + (i % 2) * 0.4),
      new THREE.MeshStandardMaterial({
        color: cloth[i % cloth.length],
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    sheet.position.set(
      1.4 + i * 1.3,
      2.15 - sheet.geometry.parameters.height / 2,
      [-0.7, 0, 0.7][i % 3]!,
    );
    g.add(sheet);
  }
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.position.set(a[0], groundHeight(a[0], a[1]), -a[1]);
  g.rotation.y = ang;
  return g;
}

/** Rusty barrel stove on short legs with a tall stovepipe, for burning garbage. */
function stove(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 18), m.rust);
  drum.rotation.z = Math.PI / 2;
  drum.position.y = 0.95;
  g.add(drum);
  for (const [x, z] of [
    [0.35, 0.3],
    [0.35, -0.3],
    [-0.35, 0.3],
    [-0.35, -0.3],
  ] as const)
    g.add(
      strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.8, 0.6, z * 0.8), 0.03, m.black),
    );
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 10), m.rust)
      .translateX(0.25)
      .translateY(2.2),
  );
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), m.black);
  door.rotation.y = -Math.PI / 2;
  door.position.set(-0.51, 0.95, 0);
  g.add(door);
  for (let i = 0; i < 6; i++) {
    const p = boxM(
      1.1 + Math.random() * 0.6,
      0.06,
      0.16,
      m.wood,
      -1.6 + Math.random() * 0.4,
      0.05 + i * 0.05,
      -1.0 + Math.random() * 0.5,
    );
    p.rotation.y = Math.random() * 1.2;
    g.add(p);
  }
  return g;
}

function mailbox(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  g.add(box(0.1, 1.1, 0.1, m.wood, 0, 0.55, 0));
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12, 1, false, 0, Math.PI),
    m.galv,
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.12;
  g.add(body, box(0.5, 0.13, 0.26, m.galv, 0, 1.06, 0));
  g.add(box(0.02, 0.2, 0.06, m.orange, 0.12, 1.28, 0.14));
  return g;
}

/** Old flat wooden hay wagon: plank deck, four steel wheels, a tongue. */
export function wagon(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  g.add(boxM(4.9, 0.12, 2.3, m.wood, 0, 0.95, 0));
  g.add(box(4.6, 0.18, 0.14, m.black, 0, 0.8, 0.8), box(4.6, 0.18, 0.14, m.black, 0, 0.8, -0.8));
  for (const x of [-1.6, 1.6])
    for (const z of [-1.15, 1.15]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18), m.black);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.42, z);
      g.add(w);
    }
  g.add(strut(new THREE.Vector3(2.4, 0.75, 0), new THREE.Vector3(4.3, 0.35, 0), 0.05, m.wood));
  return g;
}

// ---------------------------------------------------------------- ramp

/** The barn ramp: a black asphalt wedge from the yard up 8 ft to the upper doors. */
function ramp(): THREE.Mesh {
  const [w0, w1, o1, o0] = FARM.ramp as [XY, XY, XY, XY];
  const wallH = groundHeight(...mid(w0, w1)) + RAMP_RISE;
  const top = [w0, w1, o1, o0].map(
    (p, i) => new THREE.Vector3(p[0], i < 2 ? wallH : groundHeight(p[0], p[1]) + 0.04, -p[1]),
  );
  const bot = [w0, w1, o1, o0].map(
    (p) => new THREE.Vector3(p[0], groundHeight(p[0], p[1]) - 0.4, -p[1]),
  );
  const quads: THREE.Vector3[][] = [
    [top[0]!, top[1]!, top[2]!, top[3]!],
    [bot[1]!, top[1]!, top[2]!, bot[2]!],
    [bot[3]!, top[3]!, top[0]!, bot[0]!],
  ];
  const pos: number[] = [];
  for (const q of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) pos.push(q[i]!.x, q[i]!.y, q[i]!.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i]!, pos[i + 2]!);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const mat = mats().asphalt.clone();
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(g, mat);
}

// ---------------------------------------------------------------- all

export interface Buildings {
  group: THREE.Group;
  update: (t: number) => void;
  /** Footprints (map metres) a kart can't drive through. */
  solids: { c: XY; w: number; h: number; angle: number }[];
}

export function buildBuildings(): Buildings {
  const group = new THREE.Group();
  const add = (o: THREE.Object3D) => group.add(shadow(o));
  const F = FARM;
  add(place(farmhouse(), F.house.main.c, F.house.angle));
  add(place(barn(), F.barn.c, F.barn.angle ?? 50));
  const rg = redGarage();
  add(place(rg, F.red_garage.c, F.red_garage.angle ?? 65));
  add(place(shed(), F.shed.c, F.shed.angle ?? 50));
  add(place(greenhouse(), F.greenhouse.c, F.greenhouse.angle ?? 50));
  add(place(playhouse(), F.playhouse.c, F.playhouse.angle ?? 50));
  add(place(cornCrib(), F.corn_crib, 0));
  const wm = windmill();
  add(place(wm, F.windmill, 0));
  add(place(well(), F.well, 0));
  add(place(sandbox(), F.sandbox.c, F.sandbox.angle ?? 50));
  add(clothesLines());
  add(place(stove(), F.stove, 20));
  add(place(mailbox(), F.mailbox, F.farmGridDeg - 90));
  for (const w of F.wagons) add(place(wagon(), w.c, w.angle));
  add(ramp());

  const rooster = rg.userData.rooster as THREE.Object3D;
  const wheel = wm.userData.wheel as THREE.Object3D;
  const update = (t: number) => {
    wheel.rotation.z = -t * 1.6;
    rooster.rotation.y = Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.71) * 0.12;
  };
  const r = (d: RectDef, angle?: number) => ({
    c: d.c,
    w: d.w,
    h: d.h,
    angle: angle ?? d.angle ?? 50,
  });
  const solids = [
    r(F.house.main, F.house.angle),
    r(F.house.wing, F.house.angle),
    r({ c: F.barn.c, w: F.barn.w, h: F.barn.h }, F.barn.angle),
    r(F.wooden_garage),
    r(F.red_garage),
    r(F.shed),
    r(F.greenhouse),
    r(F.playhouse),
    { c: F.corn_crib, w: 2.8, h: 2.8, angle: 0 },
    { c: F.well, w: 2.4, h: 2.4, angle: 0 },
    { c: F.windmill, w: 3.2, h: 3.2, angle: 0 },
  ];
  return { group, update, solids };
}

/** Merge a list of small geometries into one (used by plants for repeated details). */
export const mergeAll = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;
