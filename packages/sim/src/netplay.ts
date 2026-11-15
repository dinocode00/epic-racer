import { type PadState, neutralPad } from '@epic/shared';
import type { ItemEvent } from './items.ts';
import type { Race, RaceSnap } from './race.ts';

/**
 * 8-Player Local: one race run on several laptops at once, with no input delay on any of them.
 *
 * Every laptop runs the whole race itself. Only the players' inputs travel between laptops:
 * each step, every laptop applies its own players' inputs at once and sends them on. For the
 * other laptop's players it doesn't wait: it assumes they're still doing what they were last
 * seen doing. When their real input for a step arrives and differs from that guess, it puts the
 * race back to that step (from a copy saved every step) and runs the steps since again with the
 * real input, all within one frame. Your own kart therefore answers at once, and the other
 * laptop's karts are at most a few hundredths of a second out before they're put right.
 *
 * Players are numbered 0..n-1 across all laptops ("human index"); `kartOf[h]` is the kart each
 * one drives. A step is "confirmed" when every player's real input for it is known: from then on
 * it can never change, and every laptop agrees on it.
 */
export interface NetplayOptions {
  /** How far (steps) the race may run ahead of the confirmed step before it waits. */
  maxPredict?: number;
  /** How many steps of copies and inputs to keep. */
  history?: number;
}

/** Autopilot skill for a player whose laptop dropped out of the race. */
export const DROPPED_SKILL = 0.8;

export class Netplay {
  /** The next step to run (= steps run so far). */
  frame = 0;
  readonly maxPredict: number;
  private readonly H: number;
  private readonly n: number;
  /** Input ring: inputs[f % H][h]. */
  private inputs: PadState[][];
  /** Last step whose input is known, per player (inputs arrive in order). */
  private known: number[];
  /** A player's laptop left the race: from the step after this, the autopilot drives. */
  private endedAfter: number[];
  /** The inputs each step was actually run with, to spot wrong guesses. */
  private used: PadState[][];
  /** The race as it was just before each step. */
  private snaps: (RaceSnap | null)[];
  private snapFrame: number[];
  /** Item events each step produced, so a replay only shows the new ones. */
  private eventKeys: (Set<string> | null)[];
  private rollbackFrom = Infinity;
  /** Diagnostics. */
  stats = { rollbacks: 0, replayed: 0, deepest: 0, stalls: 0, repairs: 0 };
  /**
   * After the race is put right: how far each kart moved (old place minus new, per kart), so
   * the screen can ease it over rather than jump.
   */
  onCorrect?: (moved: [number, number, number][]) => void;

  constructor(
    readonly race: Race,
    /** Kart driven by each player. */
    readonly kartOf: number[],
    /** Which players are on this laptop. */
    readonly local: boolean[],
    opts: NetplayOptions = {},
  ) {
    this.maxPredict = opts.maxPredict ?? 30;
    this.H = Math.max(opts.history ?? 128, this.maxPredict * 2 + 8);
    this.n = kartOf.length;
    const blank = () => Array.from({ length: this.n }, () => neutralPad());
    this.inputs = Array.from({ length: this.H }, blank);
    this.used = Array.from({ length: this.H }, blank);
    this.snaps = Array.from({ length: this.H }, () => null);
    this.snapFrame = Array.from({ length: this.H }, () => -1);
    this.eventKeys = Array.from({ length: this.H }, () => null);
    this.known = kartOf.map(() => -1);
    this.endedAfter = kartOf.map(() => Infinity);
  }

  /** This laptop's player `h` input for the step about to run. */
  setLocal(h: number, pad: PadState): void {
    this.inputs[this.frame % this.H]![h] = { ...pad };
    this.known[h] = this.frame;
  }

  /** Another laptop's player `h` input for step `frame`. Inputs arrive in step order. */
  receive(h: number, frame: number, pad: PadState): void {
    if (frame <= this.known[h]! || frame > this.endedAfter[h]!) return;
    // (Should never skip, but if it did, the missing steps are taken as this same input.)
    for (let f = this.known[h]! + 1; f <= frame; f++) {
      if (f < this.frame - this.H + 1) continue;
      this.inputs[f % this.H]![h] = { ...pad };
      if (f < this.frame && !samePad(this.used[f % this.H]![h]!, pad))
        this.rollbackFrom = Math.min(this.rollbackFrom, f);
    }
    this.known[h] = frame;
  }

  /**
   * Player `h`'s laptop left the race after sending its input for step `after`: the
   * autopilot takes their kart over from the step after (every laptop gets the same inputs
   * before the news, so they all agree on the step).
   */
  endInput(h: number, after: number): void {
    if (this.endedAfter[h]! <= after) return;
    this.endedAfter[h] = after;
    if (after + 1 < this.frame) this.rollbackFrom = Math.min(this.rollbackFrom, after + 1);
  }

