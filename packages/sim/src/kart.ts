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
  v3,
} from './vec.ts';

export type ItemKind =
  'boost' | 'boost3' | 'shot' | 'homing' | 'trap' | 'shield' | 'whip' | 'special' | 'eagle';
export type SpecialKind = 'morgul' | 'flame' | 'missile' | 'jacks';

/** Each vehicle's special ability. */
export const SPECIAL_OF: Record<string, SpecialKind> = {
  nazgul: 'morgul',
  pod: 'flame',
  bat: 'missile',
  mach5: 'jacks',
};
/** Top-speed multiplier while a special runs (the jacks ride on a normal boost). */
const SPECIAL_SPEED: Record<SpecialKind, number> = {
  morgul: 1.28,
  flame: 1.42,
  missile: 1.35,
  jacks: 1.3,
};

export interface KartParams {
  topSpeed: number;
  accel: number;
  turnRate: number;
  mass: number;
  rideHeight: number;
}

export function paramsFor(v: VehicleDef): KartParams {
  return {
    topSpeed: 38 + (v.speed - 3) * 2,
    accel: 19 + (3 - v.weight) * 1.6 + (v.handling - 3) * 0.5,
    turnRate: 1.9 + (v.handling - 3) * 0.17,
    mass: 1 + (v.weight - 3) * 0.3,
    rideHeight: v.hover ? 0.7 : 0,
  };
}

/** Drift charge thresholds in seconds: blue, orange, purple sparks. */
export const DRIFT_LEVELS = [0.7, 1.5, 2.5];
const BOOST_FOR_LEVEL = [0, 0.5, 1.0, 1.6];
/** Gravity in the air. Heavier than real life so jumps feel snappy. */
export const GRAVITY = 21;
/** How long the Great Eagle rescue takes after a fall. */
export const RESCUE_TIME = 1.8;

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
  /** Lateral offset from the centre line. */
  lat: number;
  /** Unwrapped distance travelled along the track since the start line. */
  progress: number;
  drift: { active: boolean; dir: number; charge: number };
  boostTime: number;
  /** Spin-out timer (hit, bad start): no control, losing speed; heading is kept. */
  stunTime: number;
  /** Length of the current spin-out, so the renderer can spin the body whole turns. */
  stunTotal: number;
  /** Knocked off balance by a hit from behind: weak steering, sliding sideways. */
  wobbleTime: number;
  /** Seconds spent tucked in behind another kart; a full charge fires a boost. */
  draft: number;
  /** Held item (one slot), how many uses it has left, and the roulette in progress. */
  item: ItemKind | null;
  itemCount: number;
  rollTime: number;
  rollItem: ItemKind | null;
  /** Holding ITEM with a shot or trap: it trails behind as a shield. */
  trailing: boolean;
  /** Mithril shield: blocks the next item hit. */
  shieldTime: number;
  /** Can't be hit by items again for a moment after a hit. */
  immuneTime: number;
  /** The vehicle's special ability while it runs. */
  special: { kind: SpecialKind; time: number; side: number } | null;
  /** Carried forward by a Great Eagle (the track item). */
  eagleTime: number;
  /** An attack is closing in (for the HUD warning). */
  threat: 'homing' | 'whip' | null;
  /** Slowed by mud, a searchlight... */
  slowTime: number;
  /** Last impact strength 0..1, decays; renderer uses it for shake and sparks. */
  bump: number;
  /** Airborne state: world velocity is used instead of speed/fwd. */
  air: boolean;
  vel: Vec3;
  airTime: number;
  /** Arc length where the kart left the ground. */
  launchS: number;
  /** > 0 while the eagle carries the kart back to the road. */
  rescueTime: number;
  /** Last place the kart was safely on the road, for rescues. */
  safeS: number;
  hitCooldown: number;
  finished: boolean;
  finishTime: number;
  place: number;
}

/** What the track says about a given arc length. */
export interface TrackRules {
  isGap(s: number): boolean;
  isOpen(s: number): boolean;
  /** Kicker ramps crossed between two arc lengths (handles wrap). */
  kickerBetween(s0: number, s1: number): number | null;
  /** Where to set a rescued kart down so it has a run-up before any gap. */
  rescueS(s: number): number;
}

