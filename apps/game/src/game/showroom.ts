import * as THREE from 'three';
import { PROVING, Track } from '@epic/sim';
import { KartView } from '../render/kartView.ts';
import type { View } from '../render/view.ts';
import { World } from '../render/world.ts';

/**
 * Static scene that lines the vehicles up on the start straight with a slow orbiting
 * camera. Used for the vehicle-select backdrop and for design screenshots.
 */
export class Showroom {
  readonly world: World;
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 6000);
  private t = 0;
  private center = new THREE.Vector3();
  views: KartView[] = [];

  constructor(
    private view: View,
    vehicles: string[],
    colors: string[],
    private angle = 0.6,
    private animSpeed = 0,
  ) {
    const track = new Track(PROVING);
    this.world = new World(track, view.renderer);
    const f = track.frameAtS(60);
    const fwd = new THREE.Vector3(f.tan.x, f.tan.y, f.tan.z);
    const right = new THREE.Vector3(f.right.x, f.right.y, f.right.z);
    this.center.set(f.pos.x, f.pos.y, f.pos.z);
    vehicles.forEach((id, i) => {
      const v = new KartView(id, colors[i]!);
      const off = (i - (vehicles.length - 1) / 2) * 4.4;
      const p = this.center.clone().addScaledVector(right, off);
      v.root.position.copy(p);
      // Face slightly toward the camera side.
      const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.25);
      v.root.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)),
          new THREE.Vector3(0, 1, 0),
          dir.clone().negate(),
        ),
      );
      if (v.model.userData.hover) v.model.position.y = 0.7;
      this.world.scene.add(v.root);
      this.views.push(v);
    });
    this.fwd = fwd;
    this.right = right;
  }
  private fwd: THREE.Vector3;
  private right: THREE.Vector3;

  frame(dt: number, orbit = true): void {
    this.t += dt;
    const a = this.angle + (orbit ? this.t * 0.12 : 0);
    const dist = 5.5 + 3 * this.views.length;
    for (const v of this.views) v.model.userData.animate?.(this.t, this.animSpeed, dt);
    const camPos = this.center
      .clone()
      .addScaledVector(this.fwd, Math.cos(a) * dist)
      .addScaledVector(this.right, Math.sin(a) * dist)
      .add(new THREE.Vector3(0, 3.2, 0));
    this.camera.position.copy(camPos);
    this.camera.lookAt(
      this.center.clone().add(new THREE.Vector3(0, this.views.length === 1 ? 1.2 : 0.8, 0)),
    );
    this.world.focusSun(this.center);
    this.world.fx.update(dt);
    this.view.render(this.world.scene, [{ x: 0, y: 0, w: 1, h: 1, camera: this.camera }]);
  }
}
