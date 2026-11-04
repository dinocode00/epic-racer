import { type PadState, neutralPad } from '@epic/shared';
import { type HazardState, sDelta } from './hazards.ts';
import type { KartState } from './kart.ts';
import type { Track } from './track.ts';
import { clamp, cross, dot, sub } from './vec.ts';

export interface AiBrain {
  /** Preferred lane, metres from centre. */
  lane: number;
  /** 0..1, scales top-speed discipline and reaction. */
  skill: number;
  /** Difficulty: 0 easy, 1 normal, 2 hard, 3 expert. */
  level: number;
  laneTimer: number;
  seed: number;
}

export function createBrain(seed: number, skill: number, level = 1): AiBrain {
  return { lane: 0, skill, level, laneTimer: 0, seed: seed * 9301 + 49297 };
}

/** AI difficulty levels, easiest first. */
export const AI_LEVELS = ['Easy', 'Normal', 'Hard', 'Expert'] as const;
/** How close to its top speed an AI dares to drive at each level (before its own skill). */
const PACE = [0.8, 0.92, 0.975, 1.0];
const PACE_SPAN = [0.06, 0.07, 0.04, 0.02];
/** How sharp a bend ahead (radians) has it lift off, and brake. */
const LIFT = [0.75, 0.9, 1.05, 1.2];
const BRAKE = [1.4, 1.6, 1.8, 2.0];
/** An AI kart's engine against a player's at each level (the classic arcade handicap). */
export const AI_POWER = [0.97, 1, 1.03, 1.06];
/** How much harder it pushes when it's behind the leader. */
const CATCH_UP = [0.04, 0.1, 0.12, 0.15];

function rand(b: AiBrain): number {
  b.seed = (b.seed * 16807) % 2147483647;
  return b.seed / 2147483647;
}

/** Simple racing-line follower: aim at a point ahead, drift in long corners. */
export function aiDrive(
  b: AiBrain,
  k: KartState,
  track: Track,
  leaderProgress: number,
  dt: number,
  hazards: HazardState[] = [],
): PadState {
  const pad = neutralPad();
  b.laneTimer -= dt;
  if (b.laneTimer <= 0) {
    const w = track.frameAtS(k.s).width;
    b.lane = (rand(b) - 0.5) * w * 0.5;
    b.laneTimer = 2 + rand(b) * 3;
  }
  const look = 8 + Math.max(0, k.speed) * 0.55;
  // Dodge hazards ahead: pick the side of the road with more room around them.
  let lane = b.lane;
  const halfW = track.frameAtS(k.s + look).width / 2 - 1.5;
  for (const h of hazards) {
    if (!h.present) continue;
    const ahead = sDelta(k.s, h.s, track.length);
    if (ahead < 2 || ahead > look * 1.8) continue;
    const sweep = h.def.move?.axis === 'lat' ? Math.abs(h.def.move.amp) * 0.5 : 0;
    const clear = h.def.r + 2.2 + sweep;
    if (Math.abs(lane - h.lat) < clear) {
      const left = h.lat - clear,
        right = h.lat + clear;
      lane =
        Math.abs(left) < Math.abs(right) && left > -halfW ? left : right < halfW ? right : left;
      lane = Math.max(-halfW, Math.min(halfW, lane));
    }
  }
  const target = track.pointAt(k.s + look, lane, 0);
  const to = sub(target, k.pos);
  const right = cross(k.fwd, k.up);
  const angle = Math.atan2(dot(to, right), dot(to, k.fwd));
  pad.steer = clamp(angle * 2.2, -1, 1);

  // Corner severity further ahead decides drifting and lifting.
  const far = track.frameAtS(k.s + look * 2.2).tan;
  const bend = Math.acos(clamp(dot(far, k.fwd), -1, 1));
  // Better drivers lift later and brake later for the bends.
  const lv = Math.max(0, Math.min(3, Math.round(b.level)));
  pad.throttle = bend > LIFT[lv]! && k.speed > 26 ? 0.5 : 1;
  // Brake for hairpins at speed, as grip fades.
  if (bend > BRAKE[lv]! && k.speed > 22) pad.brake = 0.6;
  pad.drift = bend > 0.55 && k.speed > 18 && Math.abs(angle) > 0.12;

  // Mild rubber band on AI only: never slows humans.
  const gap = leaderProgress - k.progress;
  const discipline = PACE[lv]! + PACE_SPAN[lv]! * b.skill + clamp(gap / 300, -0.05, CATCH_UP[lv]!);
  if (k.speed > k.params.topSpeed * discipline && k.boostTime <= 0) pad.throttle = 0.2;
  return pad;
}
