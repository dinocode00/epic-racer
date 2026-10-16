import * as THREE from 'three';
import { MAT, type VehicleModel, loftBody, shadowAll } from './modelKit.ts';
import * as tex from './textures.ts';

/**
 * The Nazgûl: a black horse with a galloping leg rig, ridden by a hooded wraith
 * whose face is an empty void, with a long tattered cloak that streams at speed.
 * Faces -Z, hooves on y = 0.
 */

const BLACK_COAT = () =>
  new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.35, metalness: 0.25 });
const ROBE = () => new THREE.MeshStandardMaterial({ color: 0x1b1b21, roughness: 0.9 });
const STEEL = () =>
  new THREE.MeshStandardMaterial({ color: 0x3b3e46, roughness: 0.32, metalness: 0.85 });

let tatterTex: THREE.Texture | null = null;
/** White cloth with a ragged, torn lower edge and a few holes (used as an alpha map). */
function tatters(): THREE.Texture {
  if (tatterTex) return tatterTex;
  tatterTex = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#000';
      // Torn bottom edge: tall jagged spikes.
      x.beginPath();
      x.moveTo(0, h);
      for (let px = 0; px <= w; px += 6) {
        const depth = 12 + tex.rnd() * (tex.rnd() < 0.3 ? 110 : 45);
        x.lineTo(px, h - depth);
        x.lineTo(px + 3, h - 4 - tex.rnd() * 10);
      }
      x.lineTo(w, h);
      x.closePath();
      x.fill();
      // Ragged sides near the bottom, and moth holes.
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 0 : w;
        const y = h * (0.45 + tex.rnd() * 0.5);
        x.beginPath();
        x.ellipse(side, y, 4 + tex.rnd() * 8, 6 + tex.rnd() * 14, 0, 0, Math.PI * 2);
        x.fill();
      }
      for (let i = 0; i < 9; i++) {
        x.beginPath();
        x.ellipse(
          tex.rnd() * w,
          h * (0.5 + tex.rnd() * 0.35),
          2 + tex.rnd() * 5,
          4 + tex.rnd() * 9,
          tex.rnd(),
          0,
          Math.PI * 2,
        );
        x.fill();
      }
    },
    128,
    256,
  );
  return tatterTex;
}

function rag(w: number, h: number, segX = 4, segY = 8): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, segX, segY).translate(0, -h / 2, 0);
  const m = new THREE.MeshStandardMaterial({
    color: 0x121215,
    roughness: 0.95,
    side: THREE.DoubleSide,
    alphaMap: tatters(),
    alphaTest: 0.5,
  });
  return new THREE.Mesh(g, m);
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  front: boolean;
  offset: number;
}

function buildLeg(front: boolean, x: number, z: number, offset: number, coat: THREE.Material): Leg {
  const hip = new THREE.Group();
  hip.position.set(x, front ? 1.24 : 1.32, z);
  const upperR = front ? 0.085 : 0.12;
  const upperLen = front ? 0.4 : 0.36;
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(upperR, upperLen, 6, 12), coat);
  upper.position.y = -0.28;
  hip.add(upper);
  const knee = new THREE.Group();
  knee.position.y = front ? -0.6 : -0.66;
  hip.add(knee);
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.4, 6, 10), coat);
  lower.position.y = -0.25;
  knee.add(lower);
  // Feathered fetlock and a steel-shod hoof.
  const fetlock = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 10, 1, true), coat);
  fetlock.position.y = -0.46;
  knee.add(fetlock);
  const hoof = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 0.09, 12),
    MAT.paint(0x1a1a1c, 0.6, 0.3),
  );
  hoof.position.y = front ? -0.6 : -0.62;
  knee.add(hoof);
  return { hip, knee, front, offset };
}

