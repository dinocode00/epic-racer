import { type PadState, type TrackDef, type VehicleDef, neutralPad } from '@epic/shared';
import { type AiBrain, aiDrive, createBrain } from './ai.ts';
import { type HazardState, collideHazards, createHazards, updateHazards } from './hazards.ts';
import { type KartState, type TrackRules, createKart, spinOut, stepKart } from './kart.ts';
import { Track } from './track.ts';
import { addScaled, cross, dist2, dot, norm, reject, sub } from './vec.ts';

export const STEP = 1 / 60;
export const COUNTDOWN = 3;

export interface Entrant {
  vehicle: VehicleDef;
  /** null = AI driver */
  human: boolean;
}

export type Phase = 'countdown' | 'racing' | 'finished';

export class Race {
  readonly track: Track;
  readonly karts: KartState[];
  readonly brains: (AiBrain | null)[];
  readonly laps: number;
  phase: Phase = 'countdown';
  /** Seconds since the green light (negative during countdown). */
  time = -COUNTDOWN;
  private firstThrottle: number[] = [];
  private padCooldown: number[] = [];
  readonly hazards: HazardState[];
  readonly rules: TrackRules;

  constructor(def: TrackDef, entrants: Entrant[], laps = def.laps) {
    this.track = new Track(def);
    this.laps = laps;
    // Grid: two columns, staggered, behind the start line.
    this.karts = entrants.map((e, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const s = this.track.length - 8 - row * 8 - (col > 0 ? 4 : 0);
      return createKart(i, e.vehicle, this.track, s, col * 3.6);
    });
    this.brains = entrants.map((e, i) =>
      e.human ? null : createBrain(i + 1, 0.55 + (0.45 * ((i * 37) % 10)) / 10),
    );
    this.firstThrottle = entrants.map(() => NaN);
    this.padCooldown = entrants.map(() => 0);
    this.hazards = createHazards(def.hazards ?? []);
    const L = this.track.length;
    const inRanges = (ranges: [number, number][] | undefined) => (s: number) =>
      (ranges ?? []).some(([a, b]) => s >= a && s <= b);
    const kickers = def.kickers ?? [];
    this.rules = {
      isGap: inRanges(def.gaps),
      isOpen: inRanges(def.open),
      kickerBetween: (s0, s1) => {
        let d = s1 - s0;
        if (d < -L / 2) d += L;
        if (d <= 0 || d > 20) return null;
        for (const k of kickers) {
          let rel = k.s - s0;
          if (rel < 0) rel += L;
          if (rel > 0 && rel <= d) return k.pop;
        }
        return null;
      },
      rescueS: (s) => {
        // Never drop a kart just before a gap: back it up for a proper run-up.
        for (const [g0] of def.gaps ?? []) {
          let ahead = g0 - s;
          if (ahead < 0) ahead += L;
          if (ahead < 110) return g0 - 120;
        }
        return s;
      },
    };
  }

  get leaderProgress(): number {
    return Math.max(...this.karts.map((k) => k.progress));
  }

  lapOf(k: KartState): number {
    return Math.min(this.laps, Math.max(1, Math.floor(k.progress / this.track.length) + 1));
  }

  /** Advance one fixed step. `pads[i]` is the input for kart i (ignored for AI). */
  step(pads: (PadState | undefined)[]): void {
    const dt = STEP;
    this.time += dt;
    const frozen = this.phase === 'countdown';
    const lead = this.leaderProgress;
    const leaderLap = Math.max(1, Math.floor(lead / this.track.length) + 1);
    updateHazards(this.hazards, this.time, leaderLap);

    this.karts.forEach((k, i) => {
      const brain = this.brains[i];
      let pad = brain
        ? aiDrive(brain, k, this.track, lead, dt, this.hazards)
        : (pads[i] ?? neutralPad());
      if (k.finished) pad = brain ? pad : { ...neutralPad(), throttle: 0.4 };

      if (frozen) {
        // Start boost: first press of gas in the last second before green = boost.
        if (pad.throttle > 0.5 && Number.isNaN(this.firstThrottle[i]!))
          this.firstThrottle[i] = this.time;
        if (pad.throttle < 0.1) this.firstThrottle[i] = NaN;
      }
      stepKart(k, pad, this.track, dt, frozen, this.rules);
      if (!frozen) collideHazards(k, this.hazards, this.track);
    });

    if (frozen && this.time >= 0) {
      this.phase = 'racing';
      this.karts.forEach((k, i) => {
        const t = this.firstThrottle[i]!;
        if (Number.isNaN(t)) return;
        if (t > -1.0) k.boostTime = 1.0;
        else if (t < -2.0) spinOut(k, 0.6, 1); // revved too early
      });
    }

    if (!frozen) this.slipstream();
    this.collideKarts();
    this.applyBoostPads();
    this.updatePlaces();
  }

