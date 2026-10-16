import * as THREE from 'three';
import { type KartState, RESCUE_TIME, driftLevel } from '@epic/sim';
import { greatEagle } from './eagle.ts';
import { DRIFT_COLORS, type Effects, flame } from './effects.ts';
import { type VehicleModel, buildVehicle } from './vehicles.ts';

const V = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.y, v.z);
const tmp = new THREE.Vector3();

/** Visual twin of a simulated kart: interpolation, animation and effects. */
export class KartView {
  readonly root = new THREE.Group();
  readonly model: VehicleModel;
  private flames: THREE.Group[] = [];
  private lean = 0;
  private yawOff = 0;
  private wheelSpin = 0;
  private t = Math.random() * 10;
  private lastBump = 0;
  /** Smoothed render pose, also used by the camera. */
  readonly pos = new THREE.Vector3();
  readonly fwd = new THREE.Vector3(0, 0, -1);
  readonly up = new THREE.Vector3(0, 1, 0);
  private eagle: ReturnType<typeof greatEagle> | null = null;
  private airPitch = 0;

  constructor(vehicleId: string, color: string) {
    this.model = buildVehicle(vehicleId, color);
    this.root.add(this.model);
    for (const ex of this.model.userData.exhausts) {
      const f = flame();
      f.position.copy(ex);
      f.scale.setScalar(0.001);
      this.model.userData.body.add(f);
      this.flames.push(f);
    }
  }

