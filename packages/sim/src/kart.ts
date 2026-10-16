import type { PadState, VehicleDef } from '@epic/shared';
import type { Track } from './track.ts';
import {
  type Vec3,
  add,
  addScaled,
  approach,
  clamp,
  clone,
  cross,
  dot,
  norm,
  reject,
  rotateAround,
  scale,
} from './vec.ts';

export interface KartParams {
  topSpeed: number;
  accel: number;
  turnRate: number;
  mass: number;
  rideHeight: number;
}

export function paramsFor(v: VehicleDef): KartParams {
  return {
    topSpeed: 30 + (v.speed - 3) * 1.6,
    accel: 15 + (3 - v.weight) * 1.4 + (v.handling - 3) * 0.4,
    turnRate: 1.85 + (v.handling - 3) * 0.17,
    mass: 1 + (v.weight - 3) * 0.3,
    rideHeight: v.hover ? 0.7 : 0,
  };
}

/** Drift charge thresholds in seconds: blue, orange, purple sparks. */
export const DRIFT_LEVELS = [0.7, 1.5, 2.5];
const BOOST_FOR_LEVEL = [0, 0.5, 1.0, 1.6];

export interface KartState {
  id: number;
  vehicle: VehicleDef;
  params: KartParams;
  pos: Vec3;
  fwd: Vec3;
  up: Vec3;
  /** Previous step, for render interpolation. */
  prevPos: Vec3;
  prevFwd: Vec3;
  prevUp: Vec3;
  speed: number;
  /** Sideways velocity in m/s, positive = right. */
  slide: number;
  hint: number;
  s: number;
  /** Unwrapped distance travelled along the track since the start line. */
  progress: number;
  drift: { active: boolean; dir: number; charge: number };
  boostTime: number;
  /** Spin-out timer (hit, bad start). */
  stunTime: number;
  /** Last wall impact strength 0..1, decays; renderer uses it for shake. */
  bump: number;
  finished: boolean;
  finishTime: number;
  place: number;
}

export function createKart(id: number, vehicle: VehicleDef, track: Track, s: number, lateral: number): KartState {
  const f = track.frameAtS(s);
  const params = paramsFor(vehicle);
  const pos = track.pointAt(s, lateral, params.rideHeight);
  const hint = track.nearestIndex(pos);
  return {
    id,
    vehicle,
    params,
    pos,
    fwd: clone(f.tan),
    up: clone(f.up),
    prevPos: clone(pos),
    prevFwd: clone(f.tan),
    prevUp: clone(f.up),
    speed: 0,
    slide: 0,
    hint,
    s,
    progress: s > track.length / 2 ? s - track.length : s,
    drift: { active: false, dir: 0, charge: 0 },
    boostTime: 0,
    stunTime: 0,
    bump: 0,
    finished: false,
    finishTime: 0,
    place: id + 1,
  };
}

export function driftLevel(charge: number): number {
  let l = 0;
  for (const t of DRIFT_LEVELS) if (charge >= t) l++;
  return l;
}

