import type { HazardDef, TrackDef, TrackPoint, V3 } from '@epic/shared';
import { Track } from '../track.ts';
import DRAFT from './farmDraft.json';
import { grandpaSchedules } from './grandpaSchedule.ts';

/**
 * The Drefahl Farm: the owner's route round the grandparents' farm (docs/farm), laid out at 1:10
 * so the karts are RC-car sized among the buildings and trees. The centre line comes from the
 * approved draft (tools/farm-blueprint/racetrack.py, real metres); here it is scaled into game
 * metres, the loop-de-loops are put in as real loops, and the jumps, boost pads, item boxes
 * and the Christmas tree trunks standing in the forest road are placed along it.
 *
 * Game coordinates match the farm scene: x = (map x - 50) * 10, z = -(map y - 100) * 10, and
 * y is height (the ground plus the road's height above it, times 10).
 */

/** [x, y, h, width, kind, section, ground, s] in real metres along the draft. */
type DraftPoint = [number, number, number, number, string, string, number, number];
interface DraftFeature {
  kind: string;
  label: string;
  s: number;
  x: number;
  y: number;
  h: number;
}
const D = DRAFT as unknown as {
  pts: DraftPoint[];
  features: DraftFeature[];
  trunks: [number, number][];
  sections: { id: string; name: string; s: number }[];
};

const S = 10;
const game = (x: number, y: number, h: number): V3 => [(x - 50) * S, h * S, -(y - 100) * S];

/** Kinds of road, as stretches of the lap: walled road, wide, tube, barn, air (a gap). */
export type FarmPieceKind = 'road' | 'wide' | 'tube' | 'barn' | 'air';
export interface FarmPiece {
  kind: FarmPieceKind;
  s0: number;
  s1: number;
}

const LOOP_R = 26;
const LOOP_SHIFT = 22;
const STEP = 4; // game metres between centre-line points

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addS = (a: V, b: V, k: number): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

interface Pt {
  p: V;
  up: V;
  w: number;
  kind: string;
  /** Where along the draft this point is (real metres), for placing features. */
  ds: number;
  loop: boolean;
  /** Along the ground (where grandpa can walk across it). */
  low: boolean;
}

function centreLine(): Pt[] {
  // The draft in game metres (ground-level road a few centimetres up, clear of the lawn).
  const src = D.pts.map((q) => ({
    p: game(q[0], q[1], q[6] + Math.max(q[2], 0.06)) as V,
    w: q[3] * S,
    kind: q[4],
    ds: q[7],
    low: q[2] < 0.3 && (q[4] === 'road' || q[4] === 'wide'),
  }));
  // Even spacing.
  const even: typeof src = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i]!,
      b = src[(i + 1) % src.length]!;
    const n = Math.max(1, Math.round(len(sub(b.p, a.p)) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      even.push({
        p: addS(a.p, sub(b.p, a.p), t),
        w: a.w + (b.w - a.w) * t,
        kind: t < 0.5 ? a.kind : b.kind,
        ds: i + 1 < src.length ? a.ds + (b.ds - a.ds) * t : a.ds,
        low: t < 0.5 ? a.low : b.low,
      });
    }
  }
  // Iron out kinks where the draft's curves meet (a few passes of a 1-2-1 blur).
  for (let pass = 0; pass < 4; pass++) {
    const prev = even.map((q) => q.p);
    const m = even.length;
    for (let i = 0; i < m; i++) {
      const a = prev[(i - 1 + m) % m]!,
        b = prev[i]!,
        c = prev[(i + 1) % m]!;
      even[i]!.p = [
        (a[0] + 2 * b[0] + c[0]) / 4,
        (a[1] + 2 * b[1] + c[1]) / 4,
        (a[2] + 2 * b[2] + c[2]) / 4,
      ];
    }
  }
  const loopsAt = D.features.filter((f) => f.kind === 'loop').map((f) => f.s);
  const out: Pt[] = [];
  // Each loop comes out to one side of where it went in; the road carries on from there (so it
  // never runs back alongside the loop's own entry) and drifts back to the draft's line only
  // well after the loop. Loops in a row all step the same way (to the left), so each one stands
  // clear of the one before.
  let off: V = [0, 0, 0],
    from: V = [0, 0, 0],
    hold = 0,
    ease = 0,
    dir = -1;
  const HOLD = 90,
    EASE = 220;
  for (let i = 0; i < even.length; i++) {
    const q = even[i]!;
    const t = norm(
      sub(even[(i + 1) % even.length]!.p, even[(i - 1 + even.length) % even.length]!.p),
    );
    if (hold > 0) {
      hold -= STEP;
      if (hold <= 0) {
        from = off;
        ease = EASE;
      }
    } else if (ease > 0) {
      ease = Math.max(0, ease - STEP);
      const k = ease / EASE;
      const e = k * k * (3 - 2 * k);
      off = [from[0] * e, from[1] * e, from[2] * e];
    }
    const p = addS(q.p, off, 1);
    const up0: V = [0, 1, 0];
    const up = norm(addS(up0, t, -dot(up0, t)));
    out.push({ p, up, w: q.w, kind: q.kind, ds: q.ds, loop: false, low: q.low });
    const next = even[i + 1];
    const loopHere = next && loopsAt.some((s) => q.ds <= s && next.ds > s);
    if (!loopHere) continue;
    // A full vertical loop: up and over, coming out to one side of where it went in.
    const r0 = norm(cross(t, up));
    const right: V = [r0[0] * dir, r0[1] * dir, r0[2] * dir];
    const N = Math.round((Math.PI * 2 * LOOP_R) / STEP);
    for (let j = 1; j < N; j++) {
      const u = j / N;
      const th = u * Math.PI * 2;
      const sh = u * u * (3 - 2 * u) * LOOP_SHIFT;
      const c = addS(addS(p, up, LOOP_R), right, sh);
      const pos = addS(
        addS(addS(p, t, Math.sin(th) * LOOP_R), up, LOOP_R * (1 - Math.cos(th))),
        right,
        sh,
      );
      out.push({
        p: pos,
        up: norm(sub(c, pos)),
        w: q.w,
        kind: 'tube',
        ds: q.ds,
        loop: true,
        low: false,
      });
    }
    off = addS(off, right, LOOP_SHIFT);
    hold = HOLD;
    ease = 0;
  }
  return out;
}