export const NO_RULES: TrackRules = {
  isGap: () => false,
  isOpen: () => false,
  kickerBetween: () => null,
  rescueS: (s) => s,
};

export function createKart(
  id: number,
  vehicle: VehicleDef,
  track: Track,
  s: number,
  lateral: number,
): KartState {
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
    lat: lateral,
    progress: s > track.length / 2 ? s - track.length : s,
    drift: { active: false, dir: 0, charge: 0 },
    boostTime: 0,
    stunTime: 0,
    stunTotal: 0,
    wobbleTime: 0,
    draft: 0,
    item: null,
    itemCount: 0,
    rollTime: 0,
    rollItem: null,
    trailing: false,
    shieldTime: 0,
    immuneTime: 0,
    special: null,
    eagleTime: 0,
    threat: null,
    slowTime: 0,
    bump: 0,
    air: false,
    vel: v3(),
    airTime: 0,
    launchS: s,
    rescueTime: 0,
    safeS: s,
    hitCooldown: 0,
    finished: false,
    finishTime: 0,
    place: id + 1,
  };
}

/**
 * Spin the kart out: it loses speed and control for `seconds`, but keeps facing the way it
 * was going (the body spins whole turns on screen and comes back round).
 */
export function spinOut(k: KartState, seconds: number, keepSpeed: number): void {
  k.stunTime = seconds;
  k.stunTotal = seconds;
  k.speed *= keepSpeed;
  k.drift = { active: false, dir: 0, charge: 0 };
}

export function driftLevel(charge: number): number {
  let l = 0;
  for (const t of DRIFT_LEVELS) if (charge >= t) l++;
  return l;
}

/** Launch a kart into the air with its current motion plus `pop` m/s upward. */
export function launch(k: KartState, pop: number): void {
  const right = cross(k.fwd, k.up);
  k.vel = add(add(scale(k.fwd, k.speed), scale(right, k.slide)), scale(k.up, pop));
  k.air = true;
  k.airTime = 0;
  k.launchS = k.s;
  k.drift = { active: false, dir: 0, charge: 0 };
}

function updateProgress(k: KartState, track: Track, s: number): void {
  let ds = s - k.s;
  if (ds < -track.length / 2) ds += track.length;
  if (ds > track.length / 2) ds -= track.length;
  k.progress += ds;
  k.s = s;
}

/** Put a fallen kart back on the road a little behind where it was last safe. */
export function rescue(k: KartState, track: Track, rules: TrackRules = NO_RULES): void {
  const s = ((rules.rescueS(k.safeS - 12) % track.length) + track.length) % track.length;
  const f = track.frameAtS(s);
  k.pos = track.pointAt(s, 0, k.params.rideHeight);
  k.prevPos = clone(k.pos);
  k.fwd = clone(f.tan);
  k.up = clone(f.up);
  k.hint = track.nearestIndex(k.pos);
  updateProgress(k, track, s);
  k.lat = 0;
  k.speed = 20; // the eagle sets you down rolling
  k.slide = 0;
  k.air = false;
  k.vel = v3();
  k.rescueTime = RESCUE_TIME;
  k.stunTime = 0;
  k.wobbleTime = 0;
  k.boostTime = 0;
}

