import * as THREE from 'three';
import {
  type ClothUniforms,
  type Rider,
  J,
  arm,
  clothCopy,
  clothUniforms,
  clothes,
  jeansTop,
  leg,
  neck,
  rideShirt,
  ridersOf,
  shirt,
} from './grandpa/body.ts';
import { type Head, buildHead } from './grandpa/head.ts';
import { lowOf } from './grandpa/kit.ts';

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
  /** Another of him, sharing this one's geometry and textures (cheap to make). */
  clone(): Grandpa;
  /**
   * How much of him to draw: 0 everything (close up), 1 a coarser head and hair and no tiny
   * details (a few metres off), 2 only what reads from across the yard.
   */
  setDetail(level: 0 | 1 | 2): void;
}

/** The joints and parts his rig moves. */
interface Parts {
  group: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neckJ: THREE.Group;
  head: Head;
  arms: { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group }[];
  legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }[];
  riders: Rider[];
  cloth: ClothUniforms;
}

/** Build him from scratch. */
function buildParts(): Parts {
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
  const chest = new THREE.Group();
  chest.position.y = J.chest - J.hip;
  spine.add(chest);
  chest.add(neck(m));
  const neckJ = new THREE.Group();
  neckJ.position.set(0, J.neck - J.chest, 0.01);
  chest.add(neckJ);
  const head = buildHead();
  head.group.position.set(0, 0.118, 0.016);
  neckJ.add(head.group);
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
  return {
    group,
    hips,
    spine,
    chest,
    neckJ,
    head,
    arms,
    legs,
    riders: ridersOf(shirtG),
    cloth: m.cloth,
  };
}

/**
 * Copy him: the same objects, geometry and textures; his own joints, his own cloth (each
 * man's clothes move with his own walk), and the copy's buttons riding the copy's shirt.
 */
function copyParts(p: Parts): Parts {
  const group = p.group.clone(true);
  const a: THREE.Object3D[] = [],
    b: THREE.Object3D[] = [];
  p.group.traverse((o) => a.push(o));
  group.traverse((o) => b.push(o));
  const map = new Map(a.map((o, i) => [o, b[i]!]));
  const mp = <T extends THREE.Object3D>(o: T) => map.get(o) as T;
  const cloth = clothUniforms();
  const mats = new Map<THREE.Material, THREE.Material>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material.userData.cloth) return;
    const orig = mesh.material;
    if (!mats.has(orig)) mats.set(orig, clothCopy(orig, cloth));
    mesh.material = mats.get(orig)!;
  });
  return {
    group,
    hips: mp(p.hips),
    spine: mp(p.spine),
    chest: mp(p.chest),
    neckJ: mp(p.neckJ),
    head: p.head.rebind(mp),
    arms: p.arms.map((x) => ({ shoulder: mp(x.shoulder), elbow: mp(x.elbow), wrist: mp(x.wrist) })),
    legs: p.legs.map((x) => ({ hip: mp(x.hip), knee: mp(x.knee), ankle: mp(x.ankle) })),
    riders: p.riders.map((r) => ({ o: mp(r.o), rest: r.rest })),
    cloth,
  };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildGrandpa(): Grandpa {
  return rig(buildParts());
}

