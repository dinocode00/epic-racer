import * as THREE from 'three';
import * as tex from './textures.ts';
import { MAT, type VehicleModel, loftBody, shadowAll, wheel } from './modelKit.ts';

/**
 * 1989 Toyota Land Cruiser wagon (FJ62), in dark green: a tall, square-shouldered box with
 * an upright glasshouse on thin pillars, four stacked rectangular headlamps either side of a
 * chrome grille, a heavy chrome front bumper, black fender flares over big tyres, a snorkel,
 * vertical tail lamps, and a black steel roof rack carrying a duffel and a jerry can.
 * Real proportions: 4.68 m long, 1.8 m wide, 1.8 m tall (2.05 m over the rack).
 */
export function landCruiser(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const green = MAT.paint(0x1f3b2a, 0.38, 0.25);
  const black = MAT.paint(0x141516, 0.7, 0.1);
  const steel = MAT.paint(0x1c1d1f, 0.45, 0.6);
  const chrome = MAT.chrome();

  // Lower body: a near-square section, hood level with the waist, arches cut for big tyres.
  const WHEEL_Z = [-1.42, 1.31];
  const WHEEL_R = 0.4;
  const lerpKeys = (keys: [number, number][], z: number) => {
    for (let i = 1; i < keys.length; i++) {
      const [z0, v0] = keys[i - 1]!,
        [z1, v1] = keys[i]!;
      if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
    }
    return keys[keys.length - 1]![1];
  };
  const tops: [number, number][] = [
    [-2.34, 1.02],
    [-2.3, 1.08],
    [-2.2, 1.1],
    [-0.95, 1.12],
    [2.3, 1.13],
    [2.34, 1.08],
  ];
  const widths: [number, number][] = [
    [-2.34, 0.84],
    [-2.3, 0.89],
    [-2.2, 0.9],
    [2.3, 0.9],
    [2.34, 0.86],
  ];
  const sill: [number, number][] = [
    [-2.34, 0.56],
    [-2.3, 0.5],
    [2.3, 0.5],
    [2.34, 0.56],
  ];
  const ARCH_R = 0.52;
  const zs = new Set([-2.34, -2.3, -2.2, -0.95, 0, 0.5, 2.0, 2.3, 2.34]);
  for (const wz of WHEEL_Z) for (let i = -8; i <= 8; i++) zs.add(wz + (i / 8) * (ARCH_R + 0.02));
  const hull = new THREE.Mesh(
    loftBody(
      [...zs]
        .sort((a, b) => b - a) // front last, as loftBody winds its faces
        .map((z) => {
          let bottom = lerpKeys(sill, z);
          for (const wz of WHEEL_Z) {
            const d = Math.abs(z - wz) / ARCH_R;
            if (d < 1) bottom = Math.max(bottom, 0.42 + 0.5 * Math.sqrt(1 - d * d));
          }
          return { z, w: lerpKeys(widths, z), top: lerpKeys(tops, z), bottom };
        }),
      0.62,
      0.22,
      40,
      0.14,
    ),
    green,
  );
  body.add(hull);

  // Upright glasshouse running right to the tailgate, roof on top.
  const glass = new THREE.Mesh(
    loftBody(
      [
        { z: 2.32, w: 0.83, top: 1.72, bottom: 1.1 },
        { z: 2.26, w: 0.84, top: 1.78, bottom: 1.1 },
        { z: -0.6, w: 0.84, top: 1.78, bottom: 1.1 },
        { z: -0.93, w: 0.86, top: 1.16, bottom: 1.1 },
      ],
      0.6,
      0.2,
      36,
      0.12,
    ),
    MAT.glass(),
  );
  body.add(glass);
  const roof = new THREE.Mesh(
    loftBody(
      [
        { z: 2.3, w: 0.83, top: 1.8, bottom: 1.74 },
        { z: -0.58, w: 0.83, top: 1.82, bottom: 1.74 },
        { z: -0.66, w: 0.8, top: 1.8, bottom: 1.75 },
      ],
      0.6,
      0.2,
      28,
      0.12,
    ),
    green,
  );
  body.add(roof);
  const up = new THREE.Vector3(0, 1, 0);
  const strut = (a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, a.distanceTo(b), t), m);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    body.add(mesh);
  };
  for (const s of [-1, 1]) {
    // A (raked windscreen), B and C between the doors and windows, D at the tailgate.
    strut(
      new THREE.Vector3(s * 0.86, 1.12, -0.93),
      new THREE.Vector3(s * 0.84, 1.78, -0.6),
      0.06,
      0.08,
      green,
    );
    for (const [z, t] of [
      [0.32, 0.1],
      [1.3, 0.14],
      [2.24, 0.16],
    ] as const)
      strut(
        new THREE.Vector3(s * 0.85, 1.1, z),
        new THREE.Vector3(s * 0.845, 1.78, z),
        0.05,
        t,
        green,
      );
  }

  // Front: chrome grille with horizontal bars and the name, four stacked lamps, amber
  // indicators, a heavy chrome bumper.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.05), black);
  grille.position.set(0, 0.86, -2.35);
  body.add(grille);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.04), chrome);
    bar.position.set(0, 0.73 + i * 0.087, -2.37);
    body.add(bar);
  }
  for (const [w, h, x, y] of [
    [0.96, 0.03, 0, 1.04],
    [0.96, 0.03, 0, 0.68],
    [0.03, 0.39, -0.47, 0.86],
    [0.03, 0.39, 0.47, 0.86],
  ] as const) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), chrome);
    edge.position.set(x, y, -2.37);
    body.add(edge);
  }
  const nameTex = tex.decal((x, w, h) => {
    x.fillStyle = '#e8e9ec';
    x.font = 'bold 34px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('TOYOTA', w / 2, h / 2);
  });
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.44),
    new THREE.MeshStandardMaterial({
      map: nameTex,
      transparent: true,
      metalness: 0.6,
      roughness: 0.3,
    }),
  );
  name.rotation.y = Math.PI;
  name.position.set(0, 0.86, -2.4);
  body.add(name);
  for (const s of [-1, 1]) {
    for (const y of [0.93, 0.79]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.11, 0.05), MAT.glow(0xfff4d6, 1.3));
      lamp.position.set(s * 0.64, y, -2.35);
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.14, 0.03), chrome);
      bezel.position.set(s * 0.64, y, -2.34);
      body.add(bezel, lamp);
    }
    const turn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), MAT.glow(0xffa21a, 1));
    turn.position.set(s * 0.74, 0.62, -2.3);
    body.add(turn);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.16), chrome);
  bumper.position.set(0, 0.5, -2.42);
  body.add(bumper);

  // Sides: black fender flares, a body-side line in the player's colour, door handles,
  // mirrors, and a snorkel up the right-hand A-pillar.
  for (const wz of WHEEL_Z) {
    for (const s of [-1, 1]) {
      const flare = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 20, Math.PI), black);
      flare.scale.set(1, 1, 0.8);
      flare.rotation.y = Math.PI / 2;
      flare.position.set(s * 0.9, WHEEL_R + 0.02, wz);
      body.add(flare);
    }
  }
  for (const s of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 3.4), MAT.glow(accent, 1.2));
    line.position.set(s * 0.905, 0.88, 0.05);
    body.add(line);
    for (const z of [-0.55, 0.45]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.15), black);
      handle.position.set(s * 0.905, 1.0, z);
      body.add(handle);
    }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.13), black);
    mirror.position.set(s * 0.99, 1.26, -0.85);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), black);
    arm.position.set(s * 0.93, 1.2, -0.85);
    body.add(mirror, arm);
  }
  const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 10), black);
  snorkel.position.set(0.95, 1.4, -0.98);
  snorkel.rotation.x = 0.2;
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.2), black);
  intake.position.set(0.95, 1.8, -1.06);
  body.add(snorkel, intake);

  // Rear: tall tail lamps in the corners, the plate, a black bumper and the tailpipe.
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.05), MAT.glow(0xd01818, 1.6));
    tail.position.set(s * 0.8, 0.88, 2.35);
    const amber = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.055), MAT.glow(0xff8a1a, 1));
    amber.position.set(s * 0.8, 0.66, 2.35);
    body.add(tail, amber);
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
    x.fillText('FJ62 89', w / 2, h / 2 + 2);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.52),
    new THREE.MeshStandardMaterial({ map: plateTex, transparent: true, roughness: 0.5 }),
  );
  plate.position.set(0, 0.78, 2.36);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.14), black);
  rearBumper.position.set(0, 0.5, 2.4);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), chrome);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0.55, 0.4, 2.36);
  body.add(plate, rearBumper, pipe);

  // Roof rack: a black steel basket on six feet, with slats, carrying a duffel and a jerry can.
  const RACK_Y = 1.98;
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.5), steel);
    rail.position.set(s * 0.74, RACK_Y, 0.8);
    body.add(rail);
    for (const z of [-0.42, 0.8, 2.02]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), steel);
      foot.position.set(s * 0.76, 1.89, z);
      body.add(foot);
    }
  }
  for (let i = 0; i <= 6; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.035, 0.05), steel);
    slat.position.set(0, i === 0 || i === 6 ? RACK_Y : RACK_Y - 0.03, -0.45 + i * 0.4);
    body.add(slat);
  }
  const duffel = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.7, 6, 12),
    MAT.paint(0x8a7448, 0.9, 0),
  );
  duffel.rotation.z = Math.PI / 2;
  duffel.scale.set(1, 1, 0.85);
  duffel.position.set(-0.15, RACK_Y + 0.2, 0.3);
  const can = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.46, 0.34),
    MAT.paint(0x4b5a2e, 0.6, 0.2),
  );
  can.position.set(0.48, RACK_Y + 0.25, 1.45);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.05), black);
  strap.position.set(-0.15, RACK_Y + 0.4, 0.3);
  body.add(duffel, can, strap);

  // Big all-terrain tyres on silver six-hole wheels, with dark wells behind the arches.
  const hub = tex.decal((x, w, h) => {
    x.fillStyle = '#b9bcc2';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#5d6066';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      x.beginPath();
      x.arc(w / 2 + Math.cos(a) * w * 0.3, h / 2 + Math.sin(a) * h * 0.3, w * 0.07, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#d6d8dc';
    x.beginPath();
    x.arc(w / 2, h / 2, w * 0.14, 0, Math.PI * 2);
    x.fill();
  });
  const wheels: THREE.Object3D[] = [];
  for (const z of WHEEL_Z) {
    for (const s of [-1, 1]) {
      const w = wheel(WHEEL_R, 0.3, black, hub);
      w.position.set(s * 0.77, WHEEL_R, z);
      root.add(w);
      wheels.push(w);
    }
    const well = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.0), black);
    well.position.set(0, 0.65, z);
    body.add(well);
  }

  shadowAll(body);
  root.add(body);
  root.userData = {
    body,
    wheels,
    exhausts: [new THREE.Vector3(0.55, 0.4, 2.46)],
    hover: false,
    camHeight: 2.1,
  };
  return root;
}
