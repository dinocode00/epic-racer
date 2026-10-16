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
  laneTimer: number;
  seed: number;
}

export function createBrain(seed: number, skill: number): AiBrain {
  return { lane: 0, skill, laneTimer: 0, seed: seed * 9301 + 49297 };
}

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
  pad.steer = clamp(angle * 2.4, -1, 1);

  // Corner severity further ahead decides drifting and lifting.
  const far = track.frameAtS(k.s + look * 2.2).tan;
  const bend = Math.acos(clamp(dot(far, k.fwd), -1, 1));
  pad.throttle = bend > 0.9 && k.speed > 24 ? 0.6 : 1;
  pad.drift = bend > 0.55 && k.speed > 18 && Math.abs(angle) > 0.12;

  // Mild rubber band on AI only: never slows humans.
  const gap = leaderProgress - k.progress;
  const discipline = 0.86 + 0.1 * b.skill + clamp(gap / 400, -0.06, 0.08);
  if (k.speed > k.params.topSpeed * discipline && k.boostTime <= 0) pad.throttle = 0.2;
  return pad;
}