/** Advance one kart by dt seconds. Arcade physics: glued to the road unless airborne. */
export function stepKart(
  k: KartState,
  pad: PadState,
  track: Track,
  dt: number,
  frozen = false,
  rules: TrackRules = NO_RULES,
): void {
  k.prevPos = clone(k.pos);
  k.prevFwd = clone(k.fwd);
  k.prevUp = clone(k.up);
  k.bump = Math.max(0, k.bump - dt * 3);
  k.hitCooldown = Math.max(0, k.hitCooldown - dt);
  k.slowTime = Math.max(0, k.slowTime - dt);

  if (k.rescueTime > 0) {
    k.rescueTime = Math.max(0, k.rescueTime - dt);
    return;
  }
  if (k.eagleTime > 0) return stepEagle(k, track, dt, rules);
  if (k.air) return stepAir(k, pad, track, dt, rules);

  const P = k.params;
  const here = track.project(k.pos, k.hint);
  const up = here.frame.up;
  let fwd = norm(reject(k.fwd, up));
  let spd = k.speed;

  const stunned = k.stunTime > 0;
  const wobbling = k.wobbleTime > 0;
  const steer = stunned || frozen ? 0 : pad.steer * (wobbling ? 0.35 : 1);
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
    // Grip fades with speed: at full tilt the tightest corners need a lift or a drift. Cranking
    // the wheel over claws some of it back, so the turn sharpens the further you steer.
    const highSpeed =
      1 - 0.42 * clamp(Math.abs(spd) / P.topSpeed, 0, 1) * (1 - 0.4 * steer * steer);
    yawRate = steer * P.turnRate * lowSpeed * highSpeed * Math.sign(spd || 1);
  }
  if (stunned) yawRate = 0; // spinning on screen only: the kart keeps its heading
  fwd = rotateAround(fwd, up, -yawRate * dt);

  // --- Longitudinal ---
  const specialMul = k.special ? SPECIAL_SPEED[k.special.kind] : 0;
  const boosting = k.boostTime > 0 || specialMul > 0;
  const drafting = k.draft > 0.15 ? 1.06 : 1; // a slipstream tow even before it charges
  const top =
    P.topSpeed * (specialMul || (boosting ? 1.3 : drafting)) * (k.slowTime > 0 ? 0.55 : 1);
  if (throttle > 0 && spd >= -0.5) {
    spd += throttle * P.accel * Math.max(0, 1 - spd / top) * dt * 1.6;
  }
  if (boosting) spd = Math.max(spd, Math.min(top, spd + 30 * dt));
  if (spd > top) spd = approach(spd, top, (k.slowTime > 0 ? 30 : 12) * dt);
  if (brake > 0) {
    spd = spd > 0.5 ? spd - 34 * brake * dt : Math.max(-9, spd - 12 * brake * dt);
  }
  if (throttle === 0 && brake === 0) spd = approach(spd, 0, 5 * dt);
  if (stunned) spd = approach(spd, 0, 9 * dt);
  // Gravity along slopes, in world space: a little climbing penalty, downhill boost.
  spd -= 7 * fwd.y * dt;

  // --- Lateral slide ---
  const targetSlide = k.drift.active ? -k.drift.dir * spd * 0.17 : 0;
  // A shove from behind leaves you sliding sideways for a moment.
  k.slide = approach(k.slide, targetSlide, (wobbling ? 7 : 28) * dt);

  // --- Integrate ---
  const right = cross(fwd, up);
  let pos = add(k.pos, add(scale(fwd, spd * dt), scale(right, k.slide * dt)));

  // --- Constrain to the road surface and walls ---
  const p2 = track.project(pos, here.index);
  const half = p2.frame.width / 2 - 1.1;
  let lat = p2.lateral;
  const open = rules.isOpen(p2.s);
  const gap = rules.isGap(p2.s);
  if (Math.abs(lat) > half && !open && !gap) {
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

  k.speed = spd;
  k.boostTime = Math.max(0, k.boostTime - dt);
  k.stunTime = Math.max(0, k.stunTime - dt);
  k.wobbleTime = Math.max(0, k.wobbleTime - dt);
  k.fwd = norm(reject(fwd, p2.frame.up));
  k.up = clone(p2.frame.up);
  k.hint = p2.index;
  const s0 = k.s;

  // Off the edge or into a gap: now we're flying (or falling).
  if (gap || (open && Math.abs(lat) > p2.frame.width / 2 + 0.3)) {
    k.pos = pos;
    updateProgress(k, track, p2.s);
    k.lat = lat;
    launch(k, 0);
    return;
  }

  pos = addScaled(addScaled(p2.frame.pos, p2.frame.right, lat), p2.frame.up, P.rideHeight);
  k.pos = pos;
  k.lat = lat;
  updateProgress(k, track, p2.s);
  if (Math.abs(lat) < half - 1.5) k.safeS = p2.s;

  // Kicker ramps throw you into the air.
  const pop = rules.kickerBetween(s0, p2.s);
  if (pop !== null && spd > 8) launch(k, pop);
}

