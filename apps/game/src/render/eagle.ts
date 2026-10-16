import * as THREE from 'three';
import { DETAIL, MAT, tube } from './modelKit.ts';

/** A Great Eagle of the Misty Mountains, wings spread, talons out. Faces -Z. */
export function greatEagle(): { group: THREE.Group; flap: (t: number) => void } {
  const g = new THREE.Group();
  const feathers = DETAIL.coat(0x6b4a2a);
  const pale = DETAIL.coat(0xb8915a);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const body = new THREE.Mesh(
    tube(
      new THREE.CatmullRomCurve3([
        V(0, 0, 1.6),
        V(0, 0.1, 0.4),
        V(0, 0.25, -0.8),
        V(0, 0.55, -1.5),
      ]),
      [
        { t: 0, w: 0.15, h: 0.1 },
        { t: 0.3, w: 0.55, h: 0.5 },
        { t: 0.75, w: 0.4, h: 0.4 },
        { t: 1, w: 0.25, h: 0.25 },
      ],
      16,
      14,
    ),
    feathers,
  );
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), pale);
  head.position.set(0, 0.62, -1.62);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.42, 10).rotateX(-Math.PI / 2 - 0.5),
    MAT.paint(0xe0b030, 0.5, 0.1),
  );
  beak.position.set(0, 0.52, -1.95);
  g.add(head, beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), MAT.paint(0x111111, 0.2, 0));
    eye.position.set(s * 0.18, 0.7, -1.78);
    g.add(eye);
  }
  // Tail fan.
  const tail = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 12, Math.PI * 1.2, Math.PI * 0.6),
    feathers,
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.05, 1.3);
  (tail.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(tail);
  // Wings: a feathered shape, hinged at the shoulder.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.5);
  wingShape.bezierCurveTo(1.5, 0.9, 3.2, 0.7, 4.6, 0.2);
  for (let i = 0; i < 6; i++) wingShape.lineTo(4.6 - i * 0.55, -0.35 - (i % 2) * 0.35 - i * 0.08);
  wingShape.lineTo(0.2, -0.8);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.4, 0.35, -0.5);
    const w = new THREE.Mesh(wingGeo, feathers);
    w.scale.set(s, 1, 1);
    hinge.add(w);
    g.add(hinge);
    wings.push(hinge);
  }
  // Talons gripping downwards.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.05, 0.7, 8),
      MAT.paint(0xd8a840, 0.6, 0),
    );
    leg.position.set(s * 0.25, -0.45, -0.2);
    g.add(leg);
  }
  g.traverse((o) => (o.castShadow = true));
  return {
    group: g,
    flap: (t: number) => {
      const a = Math.sin(t * 7) * 0.6;
      wings[0]!.rotation.z = -a;
      wings[1]!.rotation.z = a;
    },
  };
}
