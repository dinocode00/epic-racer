import * as THREE from 'three';
import { DETAIL, MAT, type VehicleModel, foldedLathe, shadowAll, tube } from './modelKit.ts';
import { buildHorse, rag, ragMaterial } from './horse.ts';

/**
 * The Nazgûl: a black horse ridden by a hooded wraith whose face is an empty void, in
 * folded robes and a long tattered cloak that streams at speed. Faces -Z.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function nazgul(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const horse = buildHorse({
    coat: 0x16161b,
    eyes: 0xff2a10,
    armor: true,
    barding: 0x141418,
    trim: accent,
  });
  const rig = horse.rig;
  body.add(rig);
  const bit = horse.bit;
  const robe = DETAIL.fabric(0x1a1a20);
  const steel = DETAIL.steel();

  // ---------------- Wraith ----------------
  const rider = new THREE.Group();
  rider.position.set(0, 1.9, -0.05);
  rider.rotation.x = -0.24; // hunched forward
  rider.scale.setScalar(1.12);
  rig.add(rider);

  // Robe: a folded lathe from the saddle to the shoulders, flaring over the horse's flanks.
  const robeBody = new THREE.Mesh(
    foldedLathe(
      [
        [0.42, -0.42],
        [0.36, -0.18],
        [0.28, 0.05],
        [0.25, 0.3],
        [0.29, 0.5],
        [0.27, 0.6],
        [0.14, 0.7],
        [0.06, 0.73],
      ],
      11,
      0.12,
      56,
    ),
    robe,
  );
  robeBody.scale.set(1.1, 1, 0.82);
  rider.add(robeBody);

  // Hood: a deep folded cowl, open at the front onto an empty void.
  const hoodG = new THREE.Group();
  hoodG.position.set(0, 0.66, -0.03);
  hoodG.rotation.x = 0.22;
  rider.add(hoodG);
  const hoodMat = DETAIL.fabric(0x17171c);
  const hood = new THREE.Mesh(
    foldedLathe(
      [
        [0.2, 0.0],
        [0.235, 0.12],
        [0.23, 0.26],
        [0.18, 0.38],
        [0.09, 0.45],
        [0.0, 0.47],
      ],
      7,
      0.06,
      40,
      Math.PI + 0.85,
      Math.PI * 2 - 1.7,
    ),
    hoodMat,
  );
  hood.scale.set(1, 1, 1.15);
  hoodG.add(hood);
  const voidFace = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  voidFace.position.set(0, 0.22, 0.0);
  hoodG.add(voidFace);
  // Peak that falls back over the shoulders.
  const peak = new THREE.Mesh(
    tube(
      new THREE.CatmullRomCurve3([V(0, 0.38, 0.02), V(0, 0.48, 0.16), V(0, 0.44, 0.34)]),
      [
        { t: 0, w: 0.12, h: 0.09 },
        { t: 1, w: 0.01, h: 0.01 },
      ],
      10,
      12,
    ),
    hoodMat,
  );
  hoodG.add(peak);

  // Arms with steel vambraces, plated gauntlets, sword and reins.
  const hands: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const shoulder = V(s * 0.27, 0.55, -0.02);
    const elbow = V(s * 0.33, 0.25, -0.2);
    const hand = V(s * 0.18, 0.2, -0.52);
    const sleeve = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([shoulder, elbow, hand]),
        [
          { t: 0, w: 0.1, h: 0.1 },
          { t: 0.5, w: 0.08, h: 0.08 },
          { t: 0.75, w: 0.1, h: 0.1 },
          { t: 1, w: 0.06, h: 0.06 },
        ],
        16,
        12,
        V(0, 0, -1),
      ),
      robe,
    );
    rider.add(sleeve);
    const vambrace = new THREE.Mesh(
      tube(
        new THREE.LineCurve3(elbow.clone().lerp(hand, 0.35), elbow.clone().lerp(hand, 0.92)),
        [
          { t: 0, w: 0.068, h: 0.068 },
          { t: 1, w: 0.055, h: 0.055 },
        ],
        6,
        14,
        V(0, 1, 0),
      ),
      steel,
    );
    rider.add(vambrace);
    const glove = new THREE.Group();
    glove.position.copy(hand);
    for (let k = 0; k < 4; k++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.05), steel);
      plate.position.set(0, -k * 0.03, -0.02 - k * 0.012);
      plate.rotation.x = k * 0.35;
      glove.add(plate);
    }
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 6), steel);
      sp.position.set(-0.035 + k * 0.035, 0.03, 0.02);
      sp.rotation.x = 0.4;
      glove.add(sp);
    }
    rider.add(glove);
    hands.push(hand);
    // Armoured boot in the stirrup.
    const boot = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([
          V(s * 0.42, -0.3, 0.02),
          V(s * 0.44, -0.5, -0.04),
          V(s * 0.44, -0.55, -0.24),
        ]),
        [
          { t: 0, w: 0.065, h: 0.065 },
          { t: 0.7, w: 0.06, h: 0.07 },
          { t: 1, w: 0.02, h: 0.03 },
        ],
        12,
        12,
        V(0, 0, -1),
      ),
      steel,
    );
    rider.add(boot);
    const skirt = rag(0.62, 0.62, 4, 5, 0x18181d);
    skirt.position.set(s * 0.43, -0.05, 0.0);
    skirt.rotation.y = (s * Math.PI) / 2;
    rider.add(skirt);
  }
  // Sword in the right hand, held forward like a charge.
  const sword = new THREE.Group();
  sword.position.copy(hands[1]!);
  sword.rotation.set(-1.15, -0.15, 0);
  const bladeShape = new THREE.Shape([
    new THREE.Vector2(-0.035, 0),
    new THREE.Vector2(0.035, 0),
    new THREE.Vector2(0.03, 0.95),
    new THREE.Vector2(0, 1.12),
    new THREE.Vector2(-0.03, 0.95),
  ]);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.006,
      bevelSegments: 1,
    }),
    new THREE.MeshStandardMaterial({
      color: 0xd7dce6,
      metalness: 1,
      roughness: 0.12,
      emissive: 0x2a3550,
      emissiveIntensity: 0.6,
    }),
  );
  blade.position.set(0, 0.08, -0.004);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), steel);
  guard.position.y = 0.07;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8),
    MAT.paint(0x111111, 0.8, 0),
  );
  grip.position.y = -0.04;
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), steel);
  pommel.position.y = -0.15;
  sword.add(blade, guard, grip, pommel);
  rider.add(sword);
  // Reins from the left fist to the bit.
  const leftHandWorld = hands[0]!
    .clone()
    .multiplyScalar(1.12)
    .applyEuler(rider.rotation)
    .add(rider.position);
  for (const s of [-1, 1]) {
    const target = bit.clone().add(V(s * 0.1, -0.04, 0));
    const c = new THREE.QuadraticBezierCurve3(
      leftHandWorld,
      leftHandWorld
        .clone()
        .lerp(target, 0.5)
        .add(V(s * 0.08, -0.12, 0)),
      target,
    );
    rig.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.01, 4), MAT.paint(0x2a2018, 0.8, 0)));
  }

  // Cloak: a tattered sheet from the shoulders that streams back with speed.
  const cloakGeo = new THREE.PlaneGeometry(1.0, 1.9, 12, 18).translate(0, -0.95, 0);
  const base = (cloakGeo.attributes.position as THREE.BufferAttribute).array.slice();
  const cloak = new THREE.Mesh(cloakGeo, ragMaterial(0x121216));
  cloak.position.set(0, 2.62, 0.05);
  rig.add(cloak);

  shadowAll(body);
  cloak.castShadow = false;
  horse.mane.forEach((m) => (m.castShadow = false));
  root.add(body);

  // ---------------- Animation ----------------
  let stream = 0;
  const animate = (t: number, speed: number, dt: number): void => {
    const v = Math.abs(speed);
    horse.animate(t, speed, dt);
    stream += (Math.min(1, v / 30) - stream) * Math.min(1, dt * 6);
    const pos = cloakGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3]!,
        by = base[i * 3 + 1]!;
      const along = -by;
      const f = along / 1.9;
      const bend = 0.18 + f * (0.25 + stream * 1.15);
      let z = along * Math.sin(bend) * (0.6 + stream * 0.5);
      let y = -along * Math.cos(bend);
      let x = bx * (0.55 + f * 0.75);
      // Vertical folds plus wind ripple.
      z += Math.sin(bx * 15) * 0.035 * (0.4 + f);
      z += Math.sin(t * 9 + f * 7 + bx * 4) * 0.07 * f * (0.3 + stream);
      y += Math.sin(t * 11 + bx * 6) * 0.04 * f * stream;
      x += Math.sin(t * 7 + f * 5) * 0.04 * f;
      pos.setXYZ(i, x, y, z + 0.1);
    }
    pos.needsUpdate = true;
    cloakGeo.computeVertexNormals();
  };
  animate(0, 0, 0);

  root.userData = {
    body,
    wheels: [],
    exhausts: [],
    hover: false,
    ghost: true,
    camHeight: 3.7,
    rear: [V(-0.19, 0.05, 0.75), V(0.19, 0.05, 0.75)],
    animate,
  };
  return root;
}
