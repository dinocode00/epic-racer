import DRAFT from './farmDraft.json';
import ROUTES from './grandpaRoutes.json';

/**
 * Grandpa's rounds on the farm as a timetable: where each of him is at any moment, worked out
 * from the clock alone (no step-by-step state), so the race simulation (which needs him as an
 * obstacle) and the renderer (which draws him) always agree on where he is. Map metres, x east,
 * y north. Headings are radians anticlockwise from east.
 */

export type XY = [number, number];
interface RouteData {
  name: string;
  mode: 'walk' | 'mow';
  speed: number;
  stops: [string, number, number, XY | null][];
  pts: XY[];
}
export const GRANDPA_ROUTES = ROUTES as unknown as {
  routes: RouteData[];
  stumps: XY[];
};

/** A closed loop through map points, measured along its length in metres. */
export class Loop {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly s: Float64Array;
  readonly length: number;

  constructor(pts: XY[]) {
    const n = pts.length + 1;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i % pts.length]!;
      this.x[i] = p[0];
      this.y[i] = p[1];
      if (i) this.s[i] = this.s[i - 1]! + Math.hypot(p[0] - this.x[i - 1]!, p[1] - this.y[i - 1]!);
    }
    this.length = this.s[n - 1]!;
  }

  wrap(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  private seg(s: number): [number, number] {
    s = this.wrap(s);
    let lo = 0,
      hi = this.s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.s[m]! <= s) lo = m;
      else hi = m;
    }
    return [lo, (s - this.s[lo]!) / Math.max(1e-9, this.s[hi]! - this.s[lo]!)];
  }

  at(s: number): XY {
    const [i, f] = this.seg(s);
    return [
      this.x[i]! + (this.x[i + 1]! - this.x[i]!) * f,
      this.y[i]! + (this.y[i + 1]! - this.y[i]!) * f,
    ];
  }

  /** Direction of travel at s (radians from east), over a span either side. */
  dir(s: number, span = 0.3): number {
    const a = this.at(s - span),
      b = this.at(s + span);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** How long the cap wave takes (grandpa.ts WAVE_LENGTH) and the turn to face whoever it's for. */
export const WAVE_TIME = 8.6;
const TURN = 1.8;
const ACCEL = 0.35; // m/s/s, getting going and easing to a stop

export interface WalkerPose {
  x: number;
  y: number;
  heading: number;
  /** Walking speed now (m/s). */
  speed: number;
  /** Seconds into a cap wave, or null. */
  wave: number | null;
}

/** One walking round: ambles along the loop, easing to a halt at each stop. */
export class WalkerSchedule {
  readonly loop: Loop;
  readonly period: number;
  private legs: { t0: number; t1: number; s0: number; s1: number }[] = [];
  private halts: { t0: number; t1: number; s: number; wave: boolean; face: XY | null }[] = [];
  private shift: number;

  constructor(
    r: RouteData,
    start: number,
    readonly stroll = 0.55,
  ) {
    this.loop = new Loop(r.pts);
    const L = this.loop.length;
    const stops = r.stops
      .map(([kind, s, sec, face]) => ({ wave: kind === 'wave', s, sec, face }))
      .sort((a, b) => a.s - b.s);
    let t = 0,
      s = stops.length ? stops[stops.length - 1]!.s - L : 0;
    for (const st of stops) {
      const d = st.s - s;
      const dur = this.legTime(d);
      this.legs.push({ t0: t, t1: t + dur, s0: s, s1: st.s });
      t += dur;
      const hold = st.wave ? Math.max(st.sec, TURN + WAVE_TIME + 1.2) : st.sec;
      this.halts.push({ t0: t, t1: t + hold, s: st.s, wave: st.wave, face: st.face });
      t += hold;
      s = st.s;
    }
    if (!stops.length) {
      this.legs.push({ t0: 0, t1: L / stroll, s0: 0, s1: L });
      t = L / stroll;
    }
    this.period = t;
    this.shift = this.timeAt(this.loop.wrap(start * L));
  }

  /** Time to walk d metres from a standstill to a standstill. */
  private legTime(d: number): number {
    const v = this.stroll,
      ramp = (v * v) / (2 * ACCEL);
    if (d <= 2 * ramp) return 2 * Math.sqrt(d / ACCEL);
    return 2 * (v / ACCEL) + (d - 2 * ramp) / v;
  }

  /** Distance along a leg after time tau (trapezoid speed profile), and the speed then. */
  private legAt(d: number, tau: number): [number, number] {
    const v = this.stroll,
      T = this.legTime(d);
    tau = Math.min(Math.max(tau, 0), T);
    if (d <= (2 * v * v) / (2 * ACCEL)) {
      const half = T / 2;
      if (tau < half) return [0.5 * ACCEL * tau * tau, ACCEL * tau];
      const r = T - tau;
      return [d - 0.5 * ACCEL * r * r, ACCEL * r];
    }
    const ta = v / ACCEL;
    if (tau < ta) return [0.5 * ACCEL * tau * tau, ACCEL * tau];
    if (tau > T - ta) {
      const r = T - tau;
      return [d - 0.5 * ACCEL * r * r, ACCEL * r];
    }
    return [0.5 * ACCEL * ta * ta + (tau - ta) * v, v];
  }

  /** The schedule time at which he first reaches s on the loop. */
  timeAt(s: number): number {
    const L = this.loop.length;
    for (const l of this.legs) {
      const ss = l.s0 + ((((s - l.s0) % L) + L) % L);
      if (ss <= l.s1) {
        const d = l.s1 - l.s0;
        let lo = 0,
          hi = l.t1 - l.t0;
        for (let k = 0; k < 30; k++) {
          const m = (lo + hi) / 2;
          if (this.legAt(d, m)[0] < ss - l.s0) lo = m;
          else hi = m;
        }
        return l.t0 + lo;
      }
    }
    return 0;
  }

  /** Move his round so that at clock time `now` he's at s along the loop. */
  seek(s: number, now: number): void {
    this.shift = this.timeAt(this.loop.wrap(s)) - now;
  }

  get stops(): { kind: string; s: number }[] {
    return this.halts.map((h) => ({ kind: h.wave ? 'wave' : 'pause', s: h.s }));
  }

  at(time: number): WalkerPose {
    const t = (((time + this.shift) % this.period) + this.period) % this.period;
    for (const h of this.halts)
      if (t >= h.t0 && t < h.t1) {
        const [x, y] = this.loop.at(h.s);
        const along = this.loop.dir(h.s + 0.45, 0.45);
        let heading = along,
          wave: number | null = null;
        if (h.wave && h.face) {
          // Turn to face whoever he's waving at, wave, and turn back to the way he's going.
          const face = Math.atan2(h.face[1] - y, h.face[0] - x);
          const tau = t - h.t0;
          const back = smooth((tau - (TURN + WAVE_TIME + 0.2)) / 1.0);
          heading = along + wrapPi(face - along) * smooth(tau / TURN) * (1 - back);
          if (tau >= TURN) wave = tau - TURN;
        }
        return { x, y, heading, speed: 0, wave };
      }
    for (const l of this.legs)
      if (t >= l.t0 && t <= l.t1) {
        const [d, v] = this.legAt(l.s1 - l.s0, t - l.t0);
        const s = l.s0 + d;
        const [x, y] = this.loop.at(s);
        return { x, y, heading: this.loop.dir(s + 0.45, 0.45), speed: v, wave: null };
      }
    const [x, y] = this.loop.at(0);
    return { x, y, heading: this.loop.dir(0.45, 0.45), speed: 0, wave: null };
  }
}

export interface MowerPose {
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** -1 full left lock .. +1 full right lock. */
  steer: number;
}

/**
 * The lawn tractor's round: it follows its track exactly (the middle of the rear axle on the
 * line), its steering taken from the line's curve, slowing for the tight turns.
 */
export class MowerSchedule {
  readonly loop: Loop;
  readonly period: number;
  private ds: number;
  private phi: Float32Array;
  private steerA: Float32Array;
  private vmax: Float32Array;
  private time: Float64Array;
  private shift = 0;

  constructor(r: RouteData, wheelbase = 1.2, maxLock = 0.85) {
    this.loop = new Loop(r.pts);
    const L = this.loop.length;
    const n = Math.ceil(L / 0.1);
    this.ds = L / n;
    this.phi = new Float32Array(n);
    this.steerA = new Float32Array(n);
    this.vmax = new Float32Array(n);
    for (let i = 0; i < n; i++) this.phi[i] = this.loop.dir(i * this.ds, 0.3);
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++)
      k[i] = wrapPi(this.phi[(i + 3) % n]! - this.phi[(i - 3 + n) % n]!) / (6 * this.ds);
    const w = 5;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = -w; j <= w; j++) sum += k[(i + j + n) % n]!;
      const kap = sum / (2 * w + 1);
      this.steerA[i] = Math.min(1, Math.max(-1, -Math.atan(wheelbase * kap) / maxLock));
      const tight = Math.min(1, Math.max(0, (Math.abs(kap) - 0.15) / 0.55));
      this.vmax[i] = r.speed * (1 - 0.5 * tight);
    }
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const nxt = this.vmax[(i + 1) % n]!;
        this.vmax[i] = Math.min(this.vmax[i]!, Math.sqrt(nxt * nxt + 2 * 0.35 * this.ds));
      }
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        const prv = this.vmax[(i - 1 + n) % n]!;
        this.vmax[i] = Math.min(this.vmax[i]!, Math.sqrt(prv * prv + 2 * 0.3 * this.ds));
      }
    // Time at each sample, so position can be found from the clock.
    this.time = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) this.time[i + 1] = this.time[i]! + this.ds / this.vmax[i]!;
    this.period = this.time[n]!;
  }

  private sample(arr: Float32Array, s: number, angle = false): number {
    const n = arr.length;
    const f = this.loop.wrap(s) / this.ds;
    const i = Math.floor(f) % n,
      j = (i + 1) % n;
    const a = arr[i]!,
      b = arr[j]!;
    return a + (angle ? wrapPi(b - a) : b - a) * (f - Math.floor(f));
  }

  seek(s: number, now: number): void {
    const i = Math.floor(this.loop.wrap(s) / this.ds);
    this.shift = this.time[i]! - now;
  }

  at(time: number): MowerPose {
    const t = (((time + this.shift) % this.period) + this.period) % this.period;
    let lo = 0,
      hi = this.time.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.time[m]! <= t) lo = m;
      else hi = m;
    }
    const s =
      (lo + (t - this.time[lo]!) / Math.max(1e-9, this.time[hi]! - this.time[lo]!)) * this.ds;
    const [x, y] = this.loop.at(s);
    return {
      x,
      y,
      heading: this.sample(this.phi, s, true),
      speed: this.sample(this.vmax, s),
      steer: this.sample(this.steerA, s),
    };
  }
}