/** The Great Eagle carries the kart forward high over the road, then sets it down. */
const EAGLE_SPEED = 70;
const EAGLE_HEIGHT = 7;
function stepEagle(k: KartState, track: Track, dt: number, rules: TrackRules): void {
  k.eagleTime = Math.max(0, k.eagleTime - dt);
  // Never set down over a gap: keep flying until there's road underneath.
  if (k.eagleTime === 0 && rules.isGap((k.s + 8) % track.length)) k.eagleTime = 0.1;
  const s = (k.s + EAGLE_SPEED * dt) % track.length;
  const f = track.frameAtS(s);
  const lat = k.lat * Math.exp(-dt * 2);
  const lift = k.eagleTime > 0 ? Math.min(1, k.eagleTime * 2, (2.6 - k.eagleTime) * 3 + 0.3) : 0;
  k.pos = track.pointAt(s, lat, k.params.rideHeight + EAGLE_HEIGHT * lift);
  k.fwd = clone(f.tan);
  k.up = clone(f.up);
  k.hint = track.nearestIndex(k.pos);
  updateProgress(k, track, s);
  k.lat = lat;
  k.air = false;
  k.vel = v3();
  k.slide = 0;
  k.stunTime = 0;
  k.wobbleTime = 0;
  k.boostTime = Math.max(0, k.boostTime - dt);
  if (k.eagleTime === 0) {
    k.speed = Math.max(k.speed, 36);
    k.boostTime = Math.max(k.boostTime, 0.6);
    k.safeS = s;
  }
}

function stepAir(k: KartState, pad: PadState, track: Track, dt: number, rules: TrackRules): void {
  k.airTime += dt;
  // Air control: a little yaw around world up.
  const worldUp = v3(0, 1, 0);
  const yaw = -pad.steer * 0.9 * dt;
  k.vel = rotateAround(k.vel, worldUp, yaw);
  k.vel.y -= GRAVITY * dt;
  const pos = add(k.pos, scale(k.vel, dt));
  const p = track.project(pos, k.hint, 40);
  k.hint = p.index;
  updateProgress(k, track, p.s);
  k.lat = p.lateral;
  // Face where we're going (horizontally), tilt toward the road's up as we come down.
  const horiz = reject(k.vel, k.up);
  if (dot(horiz, horiz) > 1) k.fwd = norm(horiz);
  k.up = norm(add(scale(k.up, 0.9), scale(p.frame.up, 0.1)));
  k.boostTime = Math.max(0, k.boostTime - dt);
  k.stunTime = Math.max(0, k.stunTime - dt);

  const half = p.frame.width / 2 - 1.1;
  const open = rules.isOpen(p.s);
  const gap = rules.isGap(p.s);
  let lat = p.lateral;
  // Invisible walls keep jumps on course, except where the edges are open.
  if (!open && Math.abs(lat) > half) {
    lat = Math.sign(lat) * half;
    const n = scale(p.frame.right, Math.sign(lat));
    k.vel = addScaled(k.vel, n, -Math.max(0, dot(k.vel, n)));
  }
  const height = p.height;
  const falling = dot(k.vel, p.frame.up) <= 0;
  // Never touch down behind the take-off point: a kart dribbling off a lip would otherwise
  // drop back onto the ramp and get stuck there.
  let back = p.s - k.launchS;
  if (back > track.length / 2) back -= track.length;
  if (back < -track.length / 2) back += track.length;
  const overRoad = !gap && Math.abs(lat) <= p.frame.width / 2 && back > -1;

  if (overRoad && falling && height <= k.params.rideHeight) {
    // Touch down.
    const along = dot(k.vel, p.frame.tan);
    const impact = -dot(k.vel, p.frame.up);
    k.air = false;
    k.speed = Math.max(0, along) * 0.96;
    k.fwd = norm(reject(along >= 0 ? k.vel : p.frame.tan, p.frame.up));
    k.up = clone(p.frame.up);
    k.pos = addScaled(addScaled(p.frame.pos, p.frame.right, lat), p.frame.up, k.params.rideHeight);
    k.lat = lat;
    k.bump = Math.max(k.bump, clamp(impact / 25, 0, 1));
    k.vel = v3();
    return;
  }
  // Apply any invisible-wall correction sideways.
  k.pos = lat !== p.lateral ? addScaled(pos, p.frame.right, lat - p.lateral) : pos;
  // Fell into the abyss: the Great Eagles bring you back.
  if (height < -14 || k.airTime > 7) rescue(k, track, rules);
}
