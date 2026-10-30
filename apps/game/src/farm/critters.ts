import * as THREE from 'three';
import { WIND_GLSL, windUniforms } from '../render/wind.ts';
import type { BeeSpot } from './bees.ts';
import { TERRAIN_UV_GLSL, heightTexture, terrainUniforms } from './grass.ts';
import { FARM, U, V, type XY, add, groundHeight } from './layout.ts';

/**
 * Small summer life, all in farm-local real metres (x, height, -y):
 *  - butterflies (monarchs and cabbage whites) fluttering round the flowers,
 *  - barn swallows looping round the barn and skimming the lawn,
 *  - seed fluff and pollen drifting on the breeze around the camera.
 */

let seed = 4711;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

// ------------------------------------------------------------------ butterflies

function wingTexture(kind: 'monarch' | 'white'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  // A right forewing (top) and hindwing (bottom), the body along the left edge.
  const shape = () => {
    x.beginPath();
    x.moveTo(2, 30);
    x.bezierCurveTo(14, 2, 50, 0, 62, 8);
    x.bezierCurveTo(58, 22, 40, 30, 30, 32);
    x.bezierCurveTo(46, 40, 50, 56, 36, 62);
    x.bezierCurveTo(20, 62, 8, 46, 2, 34);
    x.closePath();
  };
  shape();
  if (kind === 'monarch') {
    x.fillStyle = '#e07a14';
    x.fill();
    x.save();
    x.clip();
    x.strokeStyle = '#1a1208';
    x.lineWidth = 2;
    for (const [a, b] of [
      [8, 8],
      [24, 4],
      [40, 4],
      [44, 50],
      [30, 58],
    ]) {
      x.beginPath();
      x.moveTo(2, 32);
      x.lineTo(a!, b!);
      x.stroke();
    }
    x.lineWidth = 7;
    shape();
    x.stroke();
    x.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) x.fillRect(20 + i * 4.5, 4 + (i % 2) * 3, 1.6, 1.6);
    x.restore();
  } else {
    x.fillStyle = '#f3f1e4';
    x.fill();
    x.fillStyle = '#6b6b66';
    x.beginPath();
    x.arc(58, 8, 7, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.arc(34, 18, 2.4, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Two wings hinged on the body (along x); flapping happens in the vertex shader. */
function butterflyGeometry(span: number): THREE.BufferGeometry {
  const s = span / 2;
  // Each wing a quad from the body (z = 0) out to |z| = s; uv mirrored on the left.
  const pos = [
    -s * 0.5,
    0,
    0,
    s * 0.5,
    0,
    0,
    s * 0.5,
    0,
    s,
    -s * 0.5,
    0,
    s,
    -s * 0.5,
    0,
    0,
    s * 0.5,
    0,
    0,
    s * 0.5,
    0,
    -s,
    -s * 0.5,
    0,
    -s,
  ];
  const uv = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  return g;
}

function flapMaterial(map: THREE.Texture, rate: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nattribute float aPhase;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float side = sign(position.z);
        float a = side * (0.15 + 1.15 * abs(sin(uTime * ${rate.toFixed(2)} + aPhase)));
        float r = abs(position.z);
        transformed.z = side * r * cos(a);
        transformed.y = r * abs(sin(a));`,
      );
  };
  m.customProgramCacheKey = () => 'farm-flap-' + rate;
  return m;
}

interface Flier {
  c: THREE.Vector3;
  r: number;
  f: number[];
  ph: number[];
}

function butterflies(spots: BeeSpot[]) {
  const group = new THREE.Group();
  const kinds = [
    { map: wingTexture('monarch'), span: 0.11, max: 18 },
    { map: wingTexture('white'), span: 0.07, max: 24 },
  ];
  const all: { mesh: THREE.InstancedMesh; fl: Flier[] }[] = [];
  for (const k of kinds) {
    const fl: Flier[] = [];
    // A handful spread over the flower spots, not one at every flower.
    const flowers = spots.filter((s) => !s.fruit);
    for (let i = 0; i < k.max && flowers.length; i++) {
      const s = flowers[(rnd() * flowers.length) | 0]!;
      fl.push({
        c: new THREE.Vector3(s.x, s.y + 0.15, s.z),
        r: Math.max(0.8, s.r * 1.4),
        f: [0.11 + rnd() * 0.12, 0.13 + rnd() * 0.1, 0.9 + rnd() * 0.8, 2.3 + rnd()],
        ph: [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3],
      });
    }
    const geo = butterflyGeometry(k.span);
    geo.setAttribute(
      'aPhase',
      new THREE.InstancedBufferAttribute(new Float32Array(fl.map(() => rnd() * 6.3)), 1),
    );
    const mesh = new THREE.InstancedMesh(geo, flapMaterial(k.map, 13), Math.max(1, fl.length));
    mesh.count = fl.length;
    mesh.frustumCulled = false;
    group.add(mesh);
    all.push({ mesh, fl });
  }
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    p2 = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  const at = (b: Flier, t: number, out: THREE.Vector3) =>
    out.set(
      b.c.x + Math.sin(t * b.f[0]! + b.ph[0]!) * b.r + Math.sin(t * b.f[2]! * 1.3) * 0.15,
      b.c.y + 0.25 * Math.sin(t * b.f[1]! * 3 + b.ph[2]!) + 0.08 * Math.sin(t * b.f[3]!),
      b.c.z + Math.cos(t * b.f[1]! + b.ph[1]!) * b.r + Math.cos(t * b.f[2]!) * 0.15,
    );
  const update = (t: number) => {
    for (const { mesh, fl } of all) {
      fl.forEach((b, i) => {
        at(b, t, p);
        at(b, t + 0.05, p2);
        const yaw = Math.atan2(-(p2.z - p.z), p2.x - p.x);
        q.setFromEuler(e.set(0, yaw, Math.sin(t * 2 + i) * 0.2));
        mesh.setMatrixAt(i, m.compose(p, q, one));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return { group, update };
}

// ------------------------------------------------------------------ swallows

function swallow(): { bird: THREE.Group; wings: THREE.Object3D[] } {
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.5, metalness: 0.2 });
  const rust = new THREE.MeshStandardMaterial({ color: 0xb4602e, roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
  const bird = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), blue);
  body.scale.set(0.085, 0.03, 0.032);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), cream);
  belly.scale.set(0.07, 0.024, 0.028);
  belly.position.set(-0.005, -0.01, 0);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), rust);
  throat.scale.set(0.022, 0.02, 0.022);
  throat.position.set(0.06, -0.006, 0);
  bird.add(body, belly, throat);
  // Long forked tail.
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.012), blue);
    tail.position.set(-0.12, 0, s * 0.018);
    tail.rotation.y = s * 0.2;
    bird.add(tail);
  }
  // Long, swept, pointed wings hinged at the shoulder.
  const shape = new THREE.Shape();
  shape.moveTo(0.02, 0);
  shape.lineTo(-0.02, 0);
  shape.lineTo(-0.11, 0.19);
  shape.lineTo(-0.07, 0.19);
  shape.closePath();
  const wg = new THREE.ShapeGeometry(shape);
  wg.rotateX(Math.PI / 2);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wg, blue);
    w.material = blue;
    w.scale.z = s;
    const hinge = new THREE.Group();
    hinge.add(w);
    hinge.position.set(0.01, 0.01, s * 0.02);
    hinge.userData.side = s;
    bird.add(hinge);
    wings.push(hinge);
  }
  (blue as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  bird.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { bird, wings };
}

function swallows() {
  const group = new THREE.Group();
  group.name = 'swallows';
  const B = FARM.barn;
  const g0 = groundHeight(B.c[0], B.c[1]);
  const birds = Array.from({ length: 7 }, (_, i) => {
    const { bird, wings } = swallow();
    group.add(bird);
    return {
      bird,
      wings,
      r: [11 + rnd() * 12, 8 + rnd() * 10],
      w: (0.28 + rnd() * 0.18) * (i % 2 ? 1 : -1),
      ph: rnd() * 6.3,
      off: [(rnd() - 0.5) * 16, (rnd() - 0.5) * 16],
      h: 2 + rnd() * 4,
    };
  });
  const p = new THREE.Vector3(),
    p2 = new THREE.Vector3(),
    p3 = new THREE.Vector3(),
    look = new THREE.Vector3();
  const at = (b: (typeof birds)[number], t: number, out: THREE.Vector3) => {
    const a = t * b.w + b.ph;
    // A wandering loop: two circles beating together, swooping low then climbing.
    const x = B.c[0] + b.off[0]! + Math.cos(a) * b.r[0]! + Math.cos(a * 2.3 + 1) * 4;
    const y = B.c[1] + b.off[1]! + Math.sin(a) * b.r[1]! + Math.sin(a * 1.7) * 4;
    let h = Math.max(groundHeight(x, y) + 0.5, g0 + b.h + Math.sin(a * 1.9 + b.ph) * 2.6);
    // Up and over the barn roof rather than through it.
    const db = Math.hypot(x - B.c[0], y - B.c[1]);
    const over = 1 - THREE.MathUtils.smoothstep(db, 10, 16);
    h = Math.max(h, h + (g0 + 15 - h) * over);
    return out.set(x, h, -y);
  };
  const update = (t: number) => {
    for (const b of birds) {
      at(b, t, p);
      at(b, t + 0.1, p2);
      at(b, t + 0.2, p3);
      b.bird.position.copy(p);
      b.bird.lookAt(group.localToWorld(look.copy(p2)));
      b.bird.rotateY(-Math.PI / 2); // nose is +x
      // Bank into the turn.
      const v1 = p2.clone().sub(p),
        v2 = p3.clone().sub(p2);
      const turn = v1.x * v2.z - v1.z * v2.x;
      b.bird.rotateX(THREE.MathUtils.clamp(turn * 6, -0.9, 0.9));
      // Bursts of quick wingbeats between long glides.
      const burst = Math.max(0, Math.sin(t * 0.9 + b.ph * 3));
      const flap = Math.sin(t * 22 + b.ph) * 0.7 * burst;
      for (const w of b.wings) w.rotation.x = (w.userData.side as number) * (flap - 0.1);
    }
  };
  return { group, update };
}

// ------------------------------------------------------------------ drifting fluff

function fluff(): { points: THREE.Points; update: (cam: THREE.Vector3) => void } {
  const N = 900,
    T = 36;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pos.set([rnd() * T, 0.15 + rnd() * rnd() * 4, rnd() * T], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,250,1)');
  grad.addColorStop(0.35, 'rgba(255,255,245,0.55)');
  grad.addColorStop(1, 'rgba(255,255,240,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 32, 32);
  const m = new THREE.PointsMaterial({
    size: 0.3, // game units: seed fluff a little over a centimetre across
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    color: 0xfffdf0,
  });
  terrainUniforms.uTerrain.value ??= heightTexture();
  const centre = { value: new THREE.Vector2() };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainUniforms, {
      uCenter: centre,
      uTime: windUniforms.uTime,
      uWindDir: windUniforms.uWindDir,
      uWindScale: windUniforms.uWindScale,
      uWindStrength: windUniforms.uWindStrength,
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WIND_GLSL}
        uniform vec2 uCenter;
        uniform sampler2D uTerrain;
        ${TERRAIN_UV_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `
        float T = ${T.toFixed(1)};
        float id = position.x * 7.1 + position.z * 3.7;
        // Carried downwind about a metre a second, looping and bobbing on the eddies.
        vec2 drift = uWindDir * uTime * 1.1
          + vec2(sin(uTime * 0.7 + id), cos(uTime * 0.53 + id * 1.3)) * 0.8;
        vec2 p = position.xz + drift;
        p = p + T * floor((uCenter - p) / T + 0.5);
        float ground = terrainHeight(uTerrain, p);
        vec3 transformed = vec3(p.x, ground + position.y + 0.3 * sin(uTime * 0.9 + id * 2.0), p.y);
        `,
      );
  };
  m.customProgramCacheKey = () => 'farm-fluff';
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return { points, update: (cam) => centre.value.set(cam.x, cam.z) };
}

// ------------------------------------------------------------------ falling leaves

/**
 * Now and then a leaf lets go from one of the orchard trees near the camera and twirls down
 * on the breeze, then lies in the grass a while before the next one falls.
 */
function fallingLeaves() {
  const N = 40;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.quadraticCurveTo(0.42, -0.1, 0, 0.5);
  shape.quadraticCurveTo(-0.42, -0.1, 0, -0.5);
  const geo = new THREE.ShapeGeometry(shape, 4).scale(0.06, 0.06, 0.06);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }),
    N,
  );
  mesh.frustumCulled = false;
  mesh.name = 'falling-leaves';
  const greens = [0x6a9a3c, 0x8aa63c, 0xc9a43a, 0xb8782e];
  const leaves = Array.from({ length: N }, (_, i) => {
    mesh.setColorAt(i, new THREE.Color(greens[(rnd() * greens.length) | 0]!));
    return {
      t0: 0,
      life: 24 + rnd() * 12,
      from: new THREE.Vector3(),
      spin: rnd() * 6,
      ready: false,
    };
  });
  const trees = FARM.orchard.map(([x, y]) => [x, y] as const);
  const wd = windUniforms.uWindDir.value;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  const respawn = (l: (typeof leaves)[number], t: number, cam: THREE.Vector3) => {
    // A tree near the camera, so the leaves fall where someone can see them.
    let best = trees[(rnd() * trees.length) | 0]!;
    for (let k = 0; k < 6; k++) {
      const c = trees[(rnd() * trees.length) | 0]!;
      if (Math.hypot(c[0] - cam.x, -c[1] - cam.z) < Math.hypot(best[0] - cam.x, -best[1] - cam.z))
        best = c;
    }
    const a = rnd() * 6.3,
      d = rnd() * 1.6;
    const gx = best[0] + Math.cos(a) * d,
      gy = best[1] + Math.sin(a) * d;
    l.from.set(gx, groundHeight(gx, gy) + 2.2 + rnd() * 1.2, -gy);
    l.t0 = t;
    l.spin = rnd() * 6;
  };
  const update = (t: number, cam: THREE.Vector3) => {
    leaves.forEach((l, i) => {
      if (!l.ready) {
        // First frame: start each leaf somewhere in its cycle, near the camera.
        respawn(l, t, cam);
        l.t0 = t - rnd() * l.life;
        l.ready = true;
      }
      let age = t - l.t0;
      if (age > l.life || age < 0) {
        respawn(l, t, cam);
        age = 0;
      }
      // Falls about 0.4 m/s, drifting downwind and swinging side to side, then lies still.
      const fall = Math.min(age * 0.4, l.from.y - groundHeight(l.from.x, -l.from.z) - 0.02);
      const tFall = fall / 0.4;
      const sway = Math.sin(tFall * 2.6 + l.spin) * 0.35;
      p.set(
        l.from.x + wd.x * tFall * 0.5 + sway * -wd.y,
        l.from.y - fall,
        l.from.z + wd.y * tFall * 0.5 + sway * wd.x,
      );
      const landed = age * 0.4 >= fall + 0.001;
      q.setFromEuler(
        landed
          ? e.set(-Math.PI / 2, 0, l.spin)
          : e.set(
              Math.sin(tFall * 3 + l.spin) * 1.1,
              tFall * 2 + l.spin,
              Math.cos(tFall * 2.3) * 0.8,
            ),
      );
      mesh.setMatrixAt(i, m.compose(p, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}

// ------------------------------------------------------------------ barn cats

interface Cat {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Group[];
}

/** A barn cat about 45 cm long, nose along +x, standing on y = 0. */
function makeCat(coat: number, patch: number): Cat {
  const fur = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: patch, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.5 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd99a9a, roughness: 0.8 });
  const ball = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m);
    o.scale.set(sx, sy, sz);
    return o;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.2;
  root.add(body);
  body.add(ball(0.1, fur, 2.1, 1.05, 0.95));
  const chest = ball(0.075, white, 1, 1.1, 1);
  chest.position.set(0.13, -0.03, 0);
  body.add(chest);
  // Head on a pivot at the neck.
  const head = new THREE.Group();
  head.position.set(0.21, 0.07, 0);
  body.add(head);
  head.add(ball(0.068, fur, 1.05, 0.95, 1.05).translateX(0.03));
  const muzzle = ball(0.033, white, 1, 0.8, 1.2);
  muzzle.position.set(0.085, -0.02, 0);
  head.add(muzzle);
  const nose = ball(0.008, pink);
  nose.position.set(0.115, -0.008, 0);
  head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 4), fur);
    ear.position.set(0.02, 0.065, s * 0.038);
    ear.rotation.x = s * 0.25;
    head.add(ear);
    const eye = ball(0.011, dark);
    eye.position.set(0.085, 0.018, s * 0.028);
    head.add(eye);
  }
  // Legs on hip and shoulder pivots, with white paws.
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.13, 0.05],
    [0.13, -0.05],
    [-0.13, 0.05],
    [-0.13, -0.05],
  ] as const) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.02, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.17, 6), fur);
    leg.position.y = -0.085;
    const paw = ball(0.022, white, 1.3, 0.7, 1);
    paw.position.set(0.01, -0.17, 0);
    hip.add(leg, paw);
    body.add(hip);
    legs.push(hip);
  }
  // A tail of short segments, each hinged on the last, so it can curl and flick.
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.set(i === 0 ? -0.2 : -0.045, i === 0 ? 0.03 : 0, 0);
    const piece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016 - i * 0.0012, 0.018 - i * 0.0012, 0.05, 6),
      i === 6 ? white : fur,
    );
    piece.rotation.z = Math.PI / 2;
    piece.position.x = -0.022;
    seg.add(piece);
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, body, head, legs, tail };
}

/**
 * A couple of barn cats: an orange tabby sitting in the sun by the barn's south door,
 * looking about and flicking her tail, and a black-and-white tom patrolling along the
 * barn's east side, stopping now and then to sit and look around before heading back.
 */
function barnCats() {
  const group = new THREE.Group();
  group.name = 'barn-cats';
  const B = FARM.barn;
  // Map point in the barn's frame: `along` toward farm north, `out` toward farm east.
  const at = (along: number, out: number): XY => add(add(B.c, U, along), V, -out);
  const place = (c: Cat, p: XY, yaw: number) => {
    c.root.position.set(p[0], groundHeight(p[0], p[1]), -p[1]);
    c.root.rotation.y = yaw;
  };
  const grid = (FARM.farmGridDeg * Math.PI) / 180;

  // Sitting tabby: rear down, front legs straight, body tipped up.
  const sit = makeCat(0xd2843a, 0xf2e6d0);
  place(sit, at(-B.w / 2 - 1.4, 2.6), grid + Math.PI + 0.5);
  const sitPose = (c: Cat) => {
    c.body.rotation.z = 0.62;
    c.body.position.y = 0.17;
    c.legs[0]!.rotation.z = -0.62;
    c.legs[1]!.rotation.z = -0.62;
    c.legs[2]!.rotation.z = 0.55;
    c.legs[3]!.rotation.z = 0.55;
    c.head.rotation.z = -0.55;
  };
  sitPose(sit);
  group.add(sit.root);

  // Patrolling tom: walks the east side of the barn and back.
  const walk = makeCat(0x1c1c1e, 0xf4f2ec);
  group.add(walk.root);
  const A = at(-B.w / 2 + 1, B.h / 2 + 1.3),
    Bp = at(B.w / 2 - 1, B.h / 2 + 1.3);
  const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
  const speed = 0.35,
    rest = 6;
  const leg = len / speed;
  const cycle = 2 * (leg + rest);

  const update = (t: number) => {
    // Tabby: slow tail sweep, the odd flick, head turning to watch the yard.
    sit.tail.forEach((sg, i) => {
      sg.rotation.y = Math.sin(t * 0.8 + i * 0.5) * 0.18 + (i === 0 ? 1.2 : 0);
      sg.rotation.z = i === 0 ? -0.9 : 0.12 + Math.max(0, Math.sin(t * 0.37)) ** 8 * 0.5;
    });
    sit.head.rotation.y = Math.sin(t * 0.21) * 0.7 + Math.sin(t * 0.9) * 0.08;

    // Tom: walk, sit and look round, walk back, sit again.
    const k = ((t % cycle) + cycle) % cycle;
    const out = k < leg + rest;
    const kk = out ? k : k - (leg + rest);
    const walking = kk < leg;
    const f = out ? Math.min(1, kk / leg) : 1 - Math.min(1, kk / leg);
    const p: XY = [A[0] + (Bp[0] - A[0]) * f, A[1] + (Bp[1] - A[1]) * f];
    const heading = Math.atan2(Bp[1] - A[1], Bp[0] - A[0]) + (out ? 0 : Math.PI);
    place(walk, p, heading);
    if (walking) {
      const ph = t * 7;
      walk.body.rotation.z = 0;
      walk.body.position.y = 0.2 + Math.abs(Math.sin(ph)) * 0.01;
      walk.legs.forEach(
        (l, i) => (l.rotation.z = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45),
      );
      walk.head.rotation.set(0, Math.sin(t * 0.6) * 0.2, 0);
      // Tail held up with a curl at the tip.
      walk.tail.forEach((sg, i) => {
        sg.rotation.z = i === 0 ? -1.1 : i > 4 ? -0.35 : 0.08;
        sg.rotation.y = Math.sin(t * 2 + i * 0.6) * 0.08;
      });
    } else {
      sitPose(walk);
      walk.head.rotation.y = Math.sin(t * 0.5) * 0.8;
      walk.tail.forEach((sg, i) => {
        sg.rotation.z = i === 0 ? -0.9 : 0.1;
        sg.rotation.y = (i === 0 ? 1.1 : 0) + Math.sin(t * 1.3 + i * 0.4) * 0.15;
      });
    }
  };
  return { group, update };
}

// ------------------------------------------------------------------ all together

export function buildCritters(flowerSpots: BeeSpot[]) {
  const group = new THREE.Group();
  const bf = butterflies(flowerSpots);
  const sw = swallows();
  const fl = fluff();
  const lv = fallingLeaves();
  const cats = barnCats();
  group.add(bf.group, sw.group, fl.points, lv.mesh, cats.group);
  return {
    group,
    update(t: number, localCamera: THREE.Vector3) {
      bf.update(t);
      sw.update(t);
      fl.update(localCamera);
      lv.update(t, localCamera);
      cats.update(t);
    },
  };
}