  /** The last step every player's real input is known for (-1 before any). */
  get confirmed(): number {
    let c = this.frame - 1;
    for (let h = 0; h < this.n; h++) {
      if (this.local[h] || this.endedAfter[h]! < Infinity) continue;
      c = Math.min(c, this.known[h]!);
    }
    return c;
  }

  /** Steps run on guesses that aren't confirmed yet. */
  get ahead(): number {
    return this.frame - 1 - this.confirmed;
  }

  /** False while the race is as far ahead of what's confirmed as it's allowed to get. */
  canAdvance(): boolean {
    return this.ahead < this.maxPredict;
  }

  /** The input player `h` was driven with in the latest step (for the steering wheel). */
  lastUsed(h: number): PadState | undefined {
    return this.frame > 0 ? this.used[(this.frame - 1) % this.H]![h] : undefined;
  }

  /** Last step whose input from player `h` has arrived. */
  lastFrom(h: number): number {
    return this.known[h]!;
  }

  /** Run the next step (first putting right any steps run on a wrong guess). */
  advance(): void {
    if (this.rollbackFrom < this.frame) this.rewind(this.rollbackFrom);
    this.rollbackFrom = Infinity;
    this.run(this.frame, false);
    this.frame++;
  }

  /** Put right anything run on a wrong guess now, without running a new step. */
  catchUp(): void {
    if (this.rollbackFrom < this.frame) this.rewind(this.rollbackFrom);
    this.rollbackFrom = Infinity;
  }

  /** The race as it was just before step `f` (null if that's too long ago). */
  stateAt(f: number): RaceSnap | null {
    if (f === this.frame) {
      this.catchUp();
      return this.race.save();
    }
    if (f > this.frame || this.snapFrame[f % this.H] !== f) return null;
    if (this.rollbackFrom <= f) this.catchUp();
    return this.snaps[f % this.H]!;
  }

  /**
   * Repair: replace the race as it was before step `f` with a copy from the laptop that runs
   * the lobby, and run on from there. Everything before `f` is then moot.
   */
  repair(f: number, s: RaceSnap): boolean {
    if (f > this.frame || f < this.frame - this.H + 1) return false;
    this.stats.repairs++;
    if (f === this.frame) {
      this.race.load(s);
      this.rollbackFrom = Infinity;
      return true;
    }
    this.snaps[f % this.H] = s;
    this.snapFrame[f % this.H] = f;
    this.rollbackFrom = f;
    this.catchUp();
    return true;
  }

  private padFor(h: number, f: number): PadState {
    if (f > this.endedAfter[h]!) return { ...neutralPad(), auto: DROPPED_SKILL };
    const k = this.known[h]!;
    if (f <= k) return this.inputs[f % this.H]![h]!;
    // A guess: they're still doing what they did last. (The pause button is never part of it.)
    return k < 0 ? neutralPad() : this.inputs[k % this.H]![h]!;
  }

  private run(f: number, replay: boolean): void {
    const i = f % this.H;
    this.snaps[i] = this.race.save();
    this.snapFrame[i] = f;
    const pads: (PadState | undefined)[] = [];
    for (let h = 0; h < this.n; h++) {
      const p = this.padFor(h, f);
      this.used[i]![h] = p;
      pads[this.kartOf[h]!] = p;
    }
    const items = this.race.items;
    items.logging = !replay;
    this.race.step(pads);
    items.logging = true;
    const keys = new Set(items.events.map(eventKey));
    if (replay) {
      // Show only what the corrected run added (an item that was really fired, a real hit).
      const seen = this.eventKeys[i];
      const fresh = items.events.filter((e) => !seen?.has(eventKey(e)));
      if (fresh.length) items.addToLog(fresh);
    }
    this.eventKeys[i] = keys;
  }

  private rewind(from: number): void {
    if (this.snapFrame[from % this.H] !== from) return; // too long ago: nothing to go back to
    const depth = this.frame - from;
    this.stats.rollbacks++;
    this.stats.replayed += depth;
    this.stats.deepest = Math.max(this.stats.deepest, depth);
    const before = this.onCorrect && this.race.karts.map((k) => ({ ...k.pos }));
    this.race.load(this.snaps[from % this.H]!);
    for (let f = from; f < this.frame; f++) this.run(f, true);
    if (before)
      this.onCorrect!(
        this.race.karts.map((k, i) => [
          before[i]!.x - k.pos.x,
          before[i]!.y - k.pos.y,
          before[i]!.z - k.pos.z,
        ]),
      );
  }
}

const eventKey = (e: ItemEvent) => `${e.kind}:${e.kart}:${e.item ?? ''}`;

/** Same input as far as the race can tell (what the wire carries). */
export function samePad(a: PadState, b: PadState): boolean {
  return (
    a.steer === b.steer &&
    a.throttle === b.throttle &&
    a.brake === b.brake &&
    a.drift === b.drift &&
    a.item === b.item &&
    a.lookBack === b.lookBack &&
    (a.auto ?? 0) === (b.auto ?? 0)
  );
}
