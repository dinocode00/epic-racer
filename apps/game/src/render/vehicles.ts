import * as THREE from 'three';
import * as tex from './textures.ts';
import { MAT, type VehicleModel, curve, driver, loftBody, shadowAll, sideProfile, wheel } from './modelKit.ts';
import { nazgul } from './nazgul.ts';

export type { VehicleModel } from './modelKit.ts';

/**
 * Procedural vehicle models. Every model faces -Z, sits on y = 0 and is ~4.5-5.5 m long.
 * userData: wheels (spin), exhausts (boost flame anchors), body (leans in drifts).
 */
// ---------------------------------------------------------------- Batmobile (1989)

function batmobile(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const black = MAT.paint(0x101114, 0.22, 0.75);
  const darkTrim = MAT.paint(0x26282e, 0.5, 0.6);

  // Long, low, with the hood sweeping down to a turbine nose.
  const profile = curve([
    [-2.75, 0.32],
    [-2.8, 0.7],
    [-2.5, 0.92],
    [-1.4, 0.98],
    [-0.4, 1.0],
    [0.6, 0.94],
    [1.7, 0.8],
    [2.5, 0.62],
    [2.8, 0.48],
    [2.72, 0.3],
  ]);
  profile.push([2.3, 0.22], [-2.5, 0.22]);
  const hull = new THREE.Mesh(sideProfile(profile, 2.15, 0.12), black);
  body.add(hull);

  // Side skirts / ribbed intakes.
  for (const s of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 3.4), darkTrim);
    skirt.position.set(s * 1.07, 0.42, 0.1);
    body.add(skirt);
    for (let k = 0; k < 5; k++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.06), MAT.chrome());
      rib.position.set(s * 1.135, 0.44, -0.5 + k * 0.22);
      body.add(rib);
    }
  }

  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass());
  canopy.scale.set(0.62, 0.42, 1.25);
  canopy.position.set(0, 0.96, 0.45);
  body.add(canopy);

  // Turbine intake on the nose.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 12, 28), MAT.chrome());
  ring.position.set(0, 0.5, -2.76);
  const fanDisc = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), MAT.paint(0x050505, 0.6, 0.3));
  fanDisc.position.set(0, 0.5, -2.73);
  fanDisc.rotation.y = Math.PI;
  body.add(ring, fanDisc);
  for (let k = 0; k < 8; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), MAT.chrome());
    blade.position.set(0, 0.5, -2.75);
    blade.rotation.z = (k / 8) * Math.PI;
    body.add(blade);
  }

  // Swept bat-wing fins.
  const finShape = new THREE.Shape([new THREE.Vector2(-0.6, 0), new THREE.Vector2(-2.95, 0.95), new THREE.Vector2(-2.5, 0.25), new THREE.Vector2(-2.7, 0)]);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  finGeo.rotateY(Math.PI / 2);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, black);
    fin.position.set(s * 0.8, 0.9, 0);
    fin.rotation.z = -s * 0.18;
    body.add(fin);
  }

  // Afterburner + accent tail lights in the player's colour.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.3, 20, 1, true), MAT.chrome());
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.6, 2.8);
  const burner = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), MAT.glow(0xff7a1a, 2));
  burner.position.set(0, 0.6, 2.86);
  body.add(nozzle, burner);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), MAT.glow(accent, 2.5));
    tail.position.set(s * 0.68, 0.78, 2.78);
    body.add(tail);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 2.2), MAT.glow(accent, 1.2));
  stripe.position.set(0, 0.97, -1.3);
  stripe.rotation.x = -0.12;
  body.add(stripe);

  const batCap = tex.decal((x, w, h) => {
    x.fillStyle = '#d9b43a';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#111';
    x.save();
    x.translate(w / 2, h / 2);
    x.scale(w / 128, h / 128);
    x.beginPath();
    x.moveTo(-50, -8);
    x.quadraticCurveTo(-28, -4, -22, -20);
    x.lineTo(-10, -6);
    x.lineTo(-6, -18);
    x.lineTo(0, -10);
    x.lineTo(6, -18);
    x.lineTo(10, -6);
    x.lineTo(22, -20);
    x.quadraticCurveTo(28, -4, 50, -8);
    x.quadraticCurveTo(30, 6, 26, 20);
    x.quadraticCurveTo(14, 8, 0, 22);
    x.quadraticCurveTo(-14, 8, -26, 20);
    x.quadraticCurveTo(-30, 6, -50, -8);
    x.fill();
    x.restore();
  });

  const wheels: THREE.Object3D[] = [];
  for (const [z, r] of [
    [-1.75, 0.42],
    [1.75, 0.46],
  ] as const) {
    for (const s of [-1, 1]) {
      const w = wheel(r, 0.36, MAT.chrome(), batCap);
      w.position.set(s * 0.98, r, z);
      root.add(w);
      wheels.push(w);
    }
  }
  const pilot = driver(0x111111, 0x334455);
  pilot.position.set(0, 1.1, 0.45);
  pilot.scale.setScalar(0.85);
  body.add(pilot);

  shadowAll(body);
  root.add(body);
  root.userData = { body, wheels, exhausts: [new THREE.Vector3(0, 0.6, 2.9)], hover: false };
  return root;
}