export function nazgul(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const rig = new THREE.Group(); // bobs and pitches with the gallop
  body.add(rig);
  const coat = BLACK_COAT();
  const robe = ROBE();
  const steel = STEEL();

  // ---------------- Horse ----------------
  const torso = new THREE.Mesh(
    loftBody(
      [
        { z: 1.02, w: 0.12, top: 1.66, bottom: 1.5 },
        { z: 0.9, w: 0.3, top: 1.8, bottom: 1.2 },
        { z: 0.5, w: 0.36, top: 1.78, bottom: 1.1 },
        { z: 0.0, w: 0.35, top: 1.72, bottom: 1.05 },
        { z: -0.45, w: 0.34, top: 1.78, bottom: 1.08 },
        { z: -0.8, w: 0.29, top: 1.9, bottom: 1.16 },
        { z: -0.98, w: 0.16, top: 1.8, bottom: 1.32 },
      ],
      0,
      0.2,
      32,
      0.9,
    ),
    coat,
  );
  rig.add(torso);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.72, 8, 16), coat);
  neck.position.set(0, 2.08, -1.06);
  neck.rotation.x = -0.62;
  neck.scale.set(0.72, 1, 1.15);
  rig.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 2.46, -1.3);
  head.rotation.x = -Math.PI / 4;
  rig.add(head);
  const skull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.135, 0.5, 8, 16).rotateX(Math.PI / 2),
    coat,
  );
  skull.position.z = -0.3;
  skull.scale.set(0.82, 1, 1);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 8), coat);
    ear.position.set(s * 0.07, 0.16, 0.04);
    ear.rotation.x = 0.35;
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), MAT.glow(0xff2a10, 3));
    eye.position.set(s * 0.105, 0.06, -0.12);
    head.add(eye);
  }
  // Spiked steel chanfron down the face.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.46), steel);
  plate.position.set(0, 0.125, -0.32);
  head.add(plate);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 8), steel);
  spike.position.set(0, 0.2, -0.12);
  spike.rotation.x = -0.6;
  head.add(spike);

  // Mane: ragged strips along the neck.
  const mane: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const strip = rag(0.12, 0.34, 1, 3);
    strip.position.set(0.04, 1.94 + t * 0.55, -0.82 - t * 0.42);
    strip.rotation.set(-0.5, 0, 0.5);
    rig.add(strip);
    mane.push(strip);
  }
  // Tail: a pivoting bundle of tapering strands.
  const tail = new THREE.Group();
  tail.position.set(0, 1.68, 1.0);
  rig.add(tail);
  for (let i = 0; i < 5; i++) {
    const strand = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 1.25, 6).translate(0, -0.62, 0),
      coat,
    );
    strand.rotation.set(0, 0, (i - 2) * 0.08);
    strand.rotation.x = (i % 2) * 0.1;
    tail.add(strand);
  }

  // Saddle cloth with ragged drapes in the player's colour trim.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.9), robe);
  saddle.position.set(0, 1.79, -0.05);
  rig.add(saddle);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.02, 0.06), MAT.glow(accent, 1.2));
  trim.position.set(0, 1.82, 0.38);
  rig.add(trim);
  for (const s of [-1, 1]) {
    const drape = rag(0.9, 0.55, 4, 4);
    drape.position.set(s * 0.37, 1.79, -0.05);
    drape.rotation.y = (s * Math.PI) / 2;
    drape.rotation.x = 0;
    rig.add(drape);
  }

  // Legs.
  const legs: Leg[] = [
    buildLeg(true, -0.2, -0.62, 0.5, coat),
    buildLeg(true, 0.2, -0.62, 0.62, coat),
    buildLeg(false, -0.2, 0.66, 0.0, coat),
    buildLeg(false, 0.2, 0.66, 0.1, coat),
  ];
  legs.forEach((l) => rig.add(l.hip));
  // Shoulder and haunch muscle so the legs grow out of the body.
  for (const sx of [-1, 1]) {
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), coat);
    haunch.scale.set(0.17, 0.36, 0.36);
    haunch.position.set(sx * 0.21, 1.42, 0.62);
    rig.add(haunch);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), coat);
    shoulder.scale.set(0.14, 0.34, 0.22);
    shoulder.position.set(sx * 0.2, 1.42, -0.62);
    shoulder.rotation.x = 0.25;
    rig.add(shoulder);
  }
  // Chest and belly line.
  const chestMass = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), coat);
  chestMass.scale.set(0.27, 0.36, 0.26);
  chestMass.position.set(0, 1.5, -0.86);
  rig.add(chestMass);

  // ---------------- Wraith ----------------
  const rider = new THREE.Group();
  rider.position.set(0, 1.82, -0.05);
  rider.scale.setScalar(1.12);
  rider.rotation.x = -0.22; // hunched forward
  rig.add(rider);

  const lap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), robe);
  lap.scale.set(0.3, 0.16, 0.32);
  lap.position.y = 0.06;
  rider.add(lap);
  const robePts = [
    [0.0, 0.0],
    [0.27, 0.0],
    [0.29, 0.16],
    [0.24, 0.42],
    [0.29, 0.58],
    [0.25, 0.66],
    [0.12, 0.72],
    [0.0, 0.74],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const chest = new THREE.Mesh(new THREE.LatheGeometry(robePts, 24), robe);
  chest.scale.set(1.15, 1, 0.9);
  chest.position.y = 0.05;
  rider.add(chest);

  // Hood with an empty black void where the face should be.
  const hoodG = new THREE.Group();
  hoodG.position.set(0, 0.92, -0.04);
  hoodG.rotation.x = 0.25;
  rider.add(hoodG);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 24, 16, -Math.PI / 2 + 0.75, Math.PI * 2 - 1.5),
    new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.95, side: THREE.DoubleSide }),
  );
  hood.scale.set(0.95, 1.25, 1.2);
  hoodG.add(hood);
  const voidFace = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  voidFace.position.z = 0.01;
  hoodG.add(voidFace);
  // Tall peak that falls back over the shoulders.
  const peak = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.42, 12).translate(0, 0.21, 0),
    hood.material,
  );
  peak.position.set(0, 0.14, 0.08);
  peak.rotation.x = 1.25;
  peak.scale.set(1, 1, 0.7);
  hoodG.add(peak);

  // Arms, steel gauntlets, sword and reins.
  const hands: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Vector3(s * 0.27, 0.6, -0.04);
    const hand = new THREE.Vector3(s * 0.2, 0.25, -0.5);
    const mid = shoulder.clone().add(hand).multiplyScalar(0.5);
    const len = shoulder.distanceTo(hand);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, len, 6, 10), robe);
    arm.position.copy(mid);
    arm.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      hand.clone().sub(shoulder).normalize(),
    );
    rider.add(arm);
    const glove = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), steel);
    glove.position.copy(hand);
    rider.add(glove);
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.07, 6), steel);
      sp.position.copy(hand).add(new THREE.Vector3(s * 0.05, 0.03, 0.02 + k * 0.035));
      sp.rotation.z = -s * 1.2;
      rider.add(sp);
    }
    hands.push(hand);
    // Armoured boot in the stirrup, robe skirt over the leg.
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), steel);
    boot.position.set(s * 0.43, -0.42, -0.12);
    rider.add(boot);
    const toe = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2), steel);
    toe.position.set(s * 0.43, -0.42, -0.32);
    rider.add(toe);
    const skirt = rag(0.6, 0.58, 3, 4);
    skirt.position.set(s * 0.44, 0.1, 0.0);
    skirt.rotation.y = (s * Math.PI) / 2;
    rider.add(skirt);
  }
  // Sword in the right hand, held forward like a charge.
  const sword = new THREE.Group();
  sword.position.copy(hands[1]!);
  sword.rotation.set(-1.15, -0.15, 0);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 1.1, 0.014),
    new THREE.MeshStandardMaterial({
      color: 0xd7dce6,
      metalness: 1,
      roughness: 0.12,
      emissive: 0x2a3550,
      emissiveIntensity: 0.6,
    }),
  );
  blade.position.y = 0.63;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.05), steel);
  guard.position.y = 0.06;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), robe);
  grip.position.y = -0.04;
  sword.add(blade, guard, grip);
  rider.add(sword);
  // Reins from the left fist to the bit.
  const bit = new THREE.Vector3(0, 2.06, -1.72);
  const leftHandWorld = hands[0]!
    .clone()
    .multiplyScalar(1.12)
    .applyEuler(rider.rotation)
    .add(rider.position);
  for (const s of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(
      leftHandWorld,
      leftHandWorld
        .clone()
        .lerp(bit, 0.5)
        .add(new THREE.Vector3(s * 0.12, -0.15, 0)),
      bit.clone().add(new THREE.Vector3(s * 0.1, 0, 0)),
    );
    rig.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.012, 4), MAT.paint(0x2a2018, 0.8, 0)));
  }

  // Cloak: a tattered sheet from the shoulders that streams back with speed.
  const cloakGeo = new THREE.PlaneGeometry(1.0, 1.9, 8, 16).translate(0, -0.95, 0);
  const base = (cloakGeo.attributes.position as THREE.BufferAttribute).array.slice();
  const cloak = new THREE.Mesh(
    cloakGeo,
    new THREE.MeshStandardMaterial({
      color: 0x0f0f12,
      roughness: 0.95,
      side: THREE.DoubleSide,
      alphaMap: tatters(),
      alphaTest: 0.5,
    }),
  );
  cloak.position.set(0, 2.55, 0.05);
  rig.add(cloak);

  shadowAll(body);
  cloak.castShadow = false;
  mane.forEach((m) => (m.castShadow = false));
  root.add(body);

  // ---------------- Animation ----------------
  let phase = 0;
  let gait = 0;
  let stream = 0;
  const animate = (t: number, speed: number, dt: number): void => {
    const v = Math.abs(speed);
    gait += ((v > 0.8 ? 1 : 0) - gait) * Math.min(1, dt * 4);
    phase = (phase + dt * Math.min(2.6, 0.6 + v / 5)) % 1;
    for (const l of legs) {
      const a = 2 * Math.PI * (phase + l.offset);
      const swing = Math.sin(a) * (l.front ? 0.6 : 0.52) * gait;
      const fold = Math.max(0, Math.cos(a)) * gait;
      l.hip.rotation.x = swing;
      l.knee.rotation.x = l.front ? -fold * 1.35 : fold * 1.0;
    }
    rig.position.y = Math.sin(phase * 4 * Math.PI) * 0.05 * gait;
    rig.rotation.x = Math.sin(phase * 2 * Math.PI) * 0.045 * gait;
    head.rotation.x = -Math.PI / 4 + Math.sin(phase * 2 * Math.PI + 1) * 0.08 * gait;
    tail.rotation.x = 0.35 + Math.min(1, v / 30) * 0.9 + Math.sin(t * 7) * 0.08;
    tail.rotation.z = Math.sin(t * 3.3) * 0.12;
    mane.forEach((m, i) => (m.rotation.z = 0.5 + Math.sin(t * 9 + i) * 0.25 * (0.3 + gait)));

    stream += (Math.min(1, v / 30) - stream) * Math.min(1, dt * 6);
    const pos = cloakGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3]!,
        by = base[i * 3 + 1]!;
      const along = -by; // 0 at shoulders .. 1.75 at hem
      const f = along / 1.9;
      const bend = 0.18 + f * (0.25 + stream * 1.15);
      let z = along * Math.sin(bend) * (0.6 + stream * 0.5);
      let y = -along * Math.cos(bend);
      let x = bx * (0.55 + f * 0.75);
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
    rear: [new THREE.Vector3(-0.2, 0.05, 0.7), new THREE.Vector3(0.2, 0.05, 0.7)],
    animate,
  };
  return root;
}
