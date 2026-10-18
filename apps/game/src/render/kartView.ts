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

  /** Bounding sphere of the model in kart-local space (long pods reach far ahead). */
  private bounds = new THREE.Sphere();

  constructor(vehicleId: string, color: string) {
    this.model = buildVehicle(vehicleId, color);
    this.root.add(this.model);
    new THREE.Box3().setFromObject(this.model).getBoundingSphere(this.bounds);
    for (const ex of this.model.userData.exhausts) {
      const f = flame();
      f.position.copy(ex);
      f.scale.setScalar(0.001);
      this.model.userData.body.add(f);
      this.flames.push(f);
    }
    // Slipstream: thin wind streaks rushing past while tucked in behind someone.
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xdff4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const r = Math.max(1.2, this.bounds.radius * 0.8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 3.2), streakMat);
      m.position.set(Math.cos(a) * r, 0.9 + Math.sin(a) * r * 0.6, 0);
      m.userData.phase = i * 0.37;
      this.streaks.add(m);
    }
    this.streaks.visible = false;
    this.root.add(this.streaks);
  }
  private streaks = new THREE.Group();

  // ---------------------------------------------------------------- item visuals
  private gold: ReturnType<typeof greatEagle> | null = null;
  private fxParts: {
    shield: THREE.Mesh;
    blade: THREE.Group;
    jet: THREE.Mesh;
    held: THREE.Mesh;
    jacks: THREE.Group;
  } | null = null;

  private buildFx() {
    const r = Math.max(1.6, this.bounds.radius * 0.95);
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xdfe8f2,
        metalness: 1,
        roughness: 0.15,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    shield.position.copy(this.bounds.center);
    // Morgul blade: a long pale sword held out to one side.
    const blade = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
      color: 0xcfe4ff,
      emissive: 0x7fb6ff,
      emissiveIntensity: 1.6,
      metalness: 0.9,
      roughness: 0.2,
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 0.22), steel);
    edge.position.x = 2.4;
    const hilt = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.6 }),
    );
    hilt.position.x = 0.45;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.6, 4), steel);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 4.6;
    blade.add(edge, hilt, tip);
    blade.position.y = 2.2;
    // Flame vent: a roaring jet out of the back (+z is behind).
    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 12, 16, 1, true).translate(0, -6, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff7a1a,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    jet.position.set(0, 0.9, this.bounds.center.z + this.bounds.radius * 0.6);
    // The held shot or trap, trailed behind.
    const held = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd46a, emissive: 0xaa6a10 }),
    );
    held.position.set(0, 0.6, this.bounds.center.z + this.bounds.radius + 0.6);
    // Mach 5 auto-jacks: four struts that punch down under the car.
    const jacks = new THREE.Group();
    for (const [x, z] of [
      [-0.8, -1.2],
      [0.8, -1.2],
      [-0.8, 1.2],
      [0.8, 1.2],
    ] as const) {
      const j = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 }),
      );
      j.position.set(x, -0.3, z);
      jacks.add(j);
    }
    this.root.add(shield, blade, jet, held, jacks);
    return { shield, blade, jet, held, jacks };
  }

  private itemVisuals(k: KartState, dt: number, fx: Effects): void {
    const sp = k.special;
    if (!this.fxParts && !k.shieldTime && !sp && !k.trailing && !k.eagleTime) return;
    this.fxParts ??= this.buildFx();
    const P = this.fxParts;
    P.shield.visible = k.shieldTime > 0;
    if (P.shield.visible) P.shield.rotation.y += dt * 0.8;
    P.held.visible = k.trailing && !!k.item;
    if (P.held.visible) P.held.rotation.set(this.t * 3, this.t * 2, 0);
    P.blade.visible = sp?.kind === 'morgul';
    if (sp?.kind === 'morgul') {
      // +x is the kart's right; swing smoothly to the side with the nearest rival.
      const want = sp.side >= 0 ? 0 : Math.PI;
      P.blade.rotation.y += (want - P.blade.rotation.y) * Math.min(1, dt * 10);
      tmp.set(4.6, 0, 0).applyEuler(P.blade.rotation).add(P.blade.position);
      this.root.localToWorld(tmp);
      fx.sparks.emit(tmp, new THREE.Vector3(), new THREE.Color(0.6, 0.85, 1.6), 0.7, 0.3, 0.35);
    }
    this.flameOn = sp?.kind === 'flame';
    P.jet.visible = this.flameOn;
    if (sp?.kind === 'flame') {
      P.jet.scale.set(
        0.8 + Math.random() * 0.4,
        0.8 + Math.random() * 0.4,
        0.85 + Math.random() * 0.3,
      );
      for (let i = 0; i < 4; i++) {
        tmp.set((Math.random() - 0.5) * 1.5, 0.9, P.jet.position.z + Math.random() * 10);
        this.root.localToWorld(tmp);
        fx.sparks.emit(
          tmp,
          new THREE.Vector3(0, 2, 0),
          new THREE.Color(1.6, 0.55, 0.1),
          1,
          0.6,
          0.35,
        );
      }
    }
    P.jacks.visible = sp?.kind === 'jacks' && sp.time > 1.6;
    // Batmissile: the car narrows into a long rocket with a roaring afterburner.
    const body = this.model.userData.body;
    const missile = sp?.kind === 'missile';
    const sx = missile ? 0.55 : 1,
      sz = missile ? 1.18 : 1;
    body.scale.x += (sx - body.scale.x) * Math.min(1, dt * 10);
    body.scale.z += (sz - body.scale.z) * Math.min(1, dt * 10);
    // The Great Eagle (the track item) is golden, so it's never mistaken for a rescue.
    if (k.eagleTime > 0) {
      if (!this.gold) {
        this.gold = greatEagle();
        this.gold.group.scale.setScalar(1.7);
        this.gold.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            mat.color = new THREE.Color(0xd9a93a);
            mat.emissive = new THREE.Color(0x3a2606);
            mat.metalness = 0.6;
            m.material = mat;
          }
        });
        this.root.add(this.gold.group);
      }
      this.gold.group.visible = true;
      this.gold.group.position.set(0, 3.3, 0);
      this.gold.flap(this.t * 1.4);
    } else if (this.gold) this.gold.group.visible = false;
  }

  /** Called per viewport: the owner's own chase camera sits inside the flame jet. */
  setViewer(own: boolean): void {
    if (this.fxParts) this.fxParts.jet.visible = this.flameOn && !own;
  }
  private flameOn = false;

  /** True when any part of this kart would sit right on top of the given camera. */
  crowds(cam: THREE.Vector3): boolean {
    tmp.copy(this.bounds.center);
    this.root.localToWorld(tmp);
    return tmp.distanceTo(cam) < this.bounds.radius + 1.2;
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
    this.itemVisuals(k, dt, fx);

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
    if (k.stunTime > 0 && k.stunTotal > 0) {
      // Spin out: whole turns that ease off and come back round facing forward.
      const turns = Math.max(1, Math.round(k.stunTotal * 2.2));
      const t = 1 - k.stunTime / k.stunTotal;
      body.rotation.y += turns * Math.PI * 2 * (1 - (1 - t) * (1 - t));
    }
    if (k.wobbleTime > 0) {
      // Knocked off balance from behind: a fishtailing wobble that settles.
      const w = Math.min(1, k.wobbleTime / 0.9);
      body.rotation.y += Math.sin(this.t * 20) * 0.32 * w;
      body.rotation.z += Math.sin(this.t * 17 + 1) * 0.1 * w;
    }
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

    const draft = Math.min(1, k.draft / 1.1);
    this.streaks.visible = draft > 0.12 && !k.air;
    if (this.streaks.visible) {
      this.streaks.children.forEach((c) => {
        const m = c as THREE.Mesh;
        // Streaks flow back past the kart (local +z is behind); faster as the charge builds.
        m.position.z = ((((this.t * (8 + draft * 10) + m.userData.phase * 4) % 6) + 6) % 6) - 2;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.15 + draft * 0.45;
      });
    }

    // Boost flames; pod engines always idle with a short blue glow.
    // Specials (except the morgul gallop) roar like a boost.
    const boost = k.boostTime > 0 || (k.special && k.special.kind !== 'morgul') ? 1 : 0;
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
