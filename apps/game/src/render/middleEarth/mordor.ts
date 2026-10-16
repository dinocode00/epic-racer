import * as THREE from 'three';
import { greatEagle } from '../eagle.ts';
import { MAT } from '../modelKit.ts';
import type { DressContext } from '../themes.ts';
import { off, tv } from '../trackMesh.ts';
import { features } from './theme.ts';

/** Mordor: Mount Doom's fire, lava rivers and streams, fell beasts in the red sky. */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lavaMat = () => new THREE.MeshBasicMaterial({ color: 0xff5a14 });

export function dressMordor(ctx: DressContext): (t: number, dt: number) => void {
  const { scene, track, terrain } = ctx;
  const F = features(track);
  const animated: ((t: number, dt: number) => void)[] = [];

  // Mount Doom: glowing crater, lava streams down the flanks, a column of smoke.
  {
    const top = terrain.height(F.doom.x, F.doom.z);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(20, 24), lavaMat());
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(F.doom.x, top + 2, F.doom.z);
    scene.add(crater);
    const glow = new THREE.PointLight(0xff5010, 3000, 500, 1.2);
    glow.position.set(F.doom.x, top + 40, F.doom.z);
    scene.add(glow);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const pts: THREE.Vector3[] = [];
      for (let r = 20; r < 210; r += 15) {
        const x = F.doom.x + Math.cos(a + Math.sin(r * 0.03) * 0.3) * r,
          z = F.doom.z + Math.sin(a + Math.sin(r * 0.03) * 0.3) * r;
        pts.push(V(x, terrain.height(x, z) + 0.6, z));
      }
      scene.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 2.2, 6),
          lavaMat(),
        ),
      );
    }
    const smoke = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 12, 220, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x1a0c08,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    smoke.position.set(F.doom.x, top + 120, F.doom.z);
    scene.add(smoke);
    animated.push((t) => (glow.intensity = 2600 + Math.sin(t * 2.3) * 500));
  }

  // The lava river under the jump.
  {
    const pts = F.lavaRiver.map(([x, z]) => V(x, terrain.height(x, z) + 1.2, z));
    const river = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 7, 8),
      lavaMat(),
    );
    river.scale.y = 0.2;
    river.position.y = pts[0]!.y * 0.8;
    scene.add(river);
    const mid = pts[Math.floor(pts.length / 2)]!;
    const l = new THREE.PointLight(0xff6a20, 500, 90, 1.4);
    l.position.copy(mid).add(V(0, 6, 0));
    scene.add(l);
  }

  // Fell beasts with their Nazgûl riders, wheeling over Mordor.
  {
    const marks = track.def.marks ?? {};
    const centre = tv(off(track.frameAtS((marks.mountDoom ?? 3973) + 40), -60, 0));
    for (let i = 0; i < 3; i++) {
      const b = greatEagle();
      b.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = MAT.paint(0x141210, 0.8, 0.1);
      });
      b.group.scale.setScalar(4);
      scene.add(b.group);
      animated.push((t) => {
        const a = t * 0.25 + (i * Math.PI * 2) / 3;
        const r = 90 + i * 25;
        b.group.position.set(
          centre.x + Math.cos(a) * r,
          centre.y + 70 + i * 15 + Math.sin(t + i) * 5,
          centre.z + Math.sin(a) * r,
        );
        b.group.rotation.y = -a;
        b.group.rotation.z = 0.25;
        b.flap(t * 0.6 + i);
      });
    }
  }

  return (t, dt) => animated.forEach((a) => a(t, dt));
}