/** Advance one kart by dt seconds. Pure arcade: no rigid body, glued to the road. */
export function stepKart(k: KartState, pad: PadState, track: Track, dt: number, frozen = false): void {
  k.prevPos = clone(k.pos);
  k.prevFwd = clone(k.fwd);
  k.prevUp = clone(k.up);
  const P = k.params;

  const here = track.project(k.pos, k.hint);
  const up = here.frame.up;
  let fwd = norm(reject(k.fwd, up));
  let spd = k.speed;

  const stunned = k.stunTime > 0;
  const steer = stunned || frozen ? 0 : pad.steer;
  const throttle = stunned || frozen ? 0 : pad.throttle;
  const brake = stunned || frozen ? 0 : pad.brake;

  // --- Drift ---
  if (!k.drift.active && pad.drift && !stunned && Math.abs(steer) > 0.3 && spd > 12) {
    k.drift = { active: true, dir: Math.sign(steer), charge: 0 };
  }
  if (k.drift.active && (!pad.drift || spd < 8 || stunned)) {
    const lvl = driftLevel(k.drift.charge);
    if (!stunned && lvl > 0) k.boostTime = Math.max(k.boostTime, BOOST_FOR_LEVEL[lvl]!);
    k.drift = { active: false, dir: 0, charge: 0 };
  }

  // --- Steering ---
  let yawRate: number;
  if (k.drift.active) {
    const d = k.drift.dir;
    yawRate = d * P.turnRate * 1.1 * (0.6 + 0.4 * steer * d);
    k.drift.charge += dt * (0.7 + 0.5 * Math.abs(steer));
  } else {
    const lowSpeed = clamp(Math.abs(spd) / 5, 0, 1);
    const highSpeed = 1 - 0.3 * clamp(Math.abs(spd) / P.topSpeed, 0, 1);
    yawRate = steer * P.turnRate * lowSpeed * highSpeed * Math.sign(spd || 1);
  }
  if (stunned) yawRate = 9; // spin
  fwd = rotateAround(fwd, up, -yawRate * dt);

  // --- Longitudinal ---
  const boosting = k.boostTime > 0;
  const top = P.topSpeed * (boosting ? 1.3 : 1);
  if (throttle > 0 && spd >= -0.5) {
    spd += throttle * P.accel * Math.max(0, 1 - spd / top) * dt * 1.6;
  }
  if (boosting) spd = Math.max(spd, Math.min(top, spd + 30 * dt));
  if (spd > top) spd = approach(spd, top, 12 * dt);
  if (brake > 0) {
    spd = spd > 0.5 ? spd - 34 * brake * dt : Math.max(-9, spd - 12 * brake * dt);
  }
  if (throttle === 0 && brake === 0) spd = approach(spd, 0, 5 * dt);
  if (stunned) spd = approach(spd, 0, 25 * dt);
  // Gravity along slopes, in world space: a little climbing penalty, downhill boost.
  spd -= 7 * fwd.y * dt;

  // --- Lateral slide ---
  const targetSlide = k.drift.active ? -k.drift.dir * spd * 0.17 : 0;
  k.slide = approach(k.slide, targetSlide, 28 * dt);

  // --- Integrate ---
  const right = cross(fwd, up);
  let pos = add(k.pos, add(scale(fwd, spd * dt), scale(right, k.slide * dt)));

  // --- Constrain to the road surface and walls ---
  const p2 = track.project(pos, here.index);
  const half = p2.frame.width / 2 - 1.1;
  let lat = p2.lateral;
  k.bump = Math.max(0, k.bump - dt * 3);
  if (Math.abs(lat) > half) {
    const side = Math.sign(lat);
    lat = side * half;
    const n = scale(p2.frame.right, side);
    const into = dot(fwd, n);
    if (into > 0) {
      fwd = norm(addScaled(fwd, n, -into * 1.15));
      spd *= 1 - 0.55 * into;
      k.bump = Math.max(k.bump, into);
      if (into > 0.5 && k.drift.active) k.drift = { active: false, dir: 0, charge: 0 };
    }
    k.slide = 0;
  }
  pos = addScaled(addScaled(p2.frame.pos, p2.frame.right, lat), p2.frame.up, P.rideHeight);
  fwd = norm(reject(fwd, p2.frame.up));

  // --- Progress (unwrapped across the start line) ---
  let ds = p2.s - k.s;
  if (ds < -track.length / 2) ds += track.length;
  if (ds > track.length / 2) ds -= track.length;
  k.progress += ds;
  k.s = p2.s;
  k.hint = p2.index;

  k.pos = pos;
  k.fwd = fwd;
  k.up = clone(p2.frame.up);
  k.speed = spd;
  k.boostTime = Math.max(0, k.boostTime - dt);
  k.stunTime = Math.max(0, k.stunTime - dt);
}
