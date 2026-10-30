import * as THREE from 'three';
import { WIND_GLSL, windUniforms } from '../render/wind.ts';
import type { BeeSpot } from './bees.ts';
import { TERRAIN_UV_GLSL, heightTexture, terrainUniforms } from './grass.ts';
import { FARM, groundHeight } from './layout.ts';

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
    const h = Math.max(groundHeight(x, y) + 0.5, g0 + b.h + Math.sin(a * 1.9 + b.ph) * 2.6);
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

// ------------------------------------------------------------------ all together

export function buildCritters(flowerSpots: BeeSpot[]) {
  const group = new THREE.Group();
  const bf = butterflies(flowerSpots);
  const sw = swallows();
  const fl = fluff();
  group.add(bf.group, sw.group, fl.points);
  return {
    group,
    update(t: number, localCamera: THREE.Vector3) {
      bf.update(t);
      sw.update(t);
      fl.update(localCamera);
    },
  };
}
