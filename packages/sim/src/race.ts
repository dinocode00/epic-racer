import { type PadState, type TrackDef, type VehicleDef, neutralPad } from '@epic/shared';
import { type AiBrain, aiDrive, createBrain } from './ai.ts';
import { type KartState, createKart, stepKart } from './kart.ts';
import { Track } from './track.ts';
import { addScaled, dist2, dot, norm, reject, sub } from './vec.ts';

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

    this.karts.forEach((k, i) => {
      const brain = this.brains[i];
      let pad = brain ? aiDrive(brain, k, this.track, lead, dt) : (pads[i] ?? neutralPad());
      if (k.finished) pad = brain ? pad : { ...neutralPad(), throttle: 0.4 };

      if (frozen) {
        // Start boost: first press of gas in the last second before green = boost.
        if (pad.throttle > 0.5 && Number.isNaN(this.firstThrottle[i]!))
          this.firstThrottle[i] = this.time;
        if (pad.throttle < 0.1) this.firstThrottle[i] = NaN;
      }
      stepKart(k, pad, this.track, dt, frozen);
    });

    if (frozen && this.time >= 0) {
      this.phase = 'racing';
      this.karts.forEach((k, i) => {
        const t = this.firstThrottle[i]!;
        if (Number.isNaN(t)) return;
        if (t > -1.0) k.boostTime = 1.0;
        else if (t < -2.0) k.stunTime = 0.6; // revved too early
      });
    }

    this.collideKarts();
    this.applyBoostPads();
    this.updatePlaces();
  }

  private collideKarts(): void {
    const R = 1.5;
    for (let a = 0; a < this.karts.length; a++) {
      for (let b = a + 1; b < this.karts.length; b++) {
        const A = this.karts[a]!,
          B = this.karts[b]!;
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
        if (ds < 3) {
          const lat = this.track.project(k.pos, k.hint).lateral;
          if (Math.abs(lat) < 3) {
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
