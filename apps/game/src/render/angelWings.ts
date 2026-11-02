import * as THREE from 'three';

/**
 * Angel Wings (Grandpa's Farm's lift-ahead item, in place of the Great Eagle): a pair of big
 * white feathered wings that open from the kart's sides and beat slowly, a golden halo over it,
 * all softly glowing. Same interface as the eagle: a group sitting on the kart, and `flap(t)`.
 */
export function angelWings(): { group: THREE.Group; flap: (t: number) => void } {
  const g = new THREE.Group();
  const feather = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xbcd8ff,
    emissiveIntensity: 0.55,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const down = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    emissive: 0xfff2d6,
    emissiveIntensity: 0.4,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  // One feather: a long rounded blade, quill at the origin, pointing along +x.
  const blade = (len: number, wid: number) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(len * 0.3, wid * 0.55, len * 0.8, wid * 0.5, len, 0);
    s.bezierCurveTo(len * 0.8, -wid * 0.35, len * 0.3, -wid * 0.4, 0, 0);
    return new THREE.ShapeGeometry(s, 6);
  };
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.7, 0.9, 0.3);
    const wing = new THREE.Group();
    // Long flight feathers fanning out and back, then two rows of shorter coverts over them.
    const rows: [number, number, number, number, THREE.Material][] = [
      // count, length, width, lift, material
      [9, 3.4, 0.62, 0, feather],
      [8, 2.2, 0.55, 0.04, feather],
      [7, 1.2, 0.5, 0.08, down],
    ];
    for (const [n, len, wid, lift, mat] of rows) {
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const m = new THREE.Mesh(blade(len * (0.75 + 0.25 * Math.sin(k * Math.PI)), wid), mat);
        // Lie flat, then fan from pointing out sideways (k=0) to sweeping back (k=1).
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -(0.15 + k * 1.15);
        m.position.set(k * 0.9, lift, k * 0.35);
        wing.add(m);
      }
    }
    wing.scale.x = side;
    hinge.add(wing);
    g.add(hinge);
    wings.push(hinge);
  }
  // The halo.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 10, 36),
    new THREE.MeshStandardMaterial({
      color: 0xffd770,
      emissive: 0xffc24a,
      emissiveIntensity: 1.4,
      metalness: 0.5,
      roughness: 0.3,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 2.4, 0.2);
  g.add(halo);
  // A soft glow round the whole thing.
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0xdfeeff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  glow.position.y = 1.0;
  g.add(glow);
  return {
    group: g,
    flap: (t: number) => {
      // Slow, strong beats: up and back, down and forward.
      const a = Math.sin(t * 4.2);
      wings.forEach((w, i) => {
        const s = i ? 1 : -1;
        w.rotation.z = s * (0.35 + 0.45 * a);
        w.rotation.y = s * 0.15 * a;
      });
      halo.position.y = 2.4 + Math.sin(t * 2.1) * 0.08;
      halo.rotation.z = t * 0.6;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * (0.5 + 0.5 * a);
    },
  };
}