/** All four of him, as the farm has them: three walking rounds and the mower. */
/** The racing line (map metres, in order), and where it runs along the ground. */
const LINE: [number, number, number][] = (DRAFT as unknown as { pts: [number, number, number][] })
  .pts;
const LOW_ROAD: XY[] = LINE.filter((p) => p[2] < 3).map((p) => [p[0], p[1]]);

/** How much of the course has a point in view ahead (within 40 m, in front): metres of road. */
function inView(x: number, y: number): number {
  let m = 0;
  for (let i = 0; i < LINE.length - 1; i++) {
    const [ax, ay] = LINE[i]!,
      [bx, by] = LINE[i + 1]!;
    const dx = x - ax,
      dy = y - ay,
      d = Math.hypot(dx, dy);
    if (d > 40 || d < 1) continue;
    const fx = bx - ax,
      fy = by - ay,
      fl = Math.hypot(fx, fy);
    if (fl < 1e-6) continue;
    if ((dx * fx + dy * fy) / (d * fl) > 0.75) m += fl;
  }
  return m;
}

/**
 * His rounds with a couple of extra stops where he's in view of the racers longest (off the
 * road, never on it): there he stops, turns to the track and waves the racers by for about a
 * minute, so you've a good chance of seeing him as you come past.
 */
