import * as THREE from 'three';
import { J, arm, clothes, cloth, jeansTop, leg, neck, shirt } from './grandpa/body.ts';
import { buildHead } from './grandpa/head.ts';

/**
 * Grandpa: the farm's NPC, built from the owner's photo and description. 70 years old,
 * 6 ft 1 in (1.85 m) and thin, always in his navy trucker cap, a loose blue-and-red plaid
 * flannel shirt, baggy blue work jeans worn very low on the hips with a belt, brown cowboy
 * boots and tan leather work gloves. He walks slowly and easily, feet barely lifting, so his
 * heels drag along the ground.
 *
 * He is modelled in finer detail than the rest of the farm: a sculpted, painted face, cloth
 * folds, seams, stitching, rivets, pockets and buttons. Real metres, standing on y = 0,
 * facing -Z like the game's other characters. The rig is a hierarchy of groups posed
 * procedurally: `animate(t, speed, act)` with speed in m/s (0 stands, ~0.55 is his stroll)
 * and an optional act layered on top:
 *  - wave: walking along, he lifts his cap off with his right hand and waves it high over his
 *    head at someone far off, smiling, then puts it back on;
 *  - ride: sitting on the lawn tractor, right hand on the wheel, left hand across his lap.
 */

/** The cap-wave, `t` seconds in (it runs WAVE_LENGTH seconds, then he is back to walking). */
export interface WaveAct {
  kind: 'wave';
  t: number;
}
/** Riding the lawn tractor: his group sits on its seat; the wheel is where his hand goes. */
export interface RideAct {
  kind: 'ride';
  /** The steering wheel (rim in its local x/z plane, radius `wheelR`). */
  wheel: THREE.Object3D;
  wheelR: number;
  /** Where his boots rest, in his own group's frame. */
  feet: [THREE.Vector3, THREE.Vector3];
  /** Engine shake (0..1) and how fast he's going (m/s), for the cloth. */
  shake: number;
  speed: number;
}
export type Act = WaveAct | RideAct;
export const WAVE_LENGTH = 8.6;