  update(k: KartState, steer: number, alpha: number, dt: number, fx: Effects): void {
    this.t += dt;
    this.pos.copy(V(k.prevPos)).lerp(V(k.pos), alpha);
    this.fwd.copy(V(k.prevFwd)).lerp(V(k.fwd), alpha).normalize();
    this.up.copy(V(k.prevUp)).lerp(V(k.up), alpha).normalize();
    let right = new THREE.Vector3().crossVectors(this.fwd, this.up).normalize();
    let back = this.fwd.clone().negate();
    this.root.position.copy(this.pos);
    // In the air, pitch the nose along the flight path.
    const targetPitch = k.air ? Math.atan2(k.vel.y, Math.hypot(k.vel.x, k.vel.z)) * 0.8 : 0;
    this.airPitch += (targetPitch - this.airPitch) * Math.min(1, dt * 6);
    let up = this.up.clone();
    if (Math.abs(this.airPitch) > 0.01) {
      const q = new THREE.Quaternion().setFromAxisAngle(right, this.airPitch);
      back = back.applyQuaternion(q);
      up = up.applyQuaternion(q);
      right = new THREE.Vector3().crossVectors(back.clone().negate(), up).normalize();
    }
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    // Eagle rescue: carried down from the sky.
    if (k.rescueTime > 0) {
      if (!this.eagle) {
        this.eagle = greatEagle();
        this.eagle.group.scale.setScalar(1.6);
        this.root.add(this.eagle.group);
      }
      const t = k.rescueTime / RESCUE_TIME;
      this.root.position.addScaledVector(this.up, t * t * 16);
      this.eagle.group.visible = true;
      this.eagle.group.position.set(0, 3.2 + (1 - t) * 3 * (1 - t), 0);
      this.eagle.flap(this.t);
    } else if (this.eagle) {
      this.eagle.group.visible = false;
    }

    const ud = this.model.userData;
    const lvl = k.drift.active ? driftLevel(k.drift.charge) : -1;

    // Body: drift yaw, lean into corners, hover bob, bump shake.
    const targetYaw = k.drift.active ? k.drift.dir * -0.38 : -steer * 0.06;
    this.yawOff += (targetYaw - this.yawOff) * Math.min(1, dt * 8);
    const targetLean =
      -steer * Math.min(1, Math.abs(k.speed) / 20) * 0.07 +
      (k.drift.active ? k.drift.dir * 0.05 : 0);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    const body = ud.body;
    body.rotation.set(0, this.yawOff, this.lean);
    if (ud.hover) body.position.y = Math.sin(this.t * 3.1) * 0.08 + Math.sin(this.t * 7.3) * 0.02;
    if (k.stunTime > 0) body.rotation.y += this.t * 14;
    if (k.bump > 0.05) body.position.x = (Math.random() - 0.5) * k.bump * 0.15;
    else body.position.x = 0;

    // Wheels spin with speed; fronts steer.
    this.wheelSpin += (k.speed * dt) / 0.42;
    ud.wheels.forEach((w, i) => {
      w.rotation.order = 'YXZ';
      w.rotation.x = -this.wheelSpin;
      w.rotation.y = i < 2 ? -steer * 0.35 : 0;
    });

    ud.animate?.(this.t, k.speed, dt);

    // Boost flames; pod engines always idle with a short blue glow.
    const boost = k.boostTime > 0 ? 1 : 0;
    const idle = ud.hover ? 0.35 : 0.0;
    const len = Math.max(
      boost * (1.1 + Math.sin(this.t * 40) * 0.15),
      idle * (0.8 + Math.sin(this.t * 25) * 0.1),
    );
    for (const f of this.flames) {
      const s = len > 0.01 ? len : 0.001;
      f.scale.set(Math.max(0.6, s), Math.max(0.6, s), s);
      f.visible = len > 0.01;
    }

    // Particles, in world space.
    const toWorld = (local: THREE.Vector3) => local.clone().applyMatrix4(body.matrixWorld);
    this.root.updateMatrixWorld();
    if (lvl >= 0 && Math.abs(k.speed) > 5) {
      const rearL =
        ud.rear?.[0] ?? (ud.hover ? ud.exhausts[0]! : new THREE.Vector3(-0.9, 0.05, 1.6));
      const rearR =
        ud.rear?.[1] ?? (ud.hover ? ud.exhausts[1]! : new THREE.Vector3(0.9, 0.05, 1.6));
      for (const p of [rearL, rearR]) {
        const wp = toWorld(p);
        const n = lvl > 0 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          tmp
            .set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4)
            .add(right.clone().multiplyScalar(-k.drift.dir * 3));
          fx.sparks.emit(
            wp,
            tmp,
            DRIFT_COLORS[lvl]!,
            1,
            lvl > 0 ? 0.22 : 0.12,
            0.25 + Math.random() * 0.2,
          );
        }
        if (!ud.hover && Math.random() < 0.6) {
          fx.smoke.emit(
            wp,
            tmp.set(0, 0.6, 0).addScaledVector(this.fwd, -2),
            new THREE.Color(0.85, 0.85, 0.85),
            0.35,
            0.8,
            0.9,
            2.2,
          );
        }
      }
    }
    if (boost && ud.ghost) {
      // Wraith boost: a trail of shadowy smoke instead of jet flames.
      for (let i = 0; i < 3; i++) {
        const wp = toWorld(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            0.6 + Math.random() * 1.6,
            0.6 + Math.random() * 0.6,
          ),
        );
        fx.smoke.emit(
          wp,
          back
            .clone()
            .multiplyScalar(3)
            .add(new THREE.Vector3(0, 0.8, 0)),
          new THREE.Color(0.06, 0.06, 0.09),
          0.7,
          0.9,
          0.8,
          2.5,
        );
      }
    }
    if (boost) {
      for (const ex of ud.exhausts) {
        const wp = toWorld(ex.clone().add(new THREE.Vector3(0, 0, 0.6)));
        fx.sparks.emit(
          wp,
          back
            .clone()
            .multiplyScalar(6)
            .add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, 0)),
          DRIFT_COLORS[2]!,
          1,
          0.18,
          0.2,
        );
      }
    }
    if (k.bump > this.lastBump + 0.25) {
      for (let i = 0; i < 24; i++) {
        tmp.set((Math.random() - 0.5) * 10, Math.random() * 7, (Math.random() - 0.5) * 10);
        fx.sparks.emit(
          this.pos.clone().addScaledVector(this.up, 0.6),
          tmp,
          new THREE.Color(1.6, 1.2, 0.4),
          1,
          0.14,
          0.4,
        );
      }
    }
    this.lastBump = k.bump;
  }
}
