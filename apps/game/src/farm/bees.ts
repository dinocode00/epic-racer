import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Somewhere bees work: a centre in farm-local metres (x, height, z), a reach, how many. */
export interface BeeSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  n: number;
}

/** One honeybee about 6 cm long (a touch big so it reads at miniature scale), nose along +x. */
function beeGeo(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 10, 6);
  body.scale(0.03, 0.0165, 0.0165);
  const col: number[] = [];
  const p = body.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    // Black head, then amber and black bands down the abdomen.
    const c = x > 0.018 ? 0x231a10 : Math.floor((x + 0.03) / 0.0082) % 2 ? 0xe0a21e : 0x2a2014;
    const cc = new THREE.Color(c);
    col.push(cc.r, cc.g, cc.b);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const wings: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.CircleGeometry(1, 8);
    w.scale(0.018, 0.009, 1);
    w.rotateX(-Math.PI / 2);
    w.rotateY(s * 0.5);
    w.translate(0.003, 0.0135, s * 0.0165);
    const wc: number[] = [];
    for (let i = 0; i < w.attributes.position!.count; i++) wc.push(0.9, 0.93, 0.95);
    w.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    w.deleteAttribute('uv');
    wings.push(w);
  }
  body.deleteAttribute('uv');
  return mergeGeometries([body, ...wings])!;
}

/**
 * Honeybees drifting round the flowers and fallen fruit: each wanders a loose loop about its
 * spot, bobbing and turning to face where it is going.
 */
export function bees(spots: BeeSpot[]): { mesh: THREE.InstancedMesh; update: (t: number) => void } {
  let seed = 777;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bs: { s: BeeSpot; f: number[]; ph: number[]; lift: number }[] = [];
  for (const s of spots)
    for (let i = 0; i < s.n; i++)
      bs.push({
        s,
        f: [0.35 + rnd() * 0.5, 0.5 + rnd() * 0.7, 1.3 + rnd() * 1.5],
        ph: [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3],
        lift: rnd() * 0.25,
      });
  const mesh = new THREE.InstancedMesh(
    beeGeo(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    bs.length,
  );
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    pos = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1),
    e = new THREE.Euler();
  const at = (b: (typeof bs)[number], t: number, out: THREE.Vector3) => {
    const { s, f, ph } = b;
    return out.set(
      s.x + s.r * Math.sin(t * f[0]! + ph[0]!),
      s.y + b.lift + 0.12 * Math.sin(t * f[2]! + ph[2]!),
      s.z + s.r * Math.sin(t * f[1]! + ph[1]!),
    );
  };
  const ahead = new THREE.Vector3();
  const update = (t: number) => {
    bs.forEach((b, i) => {
      at(b, t, pos);
      at(b, t + 0.15, ahead);
      e.set(0, Math.atan2(-(ahead.z - pos.z), ahead.x - pos.x), 0);
      // A fast flutter so they never sit quite still.
      pos.y += Math.sin(t * 40 + i) * 0.006;
      mesh.setMatrixAt(i, m.compose(pos, q.setFromEuler(e), one));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}
