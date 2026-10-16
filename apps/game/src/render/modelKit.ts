import * as THREE from 'three';
import * as tex from './textures.ts';

/** Shared modelling helpers and materials for procedural vehicles. */

export interface VehicleModel extends THREE.Group {
  userData: {
    body: THREE.Object3D;
    wheels: THREE.Object3D[];
    exhausts: THREE.Vector3[];
    hover: boolean;
    /** Where drift sparks / dust come from (rear wheels, hind hooves...). */
    rear?: THREE.Vector3[];
    /** Chase-camera height for tall rides (default 2.1 m). */
    camHeight?: number;
    /** Ghostly vehicles trail smoke instead of jet flames. */
    ghost?: boolean;
    /** Per-frame animation (gallop, cloak flutter). */
    animate?: (t: number, speed: number, dt: number) => void;
  };
}

export type P2 = [number, number];

/** Extrude a side profile (forward, up) across the car's width, centred on x = 0. */
export function sideProfile(points: P2[], width: number, bevel = 0.08): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([f, y]) => new THREE.Vector2(f, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.rotateY(Math.PI / 2); // shape x (forward) -> -z ; extrude depth -> +x
  g.translate(-(width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** Smooth curve through points for profiles. */
export function curve(points: P2[], n = 40): P2[] {
  const c = new THREE.SplineCurve(points.map(([a, b]) => new THREE.Vector2(a, b)));
  return c.getPoints(n).map((p) => [p.x, p.y] as P2);
}

/** One cross-section of a lofted body. Units in metres; z is along the car (+z = rear). */
export interface Section {
  z: number;
  /** half width */
  w: number;
  top: number;
  bottom: number;
  /** extra height of fender pontoons over the wheels */
  fender?: number;
}

/**
 * Loft a smooth car body through cross-sections. Each section is a rounded
 * superellipse whose top can bulge into twin fender pontoons at |x| = fx.
 */
export function loftBody(
  sections: Section[],
  fx = 0.62,
  fw = 0.22,
  around = 36,
  ex = 0.55,
): THREE.BufferGeometry {
  const ring = (sec: Section): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < around; j++) {
      const t = (j / around) * Math.PI * 2;
      const c = Math.cos(t),
        sn = Math.sin(t);
      const x = sec.w * Math.sign(c) * Math.abs(c) ** ex;
      const mid = (sec.top + sec.bottom) / 2;
      const bump = (sec.fender ?? 0) * Math.exp(-(((Math.abs(x) - fx) / fw) ** 2));
      const yTop = sec.top + bump;
      const yu = Math.abs(sn) ** ex;
      const y = sn >= 0 ? mid + (yTop - mid) * yu : mid - (mid - sec.bottom) * yu;
      pts.push(new THREE.Vector3(x, y, sec.z));
    }
    return pts;
  };
  const rings = sections.map(ring);
  const pos: number[] = [];
  const idx: number[] = [];
  rings.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j,
        b = i * around + ((j + 1) % around),
        c = (i + 1) * around + j,
        d = (i + 1) * around + ((j + 1) % around);
      idx.push(a, c, b, b, c, d);
    }
  // Caps at both ends.
  for (const [ri, flip] of [
    [0, false],
    [rings.length - 1, true],
  ] as const) {
    const centre = rings[ri]!.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(
      1 / around,
    );
    const ci = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z);
    for (let j = 0; j < around; j++) {
      const a = ri * around + j,
        b = ri * around + ((j + 1) % around);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function wheel(
  radius: number,
  width: number,
  hubMat: THREE.Material,
  capMap?: THREE.Texture,
): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), MAT.rubber());
  tyre.rotation.z = Math.PI / 2;
  const tread = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.97, width * 0.12, 6, 24),
    MAT.rubber(),
  );
  tread.rotation.y = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 20),
    hubMat,
  );
  hub.rotation.z = Math.PI / 2;
  g.add(tyre, tread, hub);
  if (capMap) {
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.6, 20),
      new THREE.MeshStandardMaterial({ map: capMap, metalness: 0.6, roughness: 0.3 }),
    );
    cap.position.x = width / 2 + 0.015;
    cap.rotation.y = Math.PI / 2;
    const cap2 = cap.clone();
    cap2.position.x = -cap.position.x;
    cap2.rotation.y = -Math.PI / 2;
    g.add(cap, cap2);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export const MAT = {
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xdedfe3, metalness: 1, roughness: 0.18 }),
  glass: () =>
    new THREE.MeshStandardMaterial({
      color: 0x0d1626,
      metalness: 0.9,
      roughness: 0.08,
      envMapIntensity: 1.5,
    }),
  paint: (c: number, rough = 0.28, metal = 0.35) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }),
  glow: (c: number, i = 3) =>
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i }),
  skin: () => new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.7 }),
};

