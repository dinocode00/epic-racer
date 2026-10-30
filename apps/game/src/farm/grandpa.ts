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
 * procedurally: `animate(t, speed)` with speed in m/s (0 stands, ~0.55 is his stroll).
 */

export interface Grandpa {
  group: THREE.Group;
  /** Pose for time t (s) at a walking speed (m/s): 0 stands easy, ~0.85 is his stroll. */
  animate(t: number, speed: number): void;
  strollSpeed: number;
}

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
  const headG = buildHead().group;
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
  // Two-bone leg IK in the walking plane: ankle target (forward z, down y) from the hip.
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
    l.hip.rotation.x = -thigh;
    l.knee.rotation.x = flex;
    l.ankle.rotation.x = thigh - flex - footPitch;
  };

  const strollSpeed = 0.55; // about 1.2 mph: an easy amble
  let phase = 0,
    lastT = 0,
    gait = 0;
  const animate = (t: number, speed: number) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    gait += (Math.min(1, speed / strollSpeed) - gait) * Math.min(1, dt * 3);
    const stride = 0.48; // short, unhurried steps, about 70 a minute
    const cadence = speed / (2 * stride);
    phase += dt * cadence * Math.PI * 2;
    const w = gait;
    const breathe = Math.sin(t * 1.6) * 0.004;

    // A little stooped, a gentle bob and sway, hips and shoulders counter-turning; standing,
    // a slow shift of weight from foot to foot.
    const bob = Math.abs(Math.sin(phase)) * 0.012 * w;
    hips.position.y = J.hip - 0.012 * w - bob + 0.006;
    hips.position.x = Math.sin(phase) * 0.012 * w + (1 - w) * Math.sin(t * 0.31) * 0.006;
    hips.rotation.y = Math.sin(phase) * 0.06 * w;
    hips.rotation.z = (1 - w) * Math.sin(t * 0.31) * 0.01;
    spine.rotation.x = 0.07 + 0.03 * w + breathe;
    spine.rotation.y = -Math.sin(phase) * 0.08 * w;
    chest.rotation.z = Math.sin(phase) * 0.015 * w;
    neckJ.rotation.x = -0.04 - 0.03 * w;
    neckJ.rotation.y = (1 - w) * (Math.sin(t * 0.23) * 0.45 + Math.sin(t * 0.71) * 0.06);
    headG.rotation.x = 0.02 * Math.sin(phase * 2) * w + (1 - w) * Math.sin(t * 0.17) * 0.03;

    // Stance foot planted and sliding back under him; swing foot brought through low with the
    // toe up, so the heel scuffs along the ground.
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

    // Cloth: rippling with each step, trailing as he walks, stirring in a breeze that comes
    // and goes.
    cloth.uClothT.value = t;
    cloth.uClothWalk.value = w;
    cloth.uClothGust.value = 0.35 + 0.3 * Math.sin(t * 0.5) * Math.sin(t * 0.23 + 1);
    cloth.uClothPhase.value = phase;
    shirtUpdate();

    // Arms hang loose, a little out from the baggy shirt, swinging opposite the legs.
    arms.forEach((a, i) => {
      const sw = Math.cos(phase + (i ? Math.PI : 0));
      a.shoulder.rotation.x = sw * 0.2 * w + 0.03;
      a.shoulder.rotation.z = (i ? 1 : -1) * 0.15;
      a.elbow.rotation.x = -(0.18 + 0.12 * Math.max(0, -sw) * w);
      a.wrist.rotation.x = -0.1;
    });
  };
  animate(0, 0);
  return { group, animate, strollSpeed };
}
