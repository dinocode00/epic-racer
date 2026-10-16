import * as THREE from 'three';

/** Shared modelling helpers and materials for procedural vehicles. */

export interface VehicleModel extends THREE.Group {
  userData: {
    body: THREE.Object3D;
    wheels: THREE.Object3D[];
    exhausts: THREE.Vector3[];
    hover: boolean;
    /** Where drift sparks / dust come from (rear wheels, hind hooves...). */
    rear?: THREE.Vector3[];
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
