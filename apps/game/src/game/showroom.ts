import * as THREE from 'three';
import { Track } from '@epic/sim';
import { trackById } from './tracks.ts';
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
    trackId = 'shire',
  ) {
    const entry = trackById(trackId);
    const track = new Track(entry.def);
    this.track = track;
    this.world = new World(track, view.renderer, entry.theme);
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

  /** Optional fixed camera at a track position: arc length, lateral offset, height, look-ahead. */
  spot?: { s: number; lat: number; h: number; look: number; lookLat: number };
  private track?: Track;

  frame(dt: number, orbit = true): void {
    if (this.spot && this.track) {
      const sp = this.spot;
      const f = this.track.frameAtS(sp.s);
      const g = this.track.frameAtS(sp.s + sp.look);
      this.camera.position.set(
        f.pos.x + f.right.x * sp.lat,
        f.pos.y + sp.h,
        f.pos.z + f.right.z * sp.lat,
      );
      this.camera.lookAt(
        g.pos.x + g.right.x * sp.lookLat,
        g.pos.y + 1,
        g.pos.z + g.right.z * sp.lookLat,
      );
      this.world.focusSun(
        this.camera.position
          .clone()
          .add(new THREE.Vector3(g.pos.x - f.pos.x, 0, g.pos.z - f.pos.z).multiplyScalar(0.5)),
      );
      this.world.fx.update(dt);
      this.world.update(dt);
      this.view.render(this.world.scene, [{ x: 0, y: 0, w: 1, h: 1, camera: this.camera }]);
      return;
    }
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
    this.world.update(dt);
    this.view.render(this.world.scene, [{ x: 0, y: 0, w: 1, h: 1, camera: this.camera }]);
  }
}