export interface Grandpa {
  group: THREE.Group;
  /** Pose for time t (s) at a walking speed (m/s), with an optional act on top. */
  animate(t: number, speed: number, act?: Act): void;
  strollSpeed: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildGrandpa(): Grandpa {
  const m = clothes();
  const group = new THREE.Group();
  group.name = 'grandpa';
  // Built facing +Z; the outer group turns him to face -Z like the other characters.
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  group.add(body);

  const hips = new THREE.Group();
  hips.position.y = J.hip;
  body.add(hips);
  hips.add(jeansTop(m));
  const spine = new THREE.Group();
  hips.add(spine);
  const shirtG = shirt(m);
  spine.add(shirtG);
  const shirtUpdate = shirtG.userData.update as () => void;
  const chest = new THREE.Group();
  chest.position.y = J.chest - J.hip;
  spine.add(chest);
  chest.add(neck(m));
  const neckJ = new THREE.Group();
  neckJ.position.set(0, J.neck - J.chest, 0.01);
  chest.add(neckJ);
  const head = buildHead();
  const headG = head.group;
  headG.position.set(0, 0.118, 0.016);
  neckJ.add(headG);
  const arms = [-1, 1].map((s) => {
    const a = arm(m, s);
    a.shoulder.position.set(s * J.shoulderX, J.shoulder - J.chest, -0.005);
    chest.add(a.shoulder);
    return a;
  });
  const legs = [-1, 1].map((s) => {
    const l = leg(m, s);
    l.hip.position.set(s * J.hipX, 0, 0);
    hips.add(l.hip);
    return l;
  });

  const THIGH = J.thigh,
    SHIN = J.shin;
  // Two-bone leg IK in the leg's plane: ankle target (forward z, down y) from the hip.
  const solveLeg = (l: (typeof legs)[number], fz: number, down: number, footPitch: number) => {
    const d = Math.min(Math.hypot(fz, down), THIGH + SHIN - 0.001);
    const kneeIn = Math.acos(
      THREE.MathUtils.clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1),
    );
    const flex = Math.PI - kneeIn;
    const toTarget = Math.atan2(fz, down);
    const offset = Math.acos(
      THREE.MathUtils.clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1),
    );
    const thigh = toTarget + offset;
    l.hip.rotation.set(-thigh, 0, 0);
    l.knee.rotation.x = flex;
    l.ankle.rotation.x = thigh - flex - footPitch;
  };

  // ---- arm IK (chest frame): wrist to a target, elbow toward a pole direction.
  const L1 = J.upperArm,
    L2 = J.forearm;
  const tmp = {
    D: V(0, 0, 0),
    P: V(0, 0, 0),
    u: V(0, 0, 0),
    E: V(0, 0, 0),
    f: V(0, 0, 0),
    X: V(0, 0, 0),
    Y: V(0, 0, 0),
    Z: V(0, 0, 0),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
  };
  const reach = (
    a: (typeof arms)[number],
    target: THREE.Vector3,
    pole: THREE.Vector3,
    w: number,
  ) => {
    if (w <= 0) return;
    const S = a.shoulder.position;
    const { D, P, u, E, f, X, Y, Z } = tmp;
    D.subVectors(target, S);
    const d = THREE.MathUtils.clamp(D.length(), 0.08, L1 + L2 - 0.002);
    D.normalize();
    const A = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    P.copy(pole).addScaledVector(D, -pole.dot(D)).normalize();
    u.copy(D).multiplyScalar(Math.cos(A)).addScaledVector(P, Math.sin(A));
    E.copy(S).addScaledVector(u, L1);
    f.copy(S).addScaledVector(D, d).sub(E).normalize();
    const flex = Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1));
    Z.copy(f).addScaledVector(u, -f.dot(u));
    if (Z.lengthSq() < 1e-6) Z.copy(P).negate();
    Z.normalize();
    Y.copy(u).negate();
    X.crossVectors(Y, Z).normalize();
    tmp.q.setFromRotationMatrix(tmp.m.makeBasis(X, Y, Z));
    a.shoulder.quaternion.slerp(tmp.q, w);
    a.elbow.rotation.x += (-flex - a.elbow.rotation.x) * w;
  };
  /** Turn the hand about the forearm so the palm faces `dir` (chest frame). */
  const wq = new THREE.Quaternion(),
    cq = new THREE.Quaternion(),
    dv = V(0, 0, 0);
  const palmToward = (a: (typeof arms)[number], i: number, dir: THREE.Vector3, w: number) => {
    if (w <= 0) return;
    a.wrist.updateWorldMatrix(true, false);
    chest.getWorldQuaternion(cq);
    a.wrist.getWorldQuaternion(wq);
    dv.copy(dir).applyQuaternion(cq).applyQuaternion(wq.invert());
    const s = i ? 1 : -1;
    const alpha = Math.atan2(-dv.x, -dv.z);
    const phi = alpha - (s * Math.PI) / 2;
    const cur = a.wrist.rotation.y;
    let dphi = phi - cur;
    dphi = Math.atan2(Math.sin(dphi), Math.cos(dphi));
    a.wrist.rotation.y = cur + dphi * w;
  };

  // ---- the cap: on his head, or in his right hand.
  const cap = head.cap;
  const capInHand = { on: false };
  /** The point on the bill he pinches (cap frame). */
  const GRIP = V(0, 0.034, 0.132);
  /** Where he takes hold of it to lift it off: the top of the crown, toward the front. */
  const TAKE = V(0, 0.15, 0.03);
  const rightWrist = arms[0]!.wrist;
  /** How he holds it: bill pinched in the fingers, crown out past the fingertips, the front
   * of the cap facing the way his palm does (wrist frame). */
  const held = (() => {
    const s = -1;
    const Zc = V(0, 1, 0),
      Yc = V(-s, 0, 0),
      Xc = new THREE.Vector3().crossVectors(Yc, Zc);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(Xc, Yc, Zc),
    );
    const g = V(-0.02 * s, -0.15, 0);
    return { q, p: g.sub(GRIP.clone().applyQuaternion(q)) };
  })();
  const fromPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
  const restWorld = new THREE.Matrix4(),
    restInWrist = new THREE.Matrix4(),
    rp = V(0, 0, 0),
    rq = new THREE.Quaternion(),
    rs = V(1, 1, 1);
  const takeCap = () => {
    rightWrist.attach(cap);
    fromPose.p.copy(cap.position);
    fromPose.q.copy(cap.quaternion);
    capInHand.on = true;
  };
  const putCapBack = () => {
    headG.attach(cap);
    cap.position.copy(head.capRest.position);
    cap.quaternion.copy(head.capRest.quaternion);
    capInHand.on = false;
  };

  const strollSpeed = 0.55; // about 1.2 mph: an easy amble
  let phase = 0,
    lastT = 0,
    gait = 0;
  const gw = V(0, 0, 0),
    target = V(0, 0, 0),
    pole = V(0, 0, 0),
    fwd = V(0, 0, 1),
    lapT = V(0, 0, 0);

  const animate = (t: number, speed: number, act?: Act) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const riding = act?.kind === 'ride';
    gait += ((riding ? 0 : Math.min(1, speed / strollSpeed)) - gait) * Math.min(1, dt * 3);
    const stride = 0.48; // short, unhurried steps, about 70 a minute
    const cadence = riding ? 0 : speed / (2 * stride);
    phase += dt * cadence * Math.PI * 2;
    const w = gait;
    const breathe = Math.sin(t * 1.6) * 0.004;

    // A little stooped, a gentle bob and sway, hips and shoulders counter-turning; standing,
    // a slow shift of weight from foot to foot.
    const bob = Math.abs(Math.sin(phase)) * 0.012 * w;
    hips.position.set(
      Math.sin(phase) * 0.012 * w + (1 - w) * Math.sin(t * 0.31) * 0.006,
      J.hip - 0.012 * w - bob + 0.006,
      0,
    );
    hips.rotation.set(0, Math.sin(phase) * 0.06 * w, (1 - w) * Math.sin(t * 0.31) * 0.01);
    spine.rotation.set(0.07 + 0.03 * w + breathe, -Math.sin(phase) * 0.08 * w, 0);
    chest.rotation.set(0, 0, Math.sin(phase) * 0.015 * w);
    neckJ.rotation.set(
      -0.04 - 0.03 * w,
      (1 - w) * (Math.sin(t * 0.23) * 0.45 + Math.sin(t * 0.71) * 0.06),
      0,
    );
    headG.rotation.set(0.02 * Math.sin(phase * 2) * w + (1 - w) * Math.sin(t * 0.17) * 0.03, 0, 0);

    if (riding) {
      // Sat back on the seat (his group's origin is the seat under him), a bit slumped,
      // the engine shaking him gently, looking ahead and now and then off to the side.
      const sh = act.shake;
      hips.position.set(
        Math.sin(t * 61) * 0.0012 * sh,
        0.095 + Math.sin(t * 47) * 0.0018 * sh,
        0.0,
      );
      hips.rotation.set(-0.05, 0, Math.sin(t * 0.7) * 0.01);
      spine.rotation.set(0.16 + breathe, Math.sin(t * 0.3) * 0.03, 0);
      neckJ.rotation.set(-0.12, Math.sin(t * 0.21) * 0.35 + Math.sin(t * 0.9) * 0.04, 0);
      legs.forEach((l, i) => {
        // His feet on the footrests: the target is in his group's frame (facing -Z), the
        // leg's frame faces +Z, so flip x and z.
        const f = act.feet[i]!;
        const hipX = (i ? 1 : -1) * J.hipX + hips.position.x;
        const fz = -f.z - hips.position.z;
        const down = hips.position.y - (f.y + J.ankle);
        solveLeg(l, fz, down, -0.25);
        // Knees fall open a little, toward where the foot is.
        l.hip.rotation.z = THREE.MathUtils.clamp((-f.x - hipX) * 0.6, -0.3, 0.3);
      });
    } else {
      // Stance foot planted and sliding back under him; swing foot brought through low with
      // the toe up, so the heel scuffs along the ground.
      legs.forEach((l, i) => {
        const ph = phase + (i ? Math.PI : 0);
        const c = (((ph / (Math.PI * 2)) % 1) + 1) % 1;
        const stanceFrac = 0.62;
        let fz: number, lift: number, pitch: number;
        if (c < stanceFrac) {
          const s = c / stanceFrac;
          fz = stride * (0.5 - s);
          lift = 0;
          pitch = s < 0.15 ? (0.15 - s) * 1.2 : s > 0.8 ? -(s - 0.8) * 1.0 : 0;
        } else {
          const s = (c - stanceFrac) / (1 - stanceFrac);
          fz = stride * (-0.5 + s);
          lift = Math.sin(s * Math.PI) * 0.012; // barely off the ground: the heels drag
          pitch = 0.05 + Math.sin(s * Math.PI) * 0.12;
        }
        const down = hips.position.y - J.ankle - lift;
        solveLeg(l, fz * w, down, pitch * w);
      });
    }

    // Cloth: rippling with each step, trailing as he walks, stirring in a breeze that comes
    // and goes (and in the wind of the mower's travel).
    cloth.uClothT.value = t;
    cloth.uClothWalk.value = riding ? 0.35 * act.shake : w;
    cloth.uClothGust.value =
      0.35 + 0.3 * Math.sin(t * 0.5) * Math.sin(t * 0.23 + 1) + (riding ? act.speed * 0.25 : 0);
    cloth.uClothPhase.value = riding ? t * 9 : phase;
    shirtUpdate();

    // Arms hang loose, a little out from the baggy shirt, swinging opposite the legs.
    arms.forEach((a, i) => {
      const sw = Math.cos(phase + (i ? Math.PI : 0));
      a.shoulder.rotation.set(sw * 0.2 * w + 0.03, 0, (i ? 1 : -1) * 0.15);
      a.elbow.rotation.x = -(0.18 + 0.12 * Math.max(0, -sw) * w);
      a.wrist.rotation.set(-0.1, 0, 0);
    });

    let smile = 0,
      hatOff = 0;
    group.updateMatrixWorld(true);
    if (act?.kind === 'wave') {
      const T = act.t;
      const right = arms[0]!;
      // The cap is in his hand from the moment he takes it until it's back on his head.
      const inHand = T >= 1.05 && T < 7.0;
      if (inHand && !capInHand.on) takeCap();
      if (!inHand && capInHand.on) putCapBack();
      // Where the bill is (on his head, or where it will go back): chest frame.
      cap.parent!.updateWorldMatrix(true, false);
      restWorld.compose(head.capRest.position, head.capRest.quaternion, rs);
      restWorld.premultiply(headG.matrixWorld);
      gw.copy(TAKE).applyMatrix4(restWorld);
      chest.worldToLocal(gw);
      // The wave: hand high and out to his right, sweeping side to side in a slow arc.
      const sweep =
        Math.sin((T - 2.2) * 2 * Math.PI * 0.9) * ease(2.0, 2.6, T) * (1 - ease(5.4, 5.9, T));
      const waveAt = V(-0.38 + sweep * 0.12, 0.64 - sweep * sweep * 0.04, 0.12 + sweep * 0.02);
      // Wrist target near the bill when reaching for it (the hand adds about 13 cm).
      const toCap = gw.clone().sub(right.shoulder.position).normalize();
      const nearCap = gw.clone().addScaledVector(toCap, -0.1);
      const up = ease(1.1, 2.1, T),
        down = ease(5.8, 6.95, T);
      target.copy(nearCap).lerp(waveAt, up * (1 - down));
      const reachW = ease(0.0, 0.95, T) * (1 - ease(7.1, 8.3, T));
      pole
        .set(-1, 0.05, -0.15)
        .lerp(V(-1, -0.7, -0.5), up * (1 - down))
        .normalize();
      reach(right, target, pole, reachW);
      // Palm toward his face as he takes the cap; out toward whoever he's waving at.
      palmToward(right, 0, fwd, up * (1 - down) * reachW);
      // The cap swings from his grip into his fingers and back onto his head.
      if (capInHand.on) {
        const k = ease(1.05, 1.6, T) * (1 - ease(6.4, 7.0, T));
        rightWrist.updateWorldMatrix(true, false);
        restInWrist.copy(rightWrist.matrixWorld).invert().multiply(restWorld);
        restInWrist.decompose(rp, rq, rs);
        rs.set(1, 1, 1);
        const backOn = ease(6.4, 7.0, T);
        const p0 = fromPose.p.clone().lerp(rp, backOn),
          q0 = fromPose.q.clone().slerp(rq, backOn);
        cap.position.copy(p0).lerp(held.p, k);
        cap.quaternion.copy(q0).slerp(held.q, k);
      }
      // He looks up and over toward whoever he's waving at, with a soft smile.
      const look = ease(1.6, 2.6, T) * (1 - ease(6.0, 7.2, T));
      neckJ.rotation.x -= 0.1 * look;
      neckJ.rotation.y += -0.25 * look;
      smile = ease(1.8, 3.0, T) * (1 - ease(6.6, 8.0, T));
      // His hair springs up a little at the front once the cap is off.
      hatOff = ease(1.2, 1.9, T) * (1 - ease(6.4, 6.95, T));
    } else if (capInHand.on) {
      putCapBack();
    }
    if (riding) {
      // Right hand on the wheel, up at about one o'clock; left hand resting across his lap.
      const right = arms[0]!,
        left = arms[1]!;
      act.wheel.updateWorldMatrix(true, false);
      const ang = 1.15;
      gw.set(Math.cos(ang) * act.wheelR, 0.012, -Math.sin(ang) * act.wheelR);
      act.wheel.localToWorld(gw);
      chest.worldToLocal(gw);
      const sh = right.shoulder.position;
      target.copy(gw).addScaledVector(gw.clone().sub(sh).normalize(), -0.1);
      reach(right, target, V(-1, -0.6, -0.3).normalize(), 1);
      palmToward(right, 0, V(0.3, -0.6, 1).normalize(), 1);
      right.wrist.rotation.x = -0.35;
      // Across his lap: wrist over his right thigh, forearm lying across both legs.
      lapT.set(-0.03, -0.235, 0.27);
      lapT.add(V(0, Math.sin(t * 47) * 0.0015 * act.shake, 0));
      reach(left, lapT, V(1, -0.3, -0.6).normalize(), 1);
      palmToward(left, 1, V(0, -1, 0.2).normalize(), 1);
      left.wrist.rotation.x = 0.15;
      smile = 0.25;
    }
    head.setSmile(smile);
    head.setHatOff(hatOff);
  };
  animate(0, 0);
  return { group, animate, strollSpeed };
}