export function watchingStops(r: RouteData, spots = 2): RouteData {
  if (r.mode !== 'walk') return r;
  const loop = new Loop(r.pts);
  const nearRoad = (x: number, y: number): [number, XY] => {
    let best = Infinity,
      at: XY = [x, y];
    for (const q of LOW_ROAD) {
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best) {
        best = d;
        at = q;
      }
    }
    return [best, at];
  };
  const cands: { s: number; seen: number; face: XY }[] = [];
  for (let s = 0; s < loop.length; s += 2) {
    const [x, y] = loop.at(s);
    const [d, face] = nearRoad(x, y);
    if (d < 2.5) continue;
    cands.push({ s, seen: inView(x, y), face });
  }
  cands.sort((a, b) => b.seen - a.seen);
  const gap = (a: number, b: number) => {
    const d = Math.abs(a - b) % loop.length;
    return Math.min(d, loop.length - d);
  };
  const chosen: typeof cands = [];
  for (const c of cands) {
    if (chosen.length >= spots) break;
    if (chosen.some((o) => gap(o.s, c.s) < 20)) continue;
    if (r.stops.some(([, s]) => gap(s, c.s) < 6)) continue;
    chosen.push(c);
  }
  const stops = [...r.stops];
  for (const c of chosen)
    // Five waves in a row: about a minute there, waving the racers by.
    for (let k = 0; k < 5; k++) stops.push(['wave', c.s + k * 0.01, 10, c.face]);
  return { ...r, stops };
}

export function grandpaSchedules(): {
  walkers: { name: string; sched: WalkerSchedule }[];
  mower: MowerSchedule;
} {
  const by = (n: string) => watchingStops(GRANDPA_ROUTES.routes.find((r) => r.name === n)!);
  return {
    // Each round starts somewhere different along it, so they don't all set off together.
    walkers: [
      { name: 'crib', sched: new WalkerSchedule(by('crib_to_patio'), 0.35) },
      { name: 'pumpkins', sched: new WalkerSchedule(by('pumpkin_patch'), 0.1) },
      { name: 'orchard', sched: new WalkerSchedule(by('orchard'), 0.6) },
    ],
    mower: new MowerSchedule(by('mower_christmas_trees')),
  };
}
