import * as THREE from 'three';
import * as tex from './textures.ts';
import { MAT, type VehicleModel, loftBody, shadowAll, wheel } from './modelKit.ts';

/**
 * 1995 Toyota Corolla sedan (E100), in white: a soft-cornered three-box saloon with slim
 * wraparound headlights, a narrow grille slot, a tall greenhouse on thin pillars, black rub
 * strips down the doors, wide red tail lamps and small steel wheels with silver hubcaps.
 * Real proportions: 4.37 m long, 1.69 m wide, 1.38 m tall.
 */
export function corolla(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const white = MAT.paint(0xf4f4f1, 0.32, 0.1);
  const black = MAT.paint(0x18191b, 0.7, 0.1);
  const grey = MAT.paint(0x2a2c30, 0.55, 0.2);

  // Lower body: bumper to bumper, hood low at the nose, a little higher over the trunk, with
  // round wheel arches cut up into the sills.
  const WHEEL_Z = [-1.3, 1.17];
  const lerpKeys = (keys: [number, number][], z: number) => {
    for (let i = 1; i < keys.length; i++) {
      const [z0, v0] = keys[i - 1]!,
        [z1, v1] = keys[i]!;
      if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
    }
    return keys[keys.length - 1]![1];
  };
  const tops: [number, number][] = [
    [-2.19, 0.6],
    [-2.13, 0.68],
    [-1.95, 0.74],
    [-1.45, 0.8],
    [-0.8, 0.85],
    [0, 0.87],
    [1.0, 0.89],
    [1.65, 0.9],
    [2.0, 0.88],
    [2.13, 0.8],
    [2.19, 0.68],
  ];
  const widths: [number, number][] = [
    [-2.19, 0.66],
    [-2.13, 0.78],
    [-1.95, 0.83],
    [-1.45, 0.845],
    [-0.8, 0.85],
    [1.0, 0.85],
    [1.65, 0.84],
    [2.0, 0.81],
    [2.13, 0.75],
    [2.19, 0.62],
  ];
  const sill: [number, number][] = [
    [-2.19, 0.3],
    [-2.13, 0.25],
    [2.0, 0.27],
    [2.13, 0.3],
    [2.19, 0.34],
  ];
  const ARCH_R = 0.4;
  const zs = new Set([-2.19, -2.13, -1.95, -0.8, 0, 0.6, 1.65, 2.0, 2.13, 2.19]);
  for (const wz of WHEEL_Z) for (let i = -8; i <= 8; i++) zs.add(wz + (i / 8) * (ARCH_R + 0.02));
  const hull = new THREE.Mesh(
    loftBody(
      [...zs]
        .sort((a, b) => b - a) // front last, as loftBody winds its faces
        .map((z) => {
          let bottom = lerpKeys(sill, z);
          for (const wz of WHEEL_Z) {
            const d = Math.abs(z - wz) / ARCH_R;
            if (d < 1) bottom = Math.max(bottom, 0.3 + 0.36 * Math.sqrt(1 - d * d));
          }
          return { z, w: lerpKeys(widths, z), top: lerpKeys(tops, z), bottom };
        }),
      0.62,
      0.22,
      40,
      0.32,
    ),
    white,
  );
  body.add(hull);

  // Greenhouse: dark glass all round, white roof and pillars on top.
  const cabinSections = [
    { z: -0.72, w: 0.8, top: 0.88, bottom: 0.8 },
    { z: -0.45, w: 0.77, top: 1.08, bottom: 0.8 },
    { z: -0.15, w: 0.73, top: 1.3, bottom: 0.8 },
    { z: 0.1, w: 0.71, top: 1.37, bottom: 0.8 },
    { z: 0.75, w: 0.7, top: 1.38, bottom: 0.8 },
    { z: 1.02, w: 0.71, top: 1.3, bottom: 0.8 },
    { z: 1.3, w: 0.75, top: 1.08, bottom: 0.82 },
    { z: 1.55, w: 0.79, top: 0.92, bottom: 0.84 },
  ];
  const glass = new THREE.Mesh(loftBody(cabinSections.reverse(), 0.6, 0.2, 36, 0.3), MAT.glass());
  body.add(glass);
  const roof = new THREE.Mesh(
    loftBody(
      [
        { z: 1.0, w: 0.6, top: 1.335, bottom: 1.28 },
        { z: 0.75, w: 0.63, top: 1.4, bottom: 1.34 },
        { z: 0.1, w: 0.64, top: 1.395, bottom: 1.33 },
        { z: -0.12, w: 0.6, top: 1.39, bottom: 1.33 },
      ],
      0.6,
      0.2,
      28,
      0.25,
    ),
    white,
  );
  body.add(roof);
  // Pillars: A (raked along the windscreen), B (between the doors), C (thick, behind),
  // each leaning in with the glass from the waist to the roof edge.
  const up = new THREE.Vector3(0, 1, 0);
  const pillar = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, a.distanceTo(b), t), white);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    body.add(m);
  };
  for (const s of [-1, 1]) {
    pillar(new THREE.Vector3(s * 0.76, 0.86, -0.7), new THREE.Vector3(s * 0.6, 1.36, -0.12), 0.07);
    pillar(new THREE.Vector3(s * 0.73, 0.84, 0.36), new THREE.Vector3(s * 0.62, 1.38, 0.36), 0.09);
    pillar(new THREE.Vector3(s * 0.74, 0.9, 1.42), new THREE.Vector3(s * 0.6, 1.33, 0.98), 0.2);
  }

  // Front: slim wraparound headlights, the grille slot and its emblem, the bumper's rub strip.
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.08), MAT.glow(0xfff4d6, 1.4));
    lamp.position.set(s * 0.5, 0.65, -2.14);
    lamp.rotation.y = s * -0.12;
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), MAT.glow(0xffa21a, 1));
    corner.position.set(s * 0.78, 0.65, -2.0);
    body.add(lamp, corner);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.06), black);
  grille.position.set(0, 0.64, -2.16);
  const badge = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), MAT.chrome());
  badge.scale.set(1.4, 1, 1);
  badge.position.set(0, 0.64, -2.2);
  body.add(grille, badge);
  const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.06), black);
  frontStrip.position.set(0, 0.46, -2.17);
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.05), grey);
  intake.position.set(0, 0.34, -2.15);
  body.add(frontStrip, intake);

  // Sides: black rub strips with a thin line in the player's colour, door handles, mirrors.
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 2.7), black);
    strip.position.set(s * 0.86, 0.55, 0.2);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 2.6), MAT.glow(accent, 1.2));
    line.position.set(s * 0.877, 0.55, 0.2);
    body.add(strip, line);
    for (const z of [-0.1, 0.75]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.13), black);
      handle.position.set(s * 0.86, 0.76, z);
      body.add(handle);
    }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.08), black);
    mirror.position.set(s * 0.9, 0.93, -0.62);
    body.add(mirror);
    // Door shut lines.
    for (const z of [-0.72, 0.36, 1.3]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.5, 0.012), grey);
      seam.position.set(s * 0.852, 0.6, z);
      body.add(seam);
    }
  }

  // Rear: wide red tail lamps with amber inners, the plate between them, the rub strip.
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), MAT.glow(0xd01818, 1.6));
    tail.position.set(s * 0.53, 0.72, 2.16);
    const amber = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.065), MAT.glow(0xff8a1a, 1));
    amber.position.set(s * 0.26, 0.72, 2.165);
    const reverse = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.16, 0.066),
      MAT.glow(0xf2f2ea, 0.5),
    );
    reverse.position.set(s * 0.165, 0.72, 2.165);
    body.add(tail, amber, reverse);
  }
  const plateTex = tex.decal((x, w, h) => {
    x.fillStyle = '#f6f3e8';
    x.fillRect(0, h * 0.25, w, h * 0.5);
    x.strokeStyle = '#1c2a5a';
    x.lineWidth = 6;
    x.strokeRect(4, h * 0.25 + 4, w - 8, h * 0.5 - 8);
    x.fillStyle = '#1c2a5a';
    x.font = 'bold 40px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('3XR 95', w / 2, h / 2 + 2);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.52),
    new THREE.MeshStandardMaterial({ map: plateTex, transparent: true, roughness: 0.5 }),
  );
  plate.position.set(0, 0.52, 2.2);
  const rearStrip = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.06), black);
  rearStrip.position.set(0, 0.42, 2.17);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 10), MAT.chrome());
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0.5, 0.25, 2.14);
  body.add(plate, rearStrip, pipe);

  // 14-inch steel wheels behind plain silver hubcaps.
  const hubcap = tex.decal((x, w, h) => {
    x.fillStyle = '#c9ccd1';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#8d9097';
    for (let i = 0; i < 8; i++) {
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate((i / 8) * Math.PI * 2);
      x.fillRect(w * 0.16, -w * 0.035, w * 0.26, w * 0.07);
      x.restore();
    }
    x.fillStyle = '#e3e5e8';
    x.beginPath();
    x.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2);
    x.fill();
  });
  const wheels: THREE.Object3D[] = [];
  for (const z of WHEEL_Z) {
    for (const s of [-1, 1]) {
      const w = wheel(0.3, 0.2, grey, hubcap);
      w.position.set(s * 0.74, 0.3, z);
      root.add(w);
      wheels.push(w);
    }
  }
  // Dark wheel wells behind the wheels, seen through the arches.
  for (const z of WHEEL_Z) {
    const well = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.78), black);
    well.position.set(0, 0.46, z);
    body.add(well);
  }

  shadowAll(body);
  root.add(body);
  root.userData = { body, wheels, exhausts: [new THREE.Vector3(0.5, 0.25, 2.25)], hover: false };
  return root;
}
