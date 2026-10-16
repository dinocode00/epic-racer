import * as THREE from 'three';
import type { KartView } from '../render/kartView.ts';

/** Chase camera that follows the kart's own "up", so loops and the fold read naturally. */
export class ChaseCam {
  readonly camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.3, 6000);
  private pos = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private look = new THREE.Vector3();
  private fov = 64;
  private init = false;

  update(v: KartView, speed: number, boosting: boolean, lookBack: boolean, dt: number): void {
    const dir = lookBack ? -1 : 1;
    const dist = 5.6 + Math.min(1.4, Math.max(0, speed) / 25);
    const want = v.pos.clone().addScaledVector(v.fwd, -dist * dir).addScaledVector(v.up, 2.1);
    const lookAt = v.pos.clone().addScaledVector(v.fwd, 3.5 * dir).addScaledVector(v.up, 1.25);
    if (!this.init) {
      this.pos.copy(want);
      this.look.copy(lookAt);
      this.up.copy(v.up);
      this.init = true;
    }
    const k = 1 - Math.exp(-dt * (lookBack ? 30 : 10));
    this.pos.lerp(want, k);
    this.look.lerp(lookAt, 1 - Math.exp(-dt * 18));
    this.up.lerp(v.up, 1 - Math.exp(-dt * 6)).normalize();
    // Never let the camera fall too far behind at high speed.
    const off = this.pos.clone().sub(v.pos);
    if (off.length() > dist * 1.6) this.pos.copy(v.pos).add(off.setLength(dist * 1.6));

    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);
    const targetFov = 64 + (boosting ? 12 : 0) + Math.min(6, Math.max(0, speed - 20) * 0.4);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.camera.fov = this.fov;
  }
}