const PTS = centreLine();
const points: TrackPoint[] = PTS.map((q) => ({
  p: [q.p[0], q.p[1], q.p[2]],
  up: [q.up[0], q.up[1], q.up[2]],
  width: q.w,
}));
const base: TrackDef = { id: 'farm', name: 'The Drefahl Farm', points, defaultWidth: 16, laps: 2 };
const track = new Track(base);
const L = track.length;

// Arc length of every centre-line point (walking along, so stacked loops don't confuse it).
const sOf: number[] = [];
{
  let hint = 0;
  for (const q of PTS) {
    const pr = track.project({ x: q.p[0], y: q.p[1], z: q.p[2] }, hint, 30);
    hint = pr.index;
    sOf.push(pr.s);
  }
  sOf[0] = 0;
}
/** Game arc length for a distance along the draft (real metres). */
function sForDraft(ds: number): number {
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < PTS.length; i++) {
    if (PTS[i]!.loop) continue;
    const d = Math.abs(PTS[i]!.ds - ds);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return sOf[best]!;
}

// Stretches of each kind.
export const FARM_PIECES: FarmPiece[] = [];
for (let i = 0; i < PTS.length; i++) {
  const kind = PTS[i]!.kind as FarmPieceKind;
  const last = FARM_PIECES[FARM_PIECES.length - 1];
  const s = sOf[i]!;
  if (last && last.kind === kind) last.s1 = i + 1 < PTS.length ? sOf[i + 1]! : L;
  else {
    if (last) last.s1 = s;
    FARM_PIECES.push({ kind, s0: s, s1: i + 1 < PTS.length ? sOf[i + 1]! : L });
  }
}
const ranges = (k: FarmPieceKind): [number, number][] =>
  FARM_PIECES.filter((p) => p.kind === k).map((p) => [p.s0, p.s1]);

// Jumps and boosts.
const kickers: { s: number; pop: number }[] = [];
const boostPads: number[] = [];
const superAt = new Set<number>();
for (const f of D.features) {
  const s = sForDraft(f.s);
  if (f.kind === 'pad' || f.kind === 'boost') boostPads.push(s);
  if (f.kind === 'super') {
    boostPads.push(s);
    superAt.add(s);
  }
  if (f.kind === 'jump') kickers.push({ s, pop: f.label.includes('rest') ? 9 : 10 });
  // The big ramp over the pumpkin wagon: it has to throw them clear of the gap that follows,
  // so it sits right at the gap's edge.
  if (f.kind === 'bigjump') {
    const g = FARM_PIECES.find((p) => p.kind === 'air' && p.s0 > s - 10 && p.s0 < s + 80);
    kickers.push({ s: (g ? g.s0 : s) - 6, pop: 32 });
  }
}