// ---------------------------------------------------------------- Mach 5

function mach5(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const white = MAT.paint(0xf3f3f0, 0.25, 0.15);
  const red = MAT.paint(0xd5222a, 0.3, 0.2);

  // Lofted body: twin pontoon fenders over the wheels, a low valley down the hood.
  const hull = new THREE.Mesh(
    loftBody([
      { z: 2.25, w: 0.66, top: 0.6, bottom: 0.32 },
      { z: 2.05, w: 0.84, top: 0.68, bottom: 0.26, fender: 0.06 },
      { z: 1.65, w: 0.92, top: 0.66, bottom: 0.42, fender: 0.16 },
      { z: 1.35, w: 0.93, top: 0.64, bottom: 0.44, fender: 0.2 },
      { z: 1.0, w: 0.92, top: 0.68, bottom: 0.36, fender: 0.12 },
      { z: 0.6, w: 0.9, top: 0.74, bottom: 0.24, fender: 0.03 },
      { z: -0.1, w: 0.88, top: 0.76, bottom: 0.24 },
      { z: -0.6, w: 0.88, top: 0.7, bottom: 0.26, fender: 0.04 },
      { z: -1.0, w: 0.9, top: 0.6, bottom: 0.38, fender: 0.16 },
      { z: -1.35, w: 0.91, top: 0.56, bottom: 0.44, fender: 0.22 },
      { z: -1.75, w: 0.86, top: 0.52, bottom: 0.4, fender: 0.16 },
      { z: -2.1, w: 0.72, top: 0.46, bottom: 0.3, fender: 0.08 },
      { z: -2.45, w: 0.44, top: 0.38, bottom: 0.28, fender: 0.02 },
      { z: -2.62, w: 0.16, top: 0.34, bottom: 0.3 },
    ]),
    white,
  );
  body.add(hull);
  // Nose intake and red taillights.
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), MAT.paint(0x111111, 0.6, 0.2));
  intake.position.set(0, 0.33, -2.52);
  body.add(intake);
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), MAT.glow(0xff2a2a, 1.5));
    tl.position.set(s * 0.45, 0.52, 2.26);
    body.add(tl);
  }

  // Open cockpit, windscreen.
  const tub = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 16), MAT.paint(0x1d2f5a, 0.7, 0));
  tub.rotation.x = Math.PI / 2;
  tub.scale.set(1, 1, 0.25);
  tub.position.set(0, 0.75, 0.25);
  body.add(tub);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.45, metalness: 0.2, roughness: 0.05, side: THREE.DoubleSide }));
  screen.position.set(0, 0.9, -0.38);
  screen.rotation.x = -0.6;
  body.add(screen);

  // Hood "M" and door "5" decals.
  const mTex = tex.decal((x, w, h) => {
    x.fillStyle = '#d5222a';
    x.font = 'bold 120px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('M', w / 2, h / 2 + 8);
  });
  const mDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshStandardMaterial({ map: mTex, transparent: true, roughness: 0.3 }));
  mDecal.rotation.x = -Math.PI / 2 + 0.2;
  mDecal.position.set(0, 0.62, -1.35);
  body.add(mDecal);
  const fiveTex = tex.decal((x, w, h) => {
    x.fillStyle = '#d5222a';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    x.lineWidth = 8;
    x.strokeStyle = '#d5222a';
    x.stroke();
    x.font = 'bold 84px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('5', w / 2, h / 2 + 6);
  });
  for (const s of [-1, 1]) {
    const five = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: fiveTex, transparent: true, roughness: 0.3 }));
    five.position.set(s * 0.905, 0.5, 0.1);
    five.rotation.y = s * Math.PI / 2;
    body.add(five);
  }
  // Red nose detail and accent stripe in the player's colour.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.22), red);
  nose.position.set(0, 0.36, -2.22);
  body.add(nose);
  for (const s of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 1.2), MAT.glow(accent, 1.4));
    st.position.set(s * 0.9, 0.32, 0.1);
    body.add(st);
  }
  // Exhaust pipes.
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 12), MAT.chrome());
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(s * 0.35, 0.33, 2.3);
    body.add(pipe);
  }

  const wheels: THREE.Object3D[] = [];
  for (const z of [-1.35, 1.35]) {
    for (const s of [-1, 1]) {
      const w = wheel(0.38, 0.28, MAT.chrome());
      w.position.set(s * 0.74, 0.38, z);
      root.add(w);
      wheels.push(w);
    }
  }
  const pilot = driver(0xf3f3f0, 0x1a2a44);
  pilot.position.set(0, 1.0, 0.3);
  body.add(pilot);

  shadowAll(body);
  root.add(body);
  root.userData = {
    body,
    wheels,
    exhausts: [new THREE.Vector3(-0.35, 0.35, 2.45), new THREE.Vector3(0.35, 0.35, 2.45)],
    hover: false,
  };
  return root;
}

