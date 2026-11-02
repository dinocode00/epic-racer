import * as THREE from 'three';
import * as tex from './textures.ts';
import { MAT, type VehicleModel, loftBody, shadowAll, wheel } from './modelKit.ts';

/**
 * The DeLorean time machine (DMC-12, Back to the Future): a low brushed-stainless wedge with
 * a sharp nose, a steep windscreen, a louvred fastback, gull-wing door seams and black
 * bumpers, plus the time-machine kit: Mr. Fusion and the reactor on the rear deck, two big
 * vents at the rear corners (the boost flames come out of them), conduits down the sides
 * and the OUTATIME plate. Real proportions: 4.27 m long, 1.86 m wide, 1.14 m tall.
 */
export function delorean(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const steel = MAT.paint(0xb4b8bd, 0.36, 0.9);
  const black = MAT.paint(0x161719, 0.7, 0.1);
  const dark = MAT.paint(0x3a3d42, 0.45, 0.7);

  // Lower body: the wedge. The hood rises from a low nose to the windscreen; the waist and
  // rear deck stay level; round arches are cut into the sills.
  const WHEEL_Z = [-1.24, 1.22];
  const WHEEL_R = 0.33;
  const lerpKeys = (keys: [number, number][], z: number) => {
    for (let i = 1; i < keys.length; i++) {
      const [z0, v0] = keys[i - 1]!,
        [z1, v1] = keys[i]!;
      if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
    }
    return keys[keys.length - 1]![1];
  };
  const tops: [number, number][] = [
    [-2.13, 0.56],
    [-2.08, 0.63],
    [-1.9, 0.67],
    [-1.2, 0.77],
    [-0.8, 0.86],
    [0.5, 0.9],
    [1.45, 0.93],
    [1.95, 0.94],
    [2.08, 0.9],
    [2.13, 0.8],
  ];
  const widths: [number, number][] = [
    [-2.13, 0.72],
    [-2.05, 0.85],
    [-1.8, 0.9],
    [-0.8, 0.93],
    [1.6, 0.93],
    [2.05, 0.9],
    [2.13, 0.84],
  ];
  const sill: [number, number][] = [
    [-2.13, 0.32],
    [-2.0, 0.27],
    [2.0, 0.27],
    [2.13, 0.34],
  ];
  const ARCH_R = 0.42;
  const zs = new Set([-2.13, -2.08, -1.9, -0.8, 0, 0.5, 1.95, 2.08, 2.13]);
  for (const wz of WHEEL_Z) for (let i = -8; i <= 8; i++) zs.add(wz + (i / 8) * (ARCH_R + 0.02));
  const hull = new THREE.Mesh(
    loftBody(
      [...zs]
        .sort((a, b) => b - a) // front last, as loftBody winds its faces
        .map((z) => {
          let bottom = lerpKeys(sill, z);
          for (const wz of WHEEL_Z) {
            const d = Math.abs(z - wz) / ARCH_R;
            if (d < 1) bottom = Math.max(bottom, 0.3 + 0.39 * Math.sqrt(1 - d * d));
          }
          return { z, w: lerpKeys(widths, z), top: lerpKeys(tops, z), bottom };
        }),
      0.62,
      0.22,
      40,
      0.2,
    ),
    steel,
  );
  body.add(hull);

  // Glasshouse: steep windscreen, side windows in the gull-wing doors, a flat roof.
  const glass = new THREE.Mesh(
    loftBody(
      [
        { z: -0.82, w: 0.88, top: 0.88, bottom: 0.84 },
        { z: -0.56, w: 0.84, top: 0.99, bottom: 0.84 },
        { z: -0.32, w: 0.79, top: 1.09, bottom: 0.84 },
        { z: -0.16, w: 0.76, top: 1.13, bottom: 0.85 },
        { z: 0.45, w: 0.75, top: 1.14, bottom: 0.86 },
      ].reverse(),
      0.6,
      0.2,
      36,
      0.25,
    ),
    MAT.glass(),
  );
  body.add(glass);
  // Stainless roof and fastback: the roof panel over the doors, then the long slope down to
  // the rear deck with black louvres across it.
  const shell = new THREE.Mesh(
    loftBody(
      [
        { z: 1.5, w: 0.89, top: 0.97, bottom: 0.9 },
        { z: 1.0, w: 0.84, top: 1.04, bottom: 0.88 },
        { z: 0.6, w: 0.79, top: 1.115, bottom: 0.87 },
        { z: 0.4, w: 0.765, top: 1.15, bottom: 0.86 },
        { z: 0.3, w: 0.72, top: 1.155, bottom: 1.1 },
        { z: -0.14, w: 0.72, top: 1.15, bottom: 1.1 },
        { z: -0.22, w: 0.68, top: 1.125, bottom: 1.1 },
      ],
      0.6,
      0.2,
      32,
      0.25,
    ),
    steel,
  );
  body.add(shell);
  const slope = Math.atan2(1.115 - 0.97, 1.5 - 0.6);
  for (let i = 0; i < 7; i++) {
    const z = 0.7 + i * 0.12;
    const y = 1.115 - (z - 0.6) * Math.tan(slope) + 0.02;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.24 - i * 0.02, 0.025, 0.07), black);
    slat.position.set(0, y, z);
    slat.rotation.x = slope;
    body.add(slat);
  }

  // Front: twin rectangular lamps each side of a slim black grille, black bumper.
  for (const s of [-1, 1]) {
    for (const x of [0.43, 0.66]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.05), MAT.glow(0xfff4d6, 1.4));
      lamp.position.set(s * x, 0.5, -2.12);
      body.add(lamp);
    }
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), MAT.glow(0xffa21a, 1));
    ind.position.set(s * 0.6, 0.36, -2.17);
    body.add(ind);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), black);
  grille.position.set(0, 0.5, -2.13);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.15, 0.14), black);
  frontBumper.position.set(0, 0.34, -2.1);
  body.add(grille, frontBumper);

  // Sides: black lower trim, gull-wing seams, a mirror, and the time circuits' conduit with a
  // thin glowing line in the player's colour.
  for (const s of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 3.2), black);
    trim.position.set(s * 0.93, 0.36, 0);
    body.add(trim);
    for (const z of [-0.78, 0.48]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), dark);
      seam.position.set(s * 0.928, 0.6, z);
      body.add(seam);
    }
    const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), dark);
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(s * 0.95, 0.68, 0.35);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 2.5), MAT.glow(accent, 1.4));
    line.position.set(s * 0.987, 0.68, 0.35);
    body.add(conduit, line);
  }
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), black);
  mirror.position.set(-0.93, 0.92, -0.7);
  body.add(mirror);

  // Rear deck: the reactor housing and Mr. Fusion, the two big corner vents with glowing
  // throats, and coils running back from the reactor.
  const reactor = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.42), dark);
  reactor.position.set(0, 1.02, 1.76);
  body.add(reactor);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.03), black);
    rib.position.set(0, 1.11, 1.62 + i * 0.09);
    body.add(rib);
  }
  const fusion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.26, 18),
    MAT.paint(0xf2f2ec, 0.4, 0.1),
  );
  fusion.position.set(0, 1.23, 1.86);
  const fusionTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    MAT.paint(0x8f949b, 0.3, 0.8),
  );
  fusionTop.position.set(0, 1.36, 1.86);
  body.add(fusion, fusionTop);
  for (const s of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 16), dark);
    vent.rotation.x = Math.PI / 2;
    vent.position.set(s * 0.62, 1.04, 1.95);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), MAT.glow(0xff7a1a, 1.6));
    throat.position.set(s * 0.62, 1.04, 2.226);
    for (let k = 0; k < 3; k++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.015, 6, 18), black);
      band.position.set(s * 0.62, 1.04, 1.76 + k * 0.17);
      body.add(band);
    }
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), black);
    coil.rotation.z = Math.PI / 2;
    coil.position.set(s * 0.3, 1.0, 2.02);
    body.add(vent, throat, coil);
  }

  // Tail: black louvred panel over the lamps, the OUTATIME plate, black bumper.
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 0.04), black);
  tailPanel.position.set(0, 0.68, 2.135);
  body.add(tailPanel);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.04), MAT.glow(0xd01818, 1.6));
    tail.position.set(s * 0.56, 0.68, 2.15);
    body.add(tail);
    for (let k = 0; k < 4; k++) {
      const louvre = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.02), black);
      louvre.position.set(s * 0.56, 0.6 + k * 0.055, 2.175);
      body.add(louvre);
    }
  }
  const plateTex = tex.decal((x, w, h) => {
    x.fillStyle = '#f4f2ea';
    x.fillRect(0, h * 0.25, w, h * 0.5);
    x.fillStyle = '#b8231f';
    x.font = 'italic bold 15px serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('California', w / 2, h * 0.33);
    x.fillStyle = '#1c2a5a';
    x.font = 'bold 28px sans-serif';
    x.fillText('OUTATIME', w / 2, h * 0.56, w - 10);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.52),
    new THREE.MeshStandardMaterial({ map: plateTex, transparent: true, roughness: 0.5 }),
  );
  plate.position.set(0, 0.47, 2.2);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.16, 0.14), black);
  rearBumper.position.set(0, 0.33, 2.1);
  body.add(plate, rearBumper);

  // Turbine-style alloys: a silver disc with a ring of dark slots.
  const hub = tex.decal((x, w, h) => {
    x.fillStyle = '#c3c6cb';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#4a4d53';
    for (let i = 0; i < 10; i++) {
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate((i / 10) * Math.PI * 2);
      x.beginPath();
      x.ellipse(w * 0.3, 0, w * 0.1, w * 0.04, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    x.fillStyle = '#e1e3e6';
    x.beginPath();
    x.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2);
    x.fill();
  });
  const wheels: THREE.Object3D[] = [];
  for (const [i, z] of WHEEL_Z.entries()) {
    for (const s of [-1, 1]) {
      const w = wheel(WHEEL_R, i === 0 ? 0.2 : 0.26, dark, hub);
      w.position.set(s * 0.76, WHEEL_R, z);
      root.add(w);
      wheels.push(w);
    }
    const well = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.44, 0.8), black);
    well.position.set(0, 0.48, z);
    body.add(well);
  }

  shadowAll(body);
  root.add(body);
  root.userData = {
    body,
    wheels,
    exhausts: [new THREE.Vector3(-0.62, 1.04, 2.3), new THREE.Vector3(0.62, 1.04, 2.3)],
    hover: false,
  };
  return root;
}