function rig(parts: Parts, rest?: Parts): Grandpa {
  const { group, hips, spine, chest, neckJ, head, arms, legs, cloth } = parts;
  const headG = head.group;
  const shirtUpdate = rideShirt(parts.riders, cloth);

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
  /** Where he takes hold of it to lift it off: the top of the crown, toward the front. */
  const TAKE = V(0, 0.15, 0.03);
  const rightWrist = arms[0]!.wrist;
  const restWorld = new THREE.Matrix4(),
    capWorld = new THREE.Matrix4(),
    rs = V(1, 1, 1),
    p1 = V(0, 0, 0),
    q1 = new THREE.Quaternion(),
    p2 = V(0, 0, 0),
    q2 = new THREE.Quaternion();
  /** He closes his hand on it: from now on it moves rigidly with the hand, held exactly
   * where he took hold of it. */
  const takeCap = () => {
    rightWrist.attach(cap);
    capInHand.on = true;
  };
  const putCapBack = () => {
    headG.attach(cap);
    cap.position.copy(head.capRest.position);
    cap.quaternion.copy(head.capRest.quaternion);
    capInHand.on = false;
  };

  let heldBack: { p: THREE.Vector3; q: THREE.Quaternion } | null = null;
  // Steering: where on the rim his hand holds (wheel frame), and a regrip in progress.
  let grip: number | null = null,
    regrip: { from: number; to: number; k: number } | null = null;
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
    if (heldBack) {
      cap.position.copy(heldBack.p);
      cap.quaternion.copy(heldBack.q);
      heldBack = null;
    }
    group.updateMatrixWorld(true);
    if (act?.kind === 'wave') {
      const T = act.t;
      const right = arms[0]!;
      // The cap is in his hand from the moment he takes it until it's back on his head.
      const inHand = T >= 1.05 && T < 7.0;
      // Back on his head once his hand has brought it home.
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
      // He closes his hand on it where his hand now is (after this frame's reach).
      if (inHand && !capInHand.on) {
        right.shoulder.updateWorldMatrix(true, true);
        takeCap();
      }
      // Setting it back on: his hand returns to the same place it took it from, so the cap
      // is already almost on his head; the last few centimetres it settles into place.
      if (capInHand.on) {
        const settle = ease(6.55, 7.0, T);
        if (settle > 0) {
          rightWrist.updateWorldMatrix(true, false);
          capWorld.compose(cap.position, cap.quaternion, rs).premultiply(rightWrist.matrixWorld);
          capWorld.decompose(p1, q1, rs);
          restWorld.decompose(p2, q2, rs);
          rs.set(1, 1, 1);
          p1.lerp(p2, settle);
          q1.slerp(q2, settle);
          capWorld.compose(p1, q1, rs).premultiply(rightWrist.matrixWorld.clone().invert());
          // Only for this frame: keep the grip itself unchanged.
          const keepP = cap.position.clone(),
            keepQ = cap.quaternion.clone();
          capWorld.decompose(cap.position, cap.quaternion, rs);
          rs.set(1, 1, 1);
          heldBack = { p: keepP, q: keepQ };
        }
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
      // He holds a point on the rim and turns the wheel with it. Once the wheel has carried
      // his hand too far round (past about 3 o'clock or 10 o'clock), he lets go, brings the
      // hand back over the top and takes a fresh hold, as you do steering one-handed.
      const psi = act.wheel.rotation.y; // the wheel's turn (radians, + = anticlockwise)
      if (grip === null) grip = 1.15 - psi;
      let handAng = grip + psi,
        liftOff = 0;
      if (regrip) {
        regrip.k = Math.min(1, regrip.k + dt / 0.42);
        const k = regrip.k * regrip.k * (3 - 2 * regrip.k);
        handAng = regrip.from + (regrip.to - regrip.from) * k;
        liftOff = Math.sin(Math.PI * regrip.k) * 0.06;
        if (regrip.k >= 1) {
          grip = regrip.to - psi;
          regrip = null;
        }
      } else if (handAng < 0.05 || handAng > 2.45) {
        regrip = { from: handAng, to: handAng < 0.05 ? 1.85 : 0.5, k: 0 };
      }
      act.wheel.parent!.updateWorldMatrix(true, false);
      const W = act.wheel.position;
      const col = act.wheel.parent!;
      // The rim point he holds, the wheel's face normal (toward him) and the centre, all in his
      // chest frame.
      gw.set(W.x + Math.cos(handAng) * act.wheelR, W.y, W.z - Math.sin(handAng) * act.wheelR);
      col.localToWorld(gw);
      chest.worldToLocal(gw);
      const nrm = col.localToWorld(V(W.x, W.y + 1, W.z)),
        ctr = col.localToWorld(V(W.x, W.y, W.z));
      chest.worldToLocal(nrm);
      chest.worldToLocal(ctr);
      nrm.sub(ctr).normalize();
      // Palm resting on the rim with the fingers curled over it: the wrist sits back from the
      // rim toward him and a little above the wheel's face.
      const sh = right.shoulder.position;
      const along = gw.clone().sub(sh).normalize();
      target
        .copy(gw)
        .addScaledVector(nrm, 0.045 + liftOff)
        .addScaledVector(along, -0.05);
      reach(right, target, V(-1, -0.6, -0.3).normalize(), 1);
      palmToward(right, 0, nrm.clone().negate(), 1);
      // The hand bends down at the wrist so the fingers wrap over and round the rim (opening a
      // little as he lets go to regrip).
      right.wrist.rotation.x = 0.75 - liftOff * 8;
      // Leaning a touch into the turn and looking where he's going.
      const turn = THREE.MathUtils.clamp(-psi / 2.4, -1, 1);
      spine.rotation.z += turn * 0.05;
      neckJ.rotation.y += -turn * 0.35;
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
  // Copies are taken from his rest pose (cap on his head).
  const atRest = rest ?? copyParts(parts);

  // Level of detail: each mesh's size, its detailed and coarse geometry, and its own shadow.
  const lods: {
    mesh: THREE.Mesh;
    r: number;
    hi: THREE.BufferGeometry;
    lo?: THREE.BufferGeometry;
    shadow: boolean;
  }[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    lods.push({ mesh, r: g.boundingSphere!.radius, hi: g, lo: lowOf(g), shadow: mesh.castShadow });
  });
  let detail = 0;
  const setDetail = (level: 0 | 1 | 2) => {
    if (level === detail) return;
    detail = level;
    for (const l of lods) {
      l.mesh.geometry = level > 0 && l.lo ? l.lo : l.hi;
      l.mesh.visible = level === 0 || l.r >= (level === 1 ? 0.012 : 0.03);
      l.mesh.castShadow = l.shadow && (level === 0 || l.r >= (level === 1 ? 0.03 : 0.1));
    }
  };
  return { group, animate, strollSpeed, clone: () => rig(copyParts(atRest), atRest), setDetail };
}