// The Christmas tree trunks in the forest road: solid.
const forest = D.sections.find((x) => x.id === 'forest')!;
const forestS = sForDraft(forest.s);
const hazards: HazardDef[] = D.trunks.map(([x, y]) => {
  const p = game(x, y, 0);
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < track.count; i++) {
    const f = track.frames[i]!;
    const ds = (((i * track.spacing - forestS) % L) + L) % L;
    if (ds > 2200) continue;
    const d = (f.pos.x - p[0]) ** 2 + (f.pos.z - p[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const pr = track.project({ x: p[0], y: track.frames[best]!.pos.y, z: p[2] }, best, 30);
  return { kind: 'trunk', s: pr.s, lat: pr.lateral, r: 0.9, effect: 'bump' };
});

// Item boxes about every 900 m, never in the air.
const gaps = ranges('air');
const itemRows: number[] = [];
for (let s = 350; s < L - 200; s += 900) {
  let at = s;
  while (gaps.some(([a, b]) => at > a - 30 && at < b + 30)) at += 40;
  itemRows.push(at);
}

// Grandpa on his rounds: where his walks and the mower's run cross the road along the ground,
// he's in the way (solid) for as long as he's on it. Sampled from his timetable four times a
// second, so the race and the picture agree exactly.
function grandpaHazards(): HazardDef[] {
  const CELL = 30;
  const grid = new Map<string, number[]>();
  PTS.forEach((q, i) => {
    if (!q.low) return;
    const key = `${Math.floor(q.p[0] / CELL)},${Math.floor(q.p[2] / CELL)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  });
  const onRoad = (x: number, y: number, r: number): [number, number] | null => {
    const gx = (x - 50) * S,
      gz = -(y - 100) * S;
    let best = -1,
      bd = Infinity;
    const cx = Math.floor(gx / CELL),
      cz = Math.floor(gz / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const k of grid.get(`${cx + i},${cz + j}`) ?? []) {
          const q = PTS[k]!.p;
          const d = (q[0] - gx) ** 2 + (q[2] - gz) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
    if (best < 0 || bd > 40 * 40) return null;
    const q = PTS[best]!;
    const pr = track.project(
      { x: gx, y: q.p[1], z: gz },
      Math.round(sOf[best]! / track.spacing),
      30,
    );
    if (Math.abs(pr.lateral) > pr.frame.width / 2 + r || Math.abs(pr.height) > 6) return null;
    return [pr.s, pr.lateral];
  };
  const DT = 0.25;
  const out: HazardDef[] = [];
  const add = (kind: string, r: number, period: number, at: (t: number) => [number, number]) => {
    const n = Math.round(period / DT);
    const s: number[] = [],
      lat: number[] = [];
    let any = false;
    for (let i = 0; i < n; i++) {
      const [x, y] = at((i * period) / n);
      const hit = onRoad(x, y, r);
      s.push(hit ? Math.round(hit[0] * 10) / 10 : 0);
      lat.push(hit ? Math.round(hit[1] * 10) / 10 : 999);
      if (hit) any = true;
    }
    if (any)
      out.push({ kind, s: 0, lat: 0, r, effect: 'bump', schedule: { dt: period / n, s, lat } });
  };
  const G = grandpaSchedules();
  for (const w of G.walkers)
    add('grandpa', 3, w.sched.period, (t) => {
      const p = w.sched.at(t);
      return [p.x, p.y];
    });
  // The tractor, round its middle (half a metre ahead of the rear axle).
  add('mower', 9, G.mower.period, (t) => {
    const p = G.mower.at(t);
    return [p.x + Math.cos(p.heading) * 0.45, p.y + Math.sin(p.heading) * 0.45];
  });
  return out;
}

// ---------------------------------------------------------------- barn cats

/** What a barn cat is doing (the renderer plays the matching clip). */
export type FarmCatState = 'walk' | 'sit' | 'groom';
export interface CatRoute {
  /** Seconds round the whole timetable. */
  period: number;
  /** Where it is at time t: map metres (x east, y north), heading (radians from east). */
  at(t: number): { x: number; y: number; heading: number; state: FarmCatState };
}

/**
 * The barn's two cats cross the ground-level road near the barn: each sits on one verge
 * watching the racers go by, strolls across, sits (and grooms) on the other side, and strolls
 * back. Like grandpa, they're timetables of race time, so the race (where a cat is solid) and
 * the picture agree. Each crossing is straight across the road at one point of the lap.
 */
const CAT_SPEED = 0.35 * S; // a cat's stroll (35 cm/s), in game metres
const BARN: [number, number] = [68.25, 136.89];
function catCrossings(): { s: number; reach: number }[] {
  // Ground-level road nearest the barn (and a second spot well along the lap from it).
  const [bx, , bz] = game(BARN[0], BARN[1], 0);
  const low = PTS.map((q, i) => ({ i, d: Math.hypot(q.p[0] - bx, q.p[2] - bz), q })).filter(
    (c) =>
      c.q.low &&
      !PTS[(c.i + 3) % PTS.length]!.loop &&
      !PTS[(c.i + PTS.length - 3) % PTS.length]!.loop,
  );
  low.sort((a, b) => a.d - b.d);
  const first = low[0]!;
  const second = low.find((c) => Math.abs(sOf[c.i]! - sOf[first.i]!) > 90)!;
  return [first, second].map((c) => {
    const w = track.frameAtS(sOf[c.i]!).width;
    return { s: sOf[c.i]!, reach: w / 2 + 6 };
  });
}
function catRoute(s0: number, reach: number, sitA: number, sitB: number, phase: number): CatRoute {
  const f = track.frameAtS(s0);
  const cross = (2 * reach) / CAT_SPEED;
  const period = sitA + cross + sitB + cross;
  const map = (lat: number) => {
    const x = f.pos.x + f.right.x * lat,
      z = f.pos.z + f.right.z * lat;
    return [x / S + 50, 100 - z / S] as const;
  };
  const [ax, ay] = map(reach),
    [bx, by] = map(-reach);
  const toB = Math.atan2(by - ay, bx - ax);
  return {
    period,
    at(t) {
      let k = (((t + phase) % period) + period) % period;
      const walkAt = (u: number, from: number, to: number) => {
        const lat = from + (to - from) * u;
        const [x, y] = map(lat);
        return { x, y, lat };
      };
      if (k < sitA) return { x: ax, y: ay, heading: toB, state: 'sit' };
      k -= sitA;
      if (k < cross) {
        const p = walkAt(k / cross, reach, -reach);
        return { x: p.x, y: p.y, heading: toB, state: 'walk' };
      }
      k -= cross;
      if (k < sitB)
        return {
          x: bx,
          y: by,
          heading: toB + Math.PI,
          state: k > sitB * 0.4 && k < sitB * 0.8 ? 'groom' : 'sit',
        };
      k -= sitB;
      const p = walkAt(k / cross, -reach, reach);
      return { x: p.x, y: p.y, heading: toB + Math.PI, state: 'walk' };
    },
  };
}
const CROSSINGS = catCrossings();
/** The orange tabby and the black-and-white tom. */
export const FARM_CATS: CatRoute[] = [
  catRoute(CROSSINGS[0]!.s, CROSSINGS[0]!.reach, 14, 18, 0),
  catRoute(CROSSINGS[1]!.s, CROSSINGS[1]!.reach, 11, 15, 9),
];
function catHazards(): HazardDef[] {
  const R = 2;
  return FARM_CATS.map((c, i) => {
    const DT = 0.25,
      n = Math.round(c.period / DT);
    const { s: s0, reach } = CROSSINGS[i]!;
    const f = track.frameAtS(s0);
    const s: number[] = [],
      lat: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = c.at((k * c.period) / n);
      // Back from map metres to the lateral offset across the road.
      const gx = (p.x - 50) * S - f.pos.x,
        gz = -(p.y - 100) * S - f.pos.z;
      const l = gx * f.right.x + gz * f.right.z;
      const on = Math.abs(l) < f.width / 2 + R && Math.abs(l) <= reach;
      s.push(on ? Math.round(s0 * 10) / 10 : 0);
      lat.push(on ? Math.round(l * 10) / 10 : 999);
    }
    return {
      kind: 'cat',
      s: 0,
      lat: 0,
      r: R,
      effect: 'bump',
      schedule: { dt: c.period / n, s, lat },
    } as HazardDef;
  });
}

export const FARM_MARKS: Record<string, number> = Object.fromEntries(
  D.sections.map((x) => [x.id, x.id === 'start' ? 0 : sForDraft(x.s)]),
);

// Boost pads: narrow (you have to aim for them), set off to one side or the other in turn,
// and they kick hard.
const PAD_W = 4;
const pads = boostPads.map((s, i) => {
  const w = track.frameAtS(s).width;
  const side = [0, -1, 1, 1, -1, 0][i % 6]!;
  const tube = FARM_PIECES.some((p) => p.kind === 'tube' && s >= p.s0 && s < p.s1);
  // (In the tubes a pad spans the whole floor: the drop off the house needs the speed.)
  // Super pads sit in the middle of the straights: you still have to line up for them.
  if (superAt.has(s)) return { s, lat: 0, width: PAD_W, super: true };
  return { s, lat: tube ? 0 : side * Math.max(0, w * 0.27 - PAD_W / 2), width: tube ? w : PAD_W };
});

export const FARM_TRACK: TrackDef = {
  ...base,
  boostPads,
  pads,
  padBoost: { time: 1.7, kick: 10 },
  superBoost: { time: 2.8, kick: 26 },
  kickers,
  gaps,
  tunnels: ranges('barn'),
  tubes: ranges('tube'),
  crestAir: true,
  hazards: [...hazards, ...grandpaHazards(), ...catHazards()],
  itemRows,
  marks: FARM_MARKS,
};