export function driver(helmet: number, visor = 0x222a3a): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), MAT.paint(helmet, 0.3, 0.2));
  // Visor band centred on -z (phi = -PI/2 points down -z in SphereGeometry).
  const vis = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 20, 14, -Math.PI / 2 - 0.9, 1.8, 1.15, 0.75),
    MAT.glass(),
  );
  vis.material.color.setHex(visor);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.25, 6, 12),
    MAT.paint(0x2b3a5a, 0.8, 0),
  );
  torso.position.y = -0.38;
  g.add(head, vis, torso);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function shadowAll(g: THREE.Object3D): void {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/** A cross-section along a swept tube. */
export interface Ring {
  /** 0..1 position along the curve */
  t: number;
  /** half width (sideways) */
  w: number;
  /** half height (perpendicular to the curve, in its "up" plane) */
  h: number;
  /** shift the section along its up axis */
  dy?: number;
  /** superellipse exponent: 1 = ellipse, < 1 squarer */
  ex?: number;
}

/**
 * Sweep varying cross-sections along a curve: anatomical necks, legs, robes.
 * `up` is the reference used to orient sections (must not be parallel to the curve).
 */
export function tube(
  curve: THREE.Curve<THREE.Vector3>,
  rings: Ring[],
  segs = 40,
  around = 20,
  up = new THREE.Vector3(0, 1, 0),
): THREE.BufferGeometry {
  const sorted = [...rings].sort((a, b) => a.t - b.t);
  const at = (t: number) => {
    let i = 0;
    while (i < sorted.length - 2 && sorted[i + 1]!.t < t) i++;
    const a = sorted[i]!,
      b = sorted[i + 1] ?? a;
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const s = k * k * (3 - 2 * k);
    const mix = (x: number, y: number) => x + (y - x) * s;
    return {
      w: mix(a.w, b.w),
      h: mix(a.h, b.h),
      dy: mix(a.dy ?? 0, b.dy ?? 0),
      ex: mix(a.ex ?? 1, b.ex ?? 1),
    };
  };
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(T, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const nup = new THREE.Vector3().crossVectors(side, T).normalize();
    const r = at(t);
    for (let j = 0; j <= around; j++) {
      const th = (j / around) * Math.PI * 2;
      const cs = Math.cos(th),
        sn = Math.sin(th);
      const x = r.w * Math.sign(cs) * Math.abs(cs) ** r.ex;
      const y = r.h * Math.sign(sn) * Math.abs(sn) ** r.ex + r.dy;
      const p = c.clone().addScaledVector(side, x).addScaledVector(nup, y);
      pos.push(p.x, p.y, p.z);
      uv.push(j / around, t);
    }
  }
  const row = around + 1;
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < around; j++) {
      const a = i * row + j,
        b = a + 1,
        c = a + row,
        d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure normals face outward: compare with the direction from the centre line.
  const n = g.attributes.normal as THREE.BufferAttribute;
  const mid = Math.floor(segs / 2) * row + Math.floor(around / 4);
  const centre = curve.getPointAt(Math.floor(segs / 2) / segs);
  const out = new THREE.Vector3(pos[mid * 3]!, pos[mid * 3 + 1]!, pos[mid * 3 + 2]!).sub(centre);
  if (out.dot(new THREE.Vector3(n.getX(mid), n.getY(mid), n.getZ(mid))) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** A lathe whose surface ripples into vertical cloth folds, deeper toward the hem. */
export function foldedLathe(
  profile: [number, number][],
  folds: number,
  depth: number,
  segments = 48,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );
  const p = g.attributes.position as THREE.BufferAttribute;
  const ys = profile.map((q) => q[1]);
  const y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const ang = Math.atan2(x, z);
    const hem = 1 - (y - y0) / (y1 - y0 || 1);
    const k =
      1 + depth * hem * (Math.sin(ang * folds) * 0.7 + Math.sin(ang * folds * 2.3 + 1.7) * 0.3);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Detail-mapped materials shared by characters. */
export const DETAIL = {
  fabric: (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      bumpMap: tex.fabricBump(),
      bumpScale: 1.2,
      side: THREE.DoubleSide,
    }),
  coat: (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.3,
      envMapIntensity: 2.2,
      bumpMap: tex.coatBump(),
      bumpScale: 0.8,
    }),
  steel: (color = 0x3b3e46) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.85,
      bumpMap: tex.steelBump(),
      bumpScale: 0.6,
      roughnessMap: tex.steelBump(),
    }),
};