  /**
   * Tucking in close behind another kart charges a slipstream: a small tow at once, and a
   * boost when the charge is full.
   */
  private slipstream(): void {
    const FULL = 1.1;
    for (const A of this.karts) {
      if (A.air || A.rescueTime > 0 || A.stunTime > 0 || A.speed < 18) {
        A.draft = Math.max(0, A.draft - STEP * 2);
        continue;
      }
      const right = cross(A.fwd, A.up);
      const behindSomeone = this.karts.some((B) => {
        if (B === A || B.air || B.rescueTime > 0) return false;
        const rel = sub(B.pos, A.pos);
        const ahead = dot(rel, A.fwd);
        return (
          ahead > 2.5 &&
          ahead < 16 &&
          Math.abs(dot(rel, right)) < 1.8 + ahead * 0.06 &&
          dot(A.fwd, B.fwd) > 0.8
        );
      });
      if (behindSomeone) {
        A.draft += STEP;
        if (A.draft >= FULL) {
          A.boostTime = Math.max(A.boostTime, 1.0);
          A.draft = 0;
        }
      } else A.draft = Math.max(0, A.draft - STEP * 2);
    }
  }

  /** A rear-ender knocks the kart in front off balance: it wobbles and slides aside. */
  private rearEnd(
    hitter: KartState,
    victim: KartState,
    n: { x: number; y: number; z: number },
    closing: number,
  ): void {
    if (victim.hitCooldown > 0) return;
    const right = cross(victim.fwd, victim.up);
    let side = Math.sign(dot(n, right));
    if (side === 0) side = victim.id % 2 ? 1 : -1;
    victim.wobbleTime = 0.9;
    victim.slide = side * (6 + closing * 0.5);
    victim.speed = Math.max(0, victim.speed * 0.82);
    victim.drift = { active: false, dir: 0, charge: 0 };
    victim.bump = 1;
    victim.hitCooldown = 0.8;
    hitter.speed -= closing * 0.35;
    hitter.bump = Math.max(hitter.bump, 0.4);
  }

  private collideKarts(): void {
    const R = 1.5;
    for (let a = 0; a < this.karts.length; a++) {
      for (let b = a + 1; b < this.karts.length; b++) {
        const A = this.karts[a]!,
          B = this.karts[b]!;
        if (A.air || B.air || A.rescueTime > 0 || B.rescueTime > 0) continue;
        const d2 = dist2(A.pos, B.pos);
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const n = norm(reject(sub(B.pos, A.pos), A.up));
        const overlap = 2 * R - d;
        const ma = A.params.mass,
          mb = B.params.mass;
        A.pos = addScaled(A.pos, n, (-overlap * mb) / (ma + mb));
        B.pos = addScaled(B.pos, n, (overlap * ma) / (ma + mb));
        // Closing speed along the contact normal. Only resolve when moving together.
        const closing = dot(A.fwd, n) * A.speed - dot(B.fwd, n) * B.speed;
        // Rear-enders: the one in front pays for it.
        const aHitsB = dot(A.fwd, n) > 0.7 && dot(B.fwd, n) > 0.5;
        const bHitsA = dot(B.fwd, n) < -0.7 && dot(A.fwd, n) < -0.5;
        if (closing > 1.5 && (aHitsB || bHitsA)) {
          if (aHitsB) this.rearEnd(A, B, n, closing);
          else this.rearEnd(B, A, { x: -n.x, y: -n.y, z: -n.z }, closing);
          continue;
        }
        if (closing > 0) {
          const j = (closing * 1.2) / (1 / ma + 1 / mb);
          A.speed -= (j * dot(A.fwd, n)) / ma;
          B.speed += (j * dot(B.fwd, n)) / mb;
          A.bump = Math.max(A.bump, Math.min(1, closing / 10));
          B.bump = Math.max(B.bump, Math.min(1, closing / 10));
        }
      }
    }
  }

  private applyBoostPads(): void {
    const pads = this.track.def.boostPads ?? [];
    this.karts.forEach((k, i) => {
      this.padCooldown[i] = Math.max(0, this.padCooldown[i]! - STEP);
      if (this.padCooldown[i]! > 0) return;
      for (const s of pads) {
        const ds = (((k.s - s) % this.track.length) + this.track.length) % this.track.length;
        if (ds < 3 && !k.air) {
          if (Math.abs(k.lat) < 3) {
            k.boostTime = Math.max(k.boostTime, 1.1);
            this.padCooldown[i] = 1;
          }
        }
      }
    });
  }

  private updatePlaces(): void {
    const L = this.track.length * this.laps;
    for (const k of this.karts) {
      if (!k.finished && this.phase === 'racing' && k.progress >= L) {
        k.finished = true;
        k.finishTime = this.time;
      }
    }
    const order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    order.forEach((k, i) => (k.place = i + 1));
    // The race ends when every human has finished (or every kart, in an all-AI race).
    const humans = this.karts.filter((_, i) => this.brains[i] === null);
    const watch = humans.length > 0 ? humans : this.karts;
    if (this.phase === 'racing' && watch.every((k) => k.finished)) this.phase = 'finished';
  }
}