// ---------------------------------------------------------------- Pod racer

function podEngine(color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  // Lathe profile: radius vs length (y axis), intake at the top (front).
  const pts = [
    [0.0, -1.9],
    [0.2, -1.9],
    [0.26, -1.7],
    [0.29, -0.8],
    [0.31, 0.6],
    [0.36, 1.45],
    [0.44, 1.75],
    [0.4, 1.8],
    [0.3, 1.62],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.rotateX(-Math.PI / 2); // +y (intake) -> -z (forward)
  const shell = new THREE.Mesh(geo, MAT.paint(color, 0.35, 0.45));
  g.add(shell);
  // Intake mouth and blades.
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.33, 24), MAT.paint(0x0b0b0b, 0.8, 0.2));
  mouth.position.z = -1.66;
  mouth.rotation.y = Math.PI;
  g.add(mouth);
  for (let k = 0; k < 10; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), MAT.chrome());
    blade.position.z = -1.68;
    blade.rotation.z = (k / 10) * Math.PI;
    g.add(blade);
  }
  // Accent bands.
  for (const z of [-0.9]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.03, 8, 28), MAT.glow(accent, 1.0));
    band.position.z = z;
    g.add(band);
  }
  // Split exhaust flaps at the rear.
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.6), MAT.paint(0x8a8f99, 0.4, 0.7));
    flap.position.set(0, s * 0.3, 2.0);
    flap.rotation.x = s * 0.25;
    g.add(flap);
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), MAT.glow(0x6fd0ff, 2.5));
  glow.position.z = 1.91;
  g.add(glow);
  return g;
}

function podracer(accent: number): VehicleModel {
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const orange = 0xe39a2c;
  const H = 0.35;

  const engines: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = podEngine(orange, accent);
    e.position.set(s * 1.0, H + 0.1, -1.6);
    body.add(e);
    engines.push(e);
  }
  // Energy binder arcing between the engines.
  const binderGeo = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.72, H + 0.25, -2.9), new THREE.Vector3(0, H + 0.7, -3.05), new THREE.Vector3(0.72, H + 0.25, -2.9)),
    24,
    0.035,
    6,
  );
  const binder = new THREE.Mesh(binderGeo, new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  body.add(binder);

  // Cockpit pod.
  const podPts = [
    [0.0, -0.95],
    [0.28, -0.85],
    [0.46, -0.45],
    [0.5, 0.2],
    [0.42, 0.7],
    [0.2, 0.92],
    [0.0, 0.95],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const podGeo = new THREE.LatheGeometry(podPts, 28);
  podGeo.rotateX(-Math.PI / 2);
  podGeo.scale(0.8, 0.5, 0.75);
  const pod = new THREE.Mesh(podGeo, MAT.paint(0xd9a441, 0.35, 0.45));
  pod.position.set(0, H + 0.05, 1.9);
  body.add(pod);
  const podTrim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 28), MAT.paint(0x3f6fb0, 0.35, 0.45));
  podTrim.scale.set(1.1, 1, 0.9);
  podTrim.rotation.x = Math.PI / 2;
  podTrim.position.set(0, H + 0.22, 1.95);
  body.add(podTrim);

  // Control cables from each engine to the pod.
  for (const s of [-1, 1]) {
    for (const dy of [-0.08, 0.08]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 1.0, H + 0.1 + dy, 0.3), new THREE.Vector3(s * 0.62, H + dy - 0.05, 1.0), new THREE.Vector3(s * 0.3, H + dy + 0.05, 1.55)]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.025, 5), MAT.paint(0x2a2a2a, 0.6, 0.3));
      body.add(cable);
    }
  }
  const pilot = driver(0x8a6a3a, 0x6b4a2a);
  pilot.position.set(0, H + 0.5, 2.0);
  pilot.scale.setScalar(0.7);
  body.add(pilot);

  shadowAll(body);
  binder.castShadow = false;
  root.add(body);
  root.userData = {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-1.0, H + 0.1, 0.35), new THREE.Vector3(1.0, H + 0.1, 0.35)],
    hover: true,
  };
  return root;
}

export function buildVehicle(id: string, accent: string): VehicleModel {
  const c = new THREE.Color(accent).getHex();
  switch (id) {
    case 'pod':
      return podracer(c);
    case 'mach5':
      return mach5(c);
    case 'nazgul':
      return nazgul(c);
    default:
      return batmobile(c);
  }
}