/** A seated driver: torso, arms on a steering wheel, and a head styled per vehicle. */
export function pilot(style: 'bat' | 'pod' | 'speed'): THREE.Group {
  const g = new THREE.Group();
  const suit = style === 'bat' ? 0x1c1d22 : style === 'pod' ? 0x8a6a48 : 0x3a5fa8;
  const suitMat = DETAIL.fabric(suit);
  suitMat.side = THREE.FrontSide;
  const torso = new THREE.Mesh(
    tube(
      new THREE.LineCurve3(new THREE.Vector3(0, -0.45, 0.05), new THREE.Vector3(0, 0.05, 0)),
      [
        { t: 0, w: 0.17, h: 0.13 },
        { t: 0.7, w: 0.21, h: 0.12 },
        { t: 1, w: 0.12, h: 0.09 },
      ],
      10,
      16,
      new THREE.Vector3(0, 0, -1),
    ),
    suitMat,
  );
  g.add(torso);
  // Arms reaching for the wheel.
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * 0.2, -0.02, 0),
          new THREE.Vector3(s * 0.24, -0.22, -0.18),
          new THREE.Vector3(s * 0.13, -0.18, -0.4),
        ]),
        [
          { t: 0, w: 0.065, h: 0.065 },
          { t: 0.5, w: 0.05, h: 0.05 },
          { t: 1, w: 0.042, h: 0.042 },
        ],
        12,
        10,
      ),
      suitMat,
    );
    g.add(arm);
    const glove = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8),
      MAT.paint(style === 'bat' ? 0x111111 : 0x6b4a2a, 0.7, 0),
    );
    glove.position.set(s * 0.13, -0.18, -0.42);
    g.add(glove);
  }
  const wheelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.018, 8, 24),
    MAT.paint(0x222222, 0.5, 0.3),
  );
  wheelRing.position.set(0, -0.17, -0.44);
  wheelRing.rotation.x = -0.4;
  g.add(wheelRing);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), MAT.skin());
  neck.position.y = 0.08;
  g.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.24;
  g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), MAT.skin());
  skull.scale.set(0.9, 1.08, 1);
  head.add(skull);
  if (style === 'bat') {
    // Cowl with pointed ears; the jaw stays bare.
    const cowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.137, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      MAT.paint(0x15161a, 0.45, 0.3),
    );
    cowl.scale.set(0.92, 1.1, 1.02);
    head.add(cowl);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 8), cowl.material);
      ear.position.set(s * 0.065, 0.16, 0.01);
      ear.rotation.z = -s * 0.12;
      head.add(ear);
    }
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.02), MAT.glow(0xdfe8ff, 0.8));
    eyes.position.set(0, 0.03, -0.128);
    head.add(eyes);
    // Short cape over the shoulders.
    const cape = new THREE.Mesh(
      foldedLathe(
        [
          [0.24, -0.35],
          [0.22, -0.1],
          [0.12, 0.04],
        ],
        9,
        0.08,
        24,
        Math.PI * 0.35,
        Math.PI * 1.3,
      ),
      DETAIL.fabric(0x111216),
    );
    cape.position.y = 0.0;
    g.add(cape);
  } else if (style === 'pod') {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      MAT.paint(0x7a5232, 0.8, 0),
    );
    cap.scale.set(0.93, 1.1, 1.02);
    head.add(cap);
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(
        new THREE.TorusGeometry(0.032, 0.01, 8, 16),
        MAT.paint(0x8a8f99, 0.3, 0.8),
      );
      lens.position.set(s * 0.045, 0.07, -0.115);
      lens.rotation.x = 0.35;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), MAT.glass());
      glass.position.copy(lens.position).add(new THREE.Vector3(0, 0, -0.004));
      glass.rotation.set(0.35, Math.PI, 0);
      head.add(lens, glass);
    }
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3),
      MAT.paint(0x8a6a3a, 0.9, 0),
    );
    hair.position.set(0, -0.02, 0.03);
    head.add(hair);
  } else {
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      MAT.paint(0xf3f3f0, 0.3, 0.2),
    );
    head.add(helm);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.152, 20, 12, -Math.PI / 2 - 0.8, 1.6, 1.0, 0.55),
      MAT.glass(),
    );
    head.add(visor);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}
