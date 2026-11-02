import * as THREE from 'three';
import * as tex from './textures.ts';
import { MAT, type VehicleModel, loftBody, shadowAll, wheel } from './modelKit.ts';

/**
 * The Mystery Machine (Scooby-Doo): a 1960s panel van with a flat, nearly upright front,
 * a green lower body and nose, a light-blue upper body, orange flowers all over, the name
 * in orange down both sides, round headlights, chrome bumpers and two rear doors.
 * Proportions of a short-wheelbase van: 4.6 m long, 1.9 m wide, 1.95 m tall.
 */
export function mysteryMachine(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const green = MAT.paint(0x7fb441, 0.42, 0.15);
  const blue = MAT.paint(0x63b7cf, 0.4, 0.15);
  const black = MAT.paint(0x161719, 0.7, 0.1);
  const grey = MAT.paint(0x2c2e33, 0.55, 0.2);
  const chrome = MAT.chrome();

  // Lower body in green: waist-high all round, the flat nose at the front, arches for the
  // wheels.
  const WHEEL_Z = [-1.45, 1.42];
  const WHEEL_R = 0.36;
  const lerpKeys = (keys: [number, number][], z: number) => {
    for (let i = 1; i < keys.length; i++) {
      const [z0, v0] = keys[i - 1]!,
        [z1, v1] = keys[i]!;
      if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
    }
    return keys[keys.length - 1]![1];
  };
  const tops: [number, number][] = [
    [-2.3, 0.88],
    [-2.26, 0.96],
    [-2.2, 0.99],
    [2.25, 0.99],
    [2.3, 0.93],
  ];
  const widths: [number, number][] = [
    [-2.3, 0.86],
    [-2.24, 0.93],
    [2.24, 0.94],
    [2.3, 0.9],
  ];
  const sill: [number, number][] = [
    [-2.3, 0.44],
    [-2.2, 0.38],
    [2.2, 0.38],
    [2.3, 0.44],
  ];
  const ARCH_R = 0.47;
  const zs = new Set([-2.3, -2.26, -2.2, 0, 2.25, 2.3]);
  for (const wz of WHEEL_Z) for (let i = -8; i <= 8; i++) zs.add(wz + (i / 8) * (ARCH_R + 0.02));
  const hull = new THREE.Mesh(
    loftBody(
      [...zs]
        .sort((a, b) => b - a) // front last, as loftBody winds its faces
        .map((z) => {
          let bottom = lerpKeys(sill, z);
          for (const wz of WHEEL_Z) {
            const d = Math.abs(z - wz) / ARCH_R;
            if (d < 1) bottom = Math.max(bottom, 0.34 + 0.44 * Math.sqrt(1 - d * d));
          }
          return { z, w: lerpKeys(widths, z), top: lerpKeys(tops, z), bottom };
        }),
      0.62,
      0.22,
      40,
      0.12,
    ),
    green,
  );
  body.add(hull);

  // Upper body in blue: a tall box with a rounded roof, the windscreen raked back a little.
  const upper = new THREE.Mesh(
    loftBody(
      [
        { z: 2.3, w: 0.9, top: 1.85, bottom: 0.97 },
        { z: 2.24, w: 0.93, top: 1.92, bottom: 0.97 },
        { z: -1.98, w: 0.93, top: 1.92, bottom: 0.97 },
        { z: -2.12, w: 0.92, top: 1.74, bottom: 0.97 },
        { z: -2.22, w: 0.9, top: 1.06, bottom: 0.97 },
      ],
      0.6,
      0.2,
      40,
      0.2,
    ),
    blue,
  );
  body.add(upper);
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.6, 0.03), MAT.glass());
  windscreen.position.set(0, 1.4, -2.185);
  windscreen.rotation.x = 0.15;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.04), blue);
  pillar.position.set(0, 1.4, -2.19);
  pillar.rotation.x = 0.15;
  body.add(windscreen, pillar);

  // Livery: orange flowers on green and blue, the name in orange on the blue panel. One
  // texture per side panel; it reads front to back on both sides.
  const flower = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    x.fillStyle = '#f28c28';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      x.beginPath();
      x.ellipse(
        cx + Math.cos(a) * r * 0.55,
        cy + Math.sin(a) * r * 0.55,
        r * 0.5,
        r * 0.32,
        a,
        0,
        Math.PI * 2,
      );
      x.fill();
    }
    x.fillStyle = '#ffd23a';
    x.beginPath();
    x.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    x.fill();
  };
  const panelTex = tex.decal(
    (x, w, h) => {
      for (const [fx, fy, r] of [
        [50, 50, 42],
        [110, 190, 50],
        [930, 60, 46],
        [975, 196, 40],
        [720, 205, 34],
      ] as const)
        flower(x, fx, fy, r);
      x.font = 'bold italic 88px "Trebuchet MS", sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineJoin = 'round';
      x.lineWidth = 12;
      x.strokeStyle = '#2f6b1f';
      x.strokeText('The Mystery', w / 2, h * 0.33);
      x.strokeText('Machine', w / 2, h * 0.7);
      x.fillStyle = '#f28c28';
      x.fillText('The Mystery', w / 2, h * 0.33);
      x.fillText('Machine', w / 2, h * 0.7);
    },
    1024,
    256,
  );
  const lowerTex = tex.decal(
    (x) => {
      for (let i = 0; i < 8; i++) flower(x, 70 + i * 128 + (i % 2) * 24, i % 2 ? 50 : 78, 46);
    },
    1024,
    128,
  );
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.75),
      new THREE.MeshStandardMaterial({ map: panelTex, transparent: true, roughness: 0.45 }),
    );
    panel.position.set(s * 0.937, 1.42, 0.62);
    panel.rotation.y = s * (Math.PI / 2);
    const lower = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.42),
      new THREE.MeshStandardMaterial({ map: lowerTex, transparent: true, roughness: 0.45 }),
    );
    lower.position.set(s * 0.945, 0.82, 0);
    lower.rotation.y = s * (Math.PI / 2);
    // Door window, door seams, a chrome mirror, a thin line in the player's colour.
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.72), MAT.glass());
    win.position.set(s * 0.93, 1.48, -1.5);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.14), chrome);
    mirror.position.set(s * 1.02, 1.42, -2.0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), chrome);
    arm.position.set(s * 0.97, 1.42, -2.0);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 4.2), MAT.glow(accent, 1.2));
    line.position.set(s * 0.945, 0.985, 0);
    body.add(panel, lower, win, mirror, arm, line);
    for (const z of [-2.0, -0.95]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.3, 0.012), grey);
      seam.position.set(s * 0.94, 1.15, z);
      body.add(seam);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), chrome);
    handle.position.set(s * 0.945, 1.12, -1.15);
    body.add(handle);
  }

  // Front: round lamps in chrome rings, a slim grille, a flower on the nose, chrome bumper.
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24), chrome);
    ring.position.set(s * 0.64, 0.74, -2.305);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), MAT.glow(0xfff4d6, 1.4));
    lamp.position.set(s * 0.64, 0.74, -2.31);
    lamp.rotation.y = Math.PI;
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), MAT.glow(0xffa21a, 1));
    ind.position.set(s * 0.64, 0.56, -2.3);
    body.add(ring, lamp, ind);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.04), black);
  grille.position.set(0, 0.72, -2.3);
  body.add(grille);
  for (let k = 0; k < 3; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.018, 0.02), chrome);
    bar.position.set(0, 0.67 + k * 0.05, -2.325);
    body.add(bar);
  }
  const noseTex = tex.decal((x) => flower(x, 64, 64, 56));
  const nose = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshStandardMaterial({ map: noseTex, transparent: true, roughness: 0.45 }),
  );
  nose.position.set(0, 0.9, -2.29);
  nose.rotation.y = Math.PI;
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 0.12), chrome);
  frontBumper.position.set(0, 0.46, -2.33);
  body.add(nose, frontBumper);

  // Rear: two doors with small windows, tall tail lamps, chrome bumper and the exhaust.
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.03), MAT.glass());
    win.position.set(s * 0.42, 1.5, 2.3);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.04), MAT.glow(0xd01818, 1.6));
    tail.position.set(s * 0.84, 0.82, 2.3);
    body.add(win, tail);
  }
  const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.4, 0.012), grey);
  doorSeam.position.set(0, 1.2, 2.31);
  const rearHandle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), chrome);
  rearHandle.position.set(0.12, 1.12, 2.31);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 0.12), chrome);
  rearBumper.position.set(0, 0.46, 2.32);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), chrome);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0.55, 0.32, 2.3);
  body.add(doorSeam, rearHandle, rearBumper, pipe);

  // Steel wheels behind chrome dish hubcaps.
  const hub = tex.decal((x, w, h) => {
    x.fillStyle = '#d7d9dd';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#9a9da3';
    x.lineWidth = 5;
    x.beginPath();
    x.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#f2f3f5';
    x.beginPath();
    x.arc(w / 2, h / 2, w * 0.16, 0, Math.PI * 2);
    x.fill();
  });
  const wheels: THREE.Object3D[] = [];
  for (const z of WHEEL_Z) {
    for (const s of [-1, 1]) {
      const w = wheel(WHEEL_R, 0.24, grey, hub);
      w.position.set(s * 0.78, WHEEL_R, z);
      root.add(w);
      wheels.push(w);
    }
    const well = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.5, 0.9), black);
    well.position.set(0, 0.56, z);
    body.add(well);
  }

  shadowAll(body);
  root.add(body);
  root.userData = {
    body,
    wheels,
    exhausts: [new THREE.Vector3(0.55, 0.32, 2.42)],
    hover: false,
    camHeight: 2.2,
  };
  return root;
}
